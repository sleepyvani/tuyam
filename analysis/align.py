"""Syllable-level lyric alignment -> data/lyrics.json

Vietnamese is written syllable by syllable, so every syllable is a karaoke word. The recording's
vocal stem is transcribed with timestamps (recognize.py → work/asr.json); this script aligns the
supplied lyric syllables to the recognized words with a global dynamic programme (Needleman–Wunsch):
identical syllables score high (a bonus when the tones match too), accent-insensitive near matches score
a little, extra recognized words (ad-libs, echoes, misrecognitions) are cheap to skip, lyric syllables
the recognizer missed cost more. Matched syllables take the recognized times (snapped to a vocal-stem
onset within ±80 ms); the rest are placed between their matched neighbours: after the previous one
when they end its line, before the next one when they start a new line, spread evenly inside a line.
A few manual anchors (ANCHORS) fix the spots the recognizer gets wrong.
Ends run to the next syllable, or through a held note until the vocal envelope drops.

Run:  python align.py [--report]
"""
import argparse
import json
import os
import re
import subprocess
import unicodedata
from difflib import SequenceMatcher

import numpy as np

import common


# Manual anchors {(line, syllable index): time}, read off the recognizer's output and the vocal-stem
# envelope where the automatic match goes wrong:
#  - "chất ngất" is heard as "trứt ngã" (27.44, 27.92), and "Dẫu" as "sâu" (28.64), which the matcher gave to "đâu"
#  - the second drop's vocal chops, which the recognizer does not hear at all; they repeat the first
#    drop's spacing (+14.6 s after the chorus, then +6.6 s)
ANCHORS = {(2, 11): 27.44, (2, 12): 27.92, (3, 0): 28.64, (20, 0): 157.62, (21, 0): 164.2, (22, 0): 168.1}


def plain(s):
    s = unicodedata.normalize("NFD", s.lower().replace("đ", "d"))
    return re.sub(r"[^a-z0-9]", "", "".join(ch for ch in s if unicodedata.category(ch) != "Mn"))


