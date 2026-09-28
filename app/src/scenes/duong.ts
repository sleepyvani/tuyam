// "Đường" (the first two choruses: params.lines = [10..13] / [16..19], n = 1 | 2). 3D, ray-marched:
// a road of pale dry ink winding over dark hills at night, the camera following two amber lights that
// walk it together, each lighting a pool of the road around it.
//   line 1 — they walk on
//   line 2 — the road runs out ahead of them (it stops short of the horizon); on "ngát" the horizon
//            glows jade for a moment, the green day they hoped for
//   line 3 — on "thăng" the land rises and falls in hills under the road; on "ngả" the world tilts,
//            one way then the other
//   line 4 — on "rời" the road forks; the lights take separate branches; on "cháy" an amber flare
// The second pass (n = 2) is drunker, the road is stained with wine, and lanterns on posts line it,
// pulsing on the beat.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line, Word } from '../engine/lyrics';
import { ease, lerp, prog, pulse, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label, pulseAt, sway } from './_kit';
import { Cam3, GLSL_RAY, rayPass, v3 } from './_3d';

const SPEED = 1.25;          // world units per second along the road
const rx = (s: number) => 1.6 * Math.sin(s * 0.15) + 0.6 * Math.sin(s * 0.37 + 1.0);

export default class Duong extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  lines: Line[] = [];
  n = 1;
  beats: number[] = [];
  cups: number[] = [];
  w: Record<string, Word> = {};
  pass = rayPass(this.cam, /* glsl */ `
    ${GLSL_RAY}
    uniform float hills, sEnd, jade, fork, sFork, flare, lant, kick, stain;
    uniform vec3 orbA, orbB;
    float rx(float s) { return 1.6 * sin(s * 0.15) + 0.6 * sin(s * 0.37 + 1.0); }
    float roadH(float s) { return hills * 0.45 * sin(s * 0.55); }
    float branch(float s) { return fork * max(s - sFork, 0.0) * 0.32; }
    // distance (lateral) to the nearest road branch at forward distance s
    float roadD(vec2 xs) {
      float s = xs.y, c = rx(s), b = branch(s);
      return min(abs(xs.x - c - b), abs(xs.x - c + b));
    }
    float land(vec2 xs) {
      float s = xs.y;
      float h = 0.9 * fbm(xs * 0.18, 4) + 0.5 + hills * 0.6 * sin(s * 0.55 + xs.x * 0.2);
      h += 1.8 * smoothstep(3.0, 12.0, abs(xs.x - rx(s)));
      // after the fork, a low meadow between the branches
      float b = branch(s);
      h = mix(h, roadH(s) + 0.05 + 0.12 * fbm(xs * 0.8, 2), smoothstep(b + 0.3, b - 0.4, abs(xs.x - rx(s))) * step(0.01, b));
      float rd = roadD(xs);
      return mix(roadH(s) - 0.02, h, smoothstep(0.55, 2.2, rd));
    }
    vec3 skyC(vec3 rd) {
      vec3 c = mix(C_BLOOD * 0.05 + C_INK2 * 0.5, C_INK * 0.3, smoothstep(-0.05, 0.4, rd.y));
      // stars: one per cell at most, a round dot at a random spot in the cell
      vec2 sp = vec2(atan(rd.x, -rd.z), rd.y) * 140.0;
      vec2 cell = floor(sp), jit = hash22(cell);
      float st = step(0.93, hash12(cell + 3.1)) * smoothstep(0.08, 0.0, length(fract(sp) - jit) - 0.02) * smoothstep(0.03, 0.2, rd.y);
      c += C_BONE * st * 0.35 * (0.6 + 0.4 * sin(t * 3.0 + hash12(cell) * 40.0));
      c += C_JADE * jade * 1.4 * exp(-abs(rd.y) * 9.0) * exp(-abs(rd.x) * 1.5);
      c += C_EMBER * flare * 0.6 * exp(-abs(rd.y) * 5.0);
      return c;
    }
    vec3 orbLight(vec3 P, vec3 N, vec3 o) {
      vec3 d = o - P; float r2 = dot(d, d);
      return C_SIGNAL * max(dot(N, normalize(d)), 0.0) / (0.05 + r2 * 3.0);
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      // world: x lateral, y up, s = -z forward
      vec3 col = skyC(rd);
      float tt = 0.1, hit = 0.0;
      for (int i = 0; i < 110; i++) {
        vec3 p = ro + rd * tt;
        float d = p.y - land(vec2(p.x, -p.z));
        if (d < 0.002 * tt) { hit = 1.0; break; }
        tt += max(d * 0.5, 0.01 + tt * 0.01);
        if (tt > 60.0) break;
      }
      if (hit > 0.0) {
        vec3 P = ro + rd * tt;
        vec2 xs = vec2(P.x, -P.z);
        vec2 e = vec2(0.03, 0.0);
        vec3 N = normalize(vec3(land(xs - e.xy) - land(xs + e.xy), 2.0 * e.x, -(land(xs - e.yx) - land(xs + e.yx))));
        // hills: dark ink, a faint moonlit rim
        vec3 c = C_INK2 * (0.35 + 0.4 * fbm(xs * 1.5, 3)) + C_ASH * 0.05 * max(N.x * 0.6 + N.y * 0.3, 0.0);
        // the road: pale dry ink, broken lanes, fading at the far end
        float rdist = roadD(xs);
        float on = smoothstep(0.5, 0.42, rdist) * smoothstep(sEnd, sEnd - 3.0, xs.y);
        if (on > 0.0) {
          float lane = fract((xs.x - rx(xs.y)) * 9.0);
          float dry = smoothstep(0.1, 0.5, snoise(vec2(lane * 3.0 + floor((xs.x - rx(xs.y)) * 9.0) * 7.0, xs.y * 1.2)));
          vec3 road = mix(C_ASH * 0.3, C_BONE * 0.42, 0.35 + 0.35 * dry) * (0.7 + 0.3 * fbm(xs * vec2(6.0, 1.0), 2));
          road = mix(road, C_BLOOD * 0.5, stain * smoothstep(0.2, 0.7, fbm(xs * 0.7, 3)));
          float edge = smoothstep(0.03, 0.0, abs(rdist - 0.45));
          road += C_BONE * edge * 0.4;
          c = mix(c, road, on);
        }
        vec3 lit = orbLight(P, N, orbA) + orbLight(P, N, orbB) + C_BONE * 0.04;
        c *= 0.35 + lit * 2.0;
        c += C_JADE * jade * 0.05;
        float fog = 1.0 - exp(-tt * 0.045);
        col = mix(c, skyC(vec3(rd.x, 0.0, rd.z)) * 0.8 + C_INK2 * 0.1, fog);
      }
      float tMax = hit > 0.0 ? tt : 1e3;
      // the two lights
      for (int k = 0; k < 2; k++) {
        vec3 o = k == 0 ? orbA : orbB;
        float g = halo(ro, rd, o, tMax, 4000.0), g2 = halo(ro, rd, o, tMax, 60.0);
        col += C_EMBER * g * 4.0 + C_SIGNAL * g2 * 0.35;
      }
      // lanterns on posts (second pass)
      if (lant > 0.0) {
        float s0 = floor(-ro.z / 3.0) * 3.0;
        for (int i = 1; i < 12; i++) {
          float s = s0 + float(i) * 3.0;
          if (s > sEnd) break;
          for (int side = 0; side < 2; side++) {
            float sg = side == 0 ? -1.0 : 1.0;
            vec3 lp = vec3(rx(s) + sg * (0.75 + branch(s)), roadH(s) + 0.55, -s);
            float g = halo(ro, rd, lp, tMax, 9000.0);
            col += (C_EMBER * g * (2.0 + 3.0 * kick) + C_SIGNAL * halo(ro, rd, lp, tMax, 300.0) * 0.1 * (1.0 + kick)) * lant;
          }
        }
      }
      return col;
    }`, {
    hills: { value: 0 }, sEnd: { value: 1e3 }, jade: { value: 0 }, fork: { value: 0 }, sFork: { value: 0 }, flare: { value: 0 },
    lant: { value: 0 }, kick: { value: 0 }, stain: { value: 0 }, orbA: { value: v3() }, orbB: { value: v3() },
  });

  override init() {
    const { lyrics, audio } = this.ctx;
    this.n = this.ctx.params.n ?? 1;
    this.lines = (this.ctx.params.lines as number[]).map((i) => lyrics.lines[i]!);
    const [a, b, c, d] = this.lines as [Line, Line, Line, Line];
    const find = (l: Line, s: string, nth = 0) => l.words.filter((x) => x.w.toLowerCase() === s)[nth]!;
    this.w = {
      ngat: find(b, 'ngát'), thang: find(c, 'thăng'), nga: find(c, 'ngả'), roi: find(d, 'rời'), chay: find(d, 'cháy'), start: a.words[0]!,
    };
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const W_ = this.w;
    const d = Math.max(drunk(lyrics, t), this.n === 2 ? 0.35 : 0);
    const [sx, sy, sr] = sway(d, t);
    const kick = pulseAt(this.beats, t, 0.15);
    const [, l11] = this.lines as [Line, Line];
    const camS = (t - this.ctx.start) * SPEED;
    const hills = smoothstep(W_.thang!.start - 0.2, W_.thang!.start + 0.8, t);
    const roadH = (s: number) => hills * 0.45 * Math.sin(s * 0.55);
    const fork = smoothstep(W_.roi!.start - 0.2, W_.roi!.start + 1.2, t);
    const sFork = (W_.roi!.start - this.ctx.start) * SPEED + 2.5;
    const branch = (s: number) => fork * Math.max(s - sFork, 0) * 0.32;
    // the road runs out: its far end closes in during line 2
    const endIn = prog(t, l11.words[5]!.start, l11.words[l11.words.length - 1]!.end, ease.inOutCubic);
    const sEnd = lerp(camS + 60, camS + 9, endIn);
    // the two lights, walking ahead of the camera; apart on the branches after the fork
    const orb = (sgn: number) => {
      const s = camS + 2.6 + 0.2 * Math.sin(t * 2 + sgn);
      const x = rx(s) + sgn * (0.22 * (1 - fork) + branch(s));
      return v3(x, roadH(s) + 0.16 + 0.03 * Math.sin(t * 3 + sgn), -s);
    };
    const u = this.pass.u;
    u.t!.value = t; u.hills!.value = hills; u.sEnd!.value = sEnd; u.fork!.value = fork; u.sFork!.value = sFork;
    u.jade!.value = smoothstep(W_.ngat!.start - 0.1, W_.ngat!.start + 0.3, t) * (1 - smoothstep(W_.ngat!.end + 0.3, W_.ngat!.end + 1.8, t));
    u.flare!.value = pulse(t, W_.chay!.start, 0.35);
    u.lant!.value = this.n === 2 ? 1 : 0; u.kick!.value = kick; u.stain!.value = this.n === 2 ? 0.6 : 0;
    (u.orbA!.value as THREE.Vector3).copy(orb(-1)); (u.orbB!.value as THREE.Vector3).copy(orb(1));
    // camera: behind and above the lights; tilting on "ngả"; drunk sway
    const tilt = smoothstep(W_.nga!.start - 0.1, W_.nga!.start + 0.4, t) * (1 - smoothstep(W_.roi!.start - 0.5, W_.roi!.start, t)) * Math.sin((t - W_.nga!.start) * 2.2) * 0.18;
    const pos = v3(rx(camS) + sx * 0.002, roadH(camS) + 0.75 + fork * 1.1 + sy * 0.002, -camS + fork * 1.5);
    const tg = v3(rx(camS + 5), roadH(camS + 5) + 0.25 - fork * 0.3, -(camS + 5));
    this.cam.set(pos, tg, sr + tilt, 48);
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const cur = currentLine(this.lines, t);
    if (cur) karaoke(c, cur.words, 960, cur.words.length > 12 ? 250 : 200, t, { family: F.serif(600), size: 64, unsung: rgba('bone', 0.16), sung: rgba('bone', 0.95) }, 1700);
    drawCups(c, W - 110, 1000, t, this.cups);
    label(c, this.n === 2 ? 'VIII · ĐƯỜNG (II)' : 'VII · ĐƯỜNG', 110, 1000, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    return { bloom: 0.9, bloomThreshold: 0.65, halation: 0.4, vignette: 0.5, zoom: 1 + kick * 0.008, ca: 1 + d };
  }
}
