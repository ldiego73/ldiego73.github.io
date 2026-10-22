/**
 * Models of the caballito de totora (the reed boat of Huanchaco, used on this coast for thousands of years):
 * two tapered bundles of totora lashed side by side, the bow sweeping up into a point, a shallow hollow at the
 * stern where the fisherman sits, cords binding it every hand's width. Plus the split-cane paddle. Built along
 * +Z (bow), origin at the waterline amidships. (The fishermen are people of the coast's crowd, ../gente/crowd.ts.)
 */
import * as THREE from "three";
import { Geo } from "../../kit";

const REED = "#c7b064";
const REED_DARK = "#a8914e";
const CORD = "#6e5a34";

/** Spine of a bundle: z along the boat, y up (the bow sweeps up). */
function spine(u: number): { z: number; y: number; r: number } {
  const len = 3.4;
  const z = -1.55 + u * len;
  const rise = Math.max(0, u - 0.55) ** 2 * 5;
  // Fat in the middle, thin at the stern and very thin at the raised bow.
  const r = 0.2 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)) + 0.03;
  return { z, y: 0.12 + rise, r };
}

export function boatGeometry(): THREE.BufferGeometry {
  const g = new Geo();
  const N = 12;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const a = spine(i / N);
      const b = spine((i + 1) / N);
      const r = (a.r + b.r) / 2;
      g.stick(
        { x: side * 0.17, y: a.y, z: a.z },
        { x: side * 0.17 * (1 - (i / N) ** 3 * 0.6), y: b.y, z: b.z },
        r,
        i % 2 ? REED : "#bda65c",
        6,
      );
    }
  }
  // A third, smaller bundle on top forming the seat's back rest, and the hollow.
  g.box(0.3, 0.06, 0.9, 0, 0.3, -0.9, REED_DARK);
  // Lashings: thin cord rings round both bundles.
  for (let i = 1; i < N - 2; i += 2) {
    const a = spine(i / N);
    const ring = new THREE.TorusGeometry(1, 0.12, 4, 10);
    g.add(ring, CORD, 0, a.y, a.z, 0, 0, 0, a.r + 0.19, a.r + 0.02, 0.3);
    ring.dispose();
  }
  // The bow point.
  const tip = spine(1);
  g.cyl(0.0, 0.05, 0.4, 0, tip.y - 0.05, tip.z, REED_DARK, 5, 0.6);
  return g.build();
}

export function paddleGeometry(): THREE.BufferGeometry {
  const g = new Geo();
  // Split cane: a long shaft, the blade a flat half-cane at its end.
  g.cyl(0.035, 0.035, 2.2, 0, -1.1, 0, "#c9b07a", 6);
  g.box(0.06, 0.6, 0.16, 0, -1.25, 0, "#b89a5e");
  return g.build();
}
