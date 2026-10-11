"""MIRON's loopback-only ASR worker. Secrets are supplied by the launcher.

Audio lives only in memory. Native decoding, Groq IO, and local inference run
in killable processes; a killed local model warms up once in the background
from its existing cache. No job queue stores private audio or transcripts.
"""

from __future__ import annotations

import contextlib
import dataclasses
import email.utils
import hashlib
import hmac
import io
import json
import logging
import multiprocessing
import os
import re
import select
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave
from collections.abc import Callable, Mapping
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from multiprocessing.connection import Connection
from typing import Protocol

MAX_BYTES = 5 * 1024 * 1024
SAMPLE_RATE = 16_000
# Browser auto-stop is 60 s. A 1 s container/stop tolerance is operational only.
MAX_DURATION_SECONDS = 61
MAX_SAMPLES = SAMPLE_RATE * MAX_DURATION_SECONDS
MAX_TEXT_LENGTH = 2000
MAX_PROVIDER_BYTES = 32 * 1024
REQUEST_SECONDS = 80.0
BODY_SECONDS = 8.0
DECODE_SECONDS = 10.0
GROQ_SECONDS = 15.0
LOCAL_SECONDS = 60.0
PCM_SEND_SECONDS = 10.0
PCM_SEND_JOIN_SECONDS = 2.0
PRELOAD_SECONDS = 120.0
RECOVERY_COOLDOWN_SECONDS = 15.0
GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
SUPPORTED_TYPES = {
    "audio/webm": ({"matroska", "webm"}, {"opus"}),
    "audio/ogg": ({"ogg"}, {"opus", "vorbis"}),
    "audio/mp4": ({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}, {"aac"}),
    "audio/x-m4a": ({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}, {"aac"}),
    "audio/aac": ({"aac"}, {"aac"}),
    "audio/wav": ({"wav"}, None),
    "audio/x-wav": ({"wav"}, None),
    "audio/wave": ({"wav"}, None),
}
VAD_PARAMETERS = {"min_speech_duration_ms": 150, "min_silence_duration_ms": 400}
MP_CONTEXT = multiprocessing.get_context("spawn")


class VoiceError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message

    def payload(self) -> dict[str, object]:
        return {"error": {"code": self.code, "message": self.message}}


class ProviderFailure(Exception):
    def __init__(self, reason: str, fallback: bool, cooldown: float = 0):
        super().__init__(reason)
        self.reason = reason
        self.fallback = fallback
        self.cooldown = cooldown


@dataclasses.dataclass(frozen=True)
class Config:
    secret: str = dataclasses.field(repr=False)
    local_model: str
    local_label: str = "faster-whisper-cpu-int8"
    local_cache: str | None = None
    groq_key: str = dataclasses.field(default="", repr=False)
    groq_model: str = "whisper-large-v3"
    port: int = 3075
    cpu_threads: int = 4

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Config:
        source = os.environ if env is None else env
        secret = source.get("VOICE_WORKER_SECRET", "")
        local_model = source.get("VOICE_LOCAL_MODEL", "").strip()
        model = source.get("GROQ_TRANSCRIPTION_MODEL", "whisper-large-v3").strip()
        label = source.get("VOICE_LOCAL_MODEL_LABEL", "faster-whisper-cpu-int8").strip()
        if len(secret) < 32 or not local_model:
            raise ValueError("worker_configuration_missing")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", model):
            raise ValueError("worker_model_invalid")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", label):
            raise ValueError("worker_label_invalid")
        try:
            port = int(source.get("VOICE_WORKER_PORT", "3075"))
            threads = int(source.get("VOICE_CPU_THREADS", "4"))
        except ValueError:
            raise ValueError("worker_limits_invalid") from None
        if not 1 <= port <= 65535 or not 1 <= threads <= 8:
            raise ValueError("worker_limits_invalid")
        return cls(secret, local_model, label,
                   source.get("VOICE_LOCAL_MODEL_CACHE") or None,
                   source.get("GROQ_API_KEY", "").strip(), model, port, threads)


def media_type(value: str) -> str:
    result = value.split(";", 1)[0].strip().lower()
    if result not in SUPPORTED_TYPES:
        raise VoiceError(415, "VOICE_UNSUPPORTED_AUDIO", "Этот формат аудио не поддерживается.")
    return result


