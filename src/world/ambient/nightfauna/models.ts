/**
 * Procedural low-poly carnivores for the night fauna: puma (Puma concolor) and zorro andino (culpeo,
 * Lycalopex culpaeus). Same conventions as fauna-models.ts (face +Z, every part built around its own
 * pivot) but painted with vertex colors, so a tawny back, a cream belly, a white muzzle and dark ear
 * backs live in one geometry (one draw call per part type).
 *
 * Body space: origin at the body pivot (mid torso). Head space: origin at the head pivot (top of the
 * neck). Legs hang from their joint along -Y; tail segments run back along -Z from their pivot.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number, out: THREE.Color) => void;

const _c = new THREE.Color();
const _c2 = new THREE.Color();

/** Bake a color function into a `color` attribute (geometry already in its final local placement). */
export function paint(g: THREE.BufferGeometry, fn: Paint | THREE.ColorRepresentation): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const solid = typeof fn === "function" ? null : new THREE.Color(fn);
  for (let i = 0; i < p.count; i++) {
    if (solid) _c.copy(solid);
    else (fn as Paint)(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), _c);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Merge painted primitives (keeps position, normal, color). */
export function mergePainted(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const k of Object.keys(g.attributes))
      if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  }
  const out = mergeGeometries(flat) as THREE.BufferGeometry;
  for (const g of new Set([...parts, ...flat])) g.dispose();
  out.computeBoundingSphere();
  return out;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const sphere = (r: number, sx = 1, sy = 1, sz = 1, w = 10, h = 8) => {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz);
  return g;
};
/** A capsule from a to b (radius r). */
function limb(r: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, seg = 8) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
  g.applyQuaternion(q);
  return at(g, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
const mix = (out: THREE.Color, a: string, b: string, k: number) =>
  out.set(a).lerp(_c2.set(b), k < 0 ? 0 : k > 1 ? 1 : k);
const ss = (e0: number, e1: number, x: number) => THREE.MathUtils.smoothstep(x, e0, e1);

type Key = [u: number, w: number, h: number, yc: number];
/**
 * A smooth torso: a sphere stretched along Z whose cross-sections follow a profile of keys
 * (u = -1 rump … 1 chest; half width, half height and center height at that station).
 */
export function profileBody(halfLen: number, keys: Key[], zc = 0, seg: [number, number] = [14, 18]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  g.rotateX(Math.PI / 2); // poles on the Z axis
  const p = g.attributes.position as THREE.BufferAttribute;
  const at = (u: number, k: 1 | 2 | 3) => {
    if (u <= keys[0]![0]) return keys[0]![k];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!;
      const b = keys[i]!;
      if (u <= b[0]) {
        const t = (u - a[0]) / (b[0] - a[0]);
        const s = t * t * (3 - 2 * t);
        return a[k] + (b[k] - a[k]) * s;
      }
    }
    return keys[keys.length - 1]![k];
  };
  for (let i = 0; i < p.count; i++) {
    const u = p.getZ(i);
    const ring = Math.sqrt(Math.max(0, 1 - u * u)) || 1;
    const blunt = Math.sqrt(Math.max(0, 1 - u ** 6));
    const x = (p.getX(i) / ring) * blunt;
    const y = (p.getY(i) / ring) * blunt;
    p.setXYZ(i, x * at(u, 1), y * at(u, 2) + at(u, 3), u * halfLen + zc);
  }
  g.computeVertexNormals();
  return g;
}

/** Pivots and lengths a part set hangs off (body space unless noted). */
export interface QuadRig {
  /** Standing height of the body pivot above the feet. */
  bodyY: number;
  /** Shoulder joint (x = half track) and hip joint. */
  shoulder: THREE.Vector3;
  hip: THREE.Vector3;
  /** Upper / lower leg lengths, front and hind. */
  upperF: number;
  lowerF: number;
  upperH: number;
  lowerH: number;
  /** Lengths the shared leg geometries were built with (instances scale Y to the real length). */
  upperGeo: number;
  lowerGeo: number;
  /** Head pivot (top of the neck). */
  neck: THREE.Vector3;
  /** Tail root and segment length; per-segment radius scale (taper / bush). */
  tailBase: THREE.Vector3;
  tailSeg: number;
  tailTaper: number[];
  /** Eyes in head space (x = half spacing). */
  eye: THREE.Vector3;
  eyeR: number;
}

export interface QuadParts {
  rig: QuadRig;
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  upper: THREE.BufferGeometry;
  lower: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
}

// ---------------------------------------------------------------- puma

export const PUMA_COLORS = {
  tawny: "#b4834f",
  tawnyDark: "#946539",
  cream: "#e9dcc2",
  white: "#f2ece0",
  dark: "#2c211b",
  nose: "#9a6656",
};

