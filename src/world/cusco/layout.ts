/**
 * Pure layout of the Cusco hub (Haukaypata) for the suyu runtime: the heightfield of the Huatanay valley
 * around the plaza, the walkable plaza and its five streets, the usnu's stone tiers as ground, station poses
 * and the hub's axis road. No DOM; only three.js math types (tested in layout.test.ts).
 *
 * Ground: the "built core" (the plaza rectangle, padded for the buildings around it, and each street from its
 * mouth to a little past its gate) is flat at y 0. Outside it the valley sides rise smoothly to ~40 u hills
 * 150 u out, with low noise, and the Sacsayhuamán hill stands to the north. The usnu's three tiers are part
 * of `groundAt` (not of `heightAt`): each tier is one step high, so the traveler walks up them like stairs.
 *
 * Walkable: the plaza (minus a 0.3 u margin under its edge walls) and each street band (ROAD_HALF from its
 * centreline) from the mouth to the gate's doorstep; nothing beyond the gates. Ambients add colliders (gate
 * jambs, the khipu frame, the chasqui post) through `addCollider`.
 *
 * Trail: the hub's axis, from the Qhapaq Ñan gate (t 0, south) north across the plaza and over the usnu to
 * the plaza's north edge (t 1). The runtime uses it for the music, the dev teleport and the snap fallback.
 */
import { Vector3 } from "three";
import type { Collider, Pose, Trail } from "../contract";
import type { SuyuLayout, SuyuPlaza } from "../suyu/contract";
import {
  AXIS,
  CUSCO_STATIONS,
  GATES,
  type Gate,
  gatePoint,
  type P2,
  PLAZA,
  ROAD_HALF,
  stationSpot,
  USNU,
} from "./plan";

/** Half size of the heightfield square (world units). */
export const HALF = 240;
/** Padding of the flat core around the plaza (the buildings stand on it). */
const CORE_PAD = 16;
/** The streets stay flat this far past their gate (the road is seen running on). */
const PAST_GATE = 16;
/** Visit centre radius of the usnu's plaza (its whole base and a step around it). */
const USNU_PLAZA_R = 7.5;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to segment a → b. */
export function segDist(ax: number, az: number, bx: number, bz: number, x: number, z: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? clamp01(((x - ax) * dx + (z - az) * dz) / l2) : 0;
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
}

