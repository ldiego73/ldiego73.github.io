/**
 * Pure helpers for the jungle animals that cross the road or move as a file (no three.js, no DOM), shared
 * by sajinos.ts (a peccary herd crossing in single file), anuje.ts (agoutis darting across) and the river
 * animals that wait for the traveler to leave (taricaya.ts, sachavaca.ts, shansho.ts). Unit-tested in
 * crossing.test.ts.
 *
 *  - `SpeedMeter`: the traveler's ground speed, smoothed (walking ≈ 3.5 u/s, running ≈ 7, so > 5.5 = running).
 *  - `RoadTracker`: where on the road the traveler is and which way they are heading, sampled a few times a
 *    second (crossings are planned ahead of them, never behind).
 *  - `crossingPlan`: a crossing of the road at a quiet t ahead of the traveler, from deep in the undergrowth
 *    on one side to the other, avoiding water, keep-out zones and the station plazas.
 *  - `Trail`: the breadcrumb path of a leader, so followers walk exactly where it walked, one body length
 *    apart (a single file that bends with the leader, compresses when it stops and stretches when it runs).
 */
import type { SelvaLayout } from "../../contract";
import { damp, quietT, roadFrame } from "./logic";

/** Running threshold for the traveler's smoothed ground speed (u/s). */
export const RUN_SPEED = 5.5;
/** Displacements faster than this (u/s) are teleports, ignored by the meter. */
export const TELEPORT_SPEED = 25;

/** Smoothed traveler speed from successive positions. */
export class SpeedMeter {
  speed = 0;
  private lx = Number.NaN;
  private lz = 0;
  update(x: number, z: number, dt: number) {
    if (!Number.isNaN(this.lx) && dt > 0) {
      const sp = Math.hypot(x - this.lx, z - this.lz) / dt;
      // A jump faster than any sprint is a teleport (map fast travel, getting off the canoe): not a speed.
      if (sp < TELEPORT_SPEED) this.speed = damp(this.speed, sp, 6, dt);
    }
    this.lx = x;
    this.lz = z;
    return this.speed;
  }
  get running() {
    return this.speed > RUN_SPEED;
  }
}

/** The traveler's road t and heading along it (+1 east, −1 west), refreshed every `every` seconds. */
export class RoadTracker {
  t = 0;
  dir: 1 | -1 = 1;
  private last = -1;
  private clock = Number.POSITIVE_INFINITY;
  constructor(private readonly every = 0.4) {}
  /** Re-reads the traveler's t on the next update (after a teleport). */
  refresh() {
    this.clock = Number.POSITIVE_INFINITY;
    this.last = -1;
  }
  update(nearestT: (x: number, z: number) => number, x: number, z: number, dt: number) {
    this.clock += dt;
    if (this.clock < this.every) return;
    this.clock = 0;
    const t = nearestT(x, z);
    // Small jitter while standing still does not flip the heading.
    if (this.last >= 0 && Math.abs(t - this.last) > 0.0004) this.dir = t > this.last ? 1 : -1;
    this.last = t;
    this.t = t;
  }
}

export interface Crossing {
  /** Road t of the crossing point. */
  t: number;
  /** Start (deep on one side), middle of the road, end (deep on the other side). */
  ax: number;
  az: number;
  mx: number;
  mz: number;
  bx: number;
  bz: number;
  /** The side it starts on (−1 river side, +1 inland side). */
  side: -1 | 1;
}

export interface CrossingOpts {
  /** Traveler road t and heading. */
  t: number;
  dir: 1 | -1;
  /** Distance ahead along the road (u), a range picked from with `rand`. */
  ahead: [number, number];
  /** How far off the centerline the path starts and ends (u). */
  off: number;
  stations: readonly number[];
  canopy: readonly [number, number];
  /** Extra clearance from stations and the canopy walkway, in road t. */
  pad?: number;
  /** Forced starting side; random when omitted. */
  side?: -1 | 1;
  /** Extra rejection test (keep-out zones, …) for the middle and both ends. */
  blocked?: (x: number, z: number) => boolean;
  tries?: number;
}