def operation_id(value: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        raise VoiceError(400, "VOICE_INVALID_OPERATION", "Не удалось проверить запрос записи.") from None
    if str(parsed) != value.lower() or parsed.int == 0:
        raise VoiceError(400, "VOICE_INVALID_OPERATION", "Не удалось проверить запрос записи.")
    return str(parsed)


def bounded_text(value: object) -> str:
    if not isinstance(value, str):
        raise VoiceError(502, "VOICE_INVALID_RESPONSE", "Сервис распознавания вернул неверный ответ.")
    # Whitespace normalization is transcription formatting, never numeral correction.
    text = " ".join(value.split())
    if len(text) > MAX_TEXT_LENGTH:
        raise VoiceError(422, "VOICE_TEXT_TOO_LONG", "Запись слишком длинная. Продиктуйте короче.")
    if not text:
        raise VoiceError(422, "VOICE_NO_SPEECH", "В записи не удалось распознать речь.")
    return text


def _quiet_native_process() -> None:
    # FFmpeg/Whisper diagnostics may contain decoded text or user media details.
    logging.disable(logging.CRITICAL)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    with open(os.devnull, "w", encoding="utf-8") as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)


def decode_audio(raw: bytes, content_type: str, *, require_speech: bool = True) -> tuple[bytes, int]:
    """Decode a bounded mono16k waveform. Called only inside a timed process.

    require_speech=False is used by decoder unit tests only. Production always
    runs both an energy gate and the package's bundled local Silero VAD.
    """
    import av
    import numpy as np

    kind = media_type(content_type)
    if not raw or len(raw) > MAX_BYTES:
        raise VoiceError(413, "VOICE_AUDIO_TOO_LARGE", "Размер записи превышает допустимый.")
    av.logging.set_level(av.logging.PANIC)
    chunks = []
    count = 0
    try:
        with av.open(io.BytesIO(raw), mode="r", options={"protocol_whitelist": "pipe"}) as container:
            formats, codecs = SUPPORTED_TYPES[kind]
            detected = set(container.format.name.split(","))
            if not detected.intersection(formats):
                raise VoiceError(415, "VOICE_UNSUPPORTED_AUDIO", "Формат записи не соответствует аудио.")
            if len(container.streams.audio) != 1 or container.streams.video:
                raise VoiceError(415, "VOICE_UNSUPPORTED_AUDIO", "Нужна запись с одной аудиодорожкой.")
            stream = container.streams.audio[0]
            codec_name = stream.codec_context.name
            if ((codecs is not None and codec_name not in codecs)
                    or (kind.endswith("wav") or kind == "audio/wave") and not codec_name.startswith("pcm_")):
                raise VoiceError(415, "VOICE_UNSUPPORTED_AUDIO", "Этот аудиокодек не поддерживается.")
            # Reject obviously unsafe frame shapes before allocating a huge resample.
            if not 1 <= stream.codec_context.channels <= 8:
                raise VoiceError(415, "VOICE_UNSUPPORTED_AUDIO", "Этот формат аудио не поддерживается.")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            first_time: float | None = None
            for frame in container.decode(stream):
                if frame.time is not None:
                    stamp = float(frame.time)
                    if first_time is None:
                        first_time = stamp
                    if stamp - first_time > MAX_DURATION_SECONDS:
                        raise VoiceError(413, "VOICE_AUDIO_TOO_LONG", "Запись должна быть не длиннее 60 секунд.")
                if frame.samples > 1_000_000:
                    raise VoiceError(422, "VOICE_INVALID_AUDIO", "Не удалось прочитать запись.")
                # Reset PTS: cumulative samples, not untrusted metadata, bound duration.
                frame.pts = None
                for converted in resampler.resample(frame):
                    samples = converted.to_ndarray().reshape(-1)
                    count += samples.size
                    if count > MAX_SAMPLES:
                        raise VoiceError(413, "VOICE_AUDIO_TOO_LONG", "Запись должна быть не длиннее 60 секунд.")
                    chunks.append(samples)
            for converted in resampler.resample(None):
                samples = converted.to_ndarray().reshape(-1)
                count += samples.size
                if count > MAX_SAMPLES:
                    raise VoiceError(413, "VOICE_AUDIO_TOO_LONG", "Запись должна быть не длиннее 60 секунд.")
                chunks.append(samples)
    except VoiceError:
        raise
    except Exception:
        raise VoiceError(422, "VOICE_INVALID_AUDIO", "Запись повреждена или не содержит аудио.") from None
    if count < SAMPLE_RATE // 5 or not chunks:
        raise VoiceError(422, "VOICE_NO_SPEECH", "В записи не удалось распознать речь.")
    pcm = np.concatenate(chunks).astype("<i2", copy=False)
    floating = pcm.astype(np.float32) / 32768.0
    if float(np.sqrt(np.mean(np.square(floating)))) < 0.0001:
        raise VoiceError(422, "VOICE_NO_SPEECH", "В записи не удалось распознать речь.")
    if require_speech:
        from faster_whisper.vad import get_speech_timestamps
        if not get_speech_timestamps(floating, sampling_rate=SAMPLE_RATE, **VAD_PARAMETERS):
            raise VoiceError(422, "VOICE_NO_SPEECH", "В записи не удалось распознать речь.")
    return pcm.tobytes(), round(count * 1000 / SAMPLE_RATE)


