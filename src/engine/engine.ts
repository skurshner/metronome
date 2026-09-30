import { barOnsets, clampConfig, DEFAULT_CONFIG, type MetronomeConfig } from './pattern';
import { renderLoop, type RenderedLoop } from './render';

export interface Position {
  playing: boolean;
  beat: number; // 0-based beat in bar
  sub: number; // 0-based subdivision index within beat
  /** 0..1 progress through the current bar */
  barPhase: number;
}

export interface MediaMeta {
  title: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

const FADE = 0.006; // seconds; hides the discontinuity when the loop is swapped

/**
 * Plays a seamless, pre-rendered click loop.
 * Web Audio (gapless AudioBufferSource loop) -> MediaStream -> <audio> element.
 * The <audio> element is what lets iOS keep playing with the screen locked.
 */
export class MetronomeEngine {
  private cfg: MetronomeConfig = { ...DEFAULT_CONFIG };
  private ac?: AudioContext;
  private dest?: MediaStreamAudioDestinationNode;
  private audio?: HTMLAudioElement;
  private voice?: { src: AudioBufferSourceNode; gain: GainNode };
  private loop?: RenderedLoop;
  private loopStart = 0; // ac time the current loop started
  private loopOffset = 0; // seconds into the buffer at loopStart
  private swapTimer?: number;
  playing = false;
  private starting = false;
  /** Shift the visual beat position to line up with what you hear (seconds, positive = delay visuals). */
  visualLatency = 0;
  onStateChange?: (playing: boolean) => void;
  onError?: (message: string) => void;
  private meta: MediaMeta = { title: 'Metronome' };

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.playing && this.ac && this.ac.state !== 'running') void this.ac.resume().catch(() => {});
    });
  }

  get config(): MetronomeConfig {
    return this.cfg;
  }

  setConfig(patch: Partial<MetronomeConfig>) {
    this.cfg = clampConfig({ ...this.cfg, ...patch });
    this.updateMediaSession();
    if (this.playing) {
      // debounce so dragging the dial doesn't re-render on every pixel
      clearTimeout(this.swapTimer);
      this.swapTimer = window.setTimeout(() => this.swap(), 30);
    }
  }

  setMediaMeta(m: MediaMeta) {
    this.meta = m;
    this.updateMediaSession();
  }

  /**
   * Builds a fresh audio graph on every start. Reusing a context/element across stop/start is fragile on iOS
   * (it may be suspended or "interrupted" while stopped), and everything that needs the user gesture
   * (AudioContext creation, audio.play()) must happen synchronously before the first await.
   */
  async start() {
    if (this.playing || this.starting) return;
    this.starting = true;
    try {
      this.buildGraph();
      this.launch(0);
      const played = this.audio!.play(); // synchronous call, still inside the tap
      void this.ac!.resume().catch(() => {});
      await played;
      this.playing = true;
      this.updateMediaSession();
      this.onStateChange?.(true);
    } catch (e) {
      this.teardown();
      this.onError?.(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      throw e;
    } finally {
      this.starting = false;
    }
  }

  stop() {
    const was = this.playing;
    this.playing = false;
    this.teardown();
    this.updateMediaSession();
    if (was) this.onStateChange?.(false);
  }

  toggle() {
    return this.playing ? (this.stop(), Promise.resolve()) : this.start().catch(() => {});
  }

  /** For on-screen diagnostics. */
  debugState() {
    return `ctx=${this.ac?.state ?? 'none'} audio=${this.audio ? (this.audio.paused ? 'paused' : 'playing') : 'none'}`;
  }

  getPosition(): Position {
    if (!this.playing || !this.ac || !this.loop) return { playing: false, beat: 0, sub: 0, barPhase: 0 };
    const t = this.ac.currentTime - this.loopStart - this.visualLatency + this.loopOffset;
    const inBar = ((t % this.loop.barSeconds) + this.loop.barSeconds) % this.loop.barSeconds;
    const beatSec = this.loop.barSeconds / this.cfg.beats;
    const beat = Math.min(this.cfg.beats - 1, Math.floor(inBar / beatSec));
    const onsets = barOnsets(this.cfg).filter((o) => o.beat === beat);
    const inBeat = inBar - beat * beatSec;
    let sub = 0;
    onsets.forEach((o, i) => {
      if (inBeat >= o.time - beat * beatSec - 1e-6) sub = i;
    });
    return { playing: true, beat, sub, barPhase: inBar / this.loop.barSeconds };
  }

  // ---- internals ----

  private buildGraph() {
    this.teardown();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx({ latencyHint: 'playback' });
    const dest = ac.createMediaStreamDestination();
    const audio = new Audio();
    audio.srcObject = dest.stream;
    this.ac = ac;
    this.dest = dest;
    this.audio = audio;
    // The lock screen or another app can pause the element behind our back; keep state honest.
    audio.addEventListener('pause', () => {
      if (this.audio === audio && this.playing) this.stop();
    });
    // iOS suspends the context for calls/alarms ('interrupted'); resume when we can.
    ac.addEventListener('statechange', () => {
      if (this.ac === ac && this.playing && ac.state !== 'running') void ac.resume().catch(() => {});
    });
  }

  private teardown() {
    clearTimeout(this.swapTimer);
    const { ac, audio, voice } = this;
    this.voice = undefined;
    this.loop = undefined;
    this.ac = this.dest = this.audio = undefined;
    try { voice?.src.stop(); } catch { /* already stopped */ }
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    void ac?.close().catch(() => {});
  }

  /** Start a new voice at `offset` seconds into the freshly rendered loop. */
  private launch(offset: number) {
    const ac = this.ac!;
    const loop = renderLoop(this.cfg, ac.sampleRate);
    const buf = ac.createBuffer(1, loop.samples.length, ac.sampleRate);
    buf.copyToChannel(loop.samples, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ac.createGain();
    const now = ac.currentTime;
    gain.gain.setValueAtTime(this.voice ? 0 : 1, now);
    if (this.voice) gain.gain.linearRampToValueAtTime(1, now + FADE);
    src.connect(gain).connect(this.dest!);
    src.start(now, offset);
    this.retire(this.voice, FADE);
    this.voice = { src, gain };
    this.loop = loop;
    this.loopStart = now;
    this.loopOffset = offset;
  }

  private retire(v: { src: AudioBufferSourceNode; gain: GainNode } | undefined, fade: number) {
    if (!v || !this.ac) return;
    const now = this.ac.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + Math.max(fade, 0.002));
    v.src.stop(now + Math.max(fade, 0.002) + 0.01);
  }

  /** Re-render after a config change, keeping our place in the bar so the beat doesn't jump. */
  private swap() {
    if (!this.playing || !this.ac || !this.loop) return;
    const old = this.loop;
    const elapsed = this.ac.currentTime - this.loopStart + this.loopOffset;
    const frac = (elapsed % old.barSeconds) / old.barSeconds;
    const newBar = (this.cfg.beats * 60) / this.cfg.bpm;
    this.launch(frac * newBar);
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const c = this.cfg;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: this.meta.title, artist: `${c.bpm} BPM · ${c.beats}/${c.denominator}`, album: 'Metronome' });
    ms.playbackState = this.playing ? 'playing' : 'paused';
    ms.setActionHandler('play', () => void this.start());
    ms.setActionHandler('pause', () => this.stop());
    ms.setActionHandler('nexttrack', this.meta.onNext ?? null);
    ms.setActionHandler('previoustrack', this.meta.onPrevious ?? null);
  }
}
