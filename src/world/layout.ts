/**
 * Pure world layout: the Andean mountain heightfield, the Qhapaq Ñan spline, the gorge,
 * station plazas and the walkable test. No scene objects here; meshes read from this.
 *
 * Pipeline (order matters):
 *   base heightfield (peak + shoulder + ridges + noise + river + andenes)
 *   → trail spline in XZ → trail elevation sampled from base and smoothed
 *   → carve the base toward the trail elevation (band + falloff)
 *   → flatten station plazas + connector strips → cut the gorge across the trail
 *   → bake one grid; heightAt() interpolates the SAME triangles the mesh draws.
 */
import * as THREE from "three";
import { type Collider, type Pose, STATIONS, type Trail } from "./contract";
import { fbm, noise2 } from "./tex";

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Summit (XZ) of the main peak. The island is centered at the origin. */
export const SUMMIT = { x: 14, z: -20 };
export const WORLD_HALF = 192;
/** Organic island outline radius at angle a (around the origin). */
export const rimRadius = (a: number) =>
  168 + 7 * Math.sin(3 * a + 1.1) + 4 * Math.sin(7 * a - 0.4) + 2.5 * Math.sin(13 * a);
export const RIVER_LEVEL = 0.55;
export const HALF_WIDTH = 2.6;
/** Uphill plaza edge: flat until +2.2 past the rim (one grid cell of apron, so triangles never lift the plaza), terrain back up by +3.7; the retaining wall stands between. */
export const PLAZA_CUT: [number, number] = [2.2, 3.7];

// ---------------------------------------------------------------- river (valley, south → east)
const RIVER_PTS: Array<[number, number]> = [
  [-178, 46],
  [-140, 78],
  [-96, 116],
  [-48, 138],
  [6, 146],
  [56, 140],
  [98, 124],
  [132, 102],
  [176, 88],
];
const river = new THREE.CatmullRomCurve3(RIVER_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)));
export const RIVER_POLY: Array<[number, number]> = river.getSpacedPoints(160).map((p) => [p.x, p.z]);

function distPoly(poly: Array<[number, number]>, x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i] as [number, number];
    const [bx, bz] = poly[i + 1] as [number, number];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------- base heightfield

/** Peak + shoulders + ridges + noise + valley floor (before andenes, river and the island lip). */
export function preTerraceHeight(x: number, z: number): number {
  const dx = x - SUMMIT.x;
  const dz = z - SUMMIT.z;
  const r = peakRadius(x, z);
  const ang = Math.atan2(dz, dx);
  let h = macroHeight(x, z);
  // Radial ridges (spurs) that make the flanks read as folded rock.
  const ridge = Math.max(0, Math.cos(ang * 4 + 0.6 + fbm(x * 0.012, z * 0.012, 2) * 1.4)) ** 5;
  h += ridge * 7 * smooth(10, 26, r) * (1 - smooth(70, 120, r));
  h += fbm(x * 0.028 + 3, z * 0.028 - 7, 4) * 3.4 * smooth(4, 40, r);
  h += noise2(x * 0.11, z * 0.11) * 0.35;
  // Valley floor: a gentle plain above the river.
  return Math.max(h, 2.1 + fbm(x * 0.02, z * 0.02, 2) * 0.8);
}

function peakRadius(x: number, z: number) {
  const dx = x - SUMMIT.x;
  const dz = z - SUMMIT.z;
  const ca = Math.cos(0.45);
  const sa = Math.sin(0.45);
  const u = dx * ca + dz * sa;
  const v = (-dx * sa + dz * ca) * 1.22;
  return Math.hypot(u, v);
}

/** Large-scale mountain shape (no noise, terraces or river): steers the trail walker. */
export function macroHeight(x: number, z: number) {
  let h = 76 / (1 + (peakRadius(x, z) / 56) ** 2.6);
  h += 24 * Math.exp(-((Math.hypot(x + 66, z + 62) / 40) ** 2));
  h += 10 * Math.exp(-((Math.hypot(x - 92, z + 70) / 34) ** 2));
  return h;
}

/** Stepped (andén) height for a pre-terrace height h: flat treads, a short steep riser. */
export function terraceStep(h: number) {
  const k = h / TERRACE_STEP;
  const fl = Math.floor(k);
  return (fl + smooth(RISER_FROM, 1, k - fl)) * TERRACE_STEP;
}
/** Where in the step the riser starts (fraction of the step); walls are drawn at its middle. */
export const RISER_FROM = 0.86;

