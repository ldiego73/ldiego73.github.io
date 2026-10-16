/**
 * Procedural geometry of the Chullachaqui egg (Three only, no DOM): the spirit himself, his trail of
 * mismatched prints, the roots and log he hides among, the snapped branch where his trail leaves the road,
 * and the leaf for his vanishing puff. Every builder returns ONE vertex-colored geometry (merge-colors.ts),
 * so each piece is a single draw on a shared vertex-toon material.
 *
 * The figure is a small hunched old man of the forest (≈ 1.15 u tall; the traveler is ≈ 1.8) in the plain
 * style of the people models: a wide straw hat, a mossy beard, a cloak of leaves over an earthy cushma and a
 * walking stick. His left leg ends in a bare human foot, his right in a shaggy goat shin and a black cloven
 * hoof: the "chulla chaki" (Quechua: odd foot) that gives him away. Local frame: facing +z, left is +x.
 */
import * as THREE from "three";
import { type ColoredPart, mergeColored } from "../../../merge-colors";
import type { Print } from "./logic";

const col = (hex: string) => new THREE.Color(hex);
const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** Builds the merged geometry and disposes the part primitives. */
function merge(parts: ColoredPart[]): THREE.BufferGeometry {
  const g = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  if (!g) throw new Error("chullachaqui: empty merge");
  return g;
}

const C = {
  skin: "#a8714a",
  hat: "#d9b866",
  band: "#7a3b1f",
  beard: "#8f9a72",
  cloak: "#4f7d3a",
  cloakDark: "#3c6430",
  cushma: "#8b6a44",
  pants: "#5c4733",
  fur: "#6e5236",
  hoof: "#231a14",
  stick: "#6a4a2c",
  eye: "#17110d",
  eyeGlint: "#fff4d6",
};

/** The spirit, standing on y = 0, facing +z. */
export function spiritGeometry(): THREE.BufferGeometry {
  const P: ColoredPart[] = [];
  const add = (geometry: THREE.BufferGeometry, color: string, matrix: THREE.Matrix4) =>
    P.push({ geometry, color: col(color), matrix });
  // Legs: hips at y ≈ 0.42, a little apart (left +x).
  add(new THREE.CylinderGeometry(0.065, 0.06, 0.24, 8), C.pants, m4(0.1, 0.33, 0));
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 8), C.skin, m4(0.1, 0.13, 0));
  // Bare human foot (left): a flattened capsule pointing forward with a big toe bump.
  add(new THREE.SphereGeometry(0.07, 10, 6), C.skin, m4(0.1, 0.035, 0.05, 0, 0, 0, 0.85, 0.5, 1.6));
  add(new THREE.SphereGeometry(0.03, 8, 6), C.skin, m4(0.085, 0.04, 0.155));
  // Goat leg (right): shaggy shin, bent backward like a hock, ending in a black cloven hoof.
  add(new THREE.CylinderGeometry(0.065, 0.06, 0.24, 8), C.pants, m4(-0.1, 0.33, 0));
  add(new THREE.ConeGeometry(0.085, 0.24, 7), C.fur, m4(-0.1, 0.14, -0.03, Math.PI + 0.25, 0, 0));
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), C.hoof, m4(-0.1, 0.035, 0.0));
  add(new THREE.BoxGeometry(0.012, 0.075, 0.15), C.fur, m4(-0.1, 0.035, 0.0));
  // Body: earthy cushma, hunched forward (tilted about x), under a cloak of leaves.
  add(new THREE.CylinderGeometry(0.17, 0.25, 0.42, 10), C.cushma, m4(0, 0.6, 0.02, 0.32, 0, 0));
  add(new THREE.ConeGeometry(0.31, 0.46, 9), C.cloak, m4(0, 0.74, 0.0, 0.35, 0, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(
      new THREE.ConeGeometry(0.07, 0.2, 4),
      i % 2 ? C.cloakDark : C.cloak,
      m4(Math.sin(a) * 0.26, 0.55, Math.cos(a) * 0.26 - 0.02, Math.PI - Math.cos(a) * 0.4, a, Math.sin(a) * 0.4),
    );
  }
  // Arms: forward and down; the right hand rests on a crooked walking stick.
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 7), C.cloakDark, m4(0.2, 0.68, 0.14, 0.9, 0, 0.25));
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 7), C.cloakDark, m4(-0.21, 0.66, 0.16, 1.05, 0, -0.2));
  add(new THREE.SphereGeometry(0.045, 8, 6), C.skin, m4(0.24, 0.56, 0.28));
  add(new THREE.SphereGeometry(0.045, 8, 6), C.skin, m4(-0.26, 0.54, 0.31));
  add(new THREE.CylinderGeometry(0.022, 0.026, 0.95, 6), C.stick, m4(-0.28, 0.4, 0.33, 0.06, 0, 0.05));
  add(new THREE.SphereGeometry(0.04, 6, 5), C.stick, m4(-0.26, 0.88, 0.34));
  // Head pushed forward by the hunch: big nose, mossy beard, two bright eyes under the brim.
  add(new THREE.SphereGeometry(0.15, 12, 9), C.skin, m4(0, 0.92, 0.17));
  add(new THREE.ConeGeometry(0.045, 0.13, 7), C.skin, m4(0, 0.9, 0.33, Math.PI / 2 + 0.25, 0, 0));
  add(new THREE.ConeGeometry(0.11, 0.24, 8), C.beard, m4(0, 0.77, 0.24, Math.PI - 0.35, 0, 0));
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.028, 8, 6), C.eye, m4(0.055 * s, 0.95, 0.3));
    add(new THREE.SphereGeometry(0.01, 6, 4), C.eyeGlint, m4(0.055 * s + 0.008, 0.96, 0.325));
    add(new THREE.SphereGeometry(0.035, 6, 5), C.skin, m4(0.15 * s, 0.93, 0.14, 0, 0, 0, 0.5, 1, 1));
  }
  // Wide straw hat, tipped forward over the eyes.
  add(new THREE.CylinderGeometry(0.4, 0.42, 0.035, 18), C.hat, m4(0, 1.04, 0.15, 0.18, 0, 0));
  add(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 14), C.hat, m4(0, 1.14, 0.13, 0.18, 0, 0));
  add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 14), C.band, m4(0, 1.07, 0.14, 0.18, 0, 0));
  return merge(P);
}

