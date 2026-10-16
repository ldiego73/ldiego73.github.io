/** Pure helpers for the mounts (no DOM, no scene): home spots, yaw smoothing, the ride state machine, where to stop. */
import type * as THREE from "three";

export interface HomeEnv {
  stationPose(id: string): { position: THREE.Vector3; yaw: number };
  walkable(x: number, z: number): boolean;
  heightAt(x: number, z: number): number;
  trail: { halfWidth: number };
  extra?: { trailDistance(x: number, z: number): { d: number; t: number } };
}

/**
 * Where the llama waits: beside the trailhead gate on the plaza (walkable, reachable), off the stone path
 * and not between the gate and the trail (the plaza spur). Local frame: +Z of the gate points at the trail.
 */
export function llamaHome(env: HomeEnv): { x: number; z: number; yaw: number } {
  const g = env.stationPose("gate");
  const c = Math.cos(g.yaw);
  const s = Math.sin(g.yaw);
  const hw = env.trail.halfWidth;
  // [local x, local z] candidates: beside the arch first, then behind it.
  const cand: Array<[number, number]> = [
    [2.9, -0.6],
    [-2.9, -0.6],
    [2.6, 0.9],
    [-2.6, 0.9],
    [2.2, -2.2],
    [-2.2, -2.2],
    [0, -3],
    [3.4, 0],
    [-3.4, 0],
  ];
  for (const [lx, lz] of cand) {
    const x = g.position.x + lx * c + lz * s;
    const z = g.position.z - lx * s + lz * c;
    if (!env.walkable(x, z)) continue;
    // Keep the stone path clear.
    if (env.extra && env.extra.trailDistance(x, z).d < hw + 1.4) continue;
    if (Math.abs(env.heightAt(x, z) - g.position.y) > 0.8) continue;
    // Stand sideways to the trail so the saddle shows.
    return { x, z, yaw: g.yaw + (lx >= 0 ? Math.PI / 2 : -Math.PI / 2) };
  }
  return { x: g.position.x + 2.5 * c, z: g.position.z - 2.5 * s, yaw: g.yaw + Math.PI / 2 };
}

/** Shortest-arc angle interpolation (same as core's). */
export function angleLerp(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Ride state machine, kept pure so it is testable. */
export type RideState = "idle" | "riding";
export type RideAction = "mount" | "dismount" | "none";

export function rideAction(o: { state: RideState; dist: number; range: number; blocked: boolean }): RideAction {
  if (o.blocked) return "none";
  if (o.state === "riding") return "dismount";
  return o.dist <= o.range ? "mount" : "none";
}

export interface MountHomeEnv {
  plaza: { x: number; z: number; r: number } | undefined;
  station: { x: number; z: number };
  walkable(x: number, z: number): boolean;
  heightAt(x: number, z: number): number;
  trailDistance(x: number, z: number): { d: number };
  halfWidth: number;
  /** Points the mount must keep clear of: [x, z, minimum distance] (a punku's prompt, the arrival spawn). */
  avoid: Array<[number, number, number]>;
  /** Road direction near the plaza (x, z): the mount stands sideways to it so the saddle shows. */
  roadDir: { x: number; z: number };
}

/**
 * Waiting spot of a road mount (the jungle mule, the coast horse...): on the rim of a plaza (walkable, off the
 * road, clear of the avoided points so the first E after arriving never mixes "ride" with a punku's prompt).
 * Candidates are tried round the rim; the fallback is the station itself.
 */
export function mountHome(env: MountHomeEnv): { x: number; z: number; yaw: number } {
  const c = env.plaza ?? { x: env.station.x, z: env.station.z, r: 4 };
  const y0 = env.heightAt(c.x, c.z);
  // Sideways to the road: facing along it (yaw of the road direction), either way.
  const roadYaw = Math.atan2(env.roadDir.x, env.roadDir.z);
  for (const rf of [0.7, 0.5, 0.85]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r * rf;
      const z = c.z + Math.sin(a) * c.r * rf;
      if (!env.walkable(x, z)) continue;
      if (env.trailDistance(x, z).d < env.halfWidth + 1.4) continue;
      if (Math.abs(env.heightAt(x, z) - y0) > 0.8) continue;
      if (env.avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      return { x, z, yaw: roadYaw };
    }
  }
  return { x: env.station.x, z: env.station.z, yaw: roadYaw };
}

export interface StopQuery {
  /** Road query at the rider's position. */
  q: { d: number; t: number };
  halfWidth: number;
  /** True when the ground under the rider is a registered deck (higher than the layout ground). */
  onDeck: boolean;
  /** Station keep-out circles (switched-off ones are ignored). */
  zones: ReadonlyArray<{ x: number; z: number; r: number; on: boolean }>;
  x: number;
  z: number;
}

/** Margin beyond the road's half width that still counts as "on the road" (its verges). */
export const ROAD_VERGE = 1;

/**
 * True where a road mount cannot go: any raised deck (piers, jetties, boardwalks, rafts), or off the road into
 * a station's grounds (the keep-out circles of ../../creatures.ts). The stops are visited on foot.
 */
export function mountMustStop(o: StopQuery): boolean {
  if (o.onDeck) return true;
  if (o.q.d <= o.halfWidth + ROAD_VERGE) return false;
  return o.zones.some((k) => k.on && Math.hypot(o.x - k.x, o.z - k.z) < k.r);
}
