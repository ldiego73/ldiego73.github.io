/**
 * Low-poly, vertex-coloured models of the coast's animals (each one geometry for an InstancedMesh), built along
 * +Z (head) with the feet / belly at y 0:
 *  - South American sea lion lying on a rock and with its head raised; a swimmer's head and neck;
 *  - Humboldt penguin standing (black back, white front with the black breast band, pink face patch);
 *  - Peruvian pelican gliding (long bill and pouch, broad grey-brown wings) and standing;
 *  - gull (Belcher's: white head and body, black back and wings, a red-tipped yellow bill) gliding and standing;
 *  - guanay cormorant standing (glossy black back, white front);
 *  - ghost crab (pale sand-coloured shell, long legs, one claw bigger).
 */
import type * as THREE from "three";
import { Geo } from "../../kit";

const LION = "#6b4f3a";
const LION_D = "#57402f";

export function seaLionLying(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.42, 0.3, 1.0, 0, 0.3, -0.1, LION, 1);
  g.blob(0.3, 0.26, 0.4, 0, 0.42, 0.75, LION, 1);
  g.blob(0.17, 0.16, 0.24, 0, 0.5, 1.1, LION_D, 1);
  g.blob(0.06, 0.05, 0.05, 0, 0.5, 1.32, "#2a2420", 0);
  for (const s of [-1, 1]) g.box(0.5, 0.06, 0.3, s * 0.45, 0.12, 0.35, LION_D, s * 0.4);
  g.box(0.5, 0.06, 0.26, 0, 0.1, -1.05, LION_D);
  return g.build();
}

export function seaLionUp(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.45, 0.36, 0.9, 0, 0.32, -0.2, LION, 1);
  g.stick({ x: 0, y: 0.5, z: 0.45 }, { x: 0, y: 1.25, z: 0.75 }, 0.24, LION, 7);
  g.blob(0.2, 0.18, 0.28, 0, 1.32, 0.86, LION_D, 1);
  g.blob(0.06, 0.05, 0.05, 0, 1.33, 1.12, "#2a2420", 0);
  for (const s of [-1, 1]) g.box(0.55, 0.06, 0.32, s * 0.45, 0.06, 0.45, LION_D, s * 0.5);
  return g.build();
}

export function seaLionSwim(): THREE.BufferGeometry {
  const g = new Geo();
  g.stick({ x: 0, y: -0.3, z: -0.1 }, { x: 0, y: 0.3, z: 0.15 }, 0.2, LION, 7);
  g.blob(0.18, 0.16, 0.26, 0, 0.36, 0.28, LION_D, 1);
  return g.build();
}

export function penguin(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.22, 0.34, 0.2, 0, 0.36, 0, "#25262b", 1);
  g.blob(0.17, 0.3, 0.1, 0, 0.36, 0.11, "#f2f0ea", 1);
  g.box(0.3, 0.04, 0.05, 0, 0.5, 0.15, "#25262b");
  g.blob(0.13, 0.13, 0.13, 0, 0.74, 0.02, "#25262b", 1);
  g.box(0.03, 0.07, 0.05, 0.07, 0.75, 0.1, "#e2a39a");
  g.box(0.03, 0.07, 0.05, -0.07, 0.75, 0.1, "#e2a39a");
  g.box(0.05, 0.04, 0.14, 0, 0.72, 0.17, "#3a3330");
  for (const s of [-1, 1]) g.box(0.04, 0.24, 0.12, s * 0.21, 0.36, 0, "#25262b", 0, 0, s * 0.25);
  g.box(0.16, 0.04, 0.14, 0, 0.02, 0.06, "#2a2420");
  return g.build();
}

