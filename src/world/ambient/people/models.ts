/**
 * Procedural models for the Andean people: campesinos, vendors, shoppers, children and dancers.
 * Proportions follow the chasqui NPCs (legs pivot at 0.55, shoulders at 1.02, head top ≈ 1.6 before scale).
 * Clothing is drawn from everyday highland dress, without caricature:
 *  - men: knee-length bayeta trousers, a square poncho with warp stripes over the shoulders, ojotas, and a
 *    chullo (knitted cap with ear flaps) or a felt hat;
 *  - women: a jacket (jobona / blouse), layered pollera with woven hem bands, a lliclla shawl pinned with a
 *    tupu, two long braids, and a montera (flat Cusco hat) or a felt hat.
 * Colors come from palette slots so one geometry dresses many people (see rig.ts).
 */
import * as THREE from "three";
import { DYE } from "../../palette";
import { type Paint, Part, type PartSpec, type Protos, protos, S_ACC, S_ALT, S_MAIN, S_SKIN } from "./rig";

const INK = "#1f1a17";
const HAIR = "#1d1512";
const SANDAL = "#2f2723";
const WOOD = "#7a5233";
const WOOD_D = "#5e3b22";
const FELT = "#3b2c25";
const SILVER = "#cfd3d6";

// ---------------------------------------------------------------- shared bits

function face(p: Part, P: Protos, y = 0.2) {
  p.add(P.sph, S_SKIN, 0, y, 0, 0, 0, 0, 0.2, 0.21, 0.195);
  for (const s of [-1, 1]) {
    p.add(P.sph, INK, 0.072 * s, y - 0.02, 0.185, 0, 0, 0, 0.022, 0.03, 0.012);
    p.add(P.box, HAIR, 0.075 * s, y + 0.035, 0.183, 0, 0, 0.12 * s, 0.07, 0.014, 0.012);
    p.add(P.sph, S_SKIN, 0.198 * s, y - 0.01, 0, 0, 0, 0, 0.035, 0.05, 0.03);
  }
  p.add(P.sph, S_SKIN, 0, y - 0.065, 0.2, 0, 0, 0, 0.034, 0.04, 0.03);
  p.add(P.box, "#7a3e2a", 0, y - 0.125, 0.183, 0, 0, 0, 0.06, 0.012, 0.01);
}

function sandal(p: Part, P: Protos, y: number) {
  p.add(P.box, SANDAL, 0, y, 0.035, 0, 0, 0, 0.13, 0.05, 0.23);
  p.add(P.box, SANDAL, 0, y + 0.045, 0.02, 0, 0, 0, 0.135, 0.02, 0.04);
}

/** A thin band that follows a frustum face (front/back of a poncho). */
function slopedStripe(
  p: Part,
  P: Protos,
  paint: Paint,
  x: number,
  yTop: number,
  yBot: number,
  zTop: number,
  zBot: number,
  w: number,
  side: 1 | -1,
) {
  const h = yTop - yBot;
  const dz = zBot - zTop;
  const len = Math.hypot(h, dz);
  const ang = Math.atan2(dz, h);
  p.add(P.box, paint, x, (yTop + yBot) / 2, side * ((zTop + zBot) / 2 + 0.006), side * ang, 0, 0, w, len, 0.012);
}

// ---------------------------------------------------------------- men

function manLeg(P: Protos) {
  const p = new Part();
  p.add(P.cap, S_ALT, 0, -0.17, 0, 0, 0, 0, 0.088, 0.2, 0.088);
  p.add(P.cyl, S_ALT, 0, -0.32, 0, 0, 0, 0, 0.083, 0.04, 0.083);
  p.add(P.cap, S_SKIN, 0, -0.42, 0, 0, 0, 0, 0.058, 0.1, 0.058);
  sandal(p, P, -0.52);
  return p.build();
}

const PONCHO_GEO = new THREE.CylinderGeometry(0.55, 1, 1, 4, 1);
PONCHO_GEO.rotateY(Math.PI / 4);

