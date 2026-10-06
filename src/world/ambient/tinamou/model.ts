/**
 * Perdiz andina / pisaca (Nothoprocta ornata, Nothura): a plump, almost tailless ground bird.
 * Low-poly parts built around their own pivots (models face +Z, origin at the feet), painted with
 * per-face vertex colors so the mottled brown-buff plumage, fine dark barring, pale back streaks and
 * pale throat read without textures. Real length ≈ 0.30 u (avatar 1.7 u); the ambient scales it ×1.25.
 *
 * Geometry is uncolored by instance: the material multiplies vertex color × instance tint.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Painter = (cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, h: number) => string;

const _c = new THREE.Color();

/** Cheap stable hash of a face centroid, 0..1 (for mottling). */
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Smooth-shaded primitive → non-indexed with one color per face (from the face centroid, the average
 * normal and a hash), so plumage reads as small flat patches while lighting stays soft.
 */
function paint(g: THREE.BufferGeometry, fn: Painter): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  if (ng.attributes.uv) ng.deleteAttribute("uv");
  const p = ng.attributes.position as THREE.BufferAttribute;
  const n = ng.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const nx = (n.getX(i) + n.getX(i + 1) + n.getX(i + 2)) / 3;
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const nz = (n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)) / 3;
    _c.set(fn(cx, cy, cz, nx, ny, nz, hash3(cx, cy, cz)));
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = _c.r;
      col[(i + k) * 3 + 1] = _c.g;
      col[(i + k) * 3 + 2] = _c.b;
    }
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return ng;
}

const solid =
  (hex: string): Painter =>
  () =>
    hex;

function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts) as THREE.BufferGeometry;
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Plumage palette (sRGB). */
export const PLUMAGE = {
  base: "#8c7254",
  buff: "#c8ad80",
  bar: "#4b3a29",
  mottle: "#6f5a42",
  streak: "#ddc9a0",
  breast: "#a99780",
  throat: "#ece3cc",
  crown: "#45362a",
  bill: "#6f6458",
  eye: "#17110c",
  leg: "#c4ad84",
} as const;

/** Body: barred upperparts with pale back streaks, greyish speckled breast, cinnamon-buff belly. */
const bodyPaint: Painter = (x, y, z, _nx, ny, nz, h) => {
  if (ny < -0.45) return h < 0.18 ? PLUMAGE.mottle : PLUMAGE.buff;
  // Breast: grey-buff with round dark spots.
  if (nz > 0.55 && ny < 0.45) return h < 0.22 ? PLUMAGE.mottle : h > 0.85 ? PLUMAGE.streak : PLUMAGE.breast;
  // Pale longitudinal streaks along the back (Nothoprocta's "ornate" back).
  if (ny > 0.5 && Math.abs(Math.sin(x * 52 + z * 4)) > 0.9) return PLUMAGE.streak;
  // Fine transverse barring on mantle, wings and flanks.
  const bar = (z * 22 + Math.sin(x * 38) * 0.35 + y * 6) % 1;
  if ((bar + 1) % 1 < 0.3) return PLUMAGE.bar;
  if (h < 0.14) return PLUMAGE.mottle;
  if (h > 0.9) return PLUMAGE.streak;
  return PLUMAGE.base;
};

/** Head: dark spotted crown, dark eye-line, pale speckled face and a clean pale throat. */
const headPaint: Painter = (_x, y, _z, nx, ny, nz, h) => {
  if (ny < -0.3 || (nz > 0.35 && ny < -0.05)) return PLUMAGE.throat;
  if (ny > 0.4) return h < 0.3 ? PLUMAGE.streak : PLUMAGE.crown;
  if (Math.abs(nx) > 0.55 && y > 0.088 && y < 0.106) return PLUMAGE.crown; // eye-line
  return h < 0.35 ? PLUMAGE.mottle : PLUMAGE.throat;
};

/** Neck: grey-buff, finely speckled, paler in front. */
const neckPaint: Painter = (_x, _y, _z, _nx, _ny, nz, h) => {
  if (nz > 0.6) return h < 0.3 ? PLUMAGE.mottle : PLUMAGE.throat;
  return h < 0.4 ? PLUMAGE.mottle : h > 0.85 ? PLUMAGE.streak : PLUMAGE.breast;
};

/** Wing upper surface: buff with dark bars across the coverts, rufous-dusky primaries toward the tip. */
const wingPaint: Painter = (x, _y, z, _nx, ny, _nz, h) => {
  if (ny < -0.5) return h < 0.4 ? PLUMAGE.buff : PLUMAGE.streak;
  if (x > 0.17) return (x * 40) % 1 < 0.45 ? "#5a3b22" : "#8f5a2e";
  if ((((z * 30 + x * 6) % 1) + 1) % 1 < 0.33) return PLUMAGE.bar;
  return h < 0.2 ? PLUMAGE.mottle : PLUMAGE.base;
};

