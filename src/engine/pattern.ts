export type SubdivisionId = 'quarter' | 'eighth' | 'triplet' | 'sixteenth' | 'quintuplet' | 'sextuplet' | 'swing';
export type Tier = 'accent' | 'beat' | 'sub';
export type KitId = 'click' | 'woodblock' | 'cowbell' | 'hihat' | 'rim' | 'beep' | 'sidestick';

/** Onset offsets within one beat, as a fraction of the beat. */
export const SUBDIVISIONS: Record<SubdivisionId, { label: string; offsets: number[] }> = {
  quarter: { label: 'Quarter', offsets: [0] },
  eighth: { label: 'Eighth', offsets: [0, 1 / 2] },
  triplet: { label: 'Triplet', offsets: [0, 1 / 3, 2 / 3] },
  sixteenth: { label: 'Sixteenth', offsets: [0, 1 / 4, 2 / 4, 3 / 4] },
  quintuplet: { label: 'Quintuplet', offsets: [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5] },
  sextuplet: { label: 'Sextuplet', offsets: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] },
  swing: { label: 'Swing eighths', offsets: [0, 2 / 3] },
};

export interface MetronomeConfig {
  /** Beats per minute. The beat is the note value given by `denominator`. */
  bpm: number;
  beats: number; // time signature numerator, 1-16
  denominator: 2 | 4 | 8 | 16;
  subdivision: SubdivisionId;
  accentFirst: boolean;
  kit: Record<Tier, KitId>;
  volume: Record<Tier, number>; // 0..1
}

export const DEFAULT_CONFIG: MetronomeConfig = {
  bpm: 120,
  beats: 4,
  denominator: 4,
  subdivision: 'quarter',
  accentFirst: true,
  kit: { accent: 'click', beat: 'click', sub: 'click' },
  volume: { accent: 1, beat: 0.75, sub: 0.4 },
};

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export interface Onset {
  time: number; // seconds from start of bar
  tier: Tier;
  beat: number; // 0-based beat in bar
  sub: number; // 0-based subdivision index in beat
}

/** Seconds per beat. BPM counts the beat unit (the denominator note), so the denominator doesn't change timing. */
export const beatSeconds = (bpm: number) => 60 / bpm;
export const barSeconds = (c: Pick<MetronomeConfig, 'bpm' | 'beats'>) => (c.beats * 60) / c.bpm;

export function barOnsets(c: MetronomeConfig): Onset[] {
  const beat = beatSeconds(c.bpm);
  const offsets = SUBDIVISIONS[c.subdivision].offsets;
  const out: Onset[] = [];
  for (let b = 0; b < c.beats; b++) {
    offsets.forEach((off, s) => {
      const tier: Tier = s > 0 ? 'sub' : b === 0 && c.accentFirst ? 'accent' : 'beat';
      out.push({ time: (b + off) * beat, tier, beat: b, sub: s });
    });
  }
  return out;
}

/** Whole bars needed so the rendered loop is at least `minSeconds` long (longer loops make rounding error negligible). */
export const barsForLoop = (barSec: number, minSeconds = 8) => Math.max(1, Math.ceil(minSeconds / barSec));

export function clampConfig(c: MetronomeConfig): MetronomeConfig {
  return {
    ...c,
    bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, c.bpm)),
    beats: Math.min(16, Math.max(1, Math.round(c.beats))),
  };
}
