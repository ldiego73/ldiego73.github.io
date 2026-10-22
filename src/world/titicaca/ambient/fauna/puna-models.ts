/**
 * Low-poly models of the altiplano animals of ../puna.ts that the shared animal core
 * (../../../characters/animals) does not have yet, as vertex-coloured geometries for InstancedMeshes (one merged
 * geometry per moving part, built with ../kit/build.ts). Models face +Z; each part is built round its pivot so
 * the ambient composes root × pivot × rotation per instance:
 *  - Puna ibis (Plegadis ridgwayi): dark bronze-maroon plumage with a green sheen on the wings, a long down-
 *    curved maroon bill. Body at the feet; neck at the shoulder (probes the wet ground).
 *  - Sheep: a woolly body of lumps, dark face and legs (tinted per instance, so a few are brown or black).
 *  - The shepherd's dog: a brown short-haired farm dog with a pale chest, ears up and a curled tail.
 * Legs hang from the origin (hip pivots), pointing −y, so a leg swings with one rotation about x. Replace each
 * with the core's species once it exists (the geese, teals, cuyes and trout already moved there).
 */
import * as THREE from "three";
import { Build } from "../kit/build";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const done = (b: Build) => b.build() as THREE.BufferGeometry;

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