export function pumaParts(): QuadParts {
  const C = PUMA_COLORS;
  // Back tawny, saddle a shade darker along the spine, belly and inner legs cream.
  const coat: Paint = (_x, y, z, _nx, ny, _nz, out) => {
    mix(out, C.tawny, C.tawnyDark, ss(0.12, 0.2, y) * 0.7);
    if (y < -0.06) out.lerp(_c2.set(C.cream), ss(-0.06, -0.17, y) * (ny < 0.2 ? 1 : 0.4));
    // Pale throat and chest front.
    if (z > 0.55 && y < 0.05) out.lerp(_c2.set(C.cream), ss(0.55, 0.7, z) * ss(0.05, -0.1, y));
  };
  const rig: QuadRig = {
    bodyY: 0.51,
    shoulder: new THREE.Vector3(0.1, -0.03, 0.42),
    hip: new THREE.Vector3(0.11, 0.0, -0.47),
    upperF: 0.25,
    lowerF: 0.24,
    upperH: 0.28,
    lowerH: 0.25,
    upperGeo: 0.27,
    lowerGeo: 0.255,
    neck: new THREE.Vector3(0, 0.22, 0.82),
    tailBase: new THREE.Vector3(0, 0.07, -0.66),
    tailSeg: 0.15,
    tailTaper: [1.1, 1, 0.95, 0.92, 0.9, 0.92],
    eye: new THREE.Vector3(0.05, 0.05, 0.16),
    eyeR: 0.022,
  };

  const torso = profileBody(
    0.7,
    [
      [-1, 0.09, 0.09, 0.02],
      [-0.82, 0.16, 0.17, 0.03],
      [-0.55, 0.17, 0.185, 0.03],
      [-0.2, 0.135, 0.15, 0.035],
      [0.2, 0.145, 0.175, 0.0],
      [0.55, 0.16, 0.2, -0.005],
      [0.85, 0.13, 0.17, 0.04],
      [1, 0.08, 0.09, 0.08],
    ],
    -0.02,
  );
  const body = mergePainted([
    paint(torso, coat),
    ...[-1, 1].map((s) => paint(at(sphere(0.09, 0.6, 1, 1.4), s * 0.085, 0.08, 0.4), coat)),
    ...[-1, 1].map((s) => paint(at(sphere(0.14, 0.5, 1.1, 1.15), s * 0.1, -0.03, -0.46), coat)),
    paint(limb(0.11, 0, 0.05, 0.52, 0, 0.17, 0.76, 10), coat),
  ]);

  // Head: small round skull, short muzzle (white), dark whisker pads, nose pad, short round ears.
  const headCoat: Paint = (_x, y, z, _nx, _ny, nz, out) => {
    out.set(C.tawny);
    if (y > 0.07 && nz < -0.05) out.set(C.dark); // back of the ears
    if (y < -0.035 && z > 0.05) out.lerp(_c2.set(C.white), 0.8); // chin / lower jaw
  };
  const muzzleCoat: Paint = (x, _y, z, _nx, _ny, _nz, out) => {
    out.set(C.white);
    if (Math.abs(x) > 0.025 && z > 0.17) out.set(C.dark);
  };
  const head = mergePainted([
    paint(at(sphere(0.1, 1, 0.88, 1.05), 0, 0.02, 0.06), headCoat),
    ...[-1, 1].map((s) => paint(at(sphere(0.06, 0.9, 0.85, 1), s * 0.045, -0.02, 0.1), headCoat)),
    paint(at(sphere(0.06, 1.05, 0.78, 1), 0, -0.025, 0.155), muzzleCoat),
    paint(at(sphere(0.038, 1, 0.8, 1), 0, -0.062, 0.135), C.white),
    paint(at(sphere(0.022, 1.2, 0.8, 0.8, 6, 4), 0, -0.002, 0.21), C.nose),
    ...[-1, 1].map((s) => {
      const e = sphere(0.042, 1, 1.1, 0.42, 8, 6);
      e.rotateZ(-s * 0.35);
      return paint(at(e, s * 0.066, 0.095, 0.02), headCoat);
    }),
  ]);
  head.scale(1.2, 1.2, 1.2);

  // Upper leg: muscular, tapering; lower leg with a broad round paw.
  const upper = mergePainted([
    paint(at(sphere(0.075, 1, 1.1, 1.15), 0, -0.03, 0), coat),
    paint(limb(0.06, 0, 0, 0, 0, -rig.upperGeo, 0.0), (_x, y, _z, _nx, _ny, _nz, out) => {
      mix(out, C.tawny, C.cream, y < -0.12 ? 0.25 : 0);
    }),
  ]);
  const lower = mergePainted([
    paint(limb(0.044, 0, 0, 0, 0, -rig.lowerGeo + 0.035, 0.005), C.tawny),
    paint(at(sphere(0.056, 1, 0.55, 1.3, 8, 6), 0, -rig.lowerGeo + 0.028, 0.03), C.cream),
  ]);
  // Tail segment: a thick capsule from the pivot back along -Z.
  const seg = limb(0.042, 0, 0, 0, 0, 0, -rig.tailSeg, 7);
  const tail = mergePainted([paint(seg, C.tawny)]);
  const eye = new THREE.SphereGeometry(1, 8, 6);
  return { rig, body, head, upper, lower, tail, eye };
}

