/**
 * Instanced forest of the Antisuyu: one InstancedMesh per species per strip tile (one geometry, one
 * material → one draw per visible tile and pass), so the renderer frustum-culls tiles behind the camera.
 *
 * Distance culling: the road is a corridor and the whole world sits inside the fog range, so every tile ahead
 * would otherwise draw in the color, ink and shadow passes. Each species has a view range (RANGE, measured
 * from the tile's bounding sphere surface; phones × PHONE_RANGE, "low" × LOW_RANGE): past it the tile is
 * hidden (`visible`, owned here). Beyond the instanced forest the canopy carpet (far.ts) carries the view.
 * The tiles also carry `userData.cullDistance` so the runtime's detail-cull treats them the same way.
 *
 * Materials: vertex-colored toon with wind sway (kit.ts swayMaterial, `inkAware`: the ink follows
 * the swaying vertices). Double-sided because leaves are single sheets. Trees sway very little (crowns), the
 * understory more. Ceibas and palms cast shadows; the understory doesn't (cheap shadow pass).
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { inkAware, type SwayUniforms, swayMaterial } from "./kit";
import {
  aguajeModel,
  bananaModel,
  broadleafModel,
  cecropiaModel,
  ceibaModel,
  fernModel,
  heliconiaModel,
  huasaiModel,
  lianaModel,
  lilyModel,
  reedModel,
  shapajaModel,
  shrubModel,
  tieredModel,
} from "./models";
import type { Inst, SceneryPlan, Species } from "./placement";

/** View range per species (u, desktop). Infinity = never distance-culled (landmarks). */
export const RANGE: Record<Species | "lilyFlower", number> = {
  ceiba: Number.POSITIVE_INFINITY,
  broadleaf: 260,
  tiered: 300,
  cecropia: 240,
  aguaje: 260,
  huasai: 200,
  shapaja: 200,
  banana: 130,
  heliconia: 105,
  shrub: 140,
  fern: 75,
  liana: 120,
  reed: 150,
  lily: 160,
  lilyFlower: 160,
};
export const PHONE_RANGE = 0.7;
export const LOW_RANGE = 0.85;
/**
 * Tiles are strips across the whole forest band (the world is a long west → east corridor): x width per
 * species group, any z. Trees: 120 u (≈ 3–4 strips within their range), understory: 80 u (≈ 2 strips).
 * Ceibas and lilies are few: one mesh each. Square 100 u tiles cost ~2× the draws for the same view.
 */
export const TILE: Record<Species | "lilyFlower", number> = {
  ceiba: Number.POSITIVE_INFINITY,
  broadleaf: 120,
  tiered: 120,
  cecropia: 120,
  aguaje: 120,
  huasai: 120,
  shapaja: 120,
  banana: 80,
  heliconia: 80,
  shrub: 80,
  fern: 80,
  liana: 80,
  reed: 120,
  lily: Number.POSITIVE_INFINITY,
  lilyFlower: Number.POSITIVE_INFINITY,
};

/** Per-instance tints (multiplied with the vertex colors): small hue/value shifts between plants. */
const TINTS: Record<"tree" | "palm" | "under" | "flower", readonly string[]> = {
  tree: ["#ffffff", "#e3eed6", "#f5ffe2", "#d6e2c8"],
  palm: ["#ffffff", "#eaf3dc", "#f8ffe9"],
  under: ["#ffffff", "#e5f0da", "#f7ffe8", "#dbe8cf"],
  flower: ["#ffffff", "#fff6f8"],
};

const SHADOW = new Set<Species>(["ceiba", "broadleaf", "tiered", "aguaje", "shapaja", "huasai", "cecropia"]);

