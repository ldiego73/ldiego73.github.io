/**
 * Spectacled bear (oso de anteojos, Tremarctos ornatus): low-poly procedural parts with baked vertex
 * colors (each primitive is one flat color, so the cream "spectacles" keep hard edges the ink catches).
 * Every part is built around its own pivot so bear.ts composes root × pivot per instance:
 *  - torso: origin at the hip pivot, +Z forward (pitches up to sit, stand and climb);
 *  - head: origin at the neck pivot; arm: origin at the shoulder, hangs -Y; leg: origin at the hip, hangs -Y;
 *  - prop: a bromeliad rosette held in the paws, origin at its base.
 * Scale: ~1.15 u at the shoulder on all fours, ~1.85 u standing (traveler ≈ 1.7 u).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const COAT = "#30241d";
export const COAT_DARK = "#1a1411";
export const CREAM = "#f0dfae";
export const MUZZLE = "#d5b98a";
export const EYE = "#120d0b";

/** Rig: where parts hang, in their parent's space. */
export const RIG = {
  /** Hip pivot height on all fours (= hind leg length). */
  hip: 0.7,
  leg: 0.7,
  arm: 0.72,
  /** Hind legs in root space (x = ±legX at hip height). */
  legX: 0.2,
  /** Shoulders and neck in torso space. */
  shoulder: new THREE.Vector3(0.21, 0.0, 0.78),
  neck: new THREE.Vector3(0, 0.2, 0.98),
  /** Where the bromeliad sits in arm space (between the paws). */
  paw: new THREE.Vector3(0, -0.68, 0.12),
};

type Piece = THREE.BufferGeometry;

/** Flat-colored, non-indexed piece with only position/normal/color. */
function paint(g: Piece, color: THREE.ColorRepresentation): Piece {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  for (const k of Object.keys(flat.attributes)) if (k !== "position" && k !== "normal") flat.deleteAttribute(k);
  const c = new THREE.Color(color);
  const n = flat.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  flat.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return flat;
}

