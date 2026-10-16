/**
 * Pure rules of the pampa's night visitor (../ufo.ts): where the tourist saucer comes down, when it passes and
 * which phase it is in at a given moment, and the shape of each phase's motion. No DOM, no three.js (tested in
 * logic.test.ts).
 *
 * The clock is "seconds of this night" (the ambient accumulates dt while the sky is dark and resets it at
 * dawn), not sky time: the sky starts at the visitor's real local hour and the T key tweens it, so a night
 * clock gives the same timings whenever the dark begins. First pass 20–40 s into the night, then a new pass
 * every 60–90 s (start to start) while it stays dark; a whole pass lasts PASS_SECONDS (< the shortest gap, so
 * passes never overlap). The gaps are a deterministic hash of the pass index and the night's seed.
 */

import { PAMPA, ROAD, TOWER } from "../../plan";
import { figures } from "../nazca/logic";

/** Phases of one pass, in order, with their length in seconds. */
export const PHASES = [
  // Glides in from high and far, decelerating over the spot.
  { id: "arrive", secs: 6 },
  // Hangs there, beam on, over the grazing alpaca.
  { id: "hover", secs: 2 },
  // The alpaca rises in the beam, spinning slowly, legs paddling, and is sucked in under the hull.
  { id: "lift", secs: 5 },
  // Nobody below; the saucer wobbles (a tourist taking photos of the lines).
  { id: "inside", secs: 3.5 },
  // The alpaca comes back down the beam, still spinning.
  { id: "lower", secs: 4 },
  // Beam off; the alpaca staggers in place under a ring of little stars.
  { id: "dizzy", secs: 4.5 },
  // Zips off up into the sky, accelerating.
  { id: "leave", secs: 3 },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

export const PASS_SECONDS = PHASES.reduce((s, p) => s + p.secs, 0);

/** Seconds into the night of the first pass (min + span · hash), then start-to-start gaps. */
export const FIRST = { min: 20, span: 20 } as const;
export const GAP = { min: 60, span: 30 } as const;

/** Hover height of the saucer's centre above the ground at the spot (clears the 14 u lookout deck). */
export const HOVER_H = 16;

/**
 * Where it comes down: north of the lookout tower, between the hummingbird and the condor (off every figure),
 * ~31 u from the road and ~33 u from the tower, so from the road by the mirador and from the tower's deck the
 * traveler is well within LOOK_R. Checked against the road and the figures in logic.test.ts.
 */
export const SPOT = { x: TOWER.x - 15, z: TOWER.z - 29 } as const;

/** A good look: the traveler within this many units of the spot (on the ground plane)… */
export const LOOK_R = 60;
/** …with the saucer on screen for this long (seconds). */
export const LOOK_HOLD = 0.6;

/** Deterministic 0..1 hash of an integer pair. */
export function hash01(k: number, seed: number): number {
  let h = Math.imul(k + 1, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Start (night seconds) of pass k. */
export function passStart(k: number, seed: number): number {
  let t = FIRST.min + FIRST.span * hash01(0, seed);
  for (let i = 1; i <= k; i++) t += GAP.min + GAP.span * hash01(i, seed);
  return t;
}

export interface PassState {
  /** Index of the pass this moment belongs to (the latest that has started, or 0 before the first). */
  k: number;
  /** null between passes. */
  phase: PhaseId | null;
  /** 0..1 progress through the phase. */
  u: number;
  /** Seconds since the pass started (negative before the first pass). */
  s: number;
}

/** Which pass and phase `night` seconds into the night falls in. */
export function passAt(night: number, seed: number): PassState {
  let k = 0;
  let start = passStart(0, seed);
  if (night < start) return { k: 0, phase: null, u: 0, s: night - start };
  for (;;) {
    const next = start + GAP.min + GAP.span * hash01(k + 1, seed);
    if (night < next) break;
    k++;
    start = next;
  }
  let s = night - start;
  const total = s;
  for (const p of PHASES) {
    if (s < p.secs) return { k, phase: p.id, u: s / p.secs, s: total };
    s -= p.secs;
  }
  return { k, phase: null, u: 0, s: total };
}

const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeIn = (u: number) => u * u * u;
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/**
 * Saucer offset from its hover point (spot, HOVER_H up) for the phase: it arrives from `from` (an angle, so
 * each pass comes from another side) 150 u out and 70 u up, and leaves 90 u sideways and 160 u up. `null`
 * means hidden. Wobble (tilt) is the view's business.
 */
export function saucerOffset(
  phase: PhaseId | null,
  u: number,
  from: number,
): { x: number; y: number; z: number } | null {
  if (!phase) return null;
  if (phase === "arrive") {
    const k = 1 - easeOut(u);
    return { x: Math.cos(from) * 150 * k, y: 70 * k * k, z: Math.sin(from) * 150 * k };
  }
  if (phase === "leave") {
    const k = easeIn(u);
    return { x: -Math.cos(from) * 90 * k, y: 160 * k, z: -Math.sin(from) * 90 * k };
  }
  return { x: 0, y: 0, z: 0 };
}

/**
 * How far up the beam the alpaca is (0 on the ground, 1 tucked under the hull) and its scale (it shrinks
 * as it is sucked in and grows back as it comes out; 0 = inside, hidden).
 */
export function alpacaLift(phase: PhaseId | null, u: number): { up: number; scale: number } {
  if (phase === "lift") {
    const up = u * u * (3 - 2 * u);
    return { up, scale: 1 - clamp01((u - 0.85) / 0.15) };
  }
  if (phase === "inside") return { up: 1, scale: 0 };
  if (phase === "lower") {
    const d = 1 - u;
    return { up: d * d * (3 - 2 * d), scale: clamp01(u / 0.15) };
  }
  return { up: 0, scale: 1 };
}

/** Beam strength 0..1: fades in over the hover, on through lift/inside/lower, fades at the dizzy's start. */
export function beamLevel(phase: PhaseId | null, u: number): number {
  switch (phase) {
    case "arrive":
      return clamp01((u - 0.85) / 0.15) * 0.4;
    case "hover":
      return 0.4 + 0.6 * clamp01(u / 0.6);
    case "lift":
    case "inside":
    case "lower":
      return 1;
    case "dizzy":
      return 1 - clamp01(u / 0.15);
    default:
      return 0;
  }
}

/** Phases in which a good look counts (the saucer is over the spot, not a speck far away). */
export function lookable(phase: PhaseId | null): boolean {
  return phase !== null && phase !== "arrive" && phase !== "leave";
}

/** Distance from (x, z) to the road centreline (brute force; tests and one-off checks only). */
export function roadDistance(x: number, z: number): number {
  let best = Infinity;
  for (const p of ROAD.pts) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z));
  return best;
}

/** Clear of every geoglyph's footprint (a circle of 1.15 × its half-extent plus a margin). */
export function clearOfFigures(x: number, z: number, margin = 4): boolean {
  return figures().every((f) => Math.hypot(f.x - x, f.z - z) > f.size * 1.15 + margin);
}

/** On the low pampa (north of where the plateau eases down). */
export const onPampa = (z: number) => z < PAMPA.z1;

/**
 * The theremin's pitch (Hz) for the phase: a falling "woooo" as it arrives, a steady wavering note while it
 * hovers, a slow rise as the alpaca goes up (and fall as it comes down), a warble inside and a fast zip up
 * as it leaves. The view adds the vibrato and glides between targets.
 */
export function humPitch(phase: PhaseId | null, u: number): number {
  switch (phase) {
    case "arrive":
      return 880 - 360 * easeOut(u);
    case "hover":
      return 520;
    case "lift":
      return 520 + 260 * u;
    case "inside":
      return 780 + 40 * Math.sin(u * Math.PI * 6);
    case "lower":
      return 780 - 300 * u;
    case "dizzy":
      return 480;
    case "leave":
      return 480 + 1400 * easeIn(u);
    default:
      return 520;
  }
}
