/**
 * The road as a ribbon laid on the ground: packed earth in the middle, a border of set stones on both edges
 * (the Qhapaq Ñan's kerbs), every vertex at the ground's height plus a few centimetres. One vertex-coloured
 * mesh sampled every ~2 u along ../plan.ts ROAD, five strips across.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import type { ColcaLayout } from "../layout";
import { noise } from "../layout";
import { ROAD, ROAD_HALF } from "../plan";

const EARTH = new THREE.Color("#cbab78");
const EARTH_2 = new THREE.Color("#bf9d6a");
const KERB = new THREE.Color("#8e8474");
const KERB_2 = new THREE.Color("#a59a88");

export function buildRoad(layout: ColcaLayout, toon: ToonCache): { mesh: THREE.Mesh; dispose(): void } {
  const pts = ROAD.pts;
  const stepIdx = 2;
  // Offsets across the road (left edge → right edge); the outer strips are the kerbs.
  const across = [-ROAD_HALF - 0.25, -ROAD_HALF + 0.35, 0, ROAD_HALF - 0.35, ROAD_HALF + 0.25];
  const rows: Array<Array<[number, number, number]>> = [];
  for (let i = 0; i < pts.length; i += stepIdx) {
    const a = pts[Math.max(0, i - 1)] as readonly [number, number];
    const b = pts[Math.min(pts.length - 1, i + 1)] as readonly [number, number];
    const p = pts[i] as readonly [number, number];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    rows.push(
      across.map((o): [number, number, number] => {
        const x = p[0] + nx * o;
        const z = p[1] + nz * o;
        return [x, layout.heightAt(x, z) + 0.06, z];
      }),
    );
  }
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let r = 0; r < rows.length - 1; r++) {
    const A = rows[r] as Array<[number, number, number]>;
    const B = rows[r + 1] as Array<[number, number, number]>;
    for (let k = 0; k < across.length - 1; k++) {
      const kerb = k === 0 || k === across.length - 2;
      const [ax, , az] = A[k] as [number, number, number];
      if (kerb) c.copy(noise(ax / 1.3, az / 1.3, 0x88) > 0.5 ? KERB : KERB_2);
      else c.copy(EARTH).lerp(EARTH_2, noise(ax / 6, az / 6, 0x89));
      for (const v of [A[k], A[k + 1], B[k], B[k], A[k + 1], B[k + 1]] as Array<[number, number, number]>) {
        pos.push(v[0], v[1] + (kerb ? 0.05 : 0), v[2]);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = toon.vertexToon();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-road";
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
