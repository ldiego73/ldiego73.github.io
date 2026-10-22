/**
 * Pure helpers for the night fauna (no three.js): time-of-day presence, angle math and ledge scoring
 * (the gaits and postures are the shared animals' own, characters/animals). Unit-tested in sim.test.ts.
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
