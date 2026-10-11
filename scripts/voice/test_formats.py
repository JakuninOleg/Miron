"""Browser audio containers tested with real PyAV encoding and decoding."""
import io
import unittest

import av
import numpy as np

from service import VoiceError, decode_audio


def encoded_audio(container_format, codec):
    target = io.BytesIO()
    rate = 48_000
    with av.open(target, mode="w", format=container_format) as output:
        stream = output.add_stream(codec, rate=rate)
        stream.layout = "mono"
        tone = (np.sin(np.arange(rate) * 2 * np.pi * 440 / rate) * 0.1).astype(np.float32)
        frame = av.AudioFrame.from_ndarray(tone.reshape(1, -1), format="flt", layout="mono")
        frame.sample_rate = rate
        for packet in stream.encode(frame):
            output.mux(packet)
        for packet in stream.encode():
            output.mux(packet)
    return target.getvalue()


class BrowserFormatTests(unittest.TestCase):
    def test_browser_containers_decode_to_mono16k(self):
        for container, codec, mime in [
            ("mp4", "aac", "audio/mp4"),
            ("webm", "libopus", "audio/webm;codecs=opus"),
            ("ogg", "libopus", "audio/ogg;codecs=opus"),
        ]:
            with self.subTest(container=container):
                pcm, duration = decode_audio(encoded_audio(container, codec), mime, require_speech=False)
                self.assertTrue(900 <= duration <= 1100)
                self.assertEqual(len(pcm) % 2, 0)

    def test_false_container_header_rejected(self):
        with self.assertRaises(VoiceError) as rejected:
            decode_audio(encoded_audio("mp4", "aac"), "audio/webm", require_speech=False)
        self.assertEqual(rejected.exception.code, "VOICE_UNSUPPORTED_AUDIO")


if __name__ == "__main__":
    unittest.main()
