/**
 * Plain stand-in for the jungle scenery (scenery.ts, built by another agent) so the runtime can run and be
 * screenshotted before it exists, or if it fails to load: the layout's heightfield as one vertex-coloured toon
 * mesh (forest-floor greens, the ochre road and plazas, a muddy river bed) plus a flat brown river ribbon at
 * water level. Same interface as `createSelvaScenery`, two draw calls, no vegetation.
 */
import * as THREE from "three";
import type { ToonCache } from "../toon";
import type { SelvaLayout } from "./contract";

export interface SelvaScenery {
  group: THREE.Group;
  update(dt: number, time: number, env: unknown): void;
  setNight?(night: number): void;
  dispose(): void;
}

export function createFallbackGround(layout: SelvaLayout, toon: ToonCache): SelvaScenery {
  const group = new THREE.Group();
  group.name = "selva-fallback";
  const { n, size } = layout.grid;
  const half = size / 2;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const green = new THREE.Color("#4f7f35");
  const green2 = new THREE.Color("#6a9a42");
  const road = new THREE.Color("#b08a55");
  const mud = new THREE.Color("#6e5638");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // PlaneGeometry rows run +z → −z after the rotation; heightAt does the lookup, so order does not matter.
    pos.setY(i, layout.heightAt(Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z))));
    const q = layout.trailQuery(x, z);
    const onPlaza = layout.plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);
    if (layout.riverDist(x, z) < 1) c.copy(mud);
    else if (q.d < layout.trail.halfWidth + 0.6 || onPlaza) c.copy(road);
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

  // River ribbon: one quad strip along the centerline at the flat water level.
  const { pts, halfWidth, level } = layout.river;
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)] as [number, number];
    const b = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
    const p = pts[i] as [number, number];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const m = Math.hypot(tx, tz) || 1;
    tx /= m;
    tz /= m;
    const w = (halfWidth[i] ?? 10) + 1.5;
    verts.push(p[0] - tz * w, level, p[1] + tx * w, p[0] + tz * w, level, p[1] - tx * w);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  riverGeo.setIndex(idx);
  riverGeo.computeVertexNormals();
  const riverMat = new THREE.MeshToonMaterial({ color: "#8a6a45", side: THREE.DoubleSide });
  const river = new THREE.Mesh(riverGeo, riverMat);
  river.name = "river";
  group.add(river);

  return {
    group,
    update() {},
    dispose() {
      geo.dispose();
      groundMat.dispose();
      riverGeo.dispose();
      riverMat.dispose();
    },
  };
}