def source_lines():
    src = os.path.join(common.ROOT, "lyrics", "lyrics.src.js")
    out = subprocess.run(["node", "-e", f"console.log(JSON.stringify(require({json.dumps(src)}).LY))"], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def score(a, b):
    """a: lyric syllable, b: recognized word."""
    pa, pb = plain(a), plain(b)
    if not pa or not pb:
        return -1.5
    if pa == pb:
        return 3.0 + (1.0 if unicodedata.normalize("NFC", a.lower()) == unicodedata.normalize("NFC", b.lower()) else 0.0)
    r = SequenceMatcher(None, pa, pb).ratio()
    return 1.0 if r >= 0.6 else -1.5


def dp_align(lyr, asr, gap_lyr=-1.0, gap_asr=-0.35):
    n, m = len(lyr), len(asr)
    D = np.zeros((n + 1, m + 1), np.float32)
    B = np.zeros((n + 1, m + 1), np.int8)  # 0 diag, 1 up (lyric unmatched), 2 left (asr skipped)
    D[1:, 0] = gap_lyr * np.arange(1, n + 1); B[1:, 0] = 1
    D[0, 1:] = gap_asr * np.arange(1, m + 1); B[0, 1:] = 2
    S = np.array([[score(a, b) for b in asr] for a in lyr], np.float32)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            c = (D[i - 1, j - 1] + S[i - 1, j - 1], D[i - 1, j] + gap_lyr, D[i, j - 1] + gap_asr)
            k = int(np.argmax(c)); D[i, j] = c[k]; B[i, j] = k
    match = [None] * n
    i, j = n, m
    while i > 0 or j > 0:
        k = B[i, j]
        if i > 0 and j > 0 and k == 0:
            if S[i - 1, j - 1] > 0:
                match[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif i > 0 and (j == 0 or k == 1):
            i -= 1
        else:
            j -= 1
    return match


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    lines = source_lines()
    asr = json.load(open(os.path.join(common.WORK, "asr.json"), encoding="utf8"))
    syl = []  # (line index, text)
    for li, l in enumerate(lines):
        for w in l.lstrip("~").split():
            syl.append((li, w))
    match = dp_align([s[1] for s in syl], [w["w"] for w in asr])
    n = len(syl)
    t = [asr[match[k]]["t"] if match[k] is not None else None for k in range(n)]
    print(f"matched {sum(x is not None for x in t)}/{n} syllables against {len(asr)} recognized words")

    # snap matched starts to vocal onsets
    import librosa
    vx, sr = common.load_wav(os.path.join(common.STEMS, "vocals.wav"), sr=16000)
    env = librosa.onset.onset_strength(y=vx, sr=sr, hop_length=160)
    ons = librosa.frames_to_time(librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=160, delta=0.05), sr=sr, hop_length=160)
    for k in range(n):
        if t[k] is not None and len(ons):
            j = int(np.argmin(np.abs(ons - t[k])))
            if abs(ons[j] - t[k]) < 0.08:
                t[k] = float(ons[j])
    # manual anchors; a matched syllable of the same line that now lands out of order is released
    for (li, si), ts in ANCHORS.items():
        ks = [k for k in range(n) if syl[k][0] == li]
        k0 = ks[si]
        t[k0] = ts
        for k in ks:
            if k != k0 and t[k] is not None and ((k < k0 and t[k] >= ts) or (k > k0 and t[k] <= ts)):
                t[k] = None
    # monotonic anchors
    last = -1.0
    for k in range(n):
        if t[k] is not None:
            if t[k] <= last + 0.02:
                t[k] = None
            else:
                last = t[k]
    # fill the gaps
    STEP = 0.28
    k = 0
    while k < n:
        if t[k] is not None:
            k += 1
            continue
        k0 = k
        while k < n and t[k] is None:
            k += 1
        prev = t[k0 - 1] if k0 > 0 else None
        nxt = t[k] if k < n else None
        idx = list(range(k0, k))
        if prev is None and nxt is None:
            raise SystemExit("nothing matched")
        if prev is None:
            for q, kk in enumerate(reversed(idx)):
                t[kk] = nxt - STEP * (q + 1)
        elif nxt is None:
            for q, kk in enumerate(idx):
                t[kk] = prev + STEP * (q + 1)
        else:
            span = nxt - prev
            same = syl[k0 - 1][0] == syl[k][0]
            if same or span <= STEP * (len(idx) + 1) * 1.6:
                for q, kk in enumerate(idx):
                    t[kk] = prev + span * (q + 1) / (len(idx) + 1)
            else:
                # a long gap: syllables of the previous line follow it, those of the next line lead into it
                li_prev = syl[k0 - 1][0]
                head = [kk for kk in idx if syl[kk][0] == li_prev]
                tail = [kk for kk in idx if syl[kk][0] != li_prev]
                for q, kk in enumerate(head):
                    t[kk] = prev + STEP * (q + 1)
                for q, kk in enumerate(reversed(tail)):
                    t[kk] = nxt - STEP * (q + 1)
    # ends: next start, or the vocal envelope's release for held notes
    hop = 160
    rms = np.sqrt(np.convolve(vx ** 2, np.ones(400) / 400, "same")[::hop])
    thr = 0.25 * np.percentile(rms[rms > 1e-3], 90)
    ends = []
    for k in range(n):
        nx = t[k + 1] if k + 1 < n else t[k] + 2
        f = int(t[k] * 100) + 10
        e = t[k] + 0.12
        while f < len(rms) and rms[f] > thr and f / 100 < t[k] + 1.8:
            f += 1
            e = f / 100
        e = min(nx, max(e, t[k] + 0.12))
        if nx - e < 0.15:
            e = nx
        ends.append(e)
    res = {"lines": []}
    for li, l in enumerate(lines):
        ks = [k for k in range(n) if syl[k][0] == li]
        words = [{"w": syl[k][1], "r": "", "start": round(t[k], 3), "end": round(ends[k], 3)} for k in ks]
        res["lines"].append({"i": li, "text": l.lstrip("~"), "romaji": "", "echo": l.startswith("~"),
                             "start": words[0]["start"], "end": words[-1]["end"], "words": words})
    json.dump(res, open(os.path.join(common.DATA, "lyrics.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("wrote data/lyrics.json")
    if a.report:
        for l in res["lines"]:
            ms = sum(1 for w in l["words"] if True)
            print(f"[{l['i']:2d}] {l['start']:7.2f}-{l['end']:7.2f}  " + " ".join(f"{w['w']}@{w['start']:.2f}" for w in l["words"]))


if __name__ == "__main__":
    main()
