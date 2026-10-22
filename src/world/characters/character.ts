/**
 * Three.js side of the new characters: turns a built archetype (./build.ts, cached per archetype) into a
 * Group with a real Skeleton and one or two SkinnedMeshes sharing it:
 *
 *   body   SkinnedMesh, opaque, palette + cuts + face decal (1 draw call, + its ink and shadow passes)
 *   cloth  SkinnedMesh, double-sided, on the cloth wind (1 draw call), when the archetype has cloth
 *
 * Geometry is shared by every instance of an archetype; each instance owns its bones, uniforms (palette,
 * expression cell) and materials. Bone inverses are the bind positions (the bind pose is world aligned), so an
 * instance can be built anywhere and moved freely.
 *
 * Performance plan (not needed by the prototype): because a whole body is one geometry on ≤ 32 bones with
 * palette slots, a crowd can draw as ONE InstancedMesh per archetype with GPU skinning from a bone DataTexture
 * (row per instance: 32 × 4 texels of matrices), per-instance palette attributes (like people/rig.ts) and a
 * per-instance face cell; a far LOD is the same pipeline polygonised at 2–3× the voxel size.
 */
import * as THREE from "three";
import type { Built, GeoData } from "./build";
import { bodyMaterial, type CharacterUniforms, characterUniforms, clothMaterial, paletteColors } from "./material";

export interface CharacterAsset {
  built: Built;
  body: THREE.BufferGeometry;
  cloth: THREE.BufferGeometry | null;
}

export interface CharacterInstance {
  group: THREE.Group;
  body: THREE.SkinnedMesh;
  cloth: THREE.SkinnedMesh | null;
  skeleton: THREE.Skeleton;
  bones: Record<string, THREE.Bone>;
  /** Bind positions by bone name (model space). */
  rest: Record<string, THREE.Vector3>;
  uniforms: CharacterUniforms;
  /** Show face atlas cell 0..3 (neutral, blink, smile, half-lidded). */
  setFace(cell: number): void;
  dispose(): void;
}

function toGeometry(d: GeoData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(d.normal, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(d.skinIndex, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(d.skinWeight, 4));
  g.setAttribute("aSlots", new THREE.BufferAttribute(d.slots, 2));
  g.setAttribute("aCut", new THREE.BufferAttribute(d.cut, 1));
  g.setAttribute("aFace", new THREE.BufferAttribute(d.face, 3));
  g.setAttribute("color", new THREE.BufferAttribute(d.shade, 3));
  if (d.uv) g.setAttribute("uv", new THREE.BufferAttribute(d.uv, 2));
  if (d.flex) g.setAttribute("flex", new THREE.BufferAttribute(d.flex, 1));
  if (d.cloth) g.setAttribute("aCloth", new THREE.BufferAttribute(d.cloth, 4));
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  // Room for poses and wind (the bind pose bounds would cull a raised arm).
  if (g.boundingSphere) g.boundingSphere.radius *= 1.4;
  return g;
}

const assets = new Map<string, CharacterAsset>();

/** Build (once) and cache an archetype's geometry. */
export function characterAsset(key: string, build: () => Built): CharacterAsset {
  let a = assets.get(key);
  if (!a) {
    const built = build();
    a = { built, body: toGeometry(built.body), cloth: built.cloth ? toGeometry(built.cloth) : null };
    assets.set(key, a);
  }
  return a;
}

export interface InstanceOpts {
  palette: readonly string[];
  face: THREE.Texture | null;
  pattern?: THREE.Texture | null;
  /** Cloth wind amplitude (1 = a flag; wool ≈ 0.3). */
  clothAmp?: number;
}

export function createCharacter(asset: CharacterAsset, o: InstanceOpts): CharacterInstance {
  const group = new THREE.Group();
  const defs = asset.built.bones;
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
    else group.add(bone);
  }
  const inverses = defs.map((d) => new THREE.Matrix4().makeTranslation(-d.at[0], -d.at[1], -d.at[2]));
  const skeleton = new THREE.Skeleton(list, inverses);
  const uniforms = characterUniforms(paletteColors(o.palette), o.face);
  const bodyMat = bodyMaterial(uniforms);
  const body = new THREE.SkinnedMesh(asset.body, bodyMat);
  body.name = "character:body";
  body.castShadow = true;
  body.receiveShadow = true;
  body.bind(skeleton, new THREE.Matrix4());
  group.add(body);
  let cloth: THREE.SkinnedMesh | null = null;
  let clothMat: THREE.Material | null = null;
  if (asset.cloth && o.pattern) {
    clothMat = clothMaterial(uniforms, o.pattern, o.clothAmp ?? 0.35);
    cloth = new THREE.SkinnedMesh(asset.cloth, clothMat);
    cloth.name = "character:cloth";
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    cloth.bind(skeleton, new THREE.Matrix4());
    group.add(cloth);
  }
  return {
    group,
    body,
    cloth,
    skeleton,
    bones,
    rest,
    uniforms,
    setFace(cell) {
      uniforms.chFaceCell.value.x = cell * uniforms.chFaceCell.value.y;
    },
    dispose() {
      bodyMat.dispose();
      clothMat?.dispose();
      skeleton.dispose();
      group.removeFromParent();
    },
  };
}
