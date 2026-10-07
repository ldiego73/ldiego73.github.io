/**
 * Tinkuy (crossroads) plan: pure numbers and helpers for the signpost at the trailhead and the Antisuyu
 * branch down to the stone punku (no three.js, no DOM). trailhead.ts stays the single source of the
 * branch, the punku and the arrival spot; this file derives the walkable band, the colliders and ranges.
 */
import type { Collider } from "../../contract";
import { PUNKU, SELVA_BRANCH, SELVA_BRANCH_HALF_WIDTH, WASI } from "../../trailhead";

export type P2 = readonly [number, number];

/**
 * Gate plaza centre (layout.ts plaza "gate", from the station pose; checked by the tests). The plaza is
 * walkable to r − 0.3 = 4.2; SELVA_BRANCH[0] sits just outside it, so the band starts a little inside.
 */
export const GATE_PLAZA = { x: 46.13, z: 100.31, r: 4.5 } as const;
const BAND_START: P2 = [49.3, 100.85];

/** Punku facing (its +Z, toward the branch) and the spot in front of the doorway. */
export const PUNKU_DIR = { x: Math.sin(PUNKU.yaw), z: Math.cos(PUNKU.yaw) } as const;
export const PUNKU_FRONT: P2 = [PUNKU.x + PUNKU_DIR.x * 1.1, PUNKU.z + PUNKU_DIR.z * 1.1];

/** Walkable centreline: from inside the plaza, along the branch, to the punku's doorstep. */
export const BAND: readonly P2[] = [BAND_START, ...SELVA_BRANCH, PUNKU_FRONT];
export const BAND_R = SELVA_BRANCH_HALF_WIDTH;

/** Prompt ("E · Viajar al Antisuyu") within this distance of the punku, in front of it. */
export const TRAVEL_R = 3;
/** Warm the jungle page within this distance (once). */
export const PREFETCH_R = 30;
/** Animals keep clear of the punku. */
export const PUNKU_KEEP_OUT_R = 4.5;

/** Opening of the doorway (local frame: x across, y up, z = PUNKU_DIR) and its stone jambs. */
export const DOORWAY = { bottom: 1.95, top: 1.3, height: 2.9, jamb: 0.95, depth: 1.1 } as const;

/** The crossroads signpost: on the trail's west edge where the Wasi walk joins, south of the arch. */
export const SIGN = { x: 38.75, z: 105.45, r: 0.35 } as const;

/** Where each arrow points from the signpost (world targets). */
export const SIGN_TARGETS = {
  /** Up the Qhapaq Ñan (the trail north of the arch). */
  qhapaq: [43.6, 93.6] as P2,
  /** The Wasi door. */
  wasi: [WASI.x + WASI.halfD, WASI.z] as P2,
  /** Across the plaza toward the branch. */
  antisuyu: [50.5, 101.5] as P2,
};

/** Yaw (rotation.y) that turns a board whose arrow points along local +X toward world direction (dx, dz). */
export const arrowYaw = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** Discs every `step` along a polyline (the path is diagonal: boxes would leave a staircase edge). */
export function pathCircles(path: readonly P2[], r: number, step = r * 0.6): Collider[] {
  const out: Collider[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++)
      out.push({ kind: "circle", x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, r });
  }
  return out;
}

/** Distance from (x, z) to a polyline. */
export function distToPath(path: readonly P2[], x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * k), z - (az + dz * k)));
  }
  return best;
}

/** Punku local frame (x across the doorway, z out of its front). */
export function punkuLocal(x: number, z: number): { x: number; z: number } {
  const dx = x - PUNKU.x;
  const dz = z - PUNKU.z;
  const c = Math.cos(PUNKU.yaw);
  const s = Math.sin(PUNKU.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function punkuWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(PUNKU.yaw);
  const s = Math.sin(PUNKU.yaw);
  return { x: PUNKU.x + lx * c + lz * s, z: PUNKU.z - lx * s + lz * c };
}

/** True when the traveler stands at the doorway, on its front side (never from behind the stones). */
export function inTravelRange(x: number, z: number): boolean {
  const l = punkuLocal(x, z);
  return Math.hypot(l.x, l.z) <= TRAVEL_R && l.z > -0.9;
}

/** The jambs as discs (the punku is turned off the world axes, so no boxes). */
export function jambColliders(): Collider[] {
  const out: Collider[] = [];
  const cx = (DOORWAY.bottom + DOORWAY.jamb) / 2;
  for (const sx of [-1, 1])
    for (const lz of [-0.3, 0.3]) {
      const p = punkuWorld(sx * cx, lz);
      out.push({ kind: "circle", x: p.x, z: p.z, r: 0.55 });
    }
  return out;
}

/** Ground cover to clear (world point): the branch band and the punku's footprint. */
export function clearsGround(x: number, z: number): boolean {
  if (distToPath(BAND, x, z) < BAND_R + 0.6) return true;
  const l = punkuLocal(x, z);
  return Math.abs(l.x) < 2.6 && l.z > -1.2 && l.z < 2.2;
}