export interface TinamouParts {
  body: THREE.BufferGeometry;
  /** Neck + head + bill + eyes, around the neck pivot. */
  head: THREE.BufferGeometry;
  /** Right wing, spread along +X from the shoulder pivot, chord centered on z = 0 (mirror by yaw π). */
  wing: THREE.BufferGeometry;
  /** One leg + foot hanging from the hip pivot. */
  leg: THREE.BufferGeometry;
  /** A tiny feather (two-sided quad) for flush puffs. */
  feather: THREE.BufferGeometry;
  headPivot: THREE.Vector3;
  shoulder: THREE.Vector3;
  hip: THREE.Vector3;
}

export function tinamouParts(): TinamouParts {
  // Round body, rump a touch higher than the chest; no visible tail (rump feathers cover it).
  const torso = new THREE.IcosahedronGeometry(0.12, 3);
  torso.scale(0.95, 0.82, 1.42);
  torso.rotateX(0.12);
  torso.translate(0, 0.165, 0);
  const rump = new THREE.IcosahedronGeometry(0.085, 1);
  rump.scale(1.05, 0.75, 1);
  rump.translate(0, 0.19, -0.11);
  const body = join([paint(torso, bodyPaint), paint(rump, bodyPaint)]);

  // Head (pivot at the neck base, on the upper chest): short thick neck, small round head, thin curved bill.
  const neck = new THREE.CylinderGeometry(0.036, 0.048, 0.085, 8, 2);
  neck.rotateX(0.45);
  neck.translate(0, 0.04, 0.018);
  const skull = new THREE.SphereGeometry(0.052, 12, 8);
  skull.scale(0.92, 0.92, 1.15);
  skull.translate(0, 0.095, 0.05);
  const bill = new THREE.ConeGeometry(0.0105, 0.07, 6, 5);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, 0, 0.035);
  // Decurved: droop grows with the square of the distance from the base.
  const bp = bill.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    bp.setY(i, bp.getY(i) - 3.4 * z * z);
  }
  bill.computeVertexNormals();
  bill.translate(0, 0.09, 0.102);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(0.0105, 6, 4);
    e.translate(s * 0.041, 0.104, 0.07);
    return paint(e, solid(PLUMAGE.eye));
  });
  const head = join([paint(neck, neckPaint), paint(skull, headPaint), paint(bill, solid(PLUMAGE.bill)), ...eyes]);

  // Short, broad, rounded wing (tinamous are poor long-distance flyers): rounded planform, chord on z.
  const outline: Array<[number, number]> = [
    [0, 0.07],
    [0.07, 0.085],
    [0.15, 0.08],
    [0.22, 0.06],
    [0.27, 0.025],
    [0.28, -0.01],
    [0.255, -0.04],
    [0.23, -0.03],
    [0.21, -0.06],
    [0.18, -0.05],
    [0.15, -0.075],
    [0.1, -0.075],
    [0.04, -0.07],
    [0, -0.06],
  ];
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const w = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false, curveSegments: 1 });
  w.translate(0, 0, -0.007);
  w.rotateX(Math.PI / 2); // shape x → span (+X), shape y → chord (+Z forward), depth → thickness (−Y)
  // A gentle downward camber toward the tip.
  const wp = w.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i);
    wp.setY(i, wp.getY(i) - 0.25 * x * x);
  }
  w.computeVertexNormals();
  const wing = join([paint(w, wingPaint)]);

  const shank = new THREE.CylinderGeometry(0.009, 0.007, 0.1, 5, 1);
  shank.translate(0, -0.05, 0);
  const toes = new THREE.BoxGeometry(0.03, 0.01, 0.05);
  toes.translate(0, -0.1, 0.014);
  const leg = join([paint(shank, solid(PLUMAGE.leg)), paint(toes, solid(PLUMAGE.leg))]);

  const f = new THREE.PlaneGeometry(0.05, 0.085, 1, 1);
  f.deleteAttribute("uv");

  return {
    body,
    head,
    wing,
    leg,
    feather: f,
    headPivot: new THREE.Vector3(0, 0.215, 0.13),
    shoulder: new THREE.Vector3(0.075, 0.215, 0.03),
    hip: new THREE.Vector3(0.04, 0.1, 0.0),
  };
}

/** Mirror a painted (non-indexed) part across X, keeping faces front-facing (left wing from the right one). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  for (const name of ["position", "normal", "color"] as const) {
    const a = m.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k] as number;
        (a.array as Float32Array)[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k] as number;
        (a.array as Float32Array)[(i + 2) * a.itemSize + k] = t;
      }
    }
    a.needsUpdate = true;
  }
  return m;
}
