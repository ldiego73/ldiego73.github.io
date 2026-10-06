/** Pure helpers for the llama ride (no DOM, no scene): home spot at the trailhead and yaw smoothing. */
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
