/**
 * Vegetation of the mountain (built by terrain.ts): ichu in three looks, wild lupine and yellow daisies by
 * the trail, and the sierra / cloud-forest trees (queñua, aliso, unca, pisonay, chusquea bamboo).
 *
 * - InstancedMeshes per species and tile (trees 36 u, ground cover 48 u / 36 u on phones; merged,
 *   vertex-colored geometry), frustum- and distance-culled.
 * - Everything rides the world's shared wind (../wind.ts, cel pintado andino): ground cover bends with
 *   gust fronts rolling up the slope and parts around the traveler and nearby animals; trees bend at the
 *   crown, flutter, and the small ones (queñua, chusquea, unca) spring back when brushed (`springs`).
 *   Both stay ink-correct (see material.ts). Trees cast shadows and register trunk colliders.
 * - Bird perches and flower points are published on an Object3D named "flora-perches"
 *   (`userData: FloraPerches`) so ambient/birds.ts can find them through the scene.
 * - A manual `world:quality` switch to low thins the ground cover to 45% ("ichu" itself is thinned by index.ts).
 * - Phones (`phone`, see quality.ts deviceProfile): 70% ichu, 80% trees with lighter crowns (detail-0
 *   clumps), and ground-cover tiles culled from 120 u instead of 190 u. Desktop is unchanged.
 */
import * as THREE from "three";
import { on } from "../events";
import type { Layout } from "../layout";
import { springs } from "../wind";
import { swayMaterial, treeMaterial } from "./material";
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
import { type Inst, PHONE_DENSITY, planFlora, TREE_R, type TreeKind } from "./placement";

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
/**
 * Ground-cover tiles (ichu, lupine, daisies) on desktop: 48 u cuts their draws by ~30% (t 0.68: 186 → 134
 * color + ink draws) for ~3% more triangles from instances just outside the view. Past 48 u the extra
 * off-screen tufts grow faster than the saved draws (60 u: +8–18% triangles). Phones keep 36 u: their
 * 120 u cull leaves few tiles anyway, and 48 u would add ~7% triangles for ~2 draws.
 */
const COVER_TILE = { desktop: 48, phone: 36 };
function tiled(
  name: string,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: Inst[],
  tints: readonly string[],
  tintFor?: (i: Inst, base: THREE.Color) => void,
  cullDistance?: number,
  tile = TILE,
): THREE.InstancedMesh[] {
  const buckets = new Map<string, Inst[]>();
  for (const inst of list) {
    const key = `${Math.floor(inst.x / tile)},${Math.floor(inst.z / tile)}`;
    let b = buckets.get(key);
    if (!b) {
      b = [];
      buckets.set(key, b);
    }
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

/** Trees that spring back when brushed (small crowns; the big pisonay and aliso just sway). */
const SPRINGY = new Set<TreeKind>(["quenua", "chusquea", "unca"]);

export function createFlora(
  L: Layout,
  gradientMap: THREE.Texture | null,
  quality: "low" | "high",
  o: { reducedMotion?: boolean; avoid?: Array<[number, number, number]>; phone?: boolean } = {},
): Flora {
  const lite = quality === "low";
  const phone = !!o.phone;
  const plan = planFlora(L, quality, o.avoid ?? [], phone ? PHONE_DENSITY : undefined);
  const coverCull = phone ? 120 : 190;
  const coverTile = phone ? COVER_TILE.phone : COVER_TILE.desktop;
  // Reduced motion is the wind state's business (style-runtime.ts): a slow, constant sway without gusts.
  const swayMat = swayMaterial(gradientMap);
  const treeMat = treeMaterial(gradientMap);
  const geos: THREE.BufferGeometry[] = [];
  const objects: THREE.Object3D[] = [];
  const removeSprings: Array<() => void> = [];

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
    for (const mesh of tiled(name, geo, swayMat, list, tints, tintFor, coverCull, coverTile)) {
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
    quenua: quenuaModel(phone),
    aliso: alisoModel(phone),
    unca: uncaModel(phone),
    pisonay: pisonayModel(phone),
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
    // Small trees and bamboo shake when the traveler brushes past (spring kicks, ../wind.ts).
    if (SPRINGY.has(kind))
      removeSprings.push(springs.add(list.map((i) => ({ x: i.x, z: i.z, r: TREE_R[kind].trunk * i.s + 0.35 }))));
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
    update(_t) {
      // The wind clock is shared (style-runtime.ts); kept for the terrain.ts call site.
    },
    dispose() {
      offQuality();
      for (const r of removeSprings) r();
      swayMat.dispose();
      treeMat.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