/** Height before the trail is carved (mountain, ridges, terraces, river bed, island lip). */
export function baseHeight(x: number, z: number): number {
  let h = preTerraceHeight(x, z);
  const terr = terraceMask(x, z, h);
  if (terr > 0) h = lerp(h, terraceStep(h), terr);
  // River bed.
  const dr = distPoly(RIVER_PTS_DENSE, x, z);
  if (dr < 9) h = lerp(RIVER_LEVEL - 1.3, h, smooth(2.6, 9, dr));
  // Island lip.
  const rc = Math.hypot(x, z);
  const R = rimRadius(Math.atan2(z, x));
  h = lerp(h, Math.min(h, 0.4), smooth(R - 10, R, rc));
  return h;
}
const RIVER_PTS_DENSE = RIVER_POLY;

/**
 * 0..1: how strongly the andenes (terraces) apply at (x, z) for a pre-terrace height h.
 * Machu Picchu-style: broad flights of terraces over most mid slopes, two full flanks always terraced,
 * broken by rocky spurs (noise patches) so the mountain doesn't read as a wedding cake.
 */
export function terraceMask(x: number, z: number, h: number) {
  const ang = Math.atan2(z - SUMMIT.z, x - SUMMIT.x);
  const sector = Math.max(
    smooth(0.8, 0.3, Math.abs(angDiff(ang, 1.15))),
    smooth(0.7, 0.25, Math.abs(angDiff(ang, -2.75))),
  );
  const patch = smooth(-0.02, 0.12, fbm(x * 0.011 + 5, z * 0.011 - 3, 3) + 0.1);
  return Math.max(sector, patch) * smooth(5, 8, h) * (1 - smooth(44, 50, h));
}
export const TERRACE_STEP = 2.3;

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------- trail (constant-grade spiral)

/** Steepest allowed grade of the stone path. */
const MAX_GRADE = 0.2;
const TRAIL_GRADE = 0.12;
const SUMMIT_GRADE = 0.2;

/**
 * Walks from the valley trailhead up the mountain: every step follows the contour clockwise
 * (seen from above) with just enough uphill bias to hold the grade. One wide spiral means
 * successive legs stay ≥17 u apart, so no leg's cut, fill or wall can reach another.
 */
export function trailControlPoints(): THREE.Vector3[] {
  let x = SUMMIT.x + Math.cos((78 * Math.PI) / 180) * 136;
  let z = SUMMIT.z + Math.sin((78 * Math.PI) / 180) * 136;
  let hx = 0;
  let hz = 0;
  const pts: THREE.Vector3[] = [new THREE.Vector3(x, 0, z)];
  for (let i = 0; i < 3000; i++) {
    const r = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
    if (r < 5) break;
    const e = 1.5;
    const gx = (macroHeight(x + e, z) - macroHeight(x - e, z)) / (2 * e);
    const gz = (macroHeight(x, z + e) - macroHeight(x, z - e)) / (2 * e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-5) break;
    const ux = gx / gl;
    const uz = gz / gl;
    const sinA = Math.min(1, (r < 40 ? SUMMIT_GRADE : TRAIL_GRADE) / gl);
    const cosA = Math.sqrt(1 - sinA * sinA);
    const tx = -uz * cosA + ux * sinA;
    const tz = ux * cosA + uz * sinA;
    if (i === 0) {
      hx = tx;
      hz = tz;
    }
    hx += (tx - hx) * 0.3;
    hz += (tz - hz) * 0.3;
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-5) break;
    hx /= hl;
    hz /= hl;
    x += hx;
    z += hz;
    if (i % 9 === 8) pts.push(new THREE.Vector3(x, 0, z));
  }
  pts.push(new THREE.Vector3(x, 0, z));
  return pts;
}

function buildCurve() {
  return new THREE.CatmullRomCurve3(trailControlPoints(), false, "centripetal", 0.5);
}

