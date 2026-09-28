// "Hãy say" (lines 5–6: Hãy say / hát / khóc cùng anh — Thêm một lần). Night falls: the page turns to
// ink. The three invitations are set as three rows, each in its own treatment as it is sung:
//   say  — the row sees double (a ghost drifting off it)
//   hát  — a waveform of the voice runs under the row
//   khóc — the letters run: drips of ink fall from them
// "Thêm một lần": two cups slide in from the sides and clink in the middle on the word; the ledger ticks.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line, Word } from '../engine/lyrics';
import { ease, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drawRun, drunk, drunkDraw, karaoke, label, pulseAt, runH } from './_kit';
import { drawCup } from './_cup';

export default class HaySay extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  L!: Line; them!: Line;
  rows: Word[][] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[5]!;
    this.them = lyrics.lines[6]!;
    const ws = this.L.words;
    this.rows = [ws.slice(0, 4), ws.slice(4, 8), ws.slice(8, 12)];
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics, audio } = this.ctx;
    const t = f.t;
    const night = smoothstep(this.ctx.start - 0.2, this.ctx.start + 0.5, t);
    this.ground.render(renderer, out, { paper: 1 - night, t, stain: 0.2 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    const tThem = this.them.words[0]!.start;
    const rowsOut = smoothstep(tThem - 0.3, tThem + 0.1, t);
    const st = { family: F.serif(600), size: 120, unsung: rgba('bone', 0.14), sung: rgba('bone', 0.95) };
    this.rows.forEach((row, i) => {
      const run = runH(row, st);
      const x = 960 - run.width / 2, y = 330 + i * 190;
      const on = t >= row[0]!.start - 0.4;
      if (!on) return;
      c.save();
      c.globalAlpha = 1 - rowsOut;
      if (i === 0) {
        // say: a drifting ghost of the row
        const k = smoothstep(row[1]!.start, row[1]!.start + 0.6, t);
        c.save(); c.globalAlpha *= 0.35 * k;
        drawRun(c, run, x + 18 * k * Math.sin(t * 1.7), y + 6 * k, t, st);
        c.restore();
      }
      drawRun(c, run, x, y, t, st);
      if (i === 1) {
        // hát: the voice as a waveform under the row
        const k = smoothstep(row[1]!.start - 0.1, row[1]!.start + 0.2, t);
        c.strokeStyle = rgba('signal', 0.8 * k); c.lineWidth = 2;
        c.beginPath();
        for (let px = 0; px <= run.width; px += 4) {
          const tt = t - (run.width - px) / 900;
          const v = audio.env('vocal', tt);
          const yy = y + 34 + Math.sin(px * 0.09 + t * 20) * 22 * v;
          if (px) c.lineTo(x + px, yy); else c.moveTo(x + px, yy);
        }
        c.stroke();
      }
      if (i === 2) {
        // khóc: drips run from the letters
        const k0 = row[1]!.start;
        c.fillStyle = rgba('bone', 0.7);
        for (let q = 0; q < 26; q++) {
          const st0 = k0 + hash(q, 2) * 1.2;
          if (t < st0) continue;
          const len = Math.min(160, (t - st0) * 90 * (0.6 + hash(q, 3)));
          const px = x + hash(q, 1) * run.width;
          c.fillRect(px, y + 10, 2.2, len);
          c.beginPath(); c.arc(px + 1.1, y + 10 + len, 3.2, 0, Math.PI * 2); c.fill();
        }
      }
      c.restore();
    });
    // Thêm một lần: two cups clink
    const ck = smoothstep(tThem - 0.35, tThem - 0.1, t);
    if (ck > 0) {
      const meet = prog(t, tThem - 0.35, this.them.words[2]!.start, ease.inCubic);
      const off = lerp(700, 150, meet);
      c.save(); c.globalAlpha = ck;
      for (const s of [-1, 1]) {
        c.save(); c.translate(960 + s * off, 470); c.rotate(s * -0.12 * meet);
        drawCup(c, 0, 0, 130, t, { fill: 0.8, line: rgba('bone', 0.85), ripples: [this.them.words[2]!.start] });
        c.restore();
      }
      const clink = pulse(t, this.them.words[2]!.start, 0.15);
      if (clink > 0.02) {
        c.strokeStyle = rgba('ember', clink); c.lineWidth = 2;
        for (let r = 0; r < 8; r++) { const a = (r / 8) * Math.PI * 2; c.beginPath(); c.moveTo(960 + Math.cos(a) * 30, 450 + Math.sin(a) * 30); c.lineTo(960 + Math.cos(a) * (60 + 60 * (1 - clink)), 450 + Math.sin(a) * (60 + 60 * (1 - clink))); c.stroke(); }
      }
      karaoke(c, this.them.words, 960, 880, t, { family: F.serif(600, true), size: 110, unsung: rgba('bone', 0.14), sung: rgba('bone', 0.95) });
      c.restore();
    }
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'V · HÃY SAY', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t), t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.6, vignette: 0.42, zoom: 1 + kick * 0.008, flash: pulse(t, this.them.words[2]!.start, 0.1) * 0.02 };
  }
}