/** A road crossing ahead of the traveler, or null when no quiet stretch fits right now. */
export function crossingPlan(
  L: Pick<SelvaLayout, "trail" | "isWater">,
  o: CrossingOpts,
  rand: () => number,
): Crossing | null {
  const len = L.trail.length;
  for (let k = 0; k < (o.tries ?? 6); k++) {
    const ahead = o.ahead[0] + (o.ahead[1] - o.ahead[0]) * rand();
    const t = o.t + (o.dir * ahead) / len;
    if (!quietT(t, o.stations, o.canopy, o.pad ?? 0.04)) continue;
    const f = roadFrame(L as SelvaLayout, t);
    const side: -1 | 1 = o.side ?? (rand() < 0.5 ? -1 : 1);
    // roadFrame's r points toward the river (side −1), so a point on side s is f − r·s·off.
    const ax = f.x - f.rx * side * o.off;
    const az = f.z - f.rz * side * o.off;
    const bx = f.x + f.rx * side * o.off;
    const bz = f.z + f.rz * side * o.off;
    if (L.isWater(ax, az) || L.isWater(bx, bz)) continue;
    if (o.blocked && (o.blocked(ax, az) || o.blocked(bx, bz) || o.blocked(f.x, f.z))) continue;
    return { t, ax, az, mx: f.x, mz: f.z, bx, bz, side };
  }
  return null;
}

/**
 * Breadcrumb path of a leader: `push` its position every frame (a point is kept every `step` units of
 * travel), `at(dist)` returns the point `dist` units back along the path (clamped to the oldest point) and
 * the heading there. Bounded: points older than `maxLen` of path are dropped.
 */
export class Trail {
  private xs: number[] = [];
  private zs: number[] = [];
  constructor(
    private readonly step = 0.25,
    private readonly maxLen = 40,
  ) {}
  reset(x: number, z: number, yaw: number) {
    // Seed a straight tail behind the leader so followers start lined up behind it.
    this.xs.length = 0;
    this.zs.length = 0;
    const n = Math.ceil(this.maxLen / this.step);
    for (let i = n; i >= 0; i--) {
      this.xs.push(x - Math.sin(yaw) * i * this.step);
      this.zs.push(z - Math.cos(yaw) * i * this.step);
    }
  }
  push(x: number, z: number) {
    const n = this.xs.length;
    if (n === 0) {
      this.xs.push(x);
      this.zs.push(z);
      return;
    }
    const lx = this.xs[n - 1] as number;
    const lz = this.zs[n - 1] as number;
    if (Math.hypot(x - lx, z - lz) < this.step) return;
    this.xs.push(x);
    this.zs.push(z);
    const cap = Math.ceil(this.maxLen / this.step) + 1;
    if (this.xs.length > cap) {
      this.xs.splice(0, this.xs.length - cap);
      this.zs.splice(0, this.zs.length - cap);
    }
  }
  get length() {
    return this.xs.length;
  }
  /** Point `dist` back along the path from the newest crumb (headX/headZ: the leader's exact position). */
  at(headX: number, headZ: number, dist: number, out: { x: number; z: number; yaw: number }) {
    let px = headX;
    let pz = headZ;
    let left = dist;
    for (let i = this.xs.length - 1; i >= 0; i--) {
      const qx = this.xs[i] as number;
      const qz = this.zs[i] as number;
      const seg = Math.hypot(px - qx, pz - qz);
      if (seg >= left && seg > 1e-6) {
        const k = left / seg;
        out.x = px + (qx - px) * k;
        out.z = pz + (qz - pz) * k;
        // Heading: from the older point toward the newer one.
        out.yaw = Math.atan2(px - qx, pz - qz);
        return out;
      }
      if (seg > 1e-6) out.yaw = Math.atan2(px - qx, pz - qz);
      left -= seg;
      px = qx;
      pz = qz;
    }
    out.x = px;
    out.z = pz;
    return out;
  }
}

/**
 * Staggered release: animal `i` of a row reacts `i·gap` (+ jitter) seconds after the first, so a row of
 * turtles slides off its log one by one instead of all at once. Nearest first when `order` ranks them.
 */
export function stagger(rank: number, gap: number, jitter: number, rand: () => number) {
  return rank * gap + rand() * jitter;
}

/** Ranks of `dists` (0 = smallest), stable for ties. */
export function ranks(dists: readonly number[]) {
  const idx = dists.map((_, i) => i).sort((a, b) => (dists[a] as number) - (dists[b] as number) || a - b);
  const out = new Array<number>(dists.length);
  idx.forEach((i, r) => {
    out[i] = r;
  });
  return out;
}

/**
 * Dusk-to-dawn window for crepuscular and nocturnal browsers (the tapir): 0 by day, ramping up through
 * the late afternoon (≈ 17 h, time 0.7) to 1 after sunset, and back down after sunrise (≈ 7 h).
 */
export const duskToDawn = (time: number) => {
  const up = time > 0.5 ? (time - 0.69) / 0.05 : 0;
  const down = time <= 0.5 ? (0.3 - time) / 0.05 : 0;
  return Math.max(0, Math.min(1, Math.max(up, down)));
};
