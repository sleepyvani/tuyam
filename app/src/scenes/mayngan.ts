// "Mây ngàn" (line 4: Màu mắt xanh ngời lạc giữa mây ngàn về chốn xa xôi). An ink-wash landscape
// (a shader: layered ridges, mist between them, rice paper behind) drifting slowly sideways. On "xanh"
// a jade light — the eyes — kindles over the nearest ridge (the first time the accent colour appears),
// then drifts up and away into the clouds through "lạc giữa mây ngàn", growing faint, and is gone by "xa xôi".
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';

export default class MayNgan extends Scene {
  layer = new Layer2D();
  land = new FSPass(/* glsl */ `
    uniform float t, pan; uniform vec3 eye; // eye.xy = screen px (y down), eye.z = intensity
    float ridge(float x, float seed, float amp, float base) {
      return base - amp * (0.55 * fbm(vec2(x * 0.0018 + seed, seed), 5) + 0.45 * abs(snoise(vec2(x * 0.0007 + seed * 3.0, 1.0))));
    }
    void main() {
      vec2 px = FRAG_PX; px.y = 1080.0 - px.y;
      vec3 paper = C_BONE * (0.94 + 0.04 * fbm(px * vec2(0.01, 0.003), 3));
      vec3 col = paper;
      // five ridges, far (pale) to near (dark), each with a mist band at its foot
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float par = 0.15 + 0.2 * fi;
        float x = px.x + pan * par;
        float h = ridge(x, 3.1 + fi * 7.7, 170.0 + fi * 25.0, 430.0 + fi * 110.0);
        float inside = smoothstep(0.0, 2.0, px.y - h);
        // ink wash: darker at the crest, fading down into mist
        float depth = clamp((px.y - h) / 260.0, 0.0, 1.0);
        float wash = mix(0.12 + 0.13 * fi, 0.02, depth) * inside;
        float texture_ = 0.5 + 0.5 * fbm(vec2(x * 0.02, px.y * 0.006) + fi, 3);
        col = mix(col, C_INK, wash * (0.7 + 0.3 * texture_) * 2.2);
        // crest line (a dry brush)
        col = mix(col, C_INK, (1.0 - smoothstep(0.0, 2.5, abs(px.y - h))) * (0.25 + 0.1 * fi) * texture_);
        // mist: a soft pale band drifting over each foot
        float mist = exp(-pow((px.y - (h + 150.0)) / 70.0, 2.0)) * (0.6 + 0.4 * fbm(vec2(x * 0.004 + t * 0.05, fi), 3));
        col = mix(col, paper, mist * 0.75);
      }
      // the eyes: a jade light
      float d = length(px - eye.xy);
      col += C_JADE * eye.z * (exp(-d * d / 900.0) * 2.4 + exp(-d / 90.0) * 0.5);
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, pan: { value: 0 }, eye: { value: new THREE.Vector3() } });
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
    u.pan!.value = (t - this.ctx.start) * 70;
    const on = smoothstep(xanh.start - 0.15, xanh.start + 0.2, t);
    const away = prog(t, lac.start, xoi.end, ease.inOutCubic);
    const ex = lerp(760, 1500, away), ey = lerp(560, 250, away);
    (u.eye!.value as THREE.Vector3).set(ex, ey, on * lerp(1, 0.05, away) * (1 - smoothstep(xoi.end - 0.2, xoi.end + 0.5, t)));
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
