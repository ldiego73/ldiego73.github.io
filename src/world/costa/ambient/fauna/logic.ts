/**
 * Pure behaviour of the coast's animals (../aves.ts, ../orilla.ts). No DOM, no three.js (tested in
 * logic.test.ts).
 *  - Pelicans fly in a file low over the swell along the shore, rising and falling together; one of them
 *    dives: it climbs, folds and plunges into the sea, sits on the water a while (swallowing its catch) and
 *    takes off again (`dive`).
 *  - Gulls circle over the market beach (`circle`).
 *  - Ghost crabs wait by their burrows near the waterline; when the traveler comes close they scuttle sideways
 *    toward the water and vanish into the sand, coming back out a while later (`stepCrab`).
 *  - A species is "seen" (its passport stamp) once the traveler is within its range of any of them (`seen`).
 */

/** Seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True once any of the points is within r of (x, z). */
export function seen(points: ReadonlyArray<{ x: number; z: number }>, x: number, z: number, r: number): boolean {
  for (const p of points) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
  return false;
}

export type DivePhase = "glide" | "plunge" | "float" | "rise";
/** A dive cycle (seconds): glide high, plunge, float, rise. */
export const DIVE = { glide: 9, plunge: 0.7, float: 3.5, rise: 2.2 } as const;
const CYCLE = DIVE.glide + DIVE.plunge + DIVE.float + DIVE.rise;

/** The diver's phase and height above the water (0 sitting on it) at time t. */
export function dive(t: number, high = 9): { phase: DivePhase; y: number; u: number } {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  if (c < DIVE.glide) return { phase: "glide", y: high + Math.sin(c * 0.7) * 0.6, u: c / DIVE.glide };
  if (c < DIVE.glide + DIVE.plunge) {
    const u = (c - DIVE.glide) / DIVE.plunge;
    return { phase: "plunge", y: high * (1 - u * u), u };
  }
  if (c < DIVE.glide + DIVE.plunge + DIVE.float) {
    const u = (c - DIVE.glide - DIVE.plunge) / DIVE.float;
    return { phase: "float", y: 0, u };
  }
  const u = (c - DIVE.glide - DIVE.plunge - DIVE.float) / DIVE.rise;
  return { phase: "rise", y: high * u * u * (3 - 2 * u), u };
}

/** A gull on a circle: position offset and facing (tangent) at time t. */
export function circle(t: number, r: number, w: number, ph: number): { x: number; z: number; yaw: number } {
  const a = ph + t * w;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  // Tangent of travel: d/dt (cos, sin) · w.
  const tx = -Math.sin(a) * w;
  const tz = Math.cos(a) * w;
  return { x, z, yaw: Math.atan2(tx, tz) };
}

export interface Crab {
  /** Burrow (home) and where it runs to (the water side). */
  hx: number;
  hz: number;
  wx: number;
  wz: number;
  x: number;
  z: number;
  /** "idle" by the burrow, "run" to the water, "hidden" in the sand. */
  state: "idle" | "run" | "hidden";
  timer: number;
}

export const CRAB = { scare: 4.2, speed: 3.2, hide: 7 } as const;

/** One step of a crab given the traveler at (ax, az). */
export function stepCrab(c: Crab, ax: number, az: number, dt: number): Crab {
  const d = Math.hypot(ax - c.x, az - c.z);
  if (c.state === "idle") {
    if (d < CRAB.scare) return { ...c, state: "run", timer: 0 };
    return c;
  }
  if (c.state === "run") {
    const dx = c.wx - c.x;
    const dz = c.wz - c.z;
    const l = Math.hypot(dx, dz);
    const step = CRAB.speed * dt;
    if (l <= step) return { ...c, x: c.wx, z: c.wz, state: "hidden", timer: CRAB.hide };
    return { ...c, x: c.x + (dx / l) * step, z: c.z + (dz / l) * step };
  }
  const timer = c.timer - dt;
  // Back out at its burrow once the traveler has moved off.
  if (timer <= 0 && Math.hypot(ax - c.hx, az - c.hz) > CRAB.scare * 1.6)
    return { ...c, x: c.hx, z: c.hz, state: "idle", timer: 0 };
  return { ...c, timer };
}

/**
 * How much it is night (0 by day … 1 from a little after dusk to a little before dawn) at sky time `time`
 * (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset): drives the shared moonlit rim of people and animals.
 */
export function nightAmount(time: number): number {
  const t = ((time % 1) + 1) % 1;
  const d = Math.min(t, 1 - t);
  const x = Math.min(1, Math.max(0, (d - 0.2) / 0.08));
  return 1 - x * x * (3 - 2 * x);
}
