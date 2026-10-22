/**
 * Totora models of the lake, built into a shared `Build` (./build.ts): the Uros islands' layered reed floors,
 * their reed huts and watchtower, the floating reed boardwalk, and the balsa de totora (two big bundles with
 * upturned ends, a puma-head prow and a reed-mat sail). The flags and the sail are cloth on the shared wind
 * (./build.ts `cloth`, `kitMaterial`). Local frames: +z forward / toward the front door, y 0 at
 * the lake surface unless said otherwise. Pure geometry helpers, no state.
 */
import * as THREE from "three";
import type { Build } from "./build";

export const REED = {
  straw: "#d9c27c",
  light: "#e8d494",
  dark: "#b4964f",
  deep: "#8f7438",
  green: "#9cb35a",
  tie: "#6e5230",
  mat: "#cdb26a",
  wood: "#7a5233",
  stone: "#8a8378",
  ink: "#2a2018",
} as const;

/** Layered reed floor of an island of radius r: a dark waterlogged base, a straw rim, a fresh top layer. */
export function islandFloor(b: Build, r: number, top: number, seed: number) {
  const segs = 30;
  const wob = (k: number) => 1 + 0.05 * Math.sin(k * 2.3 + seed) + 0.035 * Math.sin(k * 5.1 + seed * 2);
  const ring = (rad: number, y0: number, y1: number, color: string) => {
    const g = b.own(new THREE.CylinderGeometry(1, 1.04, 1, segs, 1));
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = wob((a / (Math.PI * 2)) * segs);
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
    g.computeVertexNormals();
    b.add(g, color, 0, (y0 + y1) / 2, 0, 0, 0, 0, rad, y1 - y0, rad);
  };
  ring(r + 0.25, -0.5, top - 0.22, REED.deep);
  ring(r + 0.05, top - 0.24, top - 0.08, REED.dark);
  ring(r - 0.25, top - 0.1, top, REED.light);
  // Loose bundles laid round the rim and a few fresh green patches on top.
  for (let k = 0; k < Math.round(r * 2.2); k++) {
    const a = (k / Math.round(r * 2.2)) * Math.PI * 2 + seed;
    b.bundle(1.6, 0.14, Math.cos(a) * (r - 0.05), top - 0.12, Math.sin(a) * (r - 0.05), REED.straw, a + Math.PI / 2);
  }
  for (let k = 0; k < 5; k++) {
    const a = seed * 3 + k * 1.3;
    const d = r * (0.25 + (k % 3) * 0.2);
    b.cyl(0.7, 0.8, 0.03, Math.cos(a) * d, top - 0.01, Math.sin(a) * d, REED.green, 9);
  }
  // Loose strands strewn over the floor (fresh reed is laid on top every few weeks).
  for (let k = 0; k < Math.round(r * r * 0.55); k++) {
    const a = k * 2.399 + seed;
    const d = Math.sqrt((k + 0.5) / (r * r * 0.55)) * (r - 0.6);
    const color = k % 3 === 0 ? REED.dark : k % 3 === 1 ? REED.straw : "#e2c86f";
    b.bundle(0.9 + (k % 4) * 0.25, 0.045, Math.cos(a) * d, top + 0.005, Math.sin(a) * d, color, a * 1.7, 0, 0.5);
  }
}

/** A reed hut: straw walls, a steep gabled reed roof, a dark doorway on +z. Base at y. */
export function reedHut(
  b: Build,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w = 2.2,
  d = 1.8,
  h = 1.4,
  roof: string = REED.dark,
) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  b.box(w, h, d, x, y, z, REED.light, yaw);
  // A darker waterline course of bundles at the foot, and vertical reed strips up the walls.
  b.box(w + 0.06, 0.28, d + 0.06, x, y, z, REED.dark, yaw);
  for (let k = 1; k < 6; k++) {
    for (const face of [-1, 1]) {
      const [px, pz] = at(-w / 2 + (k * w) / 6, face * (d / 2 + 0.02));
      b.box(0.05, h - 0.3, 0.03, px, y + 0.28, pz, REED.straw, yaw);
    }
  }
  // Vertical reed lines on the walls: thin bundles standing at the corners.
  for (const [lx, lz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const) {
    const [px, pz] = at(lx, lz);
    b.cyl(0.08, 0.09, h + 0.1, px, y, pz, REED.dark, 6);
  }
  // Gabled roof: a triangular prism (3-sided cylinder on its side), ridge along local x.
  // A vertex of the 3-sided cylinder turned to +x becomes the ridge once the prism lies along x.
  const prism = b.own(new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateY(Math.PI / 2));
  b.add(prism, roof, x, y + h + 0.42, z, 0, yaw, Math.PI / 2, 0.95, w + 0.5, (d / 2 + 0.35) * 1.2);
  // Doorway and a woven mat hung beside it.
  const [dx, dz] = at(0, d / 2 + 0.01);
  b.box(0.6, 1.05, 0.04, dx, y, dz, REED.ink, yaw);
}

/** Watchtower: four bundled reed legs leaning together, a platform and a little pointed roof. Base at y. */
export function watchtower(b: Build, x: number, y: number, z: number, h = 4.2) {
  const foot = 1.1;
  const top = 0.5;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    b.stick(
      new THREE.Vector3(x + sx * foot, y, z + sz * foot),
      new THREE.Vector3(x + sx * top, y + h, z + sz * top),
      0.13,
      REED.dark,
      6,
    );
  }
  // Lashings / rungs.
  for (let k = 1; k < 5; k++) {
    const t = k / 5;
    const r = foot + (top - foot) * t;
    b.box(r * 2 + 0.2, 0.08, 0.08, x, y + h * t, z - r, REED.tie);
    b.box(r * 2 + 0.2, 0.08, 0.08, x, y + h * t, z + r, REED.tie);
  }
  b.box(1.5, 0.14, 1.5, x, y + h, z, REED.straw);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    b.cyl(0.05, 0.05, 0.9, x + sx * 0.65, y + h + 0.14, z + sz * 0.65, REED.dark, 5);
  b.cyl(0.01, 1.15, 0.95, x, y + h + 1.0, z, REED.deep, 4, 0, 0, Math.PI / 4);
}

