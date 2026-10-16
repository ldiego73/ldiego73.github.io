/**
 * The walkable ground of the Kuntisuyu: the layout's heightfield as one vertex-coloured toon mesh (colours
 * from ./colors.ts), minus the canyon. Triangles whose three corners lie inside the canyon (s > 0.5 and short
 * of the south rim) are dropped: the canyon is drawn by ./canyon.ts from its own finer, terraced sweep, which
 * starts a little north of the rim (its lip overlaps this mesh by a cell, same colour, so no gap shows).
 *
 * The road is a separate ribbon (./road.ts); plazas are paved by the station ambients.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import type { ColcaLayout } from "../layout";
import { CANYON, canyonS, HALF } from "../plan";
import { groundColor } from "./colors";

export function buildGround(layout: ColcaLayout, toon: ToonCache): { mesh: THREE.Mesh; dispose(): void } {
  const { n, size, h } = layout.grid;
  const step = size / n;
  const N = n + 1;
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const inCanyon = new Uint8Array(N * N);
  const c = new THREE.Color();
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * N + i;
      const x = -HALF + i * step;
      const z = -HALF + j * step;
      const y = h[k] as number;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const slope =
        Math.hypot(
          layout.heightAt(x + step, z) - layout.heightAt(x - step, z),
          layout.heightAt(x, z + step) - layout.heightAt(x, z - step),
        ) /
        (2 * step);
      groundColor(x, z, y, slope, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      const s = canyonS(x, z);
      inCanyon[k] = s > 0.5 && s < CANYON.south - 0.5 ? 1 : 0;
    }
  // Same b-d diagonal as layout.heightAt: (a, b, d) then (b, c, d), a = (i, j), b = (i, j+1), c = (i+1, j+1),
  // d = (i+1, j). Winding: counter-clockwise seen from above (+y).
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * N + i;
      const b = (j + 1) * N + i;
      const cc = (j + 1) * N + i + 1;
      const d = j * N + i + 1;
      if (!(inCanyon[a] && inCanyon[b] && inCanyon[d])) idx.push(a, b, d);
      if (!(inCanyon[b] && inCanyon[cc] && inCanyon[d])) idx.push(b, cc, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
