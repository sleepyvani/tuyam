// Shared kit for every plate of Túy Âm, so the motifs look identical everywhere:
//  - beat helpers (the grid from data/audio.json)
//  - Vietnamese karaoke: syllable runs, lit left to right per syllable
//  - DRUNKENNESS: one number for the whole video, rising with every sung "say"; scenes use it to sway
//    the camera and to see double (drunkDraw)
//  - THE CUP COUNTER (chén thứ n): the ledger in the corner, one cup per rót / thêm một lần / chorus
//  - GROUND: rice paper (giấy dó) with fibres and ink-wash stains, or ink
import * as THREE from 'three';
import type { AudioData } from '../engine/audio';
import type { Compositor } from '../engine/gl';
import { FSPass } from '../engine/gl';
import { Lyrics, type Word } from '../engine/lyrics';
import { rgba, mixRGBA } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { clamp, ease, lerp, noise1, prog, smoothstep } from '../engine/util';

// ------------------------------------------------------------------ beats
export const beatsIn = (au: AudioData, t0: number, t1: number) => au.beats.filter((b) => b >= t0 && b < t1);
export function lastAt(ts: number[], t: number) {
  let lo = 0, hi = ts.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m]! <= t) lo = m + 1; else hi = m; }
  return lo > 0 ? ts[lo - 1]! : -99;
}
export function idxAt(ts: number[], t: number) {
  let lo = 0, hi = ts.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m]! <= t) lo = m + 1; else hi = m; }
  return lo - 1;
}
export const pulseAt = (ts: number[], t: number, hl = 0.12) => { const b = lastAt(ts, t); return b < -50 ? 0 : Math.pow(0.5, (t - b) / hl); };

// ------------------------------------------------------------------ drunkenness
let SAY: number[] | null = null;
/**
 * 0..1: how drunk the video is at t. Every sung "say" adds a step (eased over half a second); the
 * total is normalised so the last chorus ends fully drunk.
 */
export function drunk(ly: Lyrics, t: number) {
  if (!SAY) SAY = ly.words.filter((w) => w.w.toLowerCase() === 'say').map((w) => w.start);
  let k = 0;
  for (const s of SAY) k += prog(t, s, s + 0.5, ease.outCubic);
  return clamp(k / Math.max(1, SAY.length));
}
/** Camera sway for a drunk level d at t: [dx, dy, rotation]. */
export function sway(d: number, t: number): [number, number, number] {
  const a = d * d;
  return [noise1(t * 0.35, 3) * 60 * a, noise1(t * 0.3, 7) * 30 * a, noise1(t * 0.25, 11) * 0.06 * a];
}

/**
 * Composite a layer texture seeing double: the plain layer plus a ghost copy drifting apart with the
 * drunk level d (the ghost offset breathes slowly).
 */
export function drunkDraw(comp: Compositor, renderer: THREE.WebGLRenderer, tex: THREE.Texture, out: THREE.WebGLRenderTarget, d: number, t: number, mode: 'normal' | 'add' = 'normal') {
  comp.draw(renderer, tex, out, { mode });
  if (d > 0.02) {
    const off = d * 0.012 * (0.6 + 0.4 * Math.sin(t * 1.3));
    comp.draw(renderer, tex, out, { mode, opacity: 0.45 * d, offset: [off, off * 0.35] });
  }
}

// ------------------------------------------------------------------ karaoke (Vietnamese: syllables)
export interface KStyle {
  family: string;
  size: number;
  /** space between syllables (px), default size * 0.28 */
  gap?: number;
  unsung?: string;
  sung?: string;
  now?: string;
  /** seconds a syllable shows dim before it is sung (Infinity: always) */
  ghost?: number;
  /** keep the sung syllable in `now` this long after it ends */
  hold?: number;
}
export interface KSyl { w: Word; x: number; wd: number }
export interface KRun { syls: KSyl[]; width: number }

const DEF = (s: KStyle) => ({ gap: s.size * 0.28, unsung: rgba('bone', 0.24), sung: rgba('bone', 0.95), now: rgba('signal', 1), ghost: 0.45, hold: 0.05, ...s });

