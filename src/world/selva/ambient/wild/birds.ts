/**
 * The morpho butterfly for the jungle's winged rig (one merged vertex-colored geometry, wings and body animated
 * in the vertex shader by the shared bird rig of flora/material.ts: one draw call per species, ink-correct):
 * insects.ts and kene.ts flutter them. The jungle's birds are the shared animal core's (./beasts.ts).
 * The model faces +Z with the origin at the body; wings are modeled spread along ±X and fold back with
 * pose.w = 1 (see flora/material.ts rigMaterial). Real size ≈ 0.15 span (instances are scaled up a little so
 * they read from the follow camera).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { GeoBuilder } from "../../../flora/geom";
import { inkAware, rigMaterial } from "../../../flora/material";
import { col, egg, planform, ramp, tube, V3 } from "./kit";

export interface WingModel {
  geo: THREE.BufferGeometry;
  shoulder: THREE.Vector3;
  neck: THREE.Vector3;
}

/** Perched wing roll (with pose.w = 1 the wings hang closed along the flanks). */
export const FOLDED = 1.35;

/** Two-tone by normal: `under` where the surface faces down, `top` elsewhere. */
const _twoTone = (top: string, under: string, split = 0) => {
  const a = col(top);
  const b = col(under);
  return (_p: THREE.Vector3, n: THREE.Vector3) => (n.y < split ? b : a);
};

function _legs(b: GeoBuilder, hipY: number, spread: number, r: number, color: string, z = 0) {
  for (const s of [-1, 1]) b.add(tube(r, r * 0.8, s * spread, hipY, z, s * spread, 0, z + 0.01, 4), { color });
}

/** Blue morpho (Morpho menelaus / helenor): electric blue above, brown with eyespots below. */
export function morphoModel(): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.006, 0.0, 0.01);
  const neck = V3(0, 0, 0.03);
  b.add(egg(0.008, 1, 1, 4.5, 0, 0, -0.005), { color: "#2a2420" });
  b.add(egg(0.007, 1, 1, 1, 0, 0.002, 0.034), { color: "#2a2420", rig: [0, 1] });
  const wing: Array<[number, number]> = [
    [0, -0.03],
    [0.05, -0.05],
    [0.085, -0.035],
    [0.08, 0.005],
    [0.06, 0.03],
    [0.065, 0.06],
    [0.04, 0.08],
    [0.01, 0.06],
    [0, 0.03],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.002).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: (p, n) => {
        if (n.y < 0) {
          // Underside: brown with a pale eyespot.
          const ex = Math.abs(p.x) - 0.045;
          const ez = p.z + 0.02;
          return ex * ex + ez * ez < 0.00012 ? col("#e8d7a8") : col("#6a4a2c");
        }
        const s = Math.abs(p.x);
        return s > 0.07 || p.z < -0.042 ? col("#10131c") : col(s < 0.02 ? "#1f6fe0" : "#38b6ff");
      },
      rig: [side, 0],
    });
  return { geo: b.build({ rig: true }), shoulder, neck };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** One winged species: an InstancedMesh with the bird rig and its per-instance pose. */
export class WingSet {
  readonly mesh: THREE.InstancedMesh;
  private readonly pose: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.Material;
  constructor(
    env: WorldEnv,
    name: string,
    model: WingModel,
    readonly capacity: number,
  ) {
    const n = Math.max(1, capacity);
    this.mat = rigMaterial(ramp(env), { uShoulder: { value: model.shoulder }, uNeck: { value: model.neck } }, name);
    this.pose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.pose.setUsage(THREE.DynamicDrawUsage);
    model.geo.setAttribute("pose", this.pose);
    this.mesh = new THREE.InstancedMesh(model.geo, this.mat, n);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    inkAware(this.mesh);
  }
  /** Writes instance i: position, yaw / pitch / bank, scale, and the rig pose. */
  set(
    i: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    bank: number,
    scale: number,
    wing: number,
    headYaw: number,
    headPitch: number,
    fold: number,
  ) {
    _q.setFromEuler(_e.set(pitch, yaw, bank, "YXZ"));
    _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
    this.mesh.setMatrixAt(i, _m);
    this.pose.setXYZW(i, wing, headYaw, headPitch, fold);
  }
  commit(n: number) {
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.pose.needsUpdate = true;
      cullable(this.mesh);
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/**
 * Lets the renderer frustum-cull a live instanced species as a whole: the bounding sphere of this frame's
 * instances (a few dozen at most, cheap), grown a little for the posed wings the vertex shader moves.
 */
function cullable(mesh: THREE.InstancedMesh) {
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
}
