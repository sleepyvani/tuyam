"""Music analysis -> data/audio.json

Tempo and beat grid (librosa beat tracker on the percussive part of the instrumental, then a
constant-tempo grid fitted through the tracked beats and re-locked to them locally), downbeats (the
beat phase mod 4 with the most low-band onset energy), sections from the aligned lyric lines,
100 fps loudness envelopes (rms/low/mid/high of the mix, vocal from the vocal stem, drums/other from
HPSS of the instrumental, bass = low band of the harmonic part) and onsets per kind (kick, snare,
hat, vocal) as [time, strength].

Run:  python analyze.py   (after separate.py and align.py)
"""
import json
import os

import librosa
import numpy as np
import scipy.ndimage as ndi

import common

SR = 22050
FPS = 100
HOP = SR // FPS  # 220.5 -> use 220 and resample the time axis
HOP = 220


def env01(x, smooth=2, pct=98):
    x = ndi.uniform_filter1d(x.astype(np.float64), max(1, smooth))
    top = np.percentile(x, pct) or 1.0
    return np.clip(x / top, 0, 1)


def band_rms(S, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return np.sqrt((S[m] ** 2).mean(0))


def to_fps(x, n):
    """Resample a per-hop series to n frames at FPS."""
    src = np.arange(len(x)) * HOP / SR
    return np.interp(np.arange(n) / FPS, src, x)


def onsets(sig, fmin, fmax, delta, wait=0.06):
    S = np.abs(librosa.stft(sig, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    m = (freqs >= fmin) & (freqs < fmax)
    env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[m], ref=np.max), sr=SR, hop_length=HOP)
    env = env / (np.percentile(env, 99.5) or 1)
    pk = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=delta, wait=int(wait * SR / HOP))
    t = librosa.frames_to_time(pk, sr=SR, hop_length=HOP)
    return [[round(float(a), 4), round(float(min(1, b)), 3)] for a, b in zip(t, env[pk])]


def main():
    mix, _ = common.load_audio(sr=SR)
    voc, _ = common.load_wav(os.path.join(common.STEMS, "vocals.wav"), sr=SR)
    inst, _ = common.load_wav(os.path.join(common.STEMS, "inst.wav"), sr=SR)
    n = min(len(mix), len(voc), len(inst))
    mix, voc, inst = mix[:n], voc[:n], inst[:n]
    dur = n / SR
    NF = int(dur * FPS) + 1

    harm, perc = librosa.effects.hpss(inst, margin=2.0)

    # ---- beats
    oenv = librosa.onset.onset_strength(y=perc, sr=SR, hop_length=HOP, aggregate=np.median)
    tempo, bt = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=HOP, tightness=120, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    bt = np.asarray(bt)
    # constant grid through the tracked beats (least squares), then snap each grid beat to a tracked beat within 40 ms
    k = np.round((bt - bt[0]) / (60 / tempo))
    A = np.stack([k, np.ones_like(k)], 1)
    period, off = np.linalg.lstsq(A, bt, rcond=None)[0]
    first = off - np.floor(off / period) * period
    grid = np.arange(first, dur, period)
    beats = []
    for g in grid:
        j = np.argmin(np.abs(bt - g))
        beats.append(float(bt[j]) if abs(bt[j] - g) < 0.04 else float(g))
    beats = np.array(beats)
    bpm = 60 / period

    # ---- downbeats: phase mod 4 with the most kick energy
    S = np.abs(librosa.stft(perc, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    low = band_rms(S, freqs, 30, 150)
    lowf = lambda t: low[min(len(low) - 1, int(t * SR / HOP))]  # noqa: E731
    phase = max(range(4), key=lambda p: sum(lowf(b) for b in beats[p::4]))
    downbeats = beats[phase::4]

    # ---- envelopes (100 fps)
    Sm = np.abs(librosa.stft(mix, n_fft=2048, hop_length=HOP))
    Sh = np.abs(librosa.stft(harm, n_fft=2048, hop_length=HOP))
    feats = {
        "rms": env01(to_fps(librosa.feature.rms(y=mix, frame_length=2048, hop_length=HOP)[0], NF), 3),
        "low": env01(to_fps(band_rms(Sm, freqs, 20, 150), NF), 3),
        "mid": env01(to_fps(band_rms(Sm, freqs, 150, 2500), NF), 3),
        "high": env01(to_fps(band_rms(Sm, freqs, 4000, 11000), NF), 2),
        "vocal": env01(to_fps(librosa.feature.rms(y=voc, frame_length=2048, hop_length=HOP)[0], NF), 4),
        "drums": env01(to_fps(librosa.feature.rms(y=perc, frame_length=2048, hop_length=HOP)[0], NF), 3),
        "bass": env01(to_fps(band_rms(Sh, freqs, 30, 200), NF), 4),
        "other": env01(to_fps(librosa.feature.rms(y=harm, frame_length=2048, hop_length=HOP)[0], NF), 4),
    }

    ons = {
        "kick": onsets(perc, 30, 150, 0.12, 0.1),
        "snare": onsets(perc, 150, 4000, 0.14, 0.1),
        "hat": onsets(perc, 6000, 11000, 0.1, 0.05),
        "vocal": onsets(voc, 150, 5000, 0.1, 0.08),
    }

    # ---- sections from the aligned lyric lines
    ly = json.load(open(os.path.join(common.DATA, "lyrics.json"), encoding="utf8"))["lines"]
    sections = [{"name": "intro", "start": 0.0, "end": ly[0]["start"]}]
    for i, l in enumerate(ly):
        s = l["start"]
        e = ly[i + 1]["start"] if i + 1 < len(ly) else l["end"]
        sections.append({"name": f"line{i}", "start": s, "end": e})
    vocal_end = float(np.max(np.nonzero(feats["vocal"] > 0.12)[0])) / FPS
    sections.append({"name": "outro", "start": ly[-1]["end"], "end": dur})

    out = {
        "duration": round(dur, 3), "bpm": round(bpm, 3), "beat_period": round(period, 5), "time_signature": 4,
        "beats": [round(float(b), 4) for b in beats], "downbeats": [round(float(b), 4) for b in downbeats],
        "sections": sections, "fps": FPS, "vocal_end": round(vocal_end, 2),
        **{k: [round(float(v), 3) for v in x] for k, x in feats.items()},
        "onsets": ons,
    }
    with open(os.path.join(common.DATA, "audio.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"bpm {bpm:.3f} (tracker {tempo:.2f}), {len(beats)} beats, downbeat phase {phase}, first beat {beats[0]:.3f}")
    print({k: len(v) for k, v in ons.items()}, "duration", dur)


if __name__ == "__main__":
    main()