export function pelicanGlide(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.22, 0.2, 0.62, 0, 0, 0, "#d9d2c6", 1);
  g.blob(0.13, 0.13, 0.16, 0, 0.12, 0.62, "#efe9dc", 1);
  g.box(0.07, 0.07, 0.66, 0, 0.08, 0.98, "#c99a4a");
  g.box(0.06, 0.08, 0.5, 0, 0.0, 0.95, "#a8805a");
  // Broad wings (slightly bent) and the dark primaries.
  for (const s of [-1, 1]) {
    g.box(1.05, 0.05, 0.42, s * 0.62, 0.06, 0, "#7a6e62", 0, 0, s * 0.06);
    g.box(0.5, 0.05, 0.34, s * 1.38, 0.1, -0.03, "#4a423a", 0, 0, s * 0.1);
  }
  g.box(0.36, 0.04, 0.26, 0, 0.0, -0.62, "#8a7e70");
  return g.build();
}

export function pelicanStand(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.28, 0.32, 0.5, 0, 0.75, -0.05, "#8a7e70", 1);
  g.blob(0.2, 0.26, 0.36, 0, 0.75, 0.15, "#d9d2c6", 1);
  g.stick({ x: 0, y: 0.95, z: 0.32 }, { x: 0, y: 1.45, z: 0.36 }, 0.07, "#efe9dc", 6);
  g.blob(0.11, 0.11, 0.13, 0, 1.5, 0.4, "#efe9dc", 1);
  g.box(0.07, 0.07, 0.62, 0, 1.45, 0.75, "#c99a4a", -0.45);
  g.box(0.06, 0.12, 0.42, 0, 1.3, 0.66, "#a8805a", -0.5);
  for (const s of [-1, 1]) g.cyl(0.03, 0.03, 0.48, s * 0.1, 0, 0, "#3a3330", 4);
  return g.build();
}

export function gullGlide(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.11, 0.1, 0.3, 0, 0, 0, "#f4f2ec", 1);
  g.blob(0.08, 0.08, 0.09, 0, 0.05, 0.3, "#f4f2ec", 0);
  g.box(0.03, 0.03, 0.12, 0, 0.04, 0.42, "#e8c040");
  for (const s of [-1, 1]) {
    g.box(0.5, 0.025, 0.2, s * 0.3, 0.04, 0, "#2c2a2a", 0, 0, s * 0.12);
    g.box(0.24, 0.025, 0.14, s * 0.66, 0.1, -0.02, "#1d1b1b", 0, 0, s * 0.25);
  }
  g.box(0.16, 0.02, 0.14, 0, 0.0, -0.32, "#f4f2ec");
  return g.build();
}

export function gullStand(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.12, 0.12, 0.26, 0, 0.3, 0, "#f4f2ec", 1);
  g.box(0.22, 0.08, 0.36, 0, 0.32, -0.06, "#2c2a2a");
  g.blob(0.08, 0.08, 0.09, 0, 0.46, 0.2, "#f4f2ec", 0);
  g.box(0.03, 0.03, 0.12, 0, 0.45, 0.32, "#e8c040");
  g.box(0.032, 0.02, 0.03, 0, 0.44, 0.38, "#c4383f");
  for (const s of [-1, 1]) g.cyl(0.015, 0.015, 0.2, s * 0.05, 0, 0, "#d9c040", 4);
  return g.build();
}

export function cormorantStand(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.15, 0.24, 0.16, 0, 0.32, 0, "#1d2026", 1);
  g.blob(0.11, 0.18, 0.07, 0, 0.34, 0.1, "#f2f0ea", 0);
  g.stick({ x: 0, y: 0.5, z: 0.06 }, { x: 0, y: 0.68, z: 0.1 }, 0.05, "#1d2026", 5);
  g.blob(0.07, 0.07, 0.09, 0, 0.71, 0.13, "#1d2026", 0);
  g.box(0.025, 0.025, 0.12, 0, 0.7, 0.25, "#8a7a6a");
  return g.build();
}

export function cormorantFly(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.1, 0.09, 0.3, 0, 0, 0, "#1d2026", 0);
  g.stick({ x: 0, y: 0, z: 0.25 }, { x: 0, y: 0.02, z: 0.5 }, 0.035, "#1d2026", 4);
  for (const s of [-1, 1]) g.box(0.5, 0.02, 0.16, s * 0.3, 0.03, 0, "#23262c", 0, 0, s * 0.1);
  return g.build();
}

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
