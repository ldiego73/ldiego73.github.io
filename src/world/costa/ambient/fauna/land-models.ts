/**
 * Low-poly, vertex-coloured models of the coast's land and shore animals (../tierra.ts), facing +Z with the feet
 * at y 0 (Geo.cyl takes its base y, then rotates about the cylinder's centre). The four-legged ones come in three parts so one InstancedMesh per part can animate them (./herd.ts):
 * the body (with the tail), the head (origin at the neck's base, carried up and forward) and one leg (origin at
 * the hip, hanging down). Leg pivots and the neck pivot are listed with each model.
 *  - goat: a light coat (tinted per animal), short horns swept back, a beard, floppy ears, a short upturned tail;
 *  - sanderling: a small pale wader, white below, black bill and legs;
 *  - Peruvian booby (piquero): white head and underparts, brown wings, a grey-blue dagger bill, gliding.
 * These are the coast's animals the shared animals (../../../characters/animals) do not have yet; the viringos,
 * burros and cañanes are the shared dog, donkey and lizard.
 */
import type * as THREE from "three";
import { Geo } from "../../kit";

export interface QuadModel {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  /** Hip pivots: front-left, front-right, back-left, back-right. */
  hips: Array<[number, number, number]>;
  neck: [number, number, number];
}

const quadHips = (x: number, y: number, zf: number, zb: number): Array<[number, number, number]> => [
  [x, y, zf],
  [-x, y, zf],
  [x, y, zb],
  [-x, y, zb],
];

export function goat(): QuadModel {
  const b = new Geo();
  b.blob(0.17, 0.18, 0.32, 0, 0.55, 0, "#f2efe8", 1);
  b.blob(0.15, 0.15, 0.14, 0, 0.56, 0.2, "#f2efe8", 1);
  b.cyl(0.02, 0.035, 0.1, 0, 0.65, -0.32, "#e6e0d4", 5, -0.7);
  const h = new Geo();
  h.stick({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.18, z: 0.1 }, 0.07, "#f2efe8", 6);
  h.blob(0.08, 0.085, 0.13, 0, 0.21, 0.16, "#f2efe8", 1);
  h.cyl(0.045, 0.06, 0.12, 0, 0.11, 0.27, "#e6e0d4", 6, Math.PI / 2 + 0.5);
  h.cyl(0.015, 0.03, 0.12, 0, 0.06, 0.23, "#cfc6b6", 4, 0.3);
  for (const s of [-1, 1]) {
    h.cyl(0.0, 0.025, 0.17, s * 0.04, 0.22, 0.1, "#4a3f36", 4, -1.0, s * -0.15);
    h.box(0.1, 0.03, 0.05, s * 0.1, 0.22, 0.1, "#e6e0d4", 0, 0, s * -0.5);
    h.blob(0.015, 0.018, 0.015, s * 0.07, 0.24, 0.2, "#2a2420", 0);
  }
  const l = new Geo();
  l.cyl(0.025, 0.035, 0.4, 0, -0.4, 0, "#ebe6dc", 5);
  l.cyl(0.03, 0.03, 0.04, 0, -0.4, 0.005, "#3a3330", 5);
  return {
    body: b.build(),
    // Head carried low and forward (a goat, not a llama).
    head: h.build().translate(0, -0.07, 0.04),
    leg: l.build(),
    hips: quadHips(0.09, 0.4, 0.18, -0.2),
    neck: [0, 0.6, 0.27],
  };
}

// ---------------------------------------------------------------- small ones
export function sanderling(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.06, 0.055, 0.09, 0, 0.11, 0, "#f4f2ec", 1);
  g.box(0.1, 0.035, 0.13, 0, 0.13, -0.02, "#b9b4aa");
  g.blob(0.04, 0.04, 0.04, 0, 0.16, 0.07, "#e8e4dc", 0);
  g.box(0.012, 0.012, 0.06, 0, 0.155, 0.13, "#1a1514");
  for (const s of [-1, 1]) g.cyl(0.006, 0.006, 0.07, s * 0.02, 0, 0, "#1a1514", 3);
  return g.build();
}

export function boobyGlide(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.11, 0.1, 0.36, 0, 0, 0, "#f4f2ec", 1);
  g.blob(0.08, 0.08, 0.1, 0, 0.03, 0.36, "#f4f2ec", 0);
  g.cyl(0.0, 0.03, 0.18, 0, -0.06, 0.5, "#7d8a96", 4, Math.PI / 2);
  for (const s of [-1, 1]) {
    g.box(0.5, 0.025, 0.2, s * 0.3, 0.03, 0, "#6b5442", 0, 0, s * 0.08);
    g.box(0.34, 0.025, 0.15, s * 0.7, 0.07, -0.03, "#4f3d30", 0, 0, s * 0.14);
    g.box(0.3, 0.026, 0.06, s * 0.3, 0.032, 0.06, "#e9e2d4", 0, 0, s * 0.08);
  }
  g.box(0.14, 0.02, 0.22, 0, 0.0, -0.42, "#4f3d30");
  return g.build();
}
