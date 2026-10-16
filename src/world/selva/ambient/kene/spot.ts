/**
 * Where the kené totem stands: pure constants and functions of the layout, shared by the totem ambient
 * (../kene.ts, which builds it), the station footprints (../embarcadero/footprints.ts, which keep the forest
 * off it) and the paper map (../../map.ts, which marks it). No three.js, no DOM.
 *
 * The jungle road runs on ~24 u past the collpa plaza (t 0.97) and stops in the forest at t = 1. The totem
 * plaza is a round clearing centred AHEAD units beyond that road end, straight on along the road's last
 * heading, so the traveler walks the final stretch looking at the totem. The far bank of the river is ~19 u
 * to the right (river side) of the road there and the canopy walkway (CANOPY_T ≤ 0.9) is ~80 u back, so the
 * clearing touches neither; the collpa deck and its sign posts sit ~30 u behind it.
 *
 * Frame (same convention as the station frames, ambient/fields/geo.ts): origin at the plaza centre, local +Z
 * points back along the road (toward the arriving traveler): world = (x + lx·cos + lz·sin, z − lx·sin + lz·cos).
 * Angles around the plaza are measured from +Z, growing toward +X.
 */

/** Plaza centre distance beyond the road end (t = 1), along the road's last heading. */
export const AHEAD = 6.5;
/** Walkable clearing radius (packed earth floor). */
export const PLAZA_R = 7.2;
/** The totem's local position (a little behind the centre, so the open half of the plaza faces the road). */
export const TOTEM_LOCAL: readonly [number, number] = [0, -1.4];
/** Radius of the totem's round two-step dais (its outer collider). */
export const DAIS_R = 1.75;
/** Within this distance of the totem (horizontal) the traveler has arrived (first arrival celebration). */
export const ARRIVE_R = 4.6;
/** Within this distance of the totem "E" opens the reward panel. */
export const PROMPT_R = 4.2;
/** Banner poles (feathered poles with kené streamers) on a ring round the centre; the road side (±0.6 rad
 * around +Z) stays open as the entrance. */
export const POLE_R = 5.6;
export const POLE_ANGLES: readonly number[] = [0.7, 1.55, 2.4, 3.88, 4.73, 5.58];
/** Painted jars around the dais: [angle from +Z, radius, scale]. */
export const POTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.62, 2.45, 1.0],
  [-0.62, 2.45, 0.85],
  [1.45, 2.3, 0.7],
  [-1.5, 2.35, 1.15],
  [2.35, 2.4, 0.9],
  [-2.3, 2.3, 0.75],
];

export interface SpotLayout {
  trail: {
    pointAt(t: number): { x: number; y: number; z: number };
    tangentAt(t: number): { x: number; y: number; z: number };
  };
}

export interface KeneSpot {
  /** Plaza centre (world x/z) and the road height at the road end. */
  x: number;
  z: number;
  roadY: number;
  /** Frame yaw (local +Z = back along the road) and its cos/sin. */
  yaw: number;
  cos: number;
  sin: number;
  /** The road end (t = 1), world x/z. */
  end: { x: number; z: number };
  /** Totem centre, world x/z. */
  totem: { x: number; z: number };
  /** Local → world. */
  world(lx: number, lz: number): { x: number; z: number };
  /** Circles (world) covering the clearing, for the scenery's keep-clear rules. */
  footprint: Array<{ x: number; z: number; r: number }>;
}

export function keneSpot(L: SpotLayout): KeneSpot {
  const e = L.trail.pointAt(1);
  const tg = L.trail.tangentAt(1);
  const len = Math.hypot(tg.x, tg.z) || 1;
  const tx = tg.x / len;
  const tz = tg.z / len;
  const x = e.x + tx * AHEAD;
  const z = e.z + tz * AHEAD;
  // Local +Z (world (sin, cos)) must point back along the road: (−tx, −tz).
  const yaw = Math.atan2(-tx, -tz);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const world = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
  return {
    x,
    z,
    roadY: e.y,
    yaw,
    cos,
    sin,
    end: { x: e.x, z: e.z },
    totem: world(TOTEM_LOCAL[0], TOTEM_LOCAL[1]),
    world,
    // One disc over the clearing (the scenery pads it by its own tree / undergrowth margins).
    footprint: [{ x, z, r: PLAZA_R + 1.5 }],
  };
}

/** Local (lx, lz) of a polar position around the totem (angle 0 = +Z, toward the road, growing toward +X). */
export function aroundTotem(angle: number, r: number): [number, number] {
  return [TOTEM_LOCAL[0] + Math.sin(angle) * r, TOTEM_LOCAL[1] + Math.cos(angle) * r];
}

/**
 * Height of the clearing's flat floor (its raised deck): just above the highest terrain sample of the
 * clearing (it rises a few cm off the road end). Shared by the totem (which registers the deck) and the
 * people sitting in the clearing (built before the deck exists).
 */
export function keneFloorY(s: KeneSpot, heightAt: (x: number, z: number) => number): number {
  let top = s.roadY;
  for (let r = 0; r <= PLAZA_R; r += 1.2)
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      const p = s.world(Math.sin(a) * r, Math.cos(a) * r);
      top = Math.max(top, heightAt(p.x, p.z));
    }
  return top + 0.05;
}