def normalized_wav(pcm: bytes) -> bytes:
    with io.BytesIO() as output:
        with wave.open(output, "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(SAMPLE_RATE)
            target.writeframes(pcm)
        return output.getvalue()


def retry_after(value: str | None, *, now: float | None = None) -> float:
    """Provider-wide cooldown only; never sleep or retry a paid request."""
    seconds = 30.0
    if value and len(value) <= 128:
        try:
            seconds = float(value)
        except ValueError:
            try:
                parsed = email.utils.parsedate_to_datetime(value)
                seconds = parsed.timestamp() - (time.time() if now is None else now)
            except (ValueError, TypeError, OverflowError):
                pass
    # Bounded operational cooldown, including hostile infinity/NaN headers.
    if not 0 <= seconds <= 300:
        return 300.0 if seconds > 300 else 30.0
    return max(1.0, seconds)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def groq_request(pcm: bytes, key: str, model: str,
                 opener: Callable[..., object] | None = None) -> str:
    """Exactly one request, fixed TLS endpoint; upstream bodies never reach logs."""
    boundary = "miron-" + uuid.uuid4().hex
    blocks: list[bytes] = []
    for name, value in (("model", model), ("language", "ru"), ("temperature", "0"), ("response_format", "json")):
        blocks.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").encode())
    blocks.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode())
    blocks.append(normalized_wav(pcm))
    blocks.append(f"\r\n--{boundary}--\r\n".encode())
    request = urllib.request.Request(GROQ_URL, data=b"".join(blocks), headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "Accept": "application/json",
        "User-Agent": "MIRON-Voice/1",
    }, method="POST")
    # No environment proxies or redirects: credentials/audio go only to Groq.
    send = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect()).open
    try:
        with send(request, timeout=GROQ_SECONDS) as response:
            payload = response.read(MAX_PROVIDER_BYTES + 1)
            if len(payload) > MAX_PROVIDER_BYTES:
                raise VoiceError(502, "VOICE_INVALID_RESPONSE", "Сервис распознавания вернул неверный ответ.")
        try:
            decoded = json.loads(payload)
            return bounded_text(decoded.get("text") if isinstance(decoded, dict) else None)
        except (ValueError, UnicodeError):
            raise VoiceError(502, "VOICE_INVALID_RESPONSE", "Сервис распознавания вернул неверный ответ.") from None
    except urllib.error.HTTPError as error:
        status = error.code
        delay = retry_after(error.headers.get("Retry-After"))
        error.close()
        if status == 429:
            raise ProviderFailure("rate_limited", True, delay) from None
        if status in (401, 403):
            raise ProviderFailure("configuration_failure", True, 300) from None
        if 500 <= status <= 599:
            raise ProviderFailure("upstream_unavailable", True, delay) from None
        raise ProviderFailure("request_rejected", False) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProviderFailure("network_failure", True, 15) from None


def _safe_send(connection: Connection, result: tuple) -> None:
    try:
        connection.send(result)
    except (BrokenPipeError, EOFError, OSError):
        pass


def _decode_process(connection: Connection, raw: bytes, kind: str) -> None:
    _quiet_native_process()
    try:
        pcm, duration = decode_audio(raw, kind)
        _safe_send(connection, ("ok", pcm, duration))
    except VoiceError as error:
        _safe_send(connection, ("error", error.status, error.code, error.message))
    except Exception:
        _safe_send(connection, ("error", 503, "VOICE_DECODER_UNAVAILABLE", "Сервис чтения аудио пока недоступен."))
    finally:
        connection.close()


