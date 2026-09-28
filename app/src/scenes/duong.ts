// "Đường" (the first two choruses: params.lines = [10..13] / [16..19], n = 1 | 2). A road at night, in
// perspective: a pale band of dry ink winding to the horizon. Two amber lights walk it together.
//   Dẫu em không thể ở lại với anh           — they walk on
//   Mình chẳng cùng với nhau đi hết quãng đường — the road runs out ahead of them (it stops short of the
//     horizon); "ngát xanh": the horizon glows jade for a moment — the green day they hoped for
//   Tháng năm thăng trầm                     — the road rises and falls in hills (thăng trầm)
//   dòng đời ngả nghiêng                     — the whole frame tilts, one way then the other
//   Mình tự rời bỏ nhau                      — the road forks; the lights take separate branches
//   say đến điên dại … say cho cháy lòng       — the frame sways and sees double; "cháy": an amber flare
// The second pass (n = 2) is drunker, and lanterns line the road, pulsing on the beat.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, pulse, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, currentLine, drawCups, drunk, drunkDraw, karaoke, label, pulseAt, sway } from './_kit';

const HOR = 430, BOT = H + 40;

export default class Duong extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  lines: Line[] = [];
  n = 1;
  beats: number[] = [];
  cups: number[] = [];
  w: Record<string, Word> = {};

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

  /** Road centre x and half-width at depth z (0 near .. 1 horizon), and screen y; hills and the fork. */
  private road(z: number, t: number, branch = 0) {
    const y0 = HOR + (BOT - HOR) * Math.pow(1 - z, 1.8);
    const hills = smoothstep(this.w.thang!.start - 0.2, this.w.thang!.start + 0.6, t) * Math.sin(z * 9 - t * 1.5) * 40 * (1 - z);
    const cx = 960 + Math.sin(z * 7.5 + 0.6) * 330 * Math.pow(1 - z, 0.7) * Math.min(1, z * 3.5);
    const fork = smoothstep(this.w.roi!.start - 0.2, this.w.roi!.start + 1.0, t);
    const zf = 0.35; // the fork's depth
    const split = branch * fork * Math.max(0, z - zf) * 900 * (1 - z * 0.4);
    return { x: cx + split, y: y0 + hills, hw: 300 * Math.pow(1 - z, 1.7) + 1.2 };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, lyrics } = this.ctx;
    const t = f.t;
    this.ground.render(renderer, out, { paper: 0, t, stain: 0.1 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    const d = Math.max(drunk(lyrics, t), this.n === 2 ? 0.35 : 0);
    const [sx, sy, sr] = sway(d, t);
    const tilt = smoothstep(this.w.nga!.start - 0.1, this.w.nga!.start + 0.4, t) * (1 - smoothstep(this.w.roi!.start - 0.5, this.w.roi!.start, t)) * Math.sin((t - this.w.nga!.start) * 2.2) * 0.12;
    c.save();
    c.translate(960 + sx, 540 + sy); c.rotate(sr + tilt); c.translate(-960, -540);
    // sky: the jade glow of "ngát xanh" on the horizon
    const jade = smoothstep(this.w.ngat!.start - 0.1, this.w.ngat!.start + 0.3, t) * (1 - smoothstep(this.w.ngat!.end + 0.3, this.w.ngat!.end + 1.8, t));
    if (jade > 0) {
      const far = this.road(0.97, t);
      const g = c.createRadialGradient(far.x, HOR, 0, far.x, HOR, 900);
      g.addColorStop(0, rgba('jade', 0.5 * jade)); g.addColorStop(0.35, rgba('jade', 0.15 * jade)); g.addColorStop(1, rgba('jade', 0));
      c.fillStyle = g; c.fillRect(-300, -300, W + 600, HOR + 300);
    }
    c.fillStyle = rgba('bone', 0.35); c.fillRect(-200, HOR, W + 400, 1);
    // the road runs out: its far end recedes from the horizon on "đi hết quãng đường"
    const [l10, l11] = this.lines as [Line, Line];
    const zEnd = lerp(0.97, 0.62, prog(t, l11.words[5]!.start, l11.words[8]!.end, ease.inOutCubic));
    const fork = smoothstep(this.w.roi!.start - 0.2, this.w.roi!.start + 1.0, t);
    for (const br of fork > 0 ? [-1, 1] : [0]) {
      // the band: a faint wash, then dry-brush streaks along the road
      c.beginPath();
      const N = 90;
      for (let i = 0; i <= N; i++) { const r = this.road((i / N) * zEnd, t, br); if (i) c.lineTo(r.x - r.hw, r.y); else c.moveTo(r.x - r.hw, r.y); }
      for (let i = N; i >= 0; i--) { const r = this.road((i / N) * zEnd, t, br); c.lineTo(r.x + r.hw, r.y); }
      c.closePath();
      c.fillStyle = rgba(this.n === 2 ? 'blood' : 'bone', this.n === 2 ? 0.18 : 0.05);
      c.fill();
      for (let lane = 0; lane < 26; lane++) {
        const u = (lane / 25) * 2 - 1;
        const edge = Math.abs(u) > 0.9;
        c.strokeStyle = rgba(this.n === 2 && !edge ? 'signal' : 'bone', edge ? 0.6 : 0.08 + 0.12 * hash(lane, br + 5));
        c.lineWidth = edge ? 1.6 : 1;
        c.beginPath();
        let pen = false;
        for (let i = 0; i <= N; i++) {
          const z = (i / N) * zEnd;
          // dry brush: streaks break where the brush ran out
          const dry = !edge && noise1(z * 14 + lane * 3.1, lane) > 0.35;
          const r = this.road(z, t, br);
          if (dry) { pen = false; continue; }
          if (pen) c.lineTo(r.x + u * r.hw, r.y); else { c.moveTo(r.x + u * r.hw, r.y); pen = true; }
        }
        c.stroke();
      }
      // centre dashes, scrolling toward us (walking)
      c.fillStyle = rgba('bone', 0.4);
      for (let k = 0; k < 16; k++) {
        const z = ((k / 16 + (t - this.ctx.start) * 0.05) % 1) * zEnd;
        const r = this.road(z, t, br);
        c.fillRect(r.x - 1, r.y, 2 + 6 * (1 - z), 10 * (1 - z) + 1);
      }
      // lanterns (second pass)
      if (this.n === 2) {
        const kick = pulseAt(this.beats, t, 0.15);
        for (let k = 0; k < 10; k++) {
          const z = (k + 0.5) / 10 * zEnd;
          const r = this.road(z, t, br);
          for (const s of [-1, 1]) {
            const x = r.x + s * (r.hw + 20 * (1 - z)), y = r.y - 30 * (1 - z);
            const rad = (3 + 5 * kick) * (1 - z) + 1;
            const g = c.createRadialGradient(x, y, 0, x, y, rad * 4);
            g.addColorStop(0, rgba('ember', 0.9)); g.addColorStop(1, rgba('signal', 0));
            c.fillStyle = g; c.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8);
          }
        }
      }
    }
    // the two lights, walking: depth advances over the chorus; on the fork they separate
    const walk = lerp(0.08, 0.5, prog(t, this.ctx.start, this.w.roi!.start, ease.linear)) + 0.15 * prog(t, this.w.roi!.start, this.ctx.end, ease.linear);
    for (const br of [-1, 1]) {
      const r = this.road(clamp(walk, 0, zEnd - 0.02), t, fork > 0 ? br : 0);
      const x = r.x + (fork > 0 ? 0 : br * r.hw * 0.25), y = r.y - 6;
      const rad = 10 * (1 - walk * 0.7);
      const g = c.createRadialGradient(x, y, 0, x, y, rad * 5);
      g.addColorStop(0, rgba('ember', 1)); g.addColorStop(0.25, rgba('signal', 0.7)); g.addColorStop(1, rgba('signal', 0));
      c.fillStyle = g; c.fillRect(x - rad * 5, y - rad * 5, rad * 10, rad * 10);
    }
    c.restore();
    // "cháy": an amber flare across the frame
    const flare = pulse(t, this.w.chay!.start, 0.35);
    if (flare > 0.01) {
      const g = c.createRadialGradient(960, HOR, 0, 960, HOR, 1100);
      g.addColorStop(0, rgba('ember', 0.2 * flare)); g.addColorStop(1, rgba('signal', 0));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // lyric, top
    const cur = currentLine(this.lines, t);
    if (cur) karaoke(c, cur.words, 960, cur.words.length > 12 ? 250 : 200, t, { family: F.serif(600), size: 64, unsung: rgba('bone', 0.16), sung: rgba('bone', 0.95) }, 1700);
    drawCups(c, W - 110, 1000, t, this.cups);
    label(c, this.n === 2 ? 'VIII · ĐƯỜNG (II)' : 'VII · ĐƯỜNG', 110, 1000, { size: 13, color: rgba('ash', 0.6) });
    drunkDraw(this.ctx.comp, renderer, L.upload(), out, d, t);
    const kick = pulseAt(this.beats, t, 0.1);
    void l10;
    return { bloom: 0.8, vignette: 0.5, zoom: 1 + kick * 0.008 };
  }
}