/** Height of the spirit's head top (for the speech bubble and the creatures body). */
export const SPIRIT_TOP = 1.2;

const PRINT = {
  rim: "#c7a37b",
  pit: "#3b271a",
};

/** One print, flat on y = 0 (the caller lifts it), toes toward +z. Rim slightly lower and bigger than the pit. */
function printParts(kind: Print["kind"], P: ColoredPart[], at: THREE.Matrix4) {
  const disc = (r: number, x: number, z: number, sx: number, sz: number, y: number, color: string) => {
    const g = new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2);
    P.push({ geometry: g, color: col(color), matrix: at.clone().multiply(m4(x, y, z, 0, 0, 0, sx, 1, sz)) });
  };
  const both = (r: number, x: number, z: number, sx = 1, sz = 1) => {
    disc(r * 1.35 + 0.012, x, z, sx, sz, 0, PRINT.rim);
    disc(r, x, z, sx, sz, 0.008, PRINT.pit);
  };
  if (kind === "foot") {
    // Heel, arch, ball and five toes (big toe on the inside: -x for a left foot seen from above, toes +z).
    both(0.042, 0, -0.08, 1, 1.2);
    both(0.03, 0.012, -0.015, 1, 1.4);
    both(0.05, 0, 0.045, 1.05, 1);
    const toes: Array<[number, number, number]> = [
      [-0.034, 0.11, 0.02],
      [-0.008, 0.122, 0.015],
      [0.014, 0.118, 0.013],
      [0.033, 0.108, 0.012],
      [0.048, 0.092, 0.011],
    ];
    for (const [x, z, r] of toes) both(r, x, z);
  } else {
    // Cloven hoof: two half-moons with a split, rounder and deeper than the foot.
    both(0.04, 0.026, 0.005, 0.8, 1.35);
    both(0.04, -0.026, 0.005, 0.8, 1.35);
  }
}

/** All prints merged into one flat geometry; `ground(x, z)` gives the surface height under each print. */
export function printsGeometry(prints: Print[], ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const P: ColoredPart[] = [];
  for (const p of prints) {
    // Each print is 1.8× life size so it reads from the road at walking distance (a toon world, not a survey).
    const at = m4(p.x, ground(p.x, p.z), p.z, 0, p.yaw, 0, 1.8, 1, 1.8);
    printParts(p.kind, P, at);
  }
  return merge(P);
}

