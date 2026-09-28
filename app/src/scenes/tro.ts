// "Tro" (the last chorus, lines 23–26, unplugged: no drums). After the fire: the paper is ash, grey and
// cracked; the chorus is written quietly in ash-grey, a few embers still drifting up. The road of the
// earlier choruses comes back as a faint chalk line on the ash and the two lights are two dying embers
// that part at "tự rời bỏ nhau". "ngát xanh" gets its jade once more, very faint; on the last "cháy lòng"
// the words glow once and go out.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label } from './_kit';

export default class Tro extends Scene {
  ash = new FSPass(/* glsl */ `
    uniform float t;
    void main() {
      vec2 px = FRAG_PX; px.y = 1080.0 - px.y;
      vec2 uv = px / vec2(1920.0, 1080.0);
      float n = fbm(px * 0.004, 5);
      // cracks: the ridges of a cellular-ish noise
      float cr = 1.0 - smoothstep(0.0, 0.04, abs(snoise(px * 0.006 + 3.0)));
      vec3 col = mix(C_INK2 * 1.6, C_GRAPHITE * 0.55, 0.5 + 0.5 * n);
      col = mix(col, C_INK, cr * 0.6);
      // a few glowing specks in the ash
      float g = smoothstep(0.9975, 1.0, hash12(floor(px / 3.0))) * (0.5 + 0.5 * sin(t * 2.0 + hash12(floor(px / 3.0) + 7.0) * 30.0));
      col += C_EMBER * g * 1.5;
      col *= mix(0.7, 1.0, smoothstep(1.2, 0.3, length((uv - 0.5) * vec2(1.4, 1.0))));
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 } });
  layer = new Layer2D();
  lb = new LineBatch(3000, { screen2D: true, blend: 'add' });
  lines: Line[] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = [23, 24, 25, 26].map((i) => lyrics.lines[i]!);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    this.ash.u.t!.value = t;
    this.ash.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const last = this.lines[3]!;
    const roi = last.words.find((w) => w.w === 'rời')!;
    const chay = last.words.find((w) => w.w === 'cháy')!;
    // the road in chalk
    c.strokeStyle = rgba('ash', 0.25); c.lineWidth = 1.2;
    const fork = smoothstep(roi.start - 0.2, roi.start + 1.5, t);
    for (const br of fork > 0 ? [-1, 1] : [0]) {
      for (const s of [-1, 1]) {
        c.beginPath();
        for (let i = 0; i <= 60; i++) {
          const z = i / 60 * 0.9;
          const y = 520 + 560 * Math.pow(1 - z, 1.8);
          const cx = 960 + Math.sin(z * 7.5 + 0.6) * 330 * Math.pow(1 - z, 0.7) * Math.min(1, z * 3.5) + br * fork * Math.max(0, z - 0.35) * 900;
          const x = cx + s * (300 * Math.pow(1 - z, 1.7) + 1);
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    // the chorus in ash-grey; "cháy lòng" glows once at the end and goes out
    const cur = currentLine(this.lines, t);
    if (cur) {
      const glow = cur === last ? smoothstep(chay.start - 0.1, chay.start + 0.3, t) * (1 - smoothstep(chay.start + 1.5, this.ctx.end, t)) : 0;
      karaoke(c, cur.words, 960, 300, t, { family: F.serif(600, true), size: 84, unsung: rgba('ash', 0.22), sung: rgba('bone', 0.8), now: glow > 0 ? rgba('ember', 0.6 + 0.4 * glow) : rgba('bone', 0.9), hold: glow > 0 ? 2 : 0.05 }, 1700);
    }
    drawCups(c, W - 110, 1000, t, this.cups, { alpha: 0.6 });
    label(c, 'XI · TRO', 110, 1000, { size: 13, color: rgba('ash', 0.5) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t) * 0.5, t);
    // embers: a few, drifting up slowly; the two lights on the road
    const lb = this.lb; lb.clear();
    for (let i = 0; i < 120; i++) {
      const sp = 20 + hash(i, 1) * 40;
      const x = hash(i, 2) * W + Math.sin(t * 0.5 + i) * 20;
      const y = H + 20 - ((hash(i, 3) * (H + 40) + (t - this.ctx.start) * sp) % (H + 40));
      const k = 0.4 + 0.6 * Math.sin(t * (1 + hash(i, 4) * 2) + i) ** 2;
      lb.seg2(x, y, x, y + 3, 2.2, [LIN.ember[0] * 1.8 * k, LIN.ember[1] * 1.3 * k, LIN.ember[2] * 0.6 * k], 1);
    }
    const walk = lerp(0.1, 0.6, prog(t, this.ctx.start, this.ctx.end, ease.linear));
    for (const br of [-1, 1]) {
      const z = walk;
      const y = 520 + 560 * Math.pow(1 - z, 1.8);
      const x = 960 + Math.sin(z * 7.5 + 0.6) * 330 * Math.pow(1 - z, 0.7) * Math.min(1, z * 3.5) + (fork > 0 ? br * fork * Math.max(0, z - 0.35) * 900 : br * 30);
      const dim = 1 - 0.7 * smoothstep(chay.start, this.ctx.end, t);
      lb.seg2(x, y, x + 0.01, y, 14, [LIN.signal[0] * 2 * dim, LIN.signal[1] * 2 * dim, LIN.signal[2] * 2 * dim], 0.9);
    }
    lb.render(renderer, out);
    const xanh = this.lines.flatMap((l) => l.words).filter((w) => w.w === 'xanh');
    void xanh;
    return { bloom: 0.8, vignette: 0.55, grain: 0.07 };
  }
}
