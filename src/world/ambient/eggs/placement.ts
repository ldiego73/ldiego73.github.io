/**
 * Deterministic placement of the easter eggs (5 vizcachas + the golden khipu niche).
 * Pure: depends only on an env-like subset (terrain, trail, stations, stream), so it runs under bun test
 * against the real layout. No DOM, no CSS, no scene objects.
 *
 * Reachability: the traveler can only walk the trail band (d ≤ halfWidth), plazas and registered decks,
 * so every egg sits just off the stone path (d in [halfWidth + 0.95, halfWidth + 2.1], i.e. behind the
 * curb stones / low walls trail.ts lays at ≈ halfWidth..halfWidth + 0.7) where it can be greeted from the
 * path edge, with the XZ distance used for range.
 */
import * as THREE from "three";
import { STATIONS } from "../../contract";

export interface PlaceEnv {
  heightAt(x: number, z: number): number;
  trail: {
    pointAt(t: number, out?: THREE.Vector3): THREE.Vector3;
    tangentAt(t: number, out?: THREE.Vector3): THREE.Vector3;
    halfWidth: number;
  };
  stationPose(id: string): { position: THREE.Vector3; yaw: number };
  extra: {
    isWater(x: number, z: number): boolean;
    trailDistance(x: number, z: number): { d: number; t: number };
    stream: { t: number; cross: THREE.Vector3; fallBase: THREE.Vector3 };
  };
}

export interface Nook {
  /** Egg position (y on the terrain). */
  x: number;
  y: number;
  z: number;
  /** Yaw facing the trail (+Z of the model looks at the path). */
  yaw: number;
  /** Closest trail t and a stand-point on the path edge (for screenshots / tests). */
  t: number;
  standX: number;
  standZ: number;
  /** Short description for the report. */
  where: string;
}

/** Seeded PRNG (mulberry32). */
export function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plaza clearance per station kind (≈ content footprint + margin) so eggs never land inside a tambo. */
const CLEAR: Record<string, number> = {
  gate: 7,
  company: 8,
  arcade: 12.5,
  ai: 8,
  contact: 9.5,
  build: 7,
  bridge: 0,
};

interface Spec {
  where: string;
  /** Trail t window to search. */
  t0: number;
  t1: number;
  /** Preferred side (-1 left, 1 right) or 0 for either. */
  side: -1 | 0 | 1;
  /** Score bonus: "riser" prefers a sharp terrace step, "near" prefers closeness to a point. */
  score?: "riser" | { x: number; z: number };
  /** Minimum distance beyond the path half-width (bigger footprints sit further out). */
  dMin?: number;
}

const P = new THREE.Vector3();
const T = new THREE.Vector3();

function stationClear(env: PlaceEnv, x: number, z: number) {
  for (const s of STATIONS) {
    const r = CLEAR[s.kind] ?? 8;
    if (r <= 0) continue;
    const p = env.stationPose(s.id).position;
    if (Math.hypot(x - p.x, z - p.z) < r) return false;
  }
  return true;
}

/** Sharpest height step within ~1 unit (andén risers, rock steps). */
function riser(env: PlaceEnv, x: number, z: number) {
  const h = env.heightAt(x, z);
  let m = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    m = Math.max(m, Math.abs(env.heightAt(x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1) - h));
  }
  return m;
}

