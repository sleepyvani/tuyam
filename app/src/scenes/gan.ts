// "Gần" (lines 7–9). Night, ink. Two brush strokes stand in for the two of them — no figures, just
// two vertical strokes of a calligrapher's brush, anh on the left in bone, em on the right in amber.
//   Để anh được gần trái tim của em dù trong phút giây — they draw closer on each beat; between them a
//     small amber light beats with the kick drum (the heart), brighter as they near
//   Hình bóng người tan biến dần phía sau những nỗi sầu — em's stroke comes apart into mist that drifts
//     up and away; the heart dims
//   Với em chắc quá đủ cho một mối tình — anh's stroke alone; the line is set large, quiet
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, hash, lerp, noise1, prog, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';

export default class Gan extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  lb = new LineBatch(6000, { screen2D: true, blend: 'add' });
  lines: Line[] = [];
  beats: number[] = [];
  kicks: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = [7, 8, 9].map((i) => lyrics.lines[i]!);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.kicks = audio.events('kick', this.ctx.start - 1, this.ctx.end + 1).map((e) => e[0]);
    this.cups = cupTimes(lyrics);
  }

  /** A calligraphic stroke from (x, y0) to (x, y1): a pressure-varying band with a dry-brush tail. */
  private stroke(c: CanvasRenderingContext2D, x: number, y0: number, y1: number, wmax: number, color: string, seed: number, cut = 1) {
    const n = 60;
    c.fillStyle = color;
    for (let i = 0; i < n * cut; i++) {
      const u = i / n;
      const y = lerp(y0, y1, u);
      const press = Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.6 * (1 - 0.35 * u);
      const wob = noise1(u * 4 + seed, seed) * 10;
      let w = wmax * (0.25 + 0.75 * press);
      // dry brush: the tail thins in streaks instead of breaking off
      if (u > 0.7) w *= 1 - 0.6 * hash(i, seed) * (u - 0.7) / 0.3;
      c.fillRect(x + wob - w / 2, y, w, (y1 - y0) / n + 1);
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const [l7, l8, l9] = this.lines as [Line, Line, Line];
    this.ground.render(renderer, out, { paper: 0, t, stain: 0.15 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    // distance between the strokes: closes on the beats of line 7
    const nb = this.beats.filter((b) => b >= l7.words[0]!.start - 0.1 && b <= t && b < l8.words[0]!.start).length;
    const gap = lerp(620, 180, Math.min(1, nb / 12));
    const tTan = l8.words.find((w) => w.w === 'tan')!.start;
    const gone = prog(t, tTan, l8.end, ease.inOutCubic);
    const heart = (1 - gone) * smoothstep(l7.words[0]!.start - 0.3, l7.words[0]!.start + 0.3, t);
    const kick = pulseAt(this.kicks, t, 0.14);
    this.stroke(c, 960 - gap / 2, 220, 820, 46, rgba('bone', 0.92), 3);
    if (gone < 1) this.stroke(c, 960 + gap / 2, 240, 800, 40, rgba('signal', 0.95 * (1 - gone)), 7, 1 - gone * 0.6);
    // the heart
    if (heart > 0.01) {
      const r = (14 + 22 * kick) * heart * (1 + (1 - gap / 620) * 0.6);
      const g = c.createRadialGradient(960, 480, 0, 960, 480, r * 5);
      g.addColorStop(0, rgba('ember', 0.9 * heart)); g.addColorStop(0.2, rgba('signal', 0.5 * heart)); g.addColorStop(1, rgba('signal', 0));
      c.fillStyle = g; c.fillRect(960 - r * 5, 480 - r * 5, r * 10, r * 10);
    }
    // em's stroke dissolving into mist (additive particles)
    const lb = this.lb; lb.clear();
    if (t > tTan) {
      for (let i = 0; i < 2600; i++) {
        const born = tTan + hash(i, 1) * (l8.end - tTan);
        if (t < born) continue;
        const age = t - born;
        const y0 = 240 + hash(i, 2) * 560;
        const x = 960 + gap / 2 + (hash(i, 3) - 0.5) * 40 + age * (40 + 80 * hash(i, 4)) + noise1(age + i, 3) * 20;
        const y = y0 - age * (30 + 60 * hash(i, 5));
        const a = Math.max(0, 1 - age / 4) * 0.5;
        lb.seg2(x, y, x + 0.01, y, 2 + hash(i, 6) * 2, [LIN.signal[0] * a, LIN.signal[1] * a, LIN.signal[2] * a], 1);
      }
    }
    // the current line
    const cur = currentLine(this.lines, t);
    if (cur) {
      const quiet = cur === l9;
      karaoke(c, cur.words, 960, quiet ? 990 : 980, t, { family: F.serif(quiet ? 400 : 600, quiet), size: quiet ? 78 : 64, unsung: rgba('bone', 0.16), sung: rgba('bone', 0.95) }, 1700);
    }
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'VI · GẦN', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t), t);
    lb.render(renderer, out);
    return { bloom: 0.8, vignette: 0.45, zoom: 1 + kick * 0.006 };
  }
}
