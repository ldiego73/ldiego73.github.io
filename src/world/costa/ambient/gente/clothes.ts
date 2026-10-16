/**
 * Coastal clothing for the shared people rig (../../../ambient/people/rig.ts), as extra part geometries that
 * live in the coast's own crowd only, so the mountain's people keep their highland dress untouched:
 *  - "c:shirt": a light cotton shirt with a collar, tucked into the rig's trousers (no poncho on the warm coast);
 *  - "c:arm": short sleeves and bare forearms;
 *  - "c:blouse": a blouse with a bib apron for the women (worn over the rig's skirt);
 *  - "c:hat": the wide straw hat of the northern coast, with a dark band.
 * Proportions follow ../../../ambient/people/models.ts (shoulders at 1.02, head top ≈ 1.6 before scale);
 * colours come from the palette slots (S_MAIN shirt / blouse, S_ACC band / apron, S_ALT trousers).
 */
import type * as THREE from "three";
import { Part, type PartSpec, protos, S_ACC, S_ALT, S_MAIN, S_SKIN } from "../../../ambient/people/rig";

const STRAW = "#d8c07a";
const STRAW_DARK = "#bfa25e";

function shirt(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  // Waist of the trousers, the shirt body, a collar and buttons.
  p.add(P.cyl, S_ALT, 0, 0.02, 0, 0, 0, 0, 0.19, 0.16, 0.15);
  p.add(P.cyl, S_MAIN, 0, 0.27, 0, 0, 0, 0, 0.2, 0.46, 0.155);
  p.add(P.sph, S_MAIN, 0, 0.45, 0, 0, 0, 0, 0.25, 0.1, 0.165);
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.068, 0.1, 0.068);
  for (const s of [-1, 1]) p.add(P.box, S_MAIN, 0.06 * s, 0.5, 0.115, 0.35, 0, -0.5 * s, 0.09, 0.02, 0.06);
  for (const y of [0.2, 0.3, 0.4]) p.add(P.box, "#efe6d6", 0, y, 0.157, 0, 0, 0, 0.018, 0.018, 0.008);
  return p.build();
}

function arm(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cap, S_MAIN, 0, -0.08, 0, 0, 0, 0, 0.074, 0.09, 0.074);
  p.add(P.cap, S_SKIN, 0, -0.23, 0, 0, 0, 0, 0.052, 0.15, 0.052);
  p.add(P.sph, S_SKIN, 0, -0.37, 0.01, 0, 0, 0, 0.058, 0.062, 0.058);
  return p.build();
}

function blouse(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cyl, S_MAIN, 0, 0.27, 0, 0, 0, 0, 0.19, 0.48, 0.15);
  p.add(P.sph, S_MAIN, 0, 0.44, 0, 0, 0, 0, 0.24, 0.1, 0.16);
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.065, 0.1, 0.065);
  // Bib apron with its ties.
  p.add(P.box, S_ACC, 0, 0.16, 0.16, 0, 0, 0, 0.26, 0.42, 0.02);
  p.add(P.box, S_ACC, 0, 0.36, 0.153, 0, 0, 0, 0.36, 0.04, 0.03);
  return p.build();
}

function hat(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cyl, STRAW, 0, 0.36, 0, 0, 0, 0, 0.42, 0.025, 0.42);
  p.add(P.cyl, STRAW_DARK, 0, 0.345, 0, 0, 0, 0, 0.425, 0.015, 0.425);
  p.add(P.cyl, STRAW, 0, 0.45, 0, 0, 0, 0, 0.17, 0.17, 0.17);
  p.add(P.cyl, S_ACC, 0, 0.395, 0, 0, 0, 0, 0.175, 0.05, 0.175);
  p.add(P.sph, STRAW, 0, 0.535, 0, 0, 0, 0, 0.16, 0.04, 0.16);
  return p.build();
}

export type CoastPart = "c:shirt" | "c:arm" | "c:blouse" | "c:hat";

/** Part specs for the coast's crowd (fresh geometries: each crowd owns its own). */
export function coastSpecs(): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [
    { name: "c:shirt", bone: "torso", geo: shirt(P) },
    { name: "c:arm", bone: "arm", geo: arm(P) },
    { name: "c:blouse", bone: "torso", geo: blouse(P) },
    { name: "c:hat", bone: "head", geo: hat(P) },
  ];
  for (const g of Object.values(P)) g.dispose();
  return out;
}

/** Coastal palettes: light cottons, sun-faded colours. */
export const SHIRTS = ["#efe9dc", "#d9e4ea", "#e8d7b8", "#c9dbd2", "#f2e2c8", "#b8cfe0"];
export const BLOUSES = ["#e7a1a8", "#f1d38a", "#a8cfe0", "#efe9dc", "#c4d9a8"];
export const APRONS = ["#2a9d8f", "#c4383f", "#3446a6", "#dda63c"];
export const TROUSERS = ["#2f3557", "#4a4a52", "#6e6258", "#3b4a5e"];
export const SKIRTS = ["#3446a6", "#2a9d8f", "#7a4a6a", "#4a5a3a"];
export const COAST_SKINS = ["#9a6440", "#b9764a", "#8e5a38", "#a86a42", "#7a4a30", "#b47a50"];
