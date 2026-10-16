/**
 * Pure helpers for the jungle mule ride (no DOM, no scene): where the mule waits at the start of the road, and
 * where the rider has to get off. The mule is for the road: it stops at the canopy walkway (no hanging bridges),
 * on any raised deck (piers, jetties, boardwalks, the arcade raft, the regatón plank) and when the rider leaves
 * the road into a station's grounds (the station keep-out circles of ../../../creatures.ts: the maloca, the
 * stilt houses, the landing...). The stops are visited on foot.
 */
import { CANOPY_T } from "../../contract";

export interface MuleHomeEnv {
  plaza: { x: number; z: number; r: number } | undefined;
  station: { x: number; z: number };
  walkable(x: number, z: number): boolean;
  heightAt(x: number, z: number): number;
  trailDistance(x: number, z: number): { d: number };
  halfWidth: number;
  /** Points the mule must keep clear of: [x, z, minimum distance] (the punku's prompt, the arrival spawn). */
  avoid: Array<[number, number, number]>;
  /** Road direction near the plaza (x, z): the mule stands sideways to it so the saddle shows. */
  roadDir: { x: number; z: number };
}

/**
 * Waiting spot: on the edge of the "puerto" plaza (walkable, off the road, not inside the punku's prompt
 * radius so the first E after arriving never mixes "ride" with "back to the mountain"). Candidates are tried
 * round the plaza rim; the fallback is the station itself.
 */
export function muleHome(env: MuleHomeEnv): { x: number; z: number; yaw: number } {
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

/** Road-t margin before and after CANOPY_T where the rider dismounts (the ramp up to the walkway). */
export const CANOPY_MARGIN = 0.006;

/** True on (or on the way up to) the canopy walkway: the mule stops and the rider walks on. */
export function nearCanopy(q: { d: number; t: number }, halfWidth: number): boolean {
  return q.t > CANOPY_T[0] - CANOPY_MARGIN && q.t < CANOPY_T[1] + CANOPY_MARGIN && q.d < halfWidth + 3;
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

/** True where the mule cannot go: the rider dismounts and the mule waits at the last allowed spot. */
export function muleMustStop(o: StopQuery): boolean {
  if (nearCanopy(o.q, o.halfWidth)) return true;
  if (o.onDeck) return true;
  if (o.q.d <= o.halfWidth + ROAD_VERGE) return false;
  return o.zones.some((k) => k.on && Math.hypot(o.x - k.x, o.z - k.z) < k.r);
}
