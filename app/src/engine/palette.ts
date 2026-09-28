import { hexToLinear } from './util';

// The whole video lives in a restrained palette: ink, rice paper, and one signal colour, the amber of
// rice wine (rượu). One rare accent, jade, owned by the "xanh" words (mắt xanh, ngát xanh): the hope that
// never arrives — see docs/TREATMENT.md.
export const HEX = {
  ink: '#0E0C0A', // warm black (mực)
  ink2: '#1A1612', // raised black
  graphite: '#5A534B', // dim lines, secondary text
  ash: '#A39A8C', // mid grey-brown
  bone: '#EDE3CF', // rice paper (giấy dó), primary text on ink
  signal: '#E8A33D', // amber: the wine, the sung word
  ember: '#FFC76B', // hot amber for cores/highlights and fire
  blood: '#8A3B12', // burnt: shadows of amber, charred paper
  jade: '#4FB3A0', // accent: only for "xanh"
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two palette colours for Canvas2D (k = 0 → a, 1 → b), in sRGB. */
export function mixRGBA(a: PaletteKey | string, b: PaletteKey | string, k: number, alpha = 1): string {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
