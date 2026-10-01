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

const IDLE_TEARDOWN_MS = 10 * 60 * 1000;
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
  private idleTimer?: number;
  private beat?: number;
  private cache?: { key: string; ac: AudioContext; loop: RenderedLoop; buf: AudioBuffer };
  private prepTimer?: number;
  private samples: { t: number; at: number }[] = [];
  playing = false;
  private starting = false;
  /** Shift the visual beat position to line up with what you hear (seconds, positive = delay visuals). */
  visualLatency = 0;
  onStateChange?: (playing: boolean) => void;
  onError?: (message: string) => void;
  private meta: MediaMeta = { title: 'Metronome' };

  constructor() {
    // iOS can freeze the page or interrupt audio (calls, alarms, other apps, long background) while our state
    // still says "playing". On return, verify sound is really flowing and heal or reset.
    const onReturn = () => {
      if (document.hidden) return;
      this.heal();
      this.verifySoon();
    };
    document.addEventListener('visibilitychange', onReturn);
    addEventListener('pageshow', onReturn);
    addEventListener('focus', onReturn);
    // A touch is a user gesture, which iOS requires to restart an interrupted context.
    addEventListener('pointerdown', () => this.heal(), true);
  }

  /** True unless the audio clock has visibly stalled relative to wall time. */
  private clockAlive() {
    const [a, b] = this.samples.slice(-2);
    if (!a || !b) return true;
    return b.t - a.t > 0.5 * (b.at - a.at);
  }

  /** Try to revive a context/element that iOS suspended behind our back. */
  private heal() {
    if (!this.ac || !this.audio) return;
    if (this.ac.state !== 'running') void this.ac.resume().catch(() => {});
    if (this.audio.paused) void this.audio.play().catch(() => {});
  }

  /** If the audio clock isn't advancing shortly after we return, playback is dead: reset to an honest stopped state. */
  private verifySoon() {
    if (!this.playing || !this.ac) return;
    const ac = this.ac;
    const t0 = ac.currentTime;
    setTimeout(() => {
      if (!this.playing || this.ac !== ac) return;
      if (ac.state === 'running' && ac.currentTime - t0 > 0.15) return;
      this.playing = false;
      this.teardown();
      this.updateMediaSession();
      this.onStateChange?.(false);
      this.onError?.('Audio was interrupted while the app was in the background. Tap play to restart.');
    }, 700);
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
    } else if (this.ac) {
      // paused: get the render out of the way now so resuming does no heavy work
      clearTimeout(this.prepTimer);
      this.prepTimer = window.setTimeout(() => { if (!this.playing && this.ac) this.prepared(this.ac); }, 250);
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
    clearTimeout(this.idleTimer);
    try {
      // After a pause we keep the graph alive so the lock-screen card survives; reuse it only if it's still healthy.
      const reuse = !!this.ac && !!this.audio && this.ac.state === 'running' && this.clockAlive();
      try {
        await this.begin(reuse);
      } catch (e) {
        if (!reuse) throw e;
        await this.begin(false); // stale graph: rebuild once
      }
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

  /** Everything needing the user gesture (context creation, audio.play()) happens before the first await. */
  private begin(reuse: boolean) {
    if (!reuse) this.buildGraph();
    this.launch(0);
    // While paused we keep the element playing silence, so there's normally nothing to start.
    const played = this.audio!.paused ? this.audio!.play() : Promise.resolve();
    void this.ac!.resume().catch(() => {});
    return played;
  }

  /**
   * Pause = mute, not stop. We keep the <audio> element playing a silent stream so iOS keeps the audio session (and
   * the lock-screen card) alive; resuming is then just unmuting a running engine, which works from the lock screen.
   * Pausing the element instead lets iOS suspend the audio engine within a minute, after which it can't be restarted
   * without an on-screen tap.
   */
  stop() {
    const was = this.playing;
    this.playing = false;
    clearTimeout(this.swapTimer);
    this.retire(this.voice, 0.01);
    this.voice = undefined;
    this.loop = undefined;
    this.updateMediaSession();
    // Don't hold the audio hardware forever if nobody comes back.
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => { if (!this.playing) this.teardown(); }, IDLE_TEARDOWN_MS);
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
    this.samples = [];
    this.beat = window.setInterval(() => {
      this.samples = [...this.samples, { t: ac.currentTime, at: performance.now() / 1000 }].slice(-3);
    }, 1000);
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
    clearTimeout(this.idleTimer);
    clearInterval(this.beat);
    clearTimeout(this.prepTimer);
    this.cache = undefined;
    this.samples = [];
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

  /**
   * The rendered loop for the current settings. Rendering is main-thread work, and a stall right when playback starts
   * makes WebKit's stream renderer nudge its playback rate (audible as a slight pitch change), so we cache the result
   * and re-render ahead of time whenever settings change.
   */
  private prepared(ac: AudioContext) {
    const c = this.cfg;
    const key = JSON.stringify([c.bpm, c.beats, c.subdivision, c.accentFirst, c.kit, c.volume]);
    if (this.cache?.key === key && this.cache.ac === ac) return this.cache;
    const loop = renderLoop(c, ac.sampleRate);
    const buf = ac.createBuffer(1, loop.samples.length, ac.sampleRate);
    buf.copyToChannel(loop.samples, 0);
    return (this.cache = { key, ac, loop, buf });
  }

  /** Start a new voice at `offset` seconds into the freshly rendered loop. */
  private launch(offset: number) {
    const ac = this.ac!;
    const { loop, buf } = this.prepared(ac);
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
    // Both buttons toggle: while paused we keep a silent stream playing, so iOS may still show a "pause" icon.
    ms.setActionHandler('play', () => { if (!this.playing) void this.start().catch(() => {}); });
    ms.setActionHandler('pause', () => { if (this.playing) this.stop(); else void this.start().catch(() => {}); });
    ms.setActionHandler('nexttrack', this.meta.onNext ?? null);
    ms.setActionHandler('previoustrack', this.meta.onPrevious ?? null);
  }
}
