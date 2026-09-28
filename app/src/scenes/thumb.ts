// YouTube thumbnail (not in the edit: loaded with ?thumb, render.ts --thumb). The video's idiom,
// composed to read at thumbnail size: night ink, the title Túy Âm large in rice-paper white, the cup
// overflowing with amber wine and glowing, the road winding away behind it to a jade horizon.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { Ground, label } from './_kit';
import { drawCup } from './_cup';

export default class Thumb extends Scene {
  ground = new Ground();
  layer = new Layer2D();

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    this.ground.render(renderer, out, { paper: 0, t: f.t, stain: 0.2 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    // jade horizon behind the road
    const HOR = 470;
    const g = c.createRadialGradient(1420, HOR, 0, 1420, HOR, 800);
    g.addColorStop(0, rgba('jade', 0.32)); g.addColorStop(0.35, rgba('jade', 0.08)); g.addColorStop(1, rgba('jade', 0));
    c.fillStyle = g; c.fillRect(0, 0, 1920, HOR);
    c.fillStyle = rgba('bone', 0.3); c.fillRect(0, HOR, 1920, 1);
    // the road, dry brush, winding to the horizon on the right half
    for (let lane = 0; lane < 22; lane++) {
      const u = (lane / 21) * 2 - 1;
      const edge = Math.abs(u) > 0.9;
      c.strokeStyle = rgba('bone', edge ? 0.55 : 0.1);
      c.lineWidth = edge ? 2 : 1;
      c.beginPath();
      for (let i = 0; i <= 80; i++) {
        const z = (i / 80) * 0.97;
        const y = HOR + (1120 - HOR) * Math.pow(1 - z, 1.8);
        const cx = 1420 + Math.sin(z * 7.5 + 0.6) * 300 * Math.pow(1 - z, 0.7) * Math.min(1, z * 3.5);
        const x = cx + u * (300 * Math.pow(1 - z, 1.7) + 1);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
    // the cup: a warm glow, then the cup overflowing
    const gl = c.createRadialGradient(1420, 700, 0, 1420, 700, 420);
    gl.addColorStop(0, rgba('ember', 0.5)); gl.addColorStop(1, rgba('signal', 0));
    c.fillStyle = gl; c.fillRect(1000, 280, 840, 840);
    drawCup(c, 1420, 640, 250, 0.4, { fill: 0.97, line: rgba('bone', 0.9), ripples: [0] });
    // title
    c.font = font(F.serif(600, true), 300); c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('bone', 0.97);
    c.fillText('Túy', 90, 440);
    c.fillText('Âm', 150, 740);
    c.fillStyle = rgba('signal', 1); c.fillRect(100, 800, 620, 6);
    label(c, 'XESI × MASEW × NHATNGUYEN', 104, 870, { size: 34, color: rgba('bone', 0.85), spacing: 10 });
    label(c, 'CHÉN THỨ 05', 104, 940, { size: 24, color: rgba('signal', 0.95), spacing: 8 });
    this.ctx.comp.draw(renderer, L.upload(), out);
    return { bloom: 0.6, vignette: 0.45, grain: 0.06 };
  }
}
