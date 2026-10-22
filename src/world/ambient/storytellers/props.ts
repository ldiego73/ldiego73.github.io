/**
 * Props of the storytelling circle: the static hearth with flat seat stones and a few spare logs
 * (vertex-colored, merged into one mesh). The amauta's staff is a shared held prop (characters/props.ts).
 */
import * as THREE from "three";
import { DYE } from "../../palette";
import { hearth, Static } from "../people/site-props";
import type { P2 } from "./logic";

const WOOD = "#6e4a2e";
const WOOD_D = "#4f331f";

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
