/**
 * Pure helpers for the night fauna (no three.js): time-of-day presence, poses as flat vectors,
 * gait curves, angle math and ledge scoring. Unit-tested in sim.test.ts.
 */

export const TAU = Math.PI * 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Sun elevation proxy for a day time (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset): -1..1. */
export const sunElevation = (time: number) => Math.sin((time - 0.25) * TAU);

/** 0 by day … 1 at full night, ramping through dusk and dawn. */
export const nightAmount = (time: number) => smooth(0.05, -0.2, sunElevation(time));

/**
 * How "fox-friendly" the hour is (0..1): full at dusk and through the night, a small chance by day.
 * Dusk (sun low in the west, time ~0.68–0.8) counts in full even before isNight() flips.
 */
export function foxPresence(time: number) {
  const e = sunElevation(time);
  const dusk = time > 0.6 && time < 0.95 ? smooth(0.45, 0.15, e) : 0;
  return Math.max(0.15, nightAmount(time), dusk);
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Turn `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number) {
  const d = wrapAngle(to - from);
  return from + (Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep);
}

/** Exponential approach factor for a rate (per second) and a frame dt. */
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

// ---------------------------------------------------------------- poses
/** Indices into a pose vector. Leg angles are pitch about X (positive swings the foot back). */
export const P = {
  drop: 0,
  pitch: 1,
  /** Upper/lower angles for front-left, front-right, hind-left, hind-right. */
  legs: 2,
  headLift: 10,
  headPitch: 11,
  tailPitch: 12,
  tailCurl: 13,
  size: 14,
} as const;

export type Pose = Float32Array;
export const makePose = (vals: number[]): Pose => {
  const p = new Float32Array(P.size);
  p.set(vals.slice(0, P.size));
  return p;
};

/** out = a + (b − a)·k (component-wise). */
export function lerpPose(out: Pose, a: Pose, b: Pose, k: number): Pose {
  for (let i = 0; i < P.size; i++) out[i] = a[i]! + (b[i]! - a[i]!) * k;
  return out;
}

/** out += (b − out)·k (blend a posture in). */
export function blendInto(out: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return out;
  for (let i = 0; i < P.size; i++) out[i] = out[i]! + (b[i]! - out[i]!) * k;
  return out;
}

/** Gait phase offsets (fraction of a cycle) per leg FL, FR, HL, HR. */
export const WALK = [0.25, 0.75, 0, 0.5] as const;
export const TROT = [0, 0.5, 0.5, 0] as const;

/**
 * Add a gait to the leg angles: the upper leg swings ±swing, the lower bends during the forward swing
 * (when the foot travels forward, off the ground). `amp` 0..1 fades the gait in and out.
 */
export function addGait(
  out: Pose,
  phase: number,
  offsets: readonly number[],
  amp: number,
  swing: number,
  bend: number,
) {
  if (amp <= 0) return out;
  for (let k = 0; k < 4; k++) {
    const a = (phase + offsets[k]!) * TAU;
    const s = Math.sin(a);
    // Foot forward (negative pitch) while cos > 0 = the recovery half: lift the paw by bending.
    const lift = Math.max(0, Math.cos(a));
    const hind = k >= 2;
    out[P.legs + k * 2] = out[P.legs + k * 2]! - s * swing * amp;
    out[P.legs + k * 2 + 1] = out[P.legs + k * 2 + 1]! + lift * bend * amp * (hind ? 0.9 : 1.15);
  }
  return out;
}

// ---------------------------------------------------------------- lookout scoring
/**
 * Score a lookout for a puma (higher is better, -Infinity rejects). `rise` is how far the spot sits above
 * the trail, `bumpy` the worst height delta to its neighbours (a lying cat wants a flat tread), `drop`
 * how much the ground falls toward the trail right in front of it (a ledge / andén edge), `lateral`
 * the distance from the trail centerline.
 */
export function lookoutScore(o: { rise: number; bumpy: number; drop: number; lateral: number }) {
  if (o.rise < 0.6 || o.rise > 8) return -Infinity;
  if (o.bumpy > 0.75) return -Infinity;
  if (o.lateral < 6 || o.lateral > 24) return -Infinity;
  // Best around 2–4 u above the path (above the eye line, silhouetted, but not lost up a cliff).
  const riseScore = 1 - Math.min(1.5, Math.abs(o.rise - 2.8) / 3);
  const edge = Math.min(1, Math.max(0, o.drop) / 1.5);
  const near = 1 - Math.min(1, Math.abs(o.lateral - 11) / 13);
  return riseScore * 1.2 + edge * 1.5 + near * 0.8 - o.bumpy * 2;
}
