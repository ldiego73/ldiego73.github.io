/**
 * The Huatanay valley around Haukaypata: the layout's heightfield as one vertex-coloured toon mesh. Colours
 * by place, not texture: packed earth in the flat core (under the paving and the buildings), green valley
 * grass on the gentle slopes with dry puna ochre in patches, terraced fields (andenes: alternating green and
 * earth bands following the contours) on the slopes north and east, and bare soil where it gets steep.
 * The far ring of mountains is ./backdrop.ts.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { type CuscoLayout, coreDist, rectDist, segDist, streetEnd } from "../layout";
import { GATES, PLAZA } from "../plan";

/** Distance to what is built (the plaza with the compounds round it, and the street corridors). */
function builtDist(x: number, z: number): number {
  let d = rectDist(PLAZA.x0 - 11, PLAZA.z0 - 12.5, PLAZA.x1 + 3, PLAZA.z1 + 3, x, z);
  for (const g of GATES) {
    const [ex, ez] = streetEnd(g, 16);
    d = Math.min(d, segDist(g.mouth[0], g.mouth[1], ex, ez, x, z) - 5.5);
  }
  return d;
}

const EARTH = new THREE.Color("#b49a72");
const GRASS = new THREE.Color("#86a660");
const GRASS_2 = new THREE.Color("#9ab36a");
const DRY = new THREE.Color("#bba46b");
const SOIL = new THREE.Color("#9c7a55");
const ANDEN = new THREE.Color("#7f9f55");
const ANDEN_EDGE = new THREE.Color("#8a7254");

export function buildGround(layout: CuscoLayout, toon: ToonCache): { mesh: THREE.Mesh; dispose(): void } {
  const { n, size, h } = layout.grid;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // PlaneGeometry after the rotation: vertex (ix, iy) at x = −size/2 + ix·step, z = −size/2 + iy·step, which
  // is exactly the layout's grid cell (i, j): copy its heights so the mesh matches heightAt.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ix = i % (n + 1);
    const iy = Math.floor(i / (n + 1));
    const y = h[iy * (n + 1) + ix] ?? 0;
    pos.setY(i, y);
    const d = Math.max(coreDist(x, z), builtDist(x, z));
    const slope =
      Math.hypot(
        layout.heightAt(x + 1.5, z) - layout.heightAt(x - 1.5, z),
        layout.heightAt(x, z + 1.5) - layout.heightAt(x, z - 1.5),
      ) / 3;
    if (d < 1) c.copy(EARTH);
    else {
      const wobble = 0.5 + 0.5 * Math.sin(x * 0.043 + Math.cos(z * 0.031) * 2.1) * Math.cos(z * 0.05 - x * 0.012);
      c.copy(GRASS).lerp(GRASS_2, wobble);
      if (wobble > 0.78) c.lerp(DRY, (wobble - 0.78) * 3);
      // Andenes on the north and east slopes: bands every 2.4 u of height.
      const terraced = (z < -40 || x > 50) && y > 3 && y < 30 && slope < 0.7;
      if (terraced) {
        const band = (y / 2.4) % 1;
        c.copy(band < 0.18 ? ANDEN_EDGE : ANDEN).lerp(GRASS_2, wobble * 0.3);
      }
      if (slope > 0.55) c.lerp(SOIL, Math.min(1, (slope - 0.55) * 2.5));
      if (d < 6) c.lerp(EARTH, 1 - d / 6);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
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
