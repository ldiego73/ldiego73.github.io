/**
 * Pure layout of the Kuntisuyu world for the suyu runtime: the rim plateau, the canyon's smooth profile, the
 * pampa basin, the road (from ./plan.ts ROAD) with its height, the station plazas and the walkable test. No
 * DOM; only three.js math types (tested in layout.test.ts).
 *
 * Ground (`terrainY`, sampled into the heightfield grid):
 *  - plateau: the puna north of the canyon at ~CANYON.rimY with low noise, the colcas crag (a mesa rising
 *    north of the road behind the cliff line, ./plan.ts CRAG) and hills at the far edges;
 *  - canyon (0 < s < CANYON.south, s = z − rimZ(x)): the smooth cross-section `canyonY` (terraced upper slope,
 *    steep lower walls, the river bed ~175 u down). The scenery draws the canyon from its own finer, terraced
 *    sweep (scenery/canyon.ts); the grid only has to be close (camera, map, fauna);
 *  - south of the canyon the plateau climbs gently toward the volcanoes (backdrop);
 *  - north of PAMPA.z0 it eases down to the pampa (y ≈ −24), a shallow bowl round the mirador tower so the
 *    geoglyphs on its sides tilt toward the lookout.
 * Near the road and the plazas the ground blends to the road's own height (smoothed along the road, flat at
 * the stations), as in the jungle's layout.
 *
 * Walkable: the road band, the station plazas with a spur to the road, and whatever ambients add (decks come
 * from ../decks.ts). The river is the only water (`isWater`), at the bottom of the canyon, far from the road.
 */
