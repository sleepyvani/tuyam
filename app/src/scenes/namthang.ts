// "Năm tháng" (line 3: Dẫu năm tháng ấy còn đâu những đam mê ta kiếm tìm). A handscroll unrolls across
// the frame while the camera tracks along it. Each word is brushed onto the scroll as it is sung and
// then fades to a ghost (còn đâu: where are they now); tally marks count the years in the margin; on
// "kiếm tìm" a lantern's amber glow sweeps along the scroll looking for what has faded.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { rgba } from '../engine/palette';
import { Lyrics, type Line } from '../engine/lyrics';
import { ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drunk, drunkDraw, label, pulseAt } from './_kit';

const GAP = 70; // scroll px between words

export default class NamThang extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  L!: Line;
  xs: number[] = []; // scroll x of each word
  sizes: number[] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[3]!;
    let x = 0;
    this.L.words.forEach((w, i) => {
      const size = 150 + 20 * hash(i, 1);
      this.sizes.push(size); this.xs.push(x);
      x += measure(w.w, F.serif(600), size) + GAP;
    });
    this.xs.push(x);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const ws = this.L.words;
    this.ground.render(renderer, out, { paper: 1, t, stain: 0.35 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    // camera x along the scroll: follows the current word, eased
    let cur = 0;
    ws.forEach((w, i) => { if (w.start - 0.15 <= t) cur = i; });
    const w0 = ws[cur]!;
    const camX = lerp(this.xs[Math.max(0, cur - 1)]!, this.xs[cur]!, prog(t, w0.start - 0.2, w0.start + 0.25, ease.inOutCubic));
    const ox = 960 - camX - 120;
    // the scroll: a band with rolled ends, the right end unrolling ahead of the words
    const unrolled = this.xs[Math.min(this.xs.length - 1, cur + 2)]! + 200;
    // the scroll's shadow: two soft offset bands (instead of shadowBlur)
    c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(ox - 396, 306, unrolled + 400, 422);
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(ox - 392, 310, unrolled + 400, 424);
    c.fillStyle = 'rgba(248,241,226,1)';
    c.fillRect(ox - 400, 300, unrolled + 400, 420);
    c.fillStyle = rgba('ink', 0.75);
    c.fillRect(ox + unrolled - 8, 280, 22, 460);
    c.strokeStyle = rgba('blood', 0.5); c.lineWidth = 1;
    c.strokeRect(ox - 380, 320, unrolled + 360, 380);
    // tally marks of the years
    const years = Math.floor((t - this.ctx.start) * 2.5);
    c.strokeStyle = rgba('ink', 0.35); c.lineWidth = 2;
    for (let i = 0; i < years; i++) {
      const x = ox - 360 + i * 14 + Math.floor(i / 5) * 12;
      if (i % 5 === 4) { c.beginPath(); c.moveTo(x - 58, 668); c.lineTo(x + 2, 648); c.stroke(); }
      else { c.beginPath(); c.moveTo(x, 640); c.lineTo(x + 3, 676); c.stroke(); }
    }
    // the words: brushed on, then fading to a ghost
    ws.forEach((w, i) => {
      if (t < w.start - 0.3) return;
      const x = ox + this.xs[i]!, y = 560;
      const p = Lyrics.wordProgress(w, t);
      const fade = smoothstep(w.end + 0.6, w.end + 2.6, t);
      c.save();
      c.font = font(F.serif(600), this.sizes[i]!);
      c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('ink', 0.08); c.fillText(w.w, x, y);
      c.beginPath(); c.rect(x - 10, y - 200, (c.measureText(w.w).width + 20) * p, 280); c.clip();
      const hot = t >= w.start && t < w.end + 0.05;
      c.fillStyle = hot ? rgba('signal', 1) : rgba('ink', lerp(0.9, 0.12, fade));
      c.fillText(w.w, x, y);
      c.restore();
    });
    // the lantern on "kiếm tìm"
    const kiem = ws.find((w) => w.w === 'kiếm')!;
    const la = smoothstep(kiem.start - 0.3, kiem.start, t);
    if (la > 0) {
      const lx = ox + lerp(0, this.xs[ws.length]!, (Math.sin((t - kiem.start) * 1.4) * 0.5 + 0.5) * 0.6 + 0.2);
      const g = c.createRadialGradient(lx, 500, 0, lx, 500, 260);
      g.addColorStop(0, rgba('ember', 0.55 * la)); g.addColorStop(1, rgba('ember', 0));
      c.fillStyle = g; c.fillRect(lx - 260, 240, 520, 520);
      c.fillStyle = rgba('signal', la); c.beginPath(); c.ellipse(lx, 250, 16, 22, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba('ink', 0.7 * la); c.fillRect(lx - 1, 200, 2, 30);
    }
    drawCups(c, W - 110, 150, t, this.cups, { ink: true });
    label(c, 'III · NĂM THÁNG', 110, 96, { size: 13, color: rgba('ink', 0.5) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t), t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.35, vignette: 0.32, paper: 1, zoom: 1 + kick * 0.004 };
  }
}
