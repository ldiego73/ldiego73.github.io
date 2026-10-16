/**
 * Procedural model of the hidden Ekeko (../ekeko.ts): a small statuette (≈ 0.47 u tall) of the Andean god of
 * abundance (a chubby, smiling, mustached man in a chullo with earflaps, arms open, loaded with miniatures:
 * sacks of food, a little house on his back, banknotes, a clay pot and a charango), standing on a striped
 * aguayo cloth over a wooden fruit crate. Two vertex-coloured geometries from the coast kit (../../kit.ts Geo):
 * the crate (static) and the statuette (it bounces), so the whole find costs two draw calls plus the sparkle.
 * Both are built at their own origin (feet / crate base at y 0, facing +Z); the caller places them.
 */
import type * as THREE from "three";
import { Geo } from "../../kit";
import { CRATE_H } from "./logic";

const SKIN = "#c98d5c";
const INK = "#2a1d17";
const VEST = "#b8323a";
const SHIRT = "#efe6d6";
const PANTS = "#3a3a52";
const OCHRE = "#dda63c";
const TURQ = "#2a9d8f";
const SACK = "#d9c49a";
const CLAY = "#a24a32";
const BILL = "#6f9a52";
const WOOD = "#8a6440";
const WOOD_DARK = "#5e4128";

/** The crate the Ekeko stands on, with a folded aguayo on top (its top surface at CRATE_H + 0.02). */
export function buildCrate(): THREE.BufferGeometry {
  const g = new Geo();
  const w = 0.62;
  const d = 0.46;
  const h = CRATE_H;
  // Slatted sides: a dark core and lighter slats with gaps.
  g.box(w - 0.04, h - 0.02, d - 0.04, 0, 0, 0, WOOD_DARK);
  for (const y of [0.04, 0.2, 0.36]) for (const sz of [-1, 1]) g.box(w, 0.11, 0.025, 0, y, (sz * d) / 2, WOOD);
  for (const y of [0.04, 0.2, 0.36]) for (const sx of [-1, 1]) g.box(0.025, 0.11, d, (sx * w) / 2, y, 0, WOOD);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.box(0.05, h, 0.05, (sx * (w - 0.04)) / 2, 0, (sz * (d - 0.04)) / 2, WOOD_DARK);
  // The aguayo: a striped cloth folded on the lid, hanging a little over the front.
  const stripes = ["#c4383f", OCHRE, TURQ, "#3446a6", "#c4383f"];
  stripes.forEach((c, i) => {
    g.box(0.44, 0.02, 0.07, 0, h, -0.14 + i * 0.07, c);
  });
  g.box(0.44, 0.1, 0.012, 0, h - 0.08, 0.2, "#c4383f");
  // Two limes beside him, as if left with the fruit.
  g.blob(0.035, 0.035, 0.035, 0.22, h + 0.05, 0.13, "#8fae3a", 0);
  g.blob(0.035, 0.035, 0.035, 0.25, h + 0.05, 0.05, "#7a8a3a", 0);
  return g.build();
}