import { Vector3 } from "three";
import type { Collider, Pose, Trail } from "../contract";
import type { SuyuLayout, SuyuPlaza } from "../suyu/contract";
import {
  CANYON,
  COLCA_STATIONS,
  CRAG,
  CRAG_LINE_Z,
  canyonS,
  HALF,
  type P2,
  PAMPA,
  ROAD,
  ROAD_HALF,
  rimZ,
  roadAt,
  STATION_SPOT,
  STATION_T,
  TOWER,
} from "./plan";

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Seeded lattice noise in 0..1 (smooth). */
export function noise(x: number, z: number, seed = 0x5c0a) {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = smooth(0, 1, x - i);
  const v = smooth(0, 1, z - j);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

/** The colcas crag: a mesa north of the cliff line (the cliff face itself is scenery in ambient/colcas). */
export function cragY(x: number, z: number): number {
  const lineZ = CRAG_LINE_Z;
  const across = smooth(CRAG.r, CRAG.r - 14, Math.abs(x - CRAG.x));
  const up = smooth(lineZ, lineZ - 9, z) * (1 - smooth(lineZ - 60, lineZ - 95, z));
  return CRAG.h * across * up;
}

/** How far the ground rounds down toward each rim (the shoulder: from the road the eye drops past the lip). */
export const SHOULDER = { w: 15, drop: 7 } as const;

/** Shoulder drop at canyon coordinate s for the north rim (0 at the road side, SHOULDER.drop at the lip). */
export function shoulder(s: number): number {
  return SHOULDER.drop * smooth(-SHOULDER.w, 0, s) ** 1.6;
}

/** Plateau (rim side and far north), before the pampa and the road blend. */
export function plateauY(x: number, z: number): number {
  const n = (noise(x / 70, z / 70) - 0.5) * 3 + (noise(x / 21, z / 21, 0x77) - 0.5) * 0.8;
  const edge = 26 * smooth(HALF - 90, HALF, Math.abs(x));
  return CANYON.rimY + n + cragY(x, z) + edge - shoulder(canyonS(x, z));
}

/** Height of the pampa basin at (x, z): a shallow bowl round the tower, low hills to the far north. */
export function pampaY(x: number, z: number): number {
  const d = Math.hypot(x - TOWER.x, z - TOWER.z);
  const bowl = 0.0009 * Math.min(d, 150) ** 2 + 0.08 * Math.max(0, d - 150);
  const n = (noise(x / 55, z / 55, 0x3a) - 0.5) * 2.4;
  const hills = 34 * smooth(-470, -590, z) * (0.6 + 0.6 * noise(x / 60, z / 60, 0x91));
  return PAMPA.y + Math.min(bowl, 22) + n + hills;
}

/**
 * Smooth canyon cross-section at s (0 at the north rim, CANYON.south at the south rim). `top` is the plateau
 * height at the north rim, `southTop` at the south rim, so both lips meet the plateau.
 */
export function canyonY(s: number, top: number, southTop: number): number {
  const C = CANYON;
  const bed = C.riverY - 3;
  if (s <= 0) return top;
  if (s < C.cliffEnd) return top - C.cliffDrop * (s / C.cliffEnd) ** 0.8;
  const t0 = top - C.cliffDrop;
  if (s < C.terraceEnd) return t0 - C.terraceDrop * ((s - C.cliffEnd) / (C.terraceEnd - C.cliffEnd)) ** 1.1;
  const t1 = t0 - C.terraceDrop;
  if (s < C.wallFoot)
    return lerp(
      t1,
      -150,
      smooth(C.terraceEnd, C.wallFoot, s) * 0.85 + ((s - C.terraceEnd) / (C.wallFoot - C.terraceEnd)) * 0.15,
    );
  if (s < C.river - C.riverHalf) return lerp(-150, bed, smooth(C.wallFoot, C.river - C.riverHalf, s));
  if (s <= C.river + C.riverHalf) return bed;
  // South side (mirrored): steep wall, terraces facing north (toward the road), a rock lip under the rim.
  const sCliff = C.south - C.cliffEnd;
  const sTer = sCliff - C.southTerraces;
  const c0 = southTop - C.cliffDrop;
  const t2 = c0 - C.southDrop;
  if (s < 176) return lerp(bed, -150, smooth(C.river + C.riverHalf, 176, s));
  if (s < sTer) return lerp(-150, t2, smooth(176, sTer, s) * 0.85 + ((s - 176) / (sTer - 176)) * 0.15);
  if (s < sCliff) return t2 + C.southDrop * ((s - sTer) / (sCliff - sTer)) ** 0.9;
  if (s < C.south) return southTop - C.cliffDrop * ((C.south - s) / C.cliffEnd) ** 0.8;
  return southTop;
}

/** South plateau (beyond the south rim), rising toward the volcanoes. */
export function southY(x: number, z: number): number {
  const s = canyonS(x, z);
  const n = (noise(x / 80, z / 80, 0x2b) - 0.5) * 6;
  const lip = shoulder(CANYON.south - s);
  return CANYON.southY + Math.max(0, s - CANYON.south) * 0.16 + n * smooth(CANYON.south, CANYON.south + 40, s) - lip;
}

/** Terrain before the road and plaza blend. */
export function terrainY(x: number, z: number): number {
  const s = canyonS(x, z);
  if (s > 0) {
    if (s >= CANYON.south) return southY(x, z);
    const top = plateauY(x, rimZ(x));
    const southTop = southY(x, rimZ(x) + CANYON.south);
    return canyonY(s, top, southTop);
  }
  const m = smooth(PAMPA.z0, PAMPA.z1, z);
  const p = m < 1 ? plateauY(x, z) : 0;
  const q = m > 0 ? pampaY(x, z) : 0;
  // Never let the pampa ease bleed into the canyon side.
  return lerp(p, q, m * smooth(-20, -60, s));
}

type Hit = { d: number; i: number; u: number };

/** Nearest segment on a polyline, bucketed by a coarse grid (the road is ~1 300 samples). */
export function polyQuery(pts: ReadonlyArray<P2>, cell = 24): (x: number, z: number) => Hit {
  const buckets = new Map<number, number[]>();
  // Numeric cell key (cells span far less than ±2^15 in this world).
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as P2;
    const b = pts[i + 1] as P2;
    const ci = Math.floor(Math.min(a[0], b[0]) / cell);
    const cj = Math.floor(Math.min(a[1], b[1]) / cell);
    const ci2 = Math.floor(Math.max(a[0], b[0]) / cell);
    const cj2 = Math.floor(Math.max(a[1], b[1]) / cell);
    for (let u = ci; u <= ci2; u++)
      for (let v = cj; v <= cj2; v++) {
        const k = key(u, v);
        const list = buckets.get(k);
        if (list) list.push(i);
        else buckets.set(k, [i]);
      }
  }
  const out: Hit = { d: Infinity, i: 0, u: 0 };
  const seg = (i: number, x: number, z: number) => {
    const a = pts[i] as P2;
    const b = pts[i + 1] as P2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const u = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1));
    const d = Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz);
    if (d < out.d) {
      out.d = d;
      out.i = i;
      out.u = u;
    }
  };
  const visit = (u: number, v: number, x: number, z: number) => {
    const list = buckets.get(key(u, v));
    if (list) for (const i of list) seg(i, x, z);
  };
  return (x, z) => {
    out.d = Infinity;
    out.i = 0;
    out.u = 0;
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    visit(ci, cj, x, z);
    for (let ring = 1; ring < 80; ring++) {
      // Only the ring's perimeter: anything in a farther ring is at least ring·cell away.
      if (out.d <= (ring - 1) * cell) break;
      for (let u = ci - ring; u <= ci + ring; u++) {
        visit(u, cj - ring, x, z);
        visit(u, cj + ring, x, z);
      }
      for (let v = cj - ring + 1; v <= cj + ring - 1; v++) {
        visit(ci - ring, v, x, z);
        visit(ci + ring, v, x, z);
      }
    }
    if (!Number.isFinite(out.d)) for (let i = 0; i < pts.length - 1; i++) seg(i, x, z);
    return { d: out.d, i: out.i, u: out.u };
  };
}