function manTorso(P: Protos) {
  const p = new Part();
  // Shirt / waist under the poncho, neck.
  p.add(P.cyl, S_ALT, 0, 0.02, 0, 0, 0, 0, 0.19, 0.16, 0.15);
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.07, 0.1, 0.07);
  // Square poncho: frustum from the shoulders to mid-thigh, rounded shoulder drape on top.
  const yT = 0.5;
  const yB = -0.1;
  const sx = 0.5;
  const sz = 0.37;
  p.add(PONCHO_GEO, S_MAIN, 0, (yT + yB) / 2, 0, 0, 0, 0, sx, yT - yB, sz);
  p.add(P.sph, S_MAIN, 0, 0.46, 0, 0, 0, 0, 0.3, 0.1, 0.205);
  // Warp stripes running over the shoulders (front and back) + woven hem.
  const a = Math.SQRT1_2;
  const zt = sz * 0.55 * a;
  const zb = sz * a;
  for (const side of [1, -1] as const)
    for (const x of [-0.13, -0.09, 0.09, 0.13]) {
      const w = Math.abs(x) > 0.1 ? 0.018 : 0.03;
      slopedStripe(p, P, Math.abs(x) > 0.1 ? DYE.cotton : S_ACC, x, yT - 0.04, yB + 0.02, zt, zb, w, side);
    }
  p.add(PONCHO_GEO, S_ACC, 0, yB + 0.025, 0, 0, 0, 0, sx * 1.01, 0.05, sz * 1.01);
  // Fringe under the hem (short tufts).
  for (let i = -3; i <= 3; i++)
    for (const s of [-1, 1]) p.add(P.box, S_ACC, i * 0.05, yB - 0.035, s * zb * 0.98, 0, 0, 0, 0.018, 0.05, 0.012);
  return p.build();
}

function manArm(P: Protos) {
  const p = new Part();
  p.add(P.cap, S_MAIN, 0, -0.07, 0, 0, 0, 0, 0.075, 0.08, 0.075);
  p.add(P.cap, S_ALT, 0, -0.2, 0, 0, 0, 0, 0.058, 0.16, 0.058);
  p.add(P.sph, S_SKIN, 0, -0.37, 0.01, 0, 0, 0, 0.062, 0.066, 0.062);
  return p.build();
}

function manHead(P: Protos) {
  const p = new Part();
  face(p, P);
  p.add(P.halfSph, HAIR, 0, 0.215, -0.02, -0.35, 0, 0, 0.212, 0.2, 0.21);
  return p.build();
}

// ---------------------------------------------------------------- women

/** Layered pollera on the hips bone (does not lean with the torso). */
function womanSkirt(P: Protos) {
  const p = new Part();
  const yT = 0.66;
  const yB = 0.17;
  p.add(P.flare, S_MAIN, 0, (yT + yB) / 2, 0, 0, 0, 0, 0.34, yT - yB, 0.3);
  // Woven hem bands (the top layer) and a glimpse of the under-layer.
  p.add(P.flare, S_ACC, 0, yB + 0.07, 0, 0, 0, 0, 0.343, 0.05, 0.303);
  p.add(P.flare, DYE.cotton, 0, yB + 0.12, 0, 0, 0, 0, 0.334, 0.018, 0.295);
  p.add(P.flare, S_ALT, 0, yB - 0.015, 0, 0, 0, 0, 0.35, 0.03, 0.31);
  // Chumpi (woven belt) at the waist.
  p.add(P.cyl, S_ACC, 0, yT - 0.02, 0, 0, 0, 0, 0.215, 0.06, 0.19);
  return p.build();
}

