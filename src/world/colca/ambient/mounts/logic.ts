/**
 * Pure plan of the Kuntisuyu's two road mounts (../mula.ts, ../cuatrimoto.ts): which stretch of the road each
 * may ride and where each waits. No DOM, no three.js (tested in logic.test.ts).
 *
 *  - The saddled mule waits beside the road just past the arrival spot (MULE.homeT), on the north side (away
 *    from the canyon), and carries the traveler along the rim and down the descent. It stops where the descent
 *    reaches the pampa (MULE.endT): the rider gets off there.
 *  - The quad bike (cuatrimoto) waits a few steps further on (QUAD.homeT), parked off the road, and serves the
 *    pampa: the Nazca mirador, Cahuachi and the climb back to the Cruz del Cóndor. It never goes back up the
 *    descent (QUAD.startT): the rider gets off there.
 *
 * Road numbers (plan.ts, road ≈ 1331 u): the descent starts at t ≈ 0.49 and the road is still dropping at
 * t 0.56 (y −13.6 → −23 at 0.62); MULE.endT ≥ QUAD.startT so there is no stretch without a mount, and the
 * quad's home sits strictly inside its own stretch (≈ 13 u past its start), so mounting and backing up one
 * step never drops the rider at once.
 */
import { ARRIVE_T, ROAD, ROAD_HALF, roadAt } from "../../plan";

/** Road t → world units. */
const U = 1 / ROAD.length;

export const MULE = {
  /** Waits ~10 u past the arrival spot (ARRIVE_T is 10 u from the punku). */
  homeT: ARRIVE_T + 10 * U,
  /** Last stretch the mule rides: where the quad waits. */
  endT: 0.566,
  /** Parking side (+1 = right of the walking direction: north on the rim, away from the drop) and offset. */
  side: 1 as const,
  off: 5.6,
} as const;

export const QUAD = {
  homeT: 0.572,
  /** The quad does not ride before this t (back up the descent toward the canyon). */
  startT: 0.562,
  side: 1 as const,
  off: 5.6,
} as const;

/** The mule stops (rider gets off) at the foot of its stretch. */
export const muleStops = (q: { t: number }) => q.t >= MULE.endT;
/** The quad stops (rider gets off) before the start of its stretch. */
export const quadStops = (q: { t: number }) => q.t < QUAD.startT;

/**
 * A small parking disc beside the road at t (the mount's waiting spot is picked on its rim by
 * ../../../ambient/mount/logic.ts mountHome; the ambient registers it as walkable so the candidates pass).
 */
export function parkingDisc(t: number, side: 1 | -1, off: number, r = 2): { x: number; z: number; r: number } {
  const p = roadAt(t);
  // Right of (dx, dz) in this frame (x east, z south) is (−dz, dx).
  return { x: p.x - p.dz * side * off, z: p.z + p.dx * side * off, r };
}

/**
 * Walkable circle the ambient registers around a parking disc. It must reach into the road band (ROAD_HALF),
 * or a strip of non-walkable verge stands between the road and the waiting mount and the traveler cannot
 * walk up to it.
 */
export function parkingWalk(d: { x: number; z: number; r: number }, off: number) {
  return { kind: "circle" as const, x: d.x, z: d.z, r: off - ROAD_HALF + 1 };
}

/** World distance between two road ts (along the road). */
export const roadGap = (a: number, b: number) => Math.abs(a - b) * ROAD.length;
