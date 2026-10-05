/**
 * Low-poly procedural fauna parts. Every geometry is built around its own pivot so fauna.ts can
 * compose root × pivot(rotation) per instance: necks and heads pitch, legs swing at the hip, wings flap
 * at the shoulder. Models face +Z with origin at the feet (same convention as the traveler).
 * Coat colors come from per-instance colors on a white toon material, so geometry is colorless.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Merge mixed (indexed / non-indexed) primitives; keeps their smooth normals. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const k of Object.keys(g.attributes))
      if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  }
  const out = mergeGeometries(flat) as THREE.BufferGeometry;
  for (const g of new Set([...parts, ...flat])) g.dispose();
  out.computeBoundingSphere();
  return out;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** A lumpy fleece blob: icosahedron with seeded radial jitter (organic, asymmetric). */
function fleece(r: number, seed: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.09 * Math.sin(x * 23 + seed) * Math.cos(z * 19 - seed * 1.3) + 0.05 * Math.sin(y * 31 + seed);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- camelids (vicuña, llama, alpaca)

export interface CamelidSpec {
  /** Hip height (top of the legs). */
  hip: number;
  legLen: number;
  legR: number;
  /** Body half-length (z) and radius. */
  bodyLen: number;
  bodyR: number;
  neckLen: number;
  neckR: number;
  fluffy: boolean;
  /** Ear shape: straight (vicuña/alpaca) or banana (llama). */
  banana: boolean;
}

export const VICUNA: CamelidSpec = {
  hip: 0.76,
  legLen: 0.76,
  legR: 0.045,
  bodyLen: 0.34,
  bodyR: 0.23,
  neckLen: 0.52,
  neckR: 0.085,
  fluffy: false,
  banana: false,
};
export const LLAMA: CamelidSpec = {
  hip: 0.84,
  legLen: 0.84,
  legR: 0.055,
  bodyLen: 0.4,
  bodyR: 0.28,
  neckLen: 0.64,
  neckR: 0.1,
  fluffy: false,
  banana: true,
};
export const ALPACA: CamelidSpec = {
  hip: 0.62,
  legLen: 0.62,
  legR: 0.07,
  bodyLen: 0.32,
  bodyR: 0.3,
  neckLen: 0.5,
  neckR: 0.14,
  fluffy: true,
  banana: false,
};

/** Where parts hang off the root, in body space (for fauna.ts). */
export function camelidRig(s: CamelidSpec) {
  const bodyY = s.hip + s.bodyR * 0.45;
  const fx = s.bodyR * (s.fluffy ? 0.5 : 0.55);
  return {
    bodyY,
    neck: new THREE.Vector3(0, bodyY + s.bodyR * 0.45, s.bodyLen + s.bodyR * 0.25),
    /** Neck top (head pivot) in neck space. */
    headOnNeck: new THREE.Vector3(0, Math.cos(0.22) * s.neckLen, Math.sin(0.22) * s.neckLen),
    hips: [
      new THREE.Vector3(fx, s.hip, s.bodyLen * 0.85),
      new THREE.Vector3(-fx, s.hip, s.bodyLen * 0.85),
      new THREE.Vector3(fx, s.hip, -s.bodyLen * 0.9),
      new THREE.Vector3(-fx, s.hip, -s.bodyLen * 0.9),
    ],
    tail: new THREE.Vector3(0, bodyY + s.bodyR * 0.3, -s.bodyLen - s.bodyR * 0.85),
  };
}

export function camelidParts(s: CamelidSpec) {
  const rig = camelidRig(s);
  const y = rig.bodyY;
  // Body (+ fleece lumps for the alpaca).
  let body: THREE.BufferGeometry;
  if (s.fluffy) {
    body = merge([
      at(fleece(s.bodyR * 1.18, 1), 0, y, s.bodyLen * 0.45),
      at(fleece(s.bodyR * 1.25, 2), 0, y + 0.02, -s.bodyLen * 0.4),
      at(fleece(s.bodyR * 0.95, 3), 0.04, y + s.bodyR * 0.55, 0.02),
      at(fleece(s.bodyR * 0.75, 4), -0.05, y - s.bodyR * 0.5, -0.05),
    ]);
    body.scale(0.92, 0.94, 1);
  } else {
    const c = new THREE.CapsuleGeometry(s.bodyR, s.bodyLen * 2, 4, 10);
    c.rotateX(Math.PI / 2);
    c.scale(0.92, 1.05, 1);
    // A slight sway in the back so the silhouette is not a pill.
    const p = c.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.03 * Math.cos((z / (s.bodyLen + s.bodyR)) * Math.PI * 0.5));
    }
    c.computeVertexNormals();
    body = merge([at(c, 0, y, 0)]);
  }
  // Pale underside (vicuña belly / llama) as its own part, colored separately.
  const bellyGeo = new THREE.SphereGeometry(s.bodyR, 12, 8);
  bellyGeo.scale(1.0, 0.55, (s.bodyLen + s.bodyR) / s.bodyR);
  const belly = merge([at(bellyGeo, 0, y - s.bodyR * 0.42, 0)]);

  // Neck: rises from its pivot, leaning forward; tapers toward the head.
  const neckParts: THREE.BufferGeometry[] = [];
  if (s.fluffy) {
    // One woolly column (lumpy, not a stack of balls), slightly wider at the base.
    const n = fleece(s.neckR * 1.1, 5, 2);
    n.scale(1, s.neckLen / (s.neckR * 2.1), 1.05);
    const p = n.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 1.08 - 0.16 * (p.getY(i) / s.neckLen + 0.5);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    n.computeVertexNormals();
    neckParts.push(at(n, 0, s.neckLen * 0.5, 0.03));
  } else {
    const n = new THREE.CylinderGeometry(s.neckR * 0.78, s.neckR * 1.15, s.neckLen, 8, 3);
    n.translate(0, s.neckLen / 2, 0);
    neckParts.push(n);
  }
  const neck = merge(neckParts);
  neck.rotateX(0.22);

  // Head: muzzle forward (+Z), ears up; alpacas get a fleece topknot.
  const hr = s.neckR * (s.fluffy ? 0.78 : 1.15);
  const skull = new THREE.CapsuleGeometry(hr, hr * 1.5, 3, 8);
  skull.rotateX(Math.PI / 2 - 0.25);
  const headParts = [at(skull, 0, 0.02, hr * 0.9)];
  if (s.fluffy) headParts.push(at(fleece(hr * 1.45, 8), 0, hr * 0.95, -hr * 0.1));
  for (const side of [-1, 1]) {
    const e = new THREE.ConeGeometry(hr * 0.42, hr * (s.banana ? 2.6 : 1.9), 5);
    if (s.banana) {
      // Banana ears curve inward at the tip.
      const p = e.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const ey = p.getY(i) / (hr * 2.6) + 0.5;
        p.setX(i, p.getX(i) - side * ey * ey * hr * 0.7);
      }
      e.computeVertexNormals();
    }
    e.rotateZ(-side * 0.28);
    e.rotateX(-0.25);
    headParts.push(at(e, side * hr * 0.62, hr * (s.banana ? 1.75 : 1.45), -hr * 0.25));
  }
  const head = merge(headParts);

  // Eyes (dark), in head space.
  const eyes = merge(
    [-1, 1].map((side) => at(new THREE.SphereGeometry(hr * 0.2, 6, 4), side * hr * 0.78, hr * 0.42, hr * 0.85)),
  );

  // Leg: hangs from the hip pivot (-Y), with a fleece "pant" for alpacas and a small hoof.
  const legParts: THREE.BufferGeometry[] = [
    at(new THREE.CylinderGeometry(s.legR, s.legR * 0.8, s.legLen, 6, 2), 0, -s.legLen / 2, 0),
    at(new THREE.SphereGeometry(s.legR * 1.15, 6, 4), 0, -s.legLen + s.legR * 0.6, s.legR * 0.5),
  ];
  if (s.fluffy) legParts.push(at(fleece(s.legR * 1.9, 9, 0), 0, -s.legLen * 0.32, 0));
  const leg = merge(legParts);

  // Tail: a short tuft.
  const t = s.fluffy ? fleece(0.1, 10, 0) : new THREE.ConeGeometry(0.06, 0.24, 5);
  if (!s.fluffy) t.rotateX(Math.PI * 0.62);
  const tail = merge([t]);

  // Ear tassels (alpaca): yarn pompoms + short cords at both ear tips, in head space.
  const tassel = merge(
    [-1, 1].flatMap((side) => [
      at(new THREE.IcosahedronGeometry(hr * 0.42, 0), side * hr * 0.95, hr * 1.5, -hr * 0.2),
      at(new THREE.CylinderGeometry(hr * 0.12, hr * 0.12, hr * 0.9, 4), side * hr * 1.0, hr * 1.0, -hr * 0.2),
    ]),
  );

  // Llama pack: dyed blanket + two saddlebags + bedroll, in body space.
  const blanket = new THREE.BoxGeometry(s.bodyR * 2.15, 0.06, s.bodyLen * 1.5);
  const bags = [-1, 1].map((side) =>
    at(new THREE.BoxGeometry(0.12, 0.26, s.bodyLen * 0.8), side * (s.bodyR + 0.06), y - 0.02, 0),
  );
  const roll = new THREE.CylinderGeometry(0.09, 0.09, s.bodyR * 2, 8);
  roll.rotateZ(Math.PI / 2);
  const packCloth = merge([at(blanket, 0, y + s.bodyR * 1.02, 0)]);
  const packBags = merge([...bags, at(roll, 0, y + s.bodyR * 1.15, -s.bodyLen * 0.45)]);

  return { rig, body, belly, neck, head, eyes, leg, tail, tassel, packCloth, packBags };
}

