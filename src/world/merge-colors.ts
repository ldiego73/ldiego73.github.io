/**
 * Draw-call helpers: fold several flat-colored toon meshes into ONE mesh whose color lives in a vertex
 * attribute (same toon ramp, same ink outline, one draw per pass instead of one per color).
 * `material.color` is already in linear working space, so it is copied as-is into the attribute:
 * toon(color) and vertexToon × vertex color shade identically.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { gradientMap } from "./toon";

export interface ColoredPart {
  geometry: THREE.BufferGeometry;
  /** Linear working-space color (e.g. a material's `.color`). */
  color: THREE.Color;
  /** Baked into the vertices (e.g. the part mesh's local matrix). */
  matrix?: THREE.Matrix4;
}

/** Merges parts into one non-indexed geometry with position/normal/uv/color. Inputs are not disposed. */
export function mergeColored(parts: ColoredPart[]): THREE.BufferGeometry | null {
  const list: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    for (const name of Object.keys(g.attributes))
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    const n = g.getAttribute("position").count;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = p.color.r;
      col[i * 3 + 1] = p.color.g;
      col[i * 3 + 2] = p.color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (p.matrix) g.applyMatrix4(p.matrix);
    list.push(g);
  }
  const merged = list.length ? mergeGeometries(list, false) : null;
  for (const g of list) g.dispose();
  merged?.computeBoundingSphere();
  return merged;
}

/** A white toon material that takes its color from the vertices (owner disposes it). */
export function vertexToon(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gradientMap() });
}

/**
 * Replaces the plain-colored toon meshes directly under `group` (a Kit build: one mesh per color) with a
 * single vertex-colored mesh named `<group.name>:vc` on `mat`. Meshes with a map, emissive glow or a
 * non-toon material are left alone. Their geometries are disposed (Kit geometries belong to the build);
 * materials are not (they come from the shared toon cache). Returns the merged mesh, or null.
 */
export function flattenToonGroup(group: THREE.Object3D, mat: THREE.Material): THREE.Mesh | null {
  const parts: ColoredPart[] = [];
  const meshes: THREE.Mesh[] = [];
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    const tm = m.material as THREE.MeshToonMaterial;
    if (!m.isMesh || Array.isArray(tm) || !tm.isMeshToonMaterial || tm.map || tm.vertexColors) continue;
    if (tm.emissive && tm.emissive.getHex() !== 0) continue;
    if ((m as THREE.InstancedMesh).isInstancedMesh || !m.visible) continue;
    m.updateMatrix();
    parts.push({ geometry: m.geometry, color: tm.color, matrix: m.matrix });
    meshes.push(m);
  }
  if (meshes.length < 2) return null;
  const merged = mergeColored(parts);
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = `${group.name}:vc`;
  mesh.layers.mask = meshes[0]!.layers.mask;
  mesh.castShadow = meshes.some((m) => m.castShadow);
  mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  group.add(mesh);
  return mesh;
}
