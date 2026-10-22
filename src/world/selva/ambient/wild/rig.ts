/**
 * The old jungle animal rigs' geometry helpers (joint ids, leg phase tables, `buildRigGeometry`): the jungle
 * now draws its animals on the shared animal core (../../../characters/animals, ./beasts.ts). What is left
 * here only builds the old models that the animals harness lines up beside the new ones
 * (characters/animals/dev/old.ts) and the morpho butterflies' frustum culling (./birds.ts WingSet); delete it
 * with that comparison.
 */
import type * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";

export const J = { body: 0, fl: 1, fr: 2, hl: 3, hr: 4, head: 5, tail: 6 } as const;

/** Leg phase offsets (fraction of a cycle) for FL, FR, HL, HR. */
export const GAIT_WALK: readonly [number, number, number, number] = [0.25, 0.75, 0, 0.5];
export const GAIT_BOUND: readonly [number, number, number, number] = [0, 0.08, 0.5, 0.58];
export const GAIT_TROT: readonly [number, number, number, number] = [0, 0.5, 0.5, 0];

export interface RigSpec {
  /** Pivots in model space: legs FL, FR, HL, HR, then head, then tail root. */
  legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  head: THREE.Vector3;
  tail: THREE.Vector3;
  /** Tail length along −Z (bend reaches full angle at the tip). */
  tailLen: number;
  gait: readonly [number, number, number, number];
}

/** Builds a rig geometry from parts: `b.add(geo, { color, flex: jointId })` → attribute `joint`. */
export function buildRigGeometry(b: GeoBuilder): THREE.BufferGeometry {
  const g = b.build({ flex: true });
  const j = g.getAttribute("flex");
  g.deleteAttribute("flex");
  g.setAttribute("joint", j);
  return g;
}

export { GeoBuilder };

/**
 * Lets the renderer frustum-cull a live instanced species as a whole: the bounding sphere of this frame's
 * instances (a few dozen at most, cheap), grown a little for the posed limbs and wings the vertex shader
 * moves. A troop behind the camera then costs no draw call (nor its outline pass).
 */
export function cullable(mesh: THREE.InstancedMesh) {
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
}
