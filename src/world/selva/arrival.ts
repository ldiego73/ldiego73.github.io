/**
 * Where the traveler arrives in the Antisuyu and where the return punku stands. Pure constants shared by the
 * runtime (spawn) and ambient/punku.ts (the doorway back to the Qhapaq Ñan).
 *
 * The road runs west → east (t 0 → 1, about 830 u long). The punku straddles the road near its west end,
 * facing east; the traveler appears a few steps east of it, already through the doorway and facing east,
 * beside the "puerto" station plaza (t 0.02), about 14 u from the punku: outside its prompt radius (a stray E
 * right after loading never sends the traveler straight back), and far enough that the camera arm starts clear of
 * the doorway.
 */

/** Road t of the punku (doorway across the road). */
export const PUNKU_T = 0.003;
/** Road t of the arrival spawn (east of the punku). */
export const SPAWN_T = 0.02;
/** Within this distance of the punku centre the "back to the mountain" prompt shows. */
export const PUNKU_PROMPT_R = 4.2;