def _groq_process(connection: Connection, pcm: bytes, key: str, model: str) -> None:
    _quiet_native_process()
    try:
        _safe_send(connection, ("ok", groq_request(pcm, key, model)))
    except ProviderFailure as error:
        _safe_send(connection, ("provider", error.reason, error.fallback, error.cooldown))
    except VoiceError as error:
        _safe_send(connection, ("error", error.status, error.code, error.message))
    except Exception:
        _safe_send(connection, ("provider", "network_failure", True, 15))
    finally:
        connection.close()


def _stop_process(process: multiprocessing.Process) -> None:
    if process.is_alive():
        process.terminate()
    process.join(timeout=0.5)
    if process.is_alive():
        process.kill()
        process.join(timeout=0.5)
    if not process.is_alive():
        process.close()


def isolated(target: Callable, args: tuple, seconds: float,
             cancelled: Callable[[], bool] = lambda: False) -> tuple:
    parent, child = MP_CONTEXT.Pipe(duplex=False)
    process = MP_CONTEXT.Process(target=target, args=(child, *args), daemon=True)
    try:
        process.start()
        child.close()
        deadline = time.monotonic() + max(0, seconds)
        while time.monotonic() < deadline:
            if cancelled():
                raise VoiceError(499, "VOICE_CANCELLED", "Распознавание отменено.")
            if parent.poll(min(0.1, max(0, deadline - time.monotonic()))):
                try:
                    return parent.recv()
                except (EOFError, OSError):
                    break
            if not process.is_alive():
                break
        raise TimeoutError("isolated_worker_timeout")
    finally:
        parent.close()
        child.close()
        if process.pid is not None:
            _stop_process(process)


def _result_error(result: tuple) -> None:
    if result[0] == "error":
        raise VoiceError(result[1], result[2], result[3])


def decode_bounded(raw: bytes, kind: str, deadline: float, cancelled: Callable[[], bool]) -> tuple[bytes, int]:
    try:
        result = isolated(_decode_process, (raw, kind), min(DECODE_SECONDS, deadline - time.monotonic()), cancelled)
    except TimeoutError:
        raise VoiceError(422, "VOICE_DECODE_TIMEOUT", "Не удалось прочитать запись. Попробуйте записать короче.") from None
    _result_error(result)
    return result[1], result[2]


class GroqProvider:
    def __init__(self, config: Config):
        self.config = config

    def transcribe(self, pcm: bytes, deadline: float, cancelled: Callable[[], bool]) -> str:
        try:
            result = isolated(_groq_process, (pcm, self.config.groq_key, self.config.groq_model),
                              min(GROQ_SECONDS, deadline - time.monotonic()), cancelled)
        except TimeoutError:
            raise ProviderFailure("timeout", True, 15) from None
        _result_error(result)
        if result[0] == "provider":
            raise ProviderFailure(result[1], result[2], result[3])
        return result[1]


def _local_process(connection: Connection, config: Config) -> None:
    _quiet_native_process()
    try:
        import numpy as np
        from faster_whisper import WhisperModel
        from faster_whisper.utils import download_model
        from faster_whisper.vad import get_vad_model

        model_path = config.local_model
        if not os.path.isdir(model_path):
            model_path = download_model(model_path, cache_dir=config.local_cache, local_files_only=True)
        # Avoid faster-whisper's tokenizer fallback contacting the hub.
        if not os.path.isfile(os.path.join(model_path, "tokenizer.json")):
            raise ValueError("local_tokenizer_missing")
        model = WhisperModel(model_path, device="cpu", compute_type="int8",
                             cpu_threads=config.cpu_threads, num_workers=1,
                             local_files_only=True, download_root=config.local_cache)
        get_vad_model()  # Bundled ONNX asset; no external model download.
        warm_segments, _ = model.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32),
                                            language="ru", beam_size=1, temperature=0,
                                            condition_on_previous_text=False, vad_filter=False,
                                            max_new_tokens=8)
        list(warm_segments)
        _safe_send(connection, ("ready",))
        while True:
            pcm = connection.recv_bytes(MAX_SAMPLES * 2)
            if not pcm:
                return
            audio = None
            segments = None
            segment = None
            parts: list[str] = []
            try:
                audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
                segments, _ = model.transcribe(audio, language="ru", beam_size=1,
                                                temperature=0, condition_on_previous_text=False,
                                                vad_filter=True, vad_parameters=VAD_PARAMETERS,
                                                no_speech_threshold=0.6, log_prob_threshold=-1.0,
                                                compression_ratio_threshold=2.4,
                                                hallucination_silence_threshold=1.0,
                                                max_new_tokens=440)
                for segment in segments:
                    if segment.no_speech_prob >= 0.6 or segment.avg_logprob < -1.0:
                        continue
                    parts.append(segment.text)
                    if sum(len(part) for part in parts) > MAX_TEXT_LENGTH + 100:
                        raise VoiceError(422, "VOICE_TEXT_TOO_LONG", "Запись слишком длинная. Продиктуйте короче.")
                _safe_send(connection, ("ok", bounded_text(" ".join(parts))))
            except VoiceError as error:
                _safe_send(connection, ("error", error.status, error.code, error.message))
            except Exception:
                _safe_send(connection, ("error", 503, "VOICE_LOCAL_UNAVAILABLE", "Локальное распознавание пока недоступно."))
            finally:
                pcm = b""
                audio = None
                segments = None
                segment = None
                parts.clear()
    except (EOFError, OSError):
        pass
    except Exception:
        _safe_send(connection, ("error", 503, "VOICE_LOCAL_UNAVAILABLE", "Локальная модель не готова. Нужен перезапуск сервиса."))
    finally:
        connection.close()


