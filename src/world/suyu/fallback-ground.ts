/**
 * Plain stand-in for a suyu world's scenery, so the runtime can run (and be screenshotted) before the world's
 * scenery exists, or if it fails: the layout's heightfield as one vertex-coloured toon mesh (grass greens,
 * the ochre road and plazas, a blue tint under water) plus a flat water sheet at y 0 where `isWater` holds.
 * Two draw calls at most, no vegetation.
 */
import * as THREE from "three";
import type { ToonCache } from "../toon";
import type { SuyuLayout, SuyuScenery } from "./contract";

export function createFallbackGround(layout: SuyuLayout, toon: ToonCache): SuyuScenery {
  const group = new THREE.Group();
  group.name = "suyu-fallback";
  const { n, size } = layout.grid;
  const half = size / 2;
  const cx = (layout.bounds.x0 + layout.bounds.x1) / 2;
  const cz = (layout.bounds.z0 + layout.bounds.z1) / 2;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const green = new THREE.Color("#7fae6a");
  const green2 = new THREE.Color("#93b56f");
  const road = new THREE.Color("#c9a874");
  const wet = new THREE.Color("#6f9fae");
  const c = new THREE.Color();
  let water = false;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.max(cx - half, Math.min(cx + half, pos.getX(i)));
    const z = Math.max(cz - half, Math.min(cz + half, pos.getZ(i)));
    pos.setY(i, layout.heightAt(x, z));
    const onPlaza = layout.plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);
    if (layout.waterDist(x, z) < 0) {
      c.copy(wet);
      water = true;
    } else if (layout.trailQuery(x, z).d < layout.trail.halfWidth + 0.6 || onPlaza) c.copy(road);
    else c.copy(green).lerp(green2, 0.5 + 0.5 * Math.sin(x * 0.07) * Math.cos(z * 0.09));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const groundMat = toon.vertexToon();
  const ground = new THREE.Mesh(geo, groundMat);
  ground.name = "terrain";
  ground.receiveShadow = true;
  group.add(ground);

  let sheetGeo: THREE.PlaneGeometry | null = null;
  let sheetMat: THREE.MeshToonMaterial | null = null;
  if (water) {
    sheetGeo = new THREE.PlaneGeometry(size, size);
    sheetGeo.rotateX(-Math.PI / 2);
    sheetGeo.translate(cx, 0, cz);
    sheetMat = new THREE.MeshToonMaterial({ color: "#5fb8c2" });
    const sheet = new THREE.Mesh(sheetGeo, sheetMat);
    sheet.name = "water";
    group.add(sheet);
  }

  return {
    group,
    update() {},
    dispose() {
      geo.dispose();
      groundMat.dispose();
      sheetGeo?.dispose();
      sheetMat?.dispose();
    },
  };
}
