// "Lệ" (line 2). 3D: the cup scene (shared with
// ly), close on the full cup from just above the rim.
//   Khóc chát làn  — a tear (clear, refracting the lanterns) hangs and swells at the top of the frame
//   mi             — it falls; it hits the wine: a crown of wine rises, rings race to the rim
//   uống           — a sip: the level drops, the camera tilts with the cup
//   say chất ngất  — the camera loses its footing: it rolls and slides, the frame sees double
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, pulse, smoothstep } from '../engine/util';
import { beatsIn, cupTimes, drawCups, drunk, drunkDraw, karaoke, label, pulseAt } from './_kit';
import { Cam3, v3 } from './_3d';
import { cupPass } from './_cupscene';

export default class Le extends Scene {
  cam = new Cam3();
  layer = new Layer2D();
  pass = cupPass(this.cam);
  L!: Line;
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[2]!;
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    const w = (s: string) => this.L.words.find((x) => x.w.toLowerCase() === s)!;
    const khoc = w('khóc'), mi = w('mi'), uong = w('uống'), say = w('say');
    const hit = mi.start + 0.1;
    const level = lerp(-0.02, -0.14, prog(t, uong.start, uong.start + 1.0, ease.inOutCubic));
    // camera: above the rim, looking down at the surface; the sip tilts it; "say" rolls and slides it
    const d = Math.max(drunk(lyrics, t), 0.5 * smoothstep(say.start, w('ngất').end, t));
    const sip = Math.sin(prog(t, uong.start, uong.start + 1.2) * Math.PI) * 0.25;
    const roll = Math.sin(t * 1.3) * 0.12 * d + sip * 0.4;
    const ang = 0.4 + (t - this.ctx.start) * 0.08 + Math.sin(t * 0.9) * 0.3 * d;
    const pos = v3(Math.sin(ang) * 0.75, 0.42 + 0.1 * Math.sin(t * 0.7) * d - sip * 0.2, Math.cos(ang) * 0.75);
    this.cam.set(pos, v3(Math.sin(t * 0.8) * 0.08 * d, level - 0.05, 0), roll, 42);
    const u = this.pass.u;
    u.t!.value = t; u.level!.value = level; u.pour!.value = 0; u.spill!.value = 0.2; u.under!.value = 0;
    u.ripT0!.value = hit;
    u.crown!.value = t > hit ? Math.sin(Math.min(1, (t - hit) / 0.5) * Math.PI) * Math.exp(-(t - hit) * 1.5) : 0;
    const grow = smoothstep(khoc.start - 0.2, khoc.start + 0.5, t);
    const fall = prog(t, mi.start - 0.35, hit, ease.inQuad);
    (u.tearPos!.value as THREE.Vector3).set(0.02, lerp(0.9, level + 0.02, fall), 0.0);
    u.tearOn!.value = t < hit ? grow : 0;
    this.pass.render(renderer, out);
    const L = this.layer; L.clear();
    const c = L.ctx;
    karaoke(c, this.L.words, 960, 970, t, { family: F.serif(600), size: 72, unsung: rgba('bone', 0.2), sung: rgba('bone', 0.96) }, 1700);
    drawCups(c, W - 110, 150, t, this.cups);
    label(c, 'II · LỆ', 110, 96, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.8, bloomThreshold: 0.7, halation: 0.35, vignette: 0.5, zoom: 1 + kick * 0.006 + pulse(t, hit, 0.1) * 0.02 };
  }
}
