// Word-timed lyrics (data/lyrics.json) with queries for karaoke rendering.
// Words are Japanese display words (a content word with its particles, e.g. 僕の) with their romaji;
// `syl` holds one [start, end] per display character, from the aligned CTC tokens.

export interface Word {
  w: string; // display word (Japanese)
  r: string; // romaji
  start: number;
  end: number;
  syl?: [number, number][];
  /** filled in by Lyrics: */
  line: number;
  index: number; // index within line
  gi: number; // global word index
}
export interface Line {
  i: number;
  text: string; // Japanese, with the source's spaces between phrases
  romaji: string;
  start: number;
  end: number;
  words: Word[];
}

export class Lyrics {
  lines: Line[];
  words: Word[];
  constructor(j: { lines: any[] }) {
    this.lines = (j.lines as any[]).map((l, li) => ({
      ...l,
      i: li,
      words: (l.words as any[]).map((w, wi) => ({ ...w, line: li, index: wi, gi: 0 })),
    }));
    this.words = this.lines.flatMap((l) => l.words);
    this.words.forEach((w, i) => (w.gi = i));
  }

  static async load(): Promise<Lyrics> {
    for (const url of ['data/lyrics.json', 'data/lyrics.approx.json']) {
      const r = await fetch(url);
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return new Lyrics(await r.json());
    }
    throw new Error('no lyrics data found');
  }

  /** The line being sung at t (or null in gaps). */
  lineAt(t: number): Line | null {
    return this.lines.find((l) => t >= l.start && t < l.end) ?? null;
  }
  /** Most recent line that started at or before t. */
  lastLine(t: number): Line | null {
    let best: Line | null = null;
    for (const l of this.lines) if (l.start <= t) best = l;
    return best;
  }
  nextLine(t: number): Line | null {
    return this.lines.find((l) => l.start > t) ?? null;
  }
  linesIn(t0: number, t1: number): Line[] {
    return this.lines.filter((l) => l.end > t0 && l.start < t1);
  }
  /** Lines whose text (Japanese, spaces ignored) or romaji includes `s`. */
  find(s: string): Line[] {
    const q = norm(s);
    return this.lines.filter((l) => norm(l.text).includes(q) || norm(l.romaji).includes(q));
  }
  /** nth line containing `s`; throws if missing (fail loudly while authoring). */
  get(s: string, nth = 0): Line {
    const l = this.find(s)[nth];
    if (!l) throw new Error(`lyric not found: ${s}`);
    return l;
  }
  wordAt(t: number): Word | null {
    return this.words.find((w) => t >= w.start && t < w.end) ?? null;
  }
  lastWord(t: number): Word | null {
    let best: Word | null = null;
    for (const w of this.words) if (w.start <= t) best = w;
    return best;
  }
  /** Words whose display text (or romaji) matches, in song order (e.g. '軽い' → the six of them). */
  findWords(s: string): Word[] {
    const q = norm(s);
    return this.words.filter((w) => norm(w.w) === q || norm(w.r) === q);
  }
  /** Words of line `l` from the first word matching `s` (inclusive), `n` of them. */
  wordsFrom(l: Line, s: string, n = 1, nth = 0): Word[] {
    const q = norm(s);
    const idx = l.words.map((w, i) => (norm(w.w) === q ? i : -1)).filter((i) => i >= 0)[nth];
    if (idx === undefined) throw new Error(`word not found in line ${l.i}: ${s}`);
    return l.words.slice(idx, idx + n);
  }

  /**
   * Sung progress of a word at time t: 0 before start, 1 after end, piecewise across its characters
   * (`syl`) when available. Use for karaoke wipes.
   */
  static wordProgress(w: Word, t: number): number {
    if (t <= w.start) return 0;
    if (t >= w.end) return 1;
    if (w.syl && w.syl.length > 1) {
      const n = w.syl.length;
      for (let i = 0; i < n; i++) {
        const [a, b] = w.syl[i]!;
        if (t < a) return i / n;
        if (t < b) return (i + (t - a) / Math.max(1e-3, b - a)) / n;
      }
      return 1;
    }
    return (t - w.start) / Math.max(1e-3, w.end - w.start);
  }

  /** Sung progress of one character of a word: 0..1 (its own syl window, or the word's share). */
  static charProgress(w: Word, i: number, t: number): number {
    const s = w.syl?.[i];
    if (s) return t <= s[0] ? 0 : t >= s[1] ? 1 : (t - s[0]) / Math.max(1e-3, s[1] - s[0]);
    const n = Array.from(w.w).length;
    return Math.max(0, Math.min(1, Lyrics.wordProgress(w, t) * n - i));
  }

  /** Start time of character i of a word. */
  static charStart(w: Word, i: number): number {
    const s = w.syl?.[i];
    if (s) return s[0];
    const n = Array.from(w.w).length;
    return w.start + ((w.end - w.start) * i) / n;
  }

  /** Progress through a whole line in characters (0..chars), for per-glyph wipes. */
  static lineCharProgress(l: Line, t: number): number {
    let chars = 0;
    for (const w of l.words) {
      const n = Array.from(w.w).length;
      const p = Lyrics.wordProgress(w, t);
      chars += p * n;
      if (p < 1) break;
    }
    return chars;
  }
}

/** Normalise for matching: lower case, no spaces or punctuation (Japanese kept). */
export const norm = (s: string) => s.toLowerCase().replace(/[\s、。・,.!?'"’“”()（）-]/g, '');
