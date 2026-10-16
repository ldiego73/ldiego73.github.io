/**
 * Pure rules of the Collasuyu llama (../llama.ts): where its lay-by sits (a small walkable circle on the land
 * side of the road, a few metres past the arrival point) and its copy. No DOM, no three.js scene (tested in
 * logic.test.ts).
 */
import type { L, Trail } from "../../../contract";
import { DEFAULT_T } from "../../plan";

/** Mount prompt radius of the shared road mount (../../../ambient/mount/ride.ts RANGE). */
export const MOUNT_RANGE = 2.4;

export const LLAMA_COPY = {
  mount: { es: "E · Montar la llama", en: "E · Ride the llama" },
} satisfies Record<string, L>;

export interface LayBy {
  x: number;
  z: number;
  r: number;
  /** Road parameter it sits beside. */
  t: number;
  /** Road tangent and the unit normal toward the lay-by (land side). */
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

/**
 * About 8 u past the spawn (t + 0.012 of a ≈ 670 u road), so the traveler sees the llama ahead on the right as
 * they arrive; its centre 2.4 u beyond the road's edge, radius 3.2 so it overlaps the road band (walkable from it).
 */
export function layBy(trail: Pick<Trail, "pointAt" | "tangentAt" | "halfWidth">, t = DEFAULT_T + 0.012): LayBy {
  const p = trail.pointAt(t);
  const d = trail.tangentAt(t);
  // Left normal of the west → east road: (−tz, tx) points south, away from the lake.
  const nx = -d.z;
  const nz = d.x;
  const off = trail.halfWidth + 2.4;
  return { x: p.x + nx * off, z: p.z + nz * off, r: 3.2, t, tx: d.x, tz: d.z, nx, nz };
}
