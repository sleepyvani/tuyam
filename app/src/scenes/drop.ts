// "Say" (the first drop: params.lines = [14, 15], sung as chops). 3D, ray-marched: the instrumental
// drop as the drinking itself. Fifteen porcelain cups in a 5 × 3 grid on the black lacquer table, the
// camera circling low and drunk:
//   every downbeat fills the next cup (the wine rises in it)
//   every kick throws a crown and a spray of glowing wine out of one of the cups; the cups jolt
//   every fourth downbeat the cups clink: a ring of light runs out across the lacquer, the camera shakes
//   the chops slam in as huge extruded type over the cups, lit amber while sung
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, measure } from '../engine/type';
import { LIN, rgba } from '../engine/palette';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { ease, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, idxAt, label, lastAt, pulseAt, sway } from './_kit';
import { Cam3, GLSL_CUP, GLSL_RAY, GLSL_ROOM, litMaterial, rayPass, renderMeshes, shake3, textGeometry, v3 } from './_3d';

const NK = 4; // kicks tracked in the shader

/** The wine-and-cups grid, shared by the two drops. */
export function gridPass(cam: Cam3) {
  return rayPass(cam, /* glsl */ `
    ${GLSL_ROOM}
    ${GLSL_RAY}
    ${GLSL_CUP}
    uniform float nb, fillT, clinkT, jolt, burn;
    uniform vec4 kicks[${NK}];          // cell id, t0
    const float CS = 0.55, SP = 1.25;
    const vec3 LAMP = vec3(1.5, 3.0, 2.5);
    float TABLE() { return -(cupD + cupR * 0.12) * CS; }
    vec3 cellOf(vec3 p) { vec2 id = clamp(floor(p.xz / SP + 0.5), vec2(-2.0, -1.0), vec2(2.0, 1.0)); return vec3(id, (id.x + 2.0) + (id.y + 1.0) * 5.0); }
    float levelOf(float id) {
      if (id < nb - 1.0) return -0.06;
      if (id < nb) return mix(-cupD + 0.02, -0.06, smoothstep(0.0, 0.35, t - fillT));
      return -cupD - 0.1;
    }
    float ripOf(float id, vec3 q) {
      float h = 0.0;
      for (int k = 0; k < ${NK}; k++) {
        vec4 kk = kicks[k]; float age = t - kk.y;
        if (kk.x != id || age < 0.0 || age > 2.0) continue;
        float r = length(q.xz);
        h += 0.02 * sin(r * 40.0 - age * 25.0) * exp(-age * 2.0) * smoothstep(age * 0.6 + 0.05, age * 0.6 - 0.1, r);
      }
      return h;
    }
    float crownOf(float id) {
      float c = 0.0;
      for (int k = 0; k < ${NK}; k++) { vec4 kk = kicks[k]; float age = t - kk.y; if (kk.x == id && age > 0.0 && age < 0.6) c = max(c, sin(age / 0.6 * PI) * exp(-age * 2.0)); }
      return c;
    }
    vec2 map(vec3 p) {
      vec2 r = vec2(p.y - TABLE(), 3.0);
      vec3 cell = cellOf(p);
      vec3 q = p; q.xz -= cell.xy * SP;
      // the jolt: every cup hops a little on a kick
      q.y -= jolt * 0.04 * (0.5 + 0.5 * sin(cell.z * 2.7));
      q /= CS;
      float d = sdCup(q) * CS; if (d < r.x) r = vec2(d, 1.0);
      float lv = levelOf(cell.z);
      if (lv > -cupD) {
        float w = sdWine(q, lv + ripOf(cell.z, q)) * CS;
        float cr = crownOf(cell.z);
        if (cr > 0.0) {
          float a = atan(q.z, q.x);
          float hgt = cr * (0.12 + 0.08 * (0.5 + 0.5 * cos(a * 14.0)));
          vec2 qq = vec2(length(q.xz) - 0.12 - 0.12 * (1.0 - cr), q.y - lv - hgt * 0.5);
          w = min(w, (length(max(abs(qq) - vec2(0.012, hgt * 0.5), 0.0)) - 0.008) * CS);
        }
        if (w < r.x) r = vec2(w, 2.0);
      }
      return r;
    }
    vec3 nrm(vec3 p) { vec2 e = vec2(0.0015, 0.0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
    vec3 spray(vec3 ro, vec3 rd, float tMax) {
      vec3 col = vec3(0.0);
      for (int k = 0; k < ${NK}; k++) {
        vec4 kk = kicks[k]; float age = t - kk.y;
        if (age < 0.0 || age > 1.6) continue;
        vec2 id = vec2(mod(kk.x, 5.0) - 2.0, floor(kk.x / 5.0) - 1.0);
        vec3 o = vec3(id.x * SP, -0.03, id.y * SP);
        for (int i = 0; i < 14; i++) {
          float fi = float(i) + kk.y * 7.0;
          float a = hash11(fi) * TAU;
          vec3 v = vec3(cos(a) * (0.4 + 0.6 * hash11(fi + 1.0)), 1.4 + 1.4 * hash11(fi + 2.0), sin(a) * (0.4 + 0.6 * hash11(fi + 1.0)));
          vec3 p = o + v * age + vec3(0.0, -4.0, 0.0) * age * age;
          if (p.y < TABLE()) continue;
          float tt = dot(p - ro, rd);
          if (tt < 0.0 || tt > tMax) continue;
          float dd = length(ro + rd * tt - p);
          float r = 0.012 + 0.012 * hash11(fi + 3.0);
          col += mix(C_SIGNAL * 1.5, C_EMBER * 3.0, hash11(fi + 4.0)) * smoothstep(r, r * 0.2, dd) * exp(-age * 1.2);
        }
      }
      return col;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      float tt = 0.0; vec2 h = vec2(0.0);
      for (int i = 0; i < 100; i++) { h = map(ro + rd * tt); if (h.x < 0.0008 * tt || tt > 30.0) break; tt += h.x * 0.9; }
      vec3 col = room(rd);
      if (tt < 30.0) {
        vec3 P = ro + rd * tt, N = nrm(P), V = -rd;
        vec3 L = normalize(LAMP - P);
        float dif = max(dot(N, L), 0.0);
        vec3 Hh = normalize(L + V);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 refl = room(reflect(rd, N));
        if (h.y < 1.5) {
          vec3 q = P; q.xz -= cellOf(P).xy * SP; q /= CS;
          float band = smoothstep(0.004, 0.0, abs(q.y + 0.045) - 0.006) + smoothstep(0.003, 0.0, abs(q.y + 0.075) - 0.002);
          vec3 glaze = mix(C_BONE, C_INK * 1.5, clamp(band, 0.0, 1.0) * 0.85);
          col = glaze * (0.06 + 0.8 * dif) + C_BONE * pow(max(dot(N, Hh), 0.0), 90.0) * 2.0;
          col = mix(col, refl + C_BONE * 0.04, fres * 0.6);
        } else if (h.y < 2.5) {
          col = mix(C_BLOOD * 0.1, C_SIGNAL * 0.25, 0.35 + 0.65 * dif) + refl * (0.25 + 1.2 * fres) + C_EMBER * pow(max(dot(N, Hh), 0.0), 220.0) * 5.0;
          col += C_SIGNAL * burn * 0.4;
        } else {
          // lacquer: the lanterns mirrored, the clink's ring of light running out
          vec3 rr = reflect(rd, N);
          col = C_INK * 0.2 + room(rr) * (0.3 + 0.6 * fres) + spray(P, rr, 10.0) * 0.4;
          float age = t - clinkT;
          if (age > 0.0 && age < 2.0) {
            float ring = abs(length(P.xz) - age * 5.0);
            col += C_EMBER * smoothstep(0.12, 0.0, ring) * exp(-age * 1.5) * 1.5;
          }
          col += C_SIGNAL * burn * 0.08 * exp(-dot(P.xz, P.xz) * 0.08);
          col = mix(col, room(rd) * 0.4, 1.0 - exp(-tt * 0.05));
        }
      }
      return col + spray(ro, rd, tt);
    }`, {
    cupR: { value: 0.5 }, cupD: { value: 0.42 }, cupTh: { value: 0.022 },
    nb: { value: 0 }, fillT: { value: 0 }, clinkT: { value: -99 }, jolt: { value: 0 }, burn: { value: 0 },
    kicks: { value: Array.from({ length: NK }, () => new THREE.Vector4(-1, -99, 0, 0)) },
  });
}

