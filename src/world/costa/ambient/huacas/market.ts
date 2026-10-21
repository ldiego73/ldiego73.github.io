/**
 * The fishermen's market of Huanchaco (the artifacts station): five cane-and-reed stalls round its plaza on the
 * terrace above the beach, one per cross-company artifact of src/data/career.ts ARTIFACTS, each with an awning in
 * the artifact's dye and an everyday load of the coast on its counter (fish baskets, gourds, pots, folded
 * cloth, fruit). A stall is built at its own origin facing +Z (its counter side); the caller places it.
 */
import type { Geo } from "../../kit";

export interface Stall {
  /** Index into ARTIFACTS. */
  i: number;
}

/** The stalls round the market plaza (local frame of the station): an arc on the sea side, facing its centre. */
export const STALLS: ReadonlyArray<{ x: number; z: number; yaw: number }> = [-1.25, -0.62, 0, 0.62, 1.25].map((a) => {
  const r = 9.6;
  const x = Math.sin(a) * r;
  const z = -Math.cos(a) * r - 1;
  // Facing the plaza centre (models face +Z).
  return { x, z, yaw: Math.atan2(-x, -1 - z) };
});

const CANE_DARK = "#8a6a3a";
const MAT = "#c9b06a";
const WOOD = "#7a5233";

export function buildStall(g: Geo, s: Stall, dye: string) {
  const x = 0;
  const z = 0;
  const y = 0;
  const w = 3.4;
  const d = 2.4;
  const hf = 2.6;
  const hb = 2.15;
  // Posts (to below the sand), front higher than back.
  for (const sx of [-1, 1])
    for (const [sz, h] of [
      [1, hf],
      [-1, hb],
    ] as const)
      g.cyl(0.07, 0.08, h + 0.6, x + (sx * w) / 2, y - 0.6, z + (sz * d) / 2, CANE_DARK, 5);
  // Sloping reed-mat roof and its edge.
  const ang = Math.atan2(hf - hb, d);
  g.box(w + 0.5, 0.12, Math.hypot(d, hf - hb) + 0.5, x, y + (hf + hb) / 2 - 0.06, z, MAT, 0, -ang);
  // Awning cloth along the front, in the artifact's dye, with a lighter fringe: cloth hanging from the roof's
  // edge (flex 0 at the top → 1 at the fringe), so it ripples in the sea wind.
  g.cloth = { axis: "y", pinned: y + hf - 0.03, free: y + hf - 0.52 };
  g.box(w + 0.4, 0.42, 0.06, x, y + hf - 0.45, z + d / 2 + 0.28, dye);
  g.box(w + 0.4, 0.07, 0.07, x, y + hf - 0.52, z + d / 2 + 0.29, "#efe6d6");
  g.cloth = null;
  // Counter: a plank table on trestles.
  g.box(w - 0.2, 0.1, 0.9, x, y + 0.85, z + d / 2 - 0.45, WOOD);
  for (const sx of [-1, 1]) g.box(0.1, 0.85, 0.8, x + sx * (w / 2 - 0.35), y, z + d / 2 - 0.45, "#5a3b24");
  // Goods: a different everyday load per stall.
  const cz = z + d / 2 - 0.45;
  const top = y + 0.95;
  switch (s.i % 5) {
    case 0: // fish in reed baskets
      for (const dx of [-1, 0, 1]) {
        g.cyl(0.42, 0.34, 0.3, x + dx, top, cz, "#a88a4a", 8);
        for (const k of [-0.15, 0.12]) g.box(0.5, 0.08, 0.14, x + dx, top + 0.3, cz + k, "#9fb6c4", 0.3);
      }
      break;
    case 1: // gourds (mates burilados) and calabashes
      for (const dx of [-1.1, -0.4, 0.3, 1])
        g.blob(0.22, 0.2, 0.22, x + dx, top + 0.2, cz, dx > 0 ? "#c9a24a" : "#b08a3a", 1);
      break;
    case 2: // clay pots
      for (const dx of [-1, 0, 1]) {
        g.cyl(0.26, 0.2, 0.5, x + dx, top, cz, "#b4553a", 8);
        g.cyl(0.14, 0.22, 0.12, x + dx, top + 0.5, cz, "#a24a32", 8);
      }
      break;
    case 3: // folded cloth
      for (const [dx, c] of [
        [-1, "#c4383f"],
        [-0.3, "#2a9d8f"],
        [0.4, "#dda63c"],
        [1.05, "#3446a6"],
      ] as const)
        g.box(0.6, 0.18, 0.55, x + dx, top, cz, c);
      break;
    default: // fruit: lúcuma, chirimoya, limes
      for (let k = 0; k < 9; k++)
        g.blob(
          0.12,
          0.12,
          0.12,
          x - 1 + (k % 3) * 0.32 + Math.floor(k / 3) * 0.7,
          top + 0.12,
          cz + ((k % 2) - 0.5) * 0.25,
          k % 3 === 0 ? "#8fae3a" : k % 3 === 1 ? "#d9a441" : "#7a8a3a",
          0,
        );
  }
  // A woven mat on the sand in front.
  g.box(2.2, 0.03, 1.2, x, y + 0.02, z + d / 2 + 1, "#b39a58");
}
