/**
 * Vegetation of the mountain (built by terrain.ts): ichu in three looks, wild lupine and yellow daisies by
 * the trail, and the sierra / cloud-forest trees (queñua, aliso, unca, pisonay, chusquea bamboo).
 *
 * - InstancedMeshes per species and 36 u tile (merged, vertex-colored geometry), frustum- and distance-culled.
 * - Ground cover sways in the vertex shader (shared wind uniforms; still under reduced motion) and stays
 *   ink-correct (see material.ts). Trees are static, cast shadows and register trunk colliders.
 * - Bird perches and flower points are published on an Object3D named "flora-perches"
 *   (`userData: FloraPerches`) so ambient/birds.ts can find them through the scene.
 * - A manual `world:quality` switch to low thins the ground cover to 45% ("ichu" itself is thinned by index.ts).
 */
import * as THREE from "three";
import { on } from "../events";
import type { Layout } from "../layout";
import { inkAware, type SwayUniforms, staticMaterial, swayMaterial } from "./material";
import {
  alisoModel,
  chusqueaModel,
  type FloraModel,
  ichuModel,
  lupineModel,
  pisonayModel,
  quenuaModel,
  TINTS,
  uncaModel,
  yellowFlowerModel,
} from "./models";
import { composeInst, type FloraPerches, perchRecords, TREE_KINDS } from "./perches";
import { type Inst, planFlora, TREE_R, type TreeKind } from "./placement";

export { FLOWER_KINDS, type FloraPerches, TREE_KINDS } from "./perches";

export interface Flora {
  objects: THREE.Object3D[];
  update(t: number): void;
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

function instanced(
  name: string,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: Inst[],
  tints: readonly string[],
  tintFor?: (i: Inst, base: THREE.Color) => void,
) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  mesh.name = name;
  list.forEach((inst, k) => {
    mesh.setMatrixAt(k, composeInst(inst, _m));
    _c.set(tints[inst.tint % tints.length] as string);
    tintFor?.(inst, _c);
    mesh.setColorAt(k, _c);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Splits one species into square tiles, one InstancedMesh each (same geometry and material), so the
 * renderer frustum-culls what's behind the camera instead of drawing every tuft on the mountain in
 * every pass. `cullDistance` lets detail-cull.ts drop far ground-cover tiles past the fog's start.
 */
const TILE = 36;
function tiled(
  name: string,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: Inst[],
  tints: readonly string[],
  tintFor?: (i: Inst, base: THREE.Color) => void,
  cullDistance?: number,
): THREE.InstancedMesh[] {
  const buckets = new Map<string, Inst[]>();
  for (const inst of list) {
    const key = `${Math.floor(inst.x / TILE)},${Math.floor(inst.z / TILE)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(inst);
  }
  const out: THREE.InstancedMesh[] = [];
  for (const b of buckets.values()) {
    const mesh = instanced(name, geo, mat, b, tints, tintFor);
    if (cullDistance) mesh.userData.cullDistance = cullDistance;
    out.push(mesh);
  }
  return out;
}

const reducedMotionPref = () => {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export function createFlora(
  L: Layout,
  gradientMap: THREE.Texture | null,
  quality: "low" | "high",
  o: { reducedMotion?: boolean; avoid?: Array<[number, number, number]> } = {},
): Flora {
  const lite = quality === "low";
  const plan = planFlora(L, quality, o.avoid ?? []);
  const reduced = o.reducedMotion ?? reducedMotionPref();
  const wind: SwayUniforms = { uTime: { value: 0 }, uWind: { value: reduced ? 0 : 1 } };
  const swayMat = swayMaterial(gradientMap, wind);
  const treeMat = staticMaterial(gradientMap);
  const geos: THREE.BufferGeometry[] = [];
  const objects: THREE.Object3D[] = [];

  // ---------------------------------------------------------------- ground cover
  const valley = new THREE.Color(TINTS.ichuValley);
  const cover: THREE.InstancedMesh[] = [];
  const addCover = (
    name: string,
    geo: THREE.BufferGeometry,
    list: Inst[],
    tints: readonly string[],
    tintFor?: (i: Inst, c: THREE.Color) => void,
  ) => {
    geos.push(geo);
    // Ground cover is gone in the fog well before 190 u; tiles past that skip every pass.
    for (const mesh of tiled(name, geo, swayMat, list, tints, tintFor, 190)) {
      inkAware(mesh);
      mesh.userData.fullCount = mesh.count;
      cover.push(mesh);
      objects.push(mesh);
    }
  };
  addCover("ichu-tall", ichuModel("tall", lite), plan.ichuTall, TINTS.ichuTall, (i, c) => {
    // Lower down the golden tufts pick up some valley green.
    if (i.y < 14 && i.tint % 2 === 0) c.lerp(valley, 0.75);
  });
  addCover("ichu-short", ichuModel("short", lite), plan.ichuShort, TINTS.ichuShort);
  addCover("ichu-dry", ichuModel("dry", lite), plan.ichuDry, TINTS.ichuDry);
  const lupine = lupineModel(lite);
  addCover("flora-lupine", lupine.geo, plan.lupine, ["#ffffff", "#f0ecff", "#e6eaff"]);
  const yellow = yellowFlowerModel(lite);
  addCover("flora-yellow", yellow.geo, plan.yellow, ["#ffffff", "#fff4d8", "#fffbe8"]);

  // ---------------------------------------------------------------- trees
  const models: Record<TreeKind, FloraModel> = {
    quenua: quenuaModel(),
    aliso: alisoModel(),
    unca: uncaModel(),
    pisonay: pisonayModel(),
    chusquea: chusqueaModel(lite),
  };
  for (const kind of TREE_KINDS) {
    const model = models[kind];
    const list = plan[kind];
    geos.push(model.geo);
    for (const mesh of tiled(kind, model.geo, treeMat, list, TINTS.tree)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      objects.push(mesh);
    }
    for (const inst of list) L.addCollider({ kind: "circle", x: inst.x, z: inst.z, r: TREE_R[kind].trunk * inst.s });
  }
  // Bird perches + hummingbird flowers, published for ambient/birds.ts.
  const perches = new THREE.Object3D();
  perches.name = "flora-perches";
  perches.userData = perchRecords(plan, models, lupine, yellow) satisfies FloraPerches;
  objects.push(perches);

  // ---------------------------------------------------------------- runtime density (auto governor / manual)
  const offQuality =
    typeof window !== "undefined"
      ? on("world:quality", (d) => {
          // Manual switches only: the auto governor promises never to touch geometry.
          if (d.auto) return;
          for (const m of cover) {
            const full = m.userData.fullCount as number;
            m.count = d.quality === "high" ? full : Math.floor(full * 0.45);
          }
        })
      : () => {};

  return {
    objects,
    update(t) {
      wind.uTime.value = t;
    },
    dispose() {
      offQuality();
      swayMat.dispose();
      treeMat.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
