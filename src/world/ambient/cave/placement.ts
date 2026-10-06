/**
 * Pure placement for the waterfall cave (no DOM, no scene objects): runs under bun test against the real layout.
 *
 * Frame: the waterfall cliff group terrain.ts builds ("waterfall-cliff"): origin on the rock face at the
 * spring, local +Z pointing down the stream (toward the t≈0.37 trail leg, ~13 u below), +X to the right.
 * terrain.ts registers a circle collider at local (0, -1.4) r 3.2 over the cliff, so the cave can't sit
 * literally inside the rock: it is a grotto under an overhang on the ledge to the LEFT of the fall
 * (local x ≈ -5.6 … -9.8, z ≈ 0.35, the only near-level contour there), screened by its own veil of water.
 * A switchback of stepping stones climbs the steep slope from the trail edge to the grotto mouth.
 */
import * as THREE from "three";

export interface Frame {
  x: number;
  z: number;
  /** Cliff base height (the rock group's y). */
  y: number;
  yaw: number;
}

export interface CaveEnv {
  heightAt(x: number, z: number): number;
  halfWidth: number;
  trailDistance(x: number, z: number): { d: number; t: number };
  isWater(x: number, z: number): boolean;
}

export interface Stone {
  x: number;
  z: number;
  /** Ground height at the stone centre. */
  y: number;
  yaw: number;
  /** 0..1 deterministic jitter for size/colour. */
  seed: number;
}

export interface CavePlan {
  stones: Stone[];
  /** Walkable circles (stones, threshold, interior band), in order from the trail to the back of the cave. */
  walk: Array<{ x: number; z: number; r: number }>;
  /** Interior floor reference height (average ground along the interior band). */
  floorY: number;
  /** Local-frame interior box (for the "inside" test and the grotto shell). */
  inside: { x0: number; x1: number; z0: number; z1: number };
}

/** Switchback through the steep slope (local x, z), from the trail edge to the grotto threshold. */
export const ROUTE: ReadonlyArray<readonly [number, number]> = [
  [-4.4, 14.2],
  [-5.2, 11.6],
  [-13.6, 8.7],
  [-6.2, 6.0],
  [-12.8, 3.4],
  [-8.4, 1.75],
  [-7.6, 0.8],
  [-7.4, 0.4],
];
/** Interior band along the ledge's contour (local x at z = INSIDE_Z). */
export const INSIDE_X0 = -9.6;
export const INSIDE_X1 = -5.8;
export const INSIDE_Z = 0.45;
export const STONE_STEP = 0.72;
const STONE_R = 0.8;
const BAND_R = 0.5;
/**
 * Walkable part of the niche: well short of the end walls (circle radius + the traveler's 0.42 body stay off
 * the rock) and kept short so the follow camera stays out in front of the mouth instead of swinging into
 * the cliff when walking sideways.
 */
const BAND_X0 = INSIDE_X0 + 1.3;
const BAND_X1 = INSIDE_X1 - 0.9;
/** terrain.ts cliff collider in local space (+ the traveler's body radius). */
export const CLIFF_COLLIDER = { x: 0, z: -1.4, r: 3.2 + 0.42 };

export function toWorld(f: Frame, lx: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return out.set(f.x + lx * c + lz * s, 0, f.z - lx * s + lz * c);
}

export function toLocal(f: Frame, x: number, z: number, out: { x: number; z: number }) {
  const dx = x - f.x;
  const dz = z - f.z;
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** Same frame terrain.ts uses for the cliff group (spring = first stream point, dir = fall direction). */
export function frameFromStream(
  heightAt: (x: number, z: number) => number,
  spring: readonly [number, number],
  fallDir: { x: number; y: number },
): Frame {
  return {
    x: spring[0] - fallDir.x * 0.2,
    z: spring[1] - fallDir.y * 0.2,
    y: heightAt(spring[0], spring[1]) - 0.15,
    yaw: Math.atan2(fallDir.x, fallDir.y),
  };
}

const fract = (v: number) => v - Math.floor(v);

export function planCave(f: Frame, env: CaveEnv): CavePlan {
  const curve = new THREE.CatmullRomCurve3(
    ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / 0.1));
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const w = new THREE.Vector3();
  const stones: Stone[] = [];
  const walk: CavePlan["walk"] = [];
  // Walk the curve finely; drop a stone every STONE_STEP, or sooner where the slope is steep (stairs).
  let lastX = Number.NaN;
  let lastZ = 0;
  let lastY = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p);
    toWorld(f, p.x, p.z, w);
    const y = env.heightAt(w.x, w.z);
    const d = Math.hypot(w.x - lastX, w.z - lastZ);
    const due = Number.isNaN(lastX) || d >= STONE_STEP || (d >= 0.25 && Math.abs(y - lastY) >= 0.42) || i === n;
    if (!due) continue;
    lastX = w.x;
    lastZ = w.z;
    lastY = y;
    walk.push({ x: w.x, z: w.z, r: STONE_R });
    // Stones start where the paving ends (the trail band is walkable anyway).
    if (env.trailDistance(w.x, w.z).d < env.halfWidth + 0.15) continue;
    curve.getTangentAt(u, q);
    const k = stones.length;
    const seed = fract(Math.sin(k * 12.9898 + 4.1) * 43758.5453);
    stones.push({ x: w.x, z: w.z, y, yaw: Math.atan2(q.x, q.z) + f.yaw + (seed - 0.5) * 0.6, seed });
  }
  // Interior band along the contour.
  let sum = 0;
  let cnt = 0;
  for (let lx = BAND_X1; lx >= BAND_X0 - 1e-6; lx -= (BAND_X1 - BAND_X0) / 5) {
    toWorld(f, lx, INSIDE_Z, w);
    walk.push({ x: w.x, z: w.z, r: BAND_R });
    sum += env.heightAt(w.x, w.z);
    cnt++;
  }
  return {
    stones,
    walk,
    floorY: sum / Math.max(1, cnt),
    inside: { x0: INSIDE_X0 - 0.4, x1: INSIDE_X1, z0: -0.6, z1: 1.0 },
  };
}
