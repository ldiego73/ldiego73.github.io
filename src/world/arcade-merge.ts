/**
 * Draw-call diet for the arcade tambo's cabinets (arcade-lobby/cabinet.ts builds ~25 box meshes each,
 * shared with the lobby page, so the world merges them after the fact instead of changing that module).
 * Per cabinet, inside its lifting `model` group:
 *  - body (stone map) + edges + neutral bits → ONE mesh: a small atlas holds the stone tile plus a white
 *    texel, vertex colors carry each material's color (exactly color × texel, as before);
 *  - trim blocks → ONE mesh on the cabinet's own trim material (setFocus keeps brightening it);
 *  - screen and marquee stay as they are (their own textures; the screen animates).
 * 25 → 4 meshes per cabinet, per pass. Interaction (hits on cab.group), focus lift and names keep working.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cabinet } from "../arcade-lobby/cabinet";
import { cullDistance, deviceCullFactor } from "./detail-cull";

/** Rows in the atlas: 16 stone rows, one duplicated bottom row (seam guard), one white row. */
const TILE = 16;
const ROWS = TILE + 2;

/** Body uv.v (0..1 over the stone tile) → atlas v; white texel center for unmapped parts. */
export const atlasV = (v: number) => (2 + v * TILE) / ROWS;
export const WHITE_UV = { u: 0.5 / TILE, v: 0.5 / ROWS };

/** Merged, a cabinet reads as one ~1 u object: keep it as far as its old body blocks (radius ≤ 0.9 band). */
const keepTo = () => cullDistance(0.9, deviceCullFactor()) - 1;

export interface MergedCabinet {
  /** Meshes left in the cabinet after merging (body+edges, trim, screen, marquee). */
  readonly meshes: number;
  dispose(): void;
}

/**
 * Merges the static parts of one cabinet. The trim material is found by probing setFocus (the only lit
 * material whose color it changes), so it keeps its own mesh and its focus brightening.
 */
export function mergeCabinet(cab: Cabinet): MergedCabinet | null {
  const model = cab.group.children[0];
  if (!model) return null;
  const lit: THREE.MeshStandardMaterial[] = [];
  for (const o of model.children) {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat && !Array.isArray(mat) && mat.isMeshStandardMaterial && !lit.includes(mat)) lit.push(mat);
  }
  const rest = lit.map((m) => m.color.getHex());
  cab.setFocus(1);
  const focusable = new Set(lit.filter((m, i) => m.color.getHex() !== rest[i]));
  cab.setFocus(0);
  let stone: THREE.Texture | null = null;
  let trimMat: THREE.MeshStandardMaterial | null = null;
  const solid: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }> = [];
  const trims: THREE.Mesh[] = [];
  for (const o of model.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m === cab.screen) continue;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || !mat.isMeshStandardMaterial) continue; // marquee (basic) stays
    if (mat.map) stone = mat.map;
    if (focusable.has(mat)) {
      trimMat = mat;
      trims.push(m);
    } else solid.push({ mesh: m, mat });
  }
  const img = stone?.image as CanvasImageSource | undefined;
  if (!stone || !img || solid.length < 2) return null;

  // Atlas: the stone tile on top, its last row again (nearest sampling at the tile edge stays stone), white.
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TILE, TILE);
  ctx.drawImage(img, 0, TILE - 1, TILE, 1, 0, TILE, TILE, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, TILE + 1, TILE, 1);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = atlas.magFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;

  const parts: THREE.BufferGeometry[] = [];
  for (const { mesh, mat } of solid) {
    mesh.updateMatrix();
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const n = uv.count;
    for (let i = 0; i < n; i++) {
      if (mat.map) uv.setY(i, atlasV(uv.getY(i)));
      else uv.setXY(i, WHITE_UV.u, WHITE_UV.v);
    }
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = mat.color.r;
      col[i * 3 + 1] = mat.color.g;
      col[i * 3 + 2] = mat.color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  const solidGeo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!solidGeo) {
    atlas.dispose();
    return null;
  }
  solidGeo.computeBoundingSphere();
  const solidMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 1,
    metalness: 0,
    flatShading: true,
    map: atlas,
    vertexColors: true,
  });
  const body = new THREE.Mesh(solidGeo, solidMat);
  body.name = "cabinet-body";
  body.userData.cullDistance = keepTo();
  for (const { mesh } of solid) mesh.removeFromParent();
  model.add(body);

  let trimGeo: THREE.BufferGeometry | null = null;
  if (trimMat && trims.length > 1) {
    const tp = trims.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    trimGeo = mergeGeometries(tp, false);
    for (const g of tp) g.dispose();
    if (trimGeo) {
      trimGeo.computeBoundingSphere();
      // Trim shares faces with the edge blocks (the top's sides, the pillars): unmerged, the trim's
      // material drew after edgeMat and won those depth ties; merged, the atlas mesh draws later, so
      // pull the trim a hair forward to keep the colored stripes.
      trimMat.polygonOffset = true;
      trimMat.polygonOffsetFactor = -1;
      trimMat.polygonOffsetUnits = -1;
      const tm = new THREE.Mesh(trimGeo, trimMat);
      tm.name = "cabinet-trim";
      tm.userData.cullDistance = keepTo();
      for (const m of trims) m.removeFromParent();
      model.add(tm);
    }
  }
  const meshes = model.children.filter((o) => (o as THREE.Mesh).isMesh).length;
  return {
    meshes,
    dispose() {
      solidGeo.dispose();
      trimGeo?.dispose();
      solidMat.dispose();
      atlas.dispose();
    },
  };
}
