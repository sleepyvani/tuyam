// "Năm tháng" (line 3). 3D, ray-traced: a paper handscroll unrolls along the black lacquer table, the
// roll travelling ahead of the words, the camera gliding low beside it. Each word is brushed onto the
// paper as it is sung (lit amber while sung), then sinks to a ghost; tally marks count the years along
// the lower margin; on "kiếm" a paper lantern comes down over the scroll and swings along it, a pool of
// warm light searching the faded words, dust turning in its beam.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { rgba } from '../engine/palette';
import { Lyrics, type Line } from '../engine/lyrics';
import { ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, label, pulseAt } from './_kit';
import { Cam3, GLSL_RAY, GLSL_ROOM, canvasTex, rayPass, v3 } from './_3d';

const PXU = 400;          // texture px per world unit
const TH = 440;           // scroll height, px
const GAP = 80;
const LEFT = 260;         // paper before the first word, px
const MAXW = 16;

export default class NamThang extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  L!: Line;
  xs: number[] = []; ws: number[] = [];
  texW = 0;
  beats: number[] = [];
  cups: number[] = [];
  pass!: ReturnType<typeof rayPass>;

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[3]!;
    let x = LEFT;
    const sizes: number[] = [];
    this.L.words.forEach((w, i) => {
      const size = 150 + 24 * hash(i, 1);
      sizes.push(size);
      const wd = measure(w.w, F.serif(600), size);
      this.xs.push(x); this.ws.push(wd);
      x += wd + GAP;
    });
    this.texW = Math.ceil(x + 400);
    // R: the words, G: tally marks, B: the mounting border
    const tex = canvasTex(this.texW, TH, (c) => {
      c.globalCompositeOperation = 'lighter';
      c.textBaseline = 'alphabetic';
      this.L.words.forEach((w, i) => { c.font = font(F.serif(600), sizes[i]!); c.fillStyle = '#f00'; c.fillText(w.w, this.xs[i]!, 290); });
      c.strokeStyle = '#0f0'; c.lineWidth = 3;
      for (let i = 0; i * 16 < this.texW - 200; i++) {
        const tx = 120 + i * 16 + Math.floor(i / 5) * 14;
        c.beginPath();
        if (i % 5 === 4) { c.moveTo(tx - 70, 392); c.lineTo(tx + 4, 366); } else { c.moveTo(tx, 360); c.lineTo(tx + 3, 400); }
        c.stroke();
      }
      c.strokeStyle = '#00f'; c.lineWidth = 2;
      c.strokeRect(40, 26, this.texW - 80, TH - 52);
      c.lineWidth = 1; c.strokeRect(52, 38, this.texW - 104, TH - 76);
    });
    const len = this.texW / PXU, hz = TH / PXU / 2;
    void len;
    this.pass = rayPass(this.cam, /* glsl */ `
      ${GLSL_ROOM}
      ${GLSL_RAY}
      uniform sampler2D tex; uniform float unroll, tally, lanOn; uniform vec3 lan;
      uniform vec4 wd[${MAXW}]; uniform float hot[${MAXW}];
      const float HZ = ${hz.toFixed(4)}, PXU = ${PXU.toFixed(1)}, TW = ${this.texW.toFixed(1)}, THP = ${TH.toFixed(1)};
      const float ROLL = 0.075;
      const vec3 KEY = vec3(-1.2, 2.2, 1.6);
      vec3 texAt(vec2 tp) { return texture(tex, vec2(tp.x / TW, 1.0 - tp.y / THP)).rgb; }
      // ink of the words at texture px tp: each word wiped on left to right, then faded to a ghost
      vec2 inkAt(vec2 tp, float m) {
        float a = 0.0, h = 0.0;
        for (int i = 0; i < ${MAXW}; i++) {
          vec4 w = wd[i];
          if (w.y <= w.x || tp.x < w.x - 30.0 || tp.x > w.y + 30.0) continue;
          float span = w.y - w.x + 40.0;
          float wipe = smoothstep(w.x + span * w.z, w.x + span * w.z - 30.0, tp.x);
          a = max(a, m * wipe * mix(0.95, 0.12, w.w));
          h = max(h, m * wipe * hot[i]);
        }
        return vec2(a, h);
      }
      vec3 lightAt(vec3 P, vec3 N) {
        vec3 L = normalize(KEY - P);
        vec3 c = C_BONE * 0.2 * max(dot(N, L), 0.0) + C_INK2 * 0.25;
        if (lanOn > 0.0) {
          vec3 d = lan - P; float r2 = dot(d, d);
          c += C_EMBER * lanOn * 0.4 * max(dot(N, normalize(d)), 0.0) / (0.1 + r2 * 4.0);
        }
        return c;
      }
      vec3 paperCol(vec3 P, vec3 N) {
        vec2 tp = vec2((P.x + 1.0) * PXU, (P.z + HZ) * PXU);
        vec3 m = texAt(tp);
        float fib = 0.93 + 0.05 * fbm(P.xz * vec2(9.0, 30.0), 3);
        vec3 paper = mix(C_BONE, C_ASH, 0.12) * fib;
        paper = mix(paper, C_BLOOD * 0.6, m.b * 0.55);
        paper = mix(paper, C_INK, m.g * 0.45 * step(tp.x, tally));
        vec2 ik = inkAt(tp, m.r);
        paper = mix(paper, C_INK, ik.x);
        return paper * lightAt(P, N) * 2.4 + C_SIGNAL * ik.y * 1.4;
      }
      vec3 fogged(vec3 c, float tt, vec3 rd) { return mix(c, room(rd) * 0.5, 1.0 - exp(-tt * 0.08)); }
      vec3 shade(vec3 ro, vec3 rd, vec2 px) {
        float best = 1e9; vec3 col = room(rd);
        if (rd.y < 0.0) {
          // the table (y = 0): black lacquer mirror, the paper's shadow at its edges
          float tt = -ro.y / rd.y; vec3 P = ro + rd * tt;
          vec3 N = normalize(vec3(0.004 * snoise(P.xz * 3.0), 1.0, 0.004 * snoise(P.xz * 3.0 + 7.0)));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, -rd), 0.0), 5.0);
          vec3 rr = reflect(rd, N);
          vec3 refl = room(rr);
          if (lanOn > 0.0) refl += C_EMBER * lanOn * 2.0 * pow(halo(P, rr, lan, 10.0, 900.0), 2.0);
          col = C_INK * 0.25 + lightAt(P, N) * 0.08 + refl * (0.2 + 0.6 * fres);
          float along = step(-1.0, P.x) * step(P.x, unroll);
          col *= 1.0 - 0.5 * along * smoothstep(0.08, 0.0, abs(P.z) - HZ) * step(HZ, abs(P.z));
          col = fogged(col, tt, rd);
          best = tt;
          // the paper, lying just above the table
          float tp = (0.004 - ro.y) / rd.y;
          vec3 Q = ro + rd * tp;
          if (Q.x > -1.0 && Q.x < unroll && abs(Q.z) < HZ) {
            vec3 Np = normalize(vec3(-0.03 * cos(Q.x * 5.0 + 1.0), 1.0, -0.02 * cos(Q.z * 8.0)));
            col = paperCol(Q, Np);
            col += C_BONE * pow(max(dot(reflect(rd, Np), normalize(KEY - Q)), 0.0), 30.0) * 0.04;
            col = fogged(col, tp, rd);
            best = tp;
          }
        }
        // the roll: a cylinder along z at x = unroll, its end discs
        {
          vec2 o = ro.xy - vec2(unroll, ROLL); vec2 d = rd.xy;
          float a = dot(d, d), b = dot(o, d), q = dot(o, o) - ROLL * ROLL, h = b * b - a * q;
          if (h > 0.0) {
            float tt = (-b - sqrt(h)) / a;
            vec3 P = ro + rd * tt;
            if (tt > 0.0 && tt < best && abs(P.z) < HZ) {
              vec3 N = normalize(vec3(P.xy - vec2(unroll, ROLL), 0.0));
              float ang = atan(N.y, N.x);
              vec3 pc = mix(C_BONE, C_ASH, 0.25) * (0.88 + 0.12 * sin(ang * 3.0 + unroll * 20.0)) * lightAt(P, N) * 2.4;
              col = fogged(pc, tt, rd); best = tt;
            }
          }
          // end discs: the spiral of paper layers
          for (int s = 0; s < 2; s++) {
            float zc = s == 0 ? HZ : -HZ;
            float tt = (zc - ro.z) / rd.z;
            vec3 P = ro + rd * tt;
            vec2 e = P.xy - vec2(unroll, ROLL);
            float r = length(e);
            if (tt > 0.0 && tt < best && r < ROLL) {
              float spiral = 0.5 + 0.5 * sin(r * 260.0 - atan(e.y, e.x));
              vec3 N = vec3(0.0, 0.0, sign(zc));
              col = fogged(mix(C_ASH * 0.6, C_BONE, spiral) * lightAt(P, N) * 2.2, tt, rd); best = tt;
            }
          }
        }
        // the lantern: a glowing ribbed paper globe on a cord, dust turning in its light
        if (lanOn > 0.0) {
          float tl = rSphere(ro, rd, lan, 0.09);
          if (tl > 0.0 && tl < best) {
            vec3 P = ro + rd * tl, N = normalize(P - lan);
            float rib = 0.75 + 0.25 * smoothstep(0.0, 0.2, abs(fract(P.y * 45.0) - 0.5));
            col = mix(C_SIGNAL, C_EMBER, pow(max(dot(N, -rd), 0.0), 2.0)) * 3.2 * rib * lanOn;
            best = tl;
          }
          col += C_EMBER * lanOn * 0.35 * halo(ro, rd, lan, best, 60.0);
          // the cord: a thin vertical line above the globe
          vec2 cd = ro.xz - lan.xz; vec2 dd = rd.xz;
          float tc = -dot(cd, dd) / max(dot(dd, dd), 1e-6);
          vec3 Pc = ro + rd * tc;
          if (tc > 0.0 && tc < best && Pc.y > lan.y + 0.08 && length(Pc.xz - lan.xz) < 0.003) col = C_INK * 0.4;
          for (int i = 0; i < 28; i++) {
            float fi = float(i);
            vec3 mp = lan + vec3(sin(fi * 7.1 + t * 0.3) * 0.35, -0.1 - fract(fi * 0.37 + t * 0.02) * 0.45, cos(fi * 3.7 + t * 0.21) * 0.3);
            float tt = dot(mp - ro, rd);
            if (tt < 0.0 || tt > best) continue;
            float dd2 = length(ro + rd * tt - mp);
            float fall = 1.0 / (1.0 + dot(mp - lan, mp - lan) * 12.0);
            col += C_EMBER * lanOn * fall * 0.9 * smoothstep(0.004, 0.0, dd2);
          }
        }
        return col;
      }`, {
      tex: { value: tex }, unroll: { value: 0 }, tally: { value: 0 }, lanOn: { value: 0 }, lan: { value: v3() },
      wd: { value: Array.from({ length: MAXW }, () => new THREE.Vector4()) }, hot: { value: new Array(MAXW).fill(0) },
    });
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const ws = this.L.words, n = ws.length;
    const wx = (px: number) => px / PXU - 1; // texture px → world x
    const ci = (i: number) => Math.max(0, Math.min(n - 1, i));
    let cur = 0;
    ws.forEach((w, i) => { if (w.start - 0.15 <= t) cur = i; });
    const w0 = ws[cur]!;
    const cx = (i: number) => wx(this.xs[ci(i)]! + this.ws[ci(i)]! / 2);
    const camX = lerp(cx(cur - 1), cx(cur), prog(t, w0.start - 0.25, w0.start + 0.3, ease.inOutCubic));
    const u = this.pass.u;
    // the roll leads the words by a little more than one word; it opens from nothing at the start
    const endOf = (i: number) => wx(this.xs[ci(i)]! + this.ws[ci(i)]! + 140);
    const lead = lerp(endOf(cur), endOf(cur + 1), prog(t, w0.start, w0.end + 0.2, ease.inOutCubic));
    u.unroll!.value = lerp(-1, lead, smoothstep(this.ctx.start - 0.2, this.ctx.start + 0.9, t));
    u.tally!.value = (t - this.ctx.start) * 260 + 100;
    const wd = u.wd!.value as THREE.Vector4[], hot = u.hot!.value as number[];
    ws.forEach((w, i) => {
      if (i >= MAXW) return;
      const p = t < w.start - 0.05 ? 0 : Lyrics.wordProgress(w, t);
      wd[i]!.set(this.xs[i]!, this.xs[i]! + this.ws[i]!, p, smoothstep(w.end + 0.6, w.end + 2.6, t));
      hot[i] = t >= w.start && t < w.end + 0.05 ? 1 : 0;
    });
    const kiem = ws.find((w) => w.w === 'kiếm') ?? ws[n - 2]!;
    const la = smoothstep(kiem.start - 0.4, kiem.start + 0.2, t);
    u.lanOn!.value = la;
    const sw = t - kiem.start;
    (u.lan!.value as THREE.Vector3).set(camX - 0.5 + Math.sin(sw * 1.3) * 0.7, lerp(1.4, 0.42, ease.outCubic(la)) + Math.cos(sw * 2.6) * 0.03, Math.sin(sw * 0.9) * 0.12 - 0.05);
    const d = drunk(lyrics, t);
    const pos = v3(camX - 0.75 + Math.sin(t * 0.4) * 0.05, 0.62 + Math.sin(t * 0.7) * 0.03 * (1 + d), 1.25);
    const tg = v3(camX + 0.15, 0.02, -0.05);
    this.cam.set(pos, tg, Math.sin(t * 0.9) * 0.02 * (1 + 2 * d) - 0.03, 40);
    u.t!.value = t;
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'III · NĂM THÁNG', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.8, bloomThreshold: 0.7, halation: 0.35, vignette: 0.5, zoom: 1 + kick * 0.005 };
  }
}
