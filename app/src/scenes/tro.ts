// "Tro" (the last chorus, lines 23–26, unplugged: no drums). 3D, ray-marched: after the fire, the land
// is ash, low grey dunes with embers still breathing in their cracks, flakes of ash falling through the
// air. The road of the earlier choruses comes back as two faint chalk lines on the ash, and the two
// lights walk it again as two dying embers; on "rời" the road forks and they part; the horizon gets its
// jade once more, very faint, on "ngát"; on the last "cháy" the words glow once and everything dims.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label } from './_kit';
import { Cam3, GLSL_RAY, rayPass, v3 } from './_3d';

const SPEED = 0.7;
const rx = (s: number) => 1.6 * Math.sin(s * 0.15) + 0.6 * Math.sin(s * 0.37 + 1.0);

export default class Tro extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  lines: Line[] = [];
  beats: number[] = [];
  cups: number[] = [];
  pass = rayPass(this.cam, /* glsl */ `
    ${GLSL_RAY}
    uniform float fork, sFork, jade, dim;
    uniform vec3 orbA, orbB;
    float rx(float s) { return 1.6 * sin(s * 0.15) + 0.6 * sin(s * 0.37 + 1.0); }
    float branch(float s) { return fork * max(s - sFork, 0.0) * 0.32; }
    float roadD(vec2 xs) { float c = rx(xs.y), b = branch(xs.y); return min(abs(xs.x - c - b), abs(xs.x - c + b)); }
    float land(vec2 xs) {
      float h = 0.35 * fbm(xs * 0.25, 4) + 0.12 * fbm(xs * 1.1 + 4.0, 3);
      h += 0.9 * smoothstep(2.0, 10.0, abs(xs.x - rx(xs.y)));
      return mix(-0.02, h, smoothstep(0.5, 2.0, roadD(xs)));
    }
    vec3 skyC(vec3 rd) {
      vec3 c = mix(C_GRAPHITE * 0.12, C_INK * 0.25, smoothstep(-0.05, 0.5, rd.y));
      c += C_JADE * jade * 0.35 * exp(-abs(rd.y) * 10.0) * exp(-abs(rd.x) * 1.5);
      return c;
    }
    vec3 orbLight(vec3 P, vec3 N, vec3 o) { vec3 d = o - P; return C_SIGNAL * dim * max(dot(N, normalize(d)), 0.0) / (0.05 + dot(d, d) * 4.0); }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      vec3 col = skyC(rd);
      float tt = 0.1, hit = 0.0;
      for (int i = 0; i < 100; i++) {
        vec3 p = ro + rd * tt;
        float d = p.y - land(vec2(p.x, -p.z));
        if (d < 0.002 * tt) { hit = 1.0; break; }
        tt += max(d * 0.5, 0.01 + tt * 0.01);
        if (tt > 50.0) break;
      }
      if (hit > 0.0) {
        vec3 P = ro + rd * tt;
        vec2 xs = vec2(P.x, -P.z);
        vec2 e = vec2(0.03, 0.0);
        vec3 N = normalize(vec3(land(xs - e.xy) - land(xs + e.xy), 2.0 * e.x, -(land(xs - e.yx) - land(xs + e.yx))));
        float n = fbm(xs * 2.0, 4);
        vec3 c = mix(C_GRAPHITE * 0.16, C_ASH * 0.2, 0.5 + 0.5 * n) * (0.35 + 0.65 * max(dot(N, normalize(vec3(-0.4, 0.8, -0.3))), 0.0));
        // cracks with embers still breathing in them
        float cr = 1.0 - smoothstep(0.0, 0.035, abs(snoise(xs * 1.6 + 3.0)));
        c = mix(c, C_INK * 0.3, cr * 0.7);
        c += C_EMBER * cr * smoothstep(0.55, 0.9, snoise(vec3(xs * 0.8, t * 0.3))) * 0.6 * dim;
        // the road again: two faint chalk lines
        float rdist = roadD(xs);
        c += C_BONE * 0.35 * smoothstep(0.025, 0.0, abs(rdist - 0.45)) * (0.6 + 0.4 * snoise(xs * vec2(3.0, 12.0)));
        c += (orbLight(P, N, orbA) + orbLight(P, N, orbB)) * 0.22;
        col = mix(c, skyC(vec3(rd.x, 0.0, rd.z)), 1.0 - exp(-tt * 0.06));
      }
      float tMax = hit > 0.0 ? tt : 1e3;
      for (int k = 0; k < 2; k++) {
        vec3 o = k == 0 ? orbA : orbB;
        col += (C_EMBER * halo(ro, rd, o, tMax, 6000.0) * 3.0 + C_SIGNAL * halo(ro, rd, o, tMax, 90.0) * 0.25) * dim;
      }
      // ash flakes falling around the camera
      for (int i = 0; i < 60; i++) {
        float fi = float(i);
        vec3 fp = vec3(hash11(fi) * 6.0 - 3.0, 2.5 - mod(t * (0.15 + 0.1 * hash11(fi + 1.0)) + hash11(fi + 2.0) * 3.0, 3.0), -hash11(fi + 3.0) * 6.0);
        fp.x += sin(t * 0.7 + fi) * 0.2;
        fp += vec3(ro.x, ro.y - 1.0, ro.z - 0.5);
        float ft = dot(fp - ro, rd);
        if (ft < 0.0 || ft > tMax) continue;
        float fd = length(ro + rd * ft - fp);
        float glowing = step(0.85, hash11(fi + 5.0));
        col += mix(C_ASH * 0.35, C_EMBER * 2.0 * dim, glowing) * smoothstep(0.012, 0.0, fd) * exp(-ft * 0.25);
      }
      return col;
    }`, { fork: { value: 0 }, sFork: { value: 0 }, jade: { value: 0 }, dim: { value: 1 }, orbA: { value: v3() }, orbB: { value: v3() } });

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = [23, 24, 25, 26].map((i) => lyrics.lines[i]!);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const all = this.lines.flatMap((l) => l.words);
    const last = this.lines[3]!;
    const roi = last.words.find((w) => w.w === 'rời') ?? last.words[2]!;
    const chay = last.words.find((w) => w.w === 'cháy') ?? last.words[last.words.length - 2]!;
    const ngat = all.find((w) => w.w === 'ngát');
    const camS = (t - this.ctx.start) * SPEED;
    const fork = smoothstep(roi.start - 0.2, roi.start + 1.5, t);
    const sFork = (roi.start - this.ctx.start) * SPEED + 2.2;
    const branch = (s: number) => fork * Math.max(s - sFork, 0) * 0.32;
    const dim = 1 - 0.75 * smoothstep(chay.start + 0.5, this.ctx.end, t);
    const orb = (sgn: number) => {
      const s = camS + 2.4 + 0.1 * Math.sin(t + sgn);
      return v3(rx(s) + sgn * (0.2 * (1 - fork) + branch(s)), 0.12 + 0.02 * Math.sin(t * 2 + sgn), -s);
    };
    const u = this.pass.u;
    u.t!.value = t; u.fork!.value = fork; u.sFork!.value = sFork; u.dim!.value = dim;
    u.jade!.value = ngat ? smoothstep(ngat.start - 0.1, ngat.start + 0.4, t) * (1 - smoothstep(ngat.end + 0.3, ngat.end + 2, t)) : 0;
    (u.orbA!.value as THREE.Vector3).copy(orb(-1)); (u.orbB!.value as THREE.Vector3).copy(orb(1));
    const lift = prog(t, chay.start, this.ctx.end, ease.inOutCubic);
    const pos = v3(rx(camS), 0.9 + fork * 0.7 + lift * 0.8, -camS + fork * 1.2);
    const tg = v3(rx(camS + 5), 0.15 - fork * 0.2 - lift * 0.3, -(camS + 5));
    this.cam.set(pos, tg, Math.sin(t * 0.4) * 0.02, 46);
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const cur = currentLine(this.lines, t);
    if (cur) {
      const glow = cur === last ? smoothstep(chay.start - 0.1, chay.start + 0.3, t) * (1 - smoothstep(chay.start + 1.5, this.ctx.end, t)) : 0;
      karaoke(c, cur.words, 960, 250, t, { family: F.serif(600, true), size: 80, unsung: rgba('ash', 0.22), sung: rgba('bone', 0.8), now: glow > 0 ? rgba('ember', 0.6 + 0.4 * glow) : rgba('bone', 0.9), hold: glow > 0 ? 2 : 0.05 }, 1700);
    }
    drawCups(c, W - 110, 1000, t, this.cups, { alpha: 0.6 });
    label(c, 'XI · TRO', 110, 1000, { size: 13, color: rgba('ash', 0.5) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t) * 0.5, t);
    return { bloom: 0.8, bloomThreshold: 0.65, halation: 0.3, vignette: 0.55, grain: 0.07 };
  }
}
