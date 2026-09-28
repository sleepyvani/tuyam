// "Cháy" (the second drop: params.lines = [20, 21, 22] — Hãy say cùng anh / Hãy bước cùng anh /
// ~anh say anh bay). Say cho cháy lòng, taken literally: the rice paper catches. On a sheet of paper the
// burn front eats in from the edges on the downbeats (the Ground's burn, an amber rim over char), sparks
// rise on every kick; the chopped lines are written in the middle of what is left:
//   Hãy say cùng anh  — the letters glow at their edges as the heat reaches them
//   Hãy bước cùng anh — ink footprints walk across the page, one per beat, toward the fire
//   anh say anh bay   — the words lift off the page and fly up with the sparks
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import { Lyrics, type Line } from '../engine/lyrics';
import { ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt, runH, sway } from './_kit';

export default class Chay extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  lb = new LineBatch(8000, { screen2D: true, blend: 'add' });
  lines: Line[] = [];
  kicks: number[] = [];
  beats: number[] = [];
  D: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = (this.ctx.params.lines as number[]).map((i) => lyrics.lines[i]!);
    this.kicks = audio.events('kick', this.ctx.start, this.ctx.end).map((e) => e[0]);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.D = audio.downbeats.filter((d) => d >= this.ctx.start - 0.05 && d < this.ctx.end);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    // the burn advances on the downbeats, stepwise (eased)
    let burn = 0;
    this.D.forEach((d) => { burn += prog(t, d, d + 0.6, ease.outCubic); });
    burn = 0.08 + 0.72 * burn / Math.max(1, this.D.length);
    this.ground.render(renderer, out, { paper: 1, t, stain: 0.3, burn });
    const [l20, l21, l22] = this.lines as [Line, Line, Line];
    const L = this.layer; L.clear();
    const c = L.ctx;
    const d = Math.max(drunk(lyrics, t), 0.7);
    const [sx, sy, sr] = sway(d, t);
    c.save();
    c.translate(960 + sx, 540 + sy); c.rotate(sr); c.translate(-960, -540);
    // the night's record: every line sung so far, handwritten small across the sheet; the fire eats it
    c.save();
    c.font = font(F.serif(400, true), 30); c.fillStyle = rgba('ink', 0.32 * (1 - 0.5 * smoothstep(l20.words[0]!.start - 0.5, l20.words[0]!.start, t)));
    c.textBaseline = 'alphabetic';
    let yy = 130, xx = 140;
    for (const l of lyrics.lines.slice(0, 20)) {
      for (const wd of l.words) {
        const ww = c.measureText(wd.w + ' ').width;
        if (xx + ww > 1790) { xx = 140; yy += 44; }
        c.fillText(wd.w, xx, yy);
        xx += ww;
      }
      xx += 30;
    }
    c.restore();
    // Hãy say cùng anh: glowing edges
    const a20 = smoothstep(l20.words[0]!.start - 0.3, l20.words[0]!.start, t) * (1 - smoothstep(l21.words[0]!.start - 0.4, l21.words[0]!.start, t));
    if (a20 > 0) {
      c.save(); c.globalAlpha = a20;
      // the heat at the letters' edges: an ember halo of offset copies (cheaper than shadowBlur)
      const heat = smoothstep(l20.words[0]!.start, l20.end + 1, t);
      if (heat > 0.01) {
        const hst = { family: F.serif(600), size: 150, unsung: rgba('ember', 0), sung: rgba('ember', 0.22 * heat), now: rgba('ember', 0.22 * heat), hold: 1 };
        for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) karaoke(c, l20.words, 960 + dx!, 580 + dy!, t, hst);
      }
      karaoke(c, l20.words, 960, 580, t, { family: F.serif(600), size: 150, unsung: rgba('ink', 0.15), sung: rgba('ink', 0.92), hold: 1 });
      c.restore();
    }
    // Hãy bước cùng anh: footprints toward the fire, one per beat
    const a21 = smoothstep(l21.words[0]!.start - 0.3, l21.words[0]!.start, t) * (1 - smoothstep(l22.words[0]!.start - 0.3, l22.words[0]!.start, t));
    if (a21 > 0) {
      c.save(); c.globalAlpha = a21;
      const steps = this.beats.filter((b) => b >= l21.words[0]!.start - 0.05 && b <= t).length;
      for (let k = 0; k < steps; k++) {
        const x = 300 + k * 150, y = 760 + (k % 2 ? -40 : 40);
        c.fillStyle = rgba('ink', 0.8);
        c.beginPath(); c.ellipse(x, y, 20, 42, 0.2, 0, Math.PI * 2); c.fill();
        for (let q = 0; q < 4; q++) { c.beginPath(); c.arc(x - 12 + q * 8, y - 50, 5, 0, Math.PI * 2); c.fill(); }
      }
      karaoke(c, l21.words, 960, 480, t, { family: F.serif(600), size: 150, unsung: rgba('ink', 0.15), sung: rgba('ink', 0.92), hold: 1 });
      c.restore();
    }
    // anh say anh bay: the syllables lift off and fly
    const a22 = smoothstep(l22.words[0]!.start - 0.3, l22.words[0]!.start, t);
    if (a22 > 0) {
      const st = { family: F.serif(600, true), size: 160 };
      const run = runH(l22.words, st);
      const x0 = 960 - run.width / 2;
      run.syls.forEach((k, i) => {
        const w = k.w;
        const lift = Math.max(0, t - w.end);
        const x = x0 + k.x + lift * 60 * (hash(i, 1) - 0.3), y = 580 - lift * lift * 260 - lift * 120;
        const p = Lyrics.wordProgress(w, t);
        c.save();
        c.globalAlpha = a22 * smoothstep(w.start - 0.3, w.start, t) * (1 - smoothstep(0.8, 2.4, lift));
        c.translate(x, y); c.rotate(lift * (hash(i, 2) - 0.5));
        c.font = font(st.family, st.size); c.textBaseline = 'alphabetic';
        c.fillStyle = p > 0 ? (lift > 0 ? rgba('ember', 1) : rgba('ink', 0.95)) : rgba('ink', 0.18);
        c.fillText(w.w, 0, 0);
        c.restore();
      });
    }
    c.restore();
    drawCups(c, W - 110, 150, t, this.cups, { ink: true });
    label(c, 'X · CHÁY', 110, 96, { size: 13, color: rgba('ink', 0.55) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    // sparks: born on the kicks along the burn front, rising
    const lb = this.lb; lb.clear();
    this.kicks.forEach((k, i) => {
      if (k > t) return;
      for (let q = 0; q < 40; q++) {
        const age = t - k;
        const life = 1.2 + hash(i, q + 3) * 1.8;
        if (age > life) continue;
        const edge = hash(i, q + 4) * 4;
        const bx = edge < 1 ? hash(i, q + 5) * W : edge < 2 ? W - 40 : edge < 3 ? hash(i, q + 5) * W : 40;
        const by = edge < 1 ? H - 30 : edge < 3 && edge >= 2 ? 30 : hash(i, q + 6) * H;
        const x = bx + (hash(i, q + 7) - 0.5) * 200 * age + Math.sin(age * 5 + q) * 12;
        const y = by - age * (120 + 200 * hash(i, q + 8));
        const kk = 1 - age / life;
        const col: [number, number, number] = [LIN.ember[0] * 3 * kk, LIN.ember[1] * 2.4 * kk, LIN.ember[2] * 1.5 * kk];
        lb.seg2(x, y, x, y + 6, 2 * kk + 0.8, col, kk);
      }
    });
    lb.render(renderer, out);
    const kick = pulseAt(this.kicks, t, 0.12);
    return { bloom: 0.45, halation: 0.25, vignette: 0.45, paper: 1, zoom: 1 + kick * 0.015 };
  }
}
