# Túy Âm — music video

A generative, code-rendered music video for **Túy Âm** (Xesi × Masew × Nhatnguyen), with syllable-synced
Vietnamese karaoke. Every frame is a deterministic function of song time, so the live preview in the
browser and the offline 1080p60 (or 4K60) export are identical.

One night of drinking, painted in ink on rice paper: the more he drinks, the more the picture sways and
sees double; the drop sets the paper on fire; the last chorus is sung over the ash. See
[`docs/TREATMENT.md`](docs/TREATMENT.md) for the treatment and plates, and [`docs/ENGINE.md`](docs/ENGINE.md)
for the engine and scene API.

The engine is adapted from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT, see
`LICENSE.pdoom-video`), by way of [sleepyvani/younggirla](https://github.com/sleepyvani/younggirla).

## Layout

- `audio/tuyam.mp3` — the song.
- `lyrics/lyrics.src.js` — the lyrics, one phrase per line, in order (no timings needed).
- `analysis/` — the timing pipeline:
  - `separate.py` — vocal stem (UVR-MDX-NET-Voc_FT, ONNX).
  - `recognize.py` — Vietnamese speech recognition of the vocal stem with token timestamps (sherpa-onnx zipformer-vi).
  - `align.py` — aligns every lyric syllable to the recognized words (dynamic programming, tone-insensitive
    matching), fills the rest between neighbours, with a few manual anchors → `data/lyrics.json`.
  - `analyze.py` — beats (150.4 BPM), downbeats, envelopes, onsets → `data/audio.json`.
- `app/` — the renderer (TypeScript + three.js, bun + Vite): `src/engine/`, `src/scenes/` (one module per
  plate + `_kit.ts`, `_cup.ts`), `src/timeline.ts`, `scripts/render.ts`.

## Run

```sh
cd app
bun install
bunx vite                      # preview: http://localhost:5173  (?t=92 jumps to the first drop)
```

## Render

```sh
cd app
bun scripts/render.ts video --fps 60 --samples 8 --shutter 0.2 --crf 18 --out ../out/tuyam-1080p60.mp4
# faster on an NVIDIA GPU: add --jobs 4 --nvenc (parallel Chromes, GPU encoding) and --text-once
bun scripts/render.ts stills --thumb --t 5 --out ../out/thumb   # the YouTube thumbnail
```

## Regenerate the timing data

The committed `data/*.json` are all the renderer needs. To redo them (models not in the repo):
`analysis/models/UVR-MDX-NET-Voc_FT.onnx` (https://github.com/TRvlvr/model_repo/releases) and
`analysis/models/zipformer-vi/` = `sherpa-onnx-zipformer-vi-int8-2025-04-20`
(https://github.com/k2-fsa/sherpa-onnx/releases, asr-models); Python with numpy, scipy, librosa,
soundfile, onnxruntime and sherpa-onnx.

```sh
cd analysis
python separate.py && python recognize.py && python align.py --report && python analyze.py
```

## Credits

- **Song:** Túy Âm — Xesi × Masew × Nhatnguyen. The song and lyrics belong to their authors and are not
  covered by the code license.
- **Engine:** adapted from pdoom-video by mexicat (MIT).
- **Fonts:** Cormorant Garamond, Archivo, IBM Plex Mono (SIL Open Font License).
- **Models used for analysis:** UVR-MDX-NET-Voc_FT, sherpa-onnx Vietnamese zipformer.

## License

Code: MIT (`LICENSE`, `LICENSE.pdoom-video`). The song, lyrics and derived timing data belong to their authors.
