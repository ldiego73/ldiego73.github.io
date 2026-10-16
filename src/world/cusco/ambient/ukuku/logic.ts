/**
 * Pure logic of the midnight ukuku (../ukuku.ts): when it is out (the deep-night band of the sky clock), when
 * it may appear or vanish (only unseen, or on a clock jump such as the T key), its dance routine as joint
 * angles over time (hops, spins, whip swings; a gentle sway with prefers-reduced-motion), the wave of its
 * greeting, the bell's beats, and the bell's loudness and pan by distance. No DOM, no three.js (tested in
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

/** Joint angles (radians) and offsets of the rig, all relative to the rest pose. */
export interface Pose {
  /** Hips height above the ground (hops). */
  lift: number;
  /** Turn added to the facing (spins). */
  turn: number;
  /** Small offset of the whole body on its spot (local x, z). */
  dx: number;
  dz: number;
  /** Torso lean forward (x) and sideways (z). */
  leanX: number;
  leanZ: number;
  /** Head tilt (z) and nod (x). */
  headZ: number;
  headX: number;
  /** Arms: forward swing (x, positive raises forward) and out to the side (z, positive raises sideways). */
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  /** Legs: forward swing (x) of each leg; knee lift reads through the swing. */
  legL: number;
  legR: number;
  /** Twist of the whip about the right hand (spins the lash). */
  whip: number;
}

export const REST: Readonly<Pose> = {
  lift: 0,
  turn: 0,
  dx: 0,
  dz: 0,
  leanX: 0,
  leanZ: 0,
  headZ: 0,
  headX: 0,
  armLX: 0,
  armLZ: 0.25,
  armRX: 0,
  armRZ: 0.25,
  legL: 0,
  legR: 0,
  whip: 0,
};

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

/** Hops per second (the bell rings on each landing). */
export const HOP_HZ = 2;
const TAU = Math.PI * 2;
const smooth = (u: number) => u * u * (3 - 2 * u);

/** The dancing pose at time t (seconds of dancing). Reduced motion: a slow sway in place, no hops or spins. */
export function dancePose(t: number, reduced: boolean, out: Pose = { ...REST }): Pose {
  Object.assign(out, REST);
  if (reduced) {
    const s = Math.sin(t * 1.3);
    out.leanZ = s * 0.07;
    out.headZ = -s * 0.1;
    out.turn = Math.sin(t * 0.65) * 0.18;
    out.armLZ = 0.45 + Math.sin(t * 1.3 + 0.6) * 0.12;
    out.armRZ = 0.45 - Math.sin(t * 1.3 + 0.6) * 0.12;
    out.armRX = 0.3;
    out.legL = s * 0.06;
    out.legR = -s * 0.06;
    return out;
  }
  const { move, u } = stepAt(t);
  // Hop wave: |sin| so every half period is one hop; 0 at each landing.
  const ph = t * HOP_HZ * Math.PI;
  const hop = Math.abs(Math.sin(ph));
  const side = Math.sin(ph) >= 0 ? 1 : -1;
  if (move === "hop") {
    // Hop from foot to foot, the free leg kicked forward, arms out and pumping, whip trailing low.
    out.lift = hop * 0.26;
    out.legL = side > 0 ? 0.7 * hop : -0.15 * hop;
    out.legR = side < 0 ? 0.7 * hop : -0.15 * hop;
    out.leanZ = side * 0.12 * hop;
    out.leanX = 0.12;
    out.armLZ = 0.9 + hop * 0.35;
    out.armRZ = 0.9 + hop * 0.35;
    out.armLX = 0.3 * side;
    out.armRX = -0.3 * side;
    out.headZ = -side * 0.15 * hop;
    out.dx = Math.sin(t * 0.9) * WANDER * 0.6;
    out.dz = Math.sin(t * 0.55) * WANDER * 0.4;
    out.whip = t * 3;
  } else if (move === "spin") {
    // Two whole turns, eased, on small quick hops; arms flung wide.
    out.turn = smooth(u) * TAU * 2;
    out.lift = hop * 0.12;
    out.armLZ = 1.45;
    out.armRZ = 1.45;
    out.leanX = -0.08;
    out.headX = -0.15;
    out.legL = side > 0 ? 0.35 * hop : 0;
    out.legR = side < 0 ? 0.35 * hop : 0;
    out.whip = t * 6;
  } else {
    // Whip: the right arm raised, circling the lash overhead; the left fist on the hip; a bouncing step.
    out.lift = hop * 0.08;
    out.armRX = 2.5 + Math.sin(t * 5) * 0.25;
    out.armRZ = 0.35 + Math.cos(t * 5) * 0.25;
    out.armLX = -0.2;
    out.armLZ = 0.75;
    out.leanZ = -0.1;
    out.leanX = 0.05 + hop * 0.05;
    out.headZ = 0.12;
    out.headX = -0.25;
    out.legL = side > 0 ? 0.25 * hop : 0;
    out.legR = side < 0 ? 0.25 * hop : 0;
    out.whip = t * 9;
  }
  return out;
}

/** The greeting pose: still, facing the traveler, the left arm waving high, the head cocked (shy, then cheeky). */
export function greetPose(t: number, reduced: boolean, out: Pose = { ...REST }): Pose {
  Object.assign(out, REST);
  const w = reduced ? 0 : Math.sin(t * 9);
  out.armLZ = 2.5 + w * 0.3;
  out.armLX = 0.2;
  out.armRZ = 0.35;
  out.armRX = 0.25;
  out.headZ = 0.22 + (reduced ? 0 : Math.sin(t * 2.2) * 0.06);
  out.leanZ = -0.06;
  out.lift = reduced ? 0 : Math.abs(Math.sin(t * 4)) * 0.03;
  return out;
}

/** Blends `cur` toward `target` by k ∈ [0, 1] (the turn wraps the short way). */
export function blendPose(cur: Pose, target: Pose, k: number): Pose {
  for (const key of Object.keys(REST) as Array<keyof Pose>) {
    let d = target[key] - cur[key];
    if (key === "turn") d = Math.atan2(Math.sin(d), Math.cos(d));
    cur[key] += d * k;
  }
  return cur;
}

/** Bell beats so far: one per hop landing while dancing, slower with reduced motion. Ring when it changes. */
export const beat = (t: number, reduced: boolean) => Math.floor(reduced ? t * 0.7 : t * HOP_HZ);

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
