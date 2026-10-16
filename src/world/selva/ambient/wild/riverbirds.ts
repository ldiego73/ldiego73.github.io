/**
 * The shansho (hoatzin, Opisthocomus hoazin) for the shared bird rig (wild/birds.ts WingSet: wings and head
 * animated in the vertex shader, one draw call per species), and the riverside thicket it lives in.
 * The hoatzin: a pheasant-sized (≈ 0.65 m) heavy-bodied bird with a small head, blue bare face, red eye and a
 * spiky rufous crest; buff breast, chestnut belly and primaries, a long dark tail tipped buff. Faces +Z,
 * origin at the feet, wings modeled spread along ±X (see birds.ts).
 * The thicket: a clump of arching woody stems with leaf blobs leaning out over the water, vertex-colored for
 * propMesh; it reports its perches (branch ends and forks, in world space) for the birds.
 */
import type * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";
import type { WingModel } from "./birds";
import { col, cone, egg, limb, planform, tube, V3 } from "./kit";

export function hoatzinModel(): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.08, 0.3, 0.04);
  const neck = V3(0, 0.36, 0.1);
  // Body: buff breast, chestnut belly, dark streaked olive-brown back.
  b.add(egg(0.12, 0.88, 0.95, 1.5, 0, 0.27, 0, -0.35, 10), {
    color: (p, n) => {
      if (n.y < -0.35) return col("#a3532a");
      if (p.z > 0.06 && p.y < 0.33) return col("#e6c286");
      return Math.sin(p.x * 70) > 0.6 ? col("#a08a5e") : col("#4f3e2a");
    },
  });
  // Long broad tail, dark with a buff tip.
  b.add(
    planform(
      [
        [-0.07, 0],
        [0.07, 0],
        [0.09, 0.36],
        [0, 0.4],
        [-0.09, 0.36],
      ],
      1,
      0.016,
    )
      .rotateX(-0.95)
      .translate(0, 0.22, -0.14),
    { color: (p) => (p.z < -0.38 ? col("#e3c48d") : col("#3e3022")) },
  );
  // Thin neck, small head with the blue face skin, red eye, short dark bill.
  b.add(tube(0.035, 0.03, 0, 0.33, 0.1, 0, 0.42, 0.13, 6), { color: "#d6b47a", rig: [0, 1] });
  b.add(egg(0.05, 0.9, 1, 1.1, 0, 0.45, 0.15), {
    color: (p) => {
      if (Math.abs(p.x) > 0.03 && p.z > 0.14 && p.y < 0.47) return col("#4aa8de");
      return col("#b8743a");
    },
    rig: [0, 1],
  });
  for (const s of [-1, 1]) b.add(egg(0.011, 1, 1, 1, s * 0.042, 0.455, 0.17, 0, 5), { color: "#c4231b", rig: [0, 1] });
  b.add(cone(0.016, 0.045, 5, V3(0, 0.445, 0.195), V3(0, -0.3, 1)), { color: "#3a2e24", rig: [0, 1] });
  // The spiky crest: a fan of thin rufous plumes, dark-tipped.
  for (let i = 0; i < 6; i++) {
    const a = -0.6 + i * 0.2;
    b.add(cone(0.009, 0.1, 3, V3(Math.sin(a) * 0.012, 0.485, 0.13 - i * 0.008), V3(Math.sin(a) * 0.3, 1, -0.45)), {
      color: (p) => (p.y > 0.56 ? col("#2a1f18") : col("#d1863f")),
      rig: [0, 1],
    });
  }
  // Rounded wings: brown coverts with pale edging, chestnut primaries.
  const wing: Array<[number, number]> = [
    [0, 0],
    [0.12, -0.02],
    [0.26, 0.02],
    [0.36, 0.09],
    [0.33, 0.17],
    [0.2, 0.22],
    [0.06, 0.2],
    [0, 0.15],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.018).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: (p, n) => {
        const s = Math.abs(p.x);
        if (n.y < -0.5) return col("#a8542b");
        if (s > 0.25) return col("#a3482a");
        return p.z < -0.12 ? col("#cfb07a") : col("#5a4630");
      },
      rig: [side, 0],
    });
  for (const s of [-1, 1]) b.add(limb(0.012, s * 0.035, 0.2, 0, s * 0.04, 0.0, 0.02, 4), { color: "#56514a" });
  return { geo: b.build({ rig: true }), shoulder, neck };
}

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
