/**
 * Summit camp layout and schedules (pure; tested in plan.test.ts).
 *
 * Coordinates are in the summit-local frame used by content.ts / festival.ts: origin at the ushnu,
 * +Z toward where the trail arrives. The camp sits in the grass pocket west of the plaza (local −x),
 * enclosed by the trail to the chasqui post, the plaza (r 6.2) and the walkway to the "build-3" plot.
 * The traveler can walk in from the plaza edge (WALK circles); nothing in the camp is near a prompt, a
 * door or the path. Animals keep out of it (KEEP_OUT, creatures.keepOut). The vendor and the children come
 * and go over the grass at the south end of the pocket (ROUTE), never on the trail band.
 * Measured with the layout (grass, slope, trail distance) — see the module comment in summit-camp.ts.
 */

export interface P2 {
  x: number;
  z: number;
}

/** Campfire of the resting travellers. */
export const FIRE: P2 = { x: -11.5, z: 3.2 };
/** Seats around the fire: angle (radians, local frame, 0 = toward the plaza) and kind. */
export const SEATS: ReadonlyArray<{ a: number; seat: "stone" | "blanket"; r: number }> = [
  { a: (130 * Math.PI) / 180, seat: "stone", r: 1.3 },
  { a: (195 * Math.PI) / 180, seat: "blanket", r: 1.45 },
  { a: (255 * Math.PI) / 180, seat: "stone", r: 1.3 },
];
/** Apacheta (stone cairn) beside the path toward the chasqui post. */
export const APACHETA: P2 = { x: -8, z: 5.4 };
/** Api stall: table center; it faces +x (the plaza). */
export const STALL: P2 = { x: -9, z: -1.4 };
/** Clay pot on its stove, beside the table. */
export const STOVE: P2 = { x: -9.15, z: -2.55 };
/** Where the vendor stands (behind the table, between it and the stove). */
export const VENDOR_AT: P2 = { x: -9.85, z: -1.8 };
/** Children's kite field and the wind (unit vector, local): the kite flies downwind, away from the trails. */
export const KIDS: P2 = { x: -13, z: -2 };
export const KIDS_R = 1.7;
export const WIND: P2 = { x: 0.25 / Math.hypot(0.25, 0.97), z: -0.97 / Math.hypot(0.25, 0.97) };
/** Kite: horizontal reach downwind from the holder and height above the ground there. */
export const KITE_REACH = 7.5;
export const KITE_HEIGHT = 7.2;
/**
 * Where the vendor and the children come from / go home to: the low grass at the south end of the pocket
 * (between the western trail and the build-3 walkway, below the brow, mostly out of sight from the plaza),
 * and the waypoints up the grass to the camp, all well off the trail band. ROUTE[0] is HOME.
 */
export const HOME: P2 = { x: -6.2, z: -16.2 };
export const ROUTE: readonly P2[] = [HOME, { x: -8.4, z: -13.2 }, { x: -11, z: -10 }, { x: -12.6, z: -6.2 }];
/**
 * Animals keep out (creatures.keepOut circles, local frame): the fire ring and its seats, the stall with the
 * stove and the vendor, the apacheta with the spot in front of it, the children's kite field (holder and
 * the runner's loop downwind) and the middle between them, out to the plaza edge. Edges stay ≥ 1 u off
 * the western trail band and clear of the dancers' ring (r 4.85 + detours) on the plaza.
 */
export const KEEP_OUT: ReadonlyArray<P2 & { r: number }> = [
  { x: FIRE.x, z: FIRE.z, r: 2.4 },
  { x: -9.3, z: -1.7, r: 1.7 },
  { x: -8.0, z: 5.2, r: 2.3 },
  { x: -12.8, z: -3.0, r: 2.4 },
  // The whole middle of the camp, out to the plaza edge (so no herd grazes in its front yard; the plaza
  // itself is off-limits to animals anyway, and zones don't touch people or the dancers).
  { x: -10.2, z: 1.6, r: 4.6 },
  { x: -7.0, z: -1.4, r: 1.4 },
];
/**
 * Walkable grass for the traveler (env.addWalkable circles, local frame): a link from the plaza edge and
 * discs over the flat part of the pocket. The module drops any disc on steep ground or near the trail band.
 */
