import { describe, expect, it } from 'vitest';
import { barOnsets, barSeconds, barsForLoop, DEFAULT_CONFIG, SUBDIVISIONS, type MetronomeConfig } from '../src/engine/pattern';
import { renderLoop } from '../src/engine/render';

const cfg = (o: Partial<MetronomeConfig> = {}): MetronomeConfig => ({ ...DEFAULT_CONFIG, ...o });

describe('barOnsets', () => {
  it('4/4 quarters at 120 bpm: 4 onsets 0.5s apart, accent on 1', () => {
    const o = barOnsets(cfg());
    expect(o.map((x) => x.time)).toEqual([0, 0.5, 1, 1.5]);
    expect(o.map((x) => x.tier)).toEqual(['accent', 'beat', 'beat', 'beat']);
  });
  it('no accent when disabled', () => {
    expect(barOnsets(cfg({ accentFirst: false })).every((x) => x.tier !== 'accent')).toBe(true);
  });
  it('triplets: 3 per beat, subs quieter tier', () => {
    const o = barOnsets(cfg({ subdivision: 'triplet', beats: 3 }));
    expect(o).toHaveLength(9);
    expect(o[1]!.time).toBeCloseTo(0.5 / 3);
    expect(o.filter((x) => x.tier === 'sub')).toHaveLength(6);
  });
  it('swing puts the off-eighth at 2/3 of the beat', () => {
    const o = barOnsets(cfg({ subdivision: 'swing', beats: 1 }));
    expect(o[1]!.time).toBeCloseTo((2 / 3) * 0.5);
  });
  it('every subdivision has offsets in [0,1) starting at 0', () => {
    for (const s of Object.values(SUBDIVISIONS)) {
      expect(s.offsets[0]).toBe(0);
      expect(s.offsets.every((x) => x >= 0 && x < 1)).toBe(true);
    }
  });
  it('bpm counts the denominator beat: 6/8 at 120 bar is 3s', () => {
    expect(barSeconds(cfg({ beats: 6, denominator: 8 }))).toBeCloseTo(3);
  });
});

describe('renderLoop', () => {
  const sr = 44100;
  it('is a whole number of bars and at least 8s', () => {
    for (const bpm of [40, 97, 127, 240]) {
      const r = renderLoop(cfg({ bpm, beats: 7 }), sr);
      expect(r.duration).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(r.bars).toBe(barsForLoop(r.barSeconds));
      expect(Math.abs(r.duration - r.bars * r.barSeconds)).toBeLessThan(1 / sr);
    }
  });
  it('puts accent louder than beats and never exceeds 1', () => {
    const r = renderLoop(cfg({ sub: undefined } as never), sr);
    let peak = 0;
    for (const x of r.samples) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.3);
    const bar = Math.round(0.5 * sr);
    const win = (s: number) => Math.max(...r.samples.slice(s, s + 2000).map(Math.abs));
    expect(win(0)).toBeGreaterThan(win(bar));
  });
  it('wraps long tails across the loop seam without NaN', () => {
    const r = renderLoop(cfg({ bpm: 400, kit: { accent: 'cowbell', beat: 'cowbell', sub: 'cowbell' } }), sr);
    expect(r.samples.every(Number.isFinite)).toBe(true);
  });
});
