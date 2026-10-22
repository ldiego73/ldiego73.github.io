/**
 * A skeleton of plain Three bones built from an archetype's bone list (./build.ts `BoneDef`), not attached to
 * any mesh: what the animators pose (./anim-human.ts, ./npc-anim.ts). A single character (./character.ts)
 * binds a SkinnedMesh to it; a crowd member (./crowd.ts) copies its skinning matrices into the crowd's bone
 * texture instead.
 *
 * Bind pose is world aligned (no bone rotation), so a bone's inverse bind matrix is a translation by minus its
 * bind position, and a skinning matrix is `bone.matrixWorld` (relative to the rig root) translated by it.
 */
import * as THREE from "three";
import type { BoneDef } from "./build";

/** What an animator needs: bones by name, their bind positions, and a face cell setter. */
export interface Rig {
  bones: Record<string, THREE.Bone>;
  /** Bind positions by bone name (model space). */
  rest: Record<string, THREE.Vector3>;
  /** Show face atlas cell 0..3 (neutral, blink, smile, half-lidded). */
  setFace(cell: number): void;
}

export interface Skeleton {
  /** Parent of the root bones (identity; the owner places the person, not this). */
  root: THREE.Group;
  /** Bones in bone-index order. */
  list: THREE.Bone[];
  bones: Record<string, THREE.Bone>;
  rest: Record<string, THREE.Vector3>;
  defs: BoneDef[];
}

export function makeSkeleton(defs: BoneDef[]): Skeleton {
  const root = new THREE.Group();
  const list: THREE.Bone[] = [];
  const bones: Record<string, THREE.Bone> = {};
  const rest: Record<string, THREE.Vector3> = {};
  for (const d of defs) {
    const bone = new THREE.Bone();
    bone.name = d.name;
    const parent = d.parent >= 0 ? defs[d.parent] : null;
    bone.position.set(d.at[0] - (parent?.at[0] ?? 0), d.at[1] - (parent?.at[1] ?? 0), d.at[2] - (parent?.at[2] ?? 0));
    list.push(bone);
    bones[d.name] = bone;
    rest[d.name] = new THREE.Vector3(...d.at);
    if (d.parent >= 0) list[d.parent]?.add(bone);
    else root.add(bone);
  }
  return { root, list, bones, rest, defs };
}

/**
 * Writes the skinning matrices (3 rows of 4 floats per bone) of a posed skeleton into `out` at `offset`
 * (the crowd's bone texture row). The root group must be at the identity.
 */
export function writeSkinRows(sk: Skeleton, out: Float32Array, offset: number) {
  sk.root.updateMatrixWorld(true);
  for (let i = 0; i < sk.list.length; i++) {
    const m = (sk.list[i] as THREE.Bone).matrixWorld.elements;
    const d = sk.defs[i] as BoneDef;
    const bx = -d.at[0];
    const by = -d.at[1];
    const bz = -d.at[2];
    const o = offset + i * 12;
    // Row r of M × T(−bind): (m[r], m[r+4], m[r+8], m[r]·bx + m[r+4]·by + m[r+8]·bz + m[r+12]).
    for (let r = 0; r < 3; r++) {
      const a = m[r] as number;
      const b = m[r + 4] as number;
      const c = m[r + 8] as number;
      out[o + r * 4] = a;
      out[o + r * 4 + 1] = b;
      out[o + r * 4 + 2] = c;
      out[o + r * 4 + 3] = a * bx + b * by + c * bz + (m[r + 12] as number);
    }
  }
}
