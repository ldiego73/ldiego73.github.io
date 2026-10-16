/**
 * Andenes: the stepped farming terraces of the altiplano's hills and Taquile's headland.
 *  - Terraced hills (./../plan.ts TERRACE_HILLS): stacked irregular platforms, each a stone-faced ring wall with
 *    a cropped top (greens, quinoa reds, barley gold). The heightfield under each is a cone that always stays
 *    below the steps (layout.ts terraceCone), so the steps are what shows; nothing walks there.
 *  - Taquile: low stone walls tracing the headland's contours (its terraces), interrupted by the path.
 * One merged vertex-coloured mesh.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mergeColored } from "../../merge-colors";
import { noise, segQuery, type TiticacaLayout } from "../layout";
import { HEADLANDS, TERRACE_HILLS } from "../plan";
import { rng } from "./placement";

/** Terrace faces: fieldstone, weathered toward the earth and grass that grows over the old walls. */
const STONE = [
  new THREE.Color("#9b8f78"),
  new THREE.Color("#8e8a6a"),
  new THREE.Color("#a39478"),
  new THREE.Color("#7f8a5c"),
];
const TOPS = ["#7fa651", "#8fb35a", "#b84a3a", "#d2b04c", "#6f9a3c", "#c98a3a", "#94b062"].map(
  (c) => new THREE.Color(c),
);
const SEG = 40;

/** A closed ring wall + its top cap, around (cx, cz) with radius r(a), between y0 and y1. */
function step(
  cx: number,
  cz: number,
  radius: (a: number) => number,
  y0: number,
  y1: number,
  wall: THREE.Color,
  top: THREE.Color,
) {
  const pos: number[] = [];
  const col: number[] = [];
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
  };
  for (let s = 0; s < SEG; s++) {
    const a0 = (s / SEG) * Math.PI * 2;
    const a1 = ((s + 1) / SEG) * Math.PI * 2;
    const r0 = radius(a0);
    const r1 = radius(a1);
    const x0 = cx + Math.cos(a0) * r0;
    const z0 = cz + Math.sin(a0) * r0;
    const x1 = cx + Math.cos(a1) * r1;
    const z1 = cz + Math.sin(a1) * r1;
    // Wall quad (outward-facing), a hair of batter (the top set back) like Inca terrace walls.
    const k0 = 0.97;
    const tx0 = cx + Math.cos(a0) * r0 * k0;
    const tz0 = cz + Math.sin(a0) * r0 * k0;
    const tx1 = cx + Math.cos(a1) * r1 * k0;
    const tz1 = cz + Math.sin(a1) * r1 * k0;
    push(x0, y0, z0, wall);
    push(tx1, y1, tz1, wall);
    push(x1, y0, z1, wall);
    push(x0, y0, z0, wall);
    push(tx0, y1, tz0, wall);
    push(tx1, y1, tz1, wall);
    // Top cap fan.
    push(cx, y1, cz, top);
    push(tx1, y1, tz1, top);
    push(tx0, y1, tz0, top);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildTerraces(L: TiticacaLayout): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  const R = rng(0x7e44);
  for (const hill of TERRACE_HILLS) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = 0; s < 24; s++) {
      const a = (s / 24) * Math.PI * 2;
      const y = L.heightAt(hill.x + Math.cos(a) * hill.r, hill.z + Math.sin(a) * hill.r);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    const n = Math.max(5, Math.round(hill.h / 1.6));
    const sh = hill.h / n;
    const seed = R() * 50;
    // Irregular, slightly elongated outline; each step a little off-centre so the stack reads hand-built.
    const stretch = 0.82 + R() * 0.3;
    for (let k = 0; k < n; k++) {
      const f = 1 - k / n;
      const ox = (R() - 0.5) * hill.r * 0.06 * k * 0.3;
      const oz = (R() - 0.5) * hill.r * 0.06 * k * 0.3;
      const radius = (a: number) => {
        const w = 1 + 0.13 * (noise(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6 + k * 0.3) - 0.5) * 2;
        const e = 1 / Math.sqrt((Math.cos(a) / 1) ** 2 + (Math.sin(a) / stretch) ** 2);
        return hill.r * f * w * e * 0.98;
      };
      const y0 = k === 0 ? lo - 0.6 : hi + 0.6 + k * sh - 0.3;
      const y1 = hi + 0.6 + (k + 1) * sh;
      geos.push(
        step(
          hill.x + ox,
          hill.z + oz,
          radius,
          y0,
          y1,
          STONE[k % STONE.length] as THREE.Color,
          TOPS[Math.floor(R() * TOPS.length)] as THREE.Color,
        ),
      );
    }
  }
  // Taquile: contour walls on its headland (not across the path up to the village).
  const tq = HEADLANDS.find((h) => h.id === "taquile");
  if (tq) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
    const spur = L.spurs.find((s) => s.id === "taquile");
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const level of [2.6, 4.8, 7, 9.2, 11.2]) {
      let prev: [number, number] | null = null;
      for (let s = 0; s <= 120; s++) {
        const a = (s / 120) * Math.PI * 2;
        // March outward from the centre until the ground falls below this level.
        let r = 0;
        for (; r < 1.2; r += 0.01) {
          const x = tq.x + Math.cos(a) * tq.rx * r;
          const z = tq.z + Math.sin(a) * tq.rz * r;
          if (L.heightAt(x, z) < level) break;
        }
        const x = tq.x + Math.cos(a) * tq.rx * r;
        const z = tq.z + Math.sin(a) * tq.rz * r;
        const blocked =
          r >= 1.19 ||
          (spur && segQuery(spur.a, spur.b, x, z).d < spur.half + 1.2) ||
          L.plazas.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1.5) ||
          L.trailQuery(x, z).d < 4;
        if (prev && !blocked) {
          const dx = x - prev[0];
          const dz = z - prev[1];
          const len = Math.hypot(dx, dz);
          if (len < 6) {
            q.setFromAxisAngle(up, Math.atan2(dx, dz));
            parts.push({
              geometry: box,
              color: STONE[s % STONE.length] as THREE.Color,
              matrix: new THREE.Matrix4().compose(
                new THREE.Vector3((x + prev[0]) / 2, level - 0.12, (z + prev[1]) / 2),
                q,
                new THREE.Vector3(0.38, 0.55, len + 0.1),
              ),
            });
          }
        }
        prev = blocked ? null : [x, z];
      }
    }
    const walls = mergeColored(parts);
    box.dispose();
    if (walls) geos.push(walls);
  }
  if (!geos.length) return null;
  // Same attributes everywhere (position, normal, colour) so they merge as they are.
  for (const g of geos)
    for (const k of Object.keys(g.attributes))
      if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  const merged = mergeGeometries(
    geos.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  );
  for (const g of geos) g.dispose();
  merged?.computeBoundingSphere();
  return merged;
}
