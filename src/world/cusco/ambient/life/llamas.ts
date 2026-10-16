/**
 * Instanced pack llamas for the hub's caravan: the fauna llama's parts (../../../fauna-models.ts
 * camelidParts(LLAMA)) merged into four vertex-shaded geometries (torso with belly and tail, neck with head
 * and eyes, leg, pack cloth with saddlebags), one InstancedMesh each, tinted per instance with the llama's coat
 * or its pack's dye: four draw calls however many llamas walk. Each frame the caravan sets a llama's root pose,
 * gait phase and neck pitch; this composes root × pivot for every part.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { camelidParts, LLAMA } from "../../../fauna-models";
import { mergeColored, vertexToon } from "../../../merge-colors";

/** Coats (instance colours; the vertex shades darken the body a little under the paler belly). */
const COATS = ["#fbf6ee", "#a8724a", "#5a463a", "#e0bf92"];
const CLOTH = ["#c4383f", "#2a9d8f", "#dda63c", "#3446a6"];

export interface LlamaPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Gait phase (radians) and amount 0 (standing) … 1 (walking). */
  phase: number;
  walk: number;
  /** Head pitch: 0 up, positive grazing. */
  graze: number;
  /** Lying down (at night): legs folded, body low. */
  lying: boolean;
}

export class LlamaHerd {
  readonly group = new THREE.Group();
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private geos: THREE.BufferGeometry[] = [];
  private mat: THREE.MeshToonMaterial;
  private rig = camelidParts(LLAMA);
  private m = new THREE.Matrix4();
  private root = new THREE.Matrix4();
  private neck = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(
    _env: WorldEnv,
    private n: number,
  ) {
    this.group.name = "cusco-llamas";
    this.mat = vertexToon();
    const P = this.rig;
    const R = P.rig;
    const c = (hex: string) => new THREE.Color(hex);
    // Four merged parts (vertex shades × the instance's coat or dye): torso, neck + head, leg, pack.
    const head = P.head.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const eyes = P.eyes.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const tail = P.tail.clone().translate(R.tail.x, R.tail.y, R.tail.z);
    const merged: Array<[string, THREE.BufferGeometry | null, number, boolean]> = [
      [
        "torso",
        mergeColored([
          { geometry: P.body, color: c("#d9d9d9") },
          { geometry: P.belly, color: c("#ffffff") },
          { geometry: tail, color: c("#c8c8c8") },
        ]),
        n,
        true,
      ],
      [
        "neck",
        mergeColored([
          { geometry: P.neck, color: c("#d9d9d9") },
          { geometry: head, color: c("#d9d9d9") },
          { geometry: eyes, color: c("#1f1a17") },
        ]),
        n,
        true,
      ],
      ["leg", mergeColored([{ geometry: P.leg, color: c("#c2c2c2") }]), n * 4, false],
      [
        "pack",
        mergeColored([
          { geometry: P.packCloth, color: c("#ffffff") },
          { geometry: P.packBags, color: c("#b0b0b0") },
        ]),
        n,
        false,
      ],
    ];
    for (const g of [
      P.body,
      P.belly,
      P.tail,
      P.neck,
      P.head,
      P.eyes,
      P.leg,
      P.packCloth,
      P.packBags,
      P.tassel,
      head,
      eyes,
      tail,
    ])
      g.dispose();
    const col = new THREE.Color();
    for (const [name, geo, count, shadow] of merged) {
      if (!geo) continue;
      this.geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.name = `cusco-llamas:${name}`;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      for (let i = 0; i < count; i++) {
        const k = name === "leg" ? Math.floor(i / 4) : i;
        const hex = name === "pack" ? CLOTH[k % CLOTH.length] : COATS[k % COATS.length];
        mesh.setColorAt(i, col.set(hex as string));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes[name] = mesh;
      this.group.add(mesh);
    }
  }

  private put(name: string, i: number, m: THREE.Matrix4) {
    this.meshes[name]?.setMatrixAt(i, m);
  }

  /** Compose and store llama i's parts. */
  set(i: number, p: LlamaPose) {
    const R = this.rig.rig;
    const low = p.lying ? -LLAMA.legLen * 0.78 : 0;
    const bob = p.lying ? 0 : Math.abs(Math.sin(p.phase)) * 0.03 * p.walk;
    this.q.setFromEuler(this.e.set(0, p.yaw, 0));
    this.root.compose(this.v.set(p.x, p.y + low + bob, p.z), this.q, this.one);
    this.put("torso", i, this.root);
    this.put("pack", i, this.root);
    // Neck pivot: forward lean while walking, down when grazing (the head is fixed on it).
    const pitch = p.graze * 1.1 - (p.walk > 0.1 ? 0.12 : 0);
    this.tmp.makeRotationX(pitch);
    this.m.makeTranslation(R.neck.x, R.neck.y, R.neck.z).multiply(this.tmp);
    this.neck.copy(this.root).multiply(this.m);
    this.put("neck", i, this.neck);
    R.hips.forEach((hip, k) => {
      const diag = k === 0 || k === 3 ? 1 : -1;
      const swing = p.lying ? -1.45 : Math.sin(p.phase) * 0.5 * p.walk * diag;
      this.tmp.makeRotationX(swing);
      this.m.makeTranslation(hip.x, hip.y, hip.z).multiply(this.tmp);
      this.neck.copy(this.root).multiply(this.m);
      this.put("leg", i * 4 + k, this.neck);
    });
  }

  commit() {
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  get count() {
    return this.n;
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