/** Trail elevation: smoothed terrain, made monotone, slopes capped (excess rise spread over gentler stretches). */
function profile(raw: Float32Array, ds: number, landings: Array<[number, number]> = []) {
  const N = raw.length - 1;
  const y = Float64Array.from(raw);
  const blur = (w: number, passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      const src = y.slice();
      for (let i = 0; i <= N; i++) {
        let a = 0;
        for (let k = -w; k <= w; k++) a += src[Math.min(N, Math.max(0, i + k))] as number;
        y[i] = a / (2 * w + 1);
      }
    }
  };
  blur(18, 3);
  // Clamp between what is reachable from the start and what still reaches the summit at MAX_GRADE,
  // then make it monotone and cap the slope. Deviations from the terrain stay local (cuts/fills).
  const cap = MAX_GRADE * ds;
  const y0 = y[0] as number;
  const yN = y[N] as number;
  for (let i = 0; i <= N; i++) {
    const lo = yN - cap * (N - i);
    const hi = y0 + cap * i;
    y[i] = Math.min(hi, Math.max(lo, y[i] as number));
  }
  for (let i = 1; i <= N; i++)
    y[i] = Math.min((y[i - 1] as number) + cap, Math.max(y[i] as number, y[i - 1] as number));
  blur(5, 2);
  // Level landings for station plazas (tambos sit on flat ground): zero the slope inside each landing
  // and spread the removed rise over the rest of the path, up to the grade cap.
  if (landings.length) {
    const flat = new Uint8Array(N);
    for (const [a, b] of landings) for (let i = Math.max(0, a); i < Math.min(N, b); i++) flat[i] = 1;
    const sl = new Float64Array(N);
    let removed = 0;
    for (let i = 0; i < N; i++) {
      sl[i] = (y[i + 1] as number) - (y[i] as number);
      if (flat[i]) {
        removed += sl[i] as number;
        sl[i] = 0;
      }
    }
    const capL = (MAX_GRADE + 0.03) * ds;
    for (let it = 0; it < 30 && removed > 1e-4; it++) {
      let room = 0;
      for (let i = 0; i < N; i++) if (!flat[i]) room += Math.max(0, capL - (sl[i] as number));
      if (room <= 0) break;
      const k = Math.min(1, removed / room);
      for (let i = 0; i < N; i++)
        if (!flat[i]) {
          const add = Math.max(0, capL - (sl[i] as number)) * k;
          sl[i] = (sl[i] as number) + add;
          removed -= add;
        }
    }
    for (let i = 0; i < N; i++) y[i + 1] = (y[i] as number) + (sl[i] as number);
  }
  for (let i = 0; i <= N; i++) raw[i] = y[i] as number;
}

// ---------------------------------------------------------------- layout

export interface Plaza {
  id: string;
  /** Station point and the trail point it connects to. */
  x: number;
  z: number;
  tx: number;
  tz: number;
  r: number;
  y: number;
  /** Width (half) of the connector strip from the trail to the plaza. */
  spur: number;
}

export interface Layout {
  trail: Trail;
  heightAt(x: number, z: number): number;
  /** Ground for the avatar: heightAt, except over the gorge span on the trail (bridge deck). */
  groundAt(x: number, z: number): number;
  stationPose(id: string): Pose;
  walkable(x: number, z: number): boolean;
  addWalkable(c: Collider): void;
  addCollider(c: Collider): void;
  colliders: Collider[];
  plazas: Plaza[];
  /** Trail t-range of the gap the rope bridge spans, and the ravine line. */
  gorge: { t0: number; t1: number; x: number; z: number; dirX: number; dirZ: number; floor: number };
  /** Distance to the trail centerline and the t of the closest point. */
  trailQuery(x: number, z: number): { d: number; t: number; y: number };
  grid: { n: number; size: number; h: Float32Array };
  /** Mountain stream: spring (waterfall top) → slab-bridge crossing of the trail → small pool below. */
  stream: Stream;
  /** True where the ground is open grass (not path, plaza, water, gorge, cliff or snow). */
  isGrass(x: number, z: number): boolean;
  /** Distance to the stream centerline (Infinity when far). */
  streamDist(x: number, z: number): number;
  /** Andén retaining walls: contour segments [x0, z0, x1, z1, yBottom, yTop]. */
  terraceWalls(): Float32Array;
}

export interface Stream {
  /** Polyline from the spring down to the pool: [x, z]. */
  pts: Array<[number, number]>;
  /** Trail t where the stream crosses the path, and that point + trail tangent. */
  t: number;
  cross: THREE.Vector3;
  tangent: THREE.Vector3;
  /** Waterfall: top of the fall (spring) and its base (pool), plus the downhill direction there. */
  fallTop: THREE.Vector3;
  fallBase: THREE.Vector3;
  fallDir: THREE.Vector2;
  /** Index in pts of the crossing point. */
  crossIndex: number;
}

/** Station footprint radius (plaza) when content doesn't provide one. */
const DEFAULT_FOOTPRINT: Record<string, number> = {
  gate: 5,
  bridge: 0,
  arcade: 8.5,
  ai: 7,
  contact: 7,
  "build-1": 6,
  "build-2": 6,
  "build-3": 6,
};

