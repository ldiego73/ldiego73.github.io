/**
 * Canopy walkway platforms as pure data (no three.js, no DOM): where the three walkway ceibas stand, the plank
 * ring around each trunk, its height and where the walkway's railing opens onto it. One source for the trees
 * (scenery/placement.ts), the planks and railing cut (scenery/canopy.ts), the walkable decks and rim colliders
 * (ambient/canopy-platforms.ts) and the dosel stamp (ambient/dosel.ts), so they can never drift apart.
 *
 * Geometry: each ceiba stands beside the walkway band (trunk edge ~0.55 u outside it). Its platform is a plank
 * ring from the trunk out to `outer`; the part of the ring inside the road band IS the walkway, so the deck
 * height is the walkway's own: `canopyDeckAt(t of the nearest road point)`. That makes the ring a plane tilted
 * along the road exactly like the bridge beside it (the walkway climbs ~0.35 u per u at the outer two trees):
 * stepping off the bridge onto the ring is seamless on both sides of the trunk, with no step anywhere.
 * The walkway railing on the tree's side opens over the chord where the ring meets the band (`railGap`); the
 * ring's outer rim (the part outside the band) gets posts, a rope rail and colliders.
 */
import { CANOPY_T, type SelvaLayout } from "../contract";

/** Ceiba trunk radius at scale 1 (scenery SPEC.ceiba.trunk reads it). */
export const CEIBA_TRUNK = 1.5;
/** The walkway ceibas: road t and side (same convention as roadPoint: +1 left of the tangent). */
export const WALKWAY_CEIBAS: ReadonlyArray<readonly [t: number, side: 1 | -1]> = [
  [0.852, 1],
  [0.866, -1],
  [0.879, 1],
];
export const WALKWAY_CEIBA_SCALE = 0.95;
/** Gap between the road band and the trunk's edge. */
const TRUNK_GAP = 0.55;
/** Plank ring: inner radius (planks tuck under the bark) and how far it reaches past `r` (= trunk + 2.2). */
export const PLATFORM_INNER = 1.25;
const PLATFORM_REACH = 2.2 + 1.4;
/** Rim colliders and posts only where the rim is this far outside the band (they never squeeze the bridge). */
export const RIM_CLEAR = 0.7;

type L = Pick<SelvaLayout, "trail" | "trailQuery" | "canopyDeckAt" | "heightAt">;

export interface CanopyPlatform {
  /** Trunk centre (world). */
  x: number;
  z: number;
  /** Road t nearest the trunk and the walkway side the tree stands on. */
  t: number;
  side: 1 | -1;
  /** Ceiba scale and trunk (collider) radius. */
  s: number;
  trunk: number;
  /** Deck height at t (the walkway's height beside the trunk). */
  y: number;
  /** Ring radii around the trunk centre. */
  inner: number;
  outer: number;
}

/** World point at road t offset `off` to `side` (scenery/placement.ts roadPoint, clamped to the road). */
function roadPoint(L: L, t: number, side: number, off: number): [number, number] {
  const p = L.trail.pointAt(t);
  const tg = L.trail.tangentAt(t);
  return [p.x - tg.z * side * off, p.z + tg.x * side * off];
}

export function canopyPlatforms(L: L): CanopyPlatform[] {
  const hw = L.trail.halfWidth;
  return WALKWAY_CEIBAS.map(([t, side]) => {
    const s = WALKWAY_CEIBA_SCALE;
    const trunk = CEIBA_TRUNK * s;
    const [x, z] = roadPoint(L, t, side, hw + trunk + TRUNK_GAP);
    const y = L.canopyDeckAt(t) ?? L.heightAt(x, z);
    return { x, z, t, side, s, trunk, y, inner: PLATFORM_INNER, outer: trunk + PLATFORM_REACH };
  });
}

/** Deck height of a platform at a world point: the walkway's height at the nearest road t. */
export function platformY(L: L, x: number, z: number): number {
  const t = L.trailQuery(x, z).t;
  return L.canopyDeckAt(Math.min(CANOPY_T[1], Math.max(CANOPY_T[0], t))) ?? L.heightAt(x, z);
}

/** True when (x, z) is on a platform ring (inside its outer radius, `pad` grows it). */
export function onCanopyPlatform(list: ReadonlyArray<CanopyPlatform>, x: number, z: number, pad = 0): boolean {
  for (const p of list) if ((x - p.x) ** 2 + (z - p.z) ** 2 <= (p.outer + pad) ** 2) return true;
  return false;
}

/**
 * Road t range on the platform's side where the walkway railing is cut: the band edge point lies within the
 * ring (+ `pad`). Scans the walkway around the trunk; [t0, t1] with t0 < t1.
 */
export function railGap(L: L, p: CanopyPlatform, pad = 0.3): [number, number] {
  const hw = L.trail.halfWidth;
  const len = L.trail.length;
  const inRing = (t: number) => {
    const [x, z] = roadPoint(L, t, p.side, hw + 0.12);
    return Math.hypot(x - p.x, z - p.z) < p.outer + pad;
  };
  let t0 = p.t;
  let t1 = p.t;
  const step = 0.05 / len;
  while (inRing(t0 - step) && t0 - p.t > -12 / len) t0 -= step;
  while (inRing(t1 + step) && t1 - p.t < 12 / len) t1 += step;
  return [t0, t1];
}

/** Rim angle (radians, world atan2(z, x) around the trunk) is "outside": the rim point clears the band. */
export function rimOutside(L: L, p: CanopyPlatform, a: number, clear = RIM_CLEAR): boolean {
  const x = p.x + Math.cos(a) * p.outer;
  const z = p.z + Math.sin(a) * p.outer;
  return L.trailQuery(x, z).d > L.trail.halfWidth + clear;
}

/**
 * Radial extent of the plank ring at angle a: from `inner` out to `outer`, stopping where it enters the road
 * band (the walkway's own planks cover that part). Returns [r0, r1]; r1 ≤ r0 means no planks at that angle.
 */
export function ringSpan(L: L, p: CanopyPlatform, a: number, overlap = 0.05): [number, number] {
  const hw = L.trail.halfWidth;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let r = p.inner;
  for (; r < p.outer; r += 0.05) if (L.trailQuery(p.x + c * r, p.z + s * r).d < hw - overlap) break;
  return [p.inner, Math.min(r, p.outer)];
}
