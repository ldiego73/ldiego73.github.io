/**
 * Pure logic of the midnight ukuku (../ukuku.ts): when it is out (the deep-night band of the sky clock), when
 * it may appear or vanish (only unseen, or on a clock jump such as the T key), its dance routine as joint
 * steps over time (which human action, the turn and drift on its spot: hops, spins, whip swings; a gentle sway
 * with prefers-reduced-motion), its greeting, the bell's beats, and the bell's loudness and pan by distance. No DOM, no three.js (tested in
 * logic.test.ts).
 *
 * The ukuku (ukuku: "bear" in Quechua) is the bear-dancer of the Qoyllur Rit'i pilgrimage: a shaggy fleece
 * costume, a knitted woollen mask, a whip, a little bell, a falsetto voice and a trickster's manners.
 */
import type { L } from "../../../contract";
import { PLAZA } from "../../plan";

export type P = { x: number; z: number };

/**
 * Where it dances: the quiet north-east quarter of the plaza, between the usnu, the north hall and the
 * Qorikancha. Clear of the street mouths (the Antisuyu mouth at (32, −24) is ~16 u away), of the north hall's
 * doorways (the nearest at (12, −22.8), ~11 u), of the usnu's braziers (±6.05) and of the llamas' night camp
 * on the west side. It faces south-west, toward the usnu, so the traveler coming from the centre sees its mask.
 */
export const SPOT = { x: 19, z: -13.5, yaw: Math.atan2(-19, 13.5) } as const;
/** It hops and spins about its spot but stays within this radius of it (on the flagstones). */
export const WANDER = 0.9;

/**
 * The midnight band of the sky clock (0 = midnight, 0.25 sunrise): from ≈ 21:36 (0.9) to ≈ 04:05 (0.17).
 * The T key (sky.ts toggle) lands at 0.93, inside it; with a 360 s sky day the band lasts ≈ 97 s of play.
 */
export const BAND: readonly [number, number] = [0.9, 0.17];
export const isMidnight = (time: number) => time >= BAND[0] || time <= BAND[1];

/**
 * The sky clock jumped (T key tween, dev hook, `setTime`): more than this much sky time in one frame. The
 * natural clock runs 1/360 per second (≈ 5e-5 per frame); the T tween crosses half a day in 2.6 s.
 */
export const JUMP = 0.002;
export function clockJumped(prev: number, now: number): boolean {
  let d = Math.abs(now - prev);
  d = Math.min(d, 1 - d);
  return d > JUMP;
}

/**
 * Should it be shown next frame? It appears or vanishes only while the traveler cannot see its spot, or at
 * once on a clock jump (or the first frame, `shown` null). Never in the middle of a greeting.
 */
export function nextShown(shown: boolean | null, want: boolean, seen: boolean, jumped: boolean, busy: boolean) {
  if (shown === null) return want;
  if (shown === want || busy) return shown;
  return !seen || jumped ? want : shown;
}

export type Move = "hop" | "spin" | "whip";
/** The routine, looped: steps and their lengths in seconds. */
export const ROUTINE: ReadonlyArray<{ move: Move; secs: number }> = [
  { move: "hop", secs: 4 },
  { move: "spin", secs: 2.5 },
  { move: "whip", secs: 4 },
  { move: "hop", secs: 3 },
  { move: "spin", secs: 2.5 },
  { move: "whip", secs: 3 },
];
export const ROUTINE_SECS = ROUTINE.reduce((s, r) => s + r.secs, 0);

/** The step at time t: which move, its index and the progress u ∈ [0, 1) through it. */
export function stepAt(t: number): { move: Move; i: number; u: number } {
  let s = ((t % ROUTINE_SECS) + ROUTINE_SECS) % ROUTINE_SECS;
  for (let i = 0; i < ROUTINE.length; i++) {
    const r = ROUTINE[i] as { move: Move; secs: number };
    if (s < r.secs) return { move: r.move, i, u: s / r.secs };
    s -= r.secs;
  }
  return { move: "hop", i: 0, u: 0 };
}

/**
 * The human animation controller's actions the ukuku dances with (../../../characters/poses.ts): "hop"
 * (foot to foot, arms out), "dance" (the huayno step-hop, one arm high: its spins), "wave" (an arm raised high:
 * the whip circling overhead in the right hand, or the greeting with the left), "hands-hips" (reduced motion).
 */
export type UkukuAction = "hop" | "dance" | "wave" | "hands-hips";

/** What the body does at a moment: the action (and its hand) plus the root's turn and offset on its spot. */
export interface Step {
  action: UkukuAction;
  /** 1 = the right hand leads (the whip hand), −1 = the left. */
  side: 1 | -1;
  /** Turn added to the facing (spins), radians. */
  turn: number;
  /** Small offset of the whole body on its spot (the spot's own frame: x right, z forward). */
  dx: number;
  dz: number;
  /** Spin rate of the whip's lash about the right hand (radians/s). */
  whip: number;
}

