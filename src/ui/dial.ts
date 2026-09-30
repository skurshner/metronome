import { MAX_BPM, MIN_BPM } from '../engine/pattern';

const DEG_PER_BPM = 6; // one full turn = 60 BPM

/** Endless rotary knob: dragging in a circle changes tempo. The knob's rotation always reflects the BPM. */
export function createDial(el: HTMLElement, onBpm: (bpm: number) => void) {
  const ring = el.querySelector<HTMLElement>('.dial-rot')!;
  let bpm = 120;
  let float = bpm;
  let last = 0;
  let active = false;

  const angleOf = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const paint = () => { ring.style.transform = `rotate(${bpm * DEG_PER_BPM}deg)`; };

  el.addEventListener('pointerdown', (e) => {
    active = true;
    float = bpm;
    last = angleOf(e);
    el.setPointerCapture(e.pointerId);
    el.classList.add('grabbed');
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const a = angleOf(e);
    let d = a - last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    last = a;
    float = Math.min(MAX_BPM, Math.max(MIN_BPM, float + d / DEG_PER_BPM));
    const next = Math.round(float);
    if (next !== bpm) onBpm(next);
  });
  const end = () => { active = false; el.classList.remove('grabbed'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { set(v: number) { bpm = v; if (!active) float = v; paint(); } };
}