class LocalProvider(Protocol):
    @property
    def ready(self) -> bool: ...
    def transcribe(self, pcm: bytes, deadline: float, cancelled: Callable[[], bool]) -> str: ...


class PcmTransfer:
    """One in-flight write, monitored by the request thread; never a queue."""

    def __init__(self, connection: Connection, pcm: bytes):
        self._connection = connection
        self._audio = pcm
        self.done = threading.Event()
        self.failed = False
        self._started = False
        self._thread = threading.Thread(target=self._send, name="miron-voice-pcm", daemon=True)

    def start(self) -> None:
        try:
            self._thread.start()
            self._started = True
        except Exception:
            self.failed = True
            self._audio = b""
            self.done.set()
            raise OSError("pcm_sender_unavailable") from None

    def _send(self) -> None:
        try:
            self._connection.send_bytes(self._audio)
        except Exception:
            self.failed = True
        finally:
            self._audio = b""
            self.done.set()

    def join(self) -> None:
        if not self._started:
            return
        self._thread.join(timeout=PCM_SEND_JOIN_SECONDS)
        if self._thread.is_alive():
            raise RuntimeError("pcm_sender_did_not_stop")


class LocalModel:
    def __init__(self, config: Config):
        self._config = config
        self._lock = threading.Lock()
        self._state_lock = threading.RLock()
        self._shutdown = threading.Event()
        self._ready = False
        self._recovering = False
        self._retry_after = 0.0
        self._recovery_timer: threading.Timer | None = None
        self._connection: Connection | None = None
        self._process: multiprocessing.Process | None = None
        self._sender: PcmTransfer | None = None
        try:
            self._connection, self._process = self._load_actor()
            self._ready = True
        except Exception:
            self.close()
            raise ValueError("local_model_preload_failed") from None

    def _load_actor(self) -> tuple[Connection, multiprocessing.Process]:
        """Startup/recovery only. No audio and strictly local cache access."""
        connection, child = MP_CONTEXT.Pipe(duplex=True)
        process = MP_CONTEXT.Process(target=_local_process, args=(child, self._config), daemon=True)
        transferred = False
        try:
            if self._shutdown.is_set():
                raise ValueError("worker_stopping")
            process.start()
            child.close()
            end = time.monotonic() + PRELOAD_SECONDS
            while time.monotonic() < end and not self._shutdown.is_set():
                if connection.poll(min(0.1, max(0, end - time.monotonic()))):
                    if connection.recv()[0] == "ready":
                        transferred = True
                        return connection, process
                    break
                if not process.is_alive():
                    break
            raise ValueError("local_model_preload_failed")
        finally:
            child.close()
            if not transferred:
                connection.close()
                if process.pid is not None:
                    _stop_process(process)

    @staticmethod
    def _dispose_actor(connection: Connection | None, process: multiprocessing.Process | None,
                       sender: PcmTransfer | None = None) -> None:
        # Kill the reader first: a blocked pipe write receives BrokenPipe/EOF.
        # Closing the writer and joining it releases its private PCM reference.
        if process is not None and process.pid is not None:
            _stop_process(process)
        if connection is not None:
            connection.close()
        if sender is not None:
            sender.join()

    def _schedule_recovery(self, *, wait_for_cooldown: bool = False) -> None:
        with self._state_lock:
            if self._shutdown.is_set() or self._recovering or self._ready:
                return
            if self._sender is not None:
                if not self._sender.done.is_set():
                    return  # Never recover while an old writer still owns audio.
                self._sender = None
            delay = max(0, self._retry_after - time.monotonic())
            if delay > 0 and not wait_for_cooldown:
                return
            self._recovering = True
            self._recovery_timer = threading.Timer(delay, self._recover)
            self._recovery_timer.daemon = True
            self._recovery_timer.start()

    def _recover(self) -> None:
        actor: tuple[Connection, multiprocessing.Process] | None = None
        installed = False
        try:
            actor = self._load_actor()
            with self._state_lock:
                if not self._shutdown.is_set():
                    self._connection, self._process = actor
                    self._ready = True
                    self._retry_after = 0
                    installed = True
        except Exception:
            with self._state_lock:
                self._retry_after = time.monotonic() + RECOVERY_COOLDOWN_SECONDS
        finally:
            if actor is not None and not installed:
                self._dispose_actor(*actor)
            with self._state_lock:
                self._recovering = False
                self._recovery_timer = None
            if not self._shutdown.is_set():
                # One warmup attempt only. A failure waits for a fresh request
                # after cooldown; it never retries or retains a cancelled job.
                print(json.dumps({"event": "voice_local_recovered" if installed else "voice_local_recovery_failed"}), flush=True)

    def _retire_actor(self) -> None:
        with self._state_lock:
            connection, process = self._connection, self._process
            sender = self._sender
            self._connection = None
            self._process = None
            self._ready = False
            self._retry_after = time.monotonic() + RECOVERY_COOLDOWN_SECONDS
        self._dispose_actor(connection, process, sender)
        with self._state_lock:
            if self._sender is sender:
                self._sender = None
        self._schedule_recovery(wait_for_cooldown=True)

    @property
    def ready(self) -> bool:
        with self._state_lock:
            return self._ready and self._process is not None and self._process.is_alive()

    def close(self) -> None:
        with self._state_lock:
            if self._shutdown.is_set():
                return
            self._shutdown.set()
            self._ready = False
            recovery = self._recovery_timer
            if recovery is not None:
                recovery.cancel()
            connection, process = self._connection, self._process
            sender = self._sender
            self._connection = None
            self._process = None
        self._dispose_actor(connection, process, sender)
        with self._state_lock:
            if self._sender is sender:
                self._sender = None
        if recovery is not None and recovery is not threading.current_thread() and recovery.is_alive():
            recovery.join(timeout=2)

    def transcribe(self, pcm: bytes, deadline: float, cancelled: Callable[[], bool]) -> str:
        if not self._lock.acquire(blocking=False):
            raise VoiceError(503, "VOICE_BUSY", "Распознавание занято. Попробуйте чуть позже.")
        try:
            if not self.ready:
                with self._state_lock:
                    stale_actor = self._process is not None
                if stale_actor:
                    self._retire_actor()
                else:
                    self._schedule_recovery()
                raise VoiceError(503, "VOICE_LOCAL_UNAVAILABLE", "Локальная модель восстанавливается. Попробуйте чуть позже.")
            with self._state_lock:
                connection, process = self._connection, self._process
            if connection is None or process is None:
                raise VoiceError(503, "VOICE_LOCAL_UNAVAILABLE", "Локальное распознавание пока недоступно.")
            end = min(deadline, time.monotonic() + LOCAL_SECONDS)
            handoff_end = min(end, time.monotonic() + PCM_SEND_SECONDS)
            sender = PcmTransfer(connection, pcm)
            with self._state_lock:
                self._sender = sender
                sender.start()
            while not sender.done.is_set():
                if cancelled():
                    self._retire_actor()
                    raise VoiceError(499, "VOICE_CANCELLED", "Распознавание отменено.")
                remaining = handoff_end - time.monotonic()
                if remaining <= 0:
                    self._retire_actor()
                    raise VoiceError(504, "VOICE_LOCAL_TIMEOUT", "Распознавание заняло слишком долго. Попробуйте записать короче.")
                sender.done.wait(timeout=min(0.1, remaining))
            sender.join()
            with self._state_lock:
                if self._sender is sender:
                    self._sender = None
            if sender.failed:
                raise OSError("local_pcm_handoff_failed")
            while time.monotonic() < end:
                if cancelled():
                    self._retire_actor()
                    raise VoiceError(499, "VOICE_CANCELLED", "Распознавание отменено.")
                if connection.poll(min(0.1, max(0, end - time.monotonic()))):
                    result = connection.recv()
                    if result[0] == "error" and result[2] == "VOICE_LOCAL_UNAVAILABLE":
                        self._retire_actor()
                    _result_error(result)
                    return bounded_text(result[1])
                if not process.is_alive():
                    break
            self._retire_actor()
            raise VoiceError(504, "VOICE_LOCAL_TIMEOUT", "Распознавание заняло слишком долго. Попробуйте записать короче.")
        except (EOFError, OSError):
            self._retire_actor()
            raise VoiceError(503, "VOICE_LOCAL_UNAVAILABLE", "Локальное распознавание пока недоступно.") from None
        finally:
            self._lock.release()