export function buildLayout(opts: { cells: number; footprint?: Record<string, number> }): Layout {
  const curve = buildCurve();
  const length = curve.getLength();
  // Dense polyline (≈0.5 u) with arc-length t.
  const N = Math.ceil(length / 0.5);
  const px = new Float32Array(N + 1);
  const pz = new Float32Array(N + 1);
  const py = new Float32Array(N + 1);
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    curve.getPointAt(i / N, tmp);
    px[i] = tmp.x;
    pz[i] = tmp.z;
    py[i] = baseHeight(tmp.x, tmp.z);
  }
  // Station sides + landings (decided on the XZ path, before elevations).
  const footprint = { ...DEFAULT_FOOTPRINT, ...(opts.footprint ?? {}) };
  const sideOf = new Map<string, number>();
  const nudged = new Map<string, [number, number]>();
  const placed: Array<[number, number, number]> = [];
  const landings: Array<[number, number]> = [];
  for (const s of STATIONS) {
    if (s.offset <= 0.5) continue;
    const r = footprint[s.id] ?? Math.max(5, 4 + s.offset * 0.15);
    if (r <= 0) continue;
    const i0 = Math.round(s.t * N);
    const ax = px[Math.max(0, i0 - 1)] as number;
    const az = pz[Math.max(0, i0 - 1)] as number;
    const bx = px[Math.min(N, i0 + 1)] as number;
    const bz = pz[Math.min(N, i0 + 1)] as number;
    const tl = Math.hypot(bx - ax, bz - az) || 1;
    const rx = -(bz - az) / tl;
    const rz = (bx - ax) / tl;
    // The plaza must stay clear of every other leg (band + margin); flip to the clear side if needed.
    const clearance = (side: number) => {
      const cx = (px[i0] as number) + rx * side * s.offset;
      const cz = (pz[i0] as number) + rz * side * s.offset;
      let m = Infinity;
      for (let i = 0; i <= N; i += 2) {
        if (Math.abs(i / N - s.t) * length < s.offset + r + 6) continue;
        m = Math.min(m, Math.hypot((px[i] as number) - cx, (pz[i] as number) - cz));
      }
      // Band override (FLAT + 1.5) + one grid cell of apron must not reach the plaza.
      return m - r - (HALF_WIDTH + 1.8 + 1.5 + 2.2);
    };
    const keep = clearance(s.side);
    const side = keep > 0 || clearance(-s.side) < keep ? s.side : -s.side;
    sideOf.set(s.id, side);
    // Still squeezed between two legs: nudge the plaza away from the nearest other leg until it clears.
    let cx = (px[i0] as number) + rx * side * s.offset;
    let cz = (pz[i0] as number) + rz * side * s.offset;
    for (let it = 0; it < 30; it++) {
      let m = Infinity;
      let nx = 0;
      let nz = 0;
      for (let i = 0; i <= N; i += 2) {
        if (Math.abs(i / N - s.t) * length < s.offset + r + 6) continue;
        const d = Math.hypot((px[i] as number) - cx, (pz[i] as number) - cz);
        if (d < m) {
          m = d;
          nx = px[i] as number;
          nz = pz[i] as number;
        }
      }
      let need = r + HALF_WIDTH + 1.8 + 1.5 + 2.2 - m;
      // Other plazas (on other legs, at other heights) need both aprons between the rims.
      for (const [ox, oz, or] of placed) {
        const d = Math.hypot(ox - cx, oz - cz);
        const n2 = r + or + 7 - d;
        if (n2 > need) {
          need = n2;
          m = d;
          nx = ox;
          nz = oz;
        }
      }
      if (need <= 0) break;
      const step = Math.min(0.5, need + 0.05);
      cx += ((cx - nx) / (m || 1)) * step;
      cz += ((cz - nz) / (m || 1)) * step;
    }
    nudged.set(s.id, [cx, cz]);
    placed.push([cx, cz, r]);
    const half = (r + 3) / (length / N);
    landings.push([Math.round(i0 - half), Math.round(i0 + half)]);
  }
  landings.push([Math.round(N - 12 / (length / N)), N]);
  profile(py, length / N, landings);

  // Spatial hash of polyline segments for fast nearest queries.
  const CELL = 8;
  const GW = Math.ceil((WORLD_HALF * 2) / CELL);
  const buckets: number[][] = Array.from({ length: GW * GW }, () => []);
  const reach = HALF_WIDTH + 10;
  for (let i = 0; i < N; i++) {
    const x0 = Math.min(px[i] as number, px[i + 1] as number) - reach;
    const x1 = Math.max(px[i] as number, px[i + 1] as number) + reach;
    const z0 = Math.min(pz[i] as number, pz[i + 1] as number) - reach;
    const z1 = Math.max(pz[i] as number, pz[i + 1] as number) + reach;
    for (let cx = Math.floor((x0 + WORLD_HALF) / CELL); cx <= Math.floor((x1 + WORLD_HALF) / CELL); cx++)
      for (let cz = Math.floor((z0 + WORLD_HALF) / CELL); cz <= Math.floor((z1 + WORLD_HALF) / CELL); cz++)
        if (cx >= 0 && cz >= 0 && cx < GW && cz < GW) buckets[cz * GW + cx]?.push(i);
  }
  const segQuery = (x: number, z: number, list: Iterable<number>) => {
    let bd = Infinity;
    let bi = 0;
    let bt = 0;
    for (const i of list) {
      const ax = px[i] as number;
      const az = pz[i] as number;
      const dx = (px[i + 1] as number) - ax;
      const dz = (pz[i + 1] as number) - az;
      const l2 = dx * dx + dz * dz || 1;
      const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (d < bd) {
        bd = d;
        bi = i;
        bt = u;
      }
    }
    return { d: bd, i: bi, u: bt };
  };
  const all = {
    *[Symbol.iterator]() {
      for (let i = 0; i < N; i++) yield i;
    },
  };
  const trailQuery = (x: number, z: number, exact = false) => {
    const cx = Math.floor((x + WORLD_HALF) / CELL);
    const cz = Math.floor((z + WORLD_HALF) / CELL);
    const b = cx >= 0 && cz >= 0 && cx < GW && cz < GW ? buckets[cz * GW + cx] : undefined;
    const q = b?.length ? segQuery(x, z, b) : exact ? segQuery(x, z, all) : { d: Infinity, i: 0, u: 0 };
    const y = lerp(py[q.i] as number, py[q.i + 1] as number, q.u);
    return { d: q.d, t: (q.i + q.u) / N, y };
  };

  const pointAt = (t: number, out = new THREE.Vector3()) => {
    const f = Math.min(1, Math.max(0, t)) * N;
    const i = Math.min(N - 1, Math.floor(f));
    const u = f - i;
    return out.set(
      lerp(px[i] as number, px[i + 1] as number, u),
      lerp(py[i] as number, py[i + 1] as number, u),
      lerp(pz[i] as number, pz[i + 1] as number, u),
    );
  };
  const tangentAt = (t: number, out = new THREE.Vector3()) => {
    const a = pointAt(Math.max(0, t - 1 / N));
    const b = pointAt(Math.min(1, t + 1 / N));
    return out.subVectors(b, a).normalize();
  };

  // ---------------------------------------------------------------- gorge (radial ravine across t≈0.68)
  const TG = 0.68;
  const g0 = pointAt(TG);
  const gt = tangentAt(TG);
  // Ravine runs across the trail; +dir points downhill.
  let gdx = -gt.z;
  let gdz = gt.x;
  if (baseHeight(g0.x + gdx * 6, g0.z + gdz * 6) > baseHeight(g0.x - gdx * 6, g0.z - gdz * 6)) {
    gdx = -gdx;
    gdz = -gdz;
  }
  // Each end stops well before any other leg of the trail (so it never swallows a plaza or a switchback).
  const reachTo = (sign: number, max: number) => {
    for (let a = 4; a <= max; a += 1) {
      const q = trailQuery(g0.x + gdx * a * sign, g0.z + gdz * a * sign, true);
      if (q.d < 11 && Math.abs(q.t - TG) > 0.04) return Math.max(7, a - 10);
    }
    return max;
  };
  const downLen = reachTo(1, 60);
  const upLen = reachTo(-1, 16);
  const GW_IN = 3.4;
  const GW_OUT = 8;
  const gorgeFloor = g0.y - 14;
  const gorgeDepth = (x: number, z: number) => {
    const rx = x - g0.x;
    const rz = z - g0.z;
    const along = rx * gdx + rz * gdz;
    const across = Math.abs(rx * gt.x + rz * gt.z);
    // Wobble the walls so the cut looks eroded, not ruled.
    const w = across + noise2(along * 0.15, 3.3) * 1.2;
    const k = 1 - smooth(GW_IN, GW_OUT, w);
    // Deepest under the trail; tapers to nothing at both ends (a spoon-shaped cleft).
    const len = along >= 0 ? downLen : upLen;
    const depth = 14 * (1 - smooth(len * 0.45, len, Math.abs(along)));
    const cx = g0.x + gdx * along;
    const cz = g0.z + gdz * along;
    const lift = (g0.y - baseHeight(g0.x, g0.z)) * (1 - smooth(0, len, Math.abs(along)));
    return { k: k * smooth(0.5, 3, depth), floor: baseHeight(cx, cz) + lift - depth };
  };
  // Gap: trail t where the deck spans the ravine.
  let t0 = TG;
  let t1 = TG;
  const iG = Math.round(TG * N);
  for (let i = iG; i >= 0 && gorgeDepth(px[i] as number, pz[i] as number).k > 0.05; i--) t0 = i / N;
  for (let i = iG; i <= N && gorgeDepth(px[i] as number, pz[i] as number).k > 0.05; i++) t1 = i / N;

  // ---------------------------------------------------------------- stream + waterfall crossing (t≈0.37)
  const TS = 0.37;
  const sc = pointAt(TS);
  const stg = tangentAt(TS);
  const otherLeg = (x: number, z: number, pad: number) => {
    const q = trailQuery(x, z, true);
    return q.d < HALF_WIDTH + pad && Math.abs(q.t - TS) > 0.025;
  };
  const gradAt = (x: number, z: number) => {
    const e = 1.5;
    const gx = (macroHeight(x + e, z) - macroHeight(x - e, z)) / (2 * e);
    const gz = (macroHeight(x, z + e) - macroHeight(x, z - e)) / (2 * e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l] as const;
  };
  // Uphill to the spring (the waterfall sits on a rock step above the path).
  const up: Array<[number, number]> = [];
  {
    let x = sc.x;
    let z = sc.z;
    for (let k = 0; k < 15; k++) {
      const [ux, uz] = gradAt(x, z);
      if (otherLeg(x + ux, z + uz, 9)) break;
      x += ux;
      z += uz;
      up.push([x, z]);
    }
  }
  // Downhill until it meets the next leg's margin, then it pools.
  const down: Array<[number, number]> = [];
  {
    let x = sc.x;
    let z = sc.z;
    for (let k = 0; k < 40; k++) {
      const [ux, uz] = gradAt(x, z);
      if (otherLeg(x - ux, z - uz, 9) || preTerraceHeight(x - ux, z - uz) < 3) break;
      x -= ux;
      z -= uz;
      down.push([x, z]);
    }
  }
  const streamPts: Array<[number, number]> = [...up.reverse(), [sc.x, sc.z], ...down];
  const crossIndex = up.length;
  const spring = streamPts[0] as [number, number];
  const fallH = 5.5;
  const springBase = baseHeight(spring[0], spring[1]);
  const fallTop = new THREE.Vector3(spring[0], springBase + fallH, spring[1]);
  const second = (streamPts[1] ?? [sc.x, sc.z]) as [number, number];
  const fallDir = new THREE.Vector2(second[0] - spring[0], second[1] - spring[1]).normalize();
  const fallBase = new THREE.Vector3(spring[0] + fallDir.x * 1.2, 0, spring[1] + fallDir.y * 1.2);
  const streamDist = (x: number, z: number) => {
    if (Math.abs(x - sc.x) > 60 || Math.abs(z - sc.z) > 60) return Infinity;
    return distPoly(streamPts, x, z);
  };

  // ---------------------------------------------------------------- plazas
  const plazas: Plaza[] = [];
  const poses = new Map<string, Pose>();
  for (const s of STATIONS) {
    const p = pointAt(s.t);
    const tg = tangentAt(s.t);
    // right = forward × up = (-fz, fx)
    const rx = -tg.z;
    const rz = tg.x;
    const side = sideOf.get(s.id) ?? s.side;
    const [x, z] = nudged.get(s.id) ?? [p.x + rx * side * s.offset, p.z + rz * side * s.offset];
    const r = footprint[s.id] ?? Math.max(5, 4 + s.offset * 0.15);
    if (s.offset > 0.5 && r > 0)
      plazas.push({ id: s.id, x, z, tx: p.x, tz: p.z, r, y: p.y, spur: s.kind === "build" ? 2.2 : 2.6 });
    // Faces the trail: local +Z points from the station toward the path.
    const yaw = s.offset > 0.5 ? Math.atan2(p.x - x, p.z - z) : Math.atan2(tg.x, tg.z);
    poses.set(s.id, { position: new THREE.Vector3(x, p.y, z), yaw });
  }
  // Summit: a grassy puna plaza at the end of the path.
  {
    const e = pointAt(1);
    plazas.push({ id: "summit", x: e.x, z: e.z, tx: e.x, tz: e.z, r: 6.5, y: e.y, spur: 0 });
  }
  /** Plaza flattening: level across the whole footprint; a sharp cut on the uphill side (a retaining
   *  wall stands there, see terrain.ts), a gentle fill slope on the downhill side. */
  const plazaW = (x: number, z: number, h: number) => {
    let best = 0;
    let y = 0;
    for (const pl of plazas) {
      const dd = Math.hypot(x - pl.x, z - pl.z) - pl.r;
      const ds = distSeg(x, z, pl.tx, pl.tz, pl.x, pl.z) - pl.spur;
      const d = Math.min(dd, ds);
      const w = h > pl.y + 0.3 ? 1 - smooth(PLAZA_CUT[0], PLAZA_CUT[1], d) : 1 - smooth(2, 6.5, d);
      if (w > best) {
        best = w;
        y = pl.y;
      }
    }
    return { w: best, y };
  };

  // ---------------------------------------------------------------- final height (analytic), then baked
  const FLAT = HALF_WIDTH + 1.8;
  const finalHeight = (x: number, z: number) => {
    let h = baseHeight(x, z);
    const q = trailQuery(x, z);
    // Flat across the whole band plus one grid cell, so no terrain triangle can lift into the path.
    if (q.d < HALF_WIDTH + 9) {
      const w = 1 - smooth(FLAT, HALF_WIDTH + 9, q.d);
      h = lerp(h, q.y - 0.05, w);
    }
    const pw = plazaW(x, z, h);
    if (pw.w > 0) h = lerp(h, pw.y - 0.05, pw.w);
    // The paved band always wins over plaza ramps (a plaza sits at its own trail t's height).
    if (q.d < FLAT + 1.5) h = lerp(h, q.y - 0.05, 1 - smooth(FLAT, FLAT + 1.5, q.d));
    const g = gorgeDepth(x, z);
    if (g.k > 0) h = lerp(h, Math.min(h, g.floor), g.k);
    // Stream channel (never under the path band: the slab bridge spans it there).
    const sd = streamDist(x, z);
    if (sd < 3.2 && q.d > HALF_WIDTH + 0.4) {
      const k = (1 - smooth(1.0, 3.2, sd)) * smooth(HALF_WIDTH + 0.4, HALF_WIDTH + 1.6, q.d);
      h -= 1.1 * k;
    }
    return h;
  };

  const n = opts.cells;
  const size = WORLD_HALF * 2;
  const step = size / n;
  const H = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = finalHeight(-WORLD_HALF + i * step, -WORLD_HALF + j * step);

  /** Triangle-exact sample of the grid (same split as the terrain mesh: (a,b,d) and (b,c,d)). */
  const heightAt = (x: number, z: number) => {
    const fx = Math.min(n - 1e-4, Math.max(0, (x + WORLD_HALF) / step));
    const fz = Math.min(n - 1e-4, Math.max(0, (z + WORLD_HALF) / step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = H[j * (n + 1) + i] as number; // (i, j)
    const b = H[(j + 1) * (n + 1) + i] as number; // (i, j+1)
    const c = H[(j + 1) * (n + 1) + i + 1] as number; // (i+1, j+1)
    const d = H[j * (n + 1) + i + 1] as number; // (i+1, j)
    // Split along b–d: u + v <= 1 → triangle (a, b, d); else (b, c, d).
    if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
    return c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };

  const gapPad = 0.6;
  const inGap = (t: number) => t > t0 - 0.002 && t < t1 + 0.002;
  const groundAt = (x: number, z: number) => {
    const q = trailQuery(x, z);
    if (q.d < HALF_WIDTH + gapPad && inGap(q.t)) {
      // Bridge deck: interpolate between the two lips with a slight sag.
      const a = pointAt(t0 - 0.002);
      const b = pointAt(t1 + 0.002);
      const k = Math.min(1, Math.max(0, (q.t - (t0 - 0.002)) / (t1 - t0 + 0.004)));
      return lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * 0.35;
    }
    return heightAt(x, z);
  };

  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const inside = (c: Collider, x: number, z: number) =>
    c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) <= c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;
  const walkable = (x: number, z: number) => {
    for (const a of walkAreas) if (inside(a, x, z)) return true;
    const q = trailQuery(x, z);
    // Over the gorge only the deck areas content registers (addWalkable) count; groundAt() gives deck height.
    if (q.d <= HALF_WIDTH && !inGap(q.t)) return true;
    for (const pl of plazas) {
      if (Math.hypot(x - pl.x, z - pl.z) <= pl.r - 0.3) return true;
      if (distSeg(x, z, pl.tx, pl.tz, pl.x, pl.z) <= pl.spur - 0.2) return true;
    }
    return false;
  };

  const trail: Trail = {
    length,
    // Optional out-vector (not in the contract type) so per-frame callers can avoid allocations.
    pointAt: (t: number, out?: THREE.Vector3) => pointAt(t, out),
    tangentAt: (t: number, out?: THREE.Vector3) => tangentAt(t, out),
    nearestT: (x, z) => trailQuery(x, z, true).t,
    halfWidth: HALF_WIDTH,
  };

  return {
    trail,
    heightAt,
    groundAt,
    stationPose(id) {
      const p = poses.get(id);
      if (!p) throw new Error(`unknown station ${id}`);
      return { position: p.position.clone(), yaw: p.yaw };
    },
    walkable,
    addWalkable: (c) => walkAreas.push(c),
    addCollider: (c) => colliders.push(c),
    colliders,
    plazas,
    gorge: { t0, t1, x: g0.x, z: g0.z, dirX: gdx, dirZ: gdz, floor: gorgeFloor },
    trailQuery: (x, z) => trailQuery(x, z, true),
    grid: { n, size, h: H },
    stream: {
      pts: streamPts,
      t: TS,
      cross: sc.clone(),
      tangent: stg.clone(),
      fallTop,
      fallBase: fallBase.setY(heightAt(fallBase.x, fallBase.z)),
      fallDir,
      crossIndex,
    },
    streamDist,
    isGrass(x, z) {
      if (Math.hypot(x, z) > rimRadius(Math.atan2(z, x)) - 3) return false;
      const q = trailQuery(x, z);
      if (q.d < HALF_WIDTH + 1.2) return false;
      for (const pl of plazas)
        if (Math.hypot(x - pl.x, z - pl.z) < pl.r + 0.6 || distSeg(x, z, pl.tx, pl.tz, pl.x, pl.z) < pl.spur + 0.6)
          return false;
      if (streamDist(x, z) < 2.6 || distPoly(RIVER_PTS_DENSE, x, z) < 5) return false;
      if (gorgeDepth(x, z).k > 0.05) return false;
      const y = heightAt(x, z);
      if (y < RIVER_LEVEL + 0.6) return false;
      const e = 1;
      const slope =
        Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      return slope < 0.75;
    },
    terraceWalls() {
      return buildTerraceWalls((x, z) => {
        if (trailQuery(x, z).d < HALF_WIDTH + 3.5) return false;
        for (const pl of plazas)
          if (Math.hypot(x - pl.x, z - pl.z) < pl.r + 3 || distSeg(x, z, pl.tx, pl.tz, pl.x, pl.z) < pl.spur + 3)
            return false;
        if (streamDist(x, z) < 4 || gorgeDepth(x, z).k > 0.01) return false;
        return Math.hypot(x, z) < rimRadius(Math.atan2(z, x)) - 12;
      });
    },
  };
}