function search(env: PlaceEnv, rand: () => number, spec: Spec, taken: Nook[]): Nook {
  const hw = env.trail.halfWidth;
  let best: Nook | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 220; i++) {
    const t = spec.t0 + (spec.t1 - spec.t0) * rand();
    const side = spec.side || (rand() < 0.5 ? -1 : 1);
    const dMin = hw + (spec.dMin ?? 0.95);
    const dMax = hw + 2.1;
    const off = dMin - 0.2 + rand() * (dMax - dMin + 0.4);
    env.trail.pointAt(t, P);
    env.trail.tangentAt(t, T);
    // right = forward × up = (-tz, tx)
    const x = P.x - T.z * side * off;
    const z = P.z + T.x * side * off;
    const q = env.extra.trailDistance(x, z);
    if (q.d < dMin || q.d > dMax) continue;
    if (env.extra.isWater(x, z)) continue;
    const y = env.heightAt(x, z);
    const pathY = env.heightAt(P.x, P.z);
    // Never over the gorge or down a cliff: the egg must be visible from the path.
    if (y < pathY - 1.2 || y > pathY + 2.6) continue;
    if (!stationClear(env, x, z)) continue;
    if (taken.some((n) => Math.hypot(n.x - x, n.z - z) < 20)) continue;
    let score = -Math.abs(q.d - (dMin + dMax) / 2) - Math.abs(y - pathY) * 0.2;
    if (spec.score === "riser") score += riser(env, x, z) * 2;
    else if (spec.score) score -= Math.hypot(x - spec.score.x, z - spec.score.z) * 0.6;
    if (score > bestScore) {
      bestScore = score;
      const sx = P.x - T.z * side * (hw - 0.4);
      const sz = P.z + T.x * side * (hw - 0.4);
      best = { x, y, z, yaw: Math.atan2(P.x - x, P.z - z), t: q.t, standX: sx, standZ: sz, where: spec.where };
    }
  }
  if (best) return best;
  // Fallback: the path edge itself at the window's middle (always reachable).
  const t = (spec.t0 + spec.t1) / 2;
  env.trail.pointAt(t, P);
  env.trail.tangentAt(t, T);
  const s = spec.side || 1;
  const x = P.x - T.z * s * (hw + 1.2);
  const z = P.z + T.x * s * (hw + 1.2);
  return {
    x,
    y: env.heightAt(x, z),
    z,
    yaw: Math.atan2(P.x - x, P.z - z),
    t,
    standX: P.x,
    standZ: P.z,
    where: `${spec.where} (fallback)`,
  };
}

/** The 5 vizcacha nooks, in climbing order. Same seed → same spots on every visit. */
export function vizcachaNooks(env: PlaceEnv, seed = 0x5eed): Nook[] {
  const rand = seeded(seed);
  const bridgeT = STATIONS.find((s) => s.id === "bridge")?.t ?? 0.68;
  const { cross, fallBase } = env.extra.stream;
  // A point ~4 u up the stream from the crossing, toward the waterfall.
  const fl = Math.hypot(fallBase.x - cross.x, fallBase.z - cross.z) || 1;
  const up = { x: cross.x + ((fallBase.x - cross.x) / fl) * 4, z: cross.z + ((fallBase.z - cross.z) / fl) * 4 };
  const specs: Spec[] = [
    { where: "behind a rock cluster beside the lower trail", t0: 0.11, t1: 0.15, side: 0 },
    { where: "on top of an andén retaining wall (terraces)", t0: 0.25, t1: 0.33, side: 0, score: "riser" },
    {
      where: "by the waterfall stream, uphill of the slab-bridge crossing",
      t0: env.extra.stream.t - 0.012,
      t1: env.extra.stream.t + 0.012,
      side: 0,
      score: up,
    },
    { where: "on the cliff edge past the rope bridge", t0: bridgeT + 0.018, t1: bridgeT + 0.04, side: 0 },
    { where: "near the summit, below the chasqui post", t0: 0.915, t1: 0.945, side: 0, score: "riser" },
  ];
  const out: Nook[] = [];
  for (const s of specs) out.push(search(env, rand, s, out));
  return out;
}

/** Stone niche for the golden khipu: just off the summit path, on the side away from the chasqui post. */
export function khipuNiche(env: PlaceEnv, taken: Nook[], seed = 0x4b1b): Nook {
  const rand = seeded(seed);
  return search(
    env,
    rand,
    { where: "stone niche beside the summit path", t0: 0.975, t1: 0.995, side: 0, dMin: 1.35 },
    taken,
  );
}