/** A flag on a reed pole (the island's dye, a white band): cloth held along the pole, flying on the wind. */
export function bannerPole(b: Build, x: number, y: number, z: number, dye: string, yaw = 0) {
  b.cyl(0.05, 0.06, 3.4, x, y, z, REED.wood, 5);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // The panel's local x runs along the frame's +z (yaw − π/2), so its "left" edge is the one at the pole.
  const fy = yaw - Math.PI / 2;
  b.cloth(0.9, 0.55, x + s * 0.47, y + 3.0, z + c * 0.47, dye, { pin: "left", yaw: fy, segs: [8, 3] });
  // The band: a hair thicker, the same flex across, so it rides the flag's ripple.
  b.cloth(0.9, 0.1, x + s * 0.47, y + 3.0, z + c * 0.47, "#efe6d6", {
    pin: "left",
    yaw: fy,
    thick: 0.036,
    segs: [8, 1],
  });
}

/** Three cooking stones on a flat slab (the Uros cook on stones over the reeds). */
export function hearth(b: Build, x: number, y: number, z: number) {
  b.cyl(0.55, 0.6, 0.08, x, y, z, REED.stone, 9);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.sph(0.16, 0.13, 0.16, x + Math.cos(a) * 0.25, y + 0.15, z + Math.sin(a) * 0.25, "#6d665c", 0);
  }
  b.cyl(0.18, 0.22, 0.24, x, y + 0.08, z, "#4a3a2c", 8);
}

/**
 * Balsa de totora (local frame: +z bow, y 0 at the waterline). Two long bundles with upturned ends side by side,
 * a central bundle, a puma head on the bow, a mast with a reed-mat sail (optional) and a low seat.
 * `scale` 1 is the big boat (~6.4 u); fishermen's boats use ~0.6.
 */
export function balsaBoat(b: Build, scale = 1, sail = true) {
  const L = 3.2 * scale;
  const r = 0.42 * scale;
  for (const side of [-1, 1]) {
    const x = side * 0.42 * scale;
    // Body: a long straight bundle, then up-curving ends (bundles pitched up).
    b.bundle(L * 1.15, r, x, 0.12 * scale, 0, REED.straw);
    for (const end of [-1, 1]) {
      const z = end * L * 0.6;
      b.bundle(L * 0.5, r * 0.66, x * 0.9, 0.4 * scale, z, REED.straw, 0, -end * 0.5);
      b.bundle(L * 0.34, r * 0.4, x * 0.72, 0.86 * scale, end * L * 0.83, REED.dark, 0, -end * 0.95);
    }
    // Tie rings.
    for (let k = -3; k <= 3; k++)
      b.cyl(r * 1.04, r * 1.04, 0.07 * scale, x, (0.12 - 0.035) * scale, k * L * 0.16, REED.tie, 8, Math.PI / 2);
  }
  b.bundle(L * 0.9, r * 0.6, 0, 0.42 * scale, -0.1 * scale, REED.light);
  // Puma head on the bow (a stylised feline: head, ears, snout).
  const hz = L * 0.95;
  const hy = 1.2 * scale;
  b.sph(0.36 * scale, 0.32 * scale, 0.4 * scale, 0, hy, hz, REED.straw, 1);
  b.sph(0.2 * scale, 0.16 * scale, 0.22 * scale, 0, hy - 0.08 * scale, hz + 0.32 * scale, REED.dark, 1);
  for (const s of [-1, 1]) {
    b.cyl(0.0, 0.11 * scale, 0.22 * scale, s * 0.2 * scale, hy + 0.22 * scale, hz - 0.05 * scale, REED.dark, 5);
    b.sph(
      0.05 * scale,
      0.05 * scale,
      0.04 * scale,
      s * 0.15 * scale,
      hy + 0.08 * scale,
      hz + 0.33 * scale,
      REED.ink,
      0,
    );
  }
  // Stern knot.
  b.sph(0.22 * scale, 0.22 * scale, 0.22 * scale, 0, 1.05 * scale, -L * 0.95, REED.dark, 0);
  if (sail) {
    b.cyl(0.05 * scale, 0.06 * scale, 3.4 * scale, 0, 0.5 * scale, 0.35 * scale, REED.wood, 5);
    // Reed-mat sail: vertical strips side by side between the yard and the boom, a stiff mat that bellies in
    // the gusts (cloth held at both ends; a reed mat gives less than a flag, hence the low free flex).
    const w = 1.6 * scale;
    const n = 9;
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + (k + 0.5) * (w / n);
      b.cloth(w / n - 0.01, 2.1 * scale, x, 2.35 * scale, 0.42 * scale, k % 2 ? REED.mat : REED.light, {
        pin: "ends",
        flex: [0, 0.55],
        thick: 0.06 * scale,
        segs: [1, 6],
      });
    }
    b.box(w + 0.3 * scale, 0.07 * scale, 0.07 * scale, 0, 3.42 * scale, 0.42 * scale, REED.wood);
    b.box(w + 0.1 * scale, 0.06 * scale, 0.06 * scale, 0, 1.28 * scale, 0.42 * scale, REED.wood);
  }
}
