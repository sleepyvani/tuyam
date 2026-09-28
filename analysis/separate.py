"""Vocal stem separation -> analysis/stems/{vocals,inst}.wav

MDX-Net inference (UVR-MDX-NET-Voc_FT, ONNX) on CPU with onnxruntime, re-implemented in numpy
(no torch): chunked STFT (n_fft 7680, hop 1024, 3072 bins x 256 frames), the network predicts the
vocal spectrogram, overlap-free chunks with n_fft/2 trimmed at each side. The instrumental is the
mix minus the vocals.

Run:  python separate.py [--model path/to/UVR-MDX-NET-Voc_FT.onnx]
The model comes from https://github.com/TRvlvr/model_repo/releases (all_public_uvr_models).
"""
import argparse
import os

import numpy as np
import onnxruntime as ort
import soundfile as sf

import common

N_FFT, HOP, DIM_F, DIM_T, COMPENSATE = 7680, 1024, 3072, 256, 1.021
CHUNK = HOP * (DIM_T - 1)
TRIM = N_FFT // 2
GEN = CHUNK - 2 * TRIM
WIN = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)  # periodic hann
NB = N_FFT // 2 + 1


def stft(x):
    """x: [C, CHUNK] -> [C, NB, DIM_T] complex (torch.stft center=True, reflect pad)."""
    xp = np.pad(x, ((0, 0), (N_FFT // 2, N_FFT // 2)), mode="reflect")
    idx = np.arange(DIM_T)[:, None] * HOP + np.arange(N_FFT)[None, :]
    fr = xp[:, idx] * WIN  # [C, T, N_FFT]
    return np.fft.rfft(fr, axis=-1).transpose(0, 2, 1)


def istft(X):
    """X: [C, NB, DIM_T] complex -> [C, CHUNK]."""
    fr = np.fft.irfft(X.transpose(0, 2, 1), n=N_FFT, axis=-1) * WIN  # [C, T, N_FFT]
    L = N_FFT + HOP * (DIM_T - 1)
    out = np.zeros((X.shape[0], L), np.float32)
    norm = np.zeros(L, np.float32)
    for t in range(DIM_T):
        out[:, t * HOP:t * HOP + N_FFT] += fr[:, t]
        norm[t * HOP:t * HOP + N_FFT] += WIN ** 2
    out /= np.maximum(norm, 1e-8)
    return out[:, N_FFT // 2:N_FFT // 2 + CHUNK]


def run_chunk(sess, name, x):
    S = stft(x)[:, :DIM_F]  # [2, F, T]
    inp = np.stack([S[0].real, S[0].imag, S[1].real, S[1].imag])[None].astype(np.float32)
    # the "denoise" trick: average the model on x and -x (cancels the network's own noise floor)
    y = (sess.run(None, {name: inp})[0] - sess.run(None, {name: -inp})[0]) * 0.5
    y = y[0]
    Y = np.zeros((2, NB, DIM_T), np.complex64)
    Y[0, :DIM_F] = y[0] + 1j * y[1]
    Y[1, :DIM_F] = y[2] + 1j * y[3]
    return istft(Y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.join(common.HERE, "models", "UVR-MDX-NET-Voc_FT.onnx"))
    a = ap.parse_args()
    mix, sr = common.load_audio(stereo=True)  # [2, N] at 44.1k
    n = mix.shape[1]
    pad = GEN - n % GEN
    mp = np.concatenate([np.zeros((2, TRIM), np.float32), mix, np.zeros((2, pad + TRIM), np.float32)], axis=1)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = os.cpu_count() or 4
    sess = ort.InferenceSession(a.model, opts, providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name
    outs = []
    starts = range(0, mp.shape[1] - CHUNK + 1, GEN)
    for k, s in enumerate(starts):
        y = run_chunk(sess, name, mp[:, s:s + CHUNK])
        outs.append(y[:, TRIM:TRIM + GEN])
        print(f"\rchunk {k + 1}/{len(starts)}", end="", flush=True)
    voc = np.concatenate(outs, axis=1)[:, :n] * COMPENSATE
    os.makedirs(common.STEMS, exist_ok=True)
    sf.write(os.path.join(common.STEMS, "vocals.wav"), voc.T, sr)
    sf.write(os.path.join(common.STEMS, "inst.wav"), (mix - voc).T, sr)
    print("\nwrote", common.STEMS)


if __name__ == "__main__":
    main()