/**
 * The hiding place: buttress roots arching around the spirit's spot and a mossy log lying behind him.
 * Local frame centered on the spirit, facing +z (toward the clearing); the roots rise behind and to the sides.
 */
export function rootsGeometry(): THREE.BufferGeometry {
  const P: ColoredPart[] = [];
  const root = "#6b4a2e";
  const rootDark = "#55391f";
  const moss = "#5e8a3c";
  const arcs: Array<[number, number, number, number]> = [
    // [radius, yaw, x, z]: half-torus arches standing on the ground.
    [0.55, 0.4, 0.55, -0.35],
    [0.7, -0.5, -0.55, -0.4],
    [0.42, 1.4, 0.75, 0.25],
    [0.48, -1.3, -0.8, 0.2],
    [0.85, 0, 0.05, -0.75],
  ];
  arcs.forEach(([r, yaw, x, z], i) => {
    P.push({
      geometry: new THREE.TorusGeometry(r, 0.08 + r * 0.05, 6, 12, Math.PI),
      color: col(i % 2 ? rootDark : root),
      matrix: m4(x, 0, z, 0, yaw, 0, 1, 0.9, 1),
    });
  });
  // Mossy log behind him, across the back of the clearing.
  P.push({
    geometry: new THREE.CylinderGeometry(0.34, 0.38, 3.4, 12),
    color: col("#5b4128"),
    matrix: m4(0, 0.3, -1.1, 0, 0, Math.PI / 2 + 0.06),
  });
  P.push({
    geometry: new THREE.CylinderGeometry(0.36, 0.39, 1.6, 12, 1, false, 0, Math.PI),
    color: col(moss),
    matrix: m4(-0.5, 0.33, -1.1, 0, 0, Math.PI / 2 + 0.06),
  });
  for (const [x, s] of [
    [-1.75, 1],
    [1.75, 0.9],
  ] as const) {
    P.push({
      geometry: new THREE.CircleGeometry(0.3 * s, 12),
      color: col("#c9a57a"),
      matrix: m4(x, 0.3 + x * 0.03, -1.1, 0, Math.PI / 2, 0),
    });
  }
  // A few mushrooms on the log (bright caps: something to spot).
  for (const [x, y] of [
    [0.4, 0.62],
    [0.7, 0.6],
    [-1.1, 0.6],
  ] as const) {
    P.push({
      geometry: new THREE.CylinderGeometry(0.03, 0.035, 0.1, 6),
      color: col("#efe2c4"),
      matrix: m4(x, y, -1, 0, 0, 0),
    });
    P.push({
      geometry: new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      color: col("#e0662e"),
      matrix: m4(x, y + 0.04, -1, 0, 0, 0, 1, 0.6, 1),
    });
  }
  return merge(P);
}

/** The snapped branch at the road edge where the prints leave the road: lying stick, broken stub, leaves. */
export function branchGeometry(): THREE.BufferGeometry {
  const P: ColoredPart[] = [];
  const wood = "#6f5134";
  const pale = "#d8c49a";
  P.push({
    geometry: new THREE.CylinderGeometry(0.05, 0.07, 1.6, 7),
    color: col(wood),
    matrix: m4(0, 0.06, 0, Math.PI / 2, 0, 0.05),
  });
  P.push({
    geometry: new THREE.CylinderGeometry(0.03, 0.045, 0.6, 6),
    color: col(wood),
    matrix: m4(0.2, 0.2, 0.5, 0.9, 0.4, 0.3),
  });
  // Fresh pale break at the snapped end.
  P.push({
    geometry: new THREE.ConeGeometry(0.07, 0.12, 6),
    color: col(pale),
    matrix: m4(0, 0.06, -0.85, -Math.PI / 2, 0, 0),
  });
  for (let i = 0; i < 5; i++) {
    P.push({
      geometry: new THREE.SphereGeometry(0.16, 6, 4),
      color: col(i % 2 ? "#4a7a34" : "#6a9a3e"),
      matrix: m4(Math.sin(i * 2.1) * 0.25, 0.08, 0.35 + i * 0.12, 0, i, 0, 1, 0.25, 0.6),
    });
  }
  return merge(P);
}

/** One leaf of the vanishing puff: a flat diamond, two-sided. */
export function leafGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.09);
  s.quadraticCurveTo(0.06, 0, 0, 0.09);
  s.quadraticCurveTo(-0.06, 0, 0, -0.09);
  return new THREE.ShapeGeometry(s, 3);
}