function womanTorso(P: Protos) {
  const p = new Part();
  // Jacket (jobona) with trim, neck.
  p.add(P.cyl, S_ALT, 0, 0.27, 0, 0, 0, 0, 0.19, 0.48, 0.15);
  p.add(P.sph, S_ALT, 0, 0.44, 0, 0, 0, 0, 0.24, 0.1, 0.16);
  p.add(P.box, S_ACC, 0, 0.27, 0.152, 0, 0, 0, 0.05, 0.4, 0.01);
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.065, 0.1, 0.065);
  // Lliclla over the shoulders (a woven shawl), pinned in front with a silver tupu.
  p.add(P.flare, S_ACC, 0, 0.41, -0.01, 0, 0, 0, 0.28, 0.18, 0.21);
  p.add(P.flare, DYE.cotton, 0, 0.335, -0.01, 0, 0, 0, 0.283, 0.02, 0.212);
  p.add(P.flare, S_MAIN, 0, 0.36, -0.01, 0, 0, 0, 0.282, 0.025, 0.211);
  p.add(P.cyl6, SILVER, 0, 0.42, 0.205, 0.4, 0, 0, 0.02, 0.12, 0.02);
  p.add(P.lowSph, SILVER, 0, 0.48, 0.21, 0, 0, 0, 0.035, 0.035, 0.02);
  return p.build();
}

function womanArm(P: Protos) {
  const p = new Part();
  p.add(P.cap, S_ACC, 0, -0.06, 0, 0, 0, 0, 0.072, 0.06, 0.072);
  p.add(P.cap, S_ALT, 0, -0.19, 0, 0, 0, 0, 0.056, 0.17, 0.056);
  p.add(P.cyl, S_ACC, 0, -0.31, 0, 0, 0, 0, 0.06, 0.03, 0.06);
  p.add(P.sph, S_SKIN, 0, -0.37, 0.01, 0, 0, 0, 0.06, 0.064, 0.06);
  return p.build();
}

function womanHead(P: Protos) {
  const p = new Part();
  face(p, P);
  p.add(P.halfSph, HAIR, 0, 0.215, -0.012, -0.22, 0, 0, 0.214, 0.215, 0.212);
  p.add(P.box, "#3a2a22", 0, 0.405, 0.06, -0.5, 0, 0, 0.012, 0.004, 0.16);
  // Two long braids down the back, tied with woven ends.
  for (const s of [-1, 1]) {
    p.add(P.cap, HAIR, 0.09 * s, -0.08, -0.17, 0.12, 0, 0.05 * s, 0.042, 0.36, 0.042);
    p.add(P.lowSph, S_ACC, 0.095 * s, -0.33, -0.2, 0, 0, 0, 0.035, 0.05, 0.035);
    p.add(P.cyl6, S_ACC, 0.095 * s, -0.4, -0.205, 0, 0, 0, 0.012, 0.1, 0.012);
  }
  return p.build();
}

// ---------------------------------------------------------------- hats

function chullo(P: Protos) {
  const p = new Part();
  p.add(P.halfSph, S_ACC, 0, 0.22, -0.005, 0, 0, 0, 0.222, 0.27, 0.218);
  p.add(P.cone, S_ACC, 0, 0.52, -0.03, -0.2, 0, 0, 0.09, 0.14, 0.09);
  // Knitted bands (diamond rows read as stripes at this scale).
  p.add(P.cyl, DYE.cotton, 0, 0.3, -0.005, 0, 0, 0, 0.224, 0.03, 0.22);
  p.add(P.cyl, S_MAIN, 0, 0.36, -0.005, 0, 0, 0, 0.205, 0.025, 0.2);
  p.add(P.cyl, DYE.cotton, 0, 0.41, -0.005, 0, 0, 0, 0.18, 0.02, 0.175);
  p.add(P.lowSph, S_MAIN, 0, 0.6, -0.06, 0, 0, 0, 0.04, 0.05, 0.04);
  // Ear flaps with braided ties.
  for (const s of [-1, 1]) {
    p.add(P.box, S_ACC, 0.2 * s, 0.13, 0, 0, 0, 0.12 * s, 0.04, 0.17, 0.13);
    p.add(P.cyl6, S_MAIN, 0.205 * s, -0.03, 0.01, 0, 0, 0, 0.012, 0.16, 0.012);
    p.add(P.lowSph, DYE.cotton, 0.205 * s, -0.12, 0.01, 0, 0, 0, 0.026, 0.03, 0.026);
  }
  return p.build();
}

