# Engine guide (for scene authors)

The engine comes from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT) and is
adapted here for Vietnamese lyrics (syllable karaoke). The video is a web app (`app/`, TypeScript + three.js, run with
bun + Vite) that renders any song time `t` deterministically at 1920×1080 (or 3840×2160 with
`?scale=2`). The same code drives the live preview and the offline 60 fps export.

## Running things

- Dev server: `cd app && bunx vite` → http://localhost:5173/?t=37.5 (space = play/pause, ←/→ = ±1 s,
  shift = ±5 s, `,`/`.` = ±1 frame, `[`/`]` = previous/next timeline entry, `l` = loop the entry, `h` = hide the UI).
- Stills (the main way to check work): `bun scripts/render.ts stills --t 38.5,41.3 --only duong1 --out ../out/wip/duong`
- Contact sheet: `bun scripts/render.ts sheet --from 80 --to 104 --n 16 --only gan --out ../out/wip/gan.png`,
  or `--cuts` for 4 frames around every scene boundary.
- Short clip: `bun scripts/render.ts video --from 52 --to 60 --only drop1 --out ../out/wip/drop.mp4 --preset veryfast`
- `--only a,b` loads only those timeline entries (a missing entry renders dark red).
- Typecheck: `bunx tsc --noEmit -p tsconfig.json`.
- Browser: Chrome on macOS (Metal); elsewhere `--chrome <path>` / `$CHROME_PATH` or playwright's
  Chromium; on a machine without a GPU it runs on SwiftShader (0.3–0.8 s per frame at 1080p).

## Data

- `lyrics` (`src/engine/lyrics.ts`): `lines[]`, `words[]`. A word is one Vietnamese syllable with
  `start`/`end`; lines starting with `~` in the source are backing vocals (`echo: true`).
  `wordProgress(w, t)`, `findWords('say')`.
- `audio` (`src/engine/audio.ts`): `beats[]`, `downbeats[]`, `beatAt(t)`, `barAt(t)`,
  `events('kick'|'snare'|'hat'|'vocal', t0, t1)`, `env(name, t)`, `hit(kind, t, halfLife)`.

## Writing a scene

One file `app/src/scenes/<name>.ts`, default-exporting a class extending `Scene` (`src/engine/scene.ts`):

```ts
export default class MyScene extends Scene {
  ground = new Ground();          // ink or bone paper (scenes/_kit.ts)
  layer = new Layer2D();          // a 1920×1080 logical Canvas2D layer
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.ground.render(this.ctx.renderer, out, { paper: 0, t: f.t });
    const c = this.layer.ctx; this.layer.clear();
    karaokeH(c, this.ctx.lyrics.lines[0]!.words, 960, 980, f.t, { family: F.sans(900), size: 56 });
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out);
    return { bloom: 0.5 };        // post overrides (optional)
  }
}
```

Rules:

- **Deterministic**: output is a pure function of `f.t` (seeded randomness: `mulberry32`, `hash`).
  Never `Math.random()` or clocks. The export averages sub-frames in any order (motion blur).
  Per-frame jitter uses `frameIdx(t)`, not `Math.floor(t * 60)`.
- `render()` fully overwrites `out` (HalfFloat linear HDR). Colours are **linear**; only
  signal/ember should exceed ~0.85 (bloom). Palette: `C_INK`, `C_BONE`, `C_SIGNAL`… in GLSL,
  `LIN.signal` in TS, `rgba('signal', a)` in Canvas2D.
- `flash` is added after the tone curve: on a dark plate keep it ≤ 0.02 (0.05 linear is already a grey veil).
- Post overrides: `exposure, bloom, bloomThreshold, bloomKnee, bloomRadius, halation, ca, grain,
  vignette, hud, frame, rec, paper, fade, flash, shake:[x,y], zoom, invert` (`src/engine/post.ts`).
- Cuts are hard cuts on the beat before a line's first word (`src/timeline.ts`).

## Kit (`app/src/scenes/_kit.ts`, `_cup.ts`)

- Beats: `beatsIn`, `lastAt`, `idxAt`, `pulseAt`.
- Karaoke: `runH`, `drawRun` (each syllable wipes left to right; "xanh" is always jade), `karaoke`
  (wrapped, centred), `wrap`, `currentLine`.
- Drunkenness: `drunk(lyrics, t)` 0..1 rises with every sung "say"; `sway(d, t)` camera sway;
  `drunkDraw(...)` composites a layer seeing double.
- The ledger: `cupTimes(lyrics)` + `drawCups(...)` (CHÉN THỨ n).
- `Ground`: rice paper or ink, ink-wash `stain`, and `burn` (the paper charring from the edges).
- `drawCup(...)` (`_cup.ts`): the wine cup, fill, ripples, slosh, overflow.
- Fonts: `F.serif(w, italic)` Cormorant Garamond (the lyric voice), `F.archivo(width, w)`, `F.mono(w)`
  IBM Plex Mono — all three cover Vietnamese.

## Output scale (4K)

`?scale=2` (`--scale 2`) renders a true 3840×2160 frame. Scenes keep laying out in logical
1920×1080 px; `Layer2D`, `LineBatch`, `makeRT` and post handle the physical resolution. In GLSL use
`FRAG_PX` (logical px) instead of `gl_FragCoord.xy`, and `pxLine` for hairlines.

## Motion blur

`--samples auto` averages 4…324 sub-frames per frame over `--shutter × 1/fps`, stopping when more
would not change the image by more than `--tol` levels; `--samples N` takes a fixed N. Shaders that
supersample take `ssTap: SS_TAP` and loop `ssK0()..ssK1()` over `rgss(k)` (see `scenes/cells.ts`).

## 3D (scenes/_3d.ts)

Every plate is a 3D scene, built on the same deterministic rule (all state a function of song time):

- `Cam3` — one pinhole camera shared by ray-marched passes and three.js meshes (`project()` for 2D overlays).
- `rayPass(cam, glsl)` — a fullscreen ray-march pass; `shade(ro, rd, px)` returns linear HDR; 4 rotated-grid taps per pixel shared with the motion-blur sub-frames.
- `GLSL_CUP` (the porcelain cup and its wine as SDFs), `GLSL_ROOM` (the dark room with out-of-focus lanterns), `GLSL_RAY` (sphere hits, glow halos).
- `textGeometry()` + `litMaterial()` — extruded type from the fonts' outlines (Vietnamese diacritics included), used for the chops (`Slams` in drop.ts) and the rows in haysay.
- `canvasTex()` — a mask texture drawn once on a canvas (the handscroll in namthang).

Scenes: mo (wine lake), ly / le / ket (`_cupscene.ts`), namthang (handscroll on lacquer), mayngan (ink karst valley flight), haysay (3D type + clinking cups), gan (volumetric ink plumes), duong ×2 (road over hills), drop (5 × 3 cup grid), chay (burning paper sheet), tro (ash dunes).
