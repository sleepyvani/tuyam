// "Gần" (lines 7–9). 3D, volumetric: night over a lacquer floor. Two columns of ink smoke stand in
// for the two of them, no figures: anh on the left in bone, em on the right in amber, each a slow
// twisting plume rising out of the floor. Through line 7 they draw closer on each beat, and between
// them a small amber light (the heart) beats with the kick drum, brighter as they near. Through line 8,
// from its "tan", em's plume comes apart: it thins, lifts and drifts off as embers; the heart dims.
// Line 9: anh's plume alone, the camera moving away; the line is set large and quiet.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';
import { Cam3, GLSL_ROOM, rayPass, v3 } from './_3d';

export default class Gan extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  pass = rayPass(this.cam, /* glsl */ `
    ${GLSL_ROOM}
    uniform float gap, gone, heart, kick;
    const float FLOOR = -1.2;
    // a twisting plume of ink smoke rising from the floor at x = cx
    float plume(vec3 p, float cx, float seed, float thin) {
      float y = p.y - FLOOR;
      vec2 c = vec2(cx + 0.12 * sin(y * 1.7 + t * 0.6 + seed) + 0.05 * sin(y * 4.3 - t + seed), 0.06 * cos(y * 1.3 + t * 0.5 + seed));
      float r = length(p.xz - c);
      float w = (0.16 + 0.06 * sin(y * 2.1 + seed)) * (1.0 - 0.3 * smoothstep(1.5, 3.2, y));
      float n = fbm(vec3(p.x * 3.0, y * 2.5 - t * 0.7, p.z * 3.0 + seed), 2);
      float d = smoothstep(w * (1.2 + thin * 2.0), w * 0.2, r + 0.12 * n) * smoothstep(0.0, 0.25, y) * smoothstep(3.4, 2.2, y);
      return d * (1.0 - thin);
    }
    // em's plume coming apart: lifted, spread, drifting to the right
    float drift(vec3 p, float cx) {
      if (gone <= 0.0) return 0.0;
      vec3 q = p - vec3(cx + gone * 0.9, FLOOR + 1.2 + gone * 1.1, 0.0);
      float n = snoise(q * 1.8 + vec3(-t * 0.2, -t * 0.4, 0.0));
      float d = smoothstep(0.8 * (0.5 + gone), 0.0, length(q * vec3(1.0, 0.6, 1.3)) + 0.4 * n);
      return d * sin(gone * PI) * 0.18;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      vec3 col = room(rd) * 0.8;
      float tf = rd.y < 0.0 ? (FLOOR - ro.y) / rd.y : 1e9;
      vec3 H = vec3(0.0, 0.1, 0.0);
      if (tf < 1e8) {
        vec3 P = ro + rd * tf;
        vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
        float fres = 0.04 + 0.96 * pow(1.0 - abs(rd.y), 5.0);
        col = C_INK * 0.15 + room(rr) * (0.2 + 0.6 * fres);
        // the heart's light on the floor, and the columns' glow
        col += C_SIGNAL * heart * 0.25 * exp(-dot(P.xz - H.xz, P.xz - H.xz) * 2.0);
        col = mix(col, room(rd) * 0.3, 1.0 - exp(-tf * 0.08));
      }
      // volume march through the two plumes
      float xa = -gap * 0.5, xb = gap * 0.5;
      // march only inside the box around the plumes
      vec3 bmin = vec3(-gap * 0.5 - 0.6, FLOOR, -0.6), bmax = vec3(gap * 0.5 + 0.6 + gone * 1.8, FLOOR + 3.6, 0.6);
      vec3 inv = 1.0 / rd;
      vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
      vec3 tn = min(t0, t1), tx = max(t0, t1);
      float tIn = max(max(tn.x, tn.y), max(tn.z, 0.0)), tOut = min(min(tx.x, tx.y), tx.z);
      tOut = min(tOut, tf);
      float stepL = max((tOut - tIn) / 40.0, 0.03);
      float tt = tIn + stepL * hash12(px + fract(t));
      vec3 acc = vec3(0.0); float T = 1.0;
      for (int i = 0; i < 40; i++) {
        if (tt > tOut || T < 0.02) break;
        vec3 p = ro + rd * tt;
        float da = plume(p, xa, 1.0, 0.0);
        float db = plume(p, xb, 7.0, gone) + drift(p, xb);
        float den = da + db;
        if (den > 0.001) {
          // light: the heart between them, a cool key from above-left
          vec3 hp = H - p; float hr = dot(hp, hp);
          vec3 lit = C_SIGNAL * heart * (0.6 + 1.2 * kick) / (0.2 + hr * 4.0) + C_BONE * 0.08;
          vec3 ca = C_BONE * (0.5 + 0.5 * smoothstep(0.0, 0.6, da)) * 0.35;
          vec3 cb = mix(C_SIGNAL, C_EMBER, 0.3) * 0.55;
          vec3 c = (ca * da + cb * db) / den;
          float a = 1.0 - exp(-den * stepL * 9.0);
          acc += T * a * (c * 0.6 + c * lit * 2.0);
          T *= 1.0 - a;
        }
        tt += stepL;
      }
      col = col * T + acc;
      // the heart itself: a small core and glow
      vec3 oc = H - ro; float th = dot(oc, rd);
      if (th > 0.0) {
        float dd = length(ro + rd * th - H);
        float r = (0.03 + 0.03 * kick) * heart;
        col += (C_EMBER * 3.0 * smoothstep(r, r * 0.3, dd) + C_SIGNAL * heart * (0.25 + 0.4 * kick) / (1.0 + dd * dd * 400.0)) * heart;
      }
      return col;
    }`, { gap: { value: 2 }, gone: { value: 0 }, heart: { value: 0 }, kick: { value: 0 } });
  lines: Line[] = [];
  beats: number[] = [];
  kicks: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.lines = [7, 8, 9].map((i) => lyrics.lines[i]!);
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.kicks = audio.events('kick', this.ctx.start - 1, this.ctx.end + 1).map((e) => e[0]);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const [l7, l8, l9] = this.lines as [Line, Line, Line];
    const nb = this.beats.filter((b) => b >= l7.words[0]!.start - 0.1 && b <= t && b < l8.words[0]!.start).length;
    const gap = lerp(2.2, 0.62, ease.outCubic(Math.min(1, nb / 12)));
    const tTan = (l8.words.find((w) => w.w === 'tan') ?? l8.words[3]!).start;
    const gone = prog(t, tTan, l8.end, ease.inOutCubic);
    const heart = (1 - gone) * smoothstep(l7.words[0]!.start - 0.3, l7.words[0]!.start + 0.3, t);
    const kick = pulseAt(this.kicks, t, 0.14);
    const u = this.pass.u;
    u.t!.value = t; u.gap!.value = gap; u.gone!.value = gone; u.heart!.value = heart * (1 + (2.2 - gap) * 0.4); u.kick!.value = kick;
    // camera: close and low between them, then (line 9) pulling back and up, left alone with anh
    const alone = prog(t, l9.words[0]!.start - 0.5, this.ctx.end, ease.inOutCubic);
    const a = Math.sin((t - this.ctx.start) * 0.12) * 0.25;
    const dist = lerp(3.6, 5.2, alone);
    const pos = v3(Math.sin(a) * dist - alone * 0.6, lerp(0.35, 1.0, alone), Math.cos(a) * dist);
    this.cam.set(pos, v3(-alone * 0.4, lerp(0.35, 0.6, alone), 0), Math.sin(t * 0.7) * 0.015, 42);
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    const cur = currentLine(this.lines, t);
    if (cur) {
      const quiet = cur === l9;
      karaoke(c, cur.words, 960, quiet ? 990 : 980, t, { family: F.serif(quiet ? 400 : 600, quiet), size: quiet ? 78 : 64, unsung: rgba('bone', 0.16), sung: rgba('bone', 0.95) }, 1700);
    }
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'VI · GẦN', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, drunk(lyrics, t), t);
    return { bloom: 0.9, bloomThreshold: 0.65, halation: 0.35, vignette: 0.5, zoom: 1 + kick * 0.008 };
  }
}
