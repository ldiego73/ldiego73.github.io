/**
 * Everything beyond the walkable map: the coast running on north and south past the map's edges (desert hills
 * down to the sea), and to the east the wall of the Andes, its peaks snow-capped above SNOW. One coarse,
 * smooth-shaded, vertex-coloured mesh that is never walked on. Its vertices inside the map sink under the terrain,
 * so the seam with the heightfield never shows; under the sea it drops away beneath the water mesh.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { BOUNDS, type CostaLayout, noise, smooth } from "../layout";

const STEP = 36;
const SNOW = 190;

export function buildBackdrop(L: CostaLayout, toon: ToonCache) {
  const x0 = -420;
  const x1 = 1700;
  const z0 = -2000;
  const z1 = 2000;
  const nx = Math.ceil((x1 - x0) / STEP);
  const nz = Math.ceil((z1 - z0) / STEP);
  const inside = (x: number, z: number) =>
    x > BOUNDS.x0 + 4 && x < BOUNDS.x1 - 4 && z > BOUNDS.z0 + 4 && z < BOUNDS.z1 - 4;
  const shoreExt = (z: number) => {
    const zc = Math.max(BOUNDS.z0 + 2, Math.min(BOUNDS.z1 - 2, z));
    const beyond = Math.abs(z - zc);
    return L.shoreX(zc) + (noise(z / 160, 7) - 0.5) * 120 * smooth(0, 300, beyond);
  };
  const heightOut = (x: number, z: number) => {
    const d = x - shoreExt(z);
    if (d < 0) return -12;
    const hills = 6 + 26 * noise(x / 120, z / 120) * smooth(0, 120, d) + 0.06 * Math.max(0, d - 80);
    const andes = 300 * smooth(520, 1150, x) * (0.55 + 0.45 * noise(x / 160, z / 160));
    const peaks = 70 * smooth(800, 1100, x) * (noise(x / 55, z / 55) - 0.35);
    return Math.min(hills, 4 + d * 0.25) + andes + Math.max(0, peaks);
  };
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const sand = new THREE.Color("#dcb47c");
  const desert = new THREE.Color("#c4925e");
  const brown = new THREE.Color("#9a6d4c");
  const rock = new THREE.Color("#867a70");
  const snow = new THREE.Color("#f4f1ea");
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * STEP;
      const z = z0 + j * STEP;
      let y: number;
      if (inside(x, z)) y = L.heightAt(x, z) - 4;
      else {
        y = heightOut(x, z);
        // Near the map edge, meet the heightfield's rim.
        const cx = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x));
        const cz = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z));
        const dEdge = Math.hypot(x - cx, z - cz);
        y = THREE.MathUtils.lerp(L.heightAt(cx, cz) - 1.5, y, smooth(0, STEP * 2.5, dEdge));
      }
      pos.push(x, y, z);
      if (y > SNOW) c.copy(snow);
      else if (y > 120) c.copy(rock).lerp(brown, 0.3);
      else if (y > 30) c.copy(brown).lerp(desert, 0.4);
      else c.copy(desert).lerp(sand, 0.5);
      col.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * STEP;
      const za = z0 + j * STEP;
      // Skip quads wholly inside the map (the heightfield covers them).
      if (inside(xa, za) && inside(xa + STEP, za + STEP)) continue;
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const d = a + nx + 1;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  // Smooth normals: faceted far hills would fill with ink lines between their facets.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "costa-backdrop";
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
    },
  };
}
