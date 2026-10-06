/**
 * Hand-held parts for the summit camp people, in the people rig's palette-slot format (people/rig.ts), so
 * they ride the same instanced crowd as the bodies: a clay cup of api, the vendor's wooden ladle, a stone
 * for the apacheta and the children's kite spool. All hang from the right hand (handR bone).
 */
import { DYE } from "../../palette";
import { Part, type PartSpec, type Protos, protos } from "../people/rig";

const CLAY = "#b5653b";
const CLAY_D = "#8e4a2c";
const API = "#5b2a4e"; // api morado (purple maize)
const WOOD = "#7a5233";

/** Clay cup held upright in the hand; its axis runs along the hand's +z (tips toward the mouth when sipping). */
function cup(P: Protos) {
  const p = new Part();
  p.add(P.cyl, CLAY, 0, -0.03, 0.06, Math.PI / 2, 0, 0, 0.055, 0.12, 0.05);
  p.add(P.cyl, DYE.cotton, 0, -0.03, 0.09, Math.PI / 2, 0, 0, 0.057, 0.018, 0.052);
  p.add(P.cyl, API, 0, -0.03, 0.118, Math.PI / 2, 0, 0, 0.046, 0.008, 0.042);
  return p.build();
}

/** Long wooden ladle (wislla) for stirring and serving. */
function ladle(P: Protos) {
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, -0.02, 0.2, Math.PI / 2, 0, 0, 0.018, 0.5, 0.018);
  p.add(P.halfSph, "#6a4329", 0, -0.02, 0.47, -Math.PI / 2, 0, 0, 0.065, 0.05, 0.065);
  return p.build();
}

/** A field stone (to leave on the apacheta). */
function stone(P: Protos) {
  const p = new Part();
  p.add(P.lowSph, "#9a9184", 0, -0.04, 0.05, 0.4, 0.7, 0, 0.085, 0.065, 0.075);
  return p.build();
}

/** Kite spool: a short stick wound with string. */
function spool(P: Protos) {
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, -0.02, 0.03, 0, 0, Math.PI / 2, 0.016, 0.22, 0.016);
  p.add(P.cyl, DYE.cotton, 0, -0.02, 0.03, 0, 0, Math.PI / 2, 0.04, 0.1, 0.04);
  p.add(P.cyl, CLAY_D, 0, -0.02, 0.03, 0, 0, Math.PI / 2, 0.041, 0.015, 0.041);
  return p.build();
}

export type CampPart = "cup" | "ladle" | "stone" | "spool";
export const CAMP_PARTS: readonly CampPart[] = ["cup", "ladle", "stone", "spool"];

const MAKERS: Record<CampPart, (P: Protos) => ReturnType<Part["build"]>> = { cup, ladle, stone, spool };

/** Fresh geometries for the hand-held parts (each crowd owns its own). */
export function campPartSpecs(): PartSpec[] {
  const P = protos();
  const out = CAMP_PARTS.map((name) => ({ name, bone: "handR" as const, geo: MAKERS[name](P) }));
  for (const g of Object.values(P)) g.dispose();
  return out;
}
