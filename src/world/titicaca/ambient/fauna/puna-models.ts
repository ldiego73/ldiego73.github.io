/**
 * Low-poly models of the altiplano animals added by ../puna.ts, as vertex-coloured geometries for InstancedMeshes
 * (one merged geometry per moving part, built with ../kit/build.ts). Models face +Z; each part is built round
 * its pivot so the ambient composes root × pivot × rotation per instance:
 *  - Andean goose (huallata, Oressochen melanopterus): white body, head and neck, black wings and tail, pink
 *    bill and legs. Body at the feet; neck at the shoulder (pitches down to graze).
 *  - Puna ibis (Plegadis ridgwayi): dark bronze-maroon plumage with a green sheen on the wings, a long down-
 *    curved maroon bill. Body at the feet; neck at the shoulder (probes the wet ground).
 *  - Puna teal (Spatula puna): barred brown flanks, black cap over white cheeks, the pale blue bill. Waterline 0.
 *  - Sheep: a woolly body of lumps, dark face and legs (tinted per instance, so a few are brown or black).
 *  - The shepherd's dog: a brown short-haired farm dog with a pale chest, ears up and a curled tail.
 *  - Guinea pig (cuy): a round body with white and brown patches, tiny ears. Origin at the belly.
 *  - Trout: a silvery-olive fish with a pinkish stripe; origin at its centre.
 * Legs hang from the origin (hip pivots), pointing −y, so a leg swings with one rotation about x.
 */
import * as THREE from "three";
import { Build } from "../kit/build";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const done = (b: Build) => b.build() as THREE.BufferGeometry;

/** Andean goose body on its legs (feet at y 0). */
export function gooseBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  for (const s of [-1, 1]) b.cyl(0.02, 0.022, 0.24, s * 0.07, 0, 0, "#e79a8f", 5);
  b.sph(0.17, 0.15, 0.29, 0, 0.38, 0, "#f4f1ea", 1);
  // Black wings folded on the back, the black tail.
  for (const s of [-1, 1]) b.sph(0.08, 0.1, 0.24, s * 0.12, 0.42, -0.06, "#1f1d1c", 1);
  b.sph(0.1, 0.06, 0.1, 0, 0.42, -0.3, "#1f1d1c", 0);
  return done(b);
}

/** Goose neck and head, pivot at the shoulder; upright along +y, head looking +z. */
export function gooseNeckGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.stick(v(0, -0.04, 0), v(0, 0.22, 0.05), 0.055, "#f4f1ea", 6);
  b.sph(0.065, 0.065, 0.08, 0, 0.26, 0.08, "#f4f1ea", 1);
  b.stick(v(0, 0.25, 0.14), v(0, 0.23, 0.21), 0.025, "#e07f86", 5);
  for (const s of [-1, 1]) b.sph(0.012, 0.012, 0.012, s * 0.05, 0.28, 0.1, "#1f1a17", 0);
  return done(b);
}

/** Puna ibis body on its legs (feet at y 0). */
export function ibisBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  for (const s of [-1, 1]) b.cyl(0.014, 0.016, 0.3, s * 0.05, 0, 0, "#3a2e2a", 5);
  b.sph(0.12, 0.12, 0.24, 0, 0.42, 0, "#4b2f30", 1);
  for (const s of [-1, 1]) b.sph(0.06, 0.08, 0.2, s * 0.08, 0.45, -0.06, "#3d4a3a", 1);
  b.sph(0.07, 0.04, 0.09, 0, 0.44, -0.24, "#2c2324", 0);
  return done(b);
}

/** Ibis neck, head and the long down-curved bill, pivot at the shoulder. */
export function ibisNeckGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.stick(v(0, -0.03, 0), v(0, 0.17, 0.05), 0.035, "#4b2f30", 6);
  b.sph(0.05, 0.05, 0.06, 0, 0.2, 0.07, "#4b2f30", 1);
  b.stick(v(0, 0.2, 0.11), v(0, 0.17, 0.24), 0.015, "#7a3b3b", 4);
  b.stick(v(0, 0.17, 0.24), v(0, 0.09, 0.32), 0.012, "#7a3b3b", 4);
  return done(b);
}

/** Puna teal floating, waterline at y 0. */
export function tealGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.13, 0.08, 0.21, 0, 0.02, 0, "#a7865f", 1);
  for (const s of [-1, 1]) b.sph(0.06, 0.06, 0.16, s * 0.08, 0.05, -0.03, "#6e5a43", 1);
  b.sph(0.05, 0.03, 0.07, 0, 0.05, -0.2, "#5a4836", 0);
  b.sph(0.065, 0.065, 0.075, 0, 0.14, 0.15, "#f2efe6", 1);
  b.sph(0.067, 0.035, 0.078, 0, 0.18, 0.15, "#1f1d1c", 1);
  b.stick(v(0, 0.13, 0.21), v(0, 0.12, 0.28), 0.022, "#7fb2df", 5);
  return done(b);
}

