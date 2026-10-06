/**
 * Audio graph + track runners on top of any BaseAudioContext (live or offline).
 *
 *   TrackRunner.gain -> duck -> pause -> master -> limiter -> destination
 *   music bus (place motifs) -> duck ...       (layers that belong to the music: ducked and paused with it)
 *   stinger bus ---------------------------^
 *   sfx bus / ambient bus -----------------^   (world one-shots and soundscape: same mute/volume, no music duck)
 */
import type { MusicClock, Stinger, Track } from "./contract";
import { Scheduler, slew, stepSeconds } from "./scheduler";
import { STINGERS } from "./stingers";
import { VoiceBank } from "./voices";

/** Perceptual volume curve (0..1 -> linear gain). */
export const volumeToGain = (v: number) => Math.min(1, Math.max(0, v)) ** 1.5;

export const LOOKAHEAD = 0.12;
/** SFX bus level relative to the music (slightly under it). */
export const SFX_LEVEL = 0.8;
export const TICK_MS = 25;

export class TrackRunner {
  readonly gain: GainNode;
  /** Smoothed intensity actually used for scheduling. */
  intensity: number;
  private sched: Scheduler;
  private panners = new Map<number, StereoPannerNode>();
  disposed = false;

  constructor(
    private engine: AudioEngine,
    readonly track: Track,
    startTime: number,
    intensity: number,
  ) {
    this.intensity = intensity;
    this.sched = new Scheduler(track, startTime);
    this.gain = engine.ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(engine.duckNode);
  }

  private dest(layer: number, pan: number): AudioNode {
    if (!pan || typeof this.engine.ctx.createStereoPanner !== "function") return this.gain;
    let p = this.panners.get(layer);
    if (!p) {
      p = this.engine.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.gain);
      this.panners.set(layer, p);
    }
    return p;
  }

  /** Schedules everything that falls before `until`. `now` drops events a stalled timer let slip by. */
  schedule(until: number, now: number, target: number, dt: number) {
    if (this.disposed) return;
    this.intensity = slew(this.intensity, target, dt);
    for (const e of this.sched.collect(until, this.intensity, now - 0.04)) {
      this.engine.voices.play(e.voice, this.dest(e.layer, e.pan), {
        time: Math.max(e.time, now),
        dur: e.dur,
        midi: e.midi,
        vel: e.vel,
        gain: e.gain,
        bright: this.intensity,
      });
    }
  }

  /** Offline helper: schedule the whole range at a fixed intensity. */
  scheduleRange(untilSeconds: number) {
    if (this.disposed) return;
    for (const e of this.sched.collect(untilSeconds, this.intensity)) {
      this.engine.voices.play(e.voice, this.dest(e.layer, e.pan), {
        time: e.time,
        dur: e.dur,
        midi: e.midi,
        vel: e.vel,
        gain: e.gain,
        bright: this.intensity,
      });
    }
  }

  /** Where this runner is on its step grid (for layers that play in time with the music). */
  clock(out: MusicClock = { trackId: "", step: 0, time: 0, stepSec: 0, swing: 0 }): MusicClock {
    out.trackId = this.track.id;
    out.step = this.sched.step;
    out.time = this.sched.time;
    out.stepSec = stepSeconds(this.track, this.intensity);
    out.swing = Math.min(0.5, Math.max(0, this.track.swing ?? 0));
    return out;
  }

  fadeIn(ms: number) {
    const g = this.gain.gain;
    const now = this.engine.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(1, now + Math.max(0.01, ms / 1000));
  }

  /** Fades out and disconnects once the fade (plus a short tail) is over. */
  fadeOut(ms: number, onGone?: () => void) {
    this.disposed = true;
    const g = this.gain.gain;
    const now = this.engine.ctx.currentTime;
    const sec = Math.max(0.02, ms / 1000);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + sec);
    setTimeout(
      () => {
        this.gain.disconnect();
        onGone?.();
      },
      sec * 1000 + 200,
    );
  }
}