// ---------------------------------------------------------------- vizcacha

export function vizcachaParts() {
  // Sitting pear: rump low and wide, chest up.
  const body = new THREE.SphereGeometry(0.2, 12, 9);
  body.scale(1, 1.1, 1.25);
  body.rotateX(-0.55);
  const rump = new THREE.SphereGeometry(0.19, 10, 8);
  rump.scale(1.15, 0.85, 1.1);
  const feet = [-1, 1].map((side) => at(new THREE.BoxGeometry(0.07, 0.05, 0.2), side * 0.11, 0.025, 0.06));
  const bodyGeo = merge([at(body, 0, 0.26, 0.02), at(rump, 0, 0.16, -0.05), ...feet]);

  const skull = new THREE.SphereGeometry(0.115, 10, 8);
  skull.scale(1, 0.92, 1.18);
  const ears = [-1, 1].map((side) => {
    const e = new THREE.CapsuleGeometry(0.032, 0.17, 2, 6);
    e.scale(1, 1, 0.55);
    e.rotateZ(-side * 0.3);
    e.rotateX(-0.35);
    return at(e, side * 0.055, 0.16, -0.04);
  });
  const nose = at(new THREE.SphereGeometry(0.035, 6, 4), 0, -0.01, 0.135);
  const head = merge([at(skull, 0, 0.03, 0.04), ...ears, nose]);
  const eyes = merge([-1, 1].map((side) => at(new THREE.SphereGeometry(0.022, 6, 4), side * 0.085, 0.06, 0.09)));

  // Curled tail: a torus arc in the YZ plane, rolling up behind the rump.
  const tail = new THREE.TorusGeometry(0.1, 0.035, 5, 12, Math.PI * 1.55);
  tail.rotateY(Math.PI / 2);
  tail.rotateX(Math.PI * 0.35);
  const tailGeo = merge([at(tail, 0, 0.1, -0.08)]);
  return {
    body: bodyGeo,
    head,
    eyes,
    tail: tailGeo,
    headPivot: new THREE.Vector3(0, 0.44, 0.1),
    tailPivot: new THREE.Vector3(0, 0.08, -0.24),
  };
}