/** Sheep torso (feet at y 0, legs separate): woolly lumps, a short tail. Tinted per instance. */
export function sheepBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  const WOOL = "#f2ece0";
  b.sph(0.27, 0.24, 0.4, 0, 0.6, 0, WOOL, 1);
  for (const [x, y, z, r] of [
    [0.12, 0.72, 0.18, 0.15],
    [-0.12, 0.72, 0.16, 0.15],
    [0.14, 0.7, -0.18, 0.16],
    [-0.13, 0.7, -0.2, 0.15],
    [0, 0.8, 0, 0.17],
    [0, 0.62, 0.3, 0.17],
    [0, 0.6, -0.34, 0.16],
  ] as const)
    b.sph(r, r * 0.9, r, x, y, z, WOOL, 0);
  b.sph(0.06, 0.08, 0.05, 0, 0.6, -0.44, WOOL, 0);
  return done(b);
}

/** Sheep head, pivot at the top of the chest: dark face, wool cap, side ears. */
export function sheepHeadGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.085, 0.09, 0.15, 0, 0.0, 0.12, "#4a3d34", 1);
  b.sph(0.1, 0.07, 0.09, 0, 0.07, 0.05, "#f2ece0", 0);
  for (const s of [-1, 1]) {
    b.sph(0.06, 0.02, 0.03, s * 0.1, 0.04, 0.06, "#4a3d34", 0);
    b.sph(0.014, 0.014, 0.014, s * 0.06, 0.04, 0.2, "#151210", 0);
  }
  return done(b);
}

/** Sheep leg, hip pivot at the origin, hanging 0.44 down. */
export function sheepLegGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.cyl(0.035, 0.03, 0.44, 0, -0.44, 0, "#3f342c", 5);
  return done(b);
}

/** Dog torso (feet at y 0): brown back, pale chest, a curled tail. */
export function dogBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.12, 0.13, 0.29, 0, 0.44, 0, "#6e4a30", 1);
  b.sph(0.1, 0.1, 0.12, 0, 0.42, 0.18, "#e6d6bd", 1);
  b.stick(v(0, 0.48, -0.26), v(0, 0.66, -0.34), 0.03, "#6e4a30", 5);
  b.stick(v(0, 0.66, -0.34), v(0, 0.66, -0.24), 0.028, "#2a1f17", 5);
  return done(b);
}

/** Dog head, pivot at the neck: skull, snout, black nose, ears up. */
export function dogHeadGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.stick(v(0, -0.06, -0.04), v(0, 0.06, 0.02), 0.07, "#6e4a30", 6);
  b.sph(0.09, 0.09, 0.1, 0, 0.1, 0.05, "#6e4a30", 1);
  b.sph(0.05, 0.05, 0.08, 0, 0.07, 0.15, "#c9ad8a", 1);
  b.sph(0.022, 0.02, 0.02, 0, 0.09, 0.23, "#151210", 0);
  for (const s of [-1, 1]) {
    b.cyl(0, 0.04, 0.09, s * 0.05, 0.16, 0.02, "#4a3020", 4);
    b.sph(0.012, 0.012, 0.012, s * 0.04, 0.13, 0.13, "#151210", 0);
  }
  return done(b);
}

/** Dog leg, hip pivot at the origin, hanging 0.36 down. */
export function dogLegGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.cyl(0.03, 0.026, 0.36, 0, -0.36, 0, "#5a3c27", 5);
  return done(b);
}

/** Guinea pig (cuy), origin at its belly: white with a brown patch (tinted per instance). */
export function cuyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.1, 0.08, 0.15, 0, 0.08, 0, "#f3eee4", 1);
  b.sph(0.08, 0.06, 0.09, 0.02, 0.11, -0.04, "#a2683e", 1);
  b.sph(0.065, 0.06, 0.07, 0, 0.1, 0.12, "#f3eee4", 1);
  for (const s of [-1, 1]) {
    b.sph(0.025, 0.02, 0.01, s * 0.05, 0.16, 0.1, "#d8a08c", 0);
    b.sph(0.01, 0.01, 0.01, s * 0.045, 0.12, 0.17, "#151210", 0);
  }
  return done(b);
}

/** Trout, origin at its centre, nose toward +z. */
export function troutGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.05, 0.075, 0.24, 0, 0, 0, "#8f9a7e", 1);
  b.sph(0.052, 0.025, 0.2, 0, -0.005, 0.01, "#d99a9a", 0);
  b.sph(0.045, 0.03, 0.18, 0, -0.04, 0.02, "#e8e6dc", 0);
  b.box(0.012, 0.12, 0.1, 0, -0.06, -0.27, "#7a856b");
  return done(b);
}