export class AudioEngine {
  readonly voices: VoiceBank;
  readonly duckNode: GainNode;
  private pauseNode: GainNode;
  private master: GainNode;
  private stingerBus: GainNode;
  /** One-shot sound effects (src/audio/sfx.ts). Sits a little under the music. */
  readonly sfxBus: GainNode;
  /** Continuous world soundscape; dipped while a stinger plays. */
  readonly ambientBus: GainNode;
  /** Extra music layers (world place motifs): same duck/pause as the tracks. */
  readonly musicBus: GainNode;
  private limiter: DynamicsCompressorNode;
  private clip: WaveShaperNode;

  constructor(readonly ctx: BaseAudioContext) {
    this.voices = new VoiceBank(ctx, 28);
    this.duckNode = ctx.createGain();
    this.pauseNode = ctx.createGain();
    this.master = ctx.createGain();
    this.stingerBus = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.duckNode.connect(this.pauseNode);
    this.pauseNode.connect(this.master);
    this.stingerBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(this.master);
    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = 1;
    this.ambientBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.duckNode);
    this.master.connect(this.limiter);
    // last-resort soft clip so a transient that slips past the limiter can never exceed full scale
    this.clip = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) {
      const x = Math.abs(i / 512 - 1);
      const y = x < 0.8 ? x : 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2);
      curve[i] = i < 512 ? -y : y;
    }
    this.clip.curve = curve;
    this.limiter.connect(this.clip);
    this.clip.connect(ctx.destination);
  }

  createRunner(track: Track, startTime: number, intensity: number) {
    return new TrackRunner(this, track, startTime, intensity);
  }

  private ramp(p: AudioParam, target: number, tc: number) {
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(target, now, tc);
  }

  /** Sets master level; ramped so mute/volume never click. */
  setLevel(volume: number, muted: boolean) {
    this.ramp(this.master.gain, muted ? 0 : volumeToGain(volume), 0.03);
  }

  /** Immediate level for offline rendering. */
  setLevelNow(volume: number) {
    this.master.gain.value = volumeToGain(volume);
  }

  /** Music level while paused or muted (stingers are not affected). */
  setPaused(paused: boolean) {
    this.ramp(this.pauseNode.gain, paused ? 0 : 1, 0.05);
  }

  /** Dips the music to `level`, holds `ms`, then recovers. */
  duck(level: number, ms: number) {
    const g = this.duckNode.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(Math.min(1, Math.max(0, level)), now, 0.04);
    if (level < 1) g.setTargetAtTime(1, now + ms / 1000, 0.18);
  }

  /** Dips the soundscape to `level`, holds `ms`, then recovers. */
  duckAmbient(level: number, ms: number) {
    const g = this.ambientBus.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(Math.min(1, Math.max(0, level)), now, 0.08);
    if (level < 1) g.setTargetAtTime(1, now + ms / 1000, 0.4);
  }

  stinger(name: Stinger) {
    const def = STINGERS[name];
    if (!def) return;
    const t0 = this.ctx.currentTime + 0.03;
    this.stingerBus.gain.value = def.gain;
    this.duck(def.duck, def.length * 1000 * 0.8);
    this.duckAmbient(Math.min(1, def.duck + 0.25), def.length * 1000 * 0.8);
    for (const n of def.notes) {
      this.voices.play(n.voice, this.stingerBus, {
        time: t0 + n.at,
        dur: n.dur,
        midi: n.midi,
        vel: n.vel,
        gain: 0.8,
        bright: 0.6,
      });
    }
  }

  /** Offline: render a stinger from time 0 with no duck. */
  scheduleStingerOffline(name: Stinger) {
    const def = STINGERS[name];
    this.stingerBus.gain.value = def.gain;
    for (const n of def.notes) {
      this.voices.play(n.voice, this.stingerBus, {
        time: 0.03 + n.at,
        dur: n.dur,
        midi: n.midi,
        vel: n.vel,
        gain: 0.8,
        bright: 0.6,
      });
    }
    return def.length + 1.2;
  }

  dispose() {
    this.musicBus.disconnect();
    this.sfxBus.disconnect();
    this.ambientBus.disconnect();
    this.master.disconnect();
    this.limiter.disconnect();
    this.clip.disconnect();
  }
}
