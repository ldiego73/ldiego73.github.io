/**
 * Pato de los torrentes (Merganetta armata): low-poly parts in real-life metres (≈0.44 long), facing +Z,
 * origin at the feet. Each part is built around its own pivot so duck.ts can compose
 * root × pivot × rotation per instance (head bobs at the neck base, wings fold/flap at the shoulder,
 * legs paddle at the hip). Geometry is colorless: plumage comes from per-instance colors.
 */
import * as THREE from "three";
import { merge } from "../../fauna-models";

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const ell = (rx: number, ry: number, rz: number, w = 10, h = 7) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);

/** A capsule laid between two points (stripes along the head and neck). */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.0001, len), 2, 6);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}
function chain(points: Array<[number, number, number]>, r: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < points.length; i++)
    parts.push(bar(new THREE.Vector3(...points[i - 1]!), new THREE.Vector3(...points[i]!), r));
  return parts;
}

/** Pivots (model space, before the stylising scale). */
export const NECK = new THREE.Vector3(0, 0.138, 0.112);
export const SHOULDER = new THREE.Vector3(0.045, 0.127, 0.03);
export const HIP = new THREE.Vector3(0.024, 0.06, -0.015);
/** Height of the body's waterline above the feet (swimming: root sits this far under the surface). */
export const WATERLINE = 0.082;

export function duckParts() {
  // Streamlined torso + long stiff tail (they brace it against the rock when perched).
  const torso = at(ell(0.056, 0.052, 0.15, 12, 8), 0, 0.105, 0);
  const tail = new THREE.ConeGeometry(0.03, 0.11, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1.25, 0.35, 1);
  tail.rotateX(-0.22);
  at(tail, 0, 0.12, -0.18);
  const body = merge([torso, tail]);

  // Underparts: rufous on the female, grey-streaked on the male. Fuller low and at the breast.
  const belly = at(ell(0.058, 0.042, 0.135, 12, 8), 0, 0.082, 0.025);

  // Pale streaks along the back and flanks (the "striped" look of both sexes).
  const streaks: THREE.BufferGeometry[] = [];
  for (const [x, y, z, ry] of [
    [0.03, 0.15, -0.02, 0.06],
    [-0.03, 0.15, -0.02, -0.06],
    [0.048, 0.12, 0.0, 0.1],
    [-0.048, 0.12, 0.0, -0.1],
    [0.0, 0.158, 0.03, 0],
    [0.052, 0.098, -0.05, 0.12],
    [-0.052, 0.098, -0.05, -0.12],
  ] as const) {
    const g = ell(0.007, 0.005, 0.07, 6, 4);
    g.rotateY(ry);
    streaks.push(at(g, x, y, z));
  }
  const streak = merge(streaks);

  // Head + neck around the neck pivot (slender neck, flat crown, long head).
  const neck = new THREE.CylinderGeometry(0.0165, 0.023, 0.09, 8);
  neck.rotateX(0.42);
  at(neck, 0, 0.04, 0.018);
  const skull = at(ell(0.032, 0.034, 0.046, 10, 8), 0, 0.088, 0.05);
  const head = merge([neck, skull]);

  // Male: black crown, eye-stripe sweeping back and down the neck, black hind-neck.
  const stripes = merge([
    at(ell(0.015, 0.016, 0.044, 8, 5), 0, 0.114, 0.05),
    ...chain(
      [
        [0.024, 0.098, 0.088],
        [0.032, 0.094, 0.05],
        [0.03, 0.074, 0.018],
        [0.023, 0.04, 0.006],
        [0.024, 0.005, -0.004],
      ],
      0.0072,
    ),
    ...chain(
      [
        [-0.024, 0.098, 0.088],
        [-0.032, 0.094, 0.05],
        [-0.03, 0.074, 0.018],
        [-0.023, 0.04, 0.006],
        [-0.024, 0.005, -0.004],
      ],
      0.0072,
    ),
    bar(new THREE.Vector3(0, 0.1, 0.02), new THREE.Vector3(0, 0.0, -0.012), 0.0095),
  ]);

  // Slim red bill, slightly hooked down.
  const billG = new THREE.ConeGeometry(0.011, 0.056, 6);
  billG.rotateX(Math.PI / 2);
  billG.scale(1.15, 0.75, 1);
  billG.rotateX(0.12);
  const bill = at(billG, 0, 0.08, 0.118);

  const eyes = merge([
    at(ell(0.0055, 0.0055, 0.0055, 6, 4), 0.028, 0.094, 0.07),
    at(ell(0.0055, 0.0055, 0.0055, 6, 4), -0.028, 0.094, 0.07),
  ]);

  // Wing: a flat plate trailing back from the shoulder pivot (thin in y; duck.ts tilts it onto the flank).
  const wingG = ell(0.034, 0.009, 0.11, 8, 5);
  const wp = wingG.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) {
    // Pointed tip: taper the outer back end.
    const z = wp.getZ(i);
    if (z < 0) wp.setX(i, wp.getX(i) * (1 + z / 0.16));
  }
  wingG.computeVertexNormals();
  const wing = at(wingG, 0.0, 0, -0.09);

  // Leg + webbed foot under the hip pivot.
  const shank = at(new THREE.CylinderGeometry(0.0065, 0.0055, 0.058, 5), 0, -0.029, 0);
  const web = new THREE.ConeGeometry(0.022, 0.045, 3);
  web.rotateX(Math.PI / 2);
  web.scale(1, 0.18, 1);
  const leg = merge([shank, at(web, 0, -0.058, 0.016)]);

  return { body, belly, streak, head, stripes, bill, eyes, wing, leg };
}

/** A wet river boulder: jittered icosahedron with a flat top to stand on. Unit radius, top at y=0.55. */
export function rockGeometry(seed = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 7 + seed) * Math.cos(z * 5 - seed) + 0.06 * Math.sin(y * 9 + seed * 2);
    p.setXYZ(i, x * k, Math.min(0.55, y * k), z * k);
  }
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute("uv");
  out.computeVertexNormals();
  return out;
}

/** Plumage per sex. */
export const PLUMAGE = {
  male: {
    body: "#35302d",
    belly: "#8a8178",
    streak: "#d8ccb4",
    head: "#f4f1ea",
    stripes: "#161414",
    wing: "#3c3835",
  },
  female: {
    body: "#7b818b",
    belly: "#c9662c",
    streak: "#4c525b",
    head: "#8d929a",
    stripes: "#8d929a",
    wing: "#666c76",
  },
  bill: "#d4302a",
  leg: "#d75a2a",
  eye: "#120f0e",
} as const;
