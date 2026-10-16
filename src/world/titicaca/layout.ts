/**
 * Pure layout of the Collasuyu (Lake Titicaca) for the suyu runtime: the altiplano heightfield around the lake,
 * the shore road, the station plazas and their spurs, the lake (a signed land field: positive on land, negative
 * in water), walkability and the queries the scenery and the ambients share. No DOM; only three.js math types
 * (tested in layout.test.ts).
 *
 * Land field: the main southern shore (./plan.ts shoreZ, the lake lies north of it) joined by a smooth max with
 * the headlands (Taquile's hill, the Isla del Sol and its neck), with a little seeded wobble so the waterline is
 * not a drawn curve. It is close to a distance (the shore and the ellipses are gentle), so it doubles as
 * `waterDist`.
 *
 * Ground: lake bed below the water (a shallow shelf for the totora reeds, then deeper), a low beach, the flat
 * puna by the road, and inland the altiplano rising to rounded hills; domes for the headlands and Sillustani; a
 * cone under each terraced hill (the stepped terraces themselves are scenery geometry that covers the cone).
 * The road and the plazas are flattened into the grid like the other worlds; a spur from the road to each land
 * plaza ramps between the two heights.
 *
 * Walkable: the road band, the land plazas and their spurs, and what ambients add (`addWalkable`); never water.
 * The floating islands and the boardwalk are decks (../decks.ts, registered by the Uros ambient), so they need
 * no walkable area.
 */
import { CatmullRomCurve3, Vector3 } from "three";
import type { Collider, Pose, Trail } from "../contract";
import type { SuyuLayout, SuyuPlaza } from "../suyu/contract";
import {
  DOCKS,
  HALF,
  HEADLANDS,
  ISLAND_Y,
  ISLANDS,
  LEVEL,
  type P2,
  ROAD_HALF,
  ROAD_POINTS,
  SILLUSTANI,
  shoreZ,
  TAQUILE,
  TERRACE_HILLS,
  TITICACA_STATIONS,
  TITIKALA,
  UROS_LANDING,
} from "./plan";

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Polynomial smooth maximum (k: blend width). */
const smax = (a: number, b: number, k: number) => {
  const h = clamp01(0.5 + (0.5 * (a - b)) / k);
  return lerp(b, a, h) + k * h * (1 - h);
};

/** Seeded lattice noise in 0..1 (smooth). */
export function noise(x: number, z: number): number {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ 0x7171ca;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = smooth(0, 1, x - i);
  const v = smooth(0, 1, z - j);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

/** Signed distance-like field of the main shore (positive south of it, on land). */
export const mainLand = (x: number, z: number) => z - shoreZ(x);

/** Land field: positive on land, negative in the lake (≈ distance to the waterline). */
export function landField(x: number, z: number): number {
  let f = mainLand(x, z);
  for (const h of HEADLANDS) {
    const e = Math.hypot((x - h.x) / h.rx, (z - h.z) / h.rz);
    f = smax(f, (1 - e) * Math.min(h.rx, h.rz), 10);
  }
  return f + (noise(x / 23, z / 23) - 0.5) * 3.2;
}

/** Height of a headland dome (0 outside). */
function domes(x: number, z: number): number {
  let y = 0;
  for (const h of HEADLANDS) {
    const e2 = ((x - h.x) / h.rx) ** 2 + ((z - h.z) / h.rz) ** 2;
    if (e2 < 1) y = Math.max(y, h.h * (1 - e2) ** 1.4);
  }
  const s2 = ((x - SILLUSTANI.x) ** 2 + (z - SILLUSTANI.z) ** 2) / SILLUSTANI.r ** 2;
  if (s2 < 1) y = Math.max(y, SILLUSTANI.h * Math.min(1, 1.35 * (1 - s2) ** 1.2));
  return y;
}

/** Cone under each terraced hill: always below its stepped geometry (scenery/terraces.ts). */
export function terraceCone(x: number, z: number): number {
  let y = 0;
  for (const t of TERRACE_HILLS) {
    const d = Math.hypot(x - t.x, z - t.z) / t.r;
    if (d < 1) y = Math.max(y, t.h * 0.9 * (1 - d));
  }
  return y;
}

/** Inside a terraced hill's footprint (grown by pad). */
export function onTerraces(x: number, z: number, pad = 0): boolean {
  return TERRACE_HILLS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pad);
}

