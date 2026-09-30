import { MetronomeEngine } from './engine/engine';
import { MAX_BPM, MIN_BPM, SUBDIVISIONS, type KitId, type SubdivisionId, type Tier } from './engine/pattern';
import { KITS } from './engine/sounds';
import './style.css';

// Phase 1: rough functional UI to exercise the engine. Phase 2 replaces this with the Soundbrenner-style UI.
const engine = new MetronomeEngine();
const app = document.getElementById('app')!;
const opts = (o: Record<string, string>) => Object.entries(o).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
const kitOpts = opts(KITS);

app.innerHTML = `
  <h1>Metronome</h1>
  <div id="dots"></div>
  <label>BPM <output id="bpmOut"></output></label>
  <input id="bpm" type="range" min="${MIN_BPM}" max="${MAX_BPM}" step="1">
  <div class="row"><button id="minus">−1</button><button id="tap">Tap</button><button id="plus">+1</button></div>
  <div class="row">
    <label>Beats <input id="beats" type="number" min="1" max="16"></label>
    <label>Note <select id="den">${opts({ 2: '2', 4: '4', 8: '8', 16: '16' })}</select></label>
  </div>
  <label>Subdivision <select id="sub">${opts(Object.fromEntries(Object.entries(SUBDIVISIONS).map(([k, v]) => [k, v.label])))}</select></label>
  <label class="check"><input id="accent" type="checkbox"> Accent beat 1</label>
  <label>Beat 1 sound <select id="k-accent">${kitOpts}</select></label>
  <label>Beat sound <select id="k-beat">${kitOpts}</select></label>
  <label>Subdivision sound <select id="k-sub">${kitOpts}</select></label>
  <label>Subdivision volume <input id="v-sub" type="range" min="0" max="1" step="0.05"></label>
  <button id="play" class="big">Start</button>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const c = engine.config;

function sync() {
  const cfg = engine.config;
  $<HTMLInputElement>('bpm').value = String(cfg.bpm);
  $('bpmOut').textContent = String(cfg.bpm);
  $<HTMLInputElement>('beats').value = String(cfg.beats);
  $<HTMLSelectElement>('den').value = String(cfg.denominator);
  $<HTMLSelectElement>('sub').value = cfg.subdivision;
  $<HTMLInputElement>('accent').checked = cfg.accentFirst;
  (['accent', 'beat', 'sub'] as Tier[]).forEach((t) => ($<HTMLSelectElement>(`k-${t}`).value = cfg.kit[t]));
  $<HTMLInputElement>('v-sub').value = String(cfg.volume.sub);
  renderDots();
}

function renderDots() {
  $('dots').innerHTML = Array.from({ length: engine.config.beats }, (_, i) => `<i class="${i === 0 && engine.config.accentFirst ? 'first' : ''}"></i>`).join('');
}

$('bpm').oninput = (e) => { engine.setConfig({ bpm: +(e.target as HTMLInputElement).value }); sync(); };
$('minus').onclick = () => { engine.setConfig({ bpm: engine.config.bpm - 1 }); sync(); };
$('plus').onclick = () => { engine.setConfig({ bpm: engine.config.bpm + 1 }); sync(); };
$('beats').onchange = (e) => { engine.setConfig({ beats: +(e.target as HTMLInputElement).value }); sync(); };
$('den').onchange = (e) => { engine.setConfig({ denominator: +(e.target as HTMLSelectElement).value as 2 | 4 | 8 | 16 }); sync(); };
$('sub').onchange = (e) => { engine.setConfig({ subdivision: (e.target as HTMLSelectElement).value as SubdivisionId }); sync(); };
$('accent').onchange = (e) => { engine.setConfig({ accentFirst: (e.target as HTMLInputElement).checked }); sync(); };
(['accent', 'beat', 'sub'] as Tier[]).forEach((t) => {
  $(`k-${t}`).onchange = (e) => engine.setConfig({ kit: { ...engine.config.kit, [t]: (e.target as HTMLSelectElement).value as KitId } });
});
$('v-sub').oninput = (e) => engine.setConfig({ volume: { ...engine.config.volume, sub: +(e.target as HTMLInputElement).value } });

// tap tempo: average of the last few taps, reset after 2s of silence
let taps: number[] = [];
$('tap').onclick = () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1]! > 2000) taps = [];
  taps.push(now);
  taps = taps.slice(-6);
  if (taps.length > 1) {
    const avg = (taps[taps.length - 1]! - taps[0]!) / (taps.length - 1);
    engine.setConfig({ bpm: Math.round(60000 / avg) });
    sync();
  }
};

$('play').onclick = () => void engine.toggle();
engine.onStateChange = (p) => { $('play').textContent = p ? 'Stop' : 'Start'; };

// beat indicator
(function frame() {
  const p = engine.getPosition();
  document.querySelectorAll('#dots i').forEach((el, i) => el.classList.toggle('on', p.playing && i === p.beat));
  requestAnimationFrame(frame);
})();

sync();
void c;
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
