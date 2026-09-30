import type { MetronomeEngine } from '../engine/engine';
import { MAX_BPM, MIN_BPM, SUBDIVISIONS, type KitId, type SubdivisionId, type Tier } from '../engine/pattern';
import { KITS } from '../engine/sounds';
import { tempoName } from '../tempo';
import { createDial } from './dial';
import { icons, patternIcon } from './icons';
import { chips, openSheet, section } from './sheet';

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = i * 6;
  const major = i % 5 === 0;
  return `<line x1="50" y1="${major ? 3 : 4}" x2="50" y2="${major ? 8 : 7}" transform="rotate(${a} 50 50)" class="${major ? 'maj' : ''}"/>`;
}).join('');

export function mountApp(root: HTMLElement, engine: MetronomeEngine) {
  root.innerHTML = `
    <main class="screen">
      <header class="bars" id="bars"></header>
      <div class="brand">${icons.wave}<span id="title">Metronome</span></div>
      <div class="pad-row">
        <button class="pad" id="btn-sig" aria-label="Time signature"></button>
        <button class="pad" id="btn-sub" aria-label="Subdivision">${icons.notes}</button>
        <button class="pad" id="btn-more" aria-label="More settings">${icons.more}</button>
      </div>
      <section class="tempo">
        <div class="tempo-name" id="tname"></div>
        <button class="tempo-num" id="bpm" aria-label="Edit tempo"></button>
        <div class="tempo-unit">BPM</div>
      </section>
      <div class="dial-wrap">
        <div class="dial" id="dial" role="slider" aria-label="Tempo" aria-valuemin="${MIN_BPM}" aria-valuemax="${MAX_BPM}">
          <div class="dial-rot">
            <svg viewBox="0 0 100 100" class="ticks">${TICKS}</svg>
            <div class="knob"><i class="dimple"></i></div>
          </div>
        </div>
        <button class="pad play" id="play" aria-label="Start">${icons.play}</button>
        <button class="pad tap" id="tap">Tap</button>
      </div>
      <p class="toast" id="toast" role="status"></p>
    </main>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const dial = createDial($('dial'), (bpm) => { engine.setConfig({ bpm }); refresh(); });
  let litBeat = -1;
  let barsKey = '';

  // ---- main screen ----
  function refresh() {
    const c = engine.config;
    $('btn-sig').textContent = `${c.beats}/${c.denominator}`;
    $('bpm').textContent = String(c.bpm);
    $('tname').textContent = tempoName(c.bpm);
    $('dial').setAttribute('aria-valuenow', String(c.bpm));
    dial.set(c.bpm);
    const key = `${c.beats}|${c.accentFirst}`;
    if (key !== barsKey) {
      barsKey = key;
      // Segments show emphasis: beat 1 is tallest when accented.
      $('bars').innerHTML = Array.from({ length: c.beats }, (_, i) => {
        const lvl = i === 0 && c.accentFirst ? 3 : 2;
        return `<div class="bar lvl${lvl}"><b></b><b></b><b></b></div>`;
      }).join('');
      litBeat = -1;
    }
  }

  function toast(msg: string) {
    $('toast').textContent = msg;
  }

  // ---- sheets ----
  $('btn-sig').onclick = () => {
    const s = openSheet('Time signature', (body) => {
      const c = engine.config;
      body.append(
        section('Beats per bar', chips(Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), c.beats, (beats) => { engine.setConfig({ beats }); refresh(); s.refresh(); }, 'grid8')),
        section('Note value', chips([2, 4, 8, 16].map((v) => ({ value: v, label: String(v) })), c.denominator, (d) => { engine.setConfig({ denominator: d as 2 | 4 | 8 | 16 }); refresh(); s.refresh(); })),
      );
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = `BPM counts the ${c.denominator === 8 ? 'eighth' : c.denominator === 2 ? 'half' : c.denominator === 16 ? 'sixteenth' : 'quarter'} note.`;
      body.append(hint);
    });
  };

  $('btn-sub').onclick = () => {
    const s = openSheet('Subdivision', (body) => {
      const list = document.createElement('div');
      list.className = 'list';
      for (const [id, info] of Object.entries(SUBDIVISIONS)) {
        const b = document.createElement('button');
        b.className = `row${engine.config.subdivision === id ? ' on' : ''}`;
        b.innerHTML = `<span class="ico">${patternIcon(info.offsets)}</span><span>${info.label}</span>`;
        b.onclick = () => { engine.setConfig({ subdivision: id as SubdivisionId }); s.refresh(); };
        list.appendChild(b);
      }
      body.append(list);
    });
  };

  $('btn-more').onclick = () => {
    const tiers: [Tier, string][] = [['accent', 'Beat 1'], ['beat', 'Beat'], ['sub', 'Subdivision']];
    const kitOpts = (Object.entries(KITS) as [KitId, string][]).map(([value, label]) => ({ value, label }));
    const s = openSheet('Sound & emphasis', (body) => {
      const c = engine.config;
      const sw = document.createElement('button');
      sw.className = `switch${c.accentFirst ? ' on' : ''}`;
      sw.innerHTML = '<span>Accent beat 1</span><i></i>';
      sw.onclick = () => { engine.setConfig({ accentFirst: !engine.config.accentFirst }); refresh(); s.refresh(); };
      body.append(sw);
      for (const [t, label] of tiers) {
        body.append(section(`${label} sound`, chips(kitOpts, c.kit[t], (k) => { engine.setConfig({ kit: { ...engine.config.kit, [t]: k } }); s.refresh(); })));
      }
      const vols = document.createElement('div');
      vols.className = 'vols';
      for (const [t, label] of tiers) {
        const l = document.createElement('label');
        l.innerHTML = `<span>${label} volume</span><input type="range" min="0" max="1" step="0.05" value="${c.volume[t]}">`;
        l.querySelector('input')!.oninput = (e) => engine.setConfig({ volume: { ...engine.config.volume, [t]: +(e.target as HTMLInputElement).value } });
        vols.append(l);
      }
      const sync = document.createElement('label');
      sync.innerHTML = `<span>Visual sync</span><input type="range" min="0" max="300" step="10" value="${Math.round(engine.visualLatency * 1000)}">`;
      sync.querySelector('input')!.oninput = (e) => { engine.visualLatency = +(e.target as HTMLInputElement).value / 1000; };
      vols.append(sync);
      body.append(section('Levels', vols));
    });
  };

  $('bpm').onclick = () => {
    const s = openSheet('Tempo', (body) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = String(MIN_BPM);
      input.max = String(MAX_BPM);
      input.value = String(engine.config.bpm);
      input.className = 'bpm-input';
      const done = document.createElement('button');
      done.className = 'chip on wide';
      done.textContent = 'Done';
      const commit = () => { engine.setConfig({ bpm: Math.round(+input.value) || engine.config.bpm }); refresh(); s.close(); };
      done.onclick = commit;
      input.onkeydown = (e) => { if (e.key === 'Enter') commit(); };
      body.append(input, done);
      setTimeout(() => { input.focus(); input.select(); }, 280);
    });
  };

  // ---- transport ----
  $('play').onclick = () => { toast(''); void engine.toggle(); };
  engine.onStateChange = (p) => {
    $('play').innerHTML = p ? icons.pause : icons.play;
    $('play').setAttribute('aria-label', p ? 'Stop' : 'Start');
    $('play').classList.toggle('on', p);
    if (!p) { litBeat = -1; root.querySelectorAll('.bar.lit').forEach((b) => b.classList.remove('lit')); }
  };
  engine.onError = (m) => toast(`Couldn't start audio (${m})`);

  let taps: number[] = [];
  $('tap').onclick = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1]! > 2000) taps = [];
    taps = [...taps, now].slice(-8);
    if (taps.length > 1) {
      engine.setConfig({ bpm: Math.round(60000 / ((taps[taps.length - 1]! - taps[0]!) / (taps.length - 1))) });
      refresh();
    }
  };

  // beat bars follow the audio clock
  const showDebug = new URLSearchParams(location.search).has('debug');
  (function frame() {
    const p = engine.getPosition();
    const beat = p.playing ? p.beat : -1;
    if (beat !== litBeat) {
      litBeat = beat;
      root.querySelectorAll('#bars .bar').forEach((b, i) => b.classList.toggle('lit', i === beat));
    }
    if (showDebug) toast(engine.debugState());
    requestAnimationFrame(frame);
  })();

  refresh();
}
