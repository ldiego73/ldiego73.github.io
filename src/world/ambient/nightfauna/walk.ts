/** Ground-following locomotion shared by the puma and the fox (no allocations per call). */
import type { WorldEnv } from "../../contract";
import { creatures } from "../../creatures";
import type { WorldEnvExtra } from "../../env";
import type { QuadState } from "./rig";
import { ease, turnToward } from "./sim";

export interface Ground {
  at(x: number, z: number): number;
  water(x: number, z: number): boolean;
}

export function ground(env: WorldEnv): Ground {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  return {
    at: (x, z) => extra?.groundAt(x, z) ?? env.heightAt(x, z),
    water: (x, z) => extra?.isWater(x, z) ?? false,
  };
}

const want = { x: 0, z: 0 };

/**
 * Turn toward (tx, tz) and walk forward `speed` u/s; steers around water, and (when the state has a body)
 * around other animals and the traveler with a 1 s look-ahead. Returns the remaining distance.
 * `len` is half the body length (for the slope sample).
 */
export function walkToward(
  st: QuadState,
  g: Ground,
  tx: number,
  tz: number,
  speed: number,
  turnRate: number,
  dt: number,
  len: number,
) {
  const dx = tx - st.x;
  const dz = tz - st.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  let sp = speed;
  let head = Math.atan2(dx, dz);
  if (st.body) {
    creatures.steer(st.body, (dx / d) * speed, (dz / d) * speed, 1, want);
    sp = Math.hypot(want.x, want.z);
    if (sp > 1e-4) head = Math.atan2(want.x, want.z);
  }
  st.yaw = turnToward(st.yaw, head, turnRate * dt);
  const step = Math.min(d, sp * dt);
  const nx = st.x + Math.sin(st.yaw) * step;
  const nz = st.z + Math.cos(st.yaw) * step;
  if (g.water(nx + Math.sin(st.yaw) * len, nz + Math.cos(st.yaw) * len)) {
    st.yaw += turnRate * dt * 1.5; // sidestep the stream
    return d;
  }
  st.x = nx;
  st.z = nz;
  return d - step;
}

/** Snap height (smoothed) and body slope to the ground under the animal. */
export function settle(st: QuadState, g: Ground, dt: number, len: number, snap = false) {
  const h = g.at(st.x, st.z);
  st.y = snap || st.y < -100 ? h : st.y + (h - st.y) * ease(14, dt);
  const sx = Math.sin(st.yaw) * len;
  const sz = Math.cos(st.yaw) * len;
  const hf = g.at(st.x + sx, st.z + sz);
  const hb = g.at(st.x - sx, st.z - sz);
  const target = Math.max(-0.45, Math.min(0.45, Math.atan2(hb - hf, len * 2)));
  st.slope = snap ? target : st.slope + (target - st.slope) * ease(8, dt);
}
