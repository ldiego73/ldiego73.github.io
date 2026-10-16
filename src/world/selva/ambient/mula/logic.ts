/**
 * Jungle-only stop for the mule ride (no DOM, no scene): the canopy walkway. The shared road-mount rules
 * (decks, station grounds, the home spot) live in ../../../ambient/mount/logic.ts.
 */
import { CANOPY_T } from "../../contract";

/** Road-t margin before and after CANOPY_T where the rider dismounts (the ramp up to the walkway). */
export const CANOPY_MARGIN = 0.006;

/** True on (or on the way up to) the canopy walkway: the mule stops and the rider walks on. */
export function nearCanopy(q: { d: number; t: number }, halfWidth: number): boolean {
  return q.t > CANOPY_T[0] - CANOPY_MARGIN && q.t < CANOPY_T[1] + CANOPY_MARGIN && q.d < halfWidth + 3;
}