/**
 * Andén walls: marching squares over the pre-terrace height at each riser's mid level.
 * A segment is kept where the terrace mask is full and `ok` allows it (away from path, plazas, water).
 */
function buildTerraceWalls(ok: (x: number, z: number) => boolean): Float32Array {
  const S = 1.25;
  const half = WORLD_HALF - 20;
  const n = Math.floor((half * 2) / S);
  const g = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) g[j * (n + 1) + i] = preTerraceHeight(-half + i * S, -half + j * S);
  const out: number[] = [];
  const mid = (RISER_FROM + 1) / 2;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = g[j * (n + 1) + i] as number;
      const b = g[j * (n + 1) + i + 1] as number;
      const c = g[(j + 1) * (n + 1) + i + 1] as number;
      const d = g[(j + 1) * (n + 1) + i] as number;
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      const x0 = -half + i * S;
      const z0 = -half + j * S;
      for (let k = Math.ceil(lo / TERRACE_STEP - mid); k + mid <= hi / TERRACE_STEP; k++) {
        const lvl = (k + mid) * TERRACE_STEP;
        // Edge crossings (a→b top, b→c right, d→c bottom, a→d left).
        const pts: number[] = [];
        const cross = (h0: number, h1: number, xa: number, za: number, xb: number, zb: number) => {
          if (h0 < lvl !== h1 < lvl) {
            const f = (lvl - h0) / (h1 - h0);
            pts.push(xa + (xb - xa) * f, za + (zb - za) * f);
          }
        };
        cross(a, b, x0, z0, x0 + S, z0);
        cross(b, c, x0 + S, z0, x0 + S, z0 + S);
        cross(d, c, x0, z0 + S, x0 + S, z0 + S);
        cross(a, d, x0, z0, x0, z0 + S);
        if (pts.length < 4) continue;
        const mx = ((pts[0] as number) + (pts[2] as number)) / 2;
        const mz = ((pts[1] as number) + (pts[3] as number)) / 2;
        if (terraceMask(mx, mz, lvl) < 0.92 || !ok(mx, mz)) continue;
        out.push(
          pts[0] as number,
          pts[1] as number,
          pts[2] as number,
          pts[3] as number,
          k * TERRACE_STEP - 0.4,
          (k + 1) * TERRACE_STEP + 0.22,
        );
      }
    }
  return Float32Array.from(out);
}

function distSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
