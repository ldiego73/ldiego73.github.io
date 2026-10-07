/**
 * Keep-clear rules for the jungle scenery (pure: no Three, no DOM; runs under bun test).
 *
 * `layout.isGround` already keeps vegetation off the road band, the plazas (+ spurs), the water and steep
 * banks. On top of it the scenery must leave room for things other agents build:
 *  - station buildings are bigger than the 5.5 u plaza disc (maloca, palafitos, floating arcade), so trees
 *    keep `plazaTree` beyond the rim and understory `plazaUnder`;
 *  - river-side stations (regatón boat, embarcadero, palafitos, collpa cliff) need a free corridor from the
 *    plaza down to the water and some open water past the bank (docks, boats, the canoe landings);
 *  - the punku arrival ("puerto", start of the road) stays open for the runtime's gateway;
 *  - the canoe route keeps a lane free of lilies, sandbars, reeds and floating debris;
 *  - the canopy walkway corridor stays free of trees that would poke through the deck.
 * The numbers are exported so the lead can tune them in one place.
 */
import { inStationFootprint, stationFootprints } from "../ambient/embarcadero/footprints";
import { CANOPY_T, SELVA_STATIONS, type SelvaLayout } from "../contract";

export const CLEAR = {
  /** Extra clearance around station buildings (embarcadero/footprints.ts) for trees and for undergrowth. */
  builtTree: 3,
  builtUnder: 0.6,
  /** Trees (and palms) keep this far beyond a plaza rim. */
  plazaTree: 8,
  /** Understory (shrubs, heliconias, ferns) keeps this far beyond a plaza rim. */
  plazaUnder: 2,
  /** Half width of the dock corridor from a river-side plaza to the water. */
  dock: 7,
  /** How far the dock corridor runs past the bank into the river (boats, piers). */
  dockWater: 7,
  /** Radius kept open around the canoe landings. */
  landing: 6,
  /** Punku arrival: radius around the "puerto" plaza, and the road start (t below `gateT`) within `gateRoad`. */
  gate: 16,
  gateT: 0.045,
  gateRoad: 12,
  /** Lane kept free on each side of the canoe route (water things only). */
  canoe: 3,
  /** Nothing taller than `lowMax` within this distance of the road centerline (sight lines, camera). */
  roadLow: 5.5,
  lowMax: 1.6,
  /** Trees keep this far from the road centerline along the canopy walkway (the deck and its rails). */
  canopyTree: 8,
} as const;

/** The layout queries the clearance and placement code needs (lets tests pass a trimmed layout). */
export type ClearLayout = Pick<
  SelvaLayout,
  | "trail"
  | "plazas"
  | "river"
  | "canoe"
  | "isGround"
  | "isWater"
  | "riverDist"
  | "trailQuery"
  | "heightAt"
  | "canopyDeckAt"
  | "bounds"
> &
  Partial<Pick<SelvaLayout, "stationPose">>;

export type ClearKind = "tree" | "under" | "water";

export interface Clearance {
  /** True when something of this kind must not stand at (x, z) (on top of layout.isGround for land kinds). */
  blocked(x: number, z: number, kind: ClearKind): boolean;
  /** Dock corridors as segments [x0, z0, x1, z1] (plaza center → past the bank), for tests and debugging. */
  docks: Array<[number, number, number, number]>;
}

/** River-side station kinds that get a dock corridor (boat, landing, stilt houses, clay cliff). */
const DOCKED = new Set(["regaton", "embarcadero", "palafitos", "collpa"]);

export function distSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
}

/** Distance from (x, z) to a polyline, with a bounding-box early out at `max`. */
function distPoly(pts: Array<[number, number]>, x: number, z: number, max: number) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i] as [number, number];
    const [bx, bz] = pts[i + 1] as [number, number];
    if (Math.min(ax, bx) - x > max || x - Math.max(ax, bx) > max) continue;
    if (Math.min(az, bz) - z > max || z - Math.max(az, bz) > max) continue;
    best = Math.min(best, distSeg(x, z, ax, az, bx, bz));
  }
  return best;
}

export function createClearance(L: ClearLayout): Clearance {
  const docks: Array<[number, number, number, number]> = [];
  for (const s of SELVA_STATIONS) {
    if (!DOCKED.has(s.id)) continue;
    const pl = L.plazas.find((p) => p.id === s.id);
    if (!pl) continue;
    // March from the road through the plaza toward the river until well inside the water.
    const p = L.trail.pointAt(s.t);
    let dx = pl.x - p.x;
    let dz = pl.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let ex = pl.x;
    let ez = pl.z;
    for (let k = 0; k < 120; k++) {
      ex += dx * 0.5;
      ez += dz * 0.5;
      if (L.riverDist(ex, ez) < -CLEAR.dockWater) break;
    }
    docks.push([pl.x, pl.z, ex, ez]);
  }
  // Built ground of the station ambients outside their plazas (maloca, raft pond, stilt row, cliff, ...).
  const built = L.stationPose ? stationFootprints(L as Parameters<typeof stationFootprints>[0]) : [];
  const gate = L.plazas.find((p) => p.id === "puerto");
  const landings = [L.canoe.from, L.canoe.to];
  const canoeBox = L.canoe.path;

  return {
    docks,
    blocked(x, z, kind) {
      for (const [ax, az, bx, bz] of docks) if (distSeg(x, z, ax, az, bx, bz) < CLEAR.dock) return true;
      for (const p of landings) if (Math.hypot(x - p.x, z - p.z) < CLEAR.landing) return true;
      if (gate && Math.hypot(x - gate.x, z - gate.z) < CLEAR.gate) return true;
      if (inStationFootprint(built, x, z, kind === "tree" ? CLEAR.builtTree : CLEAR.builtUnder)) return true;
      if (kind === "water") return distPoly(canoeBox, x, z, CLEAR.canoe) < CLEAR.canoe;
      const pad = kind === "tree" ? CLEAR.plazaTree : CLEAR.plazaUnder;
      for (const pl of L.plazas) if (Math.hypot(x - pl.x, z - pl.z) < pl.r + pad) return true;
      const q = L.trailQuery(x, z);
      if (q.t < CLEAR.gateT && q.d < CLEAR.gateRoad) return true;
      if (kind === "tree" && q.t > CANOPY_T[0] - 0.004 && q.t < CANOPY_T[1] + 0.004 && q.d < CLEAR.canopyTree)
        return true;
      return false;
    },
  };
}
