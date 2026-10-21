/**
 * Pure rules of the falling leaves (../hojas.ts): how many leaves let go of the canopy each second (a slow
 * trickle in still air, a flurry when a gust front passes over the traveler), and how one leaf falls: a slow
 * drop with drag, a fluttering side-to-side swing and a tumble, carried by the world's shared wind (the same
 * `liveWind.sample` the canopy sways with), then lying on the ground for a while before it fades.
 * No DOM, no Three: unit-tested in logic.test.ts.
 */

export interface Leaf {
  x: number;
  y: number;
  z: number;
  /** Tumble angles (rad) and their rates (rad/s). */
  rx: number;
  rz: number;
  wx: number;
  wz: number;
  /** Swing phase and rate (rad, rad/s). */
  ph: number;
  w: number;
  /** Seconds since it landed (−1 while falling). */
  rest: number;
  /** Tint index and scale. */
  tint: number;
  s: number;
  live: boolean;
}

/** Terminal fall speed (u/s): a broad leaf sails down slowly. */
export const FALL = 0.75;
/** Share of the wind a leaf drifts with (u/s per unit of wind speed). */
export const LEAF_WIND = 1.6;
/** Swing amplitude (u/s) of the side-to-side flutter. */
export const SWING = 0.55;
/** Seconds a leaf lies on the ground before it fades away and returns to the pool. */
export const REST = 6;

/**
 * Leaves released per second around the traveler: a trickle in still air (`base`) plus a flurry that grows
 * with the gust strength over them (`gust`, 0 … the profile's gust amplitude, normalized by `gustAmp`).
 * Reduced motion: a third of the trickle and no flurry.
 */
export function releaseRate(gust: number, gustAmp: number, reduced: boolean, base = 0.6, flurry = 9): number {
  if (reduced) return base / 3;
  const g = gustAmp > 0 ? Math.min(1, Math.max(0, gust / gustAmp)) : 0;
  return base + flurry * g * g;
}

/**
 * Steps one leaf by dt: falling (drag-limited drop, swing, tumble, wind drift) until it reaches `ground`,
 * then resting. `wind` is the wind at the leaf (u/s, world). `slow` scales the motion (reduced motion: 0.5).
 * Returns false once the leaf has rested REST seconds (back to the pool).
 */
export function stepLeaf(l: Leaf, dt: number, wind: { x: number; z: number }, ground: number, slow = 1): boolean {
  if (!l.live) return false;
  if (l.rest >= 0) {
    l.rest += dt;
    if (l.rest > REST) l.live = false;
    return l.live;
  }
  l.ph += l.w * dt * slow;
  const swing = Math.sin(l.ph) * SWING * slow;
  // The swing runs across the leaf's own heading (its tumble axis), so each leaf zig-zags its own way.
  l.x += (wind.x * LEAF_WIND + Math.cos(l.rz) * swing) * dt;
  l.z += (wind.z * LEAF_WIND + Math.sin(l.rz) * swing) * dt;
  // It drops faster at the bottom of each swing (the classic falling-leaf glide).
  l.y -= FALL * slow * (0.6 + 0.6 * Math.abs(Math.cos(l.ph))) * dt;
  l.rx += l.wx * dt * slow;
  l.rz += l.wz * dt * slow;
  if (l.y <= ground + 0.03) {
    l.y = ground + 0.03;
    l.rest = 0;
    // Lies flat-ish on the litter.
    l.rx = 0.12 * Math.sin(l.ph);
  }
  return true;
}

/** Visible size factor of a leaf: grows in when released, fades out over the last second on the ground. */
export function leafScale(l: Leaf): number {
  if (!l.live) return 0;
  if (l.rest < 0) return l.s;
  return l.s * Math.min(1, Math.max(0, REST - l.rest));
}
