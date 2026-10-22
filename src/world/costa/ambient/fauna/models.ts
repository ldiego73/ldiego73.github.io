/**
 * Low-poly, vertex-coloured models of the coast's small things that are not shared animals (each one geometry
 * for an InstancedMesh), built along +Z with the base at y 0:
 *  - ghost crab (pale sand-coloured shell, long legs, one claw bigger): the shared animals have no crab;
 *  - the white splash of a diving bird.
 * The sea lions, penguins, pelicans, gulls and guanays are the shared animals (../../../characters/animals).
 */
import type * as THREE from "three";
import { Geo } from "../../kit";

export function crab(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.13, 0.06, 0.1, 0, 0.09, 0, "#e3cfa2", 1);
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const z = -0.06 + k * 0.06;
      g.stick({ x: s * 0.1, y: 0.09, z }, { x: s * 0.24, y: 0.0, z: z * 1.4 }, 0.012, "#c9b088", 3);
    }
  g.blob(0.05, 0.035, 0.04, 0.09, 0.1, 0.12, "#ecdcb4", 0);
  g.blob(0.03, 0.025, 0.03, -0.08, 0.1, 0.11, "#ecdcb4", 0);
  for (const s of [-1, 1]) g.cyl(0.008, 0.008, 0.05, s * 0.04, 0.12, 0.08, "#2a2420", 3);
  return g.build();
}

/** A small white splash (the pelican's dive): a ring of droplets, scaled by the caller. */
export function splash(): THREE.BufferGeometry {
  const g = new Geo();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.cyl(
      0.0,
      0.12,
      0.7,
      Math.cos(a) * 0.25,
      0,
      Math.sin(a) * 0.25,
      "#f4f4ee",
      4,
      Math.sin(a) * 0.4,
      -Math.cos(a) * 0.4,
    );
  }
  g.cyl(0.0, 0.2, 1.0, 0, 0, 0, "#f4f4ee", 5);
  return g.build();
}

export type Geometry = THREE.BufferGeometry;
