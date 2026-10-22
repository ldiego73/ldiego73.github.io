/**
 * What the mountain's chasquis carry beyond the shared catalogue (characters/props.ts has the staff and the
 * q'ipi): a khipu in the hand or at the hip, the white plume of the chasqui, the pututo conch, a tiny server
 * rack on the back, a laptop satchel, and tablets. Shapes in their bone's frame (./bone-batch.ts: Y up,
 * +Z forward, +X the person's left, origin at the joint; traveler body units), built once per kind and drawn
 * as instances of one BatchedMesh (plus one unlit batch for the LEDs and screens).
 */
import type * as THREE from "three";
import { DYE } from "../../palette";
import type { GearKit } from "./bone-batch";

export type Gear = "plume" | "khipuHand" | "khipuHip" | "pututo" | "rack" | "satchel" | "strap" | "tablet" | "tabletL";
/** Lit pieces drawn by the unlit batch. */
export type Glow = "leds" | "screen" | "screenL";

/** The bone each piece rides. */
export const GEAR_BONE: Record<Gear | Glow, string> = {
  plume: "head",
  khipuHand: "handL",
  khipuHip: "hips",
  pututo: "hips",
  rack: "chest",
  satchel: "hips",
  strap: "chest",
  tablet: "handR",
  tabletL: "handL",
  leds: "chest",
  screen: "handR",
  screenL: "handL",
};

const KHIPU = [DYE.red, DYE.indigo, DYE.ochre, DYE.turq];

/** A hanging khipu: a cotton top cord with coloured pendants and knots (top cord at y = 0, along x). */
function khipu(k: GearKit, x: number, y: number, z: number, colors: string[], s = 1) {
  k.add("cyl6", DYE.cotton, x, y, z, 0, 0, Math.PI / 2, 0.016 * s, 0.22 * s, 0.016 * s);
  colors.forEach((c, i) => {
    const cx = x - 0.09 * s + i * (0.18 / Math.max(1, colors.length - 1)) * s;
    const len = (0.17 + (i % 2) * 0.06) * s;
    k.add("cyl6", c, cx, y - len / 2, z, 0, 0, 0, 0.011 * s, len, 0.011 * s);
    k.add("ico", c, cx, y - len * 0.45, z, 0, 0, 0, 0.022 * s, 0.022 * s, 0.022 * s);
    k.add("ico", c, cx, y - len * 0.75, z, 0, 0, 0, 0.018 * s, 0.018 * s, 0.018 * s);
  });
}

/** Merged geometry of one piece. */
export function buildGear(k: GearKit, g: Gear | Glow): THREE.BufferGeometry {
  switch (g) {
    case "plume":
      // Three white feathers fanning up and back from the knot of the llawt'u, a dyed bead at the base.
      for (let i = -1; i <= 1; i++)
        k.add("cone", "#f4efe6", i * 0.045, 0.43, -0.2, -0.45, 0, i * 0.32, 0.04, 0.3, 0.035);
      k.add("ico", DYE.red, 0, 0.31, -0.17, 0, 0, 0, 0.038, 0.038, 0.038);
      break;
    case "khipuHand":
    case "khipuHip": {
      // In the hand: held by the top cord at the palm. At the hip: tied to the belt on the right side.
      if (g === "khipuHand") khipu(k, 0, -0.09, 0.03, KHIPU);
      else khipu(k, -0.2, 0.02, 0.07, [DYE.ochre, DYE.red, DYE.indigo, DYE.turq, DYE.cotton], 0.9);
      break;
    }
    case "pututo":
      // The conch on a cord at the right hip: spiral body, flared lip.
      k.add("cyl6", "#6b4226", -0.15, 0.13, 0.11, 0, 0, -0.7, 0.01, 0.3, 0.01);
      k.add("cone", "#f2d9c4", -0.27, -0.04, 0.1, 0, 0, Math.PI / 2 + 0.3, 0.07, 0.22, 0.07);
      k.add("sph", "#e8b9a0", -0.16, -0.07, 0.1, 0, 0, 0, 0.065, 0.055, 0.055);
      k.add("torus", "#d98f7a", -0.37, -0.01, 0.1, 0, Math.PI / 2, 0, 0.038, 0.038, 0.038);
      break;
    case "rack": {
      // A 4U rack on the back: frame, server faces, a dyed top cloth, shoulder straps.
      const z = -0.27;
      k.add("box", "#8a909b", 0, 0.02, z, 0, 0, 0, 0.38, 0.52, 0.22);
      for (let i = 0; i < 4; i++) k.add("box", "#b7bcc4", 0, -0.17 + i * 0.12, z - 0.112, 0, 0, 0, 0.34, 0.09, 0.01);
      k.add("box", DYE.ochre, 0, 0.3, z, 0, 0, 0, 0.42, 0.04, 0.27);
      for (const s of [-1, 1]) {
        k.add("box", "#4a2e1c", 0.1 * s, 0.12, 0.06, 0.25, 0, 0, 0.04, 0.03, 0.34);
        k.add("box", "#4a2e1c", 0.1 * s, -0.06, 0.13, 0.05, 0, 0, 0.04, 0.34, 0.025);
      }
      k.add("box", DYE.cotton, 0.13, -0.2, z - 0.118, 0, 0, 0, 0.05, 0.05, 0.012);
      break;
    }
    case "leds":
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++)
          k.add(
            "box",
            j === 1 && i % 2 ? "#ffd36b" : "#5cf0bd",
            -0.12 + j * 0.045,
            -0.17 + i * 0.12,
            -0.39,
            0,
            0,
            0,
            0.022,
            0.022,
            0.01,
          );
      break;
    case "satchel":
      // Laptop satchel at the right hip; the lid peeks out.
      k.add("box", "#6b4a2b", -0.22, 0.03, 0.02, 0, 0, 0.05, 0.09, 0.26, 0.32);
      k.add("box", DYE.ochre, -0.225, 0.14, 0.02, 0, 0, 0.05, 0.1, 0.06, 0.33);
      k.add("box", "#3d4046", -0.2, 0.18, 0.02, 0, 0, 0.05, 0.03, 0.1, 0.26);
      break;
    case "strap":
      // Its cross-body strap, from the left shoulder to the right hip, front and back.
      for (const s of [1, -1]) k.add("box", "#4a2e1c", 0, -0.02, 0.135 * s, 0, 0, 0.72 * s, 0.04, 0.6, 0.02);
      break;
    case "tablet":
    case "tabletL":
      // A tablet held flat in the palm, screen up (toward the face when the forearm is raised).
      k.add("box", "#2b2d33", 0, -0.085, 0.07, -0.2, 0, 0, 0.26, 0.018, 0.19);
      break;
    case "screen":
    case "screenL":
      k.add("box", "#9ff5ea", 0, -0.074, 0.07, -0.2, 0, 0, 0.23, 0.004, 0.16);
      break;
  }
  return k.build();
}
