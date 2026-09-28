// "Mở" (intro, 0 → the first line). 3D, ray-marched: a lake of wine at night, a moon behind the mist.
// The camera hangs low over the still surface. A single drop of wine falls through the moonlight and
// hits on a downbeat: rings race out across the lake (the drop's ripples, then one on every kick after
// it), the title Túy Âm rises out of the glare; the credits; the ledger opens; the camera lifts and
// tilts down toward the surface for the first line.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { ease, keys, prog, pulse, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, label, lastAt } from './_kit';
import { Cam3, rayPass, v3 } from './_3d';

const MAXR = 6;

export default class Mo extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  pass = rayPass(this.cam, /* glsl */ `
    uniform vec4 drops[${MAXR}];   // xz, t0, amplitude
    uniform vec3 dropPos; uniform float dropOn, moonI;
    const vec3 MOON = normalize(vec3(-0.25, 0.22, -1.0));
    float waves(vec2 p) {
      float h = 0.0;
      for (int i = 0; i < ${MAXR}; i++) {
        vec4 d = drops[i];
        float age = t - d.z;
        if (age <= 0.0 || d.w <= 0.0) continue;
        float r = length(p - d.xy);
        float front = age * 1.6;
        float env = smoothstep(front + 0.05, front - 0.4, r) * exp(-age * 0.55) * exp(-r * 0.35);
        h += d.w * sin(r * 22.0 - age * 34.0) * env;
      }
      h += 0.0025 * snoise(vec3(p * 1.4, t * 0.25)) + 0.0012 * snoise(vec3(p * 5.0, t * 0.6));
      return h;
    }
    vec3 sky(vec3 rd) {
      float h = max(rd.y, 0.0);
      vec3 c = mix(C_INK2 * 1.5 + C_BLOOD * 0.04, C_INK * 0.6, smoothstep(0.0, 0.5, h));
      float m = max(dot(rd, MOON), 0.0);
      c += C_BONE * (pow(m, 3000.0) * 4.0 + pow(m, 60.0) * 0.1 + pow(m, 6.0) * 0.03) * moonI;
      // mist band on the horizon
      c = mix(c, C_ASH * 0.12, exp(-abs(rd.y) * 14.0) * 0.8);
      return c;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      vec3 col = sky(rd);
      float tHit = 1e9;
      if (rd.y < 0.0) {
        tHit = -ro.y / rd.y;
        vec3 P = ro + rd * tHit;
        float e = 0.01;
        float h0 = waves(P.xz);
        vec3 N = normalize(vec3(-(waves(P.xz + vec2(e, 0.0)) - h0) / e, 1.0, -(waves(P.xz + vec2(0.0, e)) - h0) / e));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, -rd), 0.0), 5.0);
        vec3 refl = sky(reflect(rd, N));
        vec3 body = mix(C_BLOOD * 0.12, C_SIGNAL * 0.05, 0.5 + 0.5 * N.x);
        vec3 c = mix(body, refl, fres);
        // moonlight glitter on the ripples
        c += C_BONE * pow(max(dot(reflect(rd, N), MOON), 0.0), 400.0) * 1.2 * moonI;
        float fog = 1.0 - exp(-tHit * 0.09);
        col = mix(c, sky(vec3(rd.x, 0.0, rd.z)) , fog);
      }
      // the falling drop: a glowing amber bead
      if (dropOn > 0.0) {
        vec3 oc = ro - dropPos;
        float b = dot(oc, rd), cc = dot(oc, oc) - 0.0009;
        float disc = b * b - cc;
        float tt = -b - sqrt(max(disc, 0.0));
        if (disc > 0.0 && tt < tHit) {
          vec3 N = normalize(ro + rd * tt - dropPos);
          col = C_SIGNAL * 0.6 + C_EMBER * pow(max(dot(N, -rd), 0.0), 3.0) * 2.5 + C_BONE * pow(max(dot(reflect(rd, N), MOON), 0.0), 60.0) * 4.0;
        }
        float glow = exp(-length(cross(rd, dropPos - ro)) * 60.0);
        col += C_EMBER * glow * 0.4 * dropOn;
      }
      return col;
    }`, { drops: { value: Array.from({ length: MAXR }, () => new THREE.Vector4()) }, dropPos: { value: v3() }, dropOn: { value: 0 }, moonI: { value: 1 } });
  D: number[] = [];
  kicks: number[] = [];
  cups: number[] = [];

  override init() {
    const { audio, lyrics } = this.ctx;
    this.D = audio.downbeats.filter((d) => d < this.ctx.end + 0.1);
    this.kicks = beatsIn(audio, 0, this.ctx.end).filter((_, i) => i % 2 === 0);
    this.cups = cupTimes(lyrics);
  }
  private d(i: number) { return this.D[i] ?? i * 1.6; }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, D = (i: number) => this.d(i);
    const land = D(2);
    // camera: low over the lake, a slow drift, lifting in the last bars
    const lift = prog(t, D(8), this.ctx.end, ease.inOutCubic);
    const cp = v3(Math.sin(t * 0.07) * 0.3, keys(t, [[0, 0.22], [land, 0.26], [D(8), 0.34], [this.ctx.end, 1.1, ease.inOutCubic]]), 2.6 - t * 0.03);
    const tg = v3(0, keys(t, [[0, 0.12], [land, 0.02], [this.ctx.end, -0.6, ease.inOutCubic]]), -1.5 + lift * 1.2);
    this.cam.set(cp, tg, Math.sin(t * 0.3) * 0.01, 38);
    const u = this.pass.u;
    u.t!.value = t;
    // ripples: the drop's, then small ones on the beats after it
    const rip = [[0, -0.2, land, 0.02]];
    for (const k of this.kicks.filter((k) => k > land + 1 && k <= t).slice(-4)) rip.push([Math.sin(k * 3.1) * 1.2, -0.8 + Math.cos(k * 1.7) * 0.8, k, 0.006]);
    (u.drops!.value as THREE.Vector4[]).forEach((v, i) => { const r = rip[i]; if (r) v.set(r[0]!, r[1]!, r[2]!, r[3]!); else v.set(0, 0, 0, 0); });
    const fall = prog(t, land - 1.1, land, ease.inQuad);
    (u.dropPos!.value as THREE.Vector3).set(0, 1.6 - 1.6 * fall, -0.2);
    u.dropOn!.value = t < land ? smoothstep(land - 1.4, land - 1.1, t) : 0;
    u.moonI!.value = smoothstep(0, 1.5, t);
    this.pass.render(renderer, out);
    // the title rises out of the glare; credits; the ledger
    const L = this.layer; L.clear();
    const c = L.ctx;
    const ta = smoothstep(land + 0.1, land + 1.4, t) * (1 - smoothstep(D(8), D(9) + 0.5, t));
    if (ta > 0) {
      c.save();
      c.globalAlpha = ta;
      c.font = font(F.serif(600, true), 230); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('ember', 0.25);
      for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) c.fillText('Túy Âm', 960 + dx!, 430 + dy! + (1 - ta) * 30);
      c.fillStyle = rgba('bone', 0.96);
      c.fillText('Túy Âm', 960, 430 + (1 - ta) * 30);
      const cred = 'XESI × MASEW × NHATNGUYEN';
      const ck = prog(t, D(4), D(4) + 1.2);
      label(c, cred.slice(0, Math.ceil(cred.length * ck)), 960, 510, { size: 20, color: rgba('bone', 0.75), align: 'center', spacing: 8 });
      label(c, 'MỘT ĐÊM SAY', 960, 548, { size: 14, color: rgba('ash', 0.6 * smoothstep(D(5), D(5) + 0.5, t)), align: 'center', spacing: 6 });
      c.restore();
    }
    drawCups(c, W - 110, 150, t, this.cups, { alpha: smoothstep(D(6), D(6) + 0.4, t) });
    this.ctx.comp.draw(renderer, L.upload(), out);
    const hit = pulse(t, land, 0.12);
    void lastAt;
    return { bloom: 0.9, bloomThreshold: 0.7, halation: 0.35, vignette: 0.5, flash: hit * 0.02, zoom: 1 + hit * 0.012, fade: 1 - smoothstep(0, 1.2, t) };
  }
}