function montera(P: Protos, festive: boolean) {
  const p = new Part();
  // Flat, wide Cusco montera: dark crown band, red-lined brim with a woven edge.
  p.add(P.cyl, festive ? S_MAIN : FELT, 0, 0.36, 0, 0, 0, 0, 0.36, 0.045, 0.36);
  p.add(P.cyl, S_ACC, 0, 0.335, 0, 0, 0, 0, 0.365, 0.02, 0.365);
  p.add(P.cyl, festive ? S_ACC : FELT, 0, 0.42, 0, 0, 0, 0, 0.19, 0.09, 0.19);
  p.add(P.cyl, DYE.cotton, 0, 0.465, 0, 0, 0, 0, 0.13, 0.015, 0.13);
  if (festive) {
    // Fringe of beads and ribbons around the brim.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const c = [DYE.ochre, DYE.cotton, DYE.turq, DYE.red][i % 4] as string;
      p.add(P.cyl6, c, Math.sin(a) * 0.35, 0.27, Math.cos(a) * 0.35, 0, 0, 0, 0.012, 0.13, 0.012);
      p.add(P.lowSph, c, Math.sin(a) * 0.35, 0.2, Math.cos(a) * 0.35, 0, 0, 0, 0.022, 0.022, 0.022);
    }
  }
  return p.build();
}

function sombrero(P: Protos) {
  const p = new Part();
  p.add(P.cyl, FELT, 0, 0.35, 0, 0, 0, 0, 0.31, 0.025, 0.31);
  p.add(P.cyl, FELT, 0, 0.44, 0, 0, 0, 0, 0.165, 0.17, 0.165);
  p.add(P.cyl, S_ACC, 0, 0.385, 0, 0, 0, 0, 0.17, 0.04, 0.17);
  p.add(P.sph, FELT, 0, 0.52, 0, 0, 0, 0, 0.16, 0.035, 0.16);
  return p.build();
}

// ---------------------------------------------------------------- carried things

/** Chakitaqlla (Andean foot plough): long shaft, foot peg, narrow blade. Origin at the blade tip. */
function chakitaqlla(P: Protos) {
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, 0.82, 0, 0, 0, 0, 0.028, 1.4, 0.028);
  p.add(P.cyl6, WOOD, 0, 1.6, -0.04, -0.35, 0, 0, 0.026, 0.25, 0.026);
  // Foot peg lashed with a cord.
  p.add(P.box, WOOD_D, 0.07, 0.36, 0, 0, 0, 0, 0.16, 0.04, 0.05);
  p.add(P.cyl6, DYE.cotton, 0, 0.39, 0, 0, 0, 0, 0.034, 0.05, 0.034);
  // Blade.
  p.add(P.box, "#5d5a56", 0, 0.08, 0.01, 0, 0, 0, 0.07, 0.18, 0.03);
  p.add(P.cone, "#5d5a56", 0, -0.03, 0.01, Math.PI, 0, 0, 0.04, 0.06, 0.02);
  p.add(P.cyl6, "#3d2c22", 0, 0.18, 0, 0, 0, 0, 0.036, 0.06, 0.036);
  return p.build();
}

/** Q'ipi: a load wrapped in a lliclla, carried on the back, the ends knotted at the chest. */
function bundle(P: Protos) {
  const p = new Part();
  // The load: a soft rounded block (box + rounded ends) wrapped in a striped lliclla.
  const z = -0.32;
  p.add(P.box, S_ACC, 0, 0.27, z, 0.1, 0, 0, 0.44, 0.34, 0.22);
  for (const s of [-1, 1]) p.add(P.cap, S_ACC, 0.2 * s, 0.27, z, 0.1, 0, 0, 0.11, 0.12, 0.11);
  p.add(P.box, S_ACC, 0, 0.27, z, 0.1, 0, 0, 0.38, 0.4, 0.2);
  // Warp stripes of the cloth (bands across the load).
  const bands: Array<[number, Paint]> = [
    [0.15, DYE.cotton],
    [0.21, S_MAIN],
    [0.33, S_MAIN],
    [0.39, DYE.cotton],
  ];
  for (const [y, c] of bands) p.add(P.box, c, 0, y, z + (y - 0.27) * -0.1, 0.1, 0, 0, 0.452, 0.03, 0.228);
  // Ends knotted over the shoulders and at the chest.
  for (const s of [-1, 1]) p.add(P.box, S_ACC, 0.12 * s, 0.43, 0.02, 0.35, 0, -0.55 * s, 0.06, 0.035, 0.46);
  p.add(P.lowSph, S_ACC, 0, 0.36, 0.2, 0, 0, 0, 0.065, 0.055, 0.045);
  return p.build();
}

