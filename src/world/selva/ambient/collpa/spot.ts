/**
 * Where the collpa (clay lick) cliff stands: pure constants and functions of the layout, shared by the
 * collpa station (which builds the cliff) and the fauna agent (macaws cling to its face). No three.js, no DOM.
 *
 * Frame: the collpa station pose (river side, side -1). Local +Z faces the road; the river runs behind the
 * viewpoint (local -Z) and the cliff rises from the FAR bank, facing back toward the viewpoint across the
 * water (~27 u away). The face is a shallow concave arc (its ends curve toward the viewer) that leans back a
 * little with height. Above the clay band sits a soil-and-roots cap; the clay band is where macaws cling.
 *
 *   const cliff = collpaCliff(env.selva.layout);
 *   cliff.point(u, v)        // u ∈ [-1, 1] across (−1 = left as seen from the viewpoint), v ∈ [0, 1] up
 *   cliff.normalAt(u)        // unit outward normal (x, z) at u (points away from the cliff, toward the river)
 *   cliff.clayV              // v range of exposed clay (cling here); above it is the soil cap
 *   cliff.footprint          // circles covering the massif behind the face (keep trees / walkers out)
 */

/** Local z of the cliff face line at u = 0 (the far waterline at the collpa is near −33 … −35). */
export const FACE_RIVER_DIST = 1.2;
/** Cliff width along the bank, height above the river, concavity radius and lean back at the top (units). */
export const CLIFF_WIDTH = 28;
export const CLIFF_TOP_ABOVE_RIVER = 8.6;
export const CLIFF_BASE_BELOW_RIVER = 0.6;
export const CLIFF_ARC_R = 46;
export const CLIFF_LEAN = 1.4;
/** Depth of the massif behind the face (it covers the far bank's forest edge). */
export const MASSIF_DEPTH = 9;
/** Exposed clay between these fractions of the face height; soil and roots above. */
export const CLAY_V: readonly [number, number] = [0.08, 0.8];
/** Viewpoint deck centre in the station frame (local x, local z), at the bank edge. */
export const VIEW_LOCAL: readonly [number, number] = [0, -7.2];

export interface CliffLayout {
  stationPose(id: string): { position: { x: number; y: number; z: number }; yaw: number };
  riverDist(x: number, z: number): number;
  river: { level: number };
}

export interface CollpaCliff {
  /** Station frame (yaw and origin) the cliff is built in. */
  frame: { x: number; z: number; yaw: number };
  /** Local z of the face at u = 0, and the face base / top heights (world y). */
  faceZ: number;
  base: number;
  top: number;
  width: number;
  clayV: readonly [number, number];
  /** World point on the face. */
  point(u: number, v: number): { x: number; y: number; z: number };
  /** Unit outward normal of the face at u, in world x/z. */
  normalAt(u: number): { x: number; z: number };
  /** Local (lx, lz) of the face at (u, v); used by the builder. */
  local(u: number, v: number): { lx: number; lz: number; y: number };
  /** Circles (world) covering the massif behind the face. */
  footprint: Array<{ x: number; z: number; r: number }>;
  /** The viewpoint deck centre (world x/z). */
  view: { x: number; z: number };
}

export function collpaCliff(L: CliffLayout): CollpaCliff {
  const pose = L.stationPose("collpa");
  const ox = pose.position.x;
  const oz = pose.position.z;
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  const wx = (lx: number, lz: number) => ox + lx * c + lz * s;
  const wz = (lx: number, lz: number) => oz - lx * s + lz * c;
  // Walk away from the road across the river; the far bank is where riverDist turns positive again.
  let inWater = false;
  let faceZ = -34;
  for (let lz = -6; lz > -80; lz -= 0.25) {
    const d = L.riverDist(wx(0, lz), wz(0, lz));
    if (d < 0) inWater = true;
    else if (inWater && d >= FACE_RIVER_DIST) {
      faceZ = lz;
      break;
    }
  }
  const level = L.river.level;
  const base = level - CLIFF_BASE_BELOW_RIVER;
  const top = level + CLIFF_TOP_ABOVE_RIVER;
  const half = CLIFF_WIDTH / 2;
  const local = (u: number, v: number) => {
    const lx = u * half;
    // Concave toward the viewer: the ends come forward (toward +Z), the top leans back (toward −Z).
    const lz = faceZ + (lx * lx) / (2 * CLIFF_ARC_R) - CLIFF_LEAN * v;
    return { lx, lz, y: base + (top - base) * v };
  };
  const footprint: Array<{ x: number; z: number; r: number }> = [];
  for (let u = -1; u <= 1.001; u += 0.25) {
    const f = local(u, 0.5);
    const lz = f.lz - MASSIF_DEPTH / 2;
    footprint.push({ x: wx(f.lx, lz), z: wz(f.lx, lz), r: MASSIF_DEPTH / 2 + 1 });
  }
  return {
    frame: { x: ox, z: oz, yaw: pose.yaw },
    faceZ,
    base,
    top,
    width: CLIFF_WIDTH,
    clayV: CLAY_V,
    local,
    point(u, v) {
      const p = local(u, v);
      return { x: wx(p.lx, p.lz), y: p.y, z: wz(p.lx, p.lz) };
    },
    normalAt(u) {
      // Derivative of the arc: d(lz)/d(lx) = lx / R; the outward normal is (−slope, 1) normalised, in local.
      const lx = u * half;
      const nx = -lx / CLIFF_ARC_R;
      const len = Math.hypot(nx, 1);
      const lnx = nx / len;
      const lnz = 1 / len;
      return { x: lnx * c + lnz * s, z: -lnx * s + lnz * c };
    },
    footprint,
    view: { x: wx(VIEW_LOCAL[0], VIEW_LOCAL[1]), z: wz(VIEW_LOCAL[0], VIEW_LOCAL[1]) },
  };
}