/** Distance from (x, z) to segment a → b. */
export function segDist(ax: number, az: number, bx: number, bz: number, x: number, z: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const u = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
}

const inside = (c: Collider, x: number, z: number) =>
  c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;

export interface ColcaLayout extends SuyuLayout {
  /** Canyon coordinate: distance south of the north rim line (> 0 over the canyon). */
  canyonS(x: number, z: number): number;
  /** Road height at t (smoothed, flat at the stations). */
  roadY(t: number): number;
  /** A station plaza by id. */
  plaza(id: string): SuyuPlaza;
  /** The Cruz del Cóndor platform: centre, floor height and the yaw facing out over the canyon. */
  cruz: { x: number; z: number; y: number; yaw: number };
}

/** Where a station's plaza is (the Cruz del Cóndor sits 10 u past the road's end, toward the rim). */
export function plazaCenter(id: keyof typeof STATION_T): { x: number; z: number } {
  const t = STATION_T[id];
  const r = roadAt(t);
  if (id === "cruz") return { x: r.x + r.dx * 10, z: r.z + r.dz * 10 };
  const s = STATION_SPOT[id];
  return { x: r.x - r.dz * s.side * s.off, z: r.z + r.dx * s.side * s.off };
}

export function buildColcaLayout(opts: { cells: number }): ColcaLayout {
  const n = opts.cells;
  if (!Number.isInteger(n) || n < 2) throw new RangeError("cells must be an integer >= 2");
  const size = HALF * 2;
  const step = size / n;
  const bounds = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };
  const pts = ROAD.pts;
  const count = pts.length - 1;

  // Road height: terrain under the centreline, smoothed twice, flat around each station.
  let roadYs = pts.map((p) => terrainY(p[0], p[1]));
  for (let pass = 0; pass < 3; pass++) {
    const w = 14;
    roadYs = roadYs.map((_, i) => {
      let sum = 0;
      let k = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(count, i + w); j++) {
        sum += roadYs[j] as number;
        k++;
      }
      return sum / k;
    });
  }
  for (const t of Object.values(STATION_T)) {
    const c = Math.round(t * count);
    const y = roadYs[c] as number;
    for (let i = Math.max(0, c - 26); i <= Math.min(count, c + 26); i++)
      roadYs[i] = lerp(roadYs[i] as number, y, 1 - smooth(14, 26, Math.abs(i - c)));
  }
  const roadY = (t: number) => {
    const k = clamp01(t) * count;
    const i = Math.min(count - 1, Math.floor(k));
    return lerp(roadYs[i] as number, roadYs[i + 1] as number, k - i);
  };
  const nearestRoad = polyQuery(pts);
  const trailQuery = (x: number, z: number) => {
    const q = nearestRoad(x, z);
    const t = (q.i + q.u) / count;
    return { d: q.d, t, y: roadY(t) };
  };

  // Plazas (+ spurs to the road).
  const ids = Object.keys(STATION_T) as Array<keyof typeof STATION_T>;
  const plazas: SuyuPlaza[] = ids.map((id) => {
    const c = plazaCenter(id);
    return { id, x: c.x, z: c.z, r: STATION_SPOT[id].r, y: roadY(STATION_T[id]) };
  });
  const spurs = ids.map((id) => {
    const r = roadAt(STATION_T[id]);
    const c = plazaCenter(id);
    return { ax: r.x, az: r.z, bx: c.x, bz: c.z, reach: Math.hypot(c.x - r.x, c.z - r.z) };
  });
  /** Distance outside a plaza and its spur to the road (≤ 0 inside). */
  const plazaDist = (i: number, x: number, z: number) => {
    const pl = plazas[i] as SuyuPlaza;
    const sp = spurs[i] as (typeof spurs)[number];
    const dc = Math.hypot(x - pl.x, z - pl.z);
    // Far from both: the spur can't be closer than the plaza centre minus its length.
    if (dc - sp.reach - pl.r > 60) return dc - pl.r;
    return Math.min(dc - pl.r, segDist(sp.ax, sp.az, sp.bx, sp.bz, x, z) - 2.4);
  };

  const finalHeight = (x: number, z: number) => {
    let y = terrainY(x, z);
    const s = canyonS(x, z);
    // Never pull the canyon walls up to the road: the blend fades out before the rim.
    const dry = smooth(-1, -6, s);
    if (dry === 0) return y;
    const q = trailQuery(x, z);
    y = lerp(y, q.y, dry * (1 - smooth(ROAD_HALF + step * 1.5, ROAD_HALF + step * 1.5 + 6, q.d)));
    for (let i = 0; i < plazas.length; i++) {
      const d = plazaDist(i, x, z);
      y = lerp(y, (plazas[i] as SuyuPlaza).y, dry * (1 - smooth(step * 1.2, step * 1.2 + 6, d)));
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

  const pointAt = (t: number, out = new Vector3()) => {
    const r = roadAt(t);
    return out.set(r.x, roadY(t), r.z);
  };
  const tangentAt = (t: number, out = new Vector3()) => {
    const a = pointAt(t - 0.0004);
    const b = pointAt(t + 0.0004);
    return out.subVectors(b, a).normalize();
  };
  const trail: Trail = {
    length: ROAD.length,
    halfWidth: ROAD_HALF,
    pointAt,
    tangentAt,
    nearestT: (x, z) => trailQuery(x, z).t,
  };

  // Station poses: on the plaza, facing back to the road (the cruz faces out over the canyon).
  const poses = new Map<string, Pose>();
  for (const s of COLCA_STATIONS) {
    const pl = plazas.find((p) => p.id === s.id);
    if (!pl) continue;
    const r = roadAt(s.t);
    const yaw = s.id === "cruz" || s.id === "punku" ? Math.atan2(r.dx, r.dz) : Math.atan2(r.x - pl.x, r.z - pl.z);
    poses.set(s.id, { position: new Vector3(pl.x, pl.y, pl.z), yaw });
  }
  const cruzPl = plazas.find((p) => p.id === "cruz") as SuyuPlaza;
  const end = roadAt(1);

  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const inPlaza = (x: number, z: number, margin = 0) => {
    for (let i = 0; i < plazas.length; i++) if (plazaDist(i, x, z) <= margin) return true;
    return false;
  };
  const riverDist = (x: number, z: number) => Math.abs(canyonS(x, z) - CANYON.river) - CANYON.riverHalf;

  return {
    trail,
    heightAt,
    groundAt: heightAt,
    stationPose(id) {
      const pose = poses.get(id);
      if (!pose) throw new Error(`unknown station ${id}`);
      const position = pose.position.clone();
      position.y = heightAt(position.x, position.z);
      return { position, yaw: pose.yaw };
    },
    walkable(x, z) {
      if (walkAreas.some((c) => inside(c, x, z))) return true;
      return trailQuery(x, z).d <= ROAD_HALF || inPlaza(x, z);
    },
    addWalkable: (c) => walkAreas.push(c),
    addCollider: (c) => colliders.push(c),
    colliders,
    plazas,
    isWater: (x, z) => riverDist(x, z) < 0,
    waterDist: riverDist,
    isGround(x, z) {
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
      const s = canyonS(x, z);
      if (s > -1.5 && s < CANYON.south + 2) return false;
      if (trailQuery(x, z).d <= ROAD_HALF + 1.2 || inPlaza(x, z, 0.8)) return false;
      const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
      return slope < 0.6;
    },
    trailQuery,
    grid: { n, size, h },
    bounds,
    canyonS,
    roadY,
    plaza(id) {
      const p = plazas.find((x) => x.id === id);
      if (!p) throw new Error(`unknown plaza ${id}`);
      return p;
    },
    cruz: { x: cruzPl.x, z: cruzPl.z, y: cruzPl.y, yaw: Math.atan2(end.dx, end.dz) },
  };
}
