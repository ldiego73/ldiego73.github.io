/**
 * The lake's first low-poly grebe and giant frog (vertex-coloured, built with ../kit/build.ts). The world now
 * draws them with the shared animal core (../aves.ts, ../orilla.ts); these two stay only because the animal
 * harness lines up the old model behind each new one (../../../characters/animals/dev/old.ts). Delete this file
 * once that harness stops importing it.
 */
import type * as THREE from "three";
import { Build } from "../kit/build";

/** Titicaca grebe floating: waterline at y 0. */
export function grebeGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.17, 0.1, 0.26, 0, 0.02, 0, "#3f3226", 1);
  b.sph(0.15, 0.08, 0.2, 0, 0.0, 0.02, "#7a4428", 1);
  b.sph(0.07, 0.09, 0.08, 0, 0.12, 0.18, "#7a4428", 1);
  b.sph(0.07, 0.065, 0.075, 0, 0.21, 0.22, "#2a221c", 1);
  b.sph(0.045, 0.04, 0.03, 0, 0.17, 0.26, "#efe6d6", 0);
  b.cyl(0.0, 0.022, 0.09, 0, 0.2, 0.28, "#e0b84a", 5, Math.PI / 2);
  // A ragged crest.
  b.cyl(0.0, 0.03, 0.07, 0, 0.27, 0.2, "#2a221c", 4, -0.5);
  return b.build() as THREE.BufferGeometry;
}

/** Giant Titicaca water frog: baggy olive skin folds, eyes on top; origin at its belly. */
export function frogGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.34, 0.14, 0.42, 0, 0.12, 0, "#6b6a3c", 1);
  for (const s of [-1, 1]) {
    // The loose folds of skin it breathes through.
    b.sph(0.12, 0.06, 0.34, s * 0.32, 0.08, -0.02, "#5c5a32", 1);
    b.sph(0.065, 0.06, 0.065, s * 0.13, 0.25, 0.3, "#c9b45a", 1);
    b.sph(0.03, 0.03, 0.03, s * 0.15, 0.29, 0.34, "#1f1a17", 0);
    b.sph(0.08, 0.04, 0.2, s * 0.36, 0.02, -0.3, "#5c5a32", 0);
  }
  b.sph(0.26, 0.1, 0.18, 0, 0.18, 0.28, "#6b6a3c", 1);
  b.sph(0.26, 0.06, 0.34, 0, 0.03, 0, "#cfc49a", 1);
  return b.build() as THREE.BufferGeometry;
}
