/**
 * Pure layout of the Chinchaysuyu coast for the suyu runtime (SuyuLayout + coast queries). No DOM; only
 * three.js math types (tested in layout.test.ts).
 *
 * Frame: +x east, −z north, the Pacific to the west at y 0. The road is an analytic gentle S running south →
 * north (`roadX(z)`), sampled every metre of z; its t is arc length (0 at the south end by the punku, 1 at the
 * finale headland). The shoreline is defined from the road: `shoreX(z) = roadX(z) − gap(z)`, so the sea is
 * always on the traveler's left at a designed distance: wide beaches where a station stands on the sea side,
 * a narrow cliff top at the headland between the two caballito beaches, and the road's end on a promontory
 * with the sea to the west and north. `cliff(z)` (0 beach … 1 cliff) shapes the shore profile.
 *
 * Height by distance inland from the shore (d = x − shoreX(z)): under water a shelving seabed (gentle off a
 * beach, steep under a cliff); on land a sandy beach rising to a coastal terrace, or a cliff; inland of the
 * road, desert hills and, far east, the Andean foothills. Two river valleys cross the coast to the sea (green
 * floodplains, a channel of water under a bridge where the road crosses). A few rocky islets and the guano
 * island stand offshore. The road and the station plazas are flattened into the terrain like the jungle's.
 *
 * Walkable: the road band, the station plazas with their spur paths, the bridges, and the open coastal strip
 * between the road and the sea where the slope is gentle (beaches and terraces), never water.
 */
import { Vector3 } from "three";
import type { Collider, Pose, Trail } from "../contract";
import type { SuyuLayout, SuyuPlaza } from "../suyu/contract";
import { BEACHES, COMPANY_STOPS, COSTA_STATIONS, FINALE_T, MARKET, PUNKU_T, STATION } from "./plan";

/** Heightfield bounds: the land reaches far east (foothills), the seabed some way west. */
export const BOUNDS = { x0: -260, x1: 580, z0: -420, z1: 420 } as const;
const SIZE = BOUNDS.x1 - BOUNDS.x0;
/** Road ends (z): south (t 0) and north (t 1). */
export const ROAD_Z = { south: 372, north: -372 } as const;
export const ROAD_HALF = 2.6;
/** Sea level. */
export const SEA = 0;
const PLAZA_R = 5.5;
/** Steepest the road may climb, per metre along it. */
const MAX_GRADE = 0.3;
/** Each company's monument stands on a flat apron behind its plaza (away from the road). */
export const APRON = { off: 18.5, r: 16 } as const;
/** The market's stalls stand round its plaza on a smaller flat terrace above the beach. */
export const MARKET_APRON = { off: 2, r: 12.5, blend: 14 } as const;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bump = (x: number, c: number, r: number) => 1 - smooth(r * 0.45, r, Math.abs(x - c));

