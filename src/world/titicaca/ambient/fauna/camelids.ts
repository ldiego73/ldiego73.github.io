/**
 * Instanced camelids for the lake's shore herds (alpacas, llamas): the shared fauna parts
 * (../../../fauna-models.ts camelidParts) merged into three vertex-shaded geometries (torso with belly and
 * tail, neck with head and eyes, leg), one InstancedMesh each, tinted per instance with the animal's coat:
 * three draw calls however many animals graze. Each frame the herd sets an animal's root pose, gait phase and
 * neck pitch; this composes root × pivot for every part. (The Cusco hub's caravan does the same with pack
 * llamas; this one has no packs and takes any camelid.)
 */
import * as THREE from "three";
import { type CamelidSpec, camelidParts } from "../../../fauna-models";
import { mergeColored, vertexToon } from "../../../merge-colors";
import { paintStrength } from "../../../style-gl";

export interface CamelidPose {
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

export class CamelidHerd {
  readonly group = new THREE.Group();
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private geos: THREE.BufferGeometry[] = [];
  private mat: THREE.MeshToonMaterial;
  private rig: ReturnType<typeof camelidParts>;
  private m = new THREE.Matrix4();
  private root = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private out = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(
    name: string,
    private spec: CamelidSpec,
    coats: readonly string[],
    readonly n: number,
  ) {
    this.group.name = name;
    // Moving bodies: no world-space painted blotches sliding over the fleece.
    this.mat = paintStrength(vertexToon(), 0);
    this.rig = camelidParts(spec);
    const P = this.rig;
    const R = P.rig;
    const c = (hex: string) => new THREE.Color(hex);
    const head = P.head.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const eyes = P.eyes.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const tail = P.tail.clone().translate(R.tail.x, R.tail.y, R.tail.z);
    const merged: Array<[string, THREE.BufferGeometry | null, number]> = [
      [
        "torso",
        mergeColored([
          { geometry: P.body, color: c("#d9d9d9") },
          { geometry: P.belly, color: c("#ffffff") },
          { geometry: tail, color: c("#c8c8c8") },
        ]),
        n,
      ],
      [
        "neck",
        mergeColored([
          { geometry: P.neck, color: c("#d9d9d9") },
          { geometry: head, color: c("#d9d9d9") },
          { geometry: eyes, color: c("#1f1a17") },
        ]),
        n,
      ],
      ["leg", mergeColored([{ geometry: P.leg, color: c("#c2c2c2") }]), n * 4],
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
    for (const [part, geo, count] of merged) {
      if (!geo) continue;
      this.geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.name = `${name}:${part}`;
      mesh.frustumCulled = false;
      mesh.castShadow = part !== "leg";
      for (let i = 0; i < count; i++) {
        const k = part === "leg" ? Math.floor(i / 4) : i;
        mesh.setColorAt(i, col.set(coats[k % coats.length] as string));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes[part] = mesh;
      this.group.add(mesh);
    }
  }

  /** Compose and store animal i's parts. */
  set(i: number, p: CamelidPose) {
    const R = this.rig.rig;
    const low = p.lying ? -this.spec.legLen * 0.78 : 0;
    const bob = p.lying ? 0 : Math.abs(Math.sin(p.phase)) * 0.03 * p.walk;
    this.q.setFromEuler(this.e.set(0, p.yaw, 0));
    this.root.compose(this.v.set(p.x, p.y + low + bob, p.z), this.q, this.one);
    this.meshes.torso?.setMatrixAt(i, this.root);
    const pitch = p.graze * 1.1 - (p.walk > 0.1 ? 0.12 : 0);
    this.tmp.makeRotationX(pitch);
    this.m.makeTranslation(R.neck.x, R.neck.y, R.neck.z).multiply(this.tmp);
    this.out.copy(this.root).multiply(this.m);
    this.meshes.neck?.setMatrixAt(i, this.out);
    R.hips.forEach((hip, k) => {
      const diag = k === 0 || k === 3 ? 1 : -1;
      const swing = p.lying ? -1.45 : Math.sin(p.phase) * 0.5 * p.walk * diag;
      this.tmp.makeRotationX(swing);
      this.m.makeTranslation(hip.x, hip.y, hip.z).multiply(this.tmp);
      this.out.copy(this.root).multiply(this.m);
      this.meshes.leg?.setMatrixAt(i * 4 + k, this.out);
    });
  }

  commit() {
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
