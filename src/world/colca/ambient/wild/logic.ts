/**
 * Pure behaviour helpers shared by the Kuntisuyu's animals (../../vicunas.ts, ../../vizcachas.ts,
 * ../../picaflores.ts, ../../zorro.ts): a herd's wander-and-flee target, the "seen" test for a fauna stamp,
 * the hummingbird's dart between flowers and the dusk window of the fox. No DOM, no three.js (tested in
 * logic.test.ts).
 */

export interface P {
  x: number;
  z: number;
}

/** Dusk and night (the Andean fox's hours): from late afternoon to just after dawn. */
export const foxHours = (time: number) => time > 0.68 || time < 0.27;

/** A fauna stamp needs a good look: close enough (and, for the caller, by its active hours). */
export const seenWithin = (a: P, b: P, r: number) => Math.hypot(a.x - b.x, a.z - b.z) < r;

/**
 * Where an animal heads when the traveler is too close: straight away from them, `dist` u, pulled back
 * toward `home` if that would leave its range.
 */
export function fleeFrom(me: P, from: P, home: P, range: number, dist: number): P {
  const dx = me.x - from.x;
  const dz = me.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  let x = me.x + (dx / d) * dist;
  let z = me.z + (dz / d) * dist;
  const hx = x - home.x;
  const hz = z - home.z;
  const hd = Math.hypot(hx, hz);
  if (hd > range) {
    x = home.x + (hx / hd) * range;
    z = home.z + (hz / hd) * range;
  }
  return { x, z };
}

/** Hummingbird: which flower it visits at time t (seconds), and how far along the dart it is (0..1). */
export function hoverPlan(
  t: number,
  n: number,
  seed: number,
  stay = 2.6,
  dart = 0.7,
): { from: number; to: number; k: number } {
  const cycle = stay + dart;
  const c = Math.floor((t + seed * 3.1) / cycle);
  const u = (t + seed * 3.1) / cycle - c;
  const at = (j: number) => Math.abs(Math.floor(Math.sin((j + 1) * 12.9898 + seed * 78.233) * 43758.5453)) % n;
  const from = at(c);
  let to = at(c + 1);
  if (to === from) to = (from + 1) % n;
  const k = u * cycle < stay ? 0 : (u * cycle - stay) / dart;
  return { from, to, k };
}
