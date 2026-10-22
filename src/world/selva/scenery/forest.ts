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
 * Materials: vertex-colored toon on the world's shared wind (kit.ts swayMaterial → style-gl.ts windSway; the
 * ink follows the swaying vertices). Double-sided because leaves are single sheets. One material per sway
 * class (they differ only in shader defines, so no extra draws: every species is already its own mesh):
 *  - trees and palms ride the "tree" mode: the whole tree bends with height² (`treeFlex` rewrites the
 *    models' `flex` as that bend plus their own leaf weight), the crown sways and flutters, and the gust
 *    fronts roll across the canopy. The jungle's calm band (style.ts WIND.selva) keeps the trunks' feet still;
 *  - the understory (banana, heliconia, shrubs, ferns, caña brava, liana curtains) rides the "grass" mode on
 *    its own leaf weights: quiet in the still air of the forest floor, stirred by gusts, parted by the
 *    traveler and the animals, and the small plants are registered as springs, so brushing past one shakes it;
 *  - the victoria regia pads float still (no sway, no extra vertex work).
 * Ceibas and palms cast shadows; the understory doesn't (cheap shadow pass).
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { springs } from "../../wind";
import { swayMaterial } from "./kit";
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

/** How each species moves with the wind (see the header). */
type SwayClass = "tall" | "tree" | "palm" | "leafy" | "low" | "reed" | "liana" | "still";
const SWAY: Record<Species | "lilyFlower", SwayClass> = {
  ceiba: "tall",
  broadleaf: "tree",
  tiered: "tree",
  cecropia: "tree",
  aguaje: "palm",
  huasai: "palm",
  shapaja: "palm",
  banana: "leafy",
  heliconia: "leafy",
  shrub: "low",
  fern: "low",
  liana: "liana",
  reed: "reed",
  lily: "still",
  lilyFlower: "still",
};
/**
 * Tree classes: reference height H (model units, ≈ the crown top: ceiba 26, moena 13, shihuahuaco 17,
 * cetico 11, palms 8–12) for the height² trunk bend and the crown's flutter band, and how much of the models'
 * own leaf weight (crown tops, frond tips, hanging lianas) rides on top of the bend.
 */
const TREE_SWAY = { tall: { h: 24, leaf: 1.5 }, tree: { h: 13, leaf: 1.5 }, palm: { h: 10, leaf: 2.5 } } as const;
/**
 * Understory amplitude multipliers on the models' leaf weights. The forest floor sits inside the jungle's calm
 * band (wind × 0.35), so without them the undergrowth would stand dead still; with them it breathes a little
 * and moves clearly only when a gust comes through, while the canopy above does most of the moving.
 */
const UNDER_AMP = { leafy: 3, low: 2.5, reed: 3, liana: 2.5 } as const;
/** Understory species registered as springs (brushing past one shakes it), with their trunk radius. */
const SPRINGY: Partial<Record<Species, number>> = { banana: 0.35, heliconia: 0.3, shrub: 0.6, fern: 0.35 };

/**
 * Rewrites a tree model's `flex` as the shared wind's "tree" weight: the trunk bend (height² × H × 0.1, the
 * same weight wind-glsl.ts uses without a flex attribute) plus the model's own leaf weight × `leaf`, so the
 * crown tops, palm fronds and hanging lianas move a little more than the bend that carries them.
 */
export function treeFlex(geo: THREE.BufferGeometry, h: number, leaf: number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const old = geo.getAttribute("flex") as THREE.BufferAttribute | undefined;
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = Math.max(0, pos.getY(i)) / h;
    out[i] = y * y * h * 0.1 + (old ? old.getX(i) : 0) * leaf;
  }
  geo.setAttribute("flex", new THREE.BufferAttribute(out, 1));
  return geo;
}

export interface Forest {
  objects: THREE.Object3D[];
  /** Instanced meshes with their view range (for stats). */
  tiles: THREE.InstancedMesh[];
  update(camera: THREE.Vector3): void;
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
  o: { quality: "low" | "high"; phone: boolean },
): Forest {
  const lite = o.quality === "low" || o.phone;
  const grad = toon.toon("#fff").gradientMap;
  const mats = new Map<SwayClass, THREE.Material>();
  const materialFor = (c: SwayClass) => {
    let m = mats.get(c);
    if (!m) {
      const D = THREE.DoubleSide;
      if (c === "tall" || c === "tree" || c === "palm")
        m = swayMaterial(grad, { mode: "tree", flex: true, height: TREE_SWAY[c].h }, D);
      else if (c === "still")
        m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: grad, side: D });
      else m = swayMaterial(grad, { mode: "grass", flex: true, amp: UNDER_AMP[c] }, D);
      mats.set(c, m);
    }
    return m;
  };
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
  for (const [sp, g] of Object.entries(geos)) {
    const c = SWAY[sp as Species];
    if (g && (c === "tall" || c === "tree" || c === "palm")) treeFlex(g, TREE_SWAY[c].h, TREE_SWAY[c].leaf);
  }
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

  const build = (name: Species | "lilyFlower", list: Inst[], tints: readonly string[]) => {
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
      const mesh = new THREE.InstancedMesh(geo, materialFor(SWAY[name]), b.length);
      mesh.name = `selva-${name}`;
      b.forEach((inst, k) => {
        mesh.setMatrixAt(k, composeInst(inst, _m));
        mesh.setColorAt(k, _c.set(tints[inst.tint % tints.length] as string));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
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
  ] as const)
    build(sp, plan.inst[sp], TINTS[kindOf[sp]]);
  // Victoria regia: pads, and the night-blooming flowers on about a fifth of them.
  build(
    "lily",
    plan.inst.lily.filter((i) => i.tint === 0),
    TINTS.under,
  );
  build(
    "lilyFlower",
    plan.inst.lily.filter((i) => i.tint === 1),
    TINTS.flower,
  );
  // Small plants shake when the traveler or an animal brushes past (wind.ts springs; trunk radius × scale).
  const unspring = springs.add(
    (Object.keys(SPRINGY) as Species[]).flatMap((sp) =>
      plan.inst[sp].map((i) => ({ x: i.x, z: i.z, r: (SPRINGY[sp] as number) * i.s })),
    ),
  );

  const center = new THREE.Vector3();
  let cursor = 0;
  return {
    objects,
    tiles,
    update(camera) {
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
      unspring();
      for (const m of mats.values()) m.dispose();
      for (const g of Object.values(geos)) g?.dispose();
    },
  };
}