/** Seed pouch worn at the front (sowing). */
function seedPouch(P: Protos) {
  const p = new Part();
  p.add(P.sph, S_ACC, 0.08, 0.06, 0.2, 0, 0, 0, 0.13, 0.11, 0.08);
  p.add(P.box, DYE.cotton, 0.08, 0.14, 0.22, 0, 0, 0, 0.2, 0.02, 0.06);
  p.add(P.box, S_MAIN, 0, 0.3, 0.17, 0, 0, 0.7, 0.03, 0.6, 0.015);
  return p.build();
}

/** Woven basket in the right hand with potatoes. Origin at the hand. */
function basket(P: Protos) {
  const p = new Part();
  p.add(P.torus, "#b8873f", 0, -0.02, 0, 0, Math.PI / 2, 0, 0.13, 0.13, 0.13);
  p.add(P.flare, "#c99a55", 0, -0.22, 0, Math.PI, 0, 0, 0.17, 0.16, 0.15);
  p.add(P.cyl, "#a5743a", 0, -0.16, 0, 0, 0, 0, 0.16, 0.02, 0.145);
  for (let i = 0; i < 4; i++)
    p.add(
      P.lowSph,
      i % 2 ? "#7a4f3a" : "#a8705a",
      -0.07 + i * 0.045,
      -0.15,
      (i % 2) * 0.05 - 0.02,
      0,
      0,
      0,
      0.045,
      0.04,
      0.04,
    );
  return p.build();
}

/** White handkerchief (dancers): hangs from the hand. */
function panuelo(P: Protos) {
  const p = new Part();
  p.add(P.box, DYE.cotton, 0, -0.1, 0.03, 0, 0, 0.2, 0.2, 0.2, 0.012);
  p.add(P.box, S_ACC, 0.02, -0.2, 0.03, 0, 0, 0.2, 0.2, 0.02, 0.013);
  return p.build();
}

// ---------------------------------------------------------------- catalogue

export type PartName =
  | "leg"
  | "m:torso"
  | "m:arm"
  | "m:head"
  | "w:skirt"
  | "w:torso"
  | "w:arm"
  | "w:head"
  | "chullo"
  | "montera"
  | "montera-fiesta"
  | "sombrero"
  | "chakitaqlla"
  | "bundle"
  | "pouch"
  | "basket"
  | "panuelo";

const BUILDERS: Record<PartName, { bone: PartSpec["bone"]; make: (P: Protos) => THREE.BufferGeometry }> = {
  leg: { bone: "leg", make: manLeg },
  "m:torso": { bone: "torso", make: manTorso },
  "m:arm": { bone: "arm", make: manArm },
  "m:head": { bone: "head", make: manHead },
  "w:skirt": { bone: "hips", make: womanSkirt },
  "w:torso": { bone: "torso", make: womanTorso },
  "w:arm": { bone: "arm", make: womanArm },
  "w:head": { bone: "head", make: womanHead },
  chullo: { bone: "head", make: chullo },
  montera: { bone: "head", make: (P) => montera(P, false) },
  "montera-fiesta": { bone: "head", make: (P) => montera(P, true) },
  sombrero: { bone: "head", make: sombrero },
  chakitaqlla: { bone: "tool", make: chakitaqlla },
  bundle: { bone: "torso", make: bundle },
  pouch: { bone: "torso", make: seedPouch },
  basket: { bone: "handR", make: basket },
  panuelo: { bone: "handR", make: panuelo },
};

