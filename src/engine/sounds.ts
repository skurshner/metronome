import type { KitId, Tier } from './pattern';

/** Pitch multiplier per tier so accents sound higher and subdivisions lower even with the same kit. */
export const TIER_PITCH: Record<Tier, number> = { accent: 1.25, beat: 1, sub: 0.85 };

export const KITS: Record<KitId, string> = {
  click: 'Click',
  woodblock: 'Woodblock',
  cowbell: 'Cowbell',
  hihat: 'Hi-hat',
  rim: 'Rim',
  beep: 'Beep',
  sidestick: 'Sidestick',
};

function noise(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x7fffffff) - 1;
}

const sine = (f: number, i: number, sr: number) => Math.sin((2 * Math.PI * f * i) / sr);

/** Synthesize one hit, peak-normalized to ~0.9. */
export function synth(kit: KitId, pitch: number, sr: number): Float32Array {
  const dur = { click: 0.04, woodblock: 0.08, cowbell: 0.3, hihat: 0.06, rim: 0.06, beep: 0.08, sidestick: 0.07 }[kit];
  const n = Math.round(dur * sr);
  const out = new Float32Array(n);
  const rnd = noise(12345);
  let hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = (k: number) => Math.exp(-t * k);
    let v = 0;
    switch (kit) {
      case 'click':
        v = (sine(1000 * pitch, i, sr) * env(150) + rnd() * env(600) * 0.4);
        break;
      case 'woodblock':
        v = sine(1800 * pitch, i, sr) * env(70) + sine(2700 * pitch, i, sr) * env(110) * 0.5;
        break;
      case 'cowbell':
        v = (Math.sign(sine(562 * pitch, i, sr)) + Math.sign(sine(845 * pitch, i, sr))) * 0.35 * env(14);
        break;
      case 'hihat': {
        const x = rnd();
        hp = x - (hp * 0.2 + x * 0.8); // crude high-pass
        v = (x - hp * 0.5) * env(90) * 0.9;
        break;
      }
      case 'rim':
        v = sine(1700 * pitch, i, sr) * env(120) * 0.6 + rnd() * env(250) * 0.6;
        break;
      case 'beep': {
        const a = Math.min(1, t / 0.004), r = Math.min(1, (dur - t) / 0.01);
        v = sine(1000 * pitch, i, sr) * a * r;
        break;
      }
      case 'sidestick':
        v = sine(420 * pitch, i, sr) * env(60) * 0.7 + rnd() * env(300) * 0.5;
        break;
    }
    out[i] = v;
  }
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const g = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < n; i++) out[i]! *= g;
  return out;
}
