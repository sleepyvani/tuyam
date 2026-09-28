"""Shared paths and audio loading for the analysis scripts."""
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AUDIO = os.path.join(ROOT, "audio", "tuyam.mp3")
DATA = os.path.join(ROOT, "data")
STEMS = os.path.join(HERE, "stems")
WORK = os.path.join(HERE, "work")


def load_audio(path=AUDIO, sr=44100, stereo=False):
    """Decode with ffmpeg to float32. Returns ([2, N] or [N], sr).

    mp3 decoders disagree on the encoder delay; ffmpeg's decode is what the renderer muxes back
    (render.ts), so every timestamp here is on the same clock as the exported video.
    """
    ch = 2 if stereo else 1
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(sr), "-"],
        check=True, capture_output=True,
    ).stdout
    x = np.frombuffer(raw, np.float32).copy()
    return (x.reshape(-1, 2).T.copy() if stereo else x), sr


def load_wav(path, sr=None, mono=True):
    import soundfile as sf
    x, r = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(axis=1) if mono else x.T
    if sr and sr != r:
        import librosa
        x = librosa.resample(x, orig_sr=r, target_sr=sr, axis=-1)
        r = sr
    return x, r