export function runH(words: Word[], st: KStyle): KRun {
  const s = DEF(st);
  let x = 0;
  const syls = words.map((w, i) => {
    if (i) x += s.gap;
    const wd = measure(w.w, s.family, s.size);
    const r = { w, x, wd };
    x += wd;
    return r;
  });
  return { syls, width: x };
}

/** Draw a run with its left baseline at (ox, oy); each syllable wipes left to right while it is sung. */
export function drawRun(c: CanvasRenderingContext2D, run: KRun, ox: number, oy: number, t: number, st: KStyle, alpha?: (k: KSyl, i: number) => number) {
  const s = DEF(st);
  const base = c.globalAlpha;
  c.save();
  c.font = font(s.family, s.size);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  run.syls.forEach((k, i) => {
    const w = k.w;
    const vis = s.ghost === Infinity ? 1 : smoothstep(w.start - s.ghost, w.start - s.ghost + 0.12, t);
    const a = vis * (alpha ? alpha(k, i) : 1);
    if (a <= 0.003) return;
    const p = Lyrics.wordProgress(w, t);
    const x = ox + k.x;
    c.globalAlpha = a * base;
    if (p < 1) { c.fillStyle = s.unsung; c.fillText(w.w, x, oy); }
    if (p > 0) {
      c.save();
      c.beginPath(); c.rect(x - 4, oy - s.size * 1.3, (k.wd + 8) * p, s.size * 1.8); c.clip();
      // "xanh" owns the accent: jade instead of amber, wherever it is sung
      const jade = /^xanh$/i.test(w.w);
      c.fillStyle = t >= w.start && t < w.end + s.hold ? (jade ? rgba('jade', 1) : s.now) : jade ? rgba('jade', 0.9) : s.sung;
      c.fillText(w.w, x, oy);
      c.restore();
    }
  });
  c.restore();
}

