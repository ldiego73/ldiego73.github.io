/**
 * Instanced four-legged animals for the coast (../tierra.ts): one InstancedMesh for the bodies, one for the
 * heads and one for all the legs (four per animal) of a species, so a whole group costs three draw calls and
 * still walks: each frame the caller hands every animal's pose (position, facing, gait phase and amplitude,
 * head pitch and turn) and the legs swing in diagonal pairs (a walk / trot), the body bobs and the head nods.
 * Models: ./land-models.ts (body, head with its origin at the neck pivot, leg with its origin at the hip).
 */
import * as THREE from "three";
import type { QuadModel } from "./land-models";

export interface QuadPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Gait phase (radians) and leg swing amplitude (radians; 0 standing). */
  phase: number;
  swing: number;
  /** Head pitch (positive: nose down, grazing) and turn (radians, relative to the body). */
  pitch: number;
  turn: number;
  scale?: number;
}

const mB = new THREE.Matrix4();
const mP = new THREE.Matrix4();
const mR = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Herd {
  readonly body: THREE.InstancedMesh;
  readonly head: THREE.InstancedMesh;
  readonly legs: THREE.InstancedMesh;
  constructor(
    private model: QuadModel,
    mat: THREE.Material,
    readonly n: number,
    name: string,
    parent: THREE.Object3D,
  ) {
    const mk = (geo: THREE.BufferGeometry, count: number, part: string) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      m.name = `${name}:${part}`;
      m.count = count;
      m.castShadow = true;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    };
    this.body = mk(model.body, n, "body");
    this.head = mk(model.head, n, "head");
    this.legs = mk(model.leg, n * 4, "legs");
  }

  /** Per-animal tint (multiplies the vertex colours: goats' coats). */
  tint(i: number, c: THREE.Color) {
    this.body.setColorAt(i, c);
    this.head.setColorAt(i, c);
    for (let k = 0; k < 4; k++) this.legs.setColorAt(i * 4 + k, c);
  }

  set(i: number, p: QuadPose) {
    const bob = Math.abs(Math.sin(p.phase)) * p.swing * 0.06;
    q.setFromAxisAngle(v.set(0, 1, 0), p.yaw);
    mB.compose(v.set(p.x, p.y + bob, p.z), q, s.setScalar(p.scale ?? 1));
    this.body.setMatrixAt(i, mB);
    const [nx, ny, nz] = this.model.neck;
    // The head nods with the stride.
    q.setFromEuler(e.set(p.pitch + Math.sin(p.phase * 2) * p.swing * 0.12, p.turn, 0, "YXZ"));
    mR.compose(v.set(nx, ny, nz), q, s.setScalar(1));
    this.head.setMatrixAt(i, mP.multiplyMatrices(mB, mR));
    for (let k = 0; k < 4; k++) {
      const [hx, hy, hz] = this.model.hips[k] as [number, number, number];
      // Diagonal pairs: front-left with back-right (0, 3), front-right with back-left (1, 2).
      const sw = (k === 0 || k === 3 ? 1 : -1) * Math.sin(p.phase) * p.swing;
      q.setFromAxisAngle(v.set(1, 0, 0), sw);
      mR.compose(v.set(hx, hy, hz), q, s.setScalar(1));
      this.legs.setMatrixAt(i * 4 + k, mP.multiplyMatrices(mB, mR));
    }
  }

  hide(i: number) {
    this.body.setMatrixAt(i, ZERO);
    this.head.setMatrixAt(i, ZERO);
    for (let k = 0; k < 4; k++) this.legs.setMatrixAt(i * 4 + k, ZERO);
  }

  set visible(on: boolean) {
    this.body.visible = on;
    this.head.visible = on;
    this.legs.visible = on;
  }

  flush() {
    for (const m of [this.body, this.head, this.legs]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of [this.body, this.head, this.legs]) {
      m.removeFromParent();
      m.dispose();
    }
    this.model.body.dispose();
    this.model.head.dispose();
    this.model.leg.dispose();
  }
}