/** Natural ground before the road and plazas are cut in. */
export function baseHeight(x: number, z: number): number {
  const L = landField(x, z);
  if (L < 0) {
    // Lake bed: a shallow shelf (the reeds' depth), then deeper water.
    const d = -L;
    return LEVEL - 0.35 - 0.9 * smooth(0, 14, d) - 4.2 * smooth(10, 70, d) - noise(x / 9, z / 9) * 0.25;
  }
  const beach = LEVEL - 0.35 + 1.25 * smooth(-1, 6, L);
  const m = mainLand(x, z);
  const roll = (noise(x / 55, z / 55) - 0.5) * 2.4 * smooth(6, 26, L) + (noise(x / 14, z / 14) - 0.5) * 0.5;
  // The altiplano rising south of the road to rounded hills (the road runs 15–30 u from the shore).
  const rise = 38 * smooth(48, 300, m) ** 1.15 * (0.65 + 0.7 * noise(x / 90 + 7, z / 90));
  return beach + roll + Math.max(rise, domes(x, z), terraceCone(x, z));
}

type Hit = { d: number; i: number; u: number };

/** Nearest point on a polyline (linear scan over a coarse grid of segments, then the exact segment). */
function polyQuery(pts: ReadonlyArray<P2>): (x: number, z: number) => Hit {
  const CH = 16;
  const chunks: Array<{ lo: number; hi: number; x0: number; z0: number; x1: number; z1: number }> = [];
  for (let lo = 0; lo < pts.length - 1; lo += CH) {
    const hi = Math.min(pts.length - 1, lo + CH);
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let i = lo; i <= hi; i++) {
      const [x, z] = pts[i] as P2;
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    chunks.push({ lo, hi, x0, z0, x1, z1 });
  }
  return (x, z) => {
    let best = Infinity;
    let bi = 0;
    let bu = 0;
    for (const c of chunks) {
      const b = Math.max(c.x0 - x, 0, x - c.x1) ** 2 + Math.max(c.z0 - z, 0, z - c.z1) ** 2;
      if (b > best) continue;
      for (let i = c.lo; i < c.hi; i++) {
        const [ax, az] = pts[i] as P2;
        const [bx, bz] = pts[i + 1] as P2;
        const dx = bx - ax;
        const dz = bz - az;
        const u = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
        const d2 = (x - ax - u * dx) ** 2 + (z - az - u * dz) ** 2;
        if (d2 < best) {
          best = d2;
          bi = i;
          bu = u;
        }
      }
    }
    return { d: Math.sqrt(best), i: bi, u: bu };
  };
}

/** Distance from (x, z) to segment a → b and the parameter along it. */
export function segQuery(a: P2, b: P2, x: number, z: number): { d: number; u: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / l2) : 0;
  return { d: Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u), u };
}

const inside = (c: Collider, x: number, z: number) =>
  c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;

export interface Spur {
  id: string;
  /** Road end (on the road's edge) and plaza end, with their heights. */
  a: P2;
  b: P2;
  ya: number;
  yb: number;
  half: number;
}

export interface TiticacaLayout extends SuyuLayout {
  level: number;
  landField(x: number, z: number): number;
  /** Paths from the road up to the land plazas (map, scenery). */
  spurs: Spur[];
  /** Where the road ends (t = 1) and its last heading. */
  end: { x: number; z: number; y: number; yaw: number };
}

