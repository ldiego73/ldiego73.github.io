/**
 * Tinkuy (crossroads) at the trailhead: where the mountain road meets the other worlds. Pure constants, no
 * three.js, shared by the mountain runtime (arrival spawn), the Wasi house and the Antisuyu branch.
 *
 * Mountain world frame around the gate: the trail runs north (−z) past the gate plaza at x≈42; the plaza is
 * on the east (+x) side, centred near (46.1, 100.3); the llama waits beside the gate arch.
 *  - Wasi house: west of the trail, just south-west of the gate arch and beside the spawn point, door facing
 *    the trail (+x). Sited on the gentlest patch west of the trail (terrain ≈ 4.1–5.5 under the footprint):
 *    the house stands on a levelled stone plinth registered as a raised deck (decks.ts), with stone steps
 *    down to a flagstone walk that joins the trail.
 *  - Antisuyu branch: a dirt path leaves the plaza's east edge and goes down south-east to a stone punku;
 *    crossing the punku travels to the jungle page.
 * Values are the agreed starting point; the owner of ambient/wasi.ts and ambient/tinkuy.ts may refine them
 * after checking the ground (keep this file the single source).
 */

/** Yaw convention: models face +Z; yaw = rotation.y; facing +X is π/2. */
export const WASI = {
  /** House centre on the ground plan (the walk to the trail runs ~10 u east, clear of the gate arch at z≈100). */
  x: 25,
  z: 107,
  /** Door faces the trail (+x). */
  yaw: Math.PI / 2,
  /** Footprint half sizes in the house's local frame (x across the front, z front → back). */
  halfW: 5.5,
  halfD: 4.5,
} as const;

/** Antisuyu branch from the plaza edge to the punku, [x, z] points. */
export const SELVA_BRANCH: ReadonlyArray<readonly [number, number]> = [
  [50.5, 101.5],
  [55.5, 105.5],
  [60, 110],
  [63.5, 114.5],
  [66, 118.5],
];
export const SELVA_BRANCH_HALF_WIDTH = 1.6;

/** The punku (trapezoidal stone doorway) at the end of the branch; facing back up the branch. */
export const PUNKU = { x: 66.8, z: 120, yaw: -2.55 } as const;

export type ArrivalFrom = "selva";

/** Where the traveler appears on the mountain when coming back from another world (?from=<id>). */
export const ARRIVALS: Record<ArrivalFrom, { x: number; z: number; yaw: number }> = {
  /** On the branch ~12 u up from the punku (so the follow camera is not inside the doorway), facing the plaza. */
  selva: { x: 60, z: 110, yaw: -2.48 },
};

export function arrivalFrom(search: string): { x: number; z: number; yaw: number } | null {
  const from = new URLSearchParams(search).get("from");
  return from && from in ARRIVALS ? ARRIVALS[from as ArrivalFrom] : null;
}

/**
 * True near what the trailhead builds (the Wasi with its porch and walk, the Antisuyu branch and the punku).
 * Flora placement skips these spots so no tree trunk (or its collider) ends up inside the house or on the path.
 */
export function nearTrailheadBuilt(x: number, z: number, pad = 0): boolean {
  if (Math.hypot(x - WASI.x, z - WASI.z) < Math.hypot(WASI.halfW, WASI.halfD) + 2.5 + pad) return true;
  if (Math.hypot(x - PUNKU.x, z - PUNKU.z) < 4.5 + pad) return true;
  for (let i = 0; i < SELVA_BRANCH.length - 1; i++) {
    const [ax, az] = SELVA_BRANCH[i] as readonly [number, number];
    const [bx, bz] = SELVA_BRANCH[i + 1] as readonly [number, number];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - ax - dx * u, z - az - dz * u) < SELVA_BRANCH_HALF_WIDTH + 0.6 + pad) return true;
  }
  return false;
}
