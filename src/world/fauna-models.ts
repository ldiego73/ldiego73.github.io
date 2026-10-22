/**
 * Procedural fauna parts for the worlds that compose animals from rigid pieces on pivots (fauna.ts, the lake's
 * and the Colca's herds, the Qusqu caravan, the condors): every geometry is built around its own pivot so a
 * herd can compose root × pivot(rotation) per instance — necks and heads pitch, legs swing at the hip, wings
 * flap at the shoulder. Models face +Z with the origin at the feet (same convention as the traveler). Coat
 * colours come from per-instance colours on a white toon material, so the geometry is colourless.
 *
 * Since the new characters, the pieces are the same kind of surface as the skinned animals
 * (characters/animals/): each piece is a smooth union of a few primitives polygonised by surface nets (wool
 * and fur lumps on the field, soft joints, gradient normals), instead of capsules and cylinders. The API, the
 * pivots (`camelidRig`) and the part list are unchanged, so every world keeps working; worlds that want real
 * skinned bodies, gaits and instanced herds use characters/animals (createAnimal, createHerd) instead.
 *
 * Builds are cached per spec (plain arrays) and every call returns fresh BufferGeometries (callers translate
 * and dispose them freely).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Prim, prepare, type Vec3 } from "./characters/sdf";
import { polygonise } from "./characters/surface-nets";

/** Merge mixed (indexed / non-indexed) primitives; keeps their smooth normals. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const k of Object.keys(g.attributes))
      if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.getAttribute("uv"))
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  }
  const out = mergeGeometries(flat) as THREE.BufferGeometry;
  for (const g of new Set([...parts, ...flat])) g.dispose();
  out.computeBoundingSphere();
  return out;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

// ---------------------------------------------------------------- field pieces

interface Field {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
}

const fields = new Map<string, Field>();

/** Polygonise a smooth union of primitives (cached by key) into a fresh indexed geometry with zero UVs. */
function field(key: string, h: number, prims: () => Prim[], woolNormal = 0.4): THREE.BufferGeometry {
  let f = fields.get(key);
  if (!f) {
    const m = polygonise(prepare(prims()), h, woolNormal);
    f = { position: m.positions, normal: m.normals, index: m.indices };
    fields.set(key, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(f.position.slice(), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(f.normal.slice(), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((f.position.length / 3) * 2), 2));
  g.setIndex(new THREE.BufferAttribute(f.index.slice(), 1));
  g.computeBoundingSphere();
  return g;
}

const ell = (c: Vec3, r: Vec3, blend: number, wool = 0, woolFreq = 14): Prim => ({
  shape: { kind: "ellipsoid", c, r },
  bone: 0,
  blend,
  slot: 0,
  ...(wool ? { wool, woolFreq } : {}),
});
const cone = (a: Vec3, b: Vec3, ra: number, rb: number, blend: number, wool = 0, woolFreq = 14): Prim => ({
  shape: { kind: "cone", a, b, ra, rb },
  bone: 0,
  blend,
  slot: 0,
  ...(wool ? { wool, woolFreq } : {}),
});

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

const specKey = (s: CamelidSpec) =>
  [s.hip, s.legLen, s.legR, s.bodyLen, s.bodyR, s.neckLen, s.neckR, s.fluffy ? 1 : 0, s.banana ? 1 : 0].join(",");

export function camelidParts(s: CamelidSpec) {
  const rig = camelidRig(s);
  const key = specKey(s);
  const y = rig.bodyY;
  const R = s.bodyR;
  const L = s.bodyLen;
  // Fleece: puffed silhouette on the barrel and neck (alpacas the most), soft cel bands (woolNormal).
  const wool = R * (s.fluffy ? 0.19 : s.banana ? 0.1 : 0.045);
  const wf = 6.5 / (R / 0.28);
  // Coarse voxels: these parts draw in instanced herds, often far away (~5k triangles per animal).
  const h = R * 0.2;

  // Barrel, chest and rump in one woolly surface.
  const body = field(`camelid:${key}:body`, h, () => [
    ell([0, y, 0], [R * 0.95, R * 0.96, L * 1.05], 0, wool, wf),
    ell([0, y - R * 0.02, L * 0.78], [R * 0.9, R * 0.98, R * 0.85], R * 0.32, wool, wf),
    ell([0, y + R * 0.04, -L * 0.82], [R * 0.9, R * 0.92, R * 0.85], R * 0.32, wool, wf),
  ]);
  // A paler belly peeking under the barrel (a separate, coloured part).
  const belly = field(`camelid:${key}:belly`, h, () => [ell([0, y - R * 0.55, 0], [R * 0.72, R * 0.38, L * 1.05], 0)]);

  // Neck: rises from its pivot and tapers; leaning forward by 0.22 like the rig's head pivot.
  const neck = field(`camelid:${key}:neck`, h * 0.85, () => [
    cone([0, -s.neckR * 0.6, 0.0], [0, s.neckLen * 0.55, 0], s.neckR * 1.3, s.neckR * 1.05, 0, wool * 0.9, wf * 1.3),
    cone(
      [0, s.neckLen * 0.55, 0],
      [0, s.neckLen, 0],
      s.neckR * 1.05,
      s.neckR * 0.85,
      s.neckR * 0.4,
      wool * 0.6,
      wf * 1.5,
    ),
  ]);
  neck.rotateX(0.22);

  // Head (head space, origin at the neck top): skull, soft muzzle, lip, banana or straight ears, a forelock.
  const hr = s.neckR * (s.fluffy ? 0.78 : 1.15);
  const head = field(`camelid:${key}:head`, hr * 0.24, () => {
    const p: Prim[] = [
      ell([0, hr * 0.15, hr * 0.45], [hr * 0.9, hr * 0.88, hr * 1.05], 0),
      cone([0, hr * 0.05, hr * 1.0], [0, -hr * 0.3, hr * 2.0], hr * 0.72, hr * 0.58, hr * 0.4),
      ell([0, -hr * 0.55, hr * 1.75], [hr * 0.45, hr * 0.27, hr * 0.46], hr * 0.2),
      ell(
        [0, hr * 0.85, hr * 0.15],
        [hr * 0.68 * (s.fluffy ? 1.8 : 1), hr * 0.45 * (s.fluffy ? 1.8 : 1), hr * 0.64 * (s.fluffy ? 1.6 : 1)],
        hr * 0.35,
        hr * (s.fluffy ? 0.3 : 0.2),
        22 / hr / 10,
      ),
    ];
    for (const side of [-1, 1]) {
      const base: Vec3 = [side * hr * 0.45, hr * 0.7, -hr * 0.1];
      if (s.banana) {
        const mid: Vec3 = [side * hr * 0.7, hr * 1.65, -hr * 0.15];
        const tip: Vec3 = [side * hr * 0.48, hr * 2.4, 0];
        p.push(cone(base, mid, hr * 0.29, hr * 0.25, hr * 0.28), cone(mid, tip, hr * 0.25, hr * 0.08, hr * 0.14));
      } else {
        const tip: Vec3 = [side * hr * 0.85, hr * 1.95, -hr * 0.35];
        p.push(
          cone(base, [side * hr * 0.65, hr * 1.3, -hr * 0.22], hr * 0.27, hr * 0.24, hr * 0.25),
          cone([side * hr * 0.65, hr * 1.3, -hr * 0.22], tip, hr * 0.24, hr * 0.07, hr * 0.12),
        );
      }
    }
    return p;
  });

  // Eyes (dark), in head space, just proud of the skull's side.
  const eyes = merge(
    [-1, 1].map((side) => {
      const e = new THREE.SphereGeometry(hr * 0.2, 8, 6);
      e.scale(0.55, 1.05, 1);
      return at(e, side * hr * 0.8, hr * 0.32, hr * 0.78);
    }),
  );

  // Leg (hip pivot space, hanging down −Y): woolly upper leg, bony knee, slim cannon, padded two-toed foot.
  const lr = s.legR;
  const len = s.legLen;
  const leg = field(`camelid:${key}:leg`, lr * 0.62, () => [
    cone(
      [0, lr, 0],
      [0, -len * 0.48, lr * 0.15],
      lr * (s.fluffy ? 2.0 : 1.75),
      lr * 1.0,
      0,
      s.fluffy ? lr * 0.45 : lr * 0.2,
      10 / (lr * 10),
    ),
    ell([0, -len * 0.5, lr * 0.2], [lr * 1.05, lr * 1.1, lr * 1.05], lr * 0.5),
    cone([0, -len * 0.5, lr * 0.2], [0, -len + lr * 1.1, lr * 0.25], lr * 0.95, lr * 0.78, lr * 0.45),
    ell([lr * 0.42, -len + lr * 0.5, lr * 1.1], [lr * 0.5, lr * 0.52, lr * 0.9], lr * 0.25),
    ell([-lr * 0.42, -len + lr * 0.5, lr * 1.1], [lr * 0.5, lr * 0.52, lr * 0.9], lr * 0.25),
  ]);

  // Tail: a short woolly plume held up a little (tail pivot space).
  const tail = field(`camelid:${key}:tail`, h * 0.6, () => [
    cone([0, 0, 0], [0, -0.08, -0.16], s.fluffy ? 0.09 : 0.065, s.fluffy ? 0.07 : 0.05, 0, wool * 0.8, wf * 1.8),
  ]);

  // Ear tassels (alpaca): yarn pompoms + short cords at both ear tips, in head space.
  const tassel = merge(
    [-1, 1].flatMap((side) => [
      at(new THREE.IcosahedronGeometry(hr * 0.42, 0), side * hr * 0.95, hr * 1.5, -hr * 0.2),
      at(new THREE.CylinderGeometry(hr * 0.12, hr * 0.12, hr * 0.9, 4), side * hr * 1.0, hr * 1.0, -hr * 0.2),
    ]),
  );

  // Llama pack: dyed blanket + two saddlebags + bedroll, in body space.
  const blanket = new THREE.BoxGeometry(R * 2.15, 0.06, L * 1.5);
  const bags = [-1, 1].map((side) => at(new THREE.BoxGeometry(0.12, 0.26, L * 0.8), side * (R + 0.06), y - 0.02, 0));
  const roll = new THREE.CylinderGeometry(0.09, 0.09, R * 2, 8);
  roll.rotateZ(Math.PI / 2);
  const packCloth = merge([at(blanket, 0, y + R * 1.02, 0)]);
  const packBags = merge([...bags, at(roll, 0, y + R * 1.15, -L * 0.45)]);

  return { rig, body, belly, neck, head, eyes, leg, tail, tassel, packCloth, packBags };
}

// ---------------------------------------------------------------- vizcacha

export function vizcachaParts() {
  // Sitting pear: rump low and wide, chest up, soft grey fur, big hind feet.
  const body = field("vizcacha:body", 0.02, () => [
    ell([0, 0.27, 0.03], [0.17, 0.2, 0.17], 0, 0.01, 40),
    ell([0, 0.16, -0.05], [0.21, 0.16, 0.2], 0.08, 0.012, 40),
    ell([0.11, 0.03, 0.06], [0.04, 0.03, 0.1], 0.03),
    ell([-0.11, 0.03, 0.06], [0.04, 0.03, 0.1], 0.03),
    ell([0.06, 0.12, 0.15], [0.03, 0.08, 0.035], 0.03),
    ell([-0.06, 0.12, 0.15], [0.03, 0.08, 0.035], 0.03),
  ]);
  // Head (head pivot space): round skull, blunt nose, long rabbit-like ears.
  const head = field("vizcacha:head", 0.014, () => [
    ell([0, 0.03, 0.04], [0.105, 0.1, 0.13], 0, 0.004, 60),
    ell([0, -0.005, 0.13], [0.045, 0.04, 0.035], 0.03),
    cone([0.05, 0.1, -0.02], [0.085, 0.28, -0.08], 0.032, 0.026, 0.02),
    cone([-0.05, 0.1, -0.02], [-0.085, 0.28, -0.08], 0.032, 0.026, 0.02),
  ]);
  const eyes = merge(
    [-1, 1].map((side) => {
      const e = new THREE.SphereGeometry(0.022, 8, 6);
      e.scale(0.6, 1, 1);
      return at(e, side * 0.088, 0.06, 0.1);
    }),
  );
  // Curled tail rolling up behind the rump, a dark brush at the end (tail pivot space).
  const tail = field("vizcacha:tail", 0.014, () => {
    const p: Prim[] = [];
    let prev: Vec3 = [0, 0.02, 0.02];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 1.3;
      const q: Vec3 = [0, 0.1 + Math.sin(a - Math.PI / 2) * 0.1, -0.02 - Math.sin(a) * 0.12];
      p.push(cone(prev, q, 0.03 + i * 0.002, 0.03 + i * 0.003, 0.012, i > 3 ? 0.012 : 0.004, 50));
      prev = q;
    }
    return p;
  });
  return {
    body,
    head,
    eyes,
    tail,
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
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.3,
    bevelSize: depth * 0.25,
    bevelSegments: 2,
  });
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
  // Torso and a fanned tail, one feathered surface.
  const body = field("condor:body", 0.03, () => {
    const p: Prim[] = [ell([0, 0, 0.05], [0.23, 0.2, 0.62], 0, 0.014, 22)];
    for (let i = 0; i < 5; i++) {
      const u = i / 4 - 0.5;
      p.push(ell([u * 0.22, -0.01, -0.72], [0.07, 0.03, 0.24], 0.04, 0.006, 30));
    }
    return p;
  });
  // The white ruff round the base of the neck: a soft, lumpy collar.
  const collar = field("condor:collar", 0.022, () => [ell([0, 0.02, 0.58], [0.2, 0.15, 0.12], 0, 0.03, 26)]);
  // Bare head with the male's comb and a hooked bill.
  const head = field("condor:head", 0.012, () => [
    ell([0, 0.06, 0.71], [0.095, 0.09, 0.12], 0),
    ell([0, 0.15, 0.73], [0.02, 0.05, 0.085], 0.02),
    cone([0, 0.06, 0.8], [0, 0.03, 0.87], 0.042, 0.03, 0.02),
    cone([0, 0.03, 0.87], [0, -0.01, 0.9], 0.03, 0.012, 0.01),
  ]);
  const shoulder = 0.16;
  return {
    body,
    collar,
    head,
    wingR: planform(WING, 1, 0.05, 0),
    wingL: planform(WING, -1, 0.05, 0),
    // Thicker than the wing so the white band shows from below (where the traveler sees them) and above.
    patchR: planform(PATCH, 1, 0.075, 0),
    patchL: planform(PATCH, -1, 0.075, 0),
    shoulder: new THREE.Vector3(shoulder, 0.06, 0.32),
  };
}
