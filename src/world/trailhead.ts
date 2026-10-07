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