/** Land plazas: centre and radius (the islands are decks on the water, not plazas cut into the ground). */
function landPlazaSpots(roadStart: P2): Record<string, { x: number; z: number; r: number }> {
  return {
    punku: { x: roadStart[0], z: roadStart[1], r: 6 },
    sillustani: { x: SILLUSTANI.x, z: SILLUSTANI.z - 2, r: 10 },
    uros: { x: UROS_LANDING.x, z: UROS_LANDING.z, r: 4.6 },
    muelle: { x: DOCKS.taquile.landX, z: DOCKS.taquile.landZ, r: 4.2 },
    taquile: { x: TAQUILE.x, z: TAQUILE.z, r: TAQUILE.r },
    titikala: { x: TITIKALA.x, z: TITIKALA.z, r: TITIKALA.r },
  };
}

export function buildTiticacaLayout(opts: { cells: number }): TiticacaLayout {
  const n = opts.cells;
  if (!Number.isInteger(n) || n < 2) throw new RangeError("cells must be an integer >= 2");
  const size = HALF * 2;
  const step = size / n;
  const bounds = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };

  // ---------------------------------------------------------------- road
  const curve = new CatmullRomCurve3(ROAD_POINTS.map(([x, z]) => new Vector3(x, 0, z)));
  curve.arcLengthDivisions = 2048;
  const count = Math.ceil(curve.getLength() / 1.2);
  const samples = curve.getSpacedPoints(count);
  const road: P2[] = samples.map((p) => [p.x, p.z]);
  const raw = samples.map((p) => baseHeight(p.x, p.z));
  // A gentle road: averaged over ±12 samples (≈ 14 u), never below the beach.
  let roadY = raw.map((_, i) => {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - 12); j <= Math.min(count, i + 12); j++) {
      s += raw[j] as number;
      k++;
    }
    return Math.max(LEVEL + 0.6, s / k);
  });
  const start = road[0] as P2;
  const spots = landPlazaSpots(start);
  const plazaY: Record<string, number> = {};
  for (const [id, s] of Object.entries(spots)) plazaY[id] = Math.max(LEVEL + 0.6, baseHeight(s.x, s.z));
  // The punku's plaza and the road start agree; so do the road's last metres and Titikala's plaza.
  plazaY.punku = roadY[0] as number;
  roadY = roadY.map((y, i) => lerp(y, plazaY.titikala as number, smooth(count - 40, count, i) * 0.85));

  const sampleY = (t: number) => {
    const k = clamp01(t) * count;
    const i = Math.min(count - 1, Math.floor(k));
    return lerp(roadY[i] as number, roadY[i + 1] as number, k - i);
  };
  const pointAt = (t: number, out = new Vector3()) => curve.getPointAt(clamp01(t), out).setY(sampleY(t));
  const tangentAt = (t: number, out = new Vector3()) => {
    const a = curve.getPointAt(clamp01(t - 0.0005));
    const b = curve.getPointAt(clamp01(t + 0.0005));
    return out.subVectors(b, a).setY(0).normalize();
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
  const trail: Trail = { length, halfWidth: ROAD_HALF, pointAt, tangentAt, nearestT: (x, z) => trailQuery(x, z).t };

  // ---------------------------------------------------------------- plazas, spurs
  const plazas: SuyuPlaza[] = [];
  const poses = new Map<string, Pose>();
  const spurs: Spur[] = [];
  for (const s of TITICACA_STATIONS) {
    const isl = ISLANDS.find((i) => i.id === s.id);
    if (isl) {
      plazas.push({ id: s.id, x: isl.x, z: isl.z, r: isl.r, y: ISLAND_Y });
      // Facing the hub (where the boardwalk arrives) — from any island, toward the shore.
      poses.set(s.id, { position: new Vector3(isl.x, ISLAND_Y, isl.z), yaw: Math.atan2(0, 1) });
      continue;
    }
    const spot = spots[s.id];
    if (!spot) continue;
    const y = plazaY[s.id] as number;
    plazas.push({ id: s.id, x: spot.x, z: spot.z, r: spot.r, y });
    const q = trailQuery(spot.x, spot.z);
    const rp = pointAt(q.t);
    // Pose: on the plaza, facing the road (where the traveler comes from).
    const yaw = q.d > 0.5 ? Math.atan2(rp.x - spot.x, rp.z - spot.z) : Math.atan2(-1, 0);
    poses.set(s.id, { position: new Vector3(spot.x, y, spot.z), yaw });
    if (q.d > spot.r + ROAD_HALF) {
      const dx = spot.x - rp.x;
      const dz = spot.z - rp.z;
      const l = Math.hypot(dx, dz);
      spurs.push({
        id: s.id,
        a: [rp.x + (dx / l) * (ROAD_HALF - 0.4), rp.z + (dz / l) * (ROAD_HALF - 0.4)],
        b: [spot.x, spot.z],
        ya: rp.y,
        yb: y,
        half: 1.9,
      });
    }
  }
  const landPlazas = plazas.filter((p) => !ISLANDS.some((i) => i.id === p.id));
  /** Spur height at (x, z) and distance to its centreline. */
  const spurAt = (sp: Spur, x: number, z: number) => {
    const q = segQuery(sp.a, sp.b, x, z);
    return { d: q.d, y: lerp(sp.ya, sp.yb, smooth(0, 1, q.u)) };
  };

  // ---------------------------------------------------------------- heightfield
  const finalHeight = (x: number, z: number) => {
    let y = baseHeight(x, z);
    const L = landField(x, z);
    const dry = smooth(-1.5, 1.5, L);
    const q = trailQuery(x, z);
    y = lerp(y, q.y - 0.02, dry * (1 - smooth(ROAD_HALF + step * 1.2, ROAD_HALF + step * 1.2 + 6, q.d)));
    for (const sp of spurs) {
      const s = spurAt(sp, x, z);
      y = lerp(y, s.y - 0.02, dry * (1 - smooth(sp.half + step * 1.2, sp.half + step * 1.2 + 4, s.d)));
    }
    for (const pl of landPlazas) {
      const d = Math.hypot(x - pl.x, z - pl.z) - pl.r;
      y = lerp(y, pl.y - 0.02, dry * (1 - smooth(step * 1.2, step * 1.2 + 5, d)));
    }
    return y;
  };
  const h = new Float32Array((n + 1) ** 2);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) h[j * (n + 1) + i] = finalHeight(-HALF + i * step, -HALF + j * step);
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

  // ---------------------------------------------------------------- walkability
  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const isWater = (x: number, z: number) => landField(x, z) < 0 && heightAt(x, z) < LEVEL;
  const onPaths = (x: number, z: number, margin = 0) => {
    if (trailQuery(x, z).d <= ROAD_HALF + margin) return true;
    for (const pl of landPlazas) if (Math.hypot(x - pl.x, z - pl.z) <= pl.r + margin) return true;
    for (const sp of spurs) if (segQuery(sp.a, sp.b, x, z).d <= sp.half + margin) return true;
    return false;
  };
  const walkable = (x: number, z: number) => {
    if (walkAreas.some((c) => inside(c, x, z))) return true;
    if (isWater(x, z)) return false;
    return onPaths(x, z);
  };
  const endP = pointAt(1);
  const endT = tangentAt(1);

  return {
    trail,
    heightAt,
    groundAt: heightAt,
    stationPose(id) {
      const pose = poses.get(id);
      if (!pose) throw new Error(`unknown station ${id}`);
      const position = pose.position.clone();
      if (!ISLANDS.some((i) => i.id === id)) position.y = heightAt(position.x, position.z);
      return { position, yaw: pose.yaw };
    },
    walkable,
    addWalkable: (c) => walkAreas.push(c),
    addCollider: (c) => colliders.push(c),
    colliders,
    plazas,
    isWater,
    waterDist: landField,
    isGround(x, z) {
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
      if (landField(x, z) < 1.5 || onPaths(x, z, 1.2) || onTerraces(x, z, 2)) return false;
      const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      return slope < 0.7;
    },
    trailQuery,
    grid: { n, size, h },
    bounds,
    level: LEVEL,
    landField,
    spurs,
    end: { x: endP.x, z: endP.z, y: endP.y, yaw: Math.atan2(endT.x, endT.z) },
  };
}
