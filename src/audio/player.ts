import type { AudioOutput, AudioState, MusicPlayer, PlayOptions, Stinger, Track } from "./contract";
import { AudioEngine, LOOKAHEAD, TICK_MS, type TrackRunner } from "./engine";
import { loadSettings, saveSettings } from "./settings";

interface Entry {
  track: Track;
  intensity: number;
}

const DEFAULT_FADE = 600;
type Listener = (s: AudioState) => void;

/** Silent fallback used whenever Web Audio is unavailable (SSR, old browsers). */
export class NoopPlayer implements MusicPlayer {
  state: AudioState;
  private listeners = new Set<Listener>();
  constructor() {
    const s = loadSettings();
    this.state = { muted: s.muted, volume: s.volume, playing: false, trackId: null };
  }
  async unlock() {}
  play() {}
  stop() {}
  push() {}
  pop() {}
  pause() {}
  resume() {}
  setIntensity() {}
  duck() {}
  stinger() {}
  setMuted(muted: boolean) {
    this.state = { ...this.state, muted };
    saveSettings(this.state);
    for (const cb of this.listeners) cb(this.state);
  }
  setVolume(volume: number) {
    this.state = { ...this.state, volume: Math.min(1, Math.max(0, volume)) };
    saveSettings(this.state);
    for (const cb of this.listeners) cb(this.state);
  }
  onChange(cb: Listener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

/**
 * The real player. Keeps a logical model (current track, intensity, stack) that is always valid, and syncs the
 * audio graph to it once the AudioContext exists and is running. So requests made before the first user gesture
 * simply start when `unlock()` succeeds.
 */
export class Player implements MusicPlayer {
  state: AudioState;
  private listeners = new Set<Listener>();
  private ctx: AudioContext | null = null;
  private engine: AudioEngine | null = null;
  private out: AudioOutput | null = null;
  private unlocking: Promise<void> | null = null;

  private current: Entry | null = null;
  private stack: Entry[] = [];
  private intensity = 0;
  private active: TrackRunner | null = null;
  private userPaused = false;
  private hidden = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTick = 0;

  constructor() {
    const s = loadSettings();
    this.state = { muted: s.muted, volume: s.volume, playing: false, trackId: null };
    if (typeof document !== "undefined") {
      this.hidden = document.hidden;
      document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  // ------------------------------------------------------------------ state

  private emit() {
    const playing = this.current !== null && !this.userPaused;
    const trackId = this.current?.track.id ?? null;
    const s = this.state;
    if (s.playing !== playing || s.trackId !== trackId) this.state = { ...s, playing, trackId };
    for (const cb of this.listeners) cb(this.state);
  }

  onChange(cb: Listener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private onVisibility = () => {
    this.hidden = document.hidden;
    this.syncRun();
  };

  // ------------------------------------------------------------------ unlock

  unlock(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") return Promise.resolve();
    if (this.unlocking) return this.unlocking;
    // The context must be created/resumed synchronously inside the gesture handler.
    try {
      if (!this.ctx) {
        const Ctor =
          globalThis.AudioContext ??
          (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return Promise.resolve();
        this.ctx = new Ctor({ latencyHint: "interactive" });
        this.engine = new AudioEngine(this.ctx);
        this.out = {
          ctx: this.ctx,
          sfx: this.engine.sfxBus,
          ambient: this.engine.ambientBus,
          voices: this.engine.voices,
        };
        this.engine.setLevel(this.state.volume, this.state.muted);
      }
      const ctx = this.ctx;
      this.unlocking = ctx
        .resume()
        .catch(() => {})
        .then(() => {
          this.unlocking = null;
          this.syncRun();
          this.applyTrack(DEFAULT_FADE);
          this.emit(); // lets effects/ambience know output() may be live now
        });
    } catch {
      this.ctx = null;
      this.engine = null;
      this.out = null;
      return Promise.resolve();
    }
    return this.unlocking;
  }

  /** True when audio is allowed to sound (context created and running). */
  private get live() {
    return !!this.ctx && !!this.engine && this.ctx.state === "running";
  }

  private get wantRun() {
    return !this.userPaused && !this.hidden && !this.state.muted;
  }

  /** Starts/stops the scheduling timer and the context so a paused or muted page costs no CPU. */
  private syncRun() {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine) return;
    const want = this.wantRun;
    if (want) {
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (ctx.state !== "running") void ctx.resume().catch(() => {});
      engine.setPaused(false);
      if (!this.timer && this.current) this.startTimer();
      this.running = true;
    } else if (this.running || ctx.state === "running") {
      engine.setPaused(true);
      this.running = false;
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        this.stopTimer();
        if (!this.wantRun && ctx.state === "running") void ctx.suspend().catch(() => {});
      }, 220);
    }
  }

  private startTimer() {
    if (this.timer) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const ctx = this.ctx;
    if (ctx?.state !== "running" || !this.running) return;
    const t = performance.now();
    const dt = Math.min(0.25, (t - this.lastTick) / 1000);
    this.lastTick = t;
    this.active?.schedule(ctx.currentTime + LOOKAHEAD, ctx.currentTime, this.intensity, dt);
  }

  // ------------------------------------------------------------------ audio sync

  /** Brings the audio graph in line with `current`. */
  private applyTrack(fadeMs: number) {
    const engine = this.engine;
    const ctx = this.ctx;
    if (!engine || !ctx || !this.live) return;
    const cur = this.current;
    if (this.active && cur && this.active.track.id === cur.track.id) return;
    if (this.active) {
      this.active.fadeOut(fadeMs);
      this.active = null;
    }
    if (cur) {
      const r = engine.createRunner(cur.track, ctx.currentTime + 0.06, cur.intensity);
      r.fadeIn(fadeMs);
      this.active = r;
      this.startTimer();
      this.lastTick = performance.now();
    } else this.stopTimer();
    this.syncRun();
  }

  // ------------------------------------------------------------------ MusicPlayer

  play(track: Track, opts: PlayOptions = {}) {
    if (opts.intensity !== undefined) this.intensity = clamp01(opts.intensity);
    this.current = { track, intensity: this.intensity };
    this.userPaused = false;
    this.applyTrack(opts.fadeMs ?? DEFAULT_FADE);
    this.syncRun();
    this.emit();
  }

  stop(fadeMs = DEFAULT_FADE) {
    this.current = null;
    this.stack = [];
    this.userPaused = false;
    this.applyTrack(fadeMs);
    this.syncRun();
    this.emit();
  }

  push(track: Track, opts: PlayOptions = {}) {
    if (this.current) this.stack.push({ track: this.current.track, intensity: this.intensity });
    this.play(track, opts);
  }

  pop(opts: PlayOptions = {}) {
    const prev = this.stack.pop();
    if (!prev) return;
    this.intensity = opts.intensity !== undefined ? clamp01(opts.intensity) : prev.intensity;
    this.current = { track: prev.track, intensity: this.intensity };
    this.userPaused = false;
    this.applyTrack(opts.fadeMs ?? DEFAULT_FADE);
    this.syncRun();
    this.emit();
  }

  pause() {
    if (this.userPaused) return;
    this.userPaused = true;
    this.syncRun();
    this.emit();
  }

  resume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.syncRun();
    this.emit();
  }

  setIntensity(value: number) {
    this.intensity = clamp01(value);
    if (this.current) this.current = { ...this.current, intensity: this.intensity };
  }

  duck(level: number, ms = 600) {
    if (!this.live) return;
    this.engine?.duck(clamp01(level), ms);
  }

  stinger(name: Stinger) {
    if (!this.live || this.state.muted || this.hidden || this.userPaused) return;
    this.engine?.stinger(name);
  }

  output(): AudioOutput | null {
    if (!this.out || !this.live || this.state.muted || this.hidden || this.userPaused) return null;
    return this.out; // built once at unlock: callers poll this every frame
  }

  setMuted(muted: boolean) {
    if (muted === this.state.muted) return;
    this.state = { ...this.state, muted };
    saveSettings(this.state);
    this.engine?.setLevel(this.state.volume, muted);
    this.syncRun();
    this.emit();
  }

  setVolume(volume: number) {
    const v = clamp01(volume);
    this.state = { ...this.state, volume: v };
    saveSettings(this.state);
    this.engine?.setLevel(v, this.state.muted);
    this.emit();
  }

  dispose() {
    this.stopTimer();
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.engine?.dispose();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.engine = null;
    this.out = null;
    this.active = null;
    this.listeners.clear();
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

let player: MusicPlayer | null = null;

/** Shared singleton used by the arcade and the 3D world so a game opened inside the world can take over the music. */
export function getMusic(): MusicPlayer {
  if (!player) {
    const supported =
      typeof globalThis.AudioContext !== "undefined" ||
      typeof (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined";
    player = supported ? new Player() : new NoopPlayer();
  }
  return player;
}
