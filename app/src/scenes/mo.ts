// "Mở" (intro, 0 → the first line). An empty sheet of rice paper; a single drop of wine falls, lands on a
// downbeat and bleeds out into the title Túy Âm (revealed by the spreading stain); the credits type
// in; the ledger opens at CHÉN THỨ 00; the title sinks back into the paper, and a cup's outline
// rises in its place for the first line.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { ease, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, label } from './_kit';
import { drawCup } from './_cup';

export default class Mo extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  D: number[] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { audio, lyrics } = this.ctx;
    this.D = audio.downbeats.filter((d) => d < this.ctx.end + 0.1);
    this.beats = beatsIn(audio, 0, this.ctx.end + 0.1);
    this.cups = cupTimes(lyrics);
  }
  private d(i: number) { return this.D[i] ?? i * 1.6; }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, D = (i: number) => this.d(i);
    const land = D(2);
    this.ground.render(renderer, out, { paper: 1, t, stain: 0.25 * smoothstep(land, land + 4, t) });
    const L = this.layer; L.clear();
    const c = L.ctx;
    // the drop: falls from above the frame, lands at (960, 470) on the downbeat
    if (t < land) {
      const k = prog(t, land - 0.9, land, ease.inQuad);
      const y = lerp(-60, 470, k);
      c.fillStyle = rgba('signal', 1);
      c.beginPath(); c.ellipse(960, y, 9, 13 + 10 * k, 0, 0, Math.PI * 2); c.fill();
    }
    // the bloom of the stain and the title inside it
    const r = t < land ? 0 : 900 * (1 - Math.exp(-(t - land) * 0.9));
    const sink = smoothstep(D(8), D(9) + 0.8, t);
    if (r > 0) {
      c.save();
      // splash specks
      for (let i = 0; i < 40; i++) {
        const a = hash(i, 1) * Math.PI * 2, dist = (40 + hash(i, 2) * 260) * Math.min(1, (t - land) * 6);
        c.fillStyle = rgba('signal', 0.8 * (1 - sink));
        c.beginPath(); c.arc(960 + Math.cos(a) * dist, 470 + Math.sin(a) * dist * 0.6, 1.5 + hash(i, 3) * 5, 0, Math.PI * 2); c.fill();
      }
      c.beginPath(); c.ellipse(960, 470, r, r * 0.62, 0, 0, Math.PI * 2); c.clip();
      c.globalAlpha = 1 - sink;
      c.font = font(F.serif(600, true), 260);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('ink', 0.92);
      c.fillText('Túy Âm', 960, 540);
      c.restore();
    }
    // credits type in on D4
    const ck = prog(t, D(4), D(4) + 1.2);
    const cred = 'XESI × MASEW × NHATNGUYEN';
    c.globalAlpha = 1 - sink;
    label(c, cred.slice(0, Math.ceil(cred.length * ck)), 960, 640, { size: 20, color: rgba('ink', 0.7), align: 'center', spacing: 8 });
    label(c, 'MỘT ĐÊM SAY — VẼ BẰNG MỰC', 960, 680, { size: 14, color: rgba('ink', 0.45 * smoothstep(D(5), D(5) + 0.5, t)), align: 'center', spacing: 5 });
    c.globalAlpha = 1;
    // the ledger opens
    drawCups(c, W - 110, 150, t, this.cups, { ink: true, alpha: smoothstep(D(6), D(6) + 0.4, t) });
    // the cup rises in the last bars
    const ck2 = smoothstep(D(8) + 0.4, this.ctx.end, t);
    if (ck2 > 0) {
      c.save(); c.globalAlpha = ck2;
      drawCup(c, 960, lerp(560, 470, ck2), 170, t, { fill: 0 });
      c.restore();
    }
    this.ctx.comp.draw(renderer, L.upload(), out);
    const hit = pulse(t, land, 0.1);
    void H;
    return { bloom: 0.35, vignette: 0.3, paper: 1, frame: 1 - smoothstep(D(8), this.ctx.end, t), flash: hit * 0.05, zoom: 1 + hit * 0.01 };
  }
}