/** Seeded lattice noise in 0..1 (smooth). */
export function noise(x: number, z: number) {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ 0xc057a;
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

/** The road's centreline x at z (a gentle S, swinging a little more toward the north). */
export function roadX(z: number): number {
  return 26 * Math.sin(z / 150 + 0.5) + 9 * Math.sin(z / 57 + 1.3) + 4 * Math.sin(z / 23);
}

/** A rocky islet / island: centre, radius, crown height. */
export interface Islet {
  id: string;
  x: number;
  z: number;
  r: number;
  h: number;
}

/** A river valley: where it meets the road (z) and its meander. */
export interface River {
  id: string;
  /** z where the river crosses the road. */
  z: number;
  /** Half width of the green valley floor. */
  valley: number;
  amp: number;
  wave: number;
}

export interface CostaLayout extends SuyuLayout {
  roadX(z: number): number;
  /** x of the shoreline (the sea is west of it). */
  shoreX(z: number): number;
  /** Road centre → shore distance at z. */
  gap(z: number): number;
  /** 0 sandy beach … 1 cliff, along the coast. */
  cliff(z: number): number;
  /** Distance inland from the shore (negative at sea). */
  shoreDist(x: number, z: number): number;
  /** z of the road at t. */
  zAt(t: number): number;
  rivers: Array<River & { pts: Array<[number, number]>; level: number[] }>;
  /** The flat aprons the company monuments stand on (id = station id). */
  aprons: SuyuPlaza[];
  /** Signed distance to the nearest river channel bank (negative in the water). */
  riverDist(x: number, z: number): number;
  /** Road bridges over the rivers (deck centre, half length along the road, deck height). */
  bridges: Array<{ id: string; x: number; z: number; yaw: number; half: number; y: number }>;
  islets: Islet[];
  /** The waterline point of a beach at road t (on the sand, just above the sea). */
  beachPoint(t: number): { x: number; z: number };
  /** Ground colour hint for the scenery: 0 desert, 1 green valley floor. */
  green(x: number, z: number): number;
}

export const RIVERS: River[] = [
  { id: "lurin", z: 0, valley: 34, amp: 7, wave: 46 },
  { id: "santa", z: 0, valley: 30, amp: 6, wave: 38 },
];
/** River crossings by road t (filled into RIVERS[].z once the road exists). */
const RIVER_T = [0.222, 0.535];

export function buildCostaLayout(opts: { cells: number }): CostaLayout {
  const n = opts.cells;
  if (!Number.isInteger(n) || n < 2) throw new RangeError("cells must be an integer >= 2");
  const step = SIZE / n;

  // ---------------------------------------------------------------- road polyline (1 u in z) and arc length
  const zs: number[] = [];
  for (let z = ROAD_Z.south; z >= ROAD_Z.north - 1e-6; z -= 1) zs.push(z);
  const xsRoad = zs.map(roadX);
  const cum: number[] = [0];
  for (let i = 1; i < zs.length; i++)
    cum.push(
      (cum[i - 1] as number) +
        Math.hypot((xsRoad[i] as number) - (xsRoad[i - 1] as number), (zs[i] as number) - (zs[i - 1] as number)),
    );
  const total = cum[cum.length - 1] as number;
  /** Fractional sample index of road t. */
  const idxOf = (t: number) => {
    const s = clamp01(t) * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if ((cum[m] as number) <= s) lo = m;
      else hi = m;
    }
    const seg = (cum[hi] as number) - (cum[lo] as number) || 1;
    return lo + (s - (cum[lo] as number)) / seg;
  };
  const zAt = (t: number) => ROAD_Z.south - idxOf(t);
  const tOfZ = (z: number) => {
    const k = Math.max(0, Math.min(zs.length - 1, ROAD_Z.south - z));
    const i = Math.min(zs.length - 2, Math.floor(k));
    return lerp(cum[i] as number, cum[i + 1] as number, k - i) / total;
  };
  const rivs: River[] = RIVERS.map((r, i) => ({ ...r, z: zAt(RIVER_T[i] as number) }));

  // ---------------------------------------------------------------- the coast: gap and cliffs by z
  const zOf = (t: number) => zAt(t);
  const seaward = COMPANY_STOPS.filter((s) => s.side === -1).map((s) => zOf(s.t));
  const landward = COMPANY_STOPS.filter((s) => s.side === 1).map((s) => zOf(s.t));
  const zMarket = zOf(MARKET.t);
  const zSouthBeach = zOf(BEACHES.south);
  const zNorthBeach = zOf(BEACHES.north);
  const zHead = (zSouthBeach + zNorthBeach) / 2;
  const zEnd = zOf(FINALE_T);
  const zPunku = zOf(PUNKU_T);
  const gap = (z: number) => {
    let g = 40 + 7 * Math.sin(z / 47) + 5 * Math.sin(z / 23 + 1);
    for (const sz of seaward) g = lerp(g, 68, bump(z, sz, 46));
    for (const sz of landward) g = lerp(g, 30, bump(z, sz, 30));
    g = lerp(g, 52, bump(z, zMarket, 40));
    g = lerp(g, 54, bump(z, zSouthBeach, 22));
    g = lerp(g, 44, bump(z, zNorthBeach, 26));
    g = lerp(g, 15, bump(z, zHead, 18));
    g = lerp(g, 54, bump(z, zPunku, 40));
    // The promontory at the road's end: the cliff edge just past the finale plaza.
    g = lerp(g, 13, smooth(zEnd + 40, zEnd + 6, z));
    // North of the headland the coast turns east: open sea in front of the finale.
    g -= 150 * smooth(zEnd - 12, zEnd - 46, z);
    // South of the punku a broad bay.
    g = lerp(g, 60, smooth(ROAD_Z.south + 10, ROAD_Z.south + 40, z));
    return g;
  };
  const cliff = (z: number) => {
    // Background: rocky stretches where a slow noise is high.
    let c = smooth(0.58, 0.72, noise(z / 60, 3.7));
    for (const sz of seaward) c = lerp(c, 0, bump(z, sz, 30));
    c = lerp(c, 0, bump(z, zMarket, 46));
    c = lerp(c, 0, bump(z, zSouthBeach, 20));
    c = lerp(c, 0, bump(z, zNorthBeach, 22));
    for (const r of rivs) c = lerp(c, 0, bump(z, r.z, 50));
    c = lerp(c, 1, bump(z, zHead, 16));
    c = lerp(c, 1, smooth(zEnd + 30, zEnd + 10, z));
    // The Paracas station's rocky point (penguins) just south of it.
    const paracas = COMPANY_STOPS.find((s) => s.culture === "paracas");
    if (paracas) c = lerp(c, 0.85, bump(z, zOf(paracas.t) + 34, 14));
    return clamp01(c);
  };
  const roadXz = (z: number) => {
    const k = Math.max(0, Math.min(zs.length - 1, ROAD_Z.south - z));
    if (k > 0 && k < zs.length - 1) {
      const i = Math.floor(k);
      return lerp(xsRoad[i] as number, xsRoad[i + 1] as number, k - i);
    }
    return roadX(z);
  };
  const shoreX = (z: number) => roadXz(z) - gap(z);

  // ---------------------------------------------------------------- islets and the guano island
  const zParacas = zOf(COMPANY_STOPS.find((s) => s.culture === "paracas")?.t ?? 0.17);
  const islets: Islet[] = [
    // Sea lion rocks at the foot of the headland between the caballito beaches.
    { id: "lobos-1", x: shoreX(zHead) - 16, z: zHead + 4, r: 6, h: 2.6 },
    { id: "lobos-2", x: shoreX(zHead) - 24, z: zHead - 9, r: 4.5, h: 2 },
    // Penguin rocks off the Paracas point.
    { id: "pinguinos", x: shoreX(zParacas + 34) - 14, z: zParacas + 36, r: 6.5, h: 3.2 },
    // The guano island offshore (white with birds), halfway up the coast.
    { id: "guano", x: shoreX(zOf(0.43)) - 125, z: zOf(0.43), r: 22, h: 13 },
    // A sea stack near the end.
    { id: "farallon", x: shoreX(zEnd + 60) - 30, z: zEnd + 60, r: 5, h: 9 },
  ];

  // ---------------------------------------------------------------- rivers
  const riverLine = (r: River, x: number) => r.z + r.amp * Math.sin((x - roadXz(r.z)) / r.wave);
  /** Valley floor height at distance d inland from the shore. */
  const floorY = (d: number) => 0.35 + 0.012 * Math.max(0, d);
  const rivers = rivs.map((r) => {
    const pts: Array<[number, number]> = [];
    const level: number[] = [];
    const sx = shoreX(r.z);
    for (let x = sx + 1; x <= 340; x += 3) {
      pts.push([x, riverLine(r, x)]);
      level.push(floorY(x - sx) - 0.45);
    }
    return { ...r, pts, level };
  });
  /** Signed distance to a river's channel (negative inside); width grows a little toward the mouth. */
  const riverDist = (x: number, z: number) => {
    let best = 1e3;
    for (const r of rivs) {
      if (x < shoreX(r.z) - 14 || x > 340) continue;
      const dz = Math.abs(z - riverLine(r, x));
      if (dz > 60) continue;
      // The meander is gentle: |dz| scaled by the curve's slope is close to the true distance.
      const slope = (r.amp / r.wave) * Math.cos((x - roadXz(r.z)) / r.wave);
      const d = dz / Math.sqrt(1 + slope * slope);
      // Wider toward the mouth; the stream thins out into the foothills where it rises.
      const half = (2.6 + 2.2 * smooth(60, 0, x - shoreX(r.z))) * (1 - smooth(250, 340, x));
      best = Math.min(best, d - half);
    }
    return best;
  };
  const valleyOf = (x: number, z: number) => {
    let v = 0;
    for (const r of rivs) {
      if (x < shoreX(r.z) - 20) continue;
      const dz = Math.abs(z - riverLine(r, x));
      const w = r.valley * (0.75 + 0.5 * smooth(0, 200, x - shoreX(r.z)));
      // The valleys narrow into the foothills and end before the map's edge.
      v = Math.max(v, (1 - smooth(w * 0.55, w, dz)) * (1 - smooth(300, 430, x)));
    }
    return v;
  };

  // ---------------------------------------------------------------- natural ground (before road and plazas)
  const natural = (x: number, z: number) => {
    const sx = shoreX(z);
    const d = x - sx;
    const c = cliff(z);
    const g = gap(z);
    let y: number;
    if (d < 0) {
      const a = -d;
      // Shelving seabed: ~1:20 off a beach, much steeper under a cliff, flattening at −14.
      const k = lerp(0.05, 0.35, c);
      y = -Math.min(14, a * k + a * a * 0.0006) - 0.08;
    } else {
      // Beach: 1:22 up to the dune line, then a terrace at the road's level.
      const terrace = 3.2 + 2.2 * noise(x / 40, z / 40);
      const beach = d < 18 ? d * 0.045 : lerp(18 * 0.045, terrace, smooth(18, Math.max(26, g * 0.8), d));
      const ch = 6 + 5 * noise(z / 33, 1.3);
      const cl = lerp(ch * smooth(0, 5.5, d), terrace + ch * 0.55, smooth(6, Math.max(12, g * 0.7), d));
      y = lerp(beach, cl, c);
      // Inland of the road: desert hills, then the Andean foothills far east.
      const past = d - g;
      if (past > 6) {
        const hills = 14 * noise(x / 70, z / 70) + 5 * noise(x / 21, z / 21);
        y += smooth(16, 120, past) * hills + 0.05 * Math.max(0, past - 30);
      }
      y += 110 * smooth(260, 560, x) * (0.6 + 0.4 * noise(x / 90, z / 90));
      // Hills along the north and south edges of the map hide where the terrain ends.
      const edge = Math.max(smooth(BOUNDS.z1 - 40, BOUNDS.z1, z), smooth(BOUNDS.z0 + 40, BOUNDS.z0, z));
      y += edge * 30 * smooth(10, 60, d) * (0.7 + 0.3 * noise(x / 25, z / 25));
      // Small dunes and ripples on the open sand.
      y += (noise(x / 9, z / 9) - 0.5) * 0.5 * smooth(30, 60, d) * (1 - c);
    }
    // River valleys: a green floor sloping gently to the sea, the channel cut into it.
    const v = valleyOf(x, z);
    if (v > 0 && d > -10) {
      y = lerp(y, floorY(d), v);
      const rd = riverDist(x, z);
      if (rd < 2) y = lerp(floorY(d) - 1.4, y, smooth(-1.5, 2, rd));
    }
    // Islets.
    for (const it of islets) {
      const r = Math.hypot(x - it.x, z - it.z);
      if (r < it.r * 1.6) {
        const k = 1 - smooth(it.r * 0.25, it.r * 1.6, r);
        const rough = 0.75 + 0.5 * noise(x / 3, z / 3);
        y = Math.max(y, lerp(y, it.h * rough, k));
      }
    }
    return y;
  };

  // ---------------------------------------------------------------- road heights (smoothed natural)
  const raw = zs.map((z, i) => natural(xsRoad[i] as number, z));
  const roadY = raw.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let k = -18; k <= 18; k++) {
      const j = Math.max(0, Math.min(raw.length - 1, i + k));
      const wk = 1 - Math.abs(k) / 19;
      s += (raw[j] as number) * wk;
      w += wk;
    }
    return Math.max(1.6, s / w);
  });
  // Flat landings at the stations.
  for (const st of COSTA_STATIONS) {
    const c = Math.round(idxOf(st.t));
    const y = roadY[c] as number;
    for (let i = Math.max(0, c - 22); i <= Math.min(roadY.length - 1, c + 22); i++)
      roadY[i] = lerp(roadY[i] as number, y, 1 - smooth(12, 22, Math.abs(i - c)));
  }
  // Slope limiter: the road never climbs or drops more than MAX_GRADE per sample (a metre of z), forward then
  // backward so ramps spread evenly on both sides of a step.
  const limit = (i: number, j: number) => {
    const a = roadY[j] as number;
    const b = roadY[i] as number;
    if (b > a + MAX_GRADE) roadY[i] = a + MAX_GRADE;
    else if (b < a - MAX_GRADE) roadY[i] = a - MAX_GRADE;
  };
  for (let i = 1; i < roadY.length; i++) limit(i, i - 1);
  for (let i = roadY.length - 2; i >= 0; i--) limit(i, i + 1);
  const sampleY = (k: number) => {
    const kk = Math.max(0, Math.min(roadY.length - 1, k));
    const i = Math.min(roadY.length - 2, Math.floor(kk));
    return lerp(roadY[i] as number, roadY[i + 1] as number, kk - i);
  };
  const pointAt = (t: number, out = new Vector3()) => {
    const k = idxOf(t);
    const i = Math.min(zs.length - 2, Math.floor(k));
    const u = k - i;
    return out.set(
      lerp(xsRoad[i] as number, xsRoad[i + 1] as number, u),
      sampleY(k),
      lerp(zs[i] as number, zs[i + 1] as number, u),
    );
  };
  const tangentAt = (t: number, out = new Vector3()) => {
    const a = pointAt(Math.max(0, t - 0.0008));
    const b = pointAt(Math.min(1, t + 0.0008));
    return out.subVectors(b, a).normalize();
  };
  /** Nearest road sample: search a window around the sample at the query's z (the road runs along z). */
  const trailQuery = (x: number, z: number) => {
    const k0 = Math.round(ROAD_Z.south - z);
    let best = Infinity;
    let bi = 0;
    let bu = 0;
    const lo = Math.max(0, Math.min(zs.length - 2, k0 - 70));
    const hi = Math.max(0, Math.min(zs.length - 2, k0 + 70));
    for (let i = lo; i <= hi; i++) {
      const ax = xsRoad[i] as number;
      const az = zs[i] as number;
      const dx = (xsRoad[i + 1] as number) - ax;
      const dz = (zs[i + 1] as number) - az;
      const u = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
      const d2 = (x - ax - u * dx) ** 2 + (z - az - u * dz) ** 2;
      if (d2 < best) {
        best = d2;
        bi = i;
        bu = u;
      }
    }
    const k = bi + bu;
    const t = lerp(cum[bi] as number, cum[bi + 1] as number, bu) / total;
    return { d: Math.sqrt(best), t, y: sampleY(k) };
  };
  const trail: Trail = {
    length: total,
    halfWidth: ROAD_HALF,
    pointAt,
    tangentAt,
    nearestT: (x, z) => trailQuery(x, z).t,
  };

  // ---------------------------------------------------------------- stations, plazas, spurs
  const poses = new Map<string, Pose>();
  const plazas: SuyuPlaza[] = [];
  const spurs: Array<{ ax: number; az: number; bx: number; bz: number; y0: number; y1: number }> = [];
  const aprons: SuyuPlaza[] = [];
  for (const s of COSTA_STATIONS) {
    const p = pointAt(s.t);
    const tg = tangentAt(s.t).setY(0).normalize();
    // side 1 = right of the walking direction (east, inland), −1 = left (the sea side).
    const x = p.x - tg.z * s.side * s.offset;
    const z = p.z + tg.x * s.side * s.offset;
    const yaw = s.offset > 0.5 ? Math.atan2(p.x - x, p.z - z) : Math.atan2(tg.x, tg.z);
    poses.set(s.id, { position: new Vector3(x, p.y, z), yaw });
    plazas.push({ id: s.id, x, z, r: PLAZA_R, y: p.y });
    if (s.offset > 0.5) spurs.push({ ax: p.x, az: p.z, bx: x, bz: z, y0: p.y, y1: p.y });
    if (s.kind === "company" || s.kind === "market") {
      const ux = (x - p.x) / s.offset;
      const uz = (z - p.z) / s.offset;
      const a = s.kind === "company" ? APRON : MARKET_APRON;
      aprons.push({ id: s.id, x: x + ux * a.off, z: z + uz * a.off, r: a.r, y: p.y });
    }
  }
  const segD = (sp: (typeof spurs)[number], x: number, z: number) => {
    const dx = sp.bx - sp.ax;
    const dz = sp.bz - sp.az;
    const u = clamp01(((x - sp.ax) * dx + (z - sp.az) * dz) / (dx * dx + dz * dz || 1));
    return Math.hypot(x - sp.ax - u * dx, z - sp.az - u * dz);
  };
  const plazaDist = (x: number, z: number) => {
    let d = Infinity;
    for (const pl of plazas) d = Math.min(d, Math.hypot(x - pl.x, z - pl.z) - pl.r);
    for (const sp of spurs) d = Math.min(d, segD(sp, x, z) - 1.8);
    for (const ap of aprons) d = Math.min(d, Math.hypot(x - ap.x, z - ap.z) - ap.r);
    return d;
  };
  /** How much a flat (plaza, spur, apron) flattens the ground at (x, z): 1 inside, easing out over its blend. */
  const flatWeight = (x: number, z: number) => {
    const edge = step * 1.2;
    let w = 0;
    const take = (d: number, blend: number) => {
      if (d < edge + blend) w = Math.max(w, 1 - smooth(edge, edge + blend, d));
    };
    for (const pl of plazas) take(Math.hypot(x - pl.x, z - pl.z) - pl.r, 5);
    for (const sp of spurs) take(segD(sp, x, z) - 1.8, 5);
    for (const ap of aprons)
      take(Math.hypot(x - ap.x, z - ap.z) - ap.r, ap.id === STATION.market ? MARKET_APRON.blend : 5);
    return w;
  };
  const plazaY = (x: number, z: number) => {
    let best = Infinity;
    let y = 0;
    for (const pl of plazas) {
      const d = Math.hypot(x - pl.x, z - pl.z);
      if (d < best) {
        best = d;
        y = pl.y;
      }
    }
    return y;
  };

  // ---------------------------------------------------------------- bridges
  const bridges = rivs.map((r) => {
    const t = tOfZ(r.z);
    const p = pointAt(t);
    const tg = tangentAt(t);
    return { id: r.id, x: p.x, z: p.z, yaw: Math.atan2(tg.x, tg.z), half: 9, y: p.y + 0.25 };
  });
  /** Bridge deck height if (x, z) is on a bridge deck (along the road, within its half length), else null. */
  const bridgeAt = (x: number, z: number): number | null => {
    for (const b of bridges) {
      const dx = x - b.x;
      const dz = z - b.z;
      const along = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
      const across = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw);
      if (Math.abs(along) <= b.half && Math.abs(across) <= ROAD_HALF + 0.2) {
        // A gentle arch over the channel.
        return b.y + 0.35 * (1 - (along / b.half) ** 2);
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- final heightfield
  const finalHeight = (x: number, z: number) => {
    let y = natural(x, z);
    const q = trailQuery(x, z);
    const inRoadZ = z <= ROAD_Z.south + 2 && z >= ROAD_Z.north - 2;
    if (inRoadZ) y = lerp(y, q.y - 0.05, 1 - smooth(ROAD_HALF + step * 1.2, ROAD_HALF + step * 1.2 + 6, q.d));
    const fw = flatWeight(x, z);
    if (fw > 0) y = lerp(y, plazaY(x, z) - 0.04, fw);
    // Keep the river channel open under the bridges.
    const rd = riverDist(x, z);
    if (rd < 2.5 && bridgeAt(x, z) !== null) y = Math.min(y, natural(x, z));
    return y;
  };
  const h = new Float32Array((n + 1) ** 2);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) h[j * (n + 1) + i] = finalHeight(BOUNDS.x0 + i * step, BOUNDS.z0 + j * step);
  /** Same b-d diagonal as the other worlds' terrain: (a,b,d), then (b,c,d). */
  const heightAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(n - 1e-8, (x - BOUNDS.x0) / step));
    const fz = Math.max(0, Math.min(n - 1e-8, (z - BOUNDS.z0) / step));
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
  const groundAt = (x: number, z: number) => bridgeAt(x, z) ?? heightAt(x, z);
  const isWater = (x: number, z: number) => {
    if (bridgeAt(x, z) !== null) return false;
    return riverDist(x, z) < 0 || heightAt(x, z) < SEA - 0.05;
  };
  const shoreDist = (x: number, z: number) => x - shoreX(z);
  const waterDist = (x: number, z: number) => Math.min(shoreDist(x, z), riverDist(x, z));
  const slopeAt = (x: number, z: number) =>
    Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
  const onRoad = (x: number, z: number) => {
    if (z > ROAD_Z.south + 1 || z < ROAD_Z.north - 1) return false;
    return trailQuery(x, z).d <= ROAD_HALF;
  };
  const inside = (c: Collider, x: number, z: number) =>
    c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;
  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  /** The open coastal strip: between the shore and the road, on gentle dry ground. */
  const onStrip = (x: number, z: number) => {
    if (z > zPunku - 4 || z < zEnd - 9) return false;
    if (x > roadXz(z) + 1) return false;
    if (shoreDist(x, z) < 0.4 || isWater(x, z)) return false;
    if (heightAt(x, z) < SEA + 0.12) return false;
    return slopeAt(x, z) < 0.42;
  };
  const walkable = (x: number, z: number) => {
    if (walkAreas.some((c) => inside(c, x, z))) return true;
    if (bridgeAt(x, z) !== null) return true;
    if (onRoad(x, z)) return true;
    if (plazaDist(x, z) <= 0 && !isWater(x, z)) return true;
    return onStrip(x, z);
  };
  const isGround = (x: number, z: number) => {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return false;
    if (isWater(x, z) || heightAt(x, z) < SEA + 0.15) return false;
    if (plazaDist(x, z) < 1.2) return false;
    if (z <= ROAD_Z.south + 2 && z >= ROAD_Z.north - 2 && trailQuery(x, z).d <= ROAD_HALF + 1.2) return false;
    return slopeAt(x, z) < 0.7;
  };
  const green = (x: number, z: number) => valleyOf(x, z);
  const beachPoint = (t: number) => {
    const z = zAt(t);
    const sx = shoreX(z);
    // March inland from the shoreline until the sand is just dry.
    for (let d = 0; d < 20; d += 0.25) if (heightAt(sx + d, z) > SEA + 0.18) return { x: sx + d, z };
    return { x: sx + 6, z };
  };

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
    isWater,
    waterDist,
    isGround,
    trailQuery: (x, z) => trailQuery(x, z),
    grid: { n, size: SIZE, h },
    bounds: { ...BOUNDS },
    roadX: roadXz,
    shoreX,
    gap,
    cliff,
    shoreDist,
    zAt,
    rivers,
    aprons,
    riverDist,
    bridges,
    islets,
    beachPoint,
    green,
  };
}

/** Station ids of the layout's special places (re-exported for ambients). */
export { STATION };
