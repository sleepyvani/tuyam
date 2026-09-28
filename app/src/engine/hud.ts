// Global overlay: the crop-mark frame, the (normally hidden) corner record readout, and optional
// plate captions. Most of the video runs full-bleed; scenes switch the frame on for the case-file
// bookends (the opening's record and the closing of the file).
import { Layer2D, W, H } from './gl';
import { rgba, mixRGBA } from './palette';
import { F, font } from './type';
import { clamp, ease, lerp, prog, smoothstep } from './util';

export interface Caption { start: number; end: number; fig: string; text: string }

/** Record timecode: song time as 記録 mm:ss:ff (60 fps frames). */
export function formatRec(t: number) {
  const f = Math.max(0, Math.floor(t * 60));
  const mm = Math.floor(f / 3600), ss = Math.floor(f / 60) % 60, ff = f % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

/**
 * Draw the record instrument (label, timecode, a tick bar of song progress) anywhere, into a Canvas2D
 * context — for plates that stage it inside their world. (x, y) = left end of the digits' baseline.
 */
export function drawRecord(c: CanvasRenderingContext2D, x: number, y: number, t: number, dur: number, o: { scale?: number; ink?: boolean; label?: string } = {}) {
  const k = o.scale ?? 1;
  const fg = o.ink ? 'ink' : 'bone';
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = font(F.dot(), 15 * k);
  c.fillStyle = rgba(fg, 0.6);
  c.fillText(o.label ?? 'REC', x, y - 40 * k);
  c.font = font(F.mono(400), 34 * k);
  c.fillStyle = rgba(fg, 0.92);
  c.fillText(formatRec(t), x - 2 * k, y);
  const bw = 220 * k, by = y + 16 * k;
  c.fillStyle = rgba(fg, 0.18);
  c.fillRect(x, by, bw, Math.max(1, k));
  for (let i = 0; i <= 10; i++) c.fillRect(x + (bw * i) / 10, by - (i % 5 === 0 ? 5 : 3) * k, Math.max(1, k), (i % 5 === 0 ? 5 : 3) * k);
  c.fillStyle = rgba('signal', 1);
  c.fillRect(x, by - k, bw * clamp(t / dur), 3 * k);
  // the recording dot
  if (Math.floor(t * 2) % 2 === 0) { c.beginPath(); c.arc(x + bw + 14 * k, y - 11 * k, 5 * k, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

export interface HudState {
  /** Overrides from the active scene (via post.hud etc.). */
  opacity: number;
  /** 0..1 the crop-mark frame: 1 in place, 0 flown out past the edges (see PostParams.frame). */
  frame: number;
  /** Opacity of the corner record readout (off by default). */
  readout: number;
  /** 0..1: the plate is light (bone paper) — draw captions/crop marks in ink. */
  paper: number;
}

export class Hud {
  layer = new Layer2D();
  private ink = false;
  private empty = false;
  constructor(public duration: number, public captions: Caption[]) {}

  draw(t: number, st: HudState) {
    const L = this.layer;
    // nothing to draw and already blank: keep the uploaded texture (saves a full-frame upload per frame)
    const blank = st.opacity <= 0.001 || (st.frame <= 0.001 && st.readout <= 0.001 && !this.captions.some((k) => t >= k.start && t < k.end));
    if (blank && this.empty) return L.texture;
    L.clear();
    const c = L.ctx;
    this.empty = blank;
    if (blank) return L.upload();
    c.globalAlpha = st.opacity;
    this.ink = st.paper > 0.5;
    if (st.frame > 0.001) this.cropMarks(c, st.frame);
    if (st.readout > 0.001) { c.save(); c.globalAlpha *= st.readout; drawRecord(c, 64, H - 66, t, this.duration, { ink: this.ink }); c.restore(); }
    this.caption(c, t);
    return L.upload();
  }

  /** Corner marks; as `k` drops they fly out along the diagonals and past the edges. */
  private cropMarks(c: CanvasRenderingContext2D, k: number) {
    const e = ease.inOutCubic(clamp(k));
    c.save();
    c.globalAlpha *= clamp(k * 3);
    c.strokeStyle = this.ink ? rgba('ink', 0.45) : rgba('bone', 0.34);
    c.lineWidth = 1.25;
    const m = lerp(-40, 36, e), l = 22;
    c.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      c.moveTo(x + sx * l, y + 0.5 * sy); c.lineTo(x, y + 0.5 * sy); c.lineTo(x, y + sy * l);
    }
    c.stroke();
    c.restore();
  }

  private caption(c: CanvasRenderingContext2D, t: number) {
    const cap = this.captions.find((k) => t >= k.start && t < k.end);
    if (!cap) return;
    const a = Math.min(smoothstep(cap.start, cap.start + 0.5, t), 1 - smoothstep(cap.end - 0.6, cap.end, t));
    if (a <= 0) return;
    c.save();
    c.globalAlpha *= a;
    const x = W - 64, y = H - 66;
    c.textBaseline = 'alphabetic';
    c.font = font(F.mincho(400), 24);
    c.fillStyle = this.ink ? rgba('ink', 0.9) : rgba('bone', 0.85);
    const n = Math.floor(Array.from(cap.text).length * prog(t, cap.start, cap.start + 0.8));
    const shown = Array.from(cap.text).slice(0, n).join('');
    const full = c.measureText(cap.text).width;
    c.fillText(shown, x - full, y);
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = this.ink ? mixRGBA('blood', 'signal', 0.3) : rgba('signal', 1);
    c.fillText(cap.fig, x - full, y - 34);
    c.restore();
  }
}
