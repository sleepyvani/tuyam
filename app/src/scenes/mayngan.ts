// "Mây ngàn" (line 4). 3D, ray-marched: an ink-wash karst valley. The camera flies up the valley
// through layers of mist, banking with its bends; the peaks are brushed in ink, darkest at the crests,
// bleeding into the mist below. On "xanh" a jade light (the eyes) kindles over the nearest ridge, the
// first time the accent colour appears, then drifts up and away into the far clouds, growing faint.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';
import { Cam3, GLSL_RAY, rayPass, v3 } from './_3d';

export default class MayNgan extends Scene {
  layer = new Layer2D();
  cam = new Cam3();
  land = rayPass(this.cam, /* glsl */ `
    ${GLSL_RAY}
    uniform vec3 eye; uniform float eyeOn;
    float path(float z) { return 0.9 * sin(z * 0.23) + 0.5 * sin(z * 0.61 + 1.3); }
    // karst peaks: tall ridged towers, the valley kept open along the path
    float hgt(vec2 p) {
      float r = 0.0, a = 1.0; vec2 q = p * 0.33;
      for (int i = 0; i < 4; i++) { float n = 1.0 - abs(snoise(q)); r += a * n * n; q = rot2(0.7) * q * 2.1 + 3.1; a *= 0.45; }
      float towers = pow(max(snoise(p * 0.21 + 7.0) * 0.5 + 0.5, 0.0), 3.0) * 3.4;
      float h = r * 0.9 + towers;
      float valley = smoothstep(0.35, 2.2, abs(p.x - path(p.y)));
      return h * valley - 0.2;
    }
    vec3 skyC(vec3 rd) {
      vec3 c = mix(C_BONE * 0.85, C_ASH * 0.7, smoothstep(0.0, 0.6, rd.y));
      c += C_EMBER * 0.12 * pow(max(dot(rd, normalize(vec3(0.6, 0.12, -1.0))), 0.0), 8.0);
      return c;
    }
    float mistAt(vec3 p) { return exp(-max(p.y + 0.1, 0.0) * 1.3) * (0.55 + 0.45 * fbm(vec3(p.xz * 0.25, t * 0.05), 3)); }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      float tt = 0.05, hit = 0.0;
      for (int i = 0; i < 140; i++) {
        vec3 p = ro + rd * tt;
        float d = p.y - hgt(p.xz);
        if (d < 0.002 * tt) { hit = 1.0; break; }
        tt += max(d * 0.45, 0.01 + tt * 0.004);
        if (tt > 40.0) break;
      }
      vec3 sky = skyC(rd);
      vec3 col = sky;
      if (hit > 0.0) {
        vec3 P = ro + rd * tt;
        vec2 e = vec2(0.02, 0.0);
        vec3 N = normalize(vec3(hgt(P.xz - e.xy) - hgt(P.xz + e.xy), 2.0 * e.x, hgt(P.xz - e.yx) - hgt(P.xz + e.yx)));
        // ink wash: dark where the slope faces the light and at the crests, bleeding down into the mist
        float slope = 1.0 - N.y;
        float crest = smoothstep(0.4, 2.6, P.y);
        float tex = 0.6 + 0.4 * fbm(P.xz * vec2(1.5, 5.0) + P.y * 2.0, 4);
        float inkAmt = clamp((0.55 + 0.9 * slope) * (0.55 + 1.1 * crest) * tex, 0.0, 1.0);
        vec3 c = mix(C_BONE * 0.75, C_INK * 0.5, inkAmt);
        // dry-brush texture strokes following the slope
        c = mix(c, C_INK, smoothstep(0.55, 0.9, snoise(vec2(P.y * 14.0, atan(N.z, N.x) * 3.0))) * slope * 0.4);
        float fog = 1.0 - exp(-tt * 0.05);
        col = mix(c, sky, fog);
      }
      // mist layers: accumulated along the ray through the low valley air
      float m = 0.0;
      for (int i = 0; i < 12; i++) {
        float s = 0.4 + float(i) * 1.6 + hash12(px + float(i)) * 1.2;
        if (hit > 0.0 && s > tt) break;
        m += mistAt(ro + rd * s) * 0.055;
      }
      col = mix(col, C_BONE * 0.9, clamp(m, 0.0, 0.7));
      // the eyes: a jade light
      if (eyeOn > 0.0) {
        float g = halo(ro, rd, eye, hit > 0.0 ? tt : 1e3, 900.0);
        float g2 = halo(ro, rd, eye, hit > 0.0 ? tt : 1e3, 30.0);
        col += C_JADE * eyeOn * (g * 7.0 + g2 * 0.6);
      }
      return col;
    }`, { eye: { value: v3() }, eyeOn: { value: 0 } });
  L!: Line;
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[4]!;
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const w = (s: string) => this.L.words.find((x) => x.w.toLowerCase() === s)!;
    const xanh = w('xanh'), lac = w('lạc'), xoi = w('xôi');
    const u = this.land.u;
    u.t!.value = t;
    // camera: flying up the valley through the mist, banking with the path
    const path = (z: number) => 0.9 * Math.sin(z * 0.23) + 0.5 * Math.sin(z * 0.61 + 1.3);
    const z = -(t - this.ctx.start) * 1.1;
    const d = drunk(lyrics, t);
    const pos = v3(path(z), 0.55 + 0.1 * Math.sin(t * 0.5), z);
    const tg = v3(path(z - 2.5), 0.75 + 0.2 * smoothstep(xanh.start, xoi.end, t), z - 2.5);
    this.cam.set(pos, tg, (path(z - 1.5) - path(z)) * -0.15 + Math.sin(t * 0.8) * 0.02 * d, 50);
    const on = smoothstep(xanh.start - 0.15, xanh.start + 0.2, t);
    const away = prog(t, lac.start, xoi.end, ease.inOutCubic);
    const ez = lerp(z - 3.2, z - 14, away);
    (u.eye!.value as THREE.Vector3).set(path(ez) + lerp(0.3, 2.5, away), lerp(0.9, 3.4, away), ez);
    u.eyeOn!.value = on * lerp(1, 0.25, away) * (1 - smoothstep(xoi.end - 0.2, xoi.end + 0.5, t));
    this.land.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const st = { family: F.serif(600), size: 66, unsung: rgba('ink', 0.18), sung: rgba('ink', 0.92) };
    karaoke(c, this.L.words, 960, 170, t, st, 1700);
    // "xanh" relit in jade over the karaoke
    drawCups(c, W - 110, 1000, t, this.cups, { ink: true });
    label(c, 'IV · MÂY NGÀN', 110, 1000, { size: 13, color: rgba('ink', 0.5) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t), t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.5, vignette: 0.3, paper: 1, zoom: 1 + kick * 0.004 };
  }
}