export interface Forest {
  objects: THREE.Object3D[];
  /** Instanced meshes with their view range (for stats). */
  tiles: THREE.InstancedMesh[];
  update(time: number, camera: THREE.Vector3): void;
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function composeInst(i: Inst, out: THREE.Matrix4) {
  _q.setFromEuler(_e.set(i.tilt, i.rot, i.tilt * 0.7, "YXZ"));
  return out.compose(_p.set(i.x, i.y, i.z), _q, _s.set(i.s, i.s * i.sy, i.s));
}

export function createForest(
  plan: SceneryPlan,
  toon: ToonCache,
  o: { quality: "low" | "high"; phone: boolean; reducedMotion: boolean },
): Forest {
  const lite = o.quality === "low" || o.phone;
  const grad = toon.toon("#fff").gradientMap;
  const still = o.reducedMotion ? 0 : 1;
  const windTree: SwayUniforms = { uTime: { value: 0 }, uWind: { value: 0.35 * still } };
  const windUnder: SwayUniforms = { uTime: { value: 0 }, uWind: { value: 0.75 * still } };
  const treeMat = swayMaterial(grad, windTree, THREE.DoubleSide);
  const underMat = swayMaterial(grad, windUnder, THREE.DoubleSide);
  const rangeK = (o.phone ? PHONE_RANGE : 1) * (o.quality === "low" ? LOW_RANGE : 1);

  const geos: Partial<Record<Species | "lilyFlower", THREE.BufferGeometry>> = {
    ceiba: ceibaModel(lite),
    broadleaf: broadleafModel(lite),
    tiered: tieredModel(lite),
    cecropia: cecropiaModel(),
    aguaje: aguajeModel(),
    huasai: huasaiModel(),
    shapaja: shapajaModel(),
    banana: bananaModel(),
    heliconia: heliconiaModel(),
    shrub: shrubModel(lite),
    fern: fernModel(),
    liana: lianaModel(lite),
    reed: reedModel(),
    lily: lilyModel(false),
    lilyFlower: lilyModel(true),
  };
  const kindOf: Record<Species, keyof typeof TINTS> = {
    ceiba: "tree",
    broadleaf: "tree",
    tiered: "tree",
    cecropia: "tree",
    aguaje: "palm",
    huasai: "palm",
    shapaja: "palm",
    banana: "under",
    heliconia: "under",
    shrub: "under",
    fern: "under",
    liana: "under",
    reed: "under",
    lily: "under",
  };
  const objects: THREE.Object3D[] = [];
  const tiles: THREE.InstancedMesh[] = [];
  const ranges: number[] = [];

  const build = (name: Species | "lilyFlower", list: Inst[], tints: readonly string[], under: boolean) => {
    const geo = geos[name];
    if (!geo || !list.length) return;
    const buckets = new Map<number, Inst[]>();
    const tile = TILE[name];
    for (const inst of list) {
      const key = Number.isFinite(tile) ? Math.floor(inst.x / tile) : 0;
      const b = buckets.get(key);
      if (b) b.push(inst);
      else buckets.set(key, [inst]);
    }
    const range = RANGE[name] * rangeK;
    for (const b of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, under ? underMat : treeMat, b.length);
      mesh.name = `selva-${name}`;
      b.forEach((inst, k) => {
        mesh.setMatrixAt(k, composeInst(inst, _m));
        mesh.setColorAt(k, _c.set(tints[inst.tint % tints.length] as string));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      inkAware(mesh);
      const sp = name === "lilyFlower" ? "lily" : name;
      mesh.castShadow = SHADOW.has(sp);
      mesh.receiveShadow = true;
      if (Number.isFinite(range)) mesh.userData.cullDistance = range;
      objects.push(mesh);
      tiles.push(mesh);
      ranges.push(range);
    }
  };
  for (const sp of [
    "ceiba",
    "broadleaf",
    "tiered",
    "cecropia",
    "aguaje",
    "huasai",
    "shapaja",
    "banana",
    "heliconia",
    "shrub",
    "fern",
    "liana",
    "reed",
  ] as const) {
    const under = !(kindOf[sp] === "tree" || kindOf[sp] === "palm");
    build(sp, plan.inst[sp], TINTS[kindOf[sp]], under);
  }
  // Victoria regia: pads, and the night-blooming flowers on about a fifth of them.
  build(
    "lily",
    plan.inst.lily.filter((i) => i.tint === 0),
    TINTS.under,
    true,
  );
  build(
    "lilyFlower",
    plan.inst.lily.filter((i) => i.tint === 1),
    TINTS.flower,
    true,
  );

  const center = new THREE.Vector3();
  let cursor = 0;
  return {
    objects,
    tiles,
    update(time, camera) {
      windTree.uTime.value = time;
      windUnder.uTime.value = time;
      // A slice of the tiles per frame is plenty: the camera moves a few metres per second.
      const n = tiles.length;
      const step = Math.max(24, Math.ceil(n / 4));
      for (let k = 0; k < step && k < n; k++) {
        cursor = (cursor + 1) % n;
        const mesh = tiles[cursor] as THREE.InstancedMesh;
        const range = ranges[cursor] as number;
        if (!Number.isFinite(range)) continue;
        const bs = mesh.boundingSphere;
        if (!bs) continue;
        center.copy(bs.center);
        mesh.visible = center.distanceTo(camera) - bs.radius < range;
      }
    },
    dispose() {
      treeMat.dispose();
      underMat.dispose();
      for (const g of Object.values(geos)) g?.dispose();
    },
  };
}
