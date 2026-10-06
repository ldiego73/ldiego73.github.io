/**
 * Plays place motifs (./motifs.ts) in time with the world music.
 *
 *   motif layer notes -> layer panner -> motif gain (proximity, smoothed) -> place panner -> music bus
 *
 * The music bus is the engine's `musicBus` (follows the music's duck and pause), or the ambient bus on an older
 * player. Notes come from a small dedicated VoiceBank so the music's own polyphony is never stolen.
 * Without a music clock (nothing playing, an arcade track pushed, audio not live) no motif plays.
 */
import type { MusicClock } from "../../../audio/contract";
import { parseTrack } from "../../../audio/scheduler";
import { VoiceBank } from "../../../audio/voices";
import { dueSteps, MOTIFS, type Motif, motifAllowed, stepTime } from "./motifs";

/** How far ahead notes are scheduled (seconds). */
const AHEAD = 0.15;
/** Fade time constant of a motif's proximity gain (seconds). */
const FADE_TC = 0.7;

interface Slot {
  motif: Motif;
  gain: GainNode;
  place: StereoPannerNode | null;
  layerOut: AudioNode[];
  /** Last global step emitted. */
  last: number;
  /** Target proximity level 0..1. */
  target: number;
  sent: number;
  sentPan: number;
}

export class MotifPlayer {
  readonly voices: VoiceBank;
  private slots = new Map<string, Slot>();
  private trackId: string | null = null;
  private range = { from: 0, to: -1 };
  private disposed = false;

  constructor(
    readonly ctx: BaseAudioContext,
    private dest: AudioNode,
    voices?: VoiceBank,
  ) {
    this.voices = voices ?? new VoiceBank(ctx, 12);
  }

  private slot(id: string): Slot | null {
    let s = this.slots.get(id);
    if (s) return s;
    const motif = MOTIFS[id];
    if (!motif) return null;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let place: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === "function") {
      place = ctx.createStereoPanner();
      gain.connect(place);
      place.connect(this.dest);
    } else gain.connect(this.dest);
    const layerOut = motif.layers.map((l) => {
      if (!l.pan || typeof ctx.createStereoPanner !== "function") return gain as AudioNode;
      const p = ctx.createStereoPanner();
      p.pan.value = l.pan;
      p.connect(gain);
      return p as AudioNode;
    });
    s = { motif, gain, place, layerOut, last: -1, target: 0, sent: 0, sentPan: 0 };
    this.slots.set(id, s);
    return s;
  }

  /**
   * Sets the proximity level (0..1) and stereo position of a place motif. Levels not set this call keep their
   * previous value, so call it for every place each probe (0 to fade one out).
   */
  set(id: string, level: number, pan: number) {
    if (this.disposed) return;
    const s = level > 0.005 ? this.slot(id) : this.slots.get(id);
    if (!s) return;
    s.target = Math.max(0, Math.min(1, level));
    const now = this.ctx.currentTime;
    if (Math.abs(s.target - s.sent) > 0.01 || (s.target === 0 && s.sent !== 0)) {
      const g = s.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(s.target * s.motif.level, now, FADE_TC);
      s.sent = s.target;
    }
    if (s.place && Math.abs(pan - s.sentPan) > 0.03) {
      const p = s.place.pan;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.3);
      s.sentPan = pan;
    }
  }

  /** Every frame: schedules the notes of every audible motif that fall in the next few hundred ms. */
  update(clock: MusicClock | null) {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const id = clock?.trackId ?? null;
    if (id !== this.trackId) {
      // new grid (day/night/summit swap or the music stopped): restart every motif from the current step
      this.trackId = id;
      for (const s of this.slots.values()) s.last = clock ? clock.step - 1 : -1;
    }
    if (!clock) return;
    for (const s of this.slots.values()) {
      if (s.target <= 0.005) {
        s.last = clock.step - 1; // resume in time when it comes back
        continue;
      }
      if (!motifAllowed(s.motif, clock.trackId)) {
        s.last = clock.step - 1;
        continue;
      }
      if (s.last < 0) s.last = clock.step - 1;
      const { from, to } = dueSteps(clock, s.last, now, AHEAD, this.range);
      if (to < from) continue;
      const parsed = parseTrack(s.motif);
      for (let step = from; step <= to; step++) {
        const time = stepTime(clock, step);
        for (let li = 0; li < parsed.length; li++) {
          const p = parsed[li];
          if (!p) continue;
          const ev = p.byStep[step % p.length];
          if (!ev) continue;
          this.voices.play(p.layer.voice, s.layerOut[li] ?? s.gain, {
            time: Math.max(time, now),
            dur: ev.len * clock.stepSec,
            midi: ev.midi === null ? null : ev.midi + 12 * (p.layer.octave ?? 0),
            vel: ev.vel,
            gain: p.layer.gain ?? 0.2,
            bright: 0.45,
          });
        }
      }
      s.last = to;
    }
  }

  /** Current target level of a motif (tests / diagnostics). */
  level(id: string): number {
    return this.slots.get(id)?.target ?? 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.slots.values()) {
      s.gain.disconnect();
      s.place?.disconnect();
      for (const n of s.layerOut) if (n !== s.gain) n.disconnect();
    }
    this.slots.clear();
  }
}
