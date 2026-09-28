// "Ly" (lines 0–1: Rót đến tràn ly anh chìm đắm trong men cay đắng nồng / ~đắng nồng). 3D, ray-marched.
// A porcelain cup on a black lacquer table, lit by a lantern; paper lanterns glow out of focus behind.
//   Rót            — a thread of wine pours from above; the level rises word by word (the camera orbits)
//   tràn ly        — it overflows: a film runs down the outside and a pool spreads over the lacquer
//   chìm đắm       — the camera dives into the cup and goes under: inside the wine, amber haze, light
//                    breaking through the surface above, bubbles rising
//   (đắng nồng)    — the echo floats as a ghost line inside the wine
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, keys, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drawRun, karaoke, label, pulseAt, runH } from './_kit';
import { Cam3, v3 } from './_3d';
import { cupPass } from './_cupscene';

export default class Ly extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  pass = cupPass(this.cam);
  L!: Line; E!: Line;
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[0]!;
    this.E = lyrics.lines[1]!;
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    const w = (s: string) => this.L.words.find((x) => x.w.toLowerCase() === s)!;
    const rot = w('rót'), tran = w('tràn'), chim = w('chìm');
    const D = 0.42;
    const level = t < tran.start ? lerp(-D + 0.01, -0.02, prog(t, rot.start, tran.start, ease.inOutQuad)) : -0.004;
    const spill = prog(t, tran.start, tran.start + 1.8, ease.outCubic);
    // camera: orbit, then the dive into the cup (goes under the surface just after "chìm")
    const orbit = (t - this.ctx.start) * 0.35 + 0.6;
    const dive = prog(t, chim.start - 0.3, chim.start + 0.9, ease.inOutCubic);
    const far = v3(Math.sin(orbit) * 2.1, 0.75, Math.cos(orbit) * 2.1);
    const near = v3(Math.sin(orbit) * 0.1, -0.12, Math.cos(orbit) * 0.1);
    const pos = far.clone().lerp(near, dive);
    const tg = v3(0, lerp(-0.18, -0.3, dive), 0).add(v3(Math.sin(orbit + 2) * 0.3 * dive, 0, Math.cos(orbit + 2) * 0.3 * dive));
    const underNow = dive > 0.93;
    if (underNow) { pos.set(Math.sin(t * 0.2) * 0.1, -0.2, 0.15); tg.set(Math.sin(t * 0.3) * 0.5, 0.35 + 0.1 * Math.sin(t * 0.5), -1); }
    this.cam.set(pos, tg, underNow ? Math.sin(t * 0.7) * 0.05 : 0, keys(t, [[this.ctx.start, 34], [chim.start, 34], [chim.start + 0.9, 60]]));
    const u = this.pass.u;
    u.t!.value = t; u.level!.value = level; u.pour!.value = smoothstep(rot.start - 0.15, rot.start, t) * (1 - smoothstep(tran.start + 0.2, tran.start + 0.5, t));
    u.spill!.value = spill; u.under!.value = underNow ? 1 : 0;
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const st = { family: F.serif(600), size: 72, unsung: rgba('bone', 0.2), sung: rgba('bone', 0.96) };
    karaoke(c, this.L.words, 960, 960, t, st, 1700);
    const ea = smoothstep(this.E.words[0]!.start - 0.2, this.E.words[0]!.start, t);
    if (ea > 0) {
      const est = { family: F.serif(400, true), size: 110, unsung: rgba('bone', 0.1), sung: rgba('bone', 0.5), now: rgba('ember', 0.8), ghost: 0.2 };
      const run = runH(this.E.words, est);
      c.save(); c.globalAlpha = ea * 0.8;
      drawRun(c, run, 960 - run.width / 2 + Math.sin(t * 2) * 12, 470 + Math.sin(t * 1.3) * 8, t, est);
      c.restore();
    }
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'I · LY', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    this.ctx.comp.draw(renderer, L.upload(), out);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.8, bloomThreshold: 0.7, halation: 0.35, vignette: 0.5, zoom: 1 + kick * 0.006, ca: underNow ? 2.5 : 1.2 };
  }
}