/**
 * The core "hop" pose bounces on |sin| of a 1.7 Hz wave: 3.4 landings a second. The bell rings on every other
 * landing (HOP_HZ a second), counted from the start of each step so it stays on the feet.
 */
export const HOP_HZ = 1.7;
const TAU = Math.PI * 2;
const smooth = (u: number) => u * u * (3 - 2 * u);

/** The dance at time t (seconds of dancing). Reduced motion: hands on the hips, a slow sway in place. */
export function danceStep(t: number, reduced: boolean, out?: Step): Step {
  const o = out ?? { action: "hop", side: 1, turn: 0, dx: 0, dz: 0, whip: 0 };
  o.side = 1;
  o.dx = 0;
  o.dz = 0;
  if (reduced) {
    o.action = "hands-hips";
    o.turn = Math.sin(t * 0.65) * 0.18;
    o.whip = 0.6;
    return o;
  }
  const { move, u } = stepAt(t);
  if (move === "hop") {
    // Foot to foot, drifting a little about the spot.
    o.action = "hop";
    o.turn = Math.sin(t * 0.7) * 0.35;
    o.dx = Math.sin(t * 0.9) * WANDER * 0.6;
    o.dz = Math.sin(t * 0.55) * WANDER * 0.4;
    o.whip = 3;
  } else if (move === "spin") {
    // Two whole turns, eased, on the huayno step.
    o.action = "dance";
    o.turn = smooth(u) * TAU * 2;
    o.whip = 6;
  } else {
    // The right arm raised, the lash circling overhead; a slow sway of the body.
    o.action = "wave";
    o.turn = Math.sin(t * 1.1) * 0.25;
    o.whip = 9;
  }
  return o;
}

/** The greeting: still, facing the traveler, the left arm waving high. */
export function greetStep(out?: Step): Step {
  const o = out ?? { action: "wave", side: -1, turn: 0, dx: 0, dz: 0, whip: 0 };
  o.action = "wave";
  o.side = -1;
  o.turn = 0;
  o.dx = 0;
  o.dz = 0;
  o.whip = 0.8;
  return o;
}

/**
 * Bell beats so far (ring when the count changes): while hopping, every other landing counted from the step's
 * start (HOP_HZ); in the spins and whip swings the same pulse; slower with reduced motion.
 */
export function beat(t: number, reduced: boolean): number {
  if (reduced) return Math.floor(t * 0.7);
  const loops = Math.floor(t / ROUTINE_SECS);
  const { i, u } = stepAt(t);
  const secs = (ROUTINE[i] as { secs: number }).secs;
  return (loops * ROUTINE.length + i) * 64 + Math.floor(u * secs * HOP_HZ);
}

/** Beyond this distance the bell is silent. */
export const BELL_FAR = 28;
/**
 * The bell's level by distance: full within a couple of steps, an inverse-square-ish falloff (half at 5 u),
 * faded to nothing at BELL_FAR so it never pops in.
 */
export function bellGain(d: number): number {
  if (d >= BELL_FAR) return 0;
  const near = 1 / (1 + (Math.max(0, d - 1.5) / 3.5) ** 2);
  return near * (1 - d / BELL_FAR);
}

/** Stereo pan −1..1 of a sound at (dx, dz) from the listener whose right is (rx, rz). */
export function panFor(dx: number, dz: number, rx: number, rz: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return 0;
  return Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8));
}

/** Facing (yaw: models face +Z) from a to b. */
export const yawTo = (a: P, b: P) => Math.atan2(b.x - a.x, b.z - a.z);

/** The greeting prompt shows within this distance of the dancer. */
export const PROMPT_R = 2.8;
/** The greeting lasts this long, then it dances again. */
export const GREET_SECS = 4.8;

/** Its lines, in turn: the first is always the invitation. Spoken in a falsetto, like every ukuku. */
export const LINES: ReadonlyArray<L> = [
  { es: "¡Atatau! ¿Bailas conmigo?", en: "Atatau! Will you dance with me?" },
  {
    es: "¡Achachau, qué frío! Bailando se calienta uno.",
    en: "Achachau, so cold! Dancing keeps you warm.",
  },
  {
    es: "¡Shhh! Voy subiendo al Ausangate, a la nieve del Qoyllur Rit'i.",
    en: "Shhh! I'm on my way up to Ausangate, to the snows of Qoyllur Rit'i.",
  },
];
export const lineFor = (n: number) => LINES[((n % LINES.length) + LINES.length) % LINES.length] as L;

/** Is the spot inside the plaza with room to dance (sanity for the tests)? */
export const inPlaza = (p: P, margin: number) =>
  p.x > PLAZA.x0 + margin && p.x < PLAZA.x1 - margin && p.z > PLAZA.z0 + margin && p.z < PLAZA.z1 - margin;

export const STAMP = {
  id: "cusco:egg:ukuku",
  kind: "egg" as const,
  label: { es: "El ukuku de medianoche", en: "The midnight ukuku" },
};
