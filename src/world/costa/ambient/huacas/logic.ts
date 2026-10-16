/**
 * Pure helpers of the coast's stations (../huacas.ts): a station's local frame (origin on its plaza, +Z toward
 * the road), local → world transforms of points and rectangles, the axis-aligned collider that covers a rotated
 * rectangle, and the choice of the reading spot the traveler is at. No DOM, no three.js (tested in
 * logic.test.ts).
 */

export interface Frame {
  x: number;
  z: number;
  y: number;
  /** rotation.y of the station group (local +Z faces the road). */
  yaw: number;
}

/** Local (lx, lz) → world (x, z) in a frame (three.js rotation.y convention). */
export function toWorld(f: Frame, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}

/** World (x, z) → local (lx, lz). */
export function toLocal(f: Frame, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const dx = x - f.x;
  const dz = z - f.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** A local rectangle (centre, half sizes) → the world AABB that covers it, shrunk by `inset` on each side. */
export function rectAabb(
  f: Frame,
  r: { x: number; z: number; hw: number; hd: number },
  inset = 0,
): { kind: "box"; x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const p = toWorld(f, r.x + sx * r.hw, r.z + sz * r.hd);
    x0 = Math.min(x0, p.x);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    z1 = Math.max(z1, p.z);
  }
  return { kind: "box", x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset };
}

export interface Spot {
  id: string;
  x: number;
  z: number;
  r: number;
  /** Higher wins where spots overlap (a stall over the market's plaza). */
  priority: number;
}

/** The spot the traveler at (x, z) is reading: within its radius, nearest after priority. */
export function pickSpot<T extends Spot>(spots: readonly T[], x: number, z: number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const s of spots) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > s.r) continue;
    const score = d - s.priority * 10;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Years label of a company for its sign: "2014–2016" or "2026–hoy". */
export function yearsLabel(stages: ReadonlyArray<{ start: string; end?: string }>, lang: "es" | "en"): string {
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (!first || !last) return "";
  const a = first.start.slice(0, 4);
  const b = last.end ? last.end.slice(0, 4) : lang === "es" ? "hoy" : "now";
  return a === b ? a : `${a}–${b}`;
}