function mergeColored(parts: Piece[]): Piece {
  const out = mergeGeometries(parts) as Piece;
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** A shaggy blob: sphere with seeded radial jitter (coat lumps), scaled. */
function fur(r: number, seed: number, sx = 1, sy = 1, sz = 1, w = 12, h = 9): Piece {
  const g = new THREE.SphereGeometry(r, w, h);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.06 * Math.sin(x * 21 + seed) * Math.cos(z * 17 - seed * 1.7) + 0.04 * Math.sin(y * 29 + seed * 2.3);
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

const at = (g: Piece, x: number, y: number, z: number) => g.translate(x, y, z);

/** A flattened disc (lens) facing +Z: used for the cream eye rings and the chest bib. */
function lens(r: number, depth: number, seg = 12): Piece {
  const g = new THREE.SphereGeometry(r, seg, 6);
  g.scale(1, 1, depth / r);
  return g;
}

export function torsoGeometry(): Piece {
  const parts: Piece[] = [];
  // Rump, barrel and the high shoulder hump of a bear; a thick neck rolling into the head.
  parts.push(paint(at(fur(0.35, 1, 1, 0.95, 1.05), 0, 0.06, 0.04), COAT));
  parts.push(paint(at(fur(0.38, 2, 1, 0.95, 1.18), 0, 0.07, 0.42), COAT));
  parts.push(paint(at(fur(0.35, 3, 1.03, 1.08, 1), 0, 0.17, 0.74), COAT));
  parts.push(paint(at(fur(0.25, 4, 0.98, 1, 1.15), 0, 0.17, 0.96), COAT));
  // Stubby tail.
  parts.push(paint(at(fur(0.075, 5), 0, 0.2, -0.31), COAT));
  // The cream bib: throat patch flowing down onto the chest (bolder than life so it reads from the trail).
  const bib = lens(0.2, 0.06, 14);
  bib.scale(0.85, 1.45, 1);
  bib.rotateX(0.55);
  parts.push(paint(at(bib, 0, 0.02, 1.13), CREAM));
  const chest = lens(0.18, 0.06, 12);
  chest.scale(1.15, 0.8, 1);
  chest.rotateX(1.05);
  parts.push(paint(at(chest, 0, -0.17, 1.0), CREAM));
  return mergeColored(parts);
}

export function headGeometry(): Piece {
  const parts: Piece[] = [];
  // Broad round skull and jowls (short-faced bear: the snout is short and blunt).
  parts.push(paint(at(fur(0.235, 7, 1, 0.92, 1), 0, 0.06, 0.12), COAT));
  parts.push(paint(at(fur(0.19, 8, 1.12, 0.8, 1), 0, -0.04, 0.2), COAT));
  // Round ears.
  for (const s of [-1, 1]) {
    const ear = fur(0.075, 9 + s, 1, 1, 0.55, 8, 6);
    ear.rotateY(s * 0.3);
    parts.push(paint(at(ear, s * 0.16, 0.25, 0.05), COAT));
    const inner = lens(0.04, 0.012, 8);
    inner.rotateY(s * 0.3);
    parts.push(paint(at(inner, s * 0.16, 0.25, 0.088), COAT_DARK));
  }
  // Short tan muzzle with a dark nose pad.
  const muzzle = new THREE.CapsuleGeometry(0.095, 0.1, 4, 10);
  muzzle.rotateX(Math.PI / 2);
  muzzle.scale(1.05, 0.9, 1);
  parts.push(paint(at(muzzle, 0, -0.03, 0.33), MUZZLE));
  const nose = new THREE.SphereGeometry(0.052, 8, 6);
  nose.scale(1.2, 0.8, 0.9);
  parts.push(paint(at(nose, 0, 0.0, 0.468), EYE));
  const mouth = new THREE.BoxGeometry(0.1, 0.012, 0.05);
  parts.push(paint(at(mouth, 0, -0.1, 0.405), COAT_DARK));
  // The spectacles: cream rings around both eyes, joined over the bridge of the snout, with cheek
  // streaks running down toward the throat bib.
  for (const s of [-1, 1]) {
    const ring = lens(0.1, 0.032, 14);
    ring.scale(1, 1.15, 1);
    ring.rotateY(s * 0.42);
    ring.rotateX(-0.12);
    parts.push(paint(at(ring, s * 0.105, 0.11, 0.295), CREAM));
    const cheek = new THREE.CapsuleGeometry(0.04, 0.16, 3, 6);
    cheek.rotateZ(s * 0.35);
    cheek.rotateX(0.2);
    parts.push(paint(at(cheek, s * 0.13, -0.04, 0.3), CREAM));
    const eye = new THREE.SphereGeometry(0.036, 8, 6);
    parts.push(paint(at(eye, s * 0.11, 0.112, 0.33), EYE));
    const glint = new THREE.SphereGeometry(0.009, 4, 3);
    parts.push(paint(at(glint, s * 0.1, 0.125, 0.36), "#ffffff"));
  }
  const bridge = new THREE.CapsuleGeometry(0.04, 0.1, 3, 6);
  bridge.rotateZ(Math.PI / 2);
  parts.push(paint(at(bridge, 0, 0.17, 0.315), CREAM));
  const blaze = new THREE.CapsuleGeometry(0.038, 0.09, 3, 6);
  blaze.rotateX(0.6);
  parts.push(paint(at(blaze, 0, 0.1, 0.38), CREAM));
  const head = mergeColored(parts);
  // A broad, big-headed bear: scale up around the neck pivot.
  head.scale(1.12, 1.12, 1.12);
  return head;
}

/** Foreleg: thick shoulder, forearm and a broad dark paw with pale claws. Hangs -Y from the shoulder. */
export function armGeometry(): Piece {
  const L = RIG.arm;
  const parts: Piece[] = [];
  parts.push(paint(at(fur(0.15, 11, 1, 1.25, 1.05), 0, -0.1, 0), COAT));
  const fore = new THREE.CapsuleGeometry(0.105, L * 0.5, 3, 8);
  parts.push(paint(at(fore, 0, -L * 0.52, 0.01), COAT));
  const paw = new THREE.SphereGeometry(0.11, 10, 6);
  paw.scale(1.05, 0.55, 1.35);
  parts.push(paint(at(paw, 0, -L + 0.06, 0.05), COAT_DARK));
  for (let k = -1; k <= 1; k++) {
    const claw = new THREE.ConeGeometry(0.014, 0.07, 4);
    claw.rotateX(Math.PI / 2 + 0.5);
    parts.push(paint(at(claw, k * 0.045, -L + 0.035, 0.19), "#bfb39c"));
  }
  return mergeColored(parts);
}

/** Hind leg: heavy thigh, short shin and a long plantigrade foot. Hangs -Y from the hip. */
export function legGeometry(): Piece {
  const L = RIG.leg;
  const parts: Piece[] = [];
  parts.push(paint(at(fur(0.19, 13, 0.85, 1.25, 1.1), 0, -0.13, -0.02), COAT));
  const shin = new THREE.CapsuleGeometry(0.1, L * 0.42, 3, 8);
  parts.push(paint(at(shin, 0, -L * 0.6, -0.01), COAT));
  const foot = new THREE.SphereGeometry(0.11, 10, 6);
  foot.scale(1, 0.5, 1.55);
  parts.push(paint(at(foot, 0, -L + 0.055, 0.08), COAT_DARK));
  return mergeColored(parts);
}

/** A terrestrial bromeliad (achupalla) rosette: green blades with red-tipped heart. Base at the origin. */
export function propGeometry(): Piece {
  const parts: Piece[] = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.39996;
    const blade = new THREE.ConeGeometry(0.03, 0.3, 4);
    blade.translate(0, 0.15, 0);
    blade.rotateX(0.55 + (k % 3) * 0.12);
    blade.rotateY(a);
    parts.push(paint(blade, k % 2 ? "#4f8a3a" : "#3f7a35"));
  }
  for (let k = 0; k < 4; k++) {
    const heart = new THREE.ConeGeometry(0.028, 0.16, 4);
    heart.translate(0, 0.08, 0);
    heart.rotateX(0.25);
    heart.rotateY(k * 1.57);
    parts.push(paint(heart, "#d2382d"));
  }
  return mergeColored(parts);
}

export function bearGeometries() {
  return {
    torso: torsoGeometry(),
    head: headGeometry(),
    arm: armGeometry(),
    leg: legGeometry(),
    prop: propGeometry(),
  };
}