// ---------------------------------------------------------------- zorro andino (culpeo)

export const FOX_COLORS = {
  grizzle: "#8e847a",
  rufous: "#b0652f",
  rufousDark: "#8f4e25",
  cream: "#efe4cf",
  white: "#f6f1e6",
  black: "#1e1a18",
  tail: "#90806f",
};

export function foxParts(): QuadParts {
  const C = FOX_COLORS;
  // Grizzled grey saddle, rufous flanks and shoulders, cream belly, white throat.
  const coat: Paint = (_x, y, z, _nx, ny, _nz, out) => {
    mix(out, C.rufous, C.grizzle, ss(0.02, 0.08, y) * (z < 0.18 ? 1 : 0.5));
    if (y < -0.04) out.lerp(_c2.set(C.cream), ss(-0.04, -0.09, y) * (ny < 0.3 ? 1 : 0.5));
    if (z > 0.17 && y < 0.04) out.lerp(_c2.set(C.white), ss(0.17, 0.24, z) * ss(0.04, -0.03, y));
  };
  const rig: QuadRig = {
    bodyY: 0.33,
    shoulder: new THREE.Vector3(0.05, -0.025, 0.17),
    hip: new THREE.Vector3(0.055, -0.005, -0.17),
    upperF: 0.16,
    lowerF: 0.155,
    upperH: 0.17,
    lowerH: 0.16,
    upperGeo: 0.165,
    lowerGeo: 0.157,
    neck: new THREE.Vector3(0, 0.125, 0.3),
    tailBase: new THREE.Vector3(0, 0.03, -0.25),
    tailSeg: 0.125,
    tailTaper: [0.75, 1.05, 1.15, 0.95],
    eye: new THREE.Vector3(0.03, 0.035, 0.085),
    eyeR: 0.012,
  };
  const torso = profileBody(
    0.29,
    [
      [-1, 0.05, 0.05, 0.01],
      [-0.75, 0.078, 0.085, 0.01],
      [-0.3, 0.068, 0.075, 0.015],
      [0.3, 0.078, 0.09, 0.0],
      [0.7, 0.08, 0.092, 0.01],
      [1, 0.05, 0.05, 0.04],
    ],
    -0.0,
  );
  const body = mergePainted([
    paint(torso, coat),
    paint(limb(0.055, 0, 0.02, 0.2, 0, 0.1, 0.29, 8), coat),
    // White bib on the throat.
    paint(at(sphere(0.048, 0.9, 1.1, 0.8), 0, 0.02, 0.26), C.white),
  ]);
  const headCoat: Paint = (_x, y, z, _nx, _ny, nz, out) => {
    out.set(C.rufous);
    if (y > 0.04) out.lerp(_c2.set(C.grizzle), 0.35);
    if (y < -0.025) out.set(C.white); // cheeks, lower jaw
    if (z > 0.2) out.set(C.black); // nose tip
    if (y > 0.13 && nz < 0) out.set(C.black); // back of the ear tips
  };
  const muzzle = new THREE.ConeGeometry(0.038, 0.15, 8);
  muzzle.rotateX(Math.PI / 2);
  muzzle.scale(1, 0.8, 1);
  const head = mergePainted([
    paint(at(sphere(0.065, 1.05, 0.9, 1), 0, 0.02, 0.035), headCoat),
    paint(at(muzzle, 0, -0.008, 0.14), headCoat),
    paint(at(sphere(0.042, 1.2, 0.8, 1), 0, -0.035, 0.05), C.white),
    paint(at(sphere(0.012, 1, 0.9, 1, 6, 4), 0, -0.005, 0.215), C.black),
    ...[-1, 1].map((s) => {
      const e = new THREE.ConeGeometry(0.042, 0.125, 5);
      e.scale(1, 1, 0.45);
      e.rotateZ(-s * 0.3);
      e.rotateX(-0.12);
      return paint(at(e, s * 0.044, 0.11, 0.012), headCoat);
    }),
  ]);
  const upper = mergePainted([
    paint(at(sphere(0.038, 1, 1, 1.1), 0, -0.01, 0), coat),
    paint(limb(0.026, 0, 0, 0, 0, -rig.upperGeo, 0), C.rufous),
  ]);
  const lower = mergePainted([
    paint(limb(0.018, 0, 0, 0, 0, -rig.lowerGeo + 0.015, 0.004), C.rufousDark),
    paint(at(sphere(0.024, 1, 0.55, 1.4, 6, 5), 0, -rig.lowerGeo + 0.012, 0.016), C.rufousDark),
  ]);
  // Bushy tail: fusiform puffs that overlap along -Z.
  const puff = sphere(0.068, 1, 1, (rig.tailSeg * 1.05) / 0.068, 9, 7);
  const tail = mergePainted([paint(at(puff, 0, 0, -rig.tailSeg * 0.5), C.tail)]);
  const eye = new THREE.SphereGeometry(1, 8, 6);
  return { rig, body, head, upper, lower, tail, eye };
}