type Slam = { w: Word; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; x: number; line: number };

/** Huge extruded type for the chops: each word slams in toward the camera on its onset. */
export class Slams {
  scene = new THREE.Scene();
  items: Slam[] = [];
  lines: Line[];
  constructor(lines: Line[], size = 0.62) {
    this.lines = lines;
    const fam = F.serif(600);
    lines.forEach((l, li) => {
      const widths = l.words.map((w) => measure(w.w, fam, 100) * size / 100);
      const gap = size * 0.3;
      let x = -(widths.reduce((a, b) => a + b, 0) + gap * (l.words.length - 1)) / 2;
      l.words.forEach((w, wi) => {
        const mat = litMaterial({ color: LIN.bone as [number, number, number], glow: LIN.ember as [number, number, number], keyDir: v3(0.3, 0.7, 1), transparent: true });
        const mesh = new THREE.Mesh(textGeometry(w.w, fam, size, 0.28), mat);
        this.scene.add(mesh);
        this.items.push({ w, mesh, mat, x: x + widths[wi]! / 2, line: li });
        x += widths[wi]! + gap;
      });
    });
  }
  /** Place the words for time t in front of a camera looking at `focus`. */
  update(t: number, focus: THREE.Vector3, cam: Cam3, liftLine = -1) {
    for (const it of this.items) {
      const l = this.lines[it.line]!;
      const next = this.lines[it.line + 1]?.words[0]!.start ?? Infinity;
      const outT = Math.min(l.end + 2.0, next);
      const a = smoothstep(l.words[0]!.start - 0.15, l.words[0]!.start, t) * (1 - smoothstep(outT - 0.5, outT, t));
      const on = t >= it.w.start - 0.08;
      it.mesh.visible = a > 0.001 && on;
      if (!it.mesh.visible) continue;
      const slam = prog(t, it.w.start - 0.08, it.w.start + 0.12, ease.outCubic);
      const p = Lyrics.wordProgress(it.w, t);
      const hot = t < it.w.end + 0.1 ? 1 : 0;
      // billboarded toward the camera, above the focus
      const c = focus.clone().addScaledVector(cam.U, 0.75).addScaledVector(cam.R, it.x).addScaledVector(cam.F, lerp(-2.5, 0.8, slam) - 0.2 * (1 - a));
      // a lifting line: each word, once sung, rises and drifts off like a burning scrap
      const lift = it.line === liftLine ? Math.max(0, t - it.w.end - 0.1) : 0;
      c.addScaledVector(cam.U, lift * lift * 1.2 + lift * 0.5).addScaledVector(cam.R, lift * (hash(it.x * 10, 3) - 0.3) * 0.6);
      it.mesh.position.copy(c);
      it.mesh.quaternion.copy(cam.three.quaternion);
      it.mesh.rotateZ(lift * (hash(it.x * 10, 4) - 0.5) * 1.2);
      it.mesh.scale.setScalar(lerp(2.4, 1, slam));
      (it.mat.uniforms.base!.value as THREE.Vector3).set(...(LIN.bone as [number, number, number])).multiplyScalar(0.5 + 0.5 * p);
      it.mat.uniforms.emit!.value = Math.max(hot * 0.9, Math.min(1, lift * 3));
      it.mat.uniforms.alpha!.value = a * slam * (1 - smoothstep(0.8, 2.2, lift));
    }
  }
}

