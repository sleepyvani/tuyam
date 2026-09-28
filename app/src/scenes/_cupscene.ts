// The cup scene, shared by the plates that pour into, cry into and drink from the cup (ly, le, the
// drop, the end): a porcelain cup on a black lacquer table, lit by a lantern, paper lanterns out of
// focus behind; wine with rings and a crown when a drop lands; a pouring stream; overflow rivulets and
// a pool; a tear; and the view from inside the wine. Ray-marched (see _3d.ts rayPass).
import * as THREE from 'three';
import { Cam3, GLSL_CUP, rayPass, v3 } from './_3d';

export function cupPass(cam: Cam3) {
  return rayPass(cam, /* glsl */ `
    ${GLSL_CUP}
    uniform float level, pour, spill, under, ripT0, crown, tilt; uniform vec3 tearPos; uniform float tearOn;
    const vec3 LAMP = vec3(1.4, 1.5, 1.2);
    // mat: 1 porcelain, 2 wine, 3 table, 4 stream, 5 film/pool
    vec2 map(vec3 p) {
      vec2 r = vec2(sdCup(p), 1.0);
      // the wine, with rings from a drop (ripT0) on its surface
      float rr = length(p.xz), age = t - ripT0;
      float rip = (age > 0.0 && age < 3.0) ? 0.012 * sin(rr * 55.0 - age * 26.0) * exp(-age * 1.1) * smoothstep(age * 0.5 + 0.05, age * 0.5 - 0.1, rr) : 0.0;
      float w = sdWine(p, level + rip);
      // the crown thrown up by the drop: a thin ring of spikes rising and falling
      if (crown > 0.0) {
        float a = atan(p.z, p.x);
        float spikes = 0.5 + 0.5 * cos(a * 18.0);
        float hgt = crown * (0.05 + 0.035 * spikes);
        vec2 q = vec2(length(p.xz) - 0.05 - 0.08 * (1.0 - crown), p.y - level - hgt * 0.5);
        float ring = length(max(abs(q) - vec2(0.008 + 0.006 * crown, hgt * 0.5), 0.0)) - 0.006;
        w = min(w, ring);
      }
      if (w < r.x) r = vec2(w, 2.0);
      float tb = p.y + cupD + cupR * 0.12;
      if (tb < r.x) r = vec2(tb, 3.0);
      if (pour > 0.0) {
        vec3 q = p; q.x += 0.012 * sin(p.y * 9.0 + t * 12.0);
        float s = max(length(q.xz - vec2(0.05, 0.0)) - 0.016 * pour, max(p.y - 3.0, level - p.y));
        if (s < r.x) r = vec2(s, 4.0);
      }
      if (spill > 0.0) {
        // film on the outside of the bowl and a pool on the table
        float Rs = (cupR * cupR + cupD * cupD) / (2.0 * cupD);
        vec3 c = vec3(0.0, Rs - cupD, 0.0);
        float film = max(abs(length(p - c) - Rs - cupTh * 0.5 - 0.004) - 0.004, max(p.y, -cupD * spill - p.y));
        // rivulets: narrow runs of wine down the outside, each reaching its own length
        float ang = atan(p.z, p.x);
        float cell = floor(ang * 14.0 / 6.2832);
        float reach = cupD * spill * (0.45 + 0.55 * fract(sin(cell * 12.9898) * 43758.5453));
        float taper = smoothstep(-reach, -reach * 0.5, p.y);            // 0 at the tip, 1 near the rim
        float width = 0.012 + 0.035 * taper;
        float lane = abs(fract(ang * 14.0 / 6.2832) - 0.5) - width;
        film = max(film, max(lane * 0.25, -reach - p.y));
        float edge = cupR * 0.45 + 0.45 * spill + 0.08 * snoise(vec2(ang * 2.0, 5.0)) * spill;
        float pool = max(length(p.xz) - edge, abs(p.y + cupD + cupR * 0.12 - 0.002) - 0.002);
        float fp = min(film, pool);
        if (fp < r.x) r = vec2(fp, 5.0);
      }
      if (tearOn > 0.0) {
        vec3 q = p - tearPos;
        float d = length(q * vec3(1.0, 0.75, 1.0)) - 0.035;
        if (d < r.x) r = vec2(d, 6.0);
      }
      return r;
    }
    vec3 nrm(vec3 p) { vec2 e = vec2(0.0015, 0.0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
    vec3 room(vec3 rd) {
      vec3 c = C_INK * 0.6 + C_BLOOD * 0.03 * max(rd.y + 0.3, 0.0);
      // out-of-focus paper lanterns
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        vec3 d = normalize(vec3(sin(fi * 2.3 + 0.4) * 2.0, 0.25 + 0.35 * sin(fi * 1.7), -1.4 + cos(fi * 1.3)));
        float a = max(dot(rd, d), 0.0);
        c += C_SIGNAL * smoothstep(0.99935, 0.9996, a) * 0.9 + C_EMBER * pow(a, 1200.0) * 0.3;
      }
      for (int i = 0; i < 16; i++) {
        float fi = float(i) + 20.0;
        vec3 d = normalize(vec3(sin(fi * 2.9) * 2.4, 0.1 + 0.5 * fract(fi * 0.37), -1.2 + cos(fi * 1.9) * 0.9));
        float a = max(dot(rd, d), 0.0);
        c += mix(C_SIGNAL, C_EMBER, fract(fi * 0.53)) * smoothstep(0.99975, 0.99985, a) * 0.5;
      }
      return c;
    }
    float soft(vec3 ro, vec3 rd) {
      float res = 1.0, tt = 0.02;
      for (int i = 0; i < 24; i++) { float h = map(ro + rd * tt).x; res = min(res, 10.0 * h / tt); tt += clamp(h, 0.01, 0.2); if (res < 0.01 || tt > 3.0) break; }
      return clamp(res, 0.0, 1.0);
    }
    vec3 surface(vec3 ro, vec3 rd) {
      float tt = 0.0; vec2 h = vec2(0.0);
      for (int i = 0; i < 110; i++) { h = map(ro + rd * tt); if (h.x < 0.0008 * tt || tt > 12.0) break; tt += h.x * 0.9; }
      if (tt > 12.0) return room(rd);
      vec3 P = ro + rd * tt, N = nrm(P), V = -rd;
      vec3 L = normalize(LAMP - P);
      float sh = soft(P + N * 0.004, L);
      float dif = max(dot(N, L), 0.0) * sh;
      vec3 Hh = normalize(L + V);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 refl = room(reflect(rd, N));
      vec3 col;
      if (h.y < 1.5) {        // porcelain: bone glaze, a blue-free warm white, sharp highlights
        // painted bands near the rim (ink), a faint crackle in the glaze
        float band = smoothstep(0.004, 0.0, abs(P.y + 0.045) - 0.006) + smoothstep(0.003, 0.0, abs(P.y + 0.075) - 0.002)
                   + smoothstep(0.003, 0.0, abs(P.y + cupD * 0.95) - 0.004);
        float crack = smoothstep(0.02, 0.0, abs(snoise(P * 38.0))) * 0.08;
        vec3 glaze = mix(C_BONE, C_INK * 1.5, clamp(band, 0.0, 1.0) * 0.85) * (1.0 - crack);
        col = glaze * (0.08 + 0.9 * dif) + C_BONE * pow(max(dot(N, Hh), 0.0), 90.0) * 2.0 * sh;
        col = mix(col, refl + C_BONE * 0.05, fres * 0.6);
      } else if (h.y < 2.5 || (h.y > 4.5 && h.y < 5.5)) {   // wine: dark amber body, bright surface reflections
        // deep and glossy: a dark amber body lit from within, the room mirrored on it
        vec3 body = mix(C_BLOOD * 0.1, C_SIGNAL * 0.22, 0.35 + 0.65 * dif) * (0.7 + 0.3 * smoothstep(0.5, 0.0, length(P.xz)));
        col = body + refl * (0.25 + 1.2 * fres) + C_EMBER * pow(max(dot(N, Hh), 0.0), 220.0) * 5.0 * sh;
      } else if (h.y < 3.5) { // lacquer table: black, glossy, reflecting the lanterns
        col = C_INK * 0.4 + C_BLOOD * 0.05 * dif;
        col = mix(col, refl, 0.35 + 0.5 * fres);
      } else if (h.y < 4.5) { // the stream: lit amber
        col = C_SIGNAL * (0.5 + 0.8 * dif) + C_EMBER * 0.4;
      } else {                // the tear: clear water, refracting the room, a bright rim
        col = room(refract(rd, N, 0.75)) * 0.8 + C_BONE * pow(max(dot(N, Hh), 0.0), 120.0) * 4.0 + C_BONE * fres * 0.8;
      }
      return mix(col, room(rd), 1.0 - exp(-tt * 0.05));
    }
    vec3 inside(vec3 ro, vec3 rd, vec2 px) {
      // under the wine: amber haze, the bright surface above, bubbles rising
      vec3 col = mix(C_BLOOD * 0.25, C_SIGNAL * 0.35, smoothstep(-0.6, 0.8, rd.y));
      col += C_EMBER * pow(max(rd.y, 0.0), 6.0) * 1.8 * (0.7 + 0.3 * snoise(vec3(rd.xz * 8.0, t)));
      // god rays from above
      col += C_EMBER * 0.12 * pow(max(rd.y, 0.0), 2.0) * (0.5 + 0.5 * snoise(vec2(atan(rd.x, rd.z) * 10.0, t * 0.3)));
      for (int i = 0; i < 40; i++) {
        float fi = float(i);
        vec3 b = vec3(sin(fi * 12.9) * 0.9, mod(fi * 0.37 + t * (0.2 + 0.1 * fract(fi * 0.61)), 2.0) - 1.0, -0.4 - fract(fi * 0.73) * 1.4);
        vec3 oc = ro - (ro + b);
        vec3 bp = ro + b;
        float tt = dot(bp - ro, rd);
        if (tt < 0.0) continue;
        float dd = length(ro + rd * tt - bp);
        float r = 0.006 + 0.01 * fract(fi * 0.31);
        col += C_BONE * 0.6 * smoothstep(r, r * 0.4, dd) * (1.0 - smoothstep(r * 0.3, 0.0, dd) * 0.6) * exp(-tt * 0.8);
      }
      return col;
    }
    vec3 shade(vec3 ro, vec3 rd, vec2 px) {
      return under > 0.5 ? inside(ro, rd, px) : surface(ro, rd);
    }`, {
    cupR: { value: 0.5 }, cupD: { value: 0.42 }, cupTh: { value: 0.022 }, level: { value: -0.42 }, pour: { value: 0 }, spill: { value: 0 }, under: { value: 0 },
    ripT0: { value: -99 }, crown: { value: 0 }, tilt: { value: 0 }, tearPos: { value: v3(0, 5, 0) }, tearOn: { value: 0 },
  });
}
void THREE;
