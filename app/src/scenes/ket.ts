// "Kết" (the last seconds). On the ash, the cup again, empty; the ledger stops at its last cup and
// reads it out; the title and credits come back in the paper colour and everything fades out.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { smoothstep } from '../engine/util';
import { Ground, cupTimes, label } from './_kit';
import { drawCup } from './_cup';

export default class Ket extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  cups: number[] = [];

  override init() { this.cups = cupTimes(this.ctx.lyrics); }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, s0 = this.ctx.start, e = this.ctx.end;
    this.ground.render(renderer, out, { paper: 0, t, stain: 0.1 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    const a = smoothstep(s0, s0 + 0.6, t);
    c.globalAlpha = a;
    drawCup(c, 960, 330, 110, t, { fill: 0.02, line: rgba('bone', 0.7) });
    const n = this.cups.length;
    label(c, `CHÉN THỨ ${String(n).padStart(2, '0')} — CẠN`, 960, 520, { size: 18, color: rgba('ash', 0.8), align: 'center', spacing: 6 });
    const b = smoothstep(s0 + 0.8, s0 + 1.6, t);
    c.globalAlpha = b;
    c.font = font(F.serif(600, true), 130); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('bone', 0.95);
    c.fillText('Túy Âm', 960, 690);
    label(c, 'XESI × MASEW × NHATNGUYEN', 960, 750, { size: 18, color: rgba('ash', 0.85), align: 'center', spacing: 8 });
    c.globalAlpha = smoothstep(s0 + 2, s0 + 2.8, t);
    label(c, 'a music video rendered in code · every frame a function of song time', 960, 830, { size: 13, color: rgba('ash', 0.5), align: 'center', spacing: 1, family: F.mono(400) });
    c.globalAlpha = 1;
    this.ctx.comp.draw(renderer, L.upload(), out);
    void W;
    return { bloom: 0.5, vignette: 0.5, fade: smoothstep(e - 2.2, e - 0.2, t) };
  }
}
