/**
 * Instanced Andean condors for the Kuntisuyu (../condores.ts riding the thermals, ../cruz.ts the finale's
 * rising flock): the shared fauna condor (../../../fauna-models.ts condorParts) merged into three
 * vertex-coloured geometries (body with the white collar and the bare head, right wing with its white
 * band, left wing with its band), one InstancedMesh each: three draw calls however many birds fly. Each frame
 * the owner sets a bird's position, heading, bank, pitch and wing angle; this composes root × shoulder ×
 * wing for the wings.
 */
import * as THREE from "three";
import { condorParts } from "../../../fauna-models";
import { mergeColored, vertexToon } from "../../../merge-colors";
import { paintStrength } from "../../../style-gl";

export interface CondorPose {
  x: number;
  y: number;
  z: number;
  /** Heading (models face +Z). */
  yaw: number;
  /** Roll into the turn (radians, + right wing down) and nose pitch. */
  bank: number;
  pitch: number;
  /** Wing angle at the shoulder: 0 flat (soaring), + up. */
  wing: number;
  /** 0 spread … 1 folded back along the body (a perched bird); default 0. */
  fold?: number;
}

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class CondorFlock {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private geos: THREE.BufferGeometry[] = [];
  /** No painted blotches: world-space patches would slide over a flying bird. */
  private mat = paintStrength(vertexToon(), 0);
  private shoulder: THREE.Vector3;
  private root = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private fm = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private v = new THREE.Vector3();
  private s: THREE.Vector3;

  constructor(
    name: string,
    readonly n: number,
    scale = 0.9,
  ) {
    const P = condorParts();
    const black = new THREE.Color("#1e1b1a");
    const white = new THREE.Color("#efe9df");
    const head = new THREE.Color("#8d5f55");
    const body = mergeColored([
      { geometry: P.body, color: black },
      { geometry: P.collar, color: white },
      { geometry: P.head, color: head },
    ]) as THREE.BufferGeometry;
    const wr = mergeColored([
      { geometry: P.wingR, color: black },
      { geometry: P.patchR, color: white },
    ]) as THREE.BufferGeometry;
    const wl = mergeColored([
      { geometry: P.wingL, color: black },
      { geometry: P.patchL, color: white },
    ]) as THREE.BufferGeometry;
    for (const g of [P.body, P.collar, P.head, P.wingR, P.wingL, P.patchR, P.patchL]) g.dispose();
    this.geos.push(body, wr, wl);
    this.shoulder = P.shoulder;
    this.s = new THREE.Vector3(scale, scale, scale);
    const mk = (g: THREE.BufferGeometry, part: string) => {
      const mesh = new THREE.InstancedMesh(g, this.mat, n);
      mesh.name = `${name}:${part}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, HIDE);
      this.group.add(mesh);
      return mesh;
    };
    this.body = mk(body, "body");
    this.wingR = mk(wr, "wing-r");
    this.wingL = mk(wl, "wing-l");
    this.group.name = name;
  }

  set(i: number, p: CondorPose) {
    this.q.setFromEuler(this.e.set(p.pitch, p.yaw, -p.bank));
    this.root.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
    this.body.setMatrixAt(i, this.root);
    const fold = p.fold ?? 0;
    for (const side of [1, -1] as const) {
      const sh = this.shoulder;
      this.m.makeRotationZ(side * p.wing);
      if (fold > 0) {
        // Folded: the wing sweeps back along the flank (about the shoulder's vertical axis) and shortens, so a
        // perched bird reads as a closed silhouette instead of a plank.
        this.fm.makeScale(1 - 0.45 * fold, 1, 1);
        this.m.multiply(this.fm);
        this.fm.makeRotationY(side * fold * 1.45);
        this.m.premultiply(this.fm);
      }
      this.m.setPosition(side * sh.x, sh.y, sh.z);
      this.m.premultiply(this.root);
      (side === 1 ? this.wingR : this.wingL).setMatrixAt(i, this.m);
    }
  }

  hide(i: number) {
    this.body.setMatrixAt(i, HIDE);
    this.wingR.setMatrixAt(i, HIDE);
    this.wingL.setMatrixAt(i, HIDE);
  }

  commit() {
    this.body.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [this.body, this.wingR, this.wingL]) m.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