/** Signed distance to an axis-aligned rectangle (negative inside). */
export function rectDist(x0: number, z0: number, x1: number, z1: number, x: number, z: number): number {
  const dx = Math.max(x0 - x, x - x1);
  const dz = Math.max(z0 - z, z - z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

/** Street segment of a gate: mouth → the gate's doorstep (plaza side), or further with `past`. */
export function streetEnd(g: Gate, past = -0.6): P2 {
  const [gx, gz] = gatePoint(g);
  return [gx + g.dir[0] * past, gz + g.dir[1] * past];
}

/** Where a street's walkable band starts: a little inside the plaza, so its round end never pokes past a corner. */
export function streetStart(g: Gate): P2 {
  return [g.mouth[0] - g.dir[0] * 3, g.mouth[1] - g.dir[1] * 3];
}

/** Distance outside the flat core (≤ 0 inside): the padded plaza and every street to past its gate. */
export function coreDist(x: number, z: number): number {
  let d = rectDist(PLAZA.x0 - CORE_PAD, PLAZA.z0 - CORE_PAD, PLAZA.x1 + CORE_PAD, PLAZA.z1 + CORE_PAD, x, z);
  for (const g of GATES) {
    const [ex, ez] = streetEnd(g, PAST_GATE);
    d = Math.min(d, segDist(g.mouth[0], g.mouth[1], ex, ez, x, z) - 9);
  }
  return d;
}

/** Seeded lattice noise in 0..1 (smooth). */
function noise(x: number, z: number) {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ 0x7c05c0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = smooth(0, 1, x - i);
  const v = smooth(0, 1, z - j);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Sacsayhuamán's hill north of the plaza (centre, radius, height). */
export const SACSAY = { x: -10, z: -150, r: 48, h: 26 } as const;

/** Valley ground before sampling into the grid. */
export function valleyHeight(x: number, z: number): number {
  const d = coreDist(x, z);
  if (d <= 0) return 0;
  // The Huatanay valley runs north-west → south-east: its sides (north-east, south-west) rise faster.
  const a = Math.atan2(z, x);
  const across = 1 + 0.35 * Math.abs(Math.sin(a + Math.PI / 4));
  const rise = 40 * across * smooth(4, 170, d) ** 1.25;
  const bumps = (noise(x / 38, z / 38) - 0.5) * 7 + (noise(x / 13, z / 13) - 0.5) * 1.6;
  const hill = SACSAY.h * Math.exp(-((x - SACSAY.x) ** 2 + (z - SACSAY.z) ** 2) / (SACSAY.r * SACSAY.r));
  return rise + (bumps + hill) * smooth(2, 30, d);
}

/** Height of the usnu's tiers at (x, z), or null off its base. */
export function usnuTop(x: number, z: number): number | null {
  const dx = Math.abs(x - USNU.x);
  const dz = Math.abs(z - USNU.z);
  let top: number | null = null;
  for (const t of USNU.tiers) if (dx <= t.half && dz <= t.half) top = t.top;
  return top;
}

const inside = (c: Collider, x: number, z: number) =>
  c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;

/** Walkable street bands (mouth → doorstep), shared by the layout and its tests. */
export function onStreet(x: number, z: number, margin = 0): boolean {
  for (const g of GATES) {
    const [sx, sz] = streetStart(g);
    const [ex, ez] = streetEnd(g);
    if (segDist(sx, sz, ex, ez, x, z) <= ROAD_HALF + margin) return true;
  }
  return false;
}

export function onPlaza(x: number, z: number, margin = 0.3): boolean {
  return x >= PLAZA.x0 + margin && x <= PLAZA.x1 - margin && z >= PLAZA.z0 + margin && z <= PLAZA.z1 - margin;
}

export interface CuscoLayout extends SuyuLayout {
  /** The street of each gate as [mouth, doorstep] (map, people, scenery). */
  streets: Array<{ id: Gate["id"]; from: P2; to: P2 }>;
}

export function buildCuscoLayout(opts: { cells: number }): CuscoLayout {
  const n = opts.cells;
  if (!Number.isInteger(n) || n < 2) throw new RangeError("cells must be an integer >= 2");
  const size = HALF * 2;
  const step = size / n;
  const bounds = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };
  const h = new Float32Array((n + 1) ** 2);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) h[j * (n + 1) + i] = valleyHeight(-HALF + i * step, -HALF + j * step);
  /** Same b-d diagonal as the other worlds' terrain: (a,b,d), then (b,c,d). */
  const heightAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(n - 1e-8, (x + HALF) / step));
    const fz = Math.max(0, Math.min(n - 1e-8, (z + HALF) / step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = h[j * (n + 1) + i] as number;
    const b = h[(j + 1) * (n + 1) + i] as number;
    const c = h[(j + 1) * (n + 1) + i + 1] as number;
    const d = h[j * (n + 1) + i + 1] as number;
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
  const groundAt = (x: number, z: number) => usnuTop(x, z) ?? heightAt(x, z);

  // Axis trail: a straight line south → north (t 0 at the Qhapaq gate).
  const A = new Vector3(0, 0, AXIS.z0);
  const B = new Vector3(0, 0, AXIS.z1);
  const length = AXIS.z0 - AXIS.z1;
  const pointAt = (t: number, out = new Vector3()) => {
    out.lerpVectors(A, B, clamp01(t));
    out.y = groundAt(out.x, out.z);
    return out;
  };
  const tangentAt = (_t: number, out = new Vector3()) => out.set(0, 0, -1);
  const trailQuery = (x: number, z: number) => {
    const t = clamp01((AXIS.z0 - z) / length);
    const d = segDist(A.x, A.z, B.x, B.z, x, z);
    return { d, t, y: groundAt(0, AXIS.z0 - t * length) };
  };
  const trail: Trail = { length, halfWidth: ROAD_HALF, pointAt, tangentAt, nearestT: (x, z) => trailQuery(x, z).t };

  const poses = new Map<string, Pose>();
  const plazas: SuyuPlaza[] = [];
  for (const s of CUSCO_STATIONS) {
    const spot = stationSpot(s.id);
    if (!spot) continue;
    poses.set(s.id, { position: new Vector3(spot.x, 0, spot.z), yaw: spot.yaw });
    // The usnu is visited from anywhere around its base; the others where the traveler stands in front.
    if (s.id === "usnu") plazas.push({ id: s.id, x: USNU.x, z: USNU.z, r: USNU_PLAZA_R, y: 0 });
    else plazas.push({ id: s.id, x: spot.x, z: spot.z, r: 4, y: 0 });
  }

  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const walkable = (x: number, z: number) => walkAreas.some((c) => inside(c, x, z)) || onPlaza(x, z) || onStreet(x, z);

  const streets = GATES.map((g) => ({ id: g.id, from: g.mouth, to: streetEnd(g) }));

  return {
    trail,
    heightAt,
    groundAt,
    stationPose(id) {
      const pose = poses.get(id);
      if (!pose) throw new Error(`unknown station ${id}`);
      const position = pose.position.clone();
      position.y = groundAt(position.x, position.z);
      return { position, yaw: pose.yaw };
    },
    walkable,
    addWalkable: (c) => walkAreas.push(c),
    addCollider: (c) => colliders.push(c),
    colliders,
    plazas,
    isWater: () => false,
    waterDist: () => 1e3,
    isGround(x, z) {
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
      if (coreDist(x, z) < 3) return false;
      const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      return slope < 0.9;
    },
    trailQuery,
    grid: { n, size, h },
    bounds,
    streets,
  };
}
