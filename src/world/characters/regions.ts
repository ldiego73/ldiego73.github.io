/**
 * Where each cloth's pattern lives in the shared cloth atlas (./patterns.ts draws it there): UV rectangles
 * [u0, v0, u1, v1] with v0 the pinned edge (row 0 of the cloth grid) and v1 the free hem. Pure data, shared by
 * the archetypes (pure) and the canvas painter (DOM).
 */
export const REGION = {
  poncho: [0, 1, 1, 2 / 3] as [number, number, number, number],
  pollera: [0, 2 / 3, 1, 1 / 3] as [number, number, number, number],
  lliclla: [0, 1 / 3, 1, 0] as [number, number, number, number],
};
