"""No provider calls or model downloads. Run with python -m unittest discover.

Decoder cases use synthetic WAV memory buffers and the installed PyAV/NumPy;
the rest of the suite needs only Python's standard library.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import math
import socket
import struct
import threading
import time
import unittest
import urllib.error
import urllib.request
import wave
from unittest.mock import patch

import service


SECRET = "test-worker-secret-32-characters-long"
OPERATION = "562a78a4-9c02-4db6-9ed2-5f87419fcb85"
HAS_DECODER = all(importlib.util.find_spec(module) for module in ("av", "numpy"))


def wav_fixture(seconds: float, *, silence: bool = False) -> bytes:
    count = round(seconds * service.SAMPLE_RATE)
    if silence:
        pcm = b"\0\0" * count
    else:
        cycle = [struct.pack("<h", round(5000 * math.sin(2 * math.pi * index / 40))) for index in range(40)]
        pcm = b"".join(cycle) * (count // 40) + b"".join(cycle[:count % 40])
    return service.normalized_wav(pcm)


class FakeLocal:
    ready = True

    def __init__(self):
        self.calls = 0

    def transcribe(self, pcm, deadline, cancelled):
        self.calls += 1
        return "Я сделал десять повторений с весом двадцать килограммов."


class FakeGroq:
    def __init__(self, failure=None):
        self.failure = failure
        self.calls = 0

    def transcribe(self, pcm, deadline, cancelled):
        self.calls += 1
        if self.failure is not None:
            raise self.failure
        return "Сделал 12 повторений."


def fake_decoder(raw, kind, deadline, cancelled):
    return b"\0\1" * 100, 1200


def hang_process(connection):
    time.sleep(10)


def stalled_pcm_actor(connection):
    # A real process/pipe reproduces native actors that stop reading after boot.
    connection.send(("ready",))
    time.sleep(30)


def load_stalled_pcm_actor(model):
    parent, child = service.MP_CONTEXT.Pipe(duplex=True)
    process = service.MP_CONTEXT.Process(target=stalled_pcm_actor, args=(child,), daemon=True)
    process.start()
    child.close()
    if not parent.poll(5) or parent.recv() != ("ready",):
        parent.close()
        service._stop_process(process)
        raise ValueError("synthetic_actor_not_ready")
    return parent, process


class ValidationTests(unittest.TestCase):
    def test_secret_and_preloaded_model_required(self):
        for environment in ({}, {"VOICE_WORKER_SECRET": SECRET},
                            {"VOICE_WORKER_SECRET": "short", "VOICE_LOCAL_MODEL": "small"}):
            with self.subTest(environment=list(environment)):
                with self.assertRaises(ValueError):
                    service.Config.from_env(environment)

    def test_config_does_not_read_env_files_and_masks_secrets(self):
        config = service.Config.from_env({"VOICE_WORKER_SECRET": SECRET, "VOICE_LOCAL_MODEL": "small",
                                          "GROQ_API_KEY": "private-provider-value"})
        self.assertNotIn(SECRET, repr(config))
        self.assertNotIn("private-provider-value", repr(config))
        self.assertEqual(config.port, 3075)

    def test_operation_requires_canonical_nonzero_uuid(self):
        self.assertEqual(service.operation_id(OPERATION), OPERATION)
        for value in ("not-a-uuid", "00000000-0000-0000-0000-000000000000", "{" + OPERATION + "}"):
            with self.subTest(value=value), self.assertRaises(service.VoiceError):
                service.operation_id(value)

    def test_supported_container_type_and_codecs_parameter(self):
        self.assertEqual(service.media_type("audio/webm;codecs=opus"), "audio/webm")
        with self.assertRaises(service.VoiceError) as caught:
            service.media_type("video/mp4")
        self.assertEqual(caught.exception.status, 415)

    def test_bounded_text_and_no_numeral_rewrite(self):
        self.assertEqual(service.bounded_text("  Сделал  десять\nповторений. "), "Сделал десять повторений.")
        for value in ("", " " * 20, "x" * 2001, {"text": "bad"}):
            with self.subTest(value_type=type(value).__name__), self.assertRaises(service.VoiceError):
                service.bounded_text(value)

    def test_retry_after_is_bounded_and_supports_date(self):
        self.assertEqual(service.retry_after("12"), 12)
        self.assertEqual(service.retry_after("9999999999"), 300)
        self.assertEqual(service.retry_after("nan"), 30)
        self.assertEqual(service.retry_after("inf"), 300)
        self.assertEqual(service.retry_after("nonsense"), 30)
        self.assertEqual(service.retry_after("Thu, 01 Jan 1970 00:01:30 GMT", now=60), 30)


@unittest.skipUnless(HAS_DECODER, "PyAV/NumPy are not installed in this interpreter")
class DecodeTests(unittest.TestCase):
    def test_silence_rejected_before_vad_or_provider(self):
        with self.assertRaises(service.VoiceError) as caught:
            service.decode_audio(wav_fixture(1, silence=True), "audio/wav")
        self.assertEqual(caught.exception.code, "VOICE_NO_SPEECH")

    def test_corrupt_payload(self):
        with self.assertRaises(service.VoiceError) as caught:
            service.decode_audio(b"corrupt recording bytes", "audio/webm")
        self.assertEqual(caught.exception.code, "VOICE_INVALID_AUDIO")

    def test_actual_duration_not_metadata_or_request_header(self):
        with self.assertRaises(service.VoiceError) as caught:
            service.decode_audio(wav_fixture(61.1), "audio/wav", require_speech=False)
        self.assertEqual(caught.exception.code, "VOICE_AUDIO_TOO_LONG")

    def test_stop_tolerance_and_normalized_pcm(self):
        pcm, duration = service.decode_audio(wav_fixture(60.5), "audio/wav", require_speech=False)
        self.assertEqual(duration, 60_500)
        self.assertEqual(len(pcm), 60_500 * 32)
        with wave.open(io.BytesIO(service.normalized_wav(pcm)), "rb") as reader:
            self.assertEqual(reader.getnchannels(), 1)
            self.assertEqual(reader.getframerate(), 16_000)

    def test_declared_media_type_must_match_bytes(self):
        with self.assertRaises(service.VoiceError) as caught:
            service.decode_audio(wav_fixture(1), "audio/ogg", require_speech=False)
        self.assertEqual(caught.exception.status, 415)

    @unittest.skipUnless(importlib.util.find_spec("faster_whisper"), "Bundled VAD is not installed")
    def test_non_silent_tone_is_rejected_by_bundled_vad(self):
        with self.assertRaises(service.VoiceError) as caught:
            service.decode_audio(wav_fixture(1), "audio/wav")
        self.assertEqual(caught.exception.code, "VOICE_NO_SPEECH")


class ProviderTests(unittest.TestCase):
    def test_groq_success_is_single_fixed_endpoint_normalized_ru_upload(self):
        observed = []

        def opener(request, timeout):
            observed.append(request)
            self.assertEqual(timeout, 15)
            return io.BytesIO(json.dumps({"text": "Сделал 15 повторений."}).encode())

        self.assertEqual(service.groq_request(b"\0\1" * 100, "test-key", "whisper-large-v3", opener),
                         "Сделал 15 повторений.")
        self.assertEqual(len(observed), 1)
        request = observed[0]
        self.assertEqual(request.full_url, service.GROQ_URL)
        self.assertIn(b'name="language"\r\n\r\nru\r\n', request.data)
        self.assertIn(b'name="temperature"\r\n\r\n0\r\n', request.data)
        self.assertIn(b"RIFF", request.data)
        self.assertIn(b"recording.wav", request.data)

    def test_groq_status_fallback_rules_ignore_upstream_body(self):
        for status, fallback, reason in ((429, True, "rate_limited"), (500, True, "upstream_unavailable"),
                                          (503, True, "upstream_unavailable"), (401, True, "configuration_failure"),
                                          (403, True, "configuration_failure"), (400, False, "request_rejected"),
                                          (404, False, "request_rejected"), (413, False, "request_rejected")):
            def opener(request, timeout):
                raise urllib.error.HTTPError(request.full_url, status, "sensitive details", {"Retry-After": "45"},
                                             io.BytesIO(b"private upstream body"))

            with self.subTest(status=status), self.assertRaises(service.ProviderFailure) as caught:
                service.groq_request(b"\0\1", "test-key", "whisper-large-v3", opener)
            self.assertEqual(caught.exception.fallback, fallback)
            self.assertEqual(caught.exception.reason, reason)
            self.assertNotIn("private", str(caught.exception))
            if status == 429:
                self.assertEqual(caught.exception.cooldown, 45)

    def test_network_and_timeout_allow_fallback(self):
        for failure in (TimeoutError("private"), urllib.error.URLError("private")):
            def opener(request, timeout):
                raise failure
            with self.subTest(failure=type(failure).__name__), self.assertRaises(service.ProviderFailure) as caught:
                service.groq_request(b"\0\1", "key", "whisper-large-v3", opener)
            self.assertTrue(caught.exception.fallback)

    def test_invalid_or_oversized_provider_result_does_not_fallback(self):
        for payload in (b"not json", b"x" * (service.MAX_PROVIDER_BYTES + 1), b'{"text":""}'):
            def opener(request, timeout):
                return io.BytesIO(payload)
            with self.subTest(size=len(payload)), self.assertRaises(service.VoiceError):
                service.groq_request(b"\0\1", "key", "whisper-large-v3", opener)


class GatewayTests(unittest.TestCase):
    def gateway(self, failure=None, key="test-key"):
        local = FakeLocal()
        groq = FakeGroq(failure)
        config = service.Config(SECRET, "small", "whisper-small-int8", groq_key=key)
        return service.VoiceGateway(config, local, groq, fake_decoder), local, groq

    def transcribe(self, gateway, cancelled=lambda: False):
        return gateway.transcribe(b"fixture", "audio/wav", OPERATION, time.monotonic() + 80, cancelled)

    def test_primary_success_contract(self):
        gateway, local, groq = self.gateway()
        result = self.transcribe(gateway)
        self.assertEqual(result, {"operationId": OPERATION, "text": "Сделал 12 повторений.", "provider": "groq",
                                  "model": "whisper-large-v3", "durationMs": 1200})
        self.assertEqual((groq.calls, local.calls), (1, 0))

    def test_rate_limit_falls_back_once_and_respects_global_cooldown(self):
        gateway, local, groq = self.gateway(service.ProviderFailure("rate_limited", True, 45))
        with contextlib.redirect_stdout(io.StringIO()) as logs:
            first = self.transcribe(gateway)
            second = self.transcribe(gateway)
        self.assertEqual(first["provider"], "local")
        self.assertEqual(second["provider"], "local")
        self.assertEqual((groq.calls, local.calls), (1, 2))
        health = gateway.health()
        self.assertFalse(health["groq"]["ready"])
        self.assertEqual(health["groq"]["reason"], "rate_limited")
        self.assertNotIn(first["text"], logs.getvalue())

    def test_missing_key_uses_preloaded_local_model(self):
        gateway, local, groq = self.gateway(key="")
        self.assertEqual(self.transcribe(gateway)["provider"], "local")
        self.assertEqual((groq.calls, local.calls), (0, 1))
        self.assertFalse(gateway.health()["groq"]["configured"])

    def test_rejected_request_never_uses_fallback(self):
        gateway, local, groq = self.gateway(service.ProviderFailure("request_rejected", False))
        with self.assertRaises(service.VoiceError) as caught:
            self.transcribe(gateway)
        self.assertEqual(caught.exception.code, "VOICE_PROVIDER_REJECTED")
        self.assertEqual((groq.calls, local.calls), (1, 0))

    def test_config_failure_is_explicit_and_local_can_continue(self):
        gateway, local, groq = self.gateway(service.ProviderFailure("configuration_failure", True, 300))
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.transcribe(gateway)["provider"], "local")
        self.assertEqual(gateway.health()["groq"]["reason"], "configuration_failure")

    def test_cancelled_request_never_calls_either_provider(self):
        gateway, local, groq = self.gateway()
        with self.assertRaises(service.VoiceError) as caught:
            self.transcribe(gateway, lambda: True)
        self.assertEqual(caught.exception.code, "VOICE_CANCELLED")
        self.assertEqual((groq.calls, local.calls), (0, 0))


class DeadlineTests(unittest.TestCase):
    def test_hung_native_process_can_be_terminated(self):
        started = time.monotonic()
        with self.assertRaises(TimeoutError):
            service.isolated(hang_process, (), 0.05)
        self.assertLess(time.monotonic() - started, 3)

    def test_disconnected_socket_detection(self):
        first, second = socket.socketpair()
        try:
            self.assertFalse(service.socket_disconnected(first))
            second.close()
            self.assertTrue(service.socket_disconnected(first))
        finally:
            first.close()
            second.close()


class FakeActorConnection:
    def __init__(self):
        self.closed = False
        self.bytes_sent = 0

    def send_bytes(self, pcm):
        self.bytes_sent += len(pcm)

    def poll(self, timeout):
        return False

    def close(self):
        self.closed = True


class FakeActorProcess:
    pid = 123

    def __init__(self):
        self.alive = True
        self.closed = False

    def is_alive(self):
        return self.alive

    def terminate(self):
        self.alive = False

    def kill(self):
        self.alive = False

    def join(self, timeout):
        pass

    def close(self):
        self.closed = True


class FakeRecoveryTimer:
    instances = []

    def __init__(self, interval, callback):
        self.interval = interval
        self.callback = callback
        self.started = False
        self.cancelled = False
        FakeRecoveryTimer.instances.append(self)

    def start(self):
        self.started = True

    def cancel(self):
        self.cancelled = True

    def is_alive(self):
        return False


class LocalLifecycleTests(unittest.TestCase):
    def setUp(self):
        FakeRecoveryTimer.instances.clear()
        self.first = (FakeActorConnection(), FakeActorProcess())
        self.second = (FakeActorConnection(), FakeActorProcess())
        self.loader = patch.object(service.LocalModel, "_load_actor", side_effect=[self.first, self.second]).start()
        self.timer_patch = patch.object(service.threading, "Timer", FakeRecoveryTimer).start()
        self.model = service.LocalModel(service.Config(SECRET, "small"))

    def tearDown(self):
        self.model.close()
        patch.stopall()

    def cancel_request(self):
        with self.assertRaises(service.VoiceError) as caught:
            self.model.transcribe(b"\0\1" * 100, time.monotonic() + 60, lambda: True)
        self.assertEqual(caught.exception.code, "VOICE_CANCELLED")

    def test_cancel_kills_audio_actor_and_schedules_single_cached_recovery(self):
        self.cancel_request()
        self.assertTrue(self.first[0].closed)
        self.assertFalse(self.first[1].alive)
        self.assertFalse(self.model.ready)
        self.assertEqual(len(FakeRecoveryTimer.instances), 1)
        timer = FakeRecoveryTimer.instances[0]
        self.assertTrue(timer.started)
        self.assertGreater(timer.interval, 14)
        self.assertLessEqual(timer.interval, 15)
        self.model._schedule_recovery(wait_for_cooldown=True)
        self.assertEqual(len(FakeRecoveryTimer.instances), 1)
        with contextlib.redirect_stdout(io.StringIO()):
            timer.callback()
        self.assertTrue(self.model.ready)
        self.assertEqual(self.loader.call_count, 2)
        self.assertEqual(self.second[0].bytes_sent, 0)

    def test_failed_warmup_does_not_loop_or_queue_request_audio(self):
        self.cancel_request()
        self.loader.side_effect = ValueError("synthetic missing cache")
        with contextlib.redirect_stdout(io.StringIO()):
            FakeRecoveryTimer.instances[0].callback()
        self.assertFalse(self.model.ready)
        self.assertFalse(self.model._recovering)
        self.assertEqual(len(FakeRecoveryTimer.instances), 1)
        with self.assertRaises(service.VoiceError):
            self.model.transcribe(b"private-memory-only", time.monotonic() + 60, lambda: False)
        self.assertEqual(len(FakeRecoveryTimer.instances), 1)
        self.model._retry_after = time.monotonic() - 1
        with self.assertRaises(service.VoiceError):
            self.model.transcribe(b"new-request-audio", time.monotonic() + 60, lambda: False)
        self.assertEqual(len(FakeRecoveryTimer.instances), 2)

    def test_shutdown_cancels_pending_recovery_and_never_restarts(self):
        self.cancel_request()
        self.model.close()
        timer = FakeRecoveryTimer.instances[0]
        self.assertTrue(timer.cancelled)
        self.model._schedule_recovery(wait_for_cooldown=True)
        self.assertEqual(len(FakeRecoveryTimer.instances), 1)

    def test_local_concurrency_is_one_and_has_no_waiting_job(self):
        self.model._lock.acquire()
        try:
            with self.assertRaises(service.VoiceError) as caught:
                self.model.transcribe(b"no-queue", time.monotonic() + 60, lambda: False)
            self.assertEqual(caught.exception.code, "VOICE_BUSY")
            self.assertEqual(self.first[0].bytes_sent, 0)
        finally:
            self.model._lock.release()


class PcmHandoffTests(unittest.TestCase):
    def run_stalled_handoff(self, *, cancel):
        transfers = []
        original_transfer = service.PcmTransfer

        def tracked_transfer(connection, pcm):
            transfer = original_transfer(connection, pcm)
            transfers.append(transfer)
            return transfer

        test = self

        class RecoveryAfterSenderCleanup(FakeRecoveryTimer):
            def __init__(self, interval, callback):
                # Recovery must not start while a blocked writer owns PCM.
                test.assertTrue(transfers[0].done.is_set())
                test.assertFalse(transfers[0]._thread.is_alive())
                test.assertEqual(transfers[0]._audio, b"")
                super().__init__(interval, callback)

        FakeRecoveryTimer.instances.clear()
        with (patch.object(service.LocalModel, "_load_actor", load_stalled_pcm_actor),
              patch.object(service, "PcmTransfer", side_effect=tracked_transfer),
              patch.object(service.threading, "Timer", RecoveryAfterSenderCleanup),
              patch.object(service, "PCM_SEND_SECONDS", 0.2)):
            model = service.LocalModel(service.Config(SECRET, "small"))
            try:
                started = time.monotonic()
                cancelled = lambda: cancel and time.monotonic() - started >= 0.05
                with self.assertRaises(service.VoiceError) as caught:
                    model.transcribe(b"\0\1" * service.MAX_SAMPLES, started + 60, cancelled)
                self.assertEqual(caught.exception.code, "VOICE_CANCELLED" if cancel else "VOICE_LOCAL_TIMEOUT")
                self.assertLess(time.monotonic() - started, 3)
                self.assertTrue(transfers[0].failed)  # Actual blocked write broke on actor death.
                self.assertFalse(model.ready)
                self.assertIsNone(model._sender)
                self.assertEqual(len(FakeRecoveryTimer.instances), 1)
            finally:
                model.close()

    def test_stalled_pcm_sender_is_bounded_and_reaped_before_recovery(self):
        self.run_stalled_handoff(cancel=False)

    def test_cancelled_stalled_sender_releases_audio_before_recovery(self):
        self.run_stalled_handoff(cancel=True)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.local = FakeLocal()
        cls.groq = FakeGroq()
        cls.gateway = service.VoiceGateway(service.Config(SECRET, "small", groq_key="test-key"),
                                            cls.local, cls.groq, fake_decoder)
        cls.server = service.VoiceServer(("127.0.0.1", 0), cls.gateway)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(2)

    def request(self, path="/transcribe", data=b"fixture", auth=SECRET, headers=None):
        request_headers = {"Content-Type": "audio/wav", "X-Operation-Id": OPERATION}
        if auth is not None:
            request_headers["Authorization"] = "Bearer " + auth
        request_headers.update(headers or {})
        request = urllib.request.Request(self.url + path, data=data, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status, json.load(response), response.headers
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.load(error), error.headers

    def test_health_requires_auth_and_has_no_secret(self):
        status, result, headers = self.request("/health", data=None, auth=None)
        self.assertEqual(status, 401)
        status, result, headers = self.request("/health", data=None)
        self.assertEqual(status, 200)
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_success_exact_contract(self):
        status, result, headers = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(set(result), {"operationId", "text", "provider", "model", "durationMs"})
        self.assertEqual(result["operationId"], OPERATION)

    def test_oversized_body_rejected_before_reading(self):
        status, result, headers = self.request(headers={"Content-Length": str(service.MAX_BYTES + 1)})
        self.assertEqual(status, 413)
        self.assertEqual(result["error"]["code"], "VOICE_AUDIO_TOO_LARGE")

    def test_invalid_operation_and_format(self):
        self.assertEqual(self.request(headers={"X-Operation-Id": "invalid"})[0], 400)
        self.assertEqual(self.request(headers={"Content-Type": "text/plain"})[0], 415)

    def test_no_queue_when_two_requests_active(self):
        self.gateway.requests.acquire()
        self.gateway.requests.acquire()
        try:
            status, result, headers = self.request()
            self.assertEqual(status, 503)
            self.assertEqual(result["error"]["code"], "VOICE_BUSY")
        finally:
            self.gateway.requests.release()
            self.gateway.requests.release()


if __name__ == "__main__":
    unittest.main()
