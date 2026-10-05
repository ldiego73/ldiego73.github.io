/**
 * Pure step scheduler (no Web Audio). Turns a Track + intensity + time window into note/drum events.
 * Time model: global step n happens at `base(n) (+ swing delay on odd steps)`. The base advances one step at a
 * time using the tempo at the moment of advancing, so the step position is continuous when tempo changes.
 */
import type { Layer, Track, VoiceName } from "./contract";
import { isDrum } from "./contract";
import { type LayerEvent, parseSteps, trackLoopSteps } from "./notation";

export interface ScheduledEvent {
  /** Audio time in seconds. */
  time: number;
  /** Note length in seconds (len * step duration). */
  dur: number;
  voice: VoiceName;
  /** MIDI note (octave shift applied), null for drums. */
  midi: number | null;
  vel: number;
  /** layer gain * soft gate * track normalization. */
  gain: number;
  pan: number;
  layer: number;
  /** Global step counter (not wrapped). */
  step: number;
}

interface ParsedLayer {
  layer: Layer;
  length: number;
  byStep: (LayerEvent | undefined)[];
  /** 0..1 how busy the layer is (sparse layers carry less energy). */
  activity: number;
}

function activityOf(layer: Layer, events: LayerEvent[], length: number): number {
  const covered = events.reduce((n, e) => n + (isDrum(layer.voice) ? 1.5 : Math.min(e.len, 4)), 0);
  return Math.min(1, (2 * covered) / Math.max(1, length));
}

const cache = new WeakMap<Track, ParsedLayer[]>();

export function parseTrack(track: Track): ParsedLayer[] {
  let parsed = cache.get(track);
  if (!parsed) {
    parsed = track.layers.map((layer) => {
      const { events, length } = parseSteps(layer.steps, isDrum(layer.voice));
      const byStep: (LayerEvent | undefined)[] = new Array(length);
      for (const e of events) byStep[e.step] = e;
      return { layer, length, byStep, activity: activityOf(layer, events, length) };
    });
    cache.set(track, parsed);
  }
  return parsed;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Width of the intensity band over which a layer fades in/out. */
export const GATE_WIDTH = 0.15;

/**
 * Soft gate 0..1. Fully on while minIntensity <= i <= maxIntensity, ramping to 0 over GATE_WIDTH just outside.
 */
export function layerGate(layer: Layer, intensity: number): number {
  const lo = layer.minIntensity ?? 0;
  const hi = layer.maxIntensity ?? 1;
  const up = lo <= 0 ? 1 : clamp01((intensity - (lo - GATE_WIDTH)) / GATE_WIDTH);
  const down = hi >= 1 ? 1 : clamp01((hi + GATE_WIDTH - intensity) / GATE_WIDTH);
  return Math.min(up, down);
}

export const tempoScale = (track: Track, intensity: number) => lerp(1, track.tempoBoost ?? 1.12, clamp01(intensity));

export const stepSeconds = (track: Track, intensity: number) =>
  60 / (track.bpm * tempoScale(track, intensity)) / (track.stepsPerBeat ?? 4);

/** Reference level so tracks land near the same loudness whatever the number of audible layers. */
export const NORMALIZATION_REF = 0.28;

/** Rough nominal loudness of each voice at gain 1, matching the amplitudes chosen in voices.ts. */
export const VOICE_LEVEL: Record<VoiceName, number> = {
  pulse12: 0.3,
  pulse25: 0.3,
  pulse50: 0.3,
  triangle: 0.6,
  saw: 0.22,
  bell: 0.4,
  pad: 0.35,
  quena: 0.45,
  zampona: 0.5,
  charango: 0.3,
  kick: 0.8,
  snare: 0.5,
  hat: 0.15,
  shaker: 0.25,
  bombo: 0.8,
};

/** Gain compensation from the currently audible layers (incoherent sum: power adds). */
export function trackNormalization(track: Track, intensity: number): number {
  let power = 0;
  for (const p of parseTrack(track)) {
    const g = (p.layer.gain ?? 0.6) * layerGate(p.layer, intensity) * VOICE_LEVEL[p.layer.voice];
    power += g * g * (0.05 + 0.95 * p.activity);
  }
  return Math.min(5, Math.max(0.4, NORMALIZATION_REF / Math.sqrt(Math.max(power, 0.002))));
}

/** Moves `current` toward `target` at most `dt / rampSeconds` per call (full range in rampSeconds). */
export function slew(current: number, target: number, dt: number, rampSeconds = 1.2): number {
  const max = Math.max(0, dt) / rampSeconds;
  return Math.abs(target - current) <= max ? target : current + Math.sign(target - current) * max;
}

export class Scheduler {
  private parsed: ParsedLayer[];
  /** Next global step to emit. */
  private nextStep = 0;
  /** Un-swung audio time of nextStep. */
  private nextBase: number;
  readonly loopSteps: number;

  constructor(
    readonly track: Track,
    startTime = 0,
  ) {
    this.parsed = parseTrack(track);
    this.nextBase = startTime;
    this.loopSteps = trackLoopSteps(track);
  }

  get step() {
    return this.nextStep;
  }

  /** Audio time at which the next un-swung step falls. */
  get time() {
    return this.nextBase;
  }

  /**
   * Returns every event whose time is < `until`, advancing the clock. Events earlier than `skipBefore`
   * (a stalled timer) are dropped instead of being fired in a burst.
   */
  collect(until: number, intensity: number, skipBefore = Number.NEGATIVE_INFINITY): ScheduledEvent[] {
    const out: ScheduledEvent[] = [];
    const swing = Math.min(0.5, Math.max(0, this.track.swing ?? 0));
    const norm = trackNormalization(this.track, intensity);
    const gates = this.parsed.map((p) => layerGate(p.layer, intensity));
    // a runaway guard: at most ~4000 steps per call
    for (let guard = 0; guard < 4000; guard++) {
      const dur = stepSeconds(this.track, intensity);
      const time = this.nextBase + (this.nextStep % 2 === 1 ? swing * dur : 0);
      if (time >= until) break;
      if (time >= skipBefore) {
        for (let li = 0; li < this.parsed.length; li++) {
          const p = this.parsed[li] as ParsedLayer;
          const gate = gates[li] as number;
          if (gate < 0.02) continue;
          const ev = p.byStep[this.nextStep % p.length];
          if (!ev) continue;
          out.push({
            time,
            dur: ev.len * dur,
            voice: p.layer.voice,
            midi: ev.midi === null ? null : ev.midi + 12 * (p.layer.octave ?? 0),
            vel: ev.vel,
            gain: (p.layer.gain ?? 0.6) * gate * norm,
            pan: p.layer.pan ?? 0,
            layer: li,
            step: this.nextStep,
          });
        }
      }
      this.nextBase += dur;
      this.nextStep++;
    }
    return out;
  }
}