export default class Drop extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  pass = gridPass(this.cam);
  slams!: Slams;
  lines: Line[] = [];
  kicks: number[] = [];
  D: number[] = [];
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = (this.ctx.params.lines as number[]).map((i) => lyrics.lines[i]!);
    this.kicks = audio.events('kick', this.ctx.start, this.ctx.end).filter(([, s]) => s > 0.35).map((e) => e[0]);
    this.D = audio.downbeats.filter((d) => d >= this.ctx.start - 0.05 && d < this.ctx.end);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
    this.slams = new Slams(this.lines);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const d = lerp(drunk(lyrics, t), 1, 0.5 * smoothstep(this.ctx.start, this.ctx.end, t));
    const [, , sr] = sway(d, t);
    const kick = pulseAt(this.kicks, t, 0.12);
    const clinks = this.D.filter((_, i) => i % 4 === 3);
    const clink = pulseAt(clinks, t, 0.2);
    const u = this.pass.u;
    u.t!.value = t;
    const ni = idxAt(this.D, t);
    u.nb!.value = Math.min(15, ni + 1); u.fillT!.value = this.D[Math.max(0, ni)] ?? this.ctx.start;
    u.clinkT!.value = lastAt(clinks, t) ?? -99; u.jolt!.value = kick;
    const kv = u.kicks!.value as THREE.Vector4[];
    const past = this.kicks.map((k, i) => [k, i] as const).filter(([k]) => k <= t).slice(-NK);
    for (let j = 0; j < NK; j++) { const e = past[j]; if (e) kv[j]!.set(Math.floor(hash(e[1], 7) * 15), e[0], 0, 0); else kv[j]!.set(-1, -99, 0, 0); }
    // camera: circling low around the grid, closer and drunker as the drop goes on
    const k0 = t - this.ctx.start;
    const a = k0 * 0.22 + 0.4;
    const dist = lerp(5.2, 3.6, smoothstep(this.ctx.start, this.ctx.end, t));
    const pos = v3(Math.sin(a) * dist, 1.1 + 0.3 * Math.sin(k0 * 0.5), Math.cos(a) * dist).add(shake3(clink + kick * 0.3, t, 0.06));
    this.cam.set(pos, v3(0, -0.1, 0), sr * 1.4, 44);
    this.pass.render(renderer, out);
    this.slams.update(t, v3(0, -0.1, 0), this.cam);
    renderMeshes(renderer, this.slams.scene, this.cam, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    drawCups(c, W - 110, 1000, t, this.cups);
    label(c, 'IX · SAY', 110, 1000, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    return { bloom: 0.9, bloomThreshold: 0.65, halation: 0.4, vignette: 0.5, zoom: 1 + kick * 0.015, flash: pulse(t, this.ctx.start, 0.15) * 0.02, ca: 1 + clink * 2.5 };
  }
}
