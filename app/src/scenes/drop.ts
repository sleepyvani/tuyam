// "Say" (the first drop: params.lines = [14, 15] — Hãy say cùng anh / Hãy hát cùng anh, sung as chops).
// The instrumental drop as the drinking itself. On ink:
//   every kick throws an amber splash of wine (a blot with spatter) somewhere on the page; they pile up
//   and fade slowly
//   a grid of fifteen cups fills one per downbeat, sloshing on the kicks; every fourth bar they all clink
//   (a flash of rings) and the ledger ticks
//   the two chopped lines land huge in the centre, seeing double, on their words
// The whole frame sways, more and more (the drunkenness climbs through the drop).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { hash, lerp, pulse, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drunk, drunkDraw, idxAt, karaoke, label, pulseAt, sway } from './_kit';
import { drawCup } from './_cup';

export default class Drop extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  lines: Line[] = [];
  kicks: number[] = [];
  D: number[] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = (this.ctx.params.lines as number[]).map((i) => lyrics.lines[i]!);
    this.kicks = audio.events('kick', this.ctx.start, this.ctx.end).filter(([, s]) => s > 0.35).map((e) => e[0]);
    this.D = audio.downbeats.filter((d) => d >= this.ctx.start - 0.05 && d < this.ctx.end);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  private splash(c: CanvasRenderingContext2D, i: number, t0: number, t: number) {
    const age = t - t0;
    const x = 160 + hash(i, 11) * 1600, y = 120 + hash(i, 12) * 840;
    const r = 10 + hash(i, 13) * 28;
    const grow = Math.min(1, age * 12);
    const a = Math.max(0, 1 - age / 2.5) * 0.6;
    if (a <= 0) return;
    c.fillStyle = rgba(hash(i, 14) < 0.3 ? 'blood' : 'signal', a);
    c.beginPath();
    const n = 18;
    for (let k = 0; k <= n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const rr = r * grow * (0.75 + 0.5 * hash(i, k + 20));
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (k) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.fill();
    for (let k = 0; k < 16; k++) {
      const ang = hash(i, k + 40) * Math.PI * 2, dist = r * grow * (1.3 + 2 * hash(i, k + 50));
      c.beginPath(); c.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 2 + 5 * hash(i, k + 60), 0, Math.PI * 2); c.fill();
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    this.ground.render(renderer, out, { paper: 0, t, stain: 0.2 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    const d = lerp(drunk(lyrics, t), 1, 0.5 * smoothstep(this.ctx.start, this.ctx.end, t));
    const [sx, sy, sr] = sway(d, t);
    c.save();
    c.translate(960 + sx, 540 + sy); c.rotate(sr); c.translate(-960, -540);
    // splashes
    this.kicks.forEach((k, i) => { if (k <= t) this.splash(c, i, k, t); });
    // the grid of cups
    const nb = idxAt(this.D, t) + 1;
    const kick = pulseAt(this.kicks, t, 0.12);
    const clinkT = this.D.filter((_, i) => i % 4 === 3);
    const clink = pulseAt(clinkT, t, 0.2);
    for (let i = 0; i < 15; i++) {
      const col = i % 5, row = Math.floor(i / 5);
      const x = 360 + col * 300, y = 250 + row * 250;
      const filled = i < nb ? 0.85 : 0.05;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(t * 3 + i) * 0.05 * kick + (col - 2) * 0.03 * clink);
      drawCup(c, 0, 0, 70, t, { fill: filled, line: rgba('bone', 0.6), slosh: Math.sin(t * 7 + i) * 0.08 * kick, ripples: this.D.slice(i, i + 1) });
      c.restore();
    }
    if (clink > 0.02) {
      c.strokeStyle = rgba('ember', clink * 0.8); c.lineWidth = 2;
      for (let r = 0; r < 3; r++) { c.beginPath(); c.arc(960, 500, 200 + r * 160 + (1 - clink) * 300, 0, Math.PI * 2); c.stroke(); }
    }
    c.restore();
    // the chops, huge
    for (const l of this.lines) {
      const a = smoothstep(l.words[0]!.start - 0.25, l.words[0]!.start, t) * (1 - smoothstep(l.end + 1.6, l.end + 2.4, t));
      if (a <= 0) continue;
      c.save(); c.globalAlpha = a;
      c.fillStyle = rgba('ink', 0.7); c.fillRect(0, 410, W, 230);
      karaoke(c, l.words, 960, 580, t, { family: F.serif(600), size: 150, unsung: rgba('bone', 0.2), sung: rgba('bone', 0.97), hold: 0.8 });
      c.restore();
    }
    drawCups(c, W - 110, 1000, t, this.cups);
    label(c, 'IX · SAY', 110, 1000, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    void H;
    return { bloom: 0.9, vignette: 0.5, zoom: 1 + kick * 0.015, flash: pulse(t, this.ctx.start, 0.15) * 0.02 };
  }
}
