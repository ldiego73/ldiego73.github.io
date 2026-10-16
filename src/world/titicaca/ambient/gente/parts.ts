/**
 * Extra parts for the lake's people, built with the shared people rig (../../../ambient/people/rig.ts) in the
 * same palette-slot scheme, so they join the same Crowd as the mountain's parts without touching them: the
 * Aymara women's bowler hat (bombín), the pushka (drop spindle) the Taquile women spin with, and the needles
 * and half-knitted chullo the Taquile men hold. Additive only: the mountain's parts and looks are unchanged.
 */

import { Part, type PartSpec, protos, S_ACC, S_MAIN } from "../../../ambient/people/rig";
import { DYE } from "../../../props";

const FELT = "#2a221e";
const WOOD = "#7a5233";

export type LakePart = "bombin" | "pushka" | "knitting";

/** Bowler hat on the head bone (the head's crown sits at ~0.42). */
function bombin(P: ReturnType<typeof protos>) {
  const p = new Part();
  p.add(P.cyl, FELT, 0, 0.36, 0, 0, 0, 0, 0.25, 0.025, 0.25);
  p.add(P.halfSph, FELT, 0, 0.37, 0, 0, 0, 0, 0.165, 0.2, 0.165);
  p.add(P.cyl, S_ACC, 0, 0.385, 0, 0, 0, 0, 0.168, 0.035, 0.168);
  return p.build();
}

/** Drop spindle in the right hand: a shaft, a whorl, a ball of spun wool (accent colour) and the thread. */
function pushka(P: ReturnType<typeof protos>) {
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, -0.12, 0.04, 0, 0, 0, 0.012, 0.36, 0.012);
  p.add(P.cyl, WOOD, 0, -0.24, 0.04, 0, 0, 0, 0.05, 0.02, 0.05);
  p.add(P.lowSph, S_ACC, 0, -0.08, 0.04, 0, 0, 0, 0.06, 0.08, 0.06);
  p.add(P.cyl6, DYE.cotton, 0, 0.12, 0.04, 0, 0, 0, 0.004, 0.24, 0.004);
  return p.build();
}

/** Needles and a chullo being knitted, held in front of the chest (torso bone). */
function knitting(P: ReturnType<typeof protos>) {
  const p = new Part();
  p.add(P.cone, S_MAIN, 0, 0.28, 0.26, -0.3, 0, 0, 0.09, 0.16, 0.09);
  p.add(P.cyl, DYE.cotton, 0, 0.22, 0.25, -0.3, 0, 0, 0.092, 0.025, 0.092);
  for (const s of [-1, 1]) p.add(P.cyl6, "#d9d3c4", s * 0.07, 0.33, 0.29, -0.6, 0, s * 0.5, 0.006, 0.26, 0.006);
  return p.build();
}

/** Part specs for the crowd (each crowd owns its geometries). */
export function lakePartSpecs(): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [
    { name: "bombin", bone: "head", geo: bombin(P) },
    { name: "pushka", bone: "handR", geo: pushka(P) },
    { name: "knitting", bone: "torso", geo: knitting(P) },
  ];
  for (const g of Object.values(P)) g.dispose();
  return out;
}