class VoiceGateway:
    def __init__(self, config: Config, local: LocalProvider, groq=None,
                 decoder: Callable = decode_bounded):
        self.config = config
        self.local = local
        self.groq = groq or GroqProvider(config)
        self.decoder = decoder
        self.requests = threading.BoundedSemaphore(2)
        self._health_lock = threading.Lock()
        self._groq_until = 0.0
        self._groq_reason = "ready" if config.groq_key else "not_configured"

    def health(self) -> dict[str, object]:
        with self._health_lock:
            cooldown = max(0, self._groq_until - time.monotonic())
            reason = self._groq_reason if cooldown > 0 else ("ready" if self.config.groq_key else "not_configured")
        return {"ready": self.local.ready, "local": {"ready": self.local.ready, "model": self.config.local_label},
                "groq": {"configured": bool(self.config.groq_key), "ready": bool(self.config.groq_key) and cooldown <= 0,
                         "reason": reason, "cooldownSeconds": round(cooldown)}}

    def transcribe(self, raw: bytes, kind: str, identifier: str,
                   deadline: float, cancelled: Callable[[], bool]) -> dict[str, object]:
        pcm, duration = self.decoder(raw, kind, deadline, cancelled)
        try:
            if cancelled():
                raise VoiceError(499, "VOICE_CANCELLED", "Распознавание отменено.")
            with self._health_lock:
                use_groq = bool(self.config.groq_key) and time.monotonic() >= self._groq_until
            if use_groq:
                try:
                    text = self.groq.transcribe(pcm, deadline, cancelled)
                    return {"operationId": identifier, "text": bounded_text(text), "provider": "groq",
                            "model": self.config.groq_model, "durationMs": duration}
                except ProviderFailure as error:
                    if not error.fallback:
                        raise VoiceError(502, "VOICE_PROVIDER_REJECTED", "Сервис распознавания не принял запись.") from None
                    with self._health_lock:
                        self._groq_until = max(self._groq_until, time.monotonic() + error.cooldown)
                        self._groq_reason = error.reason
                    print(json.dumps({"event": "voice_fallback", "reason": error.reason}), flush=True)
            if cancelled():
                raise VoiceError(499, "VOICE_CANCELLED", "Распознавание отменено.")
            if time.monotonic() >= deadline:
                raise VoiceError(504, "VOICE_TIMEOUT", "Распознавание заняло слишком долго.")
            text = self.local.transcribe(pcm, deadline, cancelled)
            return {"operationId": identifier, "text": bounded_text(text), "provider": "local",
                    "model": self.config.local_label, "durationMs": duration}
        finally:
            pcm = b""


