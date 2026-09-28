// "Ly" (lines 0–1: Rót đến tràn ly anh chìm đắm trong men cay đắng nồng / ~đắng nồng). The cup on rice
// paper. A stream of wine pours from above on "Rót" and fills it word by word; on "tràn" it overflows
// and the ledger ticks up; "chìm đắm" the camera sinks toward the surface; the backing "đắng nồng"
// comes back as a ghost echo of the words, blurred and offset.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { F } from '../engine/type';
import { rgba } from '../engine/palette';
import type { Line } from '../engine/lyrics';
import { ease, keys, prog, smoothstep } from '../engine/util';
import { Ground, beatsIn, cupTimes, drawCups, drawRun, karaoke, label, pulseAt, runH } from './_kit';
import { drawCup } from './_cup';

export default class Ly extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  L!: Line; E!: Line;
  beats: number[] = [];
  cups: number[] = [];

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.lines[0]!;
    this.E = lyrics.lines[1]!;
    this.beats = beatsIn(audio, this.ctx.start - 1, this.ctx.end + 1);
    this.cups = cupTimes(lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    const w = (s: string) => this.L.words.find((x) => x.w.toLowerCase() === s)!;
    const rot = w('rót'), tran = w('tràn'), chim = w('chìm');
    this.ground.render(renderer, out, { paper: 1, t, stain: 0.25 });
    const L = this.layer; L.clear();
    const c = L.ctx;
    // fill: pours from Rót to tràn (to the brim), overflows after tràn
    const fill = t < tran.start ? 0.95 * prog(t, rot.start, tran.start, ease.inOutQuad) : 1 + 0.9 * prog(t, tran.start, tran.start + 1.6, ease.outCubic);
    const zoom = keys(t, [[this.ctx.start, 1.0], [chim.start, 1.0], [chim.start + 1.2, 1.35, ease.inOutCubic], [this.ctx.end, 1.42]]);
    c.save();
    c.translate(960, 470); c.scale(zoom, zoom); c.translate(-960, -470);
    // the pour: a stream from the top while pouring
    const pourOn = t >= rot.start - 0.1 && t < tran.start + 0.5;
    const surf = drawCup(c, 960, 470, 170, t, { fill, ripples: [rot.start, tran.start], slosh: 0.03 * Math.sin(t * 5) * smoothstep(rot.start, rot.start + 0.3, t) * (1 - smoothstep(tran.start + 1, tran.start + 2, t)) });
    if (pourOn) {
      const k = smoothstep(rot.start - 0.1, rot.start + 0.1, t) * (1 - smoothstep(tran.start + 0.2, tran.start + 0.5, t));
      c.fillStyle = rgba('signal', 0.9 * k);
      const wob = Math.sin(t * 17) * 2;
      c.fillRect(960 - 5 + wob, -40, 10, surf.y + 40);
    }
    c.restore();
    // the line, bottom; the echo as a ghost above it
    const st = { family: F.serif(600), size: 70, unsung: rgba('ink', 0.18), sung: rgba('ink', 0.92) };
    karaoke(c, this.L.words, 960, 930, t, st, 1700);
    const ea = smoothstep(this.E.words[0]!.start - 0.2, this.E.words[0]!.start, t);
    if (ea > 0) {
      const est = { family: F.serif(400, true), size: 90, unsung: rgba('ink', 0.1), sung: rgba('ink', 0.35), now: rgba('signal', 0.7), ghost: 0.2 };
      const run = runH(this.E.words, est);
      c.save(); c.globalAlpha = ea;
      // the echo's smear: a few faint offset copies (no canvas blur filter: it costs a lot per frame)
      c.save(); c.globalAlpha *= 0.35;
      for (const [dx, dy] of [[10, 6], [16, 9], [22, 12]]) drawRun(c, run, 1400 - run.width / 2 + dx!, 250 + dy!, t, est);
      c.restore();
      drawRun(c, run, 1400 - run.width / 2, 250, t, est);
      c.restore();
    }
    drawCups(c, W - 110, 150, t, this.cups, { ink: true });
    label(c, 'I · LY', 110, 96, { size: 13, color: rgba('ink', 0.5) });
    this.ctx.comp.draw(renderer, L.upload(), out);
    const kick = pulseAt(this.beats, t, 0.1);
    return { bloom: 0.35, vignette: 0.3, paper: 1, zoom: 1 + kick * 0.004 };
  }
}
