/**
 * Props of the storytelling circle: the amauta's walking staff (a crowd part on the tool bone) and the
 * static hearth with flat seat stones (vertex-colored, merged into one mesh).
 */
import * as THREE from "three";
import { DYE } from "../../palette";
import { hearth, Static } from "../people/models";
import { Part, type PartSpec, protos, S_ACC, S_MAIN } from "../people/rig";
import type { P2 } from "./logic";

const WOOD = "#6e4a2e";
const WOOD_D = "#4f331f";

/** Walking staff (tool bone, origin on the ground): a carved knob and a small woven tassel under it. */
export function staffSpec(): PartSpec {
  const P = protos();
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, 0.74, 0, 0, 0, 0.03, 0.026, 1.5, 0.026);
  p.add(P.lowSph, WOOD_D, 0.02, 1.52, 0, 0, 0, 0, 0.05, 0.065, 0.05);
  p.add(P.cyl, S_ACC, 0.018, 1.38, 0, 0, 0, 0, 0.034, 0.05, 0.034);
  p.add(P.cyl6, S_MAIN, 0.05, 1.27, 0.0, 0, 0, 0.2, 0.01, 0.18, 0.01);
  p.add(P.lowSph, S_ACC, 0.068, 1.17, 0, 0, 0, 0, 0.022, 0.03, 0.022);
  const geo = p.build();
  for (const g of Object.values(P)) g.dispose();
  return { name: "staff", bone: "tool", geo };
}

/**
 * Hearth ring + flat seat stones under the children and the fire sitters (world positions), and a small
 * pile of spare logs. `ground(x, z)` gives the terrain height.
 */
export function circleProps(
  hearthAt: THREE.Vector3,
  seats: P2[],
  logs: P2,
  ground: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const s = new Static();
  const P = s.P;
  hearth(s, new THREE.Matrix4().makeTranslation(hearthAt.x, hearthAt.y, hearthAt.z));
  seats.forEach((p, i) => {
    const y = ground(p.x, p.z);
    s.p.add(P.lowSph, i % 2 ? "#9d9486" : "#b3ab9c", p.x, y + 0.03, p.z, 0, i * 1.3, 0, 0.3, 0.07, 0.26);
  });
  const ly = ground(logs.x, logs.z);
  for (let i = 0; i < 3; i++)
    s.p.add(
      P.cyl6,
      i === 2 ? WOOD : WOOD_D,
      logs.x,
      ly + 0.05 + (i === 2 ? 0.08 : 0),
      logs.z + (i - 1) * 0.1 * (i === 2 ? 0 : 1),
      0,
      0.4,
      Math.PI / 2,
      0.045,
      0.55,
      0.045,
    );
  // A folded lliclla left on a stone.
  s.p.add(P.box, DYE.red, logs.x + 0.05, ly + 0.17, logs.z, 0, 0.4, 0, 0.22, 0.04, 0.18);
  s.p.add(P.box, DYE.ochre, logs.x + 0.05, ly + 0.195, logs.z, 0, 0.4, 0, 0.22, 0.012, 0.05);
  return s.build();
}
