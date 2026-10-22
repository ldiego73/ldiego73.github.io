/**
 * The mountain's llama in the new one-surface construction: a woolly body (the field's wool noise puffs the
 * fleece), a long neck curving up from the chest, a small fine-haired head with a soft muzzle, banana ears
 * curving inward with colourful yarn t'ikas (ear tassels, as herders tie on), slender legs that taper to bony
 * knees and hocks, and padded two-toed feet. Large dark eyes with long lashes are a mirrored decal on both
 * sides of the head.
 *
 * Bones: body → chest → three neck bones → head → jaw and ears; the tail; and per leg an upper, a lower and a
 * foot bone (front legs bend at the knee like ours, hind legs at the hock the other way: ./gait.ts legIK).
 *
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type FaceMap, type Piece, skeleton } from "./build";
import { mirrorX, type Prim, type Vec3 } from "./sdf";

export const LLAMA_PALETTE = [
  "#f1ebe0", // 0 fleece (cream)
  "#e6dccb", // 1 short hair: head and legs
  "#3b302b", // 2 pads and toenails
  "#5e463e", // 3 nose and lips
  "#c2456b", // 4 t'ika magenta
  "#e07a3a", // 5 t'ika orange
  "#2a9d8f", // 6 t'ika turquoise
  "#d9cbb4", // 7 fleece shade (belly)
];

const SL = { fleece: 0, hair: 1, pad: 2, nose: 3, magenta: 4, orange: 5, turq: 6, belly: 7 } as const;

export function llamaBones(): BoneDef[] {
  const rows: Array<readonly [string, string | null, Vec3]> = [
    ["root", null, [0, 0, 0]],
    ["body", "root", [0, 0.84, -0.06]],
    ["chest", "body", [0, 0.86, 0.26]],
    ["neck0", "chest", [0, 0.97, 0.37]],
    ["neck1", "neck0", [0, 1.2, 0.46]],
    ["neck2", "neck1", [0, 1.41, 0.52]],
    ["head", "neck2", [0, 1.5, 0.55]],
    ["jaw", "head", [0, 1.47, 0.64]],
    ["earL", "head", [0.046, 1.575, 0.53]],
    ["earR", "head", [-0.046, 1.575, 0.53]],
    ["tail", "body", [0, 0.96, -0.5]],
  ];
  for (const [s, x] of [
    ["L", 0.125],
    ["R", -0.125],
  ] as const) {
    rows.push(
      [`fUp${s}`, "chest", [x, 0.8, 0.31]],
      [`fLo${s}`, `fUp${s}`, [x, 0.43, 0.33]],
      [`fFt${s}`, `fLo${s}`, [x, 0.088, 0.33]],
      [`hUp${s}`, "body", [x, 0.82, -0.33]],
      [`hLo${s}`, `hUp${s}`, [x, 0.42, -0.41]],
      [`hFt${s}`, `hLo${s}`, [x, 0.088, -0.37]],
    );
  }
  return skeleton(rows);
}

export function llamaPieces(bones: BoneDef[]): Piece[] {
  const b = (n: string) => boneIndex(bones, n);
  const P: Prim[] = [];
  const add = (p: Prim) => {
    P.push(p);
    return P.length - 1;
  };
  const ell = (c: Vec3, r: Vec3, bone: string, blend: number, slot: number, wool = 0, woolFreq = 16): Prim => ({
    shape: { kind: "ellipsoid", c, r },
    bone: b(bone),
    blend,
    slot,
    ...(wool ? { wool, woolFreq } : {}),
  });
  const cone = (
    a: Vec3,
    c: Vec3,
    ra: number,
    rb: number,
    bone: string,
    blend: number,
    slot: number,
    wool = 0,
    woolFreq = 16,
  ): Prim => ({
    shape: { kind: "cone", a, b: c, ra, rb },
    bone: b(bone),
    blend,
    slot,
    ...(wool ? { wool, woolFreq } : {}),
  });

  // ---- woolly body: a round barrel, chest and rump (big soft puffs, a paler belly)
  const body = [
    add(ell([0, 0.85, -0.04], [0.27, 0.26, 0.44], "body", 0, SL.fleece, 0.03, 6.5)),
    add(ell([0, 0.84, 0.25], [0.25, 0.27, 0.22], "chest", 0.09, SL.fleece, 0.028, 6.5)),
    add(ell([0, 0.87, -0.35], [0.25, 0.25, 0.22], "body", 0.09, SL.fleece, 0.028, 6.5)),
  ];
  // ---- neck: three tapering woolly segments rising from the chest
  add(cone([0, 0.92, 0.33], [0, 1.2, 0.46], 0.165, 0.122, "neck0", 0.08, SL.fleece, 0.028, 8));
  add(cone([0, 1.2, 0.46], [0, 1.41, 0.52], 0.122, 0.1, "neck1", 0.05, SL.fleece, 0.022, 9));
  add(cone([0, 1.41, 0.52], [0, 1.49, 0.54], 0.1, 0.088, "neck2", 0.04, SL.fleece, 0.014, 10));
  // ---- head: rounded skull, soft muzzle, lower lip (jaw), a fluffy forelock
  add(ell([0, 1.53, 0.57], [0.09, 0.088, 0.105], "head", 0.04, SL.hair));
  const muzzle = add(cone([0, 1.52, 0.63], [0, 1.482, 0.722], 0.072, 0.058, "head", 0.045, SL.hair));
  const lip = add(ell([0, 1.455, 0.7], [0.045, 0.027, 0.046], "jaw", 0.02, SL.hair));
  add(ell([0, 1.605, 0.54], [0.068, 0.045, 0.064], "head", 0.035, SL.fleece, 0.02, 22));
  // ---- banana ears: up and curving inward at the tip
  const earL = [
    cone([0.044, 1.57, 0.535], [0.068, 1.665, 0.53], 0.029, 0.025, "earL", 0.028, SL.hair),
    cone([0.068, 1.665, 0.53], [0.046, 1.74, 0.545], 0.025, 0.008, "earL", 0.014, SL.hair),
  ];
  for (const p of earL) add(p);
  for (const p of earL) add(mirrorX(p, b("earR")));
  // ---- tail: a short woolly plume held up a little
  add(cone([0, 0.97, -0.52], [0, 0.94, -0.66], 0.07, 0.058, "tail", 0.045, SL.fleece, 0.026, 12));

  // ---- legs (left, then mirrored): wool on the upper leg, slim lower legs, bony knee / hock, padded toes
  const legs: number[] = [];
  const leg = (s: "L" | "R", front: boolean) => {
    const x = s === "L" ? 0.125 : -0.125;
    const up = `${front ? "f" : "h"}Up${s}`;
    const lo = `${front ? "f" : "h"}Lo${s}`;
    const ft = `${front ? "f" : "h"}Ft${s}`;
    const y0 = front ? 0.8 : 0.82;
    const z0 = front ? 0.31 : -0.33;
    const yj = front ? 0.43 : 0.42;
    const zj = front ? 0.33 : -0.41;
    const zf = front ? 0.33 : -0.37;
    const list: Prim[] = [
      cone([x, y0 + 0.05, z0], [x, yj + 0.04, zj], front ? 0.105 : 0.125, 0.06, up, 0.08, SL.fleece, 0.024, 10),
      ell([x, yj, zj + (front ? 0.004 : -0.006)], [0.05, 0.054, 0.05], lo, 0.03, SL.hair),
      cone([x, yj, zj], [x, 0.095, zf], 0.047, 0.038, lo, 0.025, SL.hair),
      ell([x, 0.085, zf], [0.039, 0.04, 0.04], ft, 0.02, SL.hair),
      cone([x, 0.085, zf], [x, 0.04, zf + 0.04], 0.035, 0.032, ft, 0.02, SL.hair),
      // Two toes with a cleft between them, soft pads underneath.
      ell([x + 0.021, 0.026, zf + 0.062], [0.024, 0.027, 0.048], ft, 0.012, SL.hair),
      ell([x - 0.021, 0.026, zf + 0.062], [0.024, 0.027, 0.048], ft, 0.012, SL.hair),
    ];
    for (const p of list) legs.push(add(p));
  };
  for (const s of ["L", "R"] as const) {
    leg(s, true);
    leg(s, false);
  }

  const face: FaceMap = {
    origin: [0.082, 1.548, 0.6],
    right: [0, 0, 1],
    up: [0, 1, 0],
    fwd: [1, 0, 0],
    w: 0.1,
    h: 0.1,
    depth: 0.05,
    mirror: true,
  };

  const pieces: Piece[] = [
    {
      kind: "field",
      name: "body",
      prims: P,
      h: 0.026,
      faces: [face],
      woolNormal: 0.3,
      bands: [
        // Pads and toenails at the bottom of each foot; a paler belly under the barrel.
        { prims: legs, at: (p) => p[1], stops: [0.016], slots: [SL.pad, SL.hair] },
        { prims: body, at: (p) => p[1], stops: [0.69], slots: [SL.belly, SL.fleece] },
        // Dark nose and lips at the end of the muzzle.
        {
          prims: [muzzle, lip],
          at: (p) => p[2] + Math.abs(p[1] - 1.49) * 0.4,
          stops: [0.772],
          slots: [SL.hair, SL.nose],
        },
      ],
      // Wool sits in soft puffs: a light painted shade in the hollows between them.
      shade: (_p, n) => 0.95 + 0.05 * Math.max(0, n[1]),
    },
  ];

  // ---- t'ikas: yarn pompoms tied at the base of each ear (magenta, orange, turquoise)
  for (const [s, sx] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const ear = b(`ear${s}`);
    const ball = (c: Vec3, r: number, slot: number): Prim => ({
      shape: { kind: "ellipsoid", c, r: [r, r, r] },
      bone: ear,
      blend: 0,
      slot,
      wool: r * 0.35,
      woolFreq: 140,
    });
    pieces.push({
      kind: "field",
      name: `tika${s}`,
      prims: [
        ball([0.072 * sx, 1.6, 0.54], 0.025, SL.magenta),
        ball([0.09 * sx, 1.578, 0.556], 0.02, SL.orange),
        ball([0.078 * sx, 1.572, 0.522], 0.018, SL.turq),
      ],
      h: 0.011,
      rigid: ear,
    });
  }
  return pieces;
}
