import { barOnsets, barSeconds, barsForLoop, type MetronomeConfig, type Tier } from './pattern';
import { synth, TIER_PITCH } from './sounds';

export interface RenderedLoop {
  samples: Float32Array<ArrayBuffer>;
  /** Loop length in seconds (whole bars). */
  duration: number;
  barSeconds: number;
  bars: number;
}

const sampleCache = new Map<string, Float32Array>();
function hit(kit: MetronomeConfig['kit'][Tier], tier: Tier, sr: number) {
  const key = `${kit}|${tier}|${sr}`;
  let s = sampleCache.get(key);
  if (!s) sampleCache.set(key, (s = synth(kit, TIER_PITCH[tier], sr)));
  return s;
}

/** Render whole bars of the pattern into a seamless mono loop. Hit tails that cross the end wrap to the start. */
export function renderLoop(c: MetronomeConfig, sr: number): RenderedLoop {
  const barSec = barSeconds(c);
  const bars = barsForLoop(barSec);
  const len = Math.round(bars * barSec * sr);
  const buf = new Float32Array(new ArrayBuffer(len * 4));
  const onsets = barOnsets(c);
  for (let bar = 0; bar < bars; bar++) {
    for (const o of onsets) {
      const start = Math.round((bar * barSec + o.time) * sr);
      const s = hit(c.kit[o.tier], o.tier, sr);
      const g = c.volume[o.tier];
      for (let i = 0; i < s.length; i++) buf[(start + i) % len]! += s[i]! * g;
    }
  }
  for (let i = 0; i < len; i++) buf[i] = Math.tanh(buf[i]!); // soft clip overlapping hits
  return { samples: buf, duration: len / sr, barSeconds: barSec, bars };
}
