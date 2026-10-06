/**
 * Pure placement for the Inti Raymi bonfires (no three / DOM; tested in spots.test.ts): beside the upper
 * trail, alternating sides where the ground is level with the path and clear of every station plaza, plus
 * two flanking the summit ushnu. Coordinates are plain {x, z}.
 */
export interface XZ {
  x: number;
  z: number;
}

export interface SpotQuery {
  /** Trail point (x, y, z) and unit tangent (x, z) at t. */
  point(t: number): { x: number; y: number; z: number };
  tangent(t: number): XZ;
  heightAt(x: number, z: number): number;
  halfWidth: number;
  /** Places to keep clear (station plazas, the stream crossing), with a radius each. */
  avoid: Array<XZ & { r: number }>;
}

/** Trail t of each roadside fire (upper switchbacks, toward the summit). */
export const TRAIL_TS = [0.78, 0.82, 0.88, 0.92, 0.955, 0.985];

export function roadsideFires(q: SpotQuery, ts: number[] = TRAIL_TS): Array<XZ & { y: number }> {
  const out: Array<XZ & { y: number }> = [];
  let prefer = 1;
  for (const t of ts) {
    const p = q.point(t);
    const tg = q.tangent(t);
    const off = q.halfWidth + 1.7;
    let best: (XZ & { y: number; score: number }) | null = null;
    for (const side of [prefer, -prefer]) {
      // right of travel = (-tz, tx)
      const x = p.x - tg.z * side * off;
      const z = p.z + tg.x * side * off;
      const y = q.heightAt(x, z);
      const dy = Math.abs(y - p.y);
      if (dy > 1.1) continue;
      if (q.avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) continue;
      // Keep clear of other fires (switchbacks double back close to each other).
      if (out.some((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < 36)) continue;
      const score = dy + (side === prefer ? 0 : 0.3);
      if (!best || score < best.score) best = { x, y, z, score };
    }
    if (best) {
      out.push({ x: best.x, y: best.y, z: best.z });
      prefer = -prefer;
    }
  }
  return out;
}

/** Cheap layered flicker 0.7..1.15 for a fire with its own seed. */
export function flicker(t: number, seed: number): number {
  return (
    0.92 + 0.12 * Math.sin(t * 9.1 + seed * 7) + 0.07 * Math.sin(t * 23.7 + seed * 3) + 0.04 * Math.sin(t * 41 + seed)
  );
}
