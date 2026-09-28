// "Cháy" (the second drop: params.lines = [20, 21, 22], sung as chops). 3D, ray-traced: the burning
// taken literally. A large sheet of rice paper hangs in the dark, rippling in the fire, faint brushwork
// on it. Each downbeat the fire eats further in from its edges: a charred band, a glowing front, holes
// opening onto the dark; embers stream up from the front, bursts of them on the kicks. The chops slam in
// as extruded type in front of the sheet; through line 21 ink footprints walk across the paper, one per
// beat; line 22's words lift off one by one as they are sung, glowing, and drift up with the embers.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, label, lastAt, pulseAt, sway } from './_kit';
import { Cam3, GLSL_RAY, GLSL_ROOM, rayPass, renderMeshes, shake3, v3 } from './_3d';
import { Slams } from './drop';

const MAXK = 6;

export default class Chay extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  slams!: Slams;
  lines: Line[] = [];
  kicks: number[] = [];
  beats: number[] = [];
  D: number[] = [];
  cups: number[] = [];
  pass = rayPass(this.cam, /* glsl */ `
    ${GLSL_ROOM}
    ${GLSL_RAY}
    uniform float burn, steps, fire;
    uniform float kicks[${MAXK}];
    const vec2 HALF = vec2(2.3, 1.4);   // the sheet's half size (x, y), in the plane z = 0
    float wave(vec2 q) { return 0.05 * sin(q.x * 1.3 + t * 1.1) * sin(q.y * 1.7 + t * 0.8) + 0.02 * sin(q.x * 3.1 - t * 2.0); }
    // burn field: < 0 is burnt away; the fire eats in from the edges, unevenly
    float burnF(vec2 q) {
      vec2 e = HALF - abs(q);
      float edge = min(e.x, e.y);
      float n = fbm(q * 0.9 + 3.0, 4);
      return edge + 0.45 * n - burn * 1.6;
    }
    // faint brushwork: columns of dry vertical strokes (abstract calligraphy)
    float brush(vec2 q) {
      float col = floor((q.x + HALF.x) / 0.32);
      float x = fract((q.x + HALF.x) / 0.32) - 0.5;
      float seg = floor((q.y + 3.0) / 0.22 + hash11(col) * 5.0);
      float on = step(0.35, hash12(vec2(col, seg)));
      float w = 0.12 + 0.18 * hash12(vec2(seg, col + 3.0));
      float stroke = smoothstep(w, w - 0.05, abs(x + 0.15 * sin(seg * 3.0 + q.y * 4.0))) * smoothstep(0.5, 0.2, abs(fract((q.y + 3.0) / 0.22 + hash11(col) * 5.0) - 0.5));
      return on * stroke * (0.5 + 0.5 * fbm(q * vec2(4.0, 30.0), 2)) * step(abs(q.x), HALF.x - 0.25) * step(abs(q.y), HALF.y - 0.2);
    }
    float footprints(vec2 q) {
      float f = 0.0;
      for (int k = 0; k < 16; k++) {
        float fk = float(k);
        if (fk >= steps) break;
        vec2 c = vec2(-1.9 + fk * 0.26, -0.55 + (mod(fk, 2.0) < 0.5 ? -0.09 : 0.09));
        vec2 d = (q - c) * rot2(-0.2);
        f = max(f, smoothstep(1.0, 0.8, length(d / vec2(0.045, 0.095))));
        for (int j = 0; j < 4; j++) f = max(f, smoothstep(0.02, 0.012, length(q - c - vec2(-0.03 + float(j) * 0.02, 0.12))));
      }
      return f;
    }
    vec3 embers(vec3 ro, vec3 rd, float tMax) {
      vec3 col = vec3(0.0);
      // a steady stream up from the burning front
      for (int i = 0; i < 70; i++) {
        float fi = float(i);
        float life = 2.5 + 2.0 * hash11(fi);
        float ph = fract(t / life + hash11(fi + 1.0));
        float a = hash11(fi + 2.0) * TAU;
        vec2 base = vec2(cos(a), sin(a)) * HALF * (1.0 - burn * 0.55);
        vec3 p = vec3(base.x + sin(ph * 6.0 + fi) * 0.2, base.y + ph * 2.8, 0.1 + 0.6 * (hash11(fi + 3.0) - 0.5) + ph * 0.4);
        float tt = dot(p - ro, rd);
        if (tt < 0.0 || tt > tMax) continue;
        float d = length(ro + rd * tt - p);
        float r = 0.006 + 0.008 * hash11(fi + 4.0);
        col += mix(C_EMBER * 3.0, C_SIGNAL, ph) * smoothstep(r, 0.0, d) * (1.0 - ph) * fire;
      }
      // bursts on the kicks
      for (int k = 0; k < ${MAXK}; k++) {
        float age = t - kicks[k];
        if (age < 0.0 || age > 1.8) continue;
        for (int i = 0; i < 24; i++) {
          float fi = float(i) + kicks[k] * 13.0;
          float a = hash11(fi) * TAU;
          vec2 base = vec2(cos(a), sin(a)) * HALF * (1.0 - burn * 0.55);
          vec3 v = vec3(cos(a) * 0.6, 1.2 + hash11(fi + 1.0) * 1.5, 0.4 + 0.8 * hash11(fi + 2.0));
          vec3 p = vec3(base, 0.0) + v * age + vec3(0.0, 0.3, 0.0) * age * age;
          float tt = dot(p - ro, rd);
          if (tt < 0.0 || tt > tMax) continue;
          float d = length(ro + rd * tt - p);
          col += C_EMBER * 3.5 * smoothstep(0.012, 0.0, d) * exp(-age * 1.8);
        }
      }
      return col;
    }
    vec3 back(vec3 rd) {
      vec3 c = room(rd) * 0.5;
      c += C_BLOOD * 0.08 * fire * smoothstep(0.4, -0.6, rd.y);
      c += C_SIGNAL * 0.02 * fire * fbm(vec3(rd.xy * 3.0, t * 0.3) + vec3(0.0, -t * 0.4, 0.0), 3);
      return c;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      vec3 col = back(rd);
      float tMax = 1e3;
      // the sheet: a plane at z = 0 with a fire ripple (normals only; the ripple is small)
      float tp = -ro.z / rd.z;
      if (tp > 0.0) {
        vec3 P = ro + rd * tp;
        vec2 q = P.xy;
        if (abs(q.x) < HALF.x && abs(q.y) < HALF.y) {
          float b = burnF(q);
          if (b > 0.0) {
            vec2 e = vec2(0.01, 0.0);
            vec3 N = normalize(vec3(-(wave(q + e.xy) - wave(q - e.xy)) / 0.02, -(wave(q + e.yx) - wave(q - e.yx)) / 0.02, 1.0));
            if (dot(N, rd) > 0.0) N = -N;
            float fib = 0.92 + 0.06 * fbm(q * vec2(8.0, 25.0), 3);
            vec3 paper = C_BONE * fib;
            paper = mix(paper, C_INK, brush(q) * 0.55);
            paper = mix(paper, C_INK, footprints(q) * 0.9);
            // light: the fire's glow from the burning edges, a dim key from the front
            float glow = exp(-b * 3.0);
            vec3 lit = C_BONE * 0.22 * (0.5 + 0.5 * dot(N, normalize(vec3(0.3, 0.5, 1.0)))) + C_SIGNAL * glow * 0.3 * fire;
            vec3 c = paper * lit * 2.0;
            // char: brown-black band before the front, then the glowing front
            c = mix(c, C_INK * 0.3 + C_BLOOD * 0.05, smoothstep(0.22, 0.04, b));
            c += (C_EMBER * 4.0 * smoothstep(0.035, 0.0, b) + C_SIGNAL * 1.5 * smoothstep(0.08, 0.0, b)) * (0.7 + 0.3 * snoise(vec3(q * 8.0, t * 3.0)));
            col = c;
            tMax = tp;
          } else {
            // just burnt through: sparks hanging on the edge of the hole
            col += C_EMBER * 1.2 * smoothstep(-0.05, 0.0, b) * (0.5 + 0.5 * snoise(vec3(q * 12.0, t * 4.0)));
          }
        }
      }
      return col + embers(ro, rd, tMax);
    }`, { burn: { value: 0 }, steps: { value: 0 }, fire: { value: 0 }, kicks: { value: new Array(MAXK).fill(-99) } });

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = (this.ctx.params.lines as number[]).map((i) => lyrics.lines[i]!);
    this.kicks = audio.events('kick', this.ctx.start, this.ctx.end).map((e) => e[0]);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.D = audio.downbeats.filter((d) => d >= this.ctx.start - 0.05 && d < this.ctx.end);
    this.cups = cupTimes(lyrics);
    this.slams = new Slams(this.lines, 0.55);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const [, l21] = this.lines as [Line, Line, Line];
    let burn = 0;
    this.D.forEach((d) => { burn += prog(t, d, d + 0.6, ease.outCubic); });
    burn = 0.5 * burn / Math.max(1, this.D.length);
    const d = Math.max(drunk(lyrics, t), 0.7);
    const [, , sr] = sway(d, t);
    const kick = pulseAt(this.kicks, t, 0.12);
    const u = this.pass.u;
    u.t!.value = t; u.burn!.value = burn; u.fire!.value = smoothstep(this.ctx.start - 0.5, this.ctx.start + 1, t);
    u.steps!.value = t < l21.words[0]!.start - 0.05 ? 0 : this.beats.filter((b) => b >= l21.words[0]!.start - 0.05 && b <= t).length;
    const kv = u.kicks!.value as number[];
    const past = this.kicks.filter((k) => k <= t).slice(-MAXK);
    for (let j = 0; j < MAXK; j++) kv[j] = past[j] ?? -99;
    // camera: square on to the sheet, a slow push in, drunk roll and drift, shaken on the kicks
    const k0 = t - this.ctx.start;
    const push = lerp(5.4, 4.2, smoothstep(this.ctx.start, this.ctx.end, t));
    const pos = v3(Math.sin(k0 * 0.3) * 0.8, 0.2 + Math.sin(k0 * 0.45) * 0.25, push).add(shake3(kick, t, 0.05));
    this.cam.set(pos, v3(0, 0.05, 0), sr * 1.2, 42);
    this.pass.render(renderer, out);
    this.slams.update(t, v3(0, -0.55, 0), this.cam, 2);
    renderMeshes(renderer, this.slams.scene, this.cam, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'X · CHÁY', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    void lastAt;
    return { bloom: 1.0, bloomThreshold: 0.6, halation: 0.45, vignette: 0.5, zoom: 1 + kick * 0.015, ca: 1 + kick * 1.5 };
  }
}
