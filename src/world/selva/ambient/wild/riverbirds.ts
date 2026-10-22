/**
 * The riverside thicket the shanshos (hoatzins) live in: a clump of arching woody stems with leaf blobs leaning
 * out over the water, vertex-colored for propMesh; it reports its perches (branch ends and forks, in world
 * space) for the birds (drawn by the shared animal core, ./beasts.ts).
 */
import type * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";
import { col, egg, tube, V3 } from "./kit";

/** Perch on a thicket branch (world space) and the branch direction it lies along (yaw). */
export interface Perch {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * A riverside thicket at (x, y, z) leaning toward `lean` (yaw, out over the water): `n` arching stems with
 * leaf blobs. Returns the merged geometry (world space) and the perch points.
 */
export function thicketGeometry(x: number, y: number, z: number, lean: number, n: number, rand: () => number) {
  const b = new GeoBuilder();
  const perches: Perch[] = [];
  const leaf = (p: THREE.Vector3) => col(p.y > y + 2.2 ? "#5f9a34" : "#3f7a2c");
  const bark = "#5b4a36";
  for (let i = 0; i < n; i++) {
    // Each stem leaves the ground near the base and arches out toward the water (spread ±0.9 rad).
    const a = lean + (i / Math.max(1, n - 1) - 0.5) * 1.8 + (rand() - 0.5) * 0.3;
    const reach = 2.4 + rand() * 1.6;
    const top = 2 + rand() * 1.2;
    const ox = x + Math.sin(a + 1.6) * 0.3 * (rand() - 0.5);
    const oz = z + Math.cos(a + 1.6) * 0.3 * (rand() - 0.5);
    const pts = [0, 0.35, 0.7, 1].map((k) =>
      V3(
        ox + Math.sin(a) * reach * k,
        y + Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * top - k * k * 0.5,
        oz + Math.cos(a) * reach * k,
      ),
    );
    for (let k = 0; k < 3; k++) {
      const p = pts[k] as THREE.Vector3;
      const q = pts[k + 1] as THREE.Vector3;
      b.add(tube(0.07 - k * 0.018, 0.05 - k * 0.015, p.x, p.y, p.z, q.x, q.y, q.z, 5), { color: bark });
    }
    // Leaf clumps along the outer half and at the tip; the perches sit on the bare wood just inside them.
    for (const k of [0.5, 0.75, 1]) {
      const p = pts[Math.min(3, Math.round(k * 3))] as THREE.Vector3;
      for (let j = 0; j < 2; j++) {
        const s = 0.32 + rand() * 0.2;
        const px = p.x + (rand() - 0.5) * 0.7;
        const pz = p.z + (rand() - 0.5) * 0.7;
        b.add(egg(s, 1.15, 0.85, 1.05, px, p.y + s * 0.7 + j * 0.25, pz, 0, 7), { color: leaf });
      }
    }
    for (const k of [1, 2]) {
      const p = pts[k] as THREE.Vector3;
      perches.push({ x: p.x, y: p.y + 0.04, z: p.z, yaw: a });
    }
  }
  // A low skirt of leaves at the base hides where the stems meet the bank.
  b.add(egg(0.6, 1.3, 0.85, 1.1, x, y + 0.3, z, 0, 8), { color: "#3a6f28" });
  return { geo: b.build(), perches };
}
