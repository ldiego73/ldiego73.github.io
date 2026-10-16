/**
 * Low-poly, vertex-coloured models of the coast's land and shore animals (../tierra.ts), facing +Z with the feet
 * at y 0 (Geo.cyl takes its base y, then rotates about the cylinder's centre). The four-legged ones come in three parts so one InstancedMesh per part can animate them (./herd.ts):
 * the body (with the tail), the head (origin at the neck's base, carried up and forward) and one leg (origin at
 * the hip, hanging down). Leg pivots and the neck pivot are listed with each model.
 *  - perro viringo (Peruvian hairless dog): slender, slate-grey bare skin with pink blotches, big upright ears,
 *    a pale tuft on the crown and the tail tip;
 *  - burro: grey-brown donkey, pale muzzle, eye rings and belly, long dark-edged ears, the dark cross on the
 *    shoulders and back, a tufted tail;
 *  - goat: a light coat (tinted per animal), short horns swept back, a beard, floppy ears, a short upturned tail;
 *  - cañán (Dicrodon guttulatum), the desert lizard: sandy with pale spots, a long whip tail, legs splayed;
 *  - sanderling: a small pale wader, white below, black bill and legs;
 *  - Peruvian booby (piquero): white head and underparts, brown wings, a grey-blue dagger bill, gliding.
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

// ---------------------------------------------------------------- perro viringo
const SKIN = "#4a4643";
const SKIN_D = "#3a3634";
const PINK = "#9a7466";

export function viringo(): QuadModel {
  const b = new Geo();
  b.blob(0.13, 0.13, 0.27, 0, 0.42, 0, SKIN, 1);
  b.blob(0.13, 0.14, 0.12, 0, 0.44, 0.17, SKIN, 1);
  b.blob(0.1, 0.09, 0.1, 0, 0.36, 0.0, SKIN_D, 1);
  b.blob(0.05, 0.03, 0.08, 0.08, 0.47, -0.06, PINK, 0);
  b.blob(0.04, 0.03, 0.06, -0.09, 0.44, 0.1, PINK, 0);
  b.stick({ x: 0, y: 0.46, z: -0.25 }, { x: 0, y: 0.5, z: -0.45 }, 0.025, SKIN, 5);
  b.stick({ x: 0, y: 0.5, z: -0.45 }, { x: 0, y: 0.6, z: -0.52 }, 0.02, SKIN, 5);
  b.blob(0.035, 0.05, 0.035, 0, 0.62, -0.53, "#d9d0c4", 0);
  const h = new Geo();
  h.stick({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.14, z: 0.08 }, 0.055, SKIN, 6);
  h.blob(0.075, 0.07, 0.09, 0, 0.17, 0.11, SKIN, 1);
  h.cyl(0.03, 0.05, 0.14, 0, 0.08, 0.24, SKIN_D, 6, Math.PI / 2);
  h.blob(0.022, 0.02, 0.02, 0, 0.16, 0.32, "#1a1514", 0);
  for (const s of [-1, 1]) {
    h.cyl(0.0, 0.035, 0.12, s * 0.045, 0.22, 0.08, SKIN, 4, -0.15, s * -0.25);
    h.blob(0.012, 0.012, 0.012, s * 0.045, 0.19, 0.18, "#d8b04a", 0);
  }
  // The tuft on the crown.
  h.blob(0.045, 0.03, 0.05, 0, 0.245, 0.09, "#d9d0c4", 0);
  const l = new Geo();
  l.cyl(0.022, 0.03, 0.34, 0, -0.34, 0, SKIN, 5);
  l.blob(0.03, 0.02, 0.04, 0, -0.33, 0.015, SKIN_D, 0);
  return {
    body: b.build(),
    head: h.build(),
    leg: l.build(),
    hips: quadHips(0.075, 0.36, 0.17, -0.19),
    neck: [0, 0.48, 0.24],
  };
}

// ---------------------------------------------------------------- burro
const ASS = "#8a7f74";
const ASS_D = "#3d3530";
const ASS_P = "#d8d0c4";

export function burro(): QuadModel {
  const b = new Geo();
  b.blob(0.27, 0.27, 0.5, 0, 0.82, -0.02, ASS, 1);
  b.blob(0.22, 0.15, 0.4, 0, 0.7, 0.0, ASS_P, 1);
  b.blob(0.25, 0.27, 0.22, 0, 0.84, 0.3, ASS, 1);
  // The dark cross: a stripe along the back and one over the shoulders.
  b.box(0.06, 0.03, 0.95, 0, 1.07, -0.04, ASS_D);
  b.box(0.48, 0.03, 0.06, 0, 1.03, 0.3, ASS_D, 0, 0, 0);
  b.stick({ x: 0, y: 0.92, z: -0.5 }, { x: 0, y: 0.48, z: -0.6 }, 0.03, ASS, 5);
  b.blob(0.05, 0.1, 0.05, 0, 0.42, -0.61, ASS_D, 0);
  const h = new Geo();
  h.stick({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.3, z: 0.18 }, 0.13, ASS, 7);
  h.box(0.05, 0.08, 0.3, 0, 0.28, 0.02, ASS_D, 0, -0.6);
  h.blob(0.12, 0.13, 0.17, 0, 0.33, 0.22, ASS, 1);
  h.cyl(0.08, 0.11, 0.3, 0, 0.1, 0.39, ASS, 7, Math.PI / 2 + 0.41);
  h.blob(0.1, 0.09, 0.1, 0, 0.18, 0.56, ASS_P, 1);
  for (const s of [-1, 1]) {
    h.blob(0.045, 0.045, 0.03, s * 0.1, 0.36, 0.3, ASS_P, 0);
    h.blob(0.02, 0.025, 0.02, s * 0.115, 0.36, 0.31, "#1a1514", 0);
    h.cyl(0.0, 0.05, 0.32, s * 0.06, 0.42, 0.18, ASS, 5, -0.35, s * -0.3);
    h.cyl(0.0, 0.02, 0.1, s * 0.115, 0.67, 0.08, ASS_D, 4, -0.35, s * -0.3);
  }
  const l = new Geo();
  l.cyl(0.045, 0.06, 0.56, 0, -0.6, 0, ASS, 6);
  l.cyl(0.05, 0.05, 0.06, 0, -0.6, 0.01, ASS_D, 6);
  return {
    body: b.build(),
    head: h.build(),
    leg: l.build(),
    hips: quadHips(0.13, 0.62, 0.32, -0.36),
    neck: [0, 0.92, 0.42],
  };
}

// ---------------------------------------------------------------- goat (white base: tinted per instance)
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
export function canan(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.045, 0.025, 0.09, 0, 0.03, 0, "#b9a06e", 1);
  g.blob(0.03, 0.02, 0.04, 0, 0.035, 0.11, "#a88f60", 1);
  g.stick({ x: 0, y: 0.03, z: -0.08 }, { x: 0, y: 0.015, z: -0.3 }, 0.014, "#a88f60", 4);
  for (let k = 0; k < 5; k++)
    g.blob(0.012, 0.006, 0.012, (k % 2 ? 1 : -1) * 0.02, 0.054, -0.06 + k * 0.03, "#efe2bf", 0);
  for (const s of [-1, 1])
    for (const z of [0.05, -0.06])
      g.stick({ x: s * 0.03, y: 0.025, z }, { x: s * 0.08, y: 0.0, z: z + 0.02 }, 0.007, "#9a8256", 3);
  g.blob(0.006, 0.006, 0.006, 0.02, 0.045, 0.13, "#1a1514", 0);
  g.blob(0.006, 0.006, 0.006, -0.02, 0.045, 0.13, "#1a1514", 0);
  return g.build();
}

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
