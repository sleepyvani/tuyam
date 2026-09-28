"""Vietnamese speech recognition of the vocal stem with token timestamps -> analysis/work/asr.json

Model: the sherpa-onnx Vietnamese zipformer transducer (int8), from
https://github.com/k2-fsa/sherpa-onnx/releases (asr-models: sherpa-onnx-zipformer-vi-int8-2025-04-20),
in analysis/models/zipformer-vi/. The song is decoded in overlapping 20 s windows; each recognized
word is kept from the window whose central part it starts in. BPE tokens are joined into words
(a token starting with a space or "▁" starts a word); a word's time is its first token's.

Run:  python recognize.py
"""
import json
import os

import numpy as np
import sherpa_onnx

import common

SR = 16000
WIN, HOP = 20.0, 14.0


def main():
    d = os.path.join(common.HERE, "models", "zipformer-vi")
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=os.path.join(d, "encoder-epoch-12-avg-8.int8.onnx"),
        decoder=os.path.join(d, "decoder-epoch-12-avg-8.onnx"),
        joiner=os.path.join(d, "joiner-epoch-12-avg-8.int8.onnx"),
        tokens=os.path.join(d, "tokens.txt"),
        num_threads=os.cpu_count() or 4,
        decoding_method="modified_beam_search",
    )
    x, _ = common.load_wav(os.path.join(common.STEMS, "vocals.wav"), sr=SR)
    dur = len(x) / SR
    words = []  # (t, word)
    margin = (WIN - HOP) / 2
    s = 0.0
    while s < dur:
        seg = x[int(s * SR):int((s + WIN) * SR)]
        st = rec.create_stream()
        st.accept_waveform(SR, seg.astype(np.float32))
        rec.decode_stream(st)
        r = st.result
        # keep the words that start in this window's central part (the edges belong to its neighbours)
        lo = s + (margin if s > 0 else 0.0)
        hi = s + WIN - margin if s + WIN < dur else dur + 1
        cur = None
        for tok, ts in zip(r.tokens, r.timestamps):
            if tok.startswith((" ", "▁")) or cur is None:
                if cur and lo <= cur[0] < hi:
                    words.append(cur)
                cur = [s + ts, tok.replace("▁", "").strip()]
            else:
                cur[1] += tok
        if cur and lo <= cur[0] < hi:
            words.append(cur)
        print(f"\r{s:.0f}/{dur:.0f}s", end="", flush=True)
        s += HOP
    final = sorted(words, key=lambda w: w[0])
    os.makedirs(common.WORK, exist_ok=True)
    json.dump([{"t": round(w[0], 3), "w": w[1].lower()} for w in final if w[1]], open(os.path.join(common.WORK, "asr.json"), "w"), ensure_ascii=False, indent=0)
    print(f"\n{len(final)} words")


if __name__ == "__main__":
    main()