export const WALK: ReadonlyArray<P2 & { r: number }> = [
  { x: -6.6, z: 2.4, r: 1.6 },
  { x: -7.5, z: -0.3, r: 1.5 },
  { x: -9.2, z: 2.8, r: 2.1 },
  { x: -11.5, z: 3.2, r: 2.4 },
  { x: -9.2, z: 6.0, r: 1.8 },
  { x: -9.6, z: -0.6, r: 1.9 },
  { x: -12.4, z: -0.4, r: 1.9 },
  { x: -12.8, z: -3.3, r: 1.4 },
];
/** Solid camp props for the traveler (colliders) and everyone else (bodies): [spot, collider r, body r]. */
export const SOLIDS: ReadonlyArray<{ at: P2; r: number; body: number }> = [
  { at: FIRE, r: 0.6, body: 0.75 },
  { at: APACHETA, r: 0.65, body: 0.8 },
  { at: STALL, r: 0.55, body: 0.7 },
  { at: { x: STALL.x, z: STALL.z + 0.45 }, r: 0.45, body: 0.55 },
  { at: STOVE, r: 0.4, body: 0.5 },
];

/** Every point every `step` units along the polyline passes `ok` (e.g. "well off the trail band"). */
export function routeClear(pts: readonly P2[], ok: (x: number, z: number) => boolean, step = 0.5) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2;
    const b = pts[i + 1] as P2;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k <= n; k++) if (!ok(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n)) return false;
  }
  return true;
}

/**
 * Next waypoint index when (re)starting a walk along `route` from (x, z): toward the camp (increasing
 * index; route.length means "go to the final spot") or toward home (decreasing; 0 is home itself).
 */
export function routeStart(route: readonly P2[], x: number, z: number, toCamp: boolean) {
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length; i++) {
    const p = route[i] as P2;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return toCamp ? Math.min(route.length, best + 1) : best;
}
/** Center and radius of the whole camp (for view culling). */
export const CAMP: P2 = { x: -11, z: 0 };
export const CAMP_R = 10;

/** Stall hours (vendor) and play hours (children). Travellers by the fire stay day and night. */
export const STALL_HOURS: [number, number] = [0.28, 0.73];
export const PLAY_HOURS: [number, number] = [0.3, 0.7];

/** Is `time` (0..1, 0.25 sunrise, 0.75 sunset) within [from, to] (wrapping past midnight)? */
export function within(time: number, from: number, to: number) {
  const t = ((time % 1) + 1) % 1;
  return from <= to ? t >= from && t <= to : t >= from || t <= to;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Firelight strength 0..1 for the time of day: 0 in full daylight, rising through dusk (from ≈0.69),
 * 1 all night, fading after dawn (until ≈0.3).
 */
export function firelight(time: number) {
  const t = ((time % 1) + 1) % 1;
  if (t >= 0.5) return smooth(0.69, 0.79, t);
  return 1 - smooth(0.21, 0.3, t);
}

/** Local → world (summit frame with yaw); writes into out. */
export function toWorld(cx: number, cz: number, yaw: number, lx: number, lz: number, out: P2) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = cx + lx * c + lz * s;
  out.z = cz - lx * s + lz * c;
  return out;
}

/**
 * Kite sway in the summit wind: lateral / vertical offsets (units) and roll (radians) at clock `t`.
 * Layered sines so it never looks like a metronome; still (zeros) with reduced motion.
 */
export function kiteSway(t: number, rm: boolean, out: { side: number; up: number; roll: number; pitch: number }) {
  if (rm) {
    out.side = 0;
    out.up = 0;
    out.roll = 0.08;
    out.pitch = 0;
    return out;
  }
  out.side = Math.sin(t * 0.43) * 1.1 + Math.sin(t * 1.17 + 1.3) * 0.35;
  out.up = Math.sin(t * 0.31 + 0.6) * 0.55 + Math.sin(t * 0.97) * 0.18;
  out.roll = Math.sin(t * 0.43 + 0.5) * 0.32 + Math.sin(t * 2.3) * 0.06;
  out.pitch = Math.sin(t * 0.77 + 2) * 0.1;
  return out;
}

/** People per role for a quality level. */
export function campCount(quality: "low" | "high") {
  return quality === "high" ? { travellers: 3, kids: 3, steam: 4 } : { travellers: 2, kids: 2, steam: 0 };
}
