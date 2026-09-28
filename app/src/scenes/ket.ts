// "Kết" (the last seconds). 3D: the cup scene once more, the cup empty, a last film of wine in its
// bottom, the lantern low; the camera circles it slowly and rises. The ledger stops at its last cup and
// reads it out; the title and credits come back and everything fades out.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { cupTimes, label } from './_kit';
import { Cam3, v3 } from './_3d';
import { cupPass } from './_cupscene';

export default class Ket extends Scene {
  cam = new Cam3();
  pass = cupPass(this.cam);
  layer = new Layer2D();
  cups: number[] = [];

  override init() { this.cups = cupTimes(this.ctx.lyrics); }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, s0 = this.ctx.start, e = this.ctx.end;
    const k = prog(t, s0, e, ease.inOutCubic);
    const a = 0.8 + (t - s0) * 0.12;
    this.cam.set(v3(Math.sin(a) * lerp(1.9, 2.4, k), lerp(0.55, 1.4, k), Math.cos(a) * lerp(1.9, 2.4, k)), v3(0, lerp(-0.2, -0.3, k), 0), 0, 34);
    const u = this.pass.u;
    u.t!.value = t; u.level!.value = -0.33; u.pour!.value = 0; u.spill!.value = 0; u.under!.value = 0; u.crown!.value = 0; u.tearOn!.value = 0;
    u.ripT0!.value = -99;
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const n = this.cups.length;
    c.globalAlpha = smoothstep(s0 + 0.2, s0 + 0.8, t);
    label(c, `CHÉN THỨ ${String(n).padStart(2, '0')} — CẠN`, 960, 150, { size: 18, color: rgba('ash', 0.8), align: 'center', spacing: 6 });
    const b = smoothstep(s0 + 0.8, s0 + 1.6, t);
    c.globalAlpha = b;
    c.font = font(F.serif(600, true), 130); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('ember', 0.2);
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) c.fillText('Túy Âm', 960 + dx!, 880 + dy!);
    c.fillStyle = rgba('bone', 0.95);
    c.fillText('Túy Âm', 960, 880);
    label(c, 'XESI × MASEW × NHATNGUYEN', 960, 940, { size: 18, color: rgba('ash', 0.85), align: 'center', spacing: 8 });
    c.globalAlpha = smoothstep(s0 + 2, s0 + 2.8, t);
    label(c, 'a music video rendered in code · every frame a function of song time', 960, 1000, { size: 13, color: rgba('ash', 0.5), align: 'center', spacing: 1, family: F.mono(400) });
    c.globalAlpha = 1;
    this.ctx.comp.draw(renderer, L.upload(), out);
    return { bloom: 0.8, bloomThreshold: 0.7, halation: 0.35, vignette: 0.55, fade: smoothstep(e - 2.2, e - 0.2, t) };
  }
}
