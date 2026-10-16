/**
 * Low-poly models of the lake's birds and its giant frog, as vertex-coloured geometries for InstancedMeshes
 * (../aves.ts, ../orilla.ts). Each is built around its pivot: bodies at the waterline or the feet, the
 * flamingo's neck at its shoulder (it pitches down to feed), a gull's wing at its root (it flaps). Models face
 * +Z. Colours follow the real birds: the Titicaca grebe's dark back, chestnut neck and white throat; the Andean
 * flamingo's pale pink with black flight feathers and yellow legs; the Andean gull's grey wings with black tips
 * and dark breeding hood.
 */
import * as THREE from "three";
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

/** Andean flamingo body on its legs (feet at y 0). */
export function flamingoBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  for (const s of [-1, 1]) {
    b.cyl(0.018, 0.022, 1.05, s * 0.07, 0, 0, "#e0b84a", 5);
    b.sph(0.035, 0.03, 0.035, s * 0.07, 0.55, 0, "#d7a83a", 0);
  }
  b.sph(0.24, 0.2, 0.38, 0, 1.18, -0.02, "#f3c3cf", 1);
  b.sph(0.22, 0.15, 0.3, 0, 1.24, -0.1, "#ec97ad", 1);
  // Black flight feathers folded over the tail.
  b.sph(0.16, 0.08, 0.2, 0, 1.22, -0.36, "#1f1a17", 0);
  return b.build() as THREE.BufferGeometry;
}

/** Flamingo neck and head, pivot at the shoulder (origin); upright it rises along +y and the head looks +z. */
export function flamingoNeckGeometry(): THREE.BufferGeometry {
  const b = new Build();
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.3, -0.06),
    new THREE.Vector3(0, 0.6, 0.02),
    new THREE.Vector3(0, 0.78, 0.08),
  ];
  for (let i = 0; i < pts.length - 1; i++)
    b.stick(pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, 0.045, "#f3c3cf", 6);
  b.sph(0.075, 0.07, 0.085, 0, 0.82, 0.12, "#f3c3cf", 1);
  // The bent bill: yellow base, black tip.
  b.stick(new THREE.Vector3(0, 0.82, 0.18), new THREE.Vector3(0, 0.77, 0.3), 0.032, "#f0d27a", 5);
  b.stick(new THREE.Vector3(0, 0.77, 0.3), new THREE.Vector3(0, 0.7, 0.34), 0.025, "#1f1a17", 5);
  b.sph(0.015, 0.015, 0.015, 0.05, 0.85, 0.14, "#1f1a17", 0);
  return b.build() as THREE.BufferGeometry;
}

/** Flamingo wings spread (for the stretch display): pivot at the back, spanning ±0.9 along x. */
export function flamingoWingsGeometry(): THREE.BufferGeometry {
  const b = new Build();
  for (const s of [-1, 1]) {
    b.box(0.55, 0.03, 0.34, s * 0.32, 0, 0, "#ec97ad");
    b.box(0.36, 0.03, 0.3, s * 0.76, 0, -0.02, "#1f1a17");
  }
  return b.build() as THREE.BufferGeometry;
}

/** Andean gull body (origin at its centre). */
export function gullBodyGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.sph(0.11, 0.1, 0.25, 0, 0, 0, "#f4f2ec", 1);
  b.sph(0.085, 0.08, 0.09, 0, 0.06, 0.22, "#5a3e2c", 1);
  b.cyl(0.0, 0.022, 0.1, 0, 0.05, 0.3, "#8f2a24", 5, Math.PI / 2);
  b.box(0.18, 0.03, 0.14, 0, -0.01, -0.27, "#f4f2ec");
  b.box(0.12, 0.031, 0.06, 0, -0.01, -0.33, "#1f1a17");
  return b.build() as THREE.BufferGeometry;
}

/** One gull wing, root at the origin, spanning +x (mirror it for the left one). */
export function gullWingGeometry(): THREE.BufferGeometry {
  const b = new Build();
  b.box(0.42, 0.025, 0.2, 0.21, 0, 0, "#a3abb4");
  b.box(0.2, 0.025, 0.15, 0.5, 0, -0.02, "#1f1a17");
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
