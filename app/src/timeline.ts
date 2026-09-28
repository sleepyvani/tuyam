// The edit: which scene plays when. Boundaries are anchored to lyric lines and snapped to the beat
// grid, so they follow the aligned data (data/lyrics.json, data/audio.json).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before a time (never after the word it precedes). */
  const onBeat = (t: number, tol = 0.02) => au.timeOfBeat(Math.floor(au.beatAt(t + tol)));
  /** Cut before the first word of line i. */
  const line = (i: number) => onBeat(ly.lines[i]!.words[0]!.start);
  /** The downbeat nearest the end of line i (where a drop takes over). */
  const after = (i: number) => {
    const e = ly.lines[i]!.end;
    return au.downbeats.reduce((b, d) => (Math.abs(d - e) < Math.abs(b - e) ? d : b), au.downbeats[0] ?? e);
  };
  const last = ly.lines[ly.lines.length - 1]!;
  const vocalOut = au.downbeats.find((d) => d >= last.words[last.words.length - 1]!.end) ?? last.end;

  const b = {
    ly: line(0),
    le: line(2),
    namThang: line(3),
    mayNgan: line(4),
    haySay: line(5),
    gan: line(7),
    duong1: line(10),
    drop1: after(13),
    duong2: line(16),
    drop2: after(19),
    tro: line(23),
    ket: vocalOut,
    end: au.duration,
  };

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  // the YouTube thumbnail (?thumb, render.ts --thumb): one still plate on its own
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('thumb')) return [E('thumb', 'thumb', 0, b.end)];

  return [
    E('mo', 'mo', 0, b.ly),
    E('ly', 'ly', b.ly, b.le),
    E('le', 'le', b.le, b.namThang),
    E('namThang', 'namthang', b.namThang, b.mayNgan),
    E('mayNgan', 'mayngan', b.mayNgan, b.haySay),
    E('haySay', 'haysay', b.haySay, b.gan),
    E('gan', 'gan', b.gan, b.duong1),
    E('duong1', 'duong', b.duong1, b.drop1, { params: { n: 1, lines: [10, 11, 12, 13] } }),
    E('drop1', 'drop', b.drop1, b.duong2, { params: { n: 1, lines: [14, 15] } }),
    E('duong2', 'duong', b.duong2, b.drop2, { params: { n: 2, lines: [16, 17, 18, 19] } }),
    E('drop2', 'chay', b.drop2, b.tro, { params: { lines: [20, 21, 22] } }),
    E('tro', 'tro', b.tro, b.ket),
    E('ket', 'ket', b.ket, b.end),
  ];
}