/** Legs are shared: under a pollera only the calf and the ojota show. */
export const MAN: readonly PartName[] = ["leg", "m:torso", "m:arm", "m:head"];
export const WOMAN: readonly PartName[] = ["leg", "w:skirt", "w:torso", "w:arm", "w:head"];
export const ALL_PARTS = Object.keys(BUILDERS) as PartName[];
/** Parts that cast shadows (the big shapes; hands, hats and tools don't need their own). */
export const SHADOW_PARTS: ReadonlySet<string> = new Set(["leg", "m:torso", "w:torso", "w:skirt", "m:head", "w:head"]);

/** Fresh geometries for the named parts (each crowd owns its own: instance attributes live on them). */
export function partSpecs(names: Iterable<PartName>): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [];
  for (const name of new Set(names)) {
    const b = BUILDERS[name];
    out.push({ name, bone: b.bone, geo: b.make(P) });
  }
  for (const g of Object.values(P)) g.dispose();
  return out;
}

// ---------------------------------------------------------------- outfits (palettes)

export const SKINS = ["#9a6440", "#b9764a", "#8e5a38", "#a86a42", "#c08458", "#9b6239", "#b47a50", "#a56b45"];
/** Poncho fields: cochineal reds, alpaca browns, deep indigo, natural grey. */
export const PONCHOS = ["#9e2f33", "#8a3a2c", "#7d5137", "#2f3a6b", "#6e6258", "#b0453a"];
/** Polleras: dyed bayeta in bright natural-dye colors. */
export const POLLERAS = ["#c2456b", DYE.indigo, DYE.turq, "#3f7f4a", "#d0663a", "#8a2f6a", DYE.red];
/** Weaves / accents (lliclla, chullo, hem bands). */
export const WEAVES = [DYE.red, DYE.ochre, DYE.turq, "#c2456b", DYE.indigo, "#e07a3a"];
/** Trousers / jackets. */
export const DARKS = ["#2a2420", "#2f3557", "#3b3330", "#4a3a2e", "#22262f"];
export const FESTIVE = ["#d6303a", "#e8b631", "#e0457b", "#2a9d8f", "#3446a6", "#ff8a3d"];

// ---------------------------------------------------------------- static props (stalls, fire)

/** Merged vertex-colored static geometry (no palette). */
export class Static {
  readonly p = new Part();
  readonly P = protos();
  build() {
    const g = this.p.build();
    g.deleteAttribute("aSlot");
    for (const k of Object.values(this.P)) k.dispose();
    return g;
  }
}

/** Seeded random. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export type StallKind = "textiles" | "produce" | "pottery";

/**
 * One market stall in local space (origin at the stall center, +Z toward the shoppers):
 * a wooden frame with a cotton awning and goods on a low table or a manta on the ground.
 * `y(x, z)` gives local ground offsets so posts reach the terrain.
 */
