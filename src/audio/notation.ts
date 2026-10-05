import type { Layer, ScaleName, Track } from "./contract";
import { isDrum } from "./contract";

export interface LayerEvent {
  /** Step index inside the layer's loop. */
  step: number;
  /** MIDI note number, or null for drum hits. */
  midi: number | null;
  /** 0..1 */
  vel: number;
  /** Length in steps (>= 1). */
  len: number;
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)(?::(\d*\.?\d+))?$/;
const HIT_RE = /^([xX])(?::(\d*\.?\d+))?$/;

export const SCALES: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

/** "C#" / "Bb" / "A" → pitch class 0..11, or null if invalid. */
export function pitchClass(name: string): number | null {
  const m = /^([A-Ga-g])([#b]?)$/.exec(name);
  if (!m) return null;
  const base = SEMITONE[(m[1] as string).toUpperCase()] as number;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (((base + acc) % 12) + 12) % 12;
}

/** "A4" → 69. Returns null if the name is not a valid note. */
export function noteToMidi(name: string): number | null {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  const base = SEMITONE[(m[1] as string).toUpperCase()] as number;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + base + acc;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Tokens of a step string (bar lines removed). */
export function tokens(steps: string): string[] {
  return steps.split(/\s+/).filter((t) => t && t !== "|");
}

/** Parses a step string. Throws an Error naming the bad token. */
export function parseSteps(steps: string, drum: boolean): { events: LayerEvent[]; length: number } {
  const list = tokens(steps);
  const events: LayerEvent[] = [];
  let last: LayerEvent | null = null;
  list.forEach((tok, step) => {
    if (tok === ".") {
      last = null;
      return;
    }
    if (tok === "-") {
      if (!last) throw new Error(`tie "-" at step ${step} has nothing to sustain`);
      last.len += 1;
      return;
    }
    if (drum) {
      const h = HIT_RE.exec(tok);
      if (!h) throw new Error(`invalid drum token "${tok}" at step ${step}`);
      const vel = h[2] !== undefined ? Number(h[2]) : h[1] === "X" ? 1 : 0.7;
      last = { step, midi: null, vel, len: 1 };
      events.push(last);
      return;
    }
    const m = NOTE_RE.exec(tok);
    const midi = noteToMidi(tok.split(":")[0] as string);
    if (!m || midi === null) throw new Error(`invalid note token "${tok}" at step ${step}`);
    const vel = m[4] !== undefined ? Number(m[4]) : 0.8;
    last = { step, midi, vel, len: 1 };
    events.push(last);
  });
  return { events, length: list.length };
}

export function layerLength(layer: Layer): number {
  return tokens(layer.steps).length;
}

/** Longest layer length in steps = the track's loop length. */
export function trackLoopSteps(track: Track): number {
  return track.layers.reduce((n, l) => Math.max(n, layerLength(l)), 0);
}

/**
 * Musical sanity checks. Returns a list of problems (empty = ok).
 * Enforces: tempo range, valid voices/tokens, every pitch inside the declared key,
 * sane MIDI range, clean loops (each layer divides the longest), a base layer at intensity 0.
 */
export function validateTrack(track: Track): string[] {
  const problems: string[] = [];
  const p = (msg: string) => problems.push(`${track.id}: ${msg}`);
  if (track.bpm < 60 || track.bpm > 200) p(`bpm ${track.bpm} outside 60..200`);
  if (track.layers.length < 2 || track.layers.length > 12) p(`needs 2..12 layers, has ${track.layers.length}`);
  const root = pitchClass(track.key.root);
  if (root === null) {
    p(`invalid key root "${track.key.root}"`);
    return problems;
  }
  const allowed = new Set<number>((SCALES[track.key.scale] ?? []).map((d) => (root + d) % 12));
  for (const e of track.key.extra ?? []) {
    const pc = pitchClass(e);
    if (pc === null) p(`invalid extra pitch class "${e}"`);
    else allowed.add(pc);
  }
  const loop = trackLoopSteps(track);
  if (loop < 16) p(`loop of ${loop} steps is too short (min 16)`);
  if (!track.layers.some((l) => (l.minIntensity ?? 0) === 0)) p("no layer is audible at intensity 0");
  track.layers.forEach((layer, i) => {
    const at = `layer ${i} (${layer.voice})`;
    const drum = isDrum(layer.voice);
    let parsed: ReturnType<typeof parseSteps>;
    try {
      parsed = parseSteps(layer.steps, drum);
    } catch (err) {
      p(`${at}: ${(err as Error).message}`);
      return;
    }
    if (parsed.length === 0) {
      p(`${at}: empty`);
      return;
    }
    if (loop % parsed.length !== 0) p(`${at}: length ${parsed.length} does not divide loop length ${loop}`);
    if (parsed.events.length === 0) p(`${at}: has no notes`);
    if ((layer.gain ?? 0.6) > 1 || (layer.gain ?? 0.6) < 0) p(`${at}: gain outside 0..1`);
    const lo = layer.minIntensity ?? 0;
    const hi = layer.maxIntensity ?? 1;
    if (lo > hi) p(`${at}: minIntensity > maxIntensity`);
    for (const ev of parsed.events) {
      if (ev.vel < 0 || ev.vel > 1) p(`${at}: velocity ${ev.vel} outside 0..1 at step ${ev.step}`);
      if (ev.midi === null) continue;
      const midi = ev.midi + 12 * (layer.octave ?? 0);
      if (midi < 24 || midi > 96) p(`${at}: MIDI ${midi} outside 24..96 at step ${ev.step}`);
      if (!allowed.has(((ev.midi % 12) + 12) % 12))
        p(`${at}: note at step ${ev.step} (MIDI ${ev.midi}) is outside the key`);
    }
  });
  return problems;
}
