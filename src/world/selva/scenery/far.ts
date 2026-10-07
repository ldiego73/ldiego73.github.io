/**
 * Far forest: one "canopy carpet" mesh instead of thousands of distant trees. A heightfield of crown tops
 * (ground + 11–18 u, lower near its edge so the instanced trees in front overtop it, with faceted crown bumps and a few flowering emergents in yellow and pink) covering the
 * world and well past its bounds (±900 u, into the fog), dropped below the ground wherever the instanced forest
 * stands (near the road) and over the river and its banks. Where it drops, the slope between a lowered and a
 * raised vertex reads as the dark green wall of the forest edge behind the instanced trees.
 *
 * From the road it closes every view past the instanced trees; from the canopy walkway it is the rolling sea
 * of crowns. One draw in the color pass and one in the ink prepass; no shadows (it would darken everything).
 */
import * as THREE from "three";
import { fbm, noise2 } from "../../tex";
import type { ToonCache } from "../../toon";
import type { SelvaLayout } from "../contract";
import { CARPET } from "./placement";

const EXTENT = 900;

const C = (hex: string) => new THREE.Color(hex);
const GREENS = [C("#2c5a26"), C("#346a2c"), C("#3f7832"), C("#2a4f24"), C("#4a8236")];
const BLOOM = [C("#d6b83c"), C("#c86a92"), C("#e0d25a")];

export function buildCarpet(L: SelvaLayout, toon: ToonCache, quality: "low" | "high"): THREE.Mesh {
  const cell = quality === "high" ? 8 : 12;
  const n = Math.ceil((EXTENT * 2) / cell);
  const N1 = n + 1;
  const ys = new Float32Array(N1 * N1);
  /** 1 where the carpet is dropped under the ground. */
  const sunk = new Uint8Array(N1 * N1);
  const cols = new Float32Array(N1 * N1 * 3);
  const { x0, x1, z0, z1 } = L.bounds;
  const col = new THREE.Color();
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = -EXTENT + i * cell;
      const z = -EXTENT + j * cell;
      const cx = Math.min(x1, Math.max(x0, x));
      const cz = Math.min(z1, Math.max(z0, z));
      const ground = L.heightAt(cx, cz);
      const d = L.trailQuery(x, z).d;
      const rd = L.riverDist(x, z);
      // Crown bumps: a broad swell plus rounded crowns (|noise| ridges read as separate trees).
      const crown = 1 - Math.abs(noise2(x * 0.065, z * 0.065));
      const swell = fbm(x * 0.012, z * 0.012, 3);
      const open = Math.min(d - CARPET.road, rd - CARPET.river);
      // Lower near its edge (under the crowns of the instanced trees in front), full height farther out.
      const edge = 0.55 + 0.45 * THREE.MathUtils.smoothstep(open, 0, 34);
      let y = ground + (11 + swell * 2.2 + crown ** 3 * 5.5) * edge;
      if (open < 0) {
        y = ground - 2.5;
        sunk[j * N1 + i] = 1;
      }
      ys[j * N1 + i] = y;
      const k = noise2(x * 0.05 + 7, z * 0.05 - 3);
      col.copy(GREENS[Math.floor((k + 1) * 2.5 + crown) % GREENS.length] as THREE.Color);
      // A rare flowering emergent (tahuarí yellow, pink tabebuia), only on a crown top, softened into the green.
      if (crown > 0.85 && noise2(x * 0.31, z * 0.31) > 0.72)
        col.lerp(BLOOM[Math.floor((k + 1) * 1.5) % BLOOM.length] as THREE.Color, 0.6);
      // Crown tops lighter than the hollows between them.
      col.multiplyScalar(0.62 + crown * crown * 0.55);
      cols.set([col.r, col.g, col.b], (j * N1 + i) * 3);
    }
  const pos = new Float32Array(N1 * N1 * 3);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * N1 + i;
      pos[k * 3] = -EXTENT + i * cell;
      pos[k * 3 + 1] = ys[k] as number;
      pos[k * 3 + 2] = -EXTENT + j * cell;
    }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * N1 + i;
      const b = (j + 1) * N1 + i;
      const c = (j + 1) * N1 + i + 1;
      const d = j * N1 + i + 1;
      // Quads sunk at all four corners (instanced forest, river) are under the ground: skip them.
      if (sunk[a] && sunk[b] && sunk[c] && sunk[d]) continue;
      idx.push(a, b, d, b, c, d);
    }
  // Flat-shaded (non-indexed, face normals): the crowns read as faceted low-poly clumps like the
  // instanced trees, instead of smooth blurry hills.
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  indexed.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  indexed.setIndex(idx);
  const geo = indexed.toNonIndexed();
  indexed.dispose();
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, toon.vertexToon());
  mesh.name = "selva-canopy-carpet";
  return mesh;
}
