/**
 * Pure logic of the hub's people and llamas (../life.ts): the places people walk between, routes that go round
 * the usnu instead of over it, the day/night schedule, and the llama caravan's loop round the plaza (the
 * herder in front, the llamas in file behind). No DOM, no three.js (tested in logic.test.ts).
 */
import { GATES, PLAZA, USNU } from "../../plan";

export type P = { x: number; z: number };

/** People are out by day (sky time: 0.25 sunrise, 0.75 sunset). */
export const DAY: readonly [number, number] = [0.27, 0.74];
export const isDay = (time: number) => time >= DAY[0] && time <= DAY[1];

/** Places people walk between: the street mouths (just inside the plaza) and the doorways of the halls. */
export function destinations(): P[] {
  const out: P[] = GATES.map((g) => ({ x: g.mouth[0] - g.dir[0] * 2.5, z: g.mouth[1] - g.dir[1] * 2.5 }));
  // North hall doorways (6 along its front) and west hall doorways (5), a step in front of them.
  for (const x of [-20, -4, 12]) out.push({ x, z: PLAZA.z0 + 1.2 });
  for (const z of [-12, 4]) out.push({ x: PLAZA.x0 + 1.2, z });
  // The Qorikancha's doorway and two spots in the open plaza.
  out.push({ x: PLAZA.x1 - 1.4, z: 0 }, { x: -14, z: 10 }, { x: 15, z: -11 });
  return out;
}

/** Radius people keep from the usnu's centre (its base is 2 × 6.6 u square). */
export const USNU_CLEAR = 10;

/** Distance from p to segment a → b, and the closest parameter. */
function segClosest(a: P, b: P, p: P): { d: number; u: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return { d: Math.hypot(p.x - a.x - dx * u, p.z - a.z - dz * u), u };
}

/**
 * Waypoints from a to b that keep USNU_CLEAR from the usnu: straight when clear, else through the corner of
 * the usnu's clearance square on the side the segment passes (one or two corners).
 */
export function routeAround(a: P, b: P): P[] {
  const c = { x: USNU.x, z: USNU.z };
  if (segClosest(a, b, c).d >= USNU_CLEAR) return [b];
  const r = USNU_CLEAR;
  const corners: P[] = [
    { x: c.x - r, z: c.z - r },
    { x: c.x + r, z: c.z - r },
    { x: c.x + r, z: c.z + r },
    { x: c.x - r, z: c.z + r },
  ];
  // Try one corner, then two adjacent corners; keep the shortest clear path.
  let best: P[] | null = null;
  let bestLen = Number.POSITIVE_INFINITY;
  const len = (pts: P[]) => {
    let s = 0;
    let prev = a;
    for (const p of pts) {
      s += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    return s;
  };
  const clear = (pts: P[]) => {
    let prev = a;
    for (const p of pts) {
      if (segClosest(prev, p, c).d < r * 0.98) return false;
      prev = p;
    }
    return true;
  };
  for (let i = 0; i < 4; i++) {
    const one = [corners[i] as P, b];
    if (clear(one) && len(one) < bestLen) {
      best = one;
      bestLen = len(one);
    }
    for (const j of [(i + 1) % 4, (i + 3) % 4]) {
      const two = [corners[i] as P, corners[j] as P, b];
      if (clear(two) && len(two) < bestLen) {
        best = two;
        bestLen = len(two);
      }
    }
  }
  return best ?? [b];
}

// ---------------------------------------------------------------- caravan

/** The caravan's loop: a rounded rectangle inside the plaza, clear of the usnu, the stele and the shelter. */
export const LOOP = { hx: 26, hz: 17.5, r: 5 } as const;
/** Length of the loop. */
export const loopLength = () => 4 * (LOOP.hx - LOOP.r) + 4 * (LOOP.hz - LOOP.r) + 2 * Math.PI * LOOP.r;

/** Point and heading (yaw: models face +Z) at arc length s along the loop (clockwise seen from above). */
export function loopAt(s: number): { x: number; z: number; yaw: number } {
  const L = loopLength();
  let u = ((s % L) + L) % L;
  const { hx, hz, r } = LOOP;
  const sx = 2 * (hx - r);
  const sz = 2 * (hz - r);
  const q = (Math.PI / 2) * r;
  // North edge west → east, NE corner, east edge north → south, SE corner, south edge, SW, west edge, NW.
  const seg = (x: number, z: number, dx: number, dz: number, t: number) => ({
    x: x + dx * t,
    z: z + dz * t,
    yaw: Math.atan2(dx, dz),
  });
  const arc = (cx: number, cz: number, a0: number, t: number) => {
    const a = a0 + t / r;
    // Moving clockwise in x/z (seen from above with −z north): tangent of (cos a, sin a) is (−sin a, cos a).
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
  };
  if (u < sx) return seg(-hx + r, -hz, 1, 0, u);
  u -= sx;
  if (u < q) return arc(hx - r, -hz + r, -Math.PI / 2, u);
  u -= q;
  if (u < sz) return seg(hx, -hz + r, 0, 1, u);
  u -= sz;
  if (u < q) return arc(hx - r, hz - r, 0, u);
  u -= q;
  if (u < sx) return seg(hx - r, hz, -1, 0, u);
  u -= sx;
  if (u < q) return arc(-hx + r, hz - r, Math.PI / 2, u);
  u -= q;
  if (u < sz) return seg(-hx, hz - r, 0, -1, u);
  u -= sz;
  return arc(-hx + r, -hz + r, Math.PI, Math.min(u, q));
}

/** Gap between the herder and the first llama, and between llamas, along the loop. */
export const FILE_GAP = 2.6;

/** Where the caravan rests at night: in front of the west hall, the llamas lying in a row. */
export const NIGHT_CAMP = { x: PLAZA.x0 + 4.5, z: 10, yaw: Math.PI / 2 } as const;

/** Should the caravan wait (the traveler stands in the herder's way, within `r`, ahead of them)? */
export function blocked(herder: { x: number; z: number; yaw: number }, traveler: P, r = 2.4): boolean {
  const dx = traveler.x - herder.x;
  const dz = traveler.z - herder.z;
  const d = Math.hypot(dx, dz);
  if (d > r) return false;
  return dx * Math.sin(herder.yaw) + dz * Math.cos(herder.yaw) > -0.4;
}