// ---------------------------------------------------------------- condor

/** Right-wing planform (x outward, y backward along the chord), with slotted primaries at the tip. */
const WING: Array<[number, number]> = [
  [0.1, 0],
  [0.9, -0.09],
  [1.7, -0.02],
  [2.3, 0.08],
  [1.98, 0.17],
  [2.34, 0.24],
  [1.98, 0.31],
  [2.28, 0.39],
  [1.92, 0.45],
  [2.12, 0.55],
  [1.72, 0.57],
  [1.2, 0.66],
  [0.6, 0.7],
  [0.1, 0.56],
];
/** The white secondary-covert band on the upper wing. */
const PATCH: Array<[number, number]> = [
  [0.22, 0.34],
  [1.35, 0.3],
  [1.25, 0.6],
  [0.22, 0.52],
];

function planform(pts: Array<[number, number]>, side: 1 | -1, depth: number, lift: number) {
  const ordered = side === 1 ? pts : [...pts].reverse();
  const shape = new THREE.Shape(ordered.map(([x, y]) => new THREE.Vector2(x * side, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2 + lift);
  // Shape XY → wing plane XZ: chord (shape +y) points backward (-Z), thickness becomes Y.
  g.rotateX(-Math.PI / 2);
  // A gentle camber/droop toward the tip.
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(p.getX(i));
    p.setY(i, p.getY(i) - 0.05 * ax * ax * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function condorParts() {
  const torso = new THREE.CapsuleGeometry(0.22, 0.8, 4, 10);
  torso.rotateX(Math.PI / 2);
  torso.scale(1, 0.85, 1);
  // Tail fan.
  const fan = new THREE.Shape([
    new THREE.Vector2(-0.12, 0),
    new THREE.Vector2(0.12, 0),
    new THREE.Vector2(0.24, 0.5),
    new THREE.Vector2(-0.24, 0.5),
  ]);
  const tail = new THREE.ExtrudeGeometry(fan, { depth: 0.04, bevelEnabled: false });
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -0.5);
  const body = merge([torso, tail]);
  const collar = merge([at(new THREE.TorusGeometry(0.16, 0.075, 6, 12), 0, 0.02, 0.58)]);
  const head = new THREE.SphereGeometry(0.11, 8, 6);
  head.scale(0.9, 0.9, 1.2);
  const beak = new THREE.ConeGeometry(0.045, 0.14, 5);
  beak.rotateX(Math.PI / 2 + 0.5);
  const headGeo = merge([at(head, 0, 0.06, 0.72), at(beak, 0, 0.02, 0.84)]);
  const shoulder = 0.16;
  return {
    body,
    collar,
    head: headGeo,
    wingR: planform(WING, 1, 0.05, 0),
    wingL: planform(WING, -1, 0.05, 0),
    // Thicker than the wing so the white band shows from below (where the traveler sees them) and above.
    patchR: planform(PATCH, 1, 0.075, 0),
    patchL: planform(PATCH, -1, 0.075, 0),
    shoulder: new THREE.Vector3(shoulder, 0.06, 0.32),
  };
}
