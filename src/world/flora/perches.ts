/**
 * Bird perches and flower points in world space (pure): each tree's local perch list transformed by its
 * instance matrix. Trees: stride 5 (x, y, z, kind, tree id), kind = index in TREE_KINDS.
 * Flowers: stride 4 (x, y, z, kind), kind = index in FLOWER_KINDS.
 */
import * as THREE from "three";
import type { FloraModel } from "./models";
import type { FloraPlan, Inst, TreeKind } from "./placement";

export const TREE_KINDS: TreeKind[] = ["quenua", "aliso", "unca", "pisonay", "chusquea"];
export const FLOWER_KINDS = ["lupine", "yellow", "pisonay", "epiphyte"] as const;

export interface FloraPerches {
  trees: Float32Array;
  flowers: Float32Array;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Instance matrix of a placement (yaw, slight tilt, scale with vertical stretch). */
export function composeInst(i: Inst, out: THREE.Matrix4) {
  _q.setFromEuler(_e.set(i.tilt, i.rot, i.tilt * 0.7, "YXZ"));
  return out.compose(_p.set(i.x, i.y, i.z), _q, _s.set(i.s, i.s * i.sy, i.s));
}

export function perchRecords(
  plan: FloraPlan,
  trees: Record<TreeKind, Pick<FloraModel, "perches" | "flowers">>,
  lupine: Pick<FloraModel, "flowers">,
  yellow: Pick<FloraModel, "flowers">,
): FloraPerches {
  const m = new THREE.Matrix4();
  const perch: number[] = [];
  const flower: number[] = [];
  const push = (out: number[], pts: Array<[number, number, number]>, extra: number[]) => {
    for (const [x, y, z] of pts) {
      _p.set(x, y, z).applyMatrix4(m);
      out.push(_p.x, _p.y, _p.z, ...extra);
    }
  };
  let id = 0;
  TREE_KINDS.forEach((kind, k) => {
    for (const inst of plan[kind]) {
      composeInst(inst, m);
      push(perch, trees[kind].perches, [k, id++]);
      if (kind === "pisonay") push(flower, trees[kind].flowers, [2]);
      if (kind === "unca") push(flower, trees[kind].flowers, [3]);
    }
  });
  for (const [list, model, kind] of [
    [plan.lupine, lupine, 0],
    [plan.yellow, yellow, 1],
  ] as const) {
    const f = model.flowers[0];
    if (!f) continue;
    for (const inst of list) {
      composeInst(inst, m);
      push(flower, [f], [kind]);
    }
  }
  return { trees: new Float32Array(perch), flowers: new Float32Array(flower) };
}
