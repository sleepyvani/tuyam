// "Hãy say" (lines 5–6). 3D: night. The three invitations of line 5 stand as three rows of extruded
// type in the dark over a lacquer floor, the camera slowly circling them; each word lights as it is sung
// (amber while sung). Each row has its own treatment:
//   row 1 — it sees double: a ghost copy drifts off it
//   row 2 — the letters bounce on the voice
//   row 3 — the letters run: drops of ink fall from them
// Line 6: the rows fly back into the dark, two porcelain cups (ray-marched) swing in from the sides and
// clink in the middle on its last word, sparks burst from the rims; the ledger ticks.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, measure } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { ease, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';
import { Cam3, GLSL_CUP, GLSL_RAY, GLSL_ROOM, litMaterial, rayPass, renderMeshes, shake3, textGeometry, v3 } from './_3d';

const SIZE = 0.5;         // type size, world units
const ROWY = [0.8, 0.02, -0.76];
const DRIPS = 36;

type WordMesh = { w: Word; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; x: number; row: number; ghost?: THREE.Mesh; gmat?: THREE.ShaderMaterial };

export default class HaySay extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  scene3 = new THREE.Scene();
  L!: Line; them!: Line;
  rows: Word[][] = [];
  words: WordMesh[] = [];
  drips: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; x: number; t0: number; v: number }[] = [];
  beats: number[] = [];
  cups: number[] = [];
  pass = rayPass(this.cam, /* glsl */ `
    ${GLSL_ROOM}
    ${GLSL_RAY}
    ${GLSL_CUP}
    uniform vec4 cupA, cupB;           // xyz centre of the rim, w tilt (radians about z)
    uniform float cupsOn, clinkT;
    const float CS = 0.55;             // cup scale
    const vec3 LAMP = vec3(0.5, 2.5, 3.0);
    const float FLOOR = -1.55;
    vec3 toCup(vec3 p, vec4 c) { vec3 q = p - c.xyz; float s = sin(-c.w), co = cos(-c.w); q.xy = mat2(co, -s, s, co) * q.xy; return q / CS; }
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y - FLOOR, 3.0);
      if (cupsOn > 0.0) {
        float slosh = step(clinkT, t) * exp(-max(t - clinkT, 0.0) * 1.5);
        for (int i = 0; i < 2; i++) {
          vec4 c = i == 0 ? cupA : cupB;
          vec3 q = toCup(p, c);
          float d = sdCup(q) * CS; if (d < r.x) r = vec2(d, 1.0);
          float w = sdWine(q, -0.06 + 0.012 * sin(q.x * 18.0 + t * 7.0) * slosh) * CS;
          if (w < r.x) r = vec2(w, 2.0);
        }
      }
      return r;
    }
    vec3 nrm(vec3 p) { vec2 e = vec2(0.0015, 0.0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
    vec3 sparks(vec3 ro, vec3 rd, float tMax) {
      vec3 col = vec3(0.0);
      float age = t - clinkT;
      if (age < 0.0 || age > 2.5) return col;
      vec3 o = (cupA.xyz + cupB.xyz) * 0.5 + vec3(0.0, 0.02, 0.0);
      for (int i = 0; i < 48; i++) {
        float fi = float(i);
        vec3 v = normalize(vec3(sin(fi * 2.4), 0.6 + 0.8 * fract(fi * 0.61), cos(fi * 1.7) * 0.8)) * (1.2 + 1.6 * fract(fi * 0.37));
        vec3 p = o + v * age + vec3(0.0, -2.2, 0.0) * age * age;
        float tt = dot(p - ro, rd);
        if (tt < 0.0 || tt > tMax) continue;
        float d = length(ro + rd * tt - p);
        float r = 0.006 + 0.01 * fract(fi * 0.53);
        vec3 c = fract(fi * 0.5) < 0.5 ? C_EMBER * 3.0 : C_SIGNAL * 1.2;
        col += c * smoothstep(r, 0.0, d) * exp(-age * 1.4);
      }
      return col;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      float tt = 0.0; vec2 h = vec2(0.0);
      for (int i = 0; i < 90; i++) { h = map(ro + rd * tt); if (h.x < 0.0008 * tt || tt > 30.0) break; tt += h.x * 0.9; }
      vec3 col = room(rd);
      if (tt < 30.0) {
        vec3 P = ro + rd * tt, N = nrm(P), V = -rd;
        vec3 L = normalize(LAMP - P);
        float dif = max(dot(N, L), 0.0);
        vec3 Hh = normalize(L + V);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 refl = room(reflect(rd, N));
        if (h.y < 1.5) {
          vec3 q = toCup(P, P.x < 0.0 ? cupA : cupB);
          float band = smoothstep(0.004, 0.0, abs(q.y + 0.045) - 0.006) + smoothstep(0.003, 0.0, abs(q.y + 0.075) - 0.002);
          vec3 glaze = mix(C_BONE, C_INK * 1.5, clamp(band, 0.0, 1.0) * 0.85);
          col = glaze * (0.06 + 0.8 * dif) + C_BONE * pow(max(dot(N, Hh), 0.0), 90.0) * 2.0;
          col = mix(col, refl + C_BONE * 0.04, fres * 0.6);
        } else if (h.y < 2.5) {
          col = mix(C_BLOOD * 0.1, C_SIGNAL * 0.22, 0.35 + 0.65 * dif) + refl * (0.25 + 1.2 * fres) + C_EMBER * pow(max(dot(N, Hh), 0.0), 220.0) * 5.0;
        } else {
          // lacquer floor: mirror of the lanterns, a pool of light under the type
          vec3 rr = reflect(rd, N);
          col = C_INK * 0.2 + C_SIGNAL * 0.05 * exp(-dot(P.xz, P.xz) * 0.15) + room(rr) * (0.3 + 0.6 * fres);
          col = mix(col, room(rd) * 0.4, 1.0 - exp(-tt * 0.06));
        }
      }
      return col + sparks(ro, rd, tt);
    }`, {
    cupR: { value: 0.5 }, cupD: { value: 0.42 }, cupTh: { value: 0.022 },
    cupA: { value: new THREE.Vector4(-9, 0, 0, 0) }, cupB: { value: new THREE.Vector4(9, 0, 0, 0) }, cupsOn: { value: 0 }, clinkT: { value: 999 },
  });

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[5]!;
    this.them = lyrics.lines[6]!;
    const ws = this.L.words;
    this.rows = [ws.slice(0, 4), ws.slice(4, 8), ws.slice(8, 12)];
    const fam = F.serif(600);
    const bone = LIN.bone as [number, number, number], ember = LIN.ember as [number, number, number];
    const k = SIZE / 100;
    this.rows.forEach((row, ri) => {
      const widths = row.map((w) => measure(w.w, fam, 100) * k);
      const gap = SIZE * 0.32;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
      let x = -total / 2;
      row.forEach((w, wi) => {
        const geo = textGeometry(w.w, fam, SIZE, 0.16);
        const mat = litMaterial({ color: bone, glow: ember, keyDir: v3(0.3, 0.6, 1), fogColor: [0, 0, 0], fogDensity: 0.05, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        const cx = x + widths[wi]! / 2;
        mesh.position.set(cx, ROWY[ri]!, 0);
        this.scene3.add(mesh);
        const wm: WordMesh = { w, mesh, mat, x: cx, row: ri };
        if (ri === 0) {
          const gmat = litMaterial({ color: bone, glow: ember, keyDir: v3(0.3, 0.6, 1), transparent: true });
          gmat.depthWrite = false;
          const ghost = new THREE.Mesh(geo, gmat);
          this.scene3.add(ghost);
          wm.ghost = ghost; wm.gmat = gmat;
        }
        this.words.push(wm);
        x += widths[wi]! + gap;
      });
    });
    // ink drops for row 3: small stretched spheres falling from the letters
    const row3 = this.words.filter((w) => w.row === 2);
    const sph = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < DRIPS; i++) {
      const src = row3[Math.floor(hash(i, 1) * row3.length)]!;
      const mat = litMaterial({ color: [0.5, 0.45, 0.4], glow: ember, keyDir: v3(0.3, 0.6, 1), transparent: true });
      const mesh = new THREE.Mesh(sph, mat);
      this.scene3.add(mesh);
      this.drips.push({ mesh, mat, x: src.x + (hash(i, 2) - 0.5) * 0.5, t0: src.w.start + 0.1 + hash(i, 3) * 1.4, v: 0.5 + hash(i, 4) * 0.9 });
    }
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics, audio } = this.ctx;
    const t = f.t;
    const tw = this.them.words;
    const tThem = tw[0]!.start, tClink = tw[tw.length - 1]!.start;
    const rowsOut = prog(t, tThem - 0.3, tThem + 0.6, ease.inCubic);
    const d = drunk(lyrics, t);
    const kick = pulseAt(this.beats, t, 0.1);
    const clink = pulse(t, tClink, 0.15);
    // camera: a slow arc in front of the rows, drifting with the drink; pulled in for the clink
    const a = Math.sin((t - this.ctx.start) * 0.35) * 0.3 + Math.sin(t * 0.9) * 0.05 * d;
    const dist = lerp(5.0, 3.2, smoothstep(tThem - 0.4, tClink, t));
    const pos = v3(Math.sin(a) * dist, 0.35 + 0.1 * Math.sin(t * 0.6), Math.cos(a) * dist).add(shake3(clink, t, 0.04));
    this.cam.set(pos, v3(0, lerp(0.0, 0.1, rowsOut), 0), Math.sin(t * 1.1) * 0.03 * (0.4 + d), 40);
    const u = this.pass.u;
    u.t!.value = t;
    const meet = prog(t, tThem - 0.35, tClink, ease.inCubic);
    const off = lerp(3.2, 0.3, meet);
    const tilt = -0.3 * meet + clink * 0.08;
    (u.cupA!.value as THREE.Vector4).set(-off, 0.12 + Math.sin(t * 2) * 0.03, 0.4, -tilt);
    (u.cupB!.value as THREE.Vector4).set(off, 0.12 + Math.cos(t * 2) * 0.03, 0.4, tilt);
    u.cupsOn!.value = t > tThem - 0.5 ? 1 : 0;
    u.clinkT!.value = tClink;
    this.pass.render(renderer, out);
    // the words
    for (const wm of this.words) {
      const { w, mesh, mat } = wm;
      const r0 = this.rows[wm.row]![0]!;
      const on = smoothstep(r0.start - 0.5, r0.start - 0.1, t);
      const p = Lyrics.wordProgress(w, t);
      const hot = t >= w.start && t < w.end + 0.08 ? 1 : 0;
      const sungK = t >= w.start ? 0.35 + 0.65 * p : 0;
      (mat.uniforms.base!.value as THREE.Vector3).set(...(LIN.bone as [number, number, number])).multiplyScalar(lerp(0.08, 0.95, sungK));
      mat.uniforms.emit!.value = hot * 0.85;
      mat.uniforms.alpha!.value = on * (1 - rowsOut);
      let y = ROWY[wm.row]!, rx = 0;
      const z = -rowsOut * 6 - (1 - on) * 1.5;
      if (wm.row === 1 && t >= w.start - 0.1) {
        const v = audio.env('vocal', t);
        y += Math.sin(t * 9 + wm.x * 3) * 0.07 * v; rx = Math.sin(t * 7 + wm.x) * 0.25 * v;
      }
      mesh.position.set(wm.x, y, z);
      mesh.rotation.set(rx, Math.sin(t * 0.5 + wm.x) * 0.05, 0);
      mesh.visible = on * (1 - rowsOut) > 0.001;
      if (wm.ghost && wm.gmat) {
        const g = smoothstep(this.rows[0]![1]!.start, this.rows[0]![1]!.start + 0.6, t);
        wm.ghost.position.set(wm.x + Math.sin(t * 1.7) * 0.22 * g, y - 0.04 * g, z - 0.1 * g);
        wm.ghost.rotation.copy(mesh.rotation);
        (wm.gmat.uniforms.base!.value as THREE.Vector3).copy(mat.uniforms.base!.value as THREE.Vector3);
        wm.gmat.uniforms.emit!.value = mat.uniforms.emit!.value;
        wm.gmat.uniforms.alpha!.value = 0.3 * g * on * (1 - rowsOut);
        wm.ghost.visible = g > 0.001 && mesh.visible;
      }
    }
    for (const dr of this.drips) {
      const age = t - dr.t0;
      if (age <= 0 || rowsOut >= 1) { dr.mesh.visible = false; continue; }
      dr.mesh.visible = true;
      const fall = Math.min(2.6, 0.5 * 3.2 * age * age * dr.v);
      dr.mesh.position.set(dr.x, ROWY[2]! - 0.03 - fall, 0.05 - rowsOut * 6);
      const sc = 0.02 + 0.012 * dr.v;
      dr.mesh.scale.set(sc, sc * (1 + Math.min(3, age * 4)), sc);
      dr.mat.uniforms.alpha!.value = (1 - smoothstep(1.8, 2.6, fall)) * (1 - rowsOut);
    }
    renderMeshes(renderer, this.scene3, this.cam, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    if (t > tThem - 0.4) {
      c.save(); c.globalAlpha = smoothstep(tThem - 0.4, tThem, t);
      karaoke(c, tw, 960, 900, t, { family: F.serif(600, true), size: 100, unsung: rgba('bone', 0.14), sung: rgba('bone', 0.95) });
      c.restore();
    }
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'V · HÃY SAY', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    return { bloom: 0.8, bloomThreshold: 0.7, halation: 0.35, vignette: 0.5, zoom: 1 + kick * 0.008 + clink * 0.02, flash: clink * 0.02, ca: 1 + clink * 2 };
  }
}
