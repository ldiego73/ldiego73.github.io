/**
 * Pure helpers for the birds (no scene, no DOM): perch choice, arcing flight paths, timings.
 * Perch arrays come from the flora ("flora-perches" userData): trees stride 5 (x, y, z, kind, treeId),
 * flowers stride 4 (x, y, z, kind).
 */

export const TREE_STRIDE = 5;
export const FLOWER_STRIDE = 4;

/** Distance (XZ) at which a perched bird takes off from the traveler. */
export const FLEE_R = 4;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface Flight {
  x0: number;
  y0: number;
  z0: number;
  cx: number;
  cy: number;
  cz: number;
  x1: number;
  y1: number;
  z1: number;
  /** Progress 0..1 and total duration (s). */
  u: number;
  dur: number;
}

export function newFlight(): Flight {
  return { x0: 0, y0: 0, z0: 0, cx: 0, cy: 0, cz: 0, x1: 0, y1: 0, z1: 0, u: 0, dur: 1 };
}

/**
 * Sets an arcing (quadratic Bézier) path from a to b: the control point rises above the midpoint by
 * `arc` × distance + `lift`, so short hops are low and long crossings swoop up and glide down.
 */
export function planFlight(f: Flight, a: Vec, b: Vec, speed: number, arc: number, lift: number): Flight {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  f.x0 = a.x;
  f.y0 = a.y;
  f.z0 = a.z;
  f.x1 = b.x;
  f.y1 = b.y;
  f.z1 = b.z;
  f.cx = (a.x + b.x) / 2;
  f.cz = (a.z + b.z) / 2;
  f.cy = Math.max(a.y, b.y) + d * arc + lift;
  f.u = 0;
  // Path length of the arc is a bit longer than the chord.
  f.dur = Math.max(0.35, (d * (1 + arc * 0.8) + lift) / speed);
  return f;
}

/** Ease: slow take-off and landing, full speed in between. */
export const flightEase = (u: number) => u * u * (3 - 2 * u);

/** Position on the flight at eased progress `e`; writes into `out`. */
export function flightPoint(f: Flight, e: number, out: Vec): Vec {
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const c = e * e;
  out.x = a * f.x0 + b * f.cx + c * f.x1;
  out.y = a * f.y0 + b * f.cy + c * f.y1;
  out.z = a * f.z0 + b * f.cz + c * f.z1;
  return out;
}

/** Direction of travel on the flight at `e` (unnormalized). */
export function flightTangent(f: Flight, e: number, out: Vec): Vec {
  out.x = 2 * (1 - e) * (f.cx - f.x0) + 2 * e * (f.x1 - f.cx);
  out.y = 2 * (1 - e) * (f.cy - f.y0) + 2 * e * (f.y1 - f.cy);
  out.z = 2 * (1 - e) * (f.cz - f.z0) + 2 * e * (f.z1 - f.cz);
  return out;
}

export interface PickOpts {
  /** Distance band from `from` (3D). */
  min: number;
  max: number;
  /** Keep at least this far (XZ) from the traveler. */
  avoid?: { x: number; z: number; r: number };
  /** Accept only some kinds (index 3 of the record). */
  kinds?: readonly number[];
  /** Skip records on this tree (index 4, tree perches only). */
  notTree?: number;
  /** Occupied record indices (by record number). */
  taken?: Uint8Array;
  tries?: number;
}

/**
 * Random record in `arr` (stride) satisfying the options, preferring the nearer half of the band
 * (birds hop to the next tree rather than across the mountain). Returns the record index or -1.
 */
export function pickRecord(arr: ArrayLike<number>, stride: number, from: Vec, R: () => number, o: PickOpts): number {
  const n = Math.floor(arr.length / stride);
  if (!n) return -1;
  let best = -1;
  let bestScore = Infinity;
  const tries = o.tries ?? 48;
  for (let k = 0; k < tries; k++) {
    const i = Math.floor(R() * n);
    const j = i * stride;
    const x = arr[j] as number;
    const y = arr[j + 1] as number;
    const z = arr[j + 2] as number;
    if (o.kinds && !o.kinds.includes(arr[j + 3] as number)) continue;
    if (o.notTree !== undefined && stride >= 5 && arr[j + 4] === o.notTree) continue;
    if (o.taken?.[i]) continue;
    const d = Math.hypot(x - from.x, y - from.y, z - from.z);
    if (d < o.min || d > o.max) continue;
    if (o.avoid && Math.hypot(x - o.avoid.x, z - o.avoid.z) < o.avoid.r) continue;
    const score = d + R() * (o.max - o.min) * 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Records within `r` (XZ) of a point, any kind, for seeding birds near the trail / the traveler. */
export function recordsNear(
  arr: ArrayLike<number>,
  stride: number,
  x: number,
  z: number,
  r: number,
  kinds?: readonly number[],
) {
  const out: number[] = [];
  const n = Math.floor(arr.length / stride);
  for (let i = 0; i < n; i++) {
    const j = i * stride;
    if (kinds && !kinds.includes(arr[j + 3] as number)) continue;
    if (Math.hypot((arr[j] as number) - x, (arr[j + 2] as number) - z) <= r) out.push(i);
  }
  return out;
}

/** Shortest signed angle difference. */
export function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Condor soaring circle: position + heading at angle `a` (radius r around c, height y). */
export function soarPoint(cx: number, cz: number, r: number, a: number, dir: 1 | -1, out: Vec & { yaw: number }) {
  out.x = cx + Math.cos(a) * r;
  out.z = cz + Math.sin(a) * r;
  // Velocity along the circle (direction `dir`) → yaw for a model facing +Z.
  const vx = -Math.sin(a) * dir;
  const vz = Math.cos(a) * dir;
  out.yaw = Math.atan2(vx, vz);
  return out;
}