/** The statuette, feet at y 0 facing +Z. Returns its geometry and where its sparkle sits (local). */
export function buildEkeko(): { geo: THREE.BufferGeometry; glint: { x: number; y: number; z: number } } {
  const g = new Geo();
  // Round plinth.
  g.cyl(0.1, 0.105, 0.025, 0, 0, 0, WOOD_DARK, 12);
  const y0 = 0.025;
  // Shoes and short legs.
  for (const sx of [-1, 1]) {
    g.blob(0.028, 0.018, 0.04, sx * 0.035, y0 + 0.015, 0.012, INK, 0);
    g.cyl(0.026, 0.028, 0.08, sx * 0.035, y0 + 0.02, 0, PANTS, 6);
  }
  // A round body: red vest over a white shirt, a belly that shows.
  g.blob(0.088, 0.1, 0.074, 0, y0 + 0.17, 0, VEST, 1);
  g.blob(0.05, 0.065, 0.03, 0, y0 + 0.15, 0.052, SHIRT, 1);
  // Scarf at the neck.
  g.cyl(0.05, 0.056, 0.026, 0, y0 + 0.245, 0, OCHRE, 10);
  // Arms open, a little forward and up (sleeves from the shoulders to the hands).
  const hands: Array<[number, number, number]> = [];
  for (const sx of [-1, 1]) {
    const sh = { x: sx * 0.07, y: y0 + 0.23, z: 0 };
    const hd = { x: sx * 0.165, y: y0 + 0.27, z: 0.045 };
    g.stick(sh, hd, 0.022, SHIRT, 6);
    g.blob(0.024, 0.024, 0.024, hd.x, hd.y, hd.z, SKIN, 0);
    hands.push([hd.x, hd.y, hd.z]);
  }
  // Head: round, smiling, with a big black mustache.
  const hy = y0 + 0.31;
  g.blob(0.06, 0.062, 0.058, 0, hy, 0, SKIN, 1);
  g.blob(0.016, 0.014, 0.014, 0, hy - 0.005, 0.058, "#b57a4c", 0);
  for (const sx of [-1, 1]) {
    // Mustache: two thick tilted bars curling up at the ends.
    g.box(0.04, 0.014, 0.014, sx * 0.02, hy - 0.026, 0.052, INK, sx * -0.35, 0, sx * 0.3);
    // Eyes and rosy cheeks.
    g.blob(0.008, 0.009, 0.006, sx * 0.022, hy + 0.016, 0.053, INK, 0);
    g.blob(0.013, 0.01, 0.006, sx * 0.036, hy - 0.006, 0.047, "#d9705a", 0);
  }
  // Smile under the mustache.
  g.box(0.026, 0.006, 0.006, 0, hy - 0.04, 0.053, "#7a2a22");
  // Chullo: a striped cone with earflaps, tassels and a pompom.
  const cy = hy + 0.035;
  g.cyl(0.064, 0.064, 0.02, 0, cy - 0.01, 0, OCHRE, 12);
  g.cyl(0.01, 0.062, 0.085, 0, cy + 0.01, 0, "#c4383f", 12);
  g.cyl(0.045, 0.05, 0.014, 0, cy + 0.035, 0, TURQ, 12);
  g.blob(0.018, 0.018, 0.018, 0, cy + 0.1, 0, SHIRT, 0);
  for (const sx of [-1, 1]) {
    g.box(0.014, 0.05, 0.032, sx * 0.058, cy - 0.055, 0, "#c4383f");
    g.cyl(0.004, 0.004, 0.035, sx * 0.058, cy - 0.11, 0, OCHRE, 4);
  }
  // Miniatures. A little adobe house with a tile roof on his back.
  g.box(0.075, 0.06, 0.055, 0, y0 + 0.21, -0.1, "#efe2c8");
  g.box(0.06, 0.008, 0.075, -0.02, y0 + 0.285, -0.1, CLAY, 0, 0, 0.55);
  g.box(0.06, 0.008, 0.075, 0.02, y0 + 0.285, -0.1, CLAY, 0, 0, -0.55);
  g.box(0.016, 0.03, 0.004, 0, y0 + 0.21, -0.072, "#7a5233");
  // Sacks of food hanging round his body (rice, sugar, flour, coca), tied at the neck.
  const sacks: Array<[number, number, number, number]> = [
    [-0.09, 0.12, 0.035, 0.032],
    [0.092, 0.115, 0.03, 0.03],
    [-0.055, 0.075, 0.07, 0.026],
    [0.06, 0.08, 0.068, 0.026],
    [-0.08, 0.17, -0.06, 0.03],
    [0.08, 0.165, -0.062, 0.03],
  ];
  sacks.forEach(([x, y, z, r], i) => {
    g.blob(r, r * 1.15, r * 0.9, x, y0 + y, z, i % 3 === 2 ? "#8fae3a" : SACK, 0);
    g.cyl(r * 0.35, r * 0.45, r * 0.4, x, y0 + y + r * 1.05, z, i % 2 ? OCHRE : "#c4383f", 5);
  });
  // A clay pot hanging at his side.
  g.cyl(0.026, 0.02, 0.04, 0.125, y0 + 0.17, -0.01, CLAY, 8);
  g.cyl(0.016, 0.026, 0.012, 0.125, y0 + 0.21, -0.01, "#b4553a", 8);
  // Banknotes fanned in his right hand and a couple pinned to the vest.
  const [rx, ry, rz] = hands[1] as [number, number, number];
  for (let i = 0; i < 3; i++)
    g.box(
      0.045,
      0.028,
      0.003,
      rx + 0.012,
      ry + 0.012 + i * 0.006,
      rz + 0.004 * i,
      BILL,
      0.2 * i - 0.2,
      0,
      0.35 - i * 0.2,
    );
  g.box(0.036, 0.022, 0.003, -0.035, y0 + 0.205, 0.07, BILL, 0, -0.2, 0.25);
  g.box(0.036, 0.022, 0.003, 0.03, y0 + 0.215, 0.071, "#8bb36a", 0, -0.2, -0.3);
  // A charango in his left hand: a small rounded body and a neck with a pegbox.
  const [lx, ly, lz] = hands[0] as [number, number, number];
  g.blob(0.028, 0.038, 0.012, lx - 0.006, ly - 0.04, lz + 0.022, "#9a6a3a", 0);
  g.stick(
    { x: lx - 0.006, y: ly - 0.01, z: lz + 0.022 },
    { x: lx + 0.01, y: ly + 0.07, z: lz + 0.022 },
    0.006,
    WOOD_DARK,
    4,
  );
  g.box(0.014, 0.022, 0.008, lx + 0.012, ly + 0.07, lz + 0.022, WOOD_DARK);
  // The sparkle sits on the banknotes (money catches the light).
  return { geo: g.build(), glint: { x: rx + 0.012, y: ry + 0.03, z: rz + 0.01 } };
}
