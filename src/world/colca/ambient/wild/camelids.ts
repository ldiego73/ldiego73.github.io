/**
 * Instanced camelids for the Kuntisuyu (the farmer's pack llamas in ../gente.ts, the wild vicuñas in
 * ../vicunas.ts): the shared fauna camelid (../../../fauna-models.ts camelidParts) merged into four
 * vertex-shaded geometries (torso with belly and tail, neck with head and eyes, leg, and optionally the pack
 * cloth with saddlebags), one InstancedMesh each, tinted per instance (coat or pack dye). Each frame the owner
 * sets a root pose, gait phase and neck pitch; this composes root × pivot for every part. Same rig as the
 * Cusco hub's caravan, kept here so this world never imports another world's modules.
 */
import * as THREE from "three";
import { type CamelidSpec, camelidParts } from "../../../fauna-models";
import { mergeColored, vertexToon } from "../../../merge-colors";

export interface CamelidPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Gait phase (radians) and amount 0 (standing) … 1 (walking or running). */
  phase: number;
  walk: number;
  /** Head pitch: 0 up, positive grazing. */
  graze: number;
  lying: boolean;
}

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class CamelidHerd {
  readonly group = new THREE.Group();
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private geos: THREE.BufferGeometry[] = [];
  private mat = vertexToon();
  private rig: ReturnType<typeof camelidParts>;
  private m = new THREE.Matrix4();
  private root = new THREE.Matrix4();
  private neck = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(
    name: string,
    private spec: CamelidSpec,
    readonly n: number,
    coats: readonly string[],
    packs: readonly string[] | null,
    /** Vertex colours (× the instance's coat): a vicuña's cinnamon back over white underparts. */
    tone: { body: string; belly: string } = { body: "#d9d9d9", belly: "#ffffff" },
  ) {
    this.group.name = name;
    this.rig = camelidParts(spec);
    const P = this.rig;
    const R = P.rig;
    const c = (hex: string) => new THREE.Color(hex);
    const head = P.head.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const eyes = P.eyes.clone().translate(R.headOnNeck.x, R.headOnNeck.y, R.headOnNeck.z);
    const tail = P.tail.clone().translate(R.tail.x, R.tail.y, R.tail.z);
    const parts: Array<[string, THREE.BufferGeometry | null, number, boolean]> = [
      [
        "torso",
        mergeColored([
          { geometry: P.body, color: c(tone.body) },
          { geometry: P.belly, color: c(tone.belly) },
          { geometry: tail, color: c(tone.body) },
        ]),
        n,
        true,
      ],
      [
        "neck",
        mergeColored([
          { geometry: P.neck, color: c(tone.body) },
          { geometry: head, color: c(tone.body) },
          { geometry: eyes, color: c("#1f1a17") },
        ]),
        n,
        true,
      ],
      ["leg", mergeColored([{ geometry: P.leg, color: c(tone.body).multiplyScalar(0.9) }]), n * 4, false],
    ];
    if (packs)
      parts.push([
        "pack",
        mergeColored([
          { geometry: P.packCloth, color: c("#ffffff") },
          { geometry: P.packBags, color: c("#b0b0b0") },
        ]),
        n,
        false,
      ]);
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
    for (const [part, geo, count, shadow] of parts) {
      if (!geo) continue;
      this.geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.name = `${name}:${part}`;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      for (let i = 0; i < count; i++) {
        const k = part === "leg" ? Math.floor(i / 4) : i;
        const hex = part === "pack" && packs ? packs[k % packs.length] : coats[k % coats.length];
        mesh.setColorAt(i, col.set(hex as string));
        mesh.setMatrixAt(i, HIDE);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes[part] = mesh;
      this.group.add(mesh);
    }
  }

  private put(part: string, i: number, m: THREE.Matrix4) {
    this.meshes[part]?.setMatrixAt(i, m);
  }

  hide(i: number) {
    this.put("torso", i, HIDE);
    this.put("pack", i, HIDE);
    this.put("neck", i, HIDE);
    for (let k = 0; k < 4; k++) this.put("leg", i * 4 + k, HIDE);
  }

  set(i: number, p: CamelidPose) {
    const R = this.rig.rig;
    const low = p.lying ? -this.spec.legLen * 0.78 : 0;
    const bob = p.lying ? 0 : Math.abs(Math.sin(p.phase)) * 0.03 * p.walk;
    this.q.setFromEuler(this.e.set(0, p.yaw, 0));
    this.root.compose(this.v.set(p.x, p.y + low + bob, p.z), this.q, this.one);
    this.put("torso", i, this.root);
    this.put("pack", i, this.root);
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

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
