// "Lệ" (line 2: Khóc chát làn mi uống cùng anh cho đêm này say chất ngất). Close on the full cup from
// above-ish: a tear forms at the top of the frame on "Khóc", falls on "mi" and breaks the surface into
// rings; "uống" the level drops (a sip); from "say" the video starts to sway and see double — the
// first step of the drunkenness that runs to the end.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt, sway } from './_kit';
import { drawCup } from './_cup';

export default class Le extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  L!: Line;
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[2]!;
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const w = (s: string) => this.L.words.find((x) => x.w.toLowerCase() === s)!;
    const khoc = w('khóc'), mi = w('mi'), uong = w('uống');
    this.ground.render(renderer, out, { paper: 1, t, stain: 0.3 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    const d = drunk(lyrics, t);
    const [sx, sy, sr] = sway(Math.max(d, 0.25 * smoothstep(w('say').start, w('ngất').end, t)), t);
    c.save();
    c.translate(960 + sx, 540 + sy); c.rotate(sr); c.translate(-960, -540);
    const fill = lerp(0.95, 0.62, prog(t, uong.start, uong.start + 1.2, ease.inOutCubic));
    const surf = drawCup(c, 960, 520, 250, t, { fill, ripples: [mi.start + 0.08, uong.start] });
    // the tear
    if (t >= khoc.start - 0.2 && t < mi.start + 0.1) {
      const grow = smoothstep(khoc.start - 0.2, khoc.start + 0.4, t);
      const k = prog(t, mi.start - 0.45, mi.start + 0.08, ease.inQuad);
      const y = lerp(60, surf.y, k);
      c.fillStyle = rgba('ink', 0.75);
      c.beginPath(); c.ellipse(960, y, 7 * grow, (10 + 8 * k) * grow, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    const st = { family: F.serif(600), size: 70, unsung: rgba('ink', 0.18), sung: rgba('ink', 0.92) };
    karaoke(c, this.L.words, 960, 960, t, st, 1700);
    drawCups(c, W - 110, 150, t, this.cups, { ink: true });
    label(c, 'II · LỆ', 110, 96, { size: 13, color: rgba('ink', 0.5) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, Math.max(d, 0.3 * smoothstep(w('say').start, w('ngất').end, t)), t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.35, vignette: 0.32, paper: 1, zoom: 1 + kick * 0.004 };
  }
}
