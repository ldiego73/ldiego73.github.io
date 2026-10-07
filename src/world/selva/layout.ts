/**
 * Pure Antisuyu layout in a Y-up frame: west is -X, east is +X, and the river lies
 * on the road's negative side (-Z). Arc-length t follows a lowland S-shaped road,
 * not a climb. Bake terrain triangles after smoothing the road and station aprons;
 * the canopy is a separate walkable surface above a hollow, never baked into soil.
 * Only Three math objects are used; scenery and avatar code share these queries.
 */
import { CatmullRomCurve3, Vector3 } from "three";
import type { Collider, Pose, Trail } from "../contract";
import { CANOE_STRETCH, CANOPY_T, SELVA_STATIONS, type SelvaLayout, type SelvaPlaza } from "./contract";

const HALF = 525;
const ROAD_WIDTH = 2.6;
const LEVEL = 1;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Seeded lattice noise, with a smooth first derivative at cell boundaries. */
function noise(x: number, z: number) {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ 0x51e1a;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = smooth(0, 1, x - i);
  const v = smooth(0, 1, z - j);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

function baseHeight(x: number, z: number) {
  return (
    3.5 +
    2.4 * noise(x / 95, z / 95) +
    0.6 * noise(x / 27, z / 27) +
    2 * Math.exp(-(((x + 160) / 90) ** 2 + ((z - 50) / 100) ** 2))
  );
}

type Point = [number, number];
type Hit = { d: number; i: number; u: number };
interface Node {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  lo: number;
  hi: number;
  left?: Node;
  right?: Node;
}

/** Balanced segment bounds prune distant branches, including queries far from the road.
 * Unlike a fixed search window, this still returns the actual closest segment there. */
function polyQuery(pts: Point[]): (x: number, z: number) => Hit {
  const build = (lo: number, hi: number): Node => {
    const node: Node = { lo, hi, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (let i = lo; i <= hi; i++) {
      const [x, z] = pts[i] as Point;
      node.x0 = Math.min(node.x0, x);
      node.z0 = Math.min(node.z0, z);
      node.x1 = Math.max(node.x1, x);
      node.z1 = Math.max(node.z1, z);
    }
    if (hi - lo > 8) {
      const mid = (lo + hi) >> 1;
      node.left = build(lo, mid);
      node.right = build(mid, hi);
    }
    return node;
  };
  const root = build(0, pts.length - 1);
  return (x, z) => {
    let best = Infinity;
    let bi = 0;
    let bu = 0;
    const bound = (n: Node) => Math.max(n.x0 - x, 0, x - n.x1) ** 2 + Math.max(n.z0 - z, 0, z - n.z1) ** 2;
    const visit = (node: Node) => {
      if (bound(node) > best) return;
      if (node.left && node.right) {
        const a = node.left;
        const b = node.right;
        if (bound(a) < bound(b)) {
          visit(a);
          visit(b);
        } else {
          visit(b);
          visit(a);
        }
        return;
      }
      for (let i = node.lo; i < node.hi; i++) {
        const [ax, az] = pts[i] as Point;
        const [bx, bz] = pts[i + 1] as Point;
        const dx = bx - ax;
        const dz = bz - az;
        const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
        const d2 = (x - ax - u * dx) ** 2 + (z - az - u * dz) ** 2;
        if (d2 < best) {
          best = d2;
          bi = i;
          bu = u;
        }
      }
    };
    visit(root);
    return { d: Math.sqrt(best), i: bi, u: bu };
  };
}

const inside = (c: Collider, x: number, z: number) =>
  c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;

export function buildSelvaLayout(opts: { cells: number }): SelvaLayout {
  const n = opts.cells;
  if (!Number.isInteger(n) || n < 2) throw new RangeError("cells must be an integer >= 2");
  const size = HALF * 2;
  const step = size / n;
  const bounds = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };
  const curve = new CatmullRomCurve3(
    [-400, -300, -200, -100, 0, 100, 200, 300, 400].map(
      (x) => new Vector3(x, 0, 22 * Math.sin(((x + 400) * Math.PI) / 250)),
    ),
  );
  curve.arcLengthDivisions = 2048;
  const count = Math.ceil(curve.getLength());
  const samples = curve.getSpacedPoints(count);
  const road: Point[] = samples.map((p) => [p.x, p.z]);
  const roadY = samples.map((p) => baseHeight(p.x, p.z));
  // Flat station landings with smooth shoulders, so aprons and the road agree.
  for (const station of SELVA_STATIONS) {
    const center = Math.round(station.t * count);
    const y = roadY[center] as number;
    for (let i = Math.max(0, center - 20); i <= Math.min(count, center + 20); i++) {
      roadY[i] = lerp(roadY[i] as number, y, 1 - smooth(12, 20, Math.abs(i - center)));
    }
  }
  const sampleY = (t: number) => {
    const k = clamp(t) * count;
    const i = Math.min(count - 1, Math.floor(k));
    return lerp(roadY[i] as number, roadY[i + 1] as number, k - i);
  };
  const pointAt = (t: number, out = new Vector3()) => curve.getPointAt(clamp(t), out).setY(sampleY(t));
  const tangentAt = (t: number, out = new Vector3()) => {
    const a = pointAt(t - 0.0001);
    const b = pointAt(t + 0.0001);
    return out.subVectors(b, a).normalize();
  };
  const nearestRoad = polyQuery(road);
  const trailQuery = (x: number, z: number) => {
    const q = nearestRoad(x, z);
    const t = (q.i + q.u) / count;
    return { d: q.d, t, y: sampleY(t) };
  };
  let length = 0;
  for (let i = 1; i <= count; i++) {
    const a = samples[i - 1] as Vector3;
    const b = samples[i] as Vector3;
    length += Math.hypot(b.x - a.x, b.z - a.z, (roadY[i] as number) - (roadY[i - 1] as number));
  }
  const trail: Trail = { length, halfWidth: ROAD_WIDTH, pointAt, tangentAt, nearestT: (x, z) => trailQuery(x, z).t };
  const poses = new Map<string, Pose>();
  const plazas: SelvaPlaza[] = SELVA_STATIONS.map((s) => {
    const p = pointAt(s.t);
    const tg = tangentAt(s.t).setY(0).normalize();
    const x = p.x - tg.z * s.side * s.offset;
    const z = p.z + tg.x * s.side * s.offset;
    poses.set(s.id, { position: new Vector3(x, p.y, z), yaw: Math.atan2(p.x - x, p.z - z) });
    return { id: s.id, x, z, y: p.y, r: 5.5 };
  });
  const spurs = plazas.map((pl, i) => {
    const p = pointAt((SELVA_STATIONS[i] as (typeof SELVA_STATIONS)[number]).t);
    const query = polyQuery([
      [p.x, p.z],
      [pl.x, pl.z],
    ]);
    return (x: number, z: number) => query(x, z).d;
  });
  const plazaDistance = (pl: SelvaPlaza, i: number, x: number, z: number) =>
    Math.min(Math.hypot(x - pl.x, z - pl.z) - pl.r, (spurs[i] as (x: number, z: number) => number)(x, z) - 2.6);

  const riverPts: Point[] = [];
  const widths: number[] = [];
  const riverCount = 240;
  for (let i = 0; i <= riverCount; i++) {
    const t = i / riverCount;
    const p = pointAt(t);
    const tg = tangentAt(t).setY(0).normalize();
    const w = 10 + 1.8 * Math.sin(t * Math.PI * 3);
    let gap = 24;
    for (const s of SELVA_STATIONS) {
      if (s.side !== -1) continue;
      // Bank is 11.5 units from the station centre (six from its plaza rim).
      const weight = 1 - smooth(0.015, 0.075, Math.abs(t - s.t));
      gap = lerp(gap, s.offset + 11.5, weight);
    }
    riverPts.push([p.x + tg.z * (gap + w), p.z - tg.x * (gap + w)]);
    widths.push(w);
  }
  // Extend the river past both trailheads while keeping its endpoints within bounds.
  const first = riverPts[0] as Point;
  const last = riverPts[riverCount] as Point;
  riverPts.unshift([first[0] - 80, first[1]]);
  riverPts.push([last[0] + 80, last[1]]);
  widths.unshift(widths[0] as number);
  widths.push(widths[widths.length - 1] as number);
  const nearestRiver = polyQuery(riverPts);
  const riverDist = (x: number, z: number) => {
    const q = nearestRiver(x, z);
    return q.d - lerp(widths[q.i] as number, widths[q.i + 1] as number, q.u);
  };
  const canopyLift = (t: number) => {
    const u = (t - CANOPY_T[0]) / (CANOPY_T[1] - CANOPY_T[0]);
    return u < 0 || u > 1 ? 0 : 9.5 * smooth(0, 1, 2 * Math.min(u, 1 - u));
  };
  const finalHeight = (x: number, z: number) => {
    const q = trailQuery(x, z);
    let y = baseHeight(x, z);
    const rd = riverDist(x, z);
    if (rd < 8) y = lerp(LEVEL - 3 - 0.12 * Math.max(0, Math.min(12, -rd)), y, smooth(0, 8, rd));
    // Broad banks slope into the forest; landing aprons take priority only on dry land.
    const dry = smooth(0, 0.5, rd);
    y = lerp(y, q.y, dry * (1 - smooth(ROAD_WIDTH + step * 1.5, ROAD_WIDTH + step * 1.5 + 5, q.d)));
    for (const [i, pl] of plazas.entries()) {
      const d = plazaDistance(pl, i, x, z);
      y = lerp(y, pl.y, dry * (1 - smooth(step * 1.5, step * 1.5 + 4, d)));
    }
    // A soft hollow underneath the walkway; the independent deck joins baked soil at both ends.
    y -= 0.22 * canopyLift(q.t) * (1 - smooth(4, 15, q.d));
    return y;
  };
  const h = new Float32Array((n + 1) ** 2);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) h[j * (n + 1) + i] = finalHeight(-HALF + i * step, -HALF + j * step);
  }
  /** Same b-d diagonal as the mountain terrain: (a,b,d), then (b,c,d). */
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
  const canopyDeckAt = (t: number) => {
    if (t < CANOPY_T[0] || t > CANOPY_T[1]) return null;
    const p = pointAt(t);
    return heightAt(p.x, p.z) + canopyLift(t);
  };
  const isWater = (x: number, z: number) => riverDist(x, z) < 0 && heightAt(x, z) < LEVEL;
  const groundAt = (x: number, z: number) => {
    const q = trailQuery(x, z);
    return (q.d <= ROAD_WIDTH ? canopyDeckAt(q.t) : null) ?? heightAt(x, z);
  };
  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const inPlaza = (x: number, z: number, margin = 0) =>
    plazas.some((pl, i) => plazaDistance(pl, i, x, z) <= margin + 1e-8);
  const walkable = (x: number, z: number) => {
    if (walkAreas.some((c) => inside(c, x, z))) return true;
    if (isWater(x, z)) return false;
    return trailQuery(x, z).d <= ROAD_WIDTH || inPlaza(x, z);
  };
  const dockPoint = (id: string): { t: number; point: Vector3 } => {
    const s = SELVA_STATIONS.find((station) => station.id === id);
    if (!s) throw new Error(`unknown station ${id}`);
    const k = s.t * riverCount + 1;
    const i = Math.floor(k);
    const u = k - i;
    const a = riverPts[i] as Point;
    const b = riverPts[i + 1] as Point;
    const tg = tangentAt(s.t).setY(0).normalize();
    const w = lerp(widths[i] as number, widths[i + 1] as number, u);
    return {
      t: s.t,
      point: new Vector3(lerp(a[0], b[0], u) - tg.z * (w - 3.5), LEVEL, lerp(a[1], b[1], u) + tg.x * (w - 3.5)),
    };
  };
  const start = dockPoint(CANOE_STRETCH.fromStation);
  const end = dockPoint(CANOE_STRETCH.toStation);
  const path: Point[] = [];
  for (let i = 0; i <= 90; i++) {
    const t = lerp(start.t, end.t, i / 90);
    const k = t * riverCount + 1;
    const index = Math.floor(k);
    const u = k - index;
    const a = riverPts[index] as Point;
    const b = riverPts[index + 1] as Point;
    const tg = tangentAt(t).setY(0).normalize();
    const w = lerp(widths[index] as number, widths[index + 1] as number, u);
    const bank = (w - 3.5) * (1 - smooth(0, 0.04, Math.min(t - start.t, end.t - t)));
    path.push([lerp(a[0], b[0], u) - tg.z * bank, lerp(a[1], b[1], u) + tg.x * bank]);
  }
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
    river: { pts: riverPts, halfWidth: widths, level: LEVEL },
    isWater,
    riverDist,
    isGround(x, z) {
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
      if (trailQuery(x, z).d <= ROAD_WIDTH + 1.2 || inPlaza(x, z, 0.8) || riverDist(x, z) <= 0) return false;
      const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      return slope < 0.65;
    },
    trailQuery,
    canoe: { path, from: start.point, to: end.point },
    canopyDeckAt,
    grid: { n, size, h },
    bounds,
  };
}