export function stall(s: Static, kind: StallKind, seed: number, m: THREE.Matrix4, y: (x: number, z: number) => number) {
  const R = rng(seed);
  const P = s.P;
  s.p.post = m;
  const add = (...a: Parameters<Part["add"]>) => s.p.add(...a);
  const W = 1.9;
  const D = 1.1;
  const H = 2.05;
  // Frame: four posts, awning sloping toward the front, striped cloth.
  for (const [x, z, h] of [
    [-W / 2, -D / 2, H + 0.15],
    [W / 2, -D / 2, H + 0.15],
    [-W / 2, D / 2, H - 0.15],
    [W / 2, D / 2, H - 0.15],
  ] as const) {
    const g = y(x, z);
    add(P.cyl6, WOOD_D, x, g + h / 2 - 0.2, z, 0, 0, 0, 0.045, h + 0.4, 0.045);
  }
  const awn = kind === "pottery" ? DYE.ochre : kind === "produce" ? DYE.cotton : DYE.turq;
  const stripe = kind === "pottery" ? DYE.red : kind === "produce" ? DYE.red : DYE.cotton;
  const slope = Math.atan2(0.3, D);
  add(P.box, awn, 0, H + 0.02, 0, slope, 0, 0, W + 0.35, 0.04, D + 0.35);
  for (let i = -2; i <= 2; i++) add(P.box, stripe, i * 0.38, H + 0.045, 0, slope, 0, 0, 0.1, 0.02, D + 0.36);
  // Valance with scallops at the front edge.
  for (let i = -4; i <= 4; i++)
    add(P.box, i % 2 ? awn : stripe, i * 0.24, H - 0.27, D / 2 + 0.17, 0, 0, 0, 0.23, 0.14, 0.02);
  const g0 = y(0, 0);
  if (kind === "produce") {
    // Manta on the ground with baskets of native potatoes, maize cobs and a sack of chuño.
    add(P.box, DYE.red, 0, g0 + 0.015, 0.05, 0, 0, 0, 1.8, 0.03, 1.15);
    for (const x of [-0.6, 0, 0.6]) add(P.box, DYE.ochre, x, g0 + 0.035, 0.05, 0, 0, 0, 0.08, 0.012, 1.16);
    const spots: Array<[number, number, string[]]> = [
      [-0.55, -0.12, ["#7a4f3a", "#5b3048", "#a8705a"]],
      [0.0, 0.2, ["#e8c45a", "#f0e2b0", "#6a2f5a"]],
      [0.55, -0.1, ["#c6a27a", "#7a4f3a", "#d9b98c"]],
    ];
    spots.forEach(([x, z, cols], k) => {
      add(P.flare, "#c99a55", x, g0 + 0.15, z, Math.PI, 0, 0, 0.27, 0.26, 0.27);
      add(P.cyl, "#a5743a", x, g0 + 0.27, z, 0, 0, 0, 0.27, 0.03, 0.27);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + R();
        const r = i === 0 ? 0 : 0.14 + R() * 0.06;
        const c = cols[i % cols.length] as string;
        if (k === 1)
          add(P.cap, c, x + Math.cos(a) * r, g0 + 0.33, z + Math.sin(a) * r, Math.PI / 2, a, 0, 0.045, 0.12, 0.045);
        else add(P.lowSph, c, x + Math.cos(a) * r, g0 + 0.32, z + Math.sin(a) * r, R(), R(), 0, 0.07, 0.058, 0.06);
      }
    });
    add(P.ico, "#d8cbb4", 0.15, g0 + 0.28, -0.45, 0, 0, 0, 0.26, 0.3, 0.2);
    add(P.cyl, DYE.indigo, 0.15, g0 + 0.53, -0.45, 0, 0, 0, 0.08, 0.06, 0.08);
  } else {
    // Low table with a woven cloth.
    const th = 0.72;
    for (const [x, z] of [
      [-0.8, -0.4],
      [0.8, -0.4],
      [-0.8, 0.4],
      [0.8, 0.4],
    ] as const) {
      const g = y(x, z);
      add(P.box, WOOD, x, (g + g0 + th) / 2 - 0.1, z, 0, 0, 0, 0.06, g0 + th - g + 0.2, 0.06);
    }
    add(P.box, WOOD, 0, g0 + th, 0, 0, 0, 0, 1.75, 0.05, 0.95);
    add(P.box, kind === "pottery" ? DYE.indigo : DYE.red, 0, g0 + th + 0.03, 0, 0, 0, 0, 1.78, 0.02, 0.98);
    add(P.box, kind === "pottery" ? DYE.indigo : DYE.red, 0, g0 + th - 0.08, 0.495, 0, 0, 0, 1.78, 0.2, 0.01);
    if (kind === "textiles") {
      // Folded stacks and a hanging lliclla on the back rail.
      const cols = [DYE.red, DYE.indigo, DYE.turq, "#c2456b", DYE.ochre, "#3f7f4a"];
      for (let i = 0; i < 5; i++) {
        const x = -0.7 + i * 0.35;
        const n = 2 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++)
          add(
            P.box,
            cols[(i + k * 2) % cols.length] as string,
            x,
            g0 + th + 0.07 + k * 0.07,
            0.05 + (R() - 0.5) * 0.1,
            0,
            (R() - 0.5) * 0.2,
            0,
            0.3,
            0.06,
            0.36,
          );
      }
      add(P.cyl6, WOOD, 0, g0 + 1.75, -D / 2, 0, 0, Math.PI / 2, 0.025, W, 0.025);
      for (let i = 0; i < 3; i++) {
        const x = -0.6 + i * 0.6;
        const c = cols[(i * 2 + 1) % cols.length] as string;
        add(P.box, c, x, g0 + 1.3, -D / 2 + 0.02, 0, 0, 0, 0.52, 0.9, 0.02);
        for (let k = 0; k < 4; k++)
          add(
            P.box,
            k % 2 ? DYE.cotton : DYE.ochre,
            x,
            g0 + 1.05 + k * 0.17,
            -D / 2 + 0.035,
            0,
            0,
            0,
            0.52,
            0.04,
            0.012,
          );
        add(P.box, DYE.cotton, x, g0 + 0.83, -D / 2 + 0.02, 0, 0, 0, 0.5, 0.05, 0.015);
      }
    } else {
      // Pottery: aríbalos (pointed-base jars), cooking pots and small cups, with painted bands.
      const clay = ["#b5653b", "#c4774a", "#9c5434"];
      for (let i = 0; i < 6; i++) {
        const x = -0.72 + i * 0.29;
        const z = (i % 2) * 0.22 - 0.1;
        const c = clay[i % clay.length] as string;
        const big = i % 3 === 1;
        const r = big ? 0.15 : 0.11;
        const gy = g0 + th + 0.05 + r;
        add(P.sph, c, x, gy, z, 0, 0, 0, r, r * (big ? 1.15 : 0.9), r);
        add(P.cyl, c, x, gy + r * 0.95, z, 0, 0, 0, r * 0.38, r * 0.5, r * 0.38);
        add(P.cyl, "#efe6d6", x, gy + r * 0.1, z, 0, 0, 0, r * 1.01, r * 0.22, r * 1.01);
        add(P.cyl, "#2a1d17", x, gy + r * 0.1, z, 0, 0, 0, r * 1.015, r * 0.06, r * 1.015);
        if (big)
          for (const sd of [-1, 1])
            add(P.torus, c, x + sd * r * 0.95, gy + r * 0.2, z, 0, Math.PI / 2, 0, 0.04, 0.04, 0.04);
      }
      for (let i = 0; i < 3; i++)
        add(P.cyl, "#c4774a", -0.5 + i * 0.5, g0 + th + 0.08, 0.32, 0, 0, 0, 0.06, 0.07, 0.06);
      // Big storage jar on the ground.
      add(P.sph, "#a85e38", 0.85, y(0.85, 0.75) + 0.3, 0.75, 0, 0, 0, 0.26, 0.3, 0.26);
      add(P.cyl, "#efe6d6", 0.85, y(0.85, 0.75) + 0.36, 0.75, 0, 0, 0, 0.265, 0.06, 0.265);
    }
  }
  s.p.post = null;
}

/** A small hearth: ring of stones and crossed logs (local, origin on the ground). Flames are separate. */
export function hearth(s: Static, m: THREE.Matrix4) {
  const P = s.P;
  const tmp = s.p;
  tmp.post = m;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    tmp.add(
      P.lowSph,
      i % 2 ? "#8f877b" : "#b9b1a3",
      Math.cos(a) * 0.42,
      0.06,
      Math.sin(a) * 0.42,
      a,
      a,
      0,
      0.13,
      0.1,
      0.12,
    );
  }
  for (let i = 0; i < 3; i++)
    tmp.add(P.cyl6, WOOD_D, 0, 0.08, 0, Math.PI / 2 - 0.25, (i / 3) * Math.PI, 0, 0.04, 0.6, 0.04);
  tmp.add(P.sph, "#3b2c25", 0, 0.02, 0, 0, 0, 0, 0.3, 0.03, 0.3);
  tmp.post = null;
}