/** Split words into rows no wider than maxW. */
export function wrap(words: Word[], family: string, size: number, maxW: number) {
  const rows: Word[][] = [];
  let row: Word[] = [];
  for (const w of words) {
    const test = [...row, w];
    if (row.length && runH(test, { family, size }).width > maxW) { rows.push(row); row = [w]; } else row = test;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Draw a line as centred rows (wrapped to maxW), rows `lead` px apart, the last row's baseline at y. */
export function karaoke(c: CanvasRenderingContext2D, words: Word[], cx: number, y: number, t: number, st: KStyle, maxW = 1600, lead = 1.25) {
  const rows = wrap(words, st.family, st.size, maxW);
  rows.forEach((r, i) => {
    const run = runH(r, st);
    drawRun(c, run, cx - run.width / 2, y - (rows.length - 1 - i) * st.size * lead, t, st);
  });
}

/** The line being sung at t among `lines` (the latest started, with 0.4 s lead-in). */
export function currentLine<T extends { words: Word[] }>(lines: T[], t: number): T | null {
  let cur: T | null = null;
  for (const l of lines) if (l.words[0]!.start - 0.4 <= t) cur = l;
  return cur;
}

// ------------------------------------------------------------------ the cup counter
/** Times at which a cup is poured: every "rót", every "thêm một lần", and the first word of every chorus. */
export function cupTimes(ly: Lyrics) {
  const ts: number[] = [];
  for (const l of ly.lines) {
    const t0 = l.words[0]!.start;
    if (/^rót/i.test(l.text) || /^thêm một lần/i.test(l.text) || /^dẫu em không thể/i.test(l.text)) ts.push(t0);
  }
  return ts.sort((a, b) => a - b);
}

/** The ledger: "CHÉN THỨ n" with a tick per cup, at (x, y) (right-aligned). */
export function drawCups(c: CanvasRenderingContext2D, x: number, y: number, t: number, cups: number[], o: { ink?: boolean; alpha?: number } = {}) {
  const n = cups.filter((s) => s <= t).length;
  const fl = pulseAt(cups, t, 0.3);
  const fg = o.ink ? 'ink' : 'bone';
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.textAlign = 'right'; c.textBaseline = 'alphabetic';
  c.font = font(F.mono(500), 13); c.letterSpacing = '3px';
  c.fillStyle = rgba(fg, 0.55);
  c.fillText('CHÉN THỨ', x, y - 44);
  c.letterSpacing = '0px';
  c.font = font(F.mono(400), 44);
  c.fillStyle = fl > 0.05 ? mixRGBA(fg, 'signal', Math.min(1, fl * 1.4)) : rgba(fg, 0.92);
  c.fillText(String(n).padStart(2, '0'), x, y);
  for (let i = 0; i < Math.max(n, 1); i++) {
    c.fillStyle = i < n ? rgba('signal', 0.9) : rgba(fg, 0.2);
    c.fillRect(x - 6 - i * 9, y + 12, 5, 12);
  }
  c.restore();
}

// ------------------------------------------------------------------ ground
/**
 * Rice paper (paper = 1) or ink (0): fibres, a faint vignette, and ink-wash stains that bloom where
 * `stain` > 0 (amount), drifting slowly. `burn` 0..1 chars the paper from the edges inward (amber edge,
 * then black; 1 leaves nothing), for the fire.
 */
export class Ground {
  pass = new FSPass(/* glsl */ `
    uniform float paper, t, stain, burn;
    void main() {
      vec2 px = FRAG_PX; px.y = 1080.0 - px.y;
      vec2 uv = px / vec2(1920.0, 1080.0);
      float fib = fbm(px * vec2(0.012, 0.004), 3) * 0.5 + snoise(px * 0.4) * 0.18 + snoise(px * vec2(0.9, 0.08)) * 0.12;
      vec3 inkC = C_INK * (1.0 + 0.3 * fib) + C_INK2 * 0.4 * smoothstep(1.1, 0.2, length((uv - 0.5) * vec2(1.6, 1.0)));
      vec3 paperC = C_BONE * (0.93 + 0.045 * fib) * mix(0.86, 1.0, smoothstep(1.2, 0.25, length((uv - 0.5) * vec2(1.4, 1.0))));
      vec3 col = mix(inkC, paperC, paper);
      // ink-wash stains: soft blotches with darker rims (dried edges)
      if (stain > 0.0) {
        float n = fbm(vec3(uv * vec2(2.6, 1.5), t * 0.03), 4);
        float s = smoothstep(0.1, 0.45, n) * stain;
        float rim = smoothstep(0.08, 0.0, abs(n - 0.12)) * stain;
        vec3 wash = mix(col, C_INK * 1.4, 0.55 * paper + 0.25);
        col = mix(col, wash, s * 0.55);
        col = mix(col, C_INK, rim * 0.25 * paper);
      }
      if (burn > 0.0) {
        float e = min(min(uv.x, 1.0 - uv.x) * 1.78, min(uv.y, 1.0 - uv.y));
        float edge = e + 0.07 * fbm(uv * 6.0 + t * 0.05, 4) - burn * 0.5;
        float charred = smoothstep(0.006, -0.006, edge);
        float glow = smoothstep(0.018, 0.0, abs(edge - 0.004)) * (1.0 - charred * 0.7);
        float scorch = smoothstep(0.06, 0.0, edge) * (1.0 - charred);
        col = mix(col, C_BLOOD * 0.35, scorch * 0.7);
        col = mix(col, C_INK * 0.4, charred);
        col += heat(0.55 + 0.35 * snoise(uv * 40.0 + t)) * glow * 1.4;
      }
      fragColor = vec4(col, 1.0);
    }`, { paper: { value: 1 }, t: { value: 0 }, stain: { value: 0 }, burn: { value: 0 } });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: { paper?: number; t?: number; stain?: number; burn?: number } = {}) {
    const u = this.pass.u;
    u.paper!.value = o.paper ?? 1; u.t!.value = o.t ?? 0; u.stain!.value = o.stain ?? 0; u.burn!.value = o.burn ?? 0;
    this.pass.render(renderer, out);
  }
}

/** Mono label. */
export function label(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; family?: string; spacing?: number } = {}) {
  c.save();
  c.font = font(o.family ?? F.mono(500), o.size ?? 13);
  c.letterSpacing = `${o.spacing ?? 3}px`;
  c.fillStyle = o.color ?? rgba('bone', 0.55);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(s, x, y);
  c.restore();
}

export { lerp, mixRGBA };