def socket_disconnected(connection: socket.socket) -> bool:
    try:
        readable, _, _ = select.select([connection], [], [], 0)
        if readable:
            return connection.recv(1, socket.MSG_PEEK) == b""
    except (OSError, ValueError):
        return True
    return False


class VoiceServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address: tuple[str, int], gateway: VoiceGateway):
        self.gateway = gateway
        self._connections = threading.BoundedSemaphore(8)
        super().__init__(address, VoiceHandler)

    def process_request(self, request: socket.socket, client_address: tuple):
        if not self._connections.acquire(blocking=False):
            payload = VoiceError(503, "VOICE_BUSY", "Распознавание занято. Попробуйте чуть позже.")
            body = json.dumps(payload.payload(), ensure_ascii=False).encode()
            with contextlib.suppress(OSError):
                request.settimeout(0.25)
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json; charset=utf-8\r\nConnection: close\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._connections.release()

    def handle_error(self, request, client_address):
        print('{"event":"voice_connection_failed"}', flush=True)


class VoiceHandler(BaseHTTPRequestHandler):
    server: VoiceServer
    protocol_version = "HTTP/1.1"
    server_version = "MIRONVoice"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(BODY_SECONDS)

    def log_message(self, format, *args):
        pass

    def send_error(self, code, message=None, explain=None):
        # Never reflect an invalid path/header or render an HTML traceback.
        self._json(VoiceError(code, "VOICE_INVALID_REQUEST", "Не удалось обработать запрос.").payload(), code)

    def _json(self, payload: dict[str, object], status: int = 200):
        self.close_connection = True
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with contextlib.suppress(BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            self.connection.settimeout(1.0)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)

    def _authorize(self):
        supplied = self.headers.get_all("Authorization", [])
        expected = "Bearer " + self.server.gateway.config.secret
        # Digest comparison accepts arbitrary header bytes without raising on Unicode.
        if len(supplied) != 1 or not hmac.compare_digest(
                hashlib.sha256(supplied[0].encode()).digest() if supplied else b"",
                hashlib.sha256(expected.encode()).digest()):
            raise VoiceError(401, "VOICE_UNAUTHORIZED", "Нет доступа к сервису распознавания.")

    def do_GET(self):
        try:
            self._authorize()
            if self.path != "/health":
                raise VoiceError(404, "VOICE_NOT_FOUND", "Этот адрес не найден.")
            self._json(self.server.gateway.health())
        except VoiceError as error:
            self._json(error.payload(), error.status)

    def do_POST(self):
        acquired = False
        raw = b""
        try:
            self._authorize()
            if self.path != "/transcribe":
                raise VoiceError(404, "VOICE_NOT_FOUND", "Этот адрес не найден.")
            identifier = operation_id(self.headers.get("X-Operation-Id", ""))
            kind = media_type(self.headers.get("Content-Type", ""))
            lengths = self.headers.get_all("Content-Length", [])
            if len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,10}", lengths[0]) or self.headers.get("Transfer-Encoding"):
                raise VoiceError(400, "VOICE_INVALID_LENGTH", "Не удалось проверить размер записи.")
            length = int(lengths[0])
            if not 0 < length <= MAX_BYTES:
                raise VoiceError(413, "VOICE_AUDIO_TOO_LARGE", "Размер записи превышает допустимый.")
            acquired = self.server.gateway.requests.acquire(blocking=False)
            if not acquired:
                raise VoiceError(503, "VOICE_BUSY", "Распознавание занято. Попробуйте чуть позже.")
            started = time.monotonic()
            body_end = started + BODY_SECONDS
            pieces: list[bytes] = []
            remaining = length
            while remaining:
                timeout = body_end - time.monotonic()
                if timeout <= 0:
                    raise TimeoutError("body_timeout")
                self.connection.settimeout(timeout)
                piece = self.rfile.read1(min(64 * 1024, remaining))
                if not piece:
                    raise VoiceError(400, "VOICE_INCOMPLETE_AUDIO", "Запись передана не полностью.")
                pieces.append(piece)
                remaining -= len(piece)
            raw = b"".join(pieces)
            pieces.clear()
            result = self.server.gateway.transcribe(raw, kind, identifier, started + REQUEST_SECONDS,
                                                   lambda: socket_disconnected(self.connection))
            self._json(result)
        except VoiceError as error:
            self._json(error.payload(), error.status)
        except (TimeoutError, socket.timeout):
            error = VoiceError(408, "VOICE_UPLOAD_TIMEOUT", "Запись не успела загрузиться. Попробуйте ещё раз.")
            self._json(error.payload(), error.status)
        except Exception:
            error = VoiceError(503, "VOICE_UNAVAILABLE", "Распознавание пока недоступно. Можно ввести текст.")
            self._json(error.payload(), error.status)
            print('{"event":"voice_request_failed"}', flush=True)
        finally:
            raw = b""
            if acquired:
                self.server.gateway.requests.release()


def main() -> int:
    local: LocalModel | None = None
    try:
        config = Config.from_env()
        local = LocalModel(config)
        gateway = VoiceGateway(config, local)
        with VoiceServer(("127.0.0.1", config.port), gateway) as server:
            print(json.dumps({"event": "voice_ready", "port": config.port,
                              "localModel": config.local_label, "groqConfigured": bool(config.groq_key)}), flush=True)
            server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        return 0
    except Exception:
        print('{"event":"voice_startup_failed","code":"VOICE_CONFIGURATION_OR_MODEL_UNAVAILABLE"}', flush=True)
        return 1
    finally:
        if local is not None:
            local.close()
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
