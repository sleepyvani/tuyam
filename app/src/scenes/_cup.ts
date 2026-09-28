// The cup (chén): a small porcelain wine cup in side view, drawn in hairlines, with amber wine inside.
// Shared by the plates that pour, cry into and clink it, so it looks identical everywhere.
import { rgba } from '../engine/palette';
import { clamp, lerp } from '../engine/util';

export interface CupOpts {
  /** 0..1 how full (1 = to the rim; > 1 overflows: a sheet down the outside) */
  fill: number;
  /** ripple start times on the surface (a drop, a tear, a clink) */
  ripples?: number[];
  /** tilt of the surface (radians) — sloshing */
  slosh?: number;
  /** stroke colour (ink on paper, bone on ink) */
  line?: string;
  /** wine alpha */
  wine?: number;
}

/**
 * Draw the cup with its rim centred at (x, y), rim half-width R. The bowl is R * 0.9 deep; the foot
 * sits under it. Returns the surface centre (for drops and splashes).
 */
export function drawCup(c: CanvasRenderingContext2D, x: number, y: number, R: number, t: number, o: CupOpts) {
  const line = o.line ?? rgba('ink', 0.85);
  const depth = R * 0.9, rimH = R * 0.16;
  const bowl = (u: number) => {
    // half-width of the bowl at depth fraction u (0 = rim, 1 = bottom)
    return R * Math.sqrt(Math.max(0, 1 - u * u * 0.82));
  };
  c.save();
  c.lineCap = 'round';
  // wine
  const f = clamp(o.fill, 0, 1);
  if (f > 0.001) {
    const lev = depth * (1 - f); // surface depth from the rim
    const hw = bowl(lev / depth);
    c.save();
    c.beginPath();
    c.moveTo(x - hw, y + lev);
    for (let i = 0; i <= 40; i++) { const u = lev / depth + (1 - lev / depth) * (i / 40); c.lineTo(x - bowl(u), y + u * depth); }
    for (let i = 40; i >= 0; i--) { const u = lev / depth + (1 - lev / depth) * (i / 40); c.lineTo(x + bowl(u), y + u * depth); }
    c.closePath();
    const g = c.createLinearGradient(0, y + lev, 0, y + depth);
    g.addColorStop(0, rgba('signal', 0.95 * (o.wine ?? 1)));
    g.addColorStop(1, rgba('blood', 0.95 * (o.wine ?? 1)));
    c.fillStyle = g;
    c.fill();
    // surface ellipse (with slosh) and ripples
    c.translate(x, y + lev);
    c.rotate(o.slosh ?? 0);
    c.beginPath(); c.ellipse(0, 0, hw, rimH * (hw / R), 0, 0, Math.PI * 2);
    c.fillStyle = rgba('ember', 0.9 * (o.wine ?? 1)); c.fill();
    for (const r0 of o.ripples ?? []) {
      const age = t - r0;
      if (age < 0 || age > 1.6) continue;
      for (let k = 0; k < 3; k++) {
        const a = age - k * 0.18;
        if (a <= 0) continue;
        const rr = Math.min(1, a * 1.1) * hw;
        c.beginPath(); c.ellipse(0, 0, rr, rimH * (rr / R), 0, 0, Math.PI * 2);
        c.strokeStyle = rgba('bone', 0.55 * (1 - age / 1.6)); c.lineWidth = 1.2; c.stroke();
      }
    }
    c.restore();
  }
  // bowl outline
  c.strokeStyle = line; c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i <= 50; i++) { const u = i / 50; const px = x - bowl(u), py = y + u * depth; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  for (let i = 50; i >= 0; i--) { const u = i / 50; c.lineTo(x + bowl(u), y + u * depth); }
  c.stroke();
  // rim (front and back)
  c.beginPath(); c.ellipse(x, y, R, rimH, 0, 0, Math.PI * 2); c.lineWidth = 1.6; c.stroke();
  // foot
  const fw = R * 0.36;
  c.beginPath();
  c.moveTo(x - fw * 0.8, y + depth + 2); c.lineTo(x - fw, y + depth + R * 0.14); c.lineTo(x + fw, y + depth + R * 0.14); c.lineTo(x + fw * 0.8, y + depth + 2);
  c.stroke();
  // a hatch of engraved shading on the right flank
  c.strokeStyle = line; c.lineWidth = 0.8; c.globalAlpha *= 0.5;
  for (let i = 1; i < 9; i++) {
    const u = i / 10;
    const px = x + bowl(u) - 4;
    c.beginPath(); c.moveTo(px, y + u * depth); c.lineTo(px - lerp(8, 30, u), y + u * depth + 3); c.stroke();
  }
  c.restore();
  // overflow: thin runs down the outside and a pool spreading under the foot
  if (o.fill > 1) {
    const k = clamp(o.fill - 1, 0, 1);
    c.save();
    c.strokeStyle = rgba('signal', 0.9 * (o.wine ?? 1)); c.lineCap = 'round';
    const runs = [-0.93, -0.55, 0.35, 0.8];
    runs.forEach((u, i) => {
      const len = Math.min(1, k * (1.4 - i * 0.12));
      const x0 = x + u * R, sgn = Math.sign(u);
      c.lineWidth = 3 + (i % 2) * 2;
      c.beginPath(); c.moveTo(x0, y + 2);
      for (let j = 1; j <= 20; j++) {
        const v = (j / 20) * len;
        const px = x + sgn * bowl(v) * Math.abs(u) / Math.max(0.35, Math.abs(u)) * (Math.abs(u) > 0.9 ? 1.02 : Math.abs(u) + (1 - Math.abs(u)) * v * 0.2);
        c.lineTo(px, y + v * depth);
      }
      c.stroke();
    });
    c.fillStyle = rgba('signal', 0.8 * (o.wine ?? 1));
    c.beginPath(); c.ellipse(x, y + depth + R * 0.16, R * (0.3 + 1.1 * k), R * 0.05 * (0.5 + k), 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  return { x, y: y + depth * (1 - clamp(o.fill, 0, 1)) };
}
