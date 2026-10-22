/**
 * Small worn pieces, rigid on (or blended between) body bones, all on the body layer (no extra draw):
 *
 *   collar      a rolled ring at a neck opening (poncho, sweater), or a flat shirt / polo collar;
 *   backpack    the traveler's pack with a laptop edge and a bedroll, on a spring "pack" bone; `daypack` a
 *               smaller hiker's pack with a rolled mat;
 *   chalina     a wool scarf round the neck with both ends down the front, a stripe and a fringe;
 *   bandana     a knotted kerchief on the chest;
 *   beads       a necklace of beads or huayruro seeds (two alternating slots);
 *   tupu        the silver pin of the lliclla;
 *   zip, placket, buckle, pockets: the details of a jacket, polo, belt and cargo trousers;
 *   sunglasses  two dark lenses and their temples;
 *   chumpi      the woven belt wound round the waist over the skirt or unku, a two-row checker of dyes;
 *   ojotas, sandals: soles with straps over bare feet.
 *
 * Pure (no DOM, no Three).
 */
import type { Piece } from "../build";
import { hugPath, toOffset } from "../drape";
import { bezier, type Grid, joinGrids, lathe, profile, tube } from "../loft";
import { mirrorX, type Prim, rotX, rotZ, type Vec3 } from "../sdf";
import { HS } from "../slots";
import { type BoneRows, faceForward, LOD_H, res, rigidGrid, skinnedGrid, type WearCtx, type Worn } from "./ctx";

export type WornKind =
  | "collar-ring"
  | "shirt-collar"
  | "backpack"
  | "daypack"
  | "chalina"
  | "bandana"
  | "beads"
  | "tupu"
  | "zip"
  | "placket"
  | "buckle"
  | "pockets"
  | "sunglasses"
  | "chumpi";

export function wornBones(kinds: ReadonlySet<WornKind>, k: number): BoneRows {
  const rows: BoneRows = [];
  if (kinds.has("backpack") || kinds.has("daypack")) rows.push(["pack", "chest", [0, 1.12 * k, -0.17 * k]]);
  return rows;
}

const H = (ctx: WearCtx, h: number) => h * LOD_H[ctx.lod]!;

export function worn(ctx: WearCtx, kind: WornKind): Worn {
  switch (kind) {
    case "collar-ring":
      return { pieces: [collarRing(ctx, 0.087, 1.222, HS.trim)] };
    case "shirt-collar":
      return { pieces: [shirtCollar(ctx)] };
    case "backpack":
      return backpack(ctx);
    case "daypack":
      return daypack(ctx);
    case "chalina":
      return { pieces: chalina(ctx) };
    case "bandana":
      return { pieces: [bandana(ctx)] };
    case "beads":
      return { pieces: [beads(ctx)] };
    case "tupu":
      return { pieces: ctx.lod < 2 ? [tupu(ctx)] : [] };
    case "zip":
      return { pieces: ctx.lod < 2 ? [frontLine(ctx, "zip", 0.86, 1.17, 0.006, HS.dark)] : [] };
    case "placket":
      return { pieces: ctx.lod < 2 ? [frontLine(ctx, "placket", 1.02, 1.17, 0.012, HS.trim)] : [] };
    case "buckle":
      return { pieces: ctx.lod < 2 ? [buckle(ctx)] : [] };
    case "pockets":
      return { pieces: ctx.lod < 2 ? [pockets(ctx)] : [] };
    case "sunglasses":
      return { pieces: sunglasses(ctx) };
    case "chumpi":
      return { pieces: [chumpi(ctx)] };
  }
}

/** A rolled ring at the neck (radius, height in traveler units). */
function collarRing(ctx: WearCtx, r0: number, y0: number, slot: number): Piece {
  const k = ctx.k;
  const ring: Array<[number, number]> = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 - (i / n) * Math.PI * 2;
    ring.push([(r0 + Math.cos(t) * 0.016) * k * ctx.sw ** 0.5, (y0 + Math.sin(t) * 0.014) * k]);
  }
  const g = lathe(ring, res(ctx, 24, 10), 0.94);
  return rigidGrid("collar", g, ctx.b("chest"), slot);
}

/** A flat shirt collar: a band round the neck folding out into two points in front. */
function shirtCollar(ctx: WearCtx): Piece {
  const k = ctx.k;
  const prof: Array<readonly [number, number]> = [
    [0.07 * k, 1.235 * k],
    [0.082 * k, 1.24 * k],
    [0.11 * k, 1.2 * k],
    [0.098 * k, 1.192 * k],
    [0.07 * k, 1.21 * k],
  ];
  const g = lathe(prof, res(ctx, 24, 10), 0.92);
  // Open the front: pull the front columns down and out into two points.
  for (let i = 0; i < g.positions.length; i += 3) {
    const x = g.positions[i] as number;
    const z = g.positions[i + 2] as number;
    const a = Math.atan2(x, z);
    const front = Math.max(0, Math.cos(a)) ** 4;
    g.positions[i + 1] = (g.positions[i + 1] as number) - front * 0.03 * k;
    g.positions[i] = x * (1 + front * 0.15);
  }
  return rigidGrid("shirtcollar", g, ctx.b("chest"), HS.trim);
}

function backpack(ctx: WearCtx): Worn {
  const k = ctx.k;
  const pack = ctx.b("pack");
  const P = (v: Vec3): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  const pieces: Piece[] = [
    {
      kind: "field",
      name: "pack",
      prims: [
        {
          shape: { kind: "box", c: P([0, 1.0, -0.275]), h: P([0.15, 0.165, 0.07]), round: 0.055 * k, rot: rotX(0.06) },
          bone: pack,
          blend: 0,
          slot: HS.pack,
        },
        {
          shape: { kind: "box", c: P([0, 0.93, -0.345]), h: P([0.095, 0.06, 0.03]), round: 0.025 * k },
          bone: pack,
          blend: 0.015 * k,
          slot: HS.pack,
        },
      ],
      h: H(ctx, 0.022),
      rigid: pack,
      bands: [{ prims: [0], at: (p) => p[1] / k - (p[2] / k) * 0.06, stops: [1.075], slots: [HS.pack, HS.packTrim] }],
    },
    {
      kind: "field",
      name: "bedroll",
      prims: [
        {
          shape: { kind: "cone", a: P([-0.17, 0.82, -0.27]), b: P([0.17, 0.82, -0.27]), ra: 0.058 * k, rb: 0.058 * k },
          bone: pack,
          blend: 0,
          slot: HS.accent,
        },
      ],
      h: H(ctx, 0.022),
      rigid: pack,
      bands: [
        { prims: [0], at: (p) => Math.abs(p[0]) / k, stops: [0.1, 0.12], slots: [HS.accent, HS.white, HS.accent] },
      ],
    },
  ];
  if (ctx.lod < 2)
    pieces.push({
      kind: "field",
      name: "laptop",
      prims: [
        {
          shape: {
            kind: "box",
            c: P([0.01, 1.16, -0.26]),
            h: P([0.125, 0.06, 0.016]),
            round: 0.012 * k,
            rot: rotZ(-0.06),
          },
          bone: pack,
          blend: 0,
          slot: HS.laptop,
        },
      ],
      h: H(ctx, 0.013),
      rigid: pack,
      bands: [{ prims: [0], at: (p) => p[1] / k + (p[0] / k) * 0.06, stops: [1.205], slots: [HS.laptop, HS.screen] }],
    });
  // Shoulder straps over the clavicles to the front of the armpits (rigid on the chest).
  if (ctx.lod < 2)
    for (const sx of [1, -1]) {
      const path = hugPath(
        ctx.field,
        [0.1 * sx * k, 1.12 * k, -0.17 * k],
        res(ctx, 9, 5),
        0.045 * k,
        (i) => (i < 3 ? [0.01 * sx, 0.2, 1] : [0.02 * sx, -1, 0.35]),
        0.012 * k,
      );
      pieces.push(
        rigidGrid(
          `strap${sx}`,
          tube(path, () => 0.012 * k, 5, { flat: 0.4 }),
          ctx.b("chest"),
          HS.pack,
        ),
      );
    }
  return { pieces };
}

function daypack(ctx: WearCtx): Worn {
  const k = ctx.k;
  const pack = ctx.b("pack");
  const P = (v: Vec3): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  const pieces: Piece[] = [
    {
      kind: "field",
      name: "daypack",
      prims: [
        {
          shape: { kind: "box", c: P([0, 1.0, -0.24]), h: P([0.12, 0.15, 0.055]), round: 0.05 * k, rot: rotX(0.05) },
          bone: pack,
          blend: 0,
          slot: HS.pack,
        },
        {
          shape: { kind: "cone", a: P([-0.13, 0.84, -0.24]), b: P([0.13, 0.84, -0.24]), ra: 0.045 * k, rb: 0.045 * k },
          bone: pack,
          blend: 0,
          slot: HS.packTrim,
        },
      ],
      h: H(ctx, 0.022),
      rigid: pack,
      bands: [{ prims: [0], at: (p) => p[1] / k, stops: [1.1], slots: [HS.pack, HS.packTrim] }],
    },
  ];
  return { pieces };
}

/** The chalina: a wool ring round the neck, both ends down the front (one shorter), a stripe and a fringe. */
function chalina(ctx: WearCtx): Piece[] {
  const k = ctx.k;
  const chest = ctx.b("chest");
  const neck = ctx.b("neck");
  const ringPts: Vec3[] = [];
  const n = res(ctx, 20, 10);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    ringPts.push([Math.sin(a) * 0.105 * k, 1.205 * k + Math.cos(a) * 0.012 * k, Math.cos(a) * 0.1 * k - 0.005 * k]);
  }
  const ring = tube(ringPts, () => 0.036 * k, ctx.lod ? 6 : 8);
  const pieces: Piece[] = [
    skinnedGrid(
      "chalina",
      ring,
      () => [
        [chest, 0.7],
        [neck, 0.3],
      ],
      HS.accent,
    ),
  ];
  // Tails: flattened tubes hugging the chest, one longer.
  for (const [x, len, tw] of [
    [0.06, 0.32, 1],
    [-0.02, 0.26, -1],
  ] as const) {
    const path = hugPath(
      ctx.field,
      [x * k, 1.19 * k, 0.11 * k],
      res(ctx, 8, 4),
      (len * k) / 7,
      () => [0.02 * tw, -1, 0.15],
      0.035 * k,
    );
    const g = tube(path, () => 0.038 * k, ctx.lod ? 6 : 8, { flat: 0.32, up: [0, 0, 1] });
    const yTop = (path[0] as Vec3)[1];
    const yBot = (path[path.length - 1] as Vec3)[1];
    pieces.push(
      rigidGrid(`chalina-tail${tw}`, g, chest, (p) => {
        const t = (yTop - p[1]) / (yTop - yBot);
        return t > 0.9 ? HS.white : t > 0.7 && t < 0.8 ? HS.accent2 : HS.accent;
      }),
    );
  }
  return pieces;
}

/** A kerchief knotted at the throat, its point down the chest. */
function bandana(ctx: WearCtx): Piece {
  const k = ctx.k;
  const chest = ctx.b("chest");
  return {
    kind: "field",
    name: "bandana",
    prims: [
      {
        shape: {
          kind: "box",
          c: [0, 1.12 * k, 0.11 * k],
          h: [0.07 * k, 0.07 * k, 0.012 * k],
          round: 0.01 * k,
          rot: rotZ(Math.PI / 4),
        },
        bone: chest,
        blend: 0,
        slot: HS.accent,
      },
      {
        shape: { kind: "ellipsoid", c: [0, 1.2 * k, 0.065 * k], r: [0.085 * k, 0.025 * k, 0.065 * k] },
        bone: chest,
        blend: 0.02 * k,
        slot: HS.accent,
      },
      {
        shape: { kind: "box", c: [0, 1.2 * k, 0.04 * k], h: [0.2, 0.2, 0.06 * k], round: 0 },
        bone: chest,
        blend: 0.01 * k,
        slot: HS.accent,
        carve: true,
      },
    ],
    h: H(ctx, 0.012),
    rigid: chest,
  };
}

/** A necklace of beads lying on the chest: two alternating slots. */
function beads(ctx: WearCtx): Piece {
  const k = ctx.k;
  const n = res(ctx, 26, 12);
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const drop = Math.max(0, Math.cos(a)) ** 2 * 0.07 * k;
    pts.push([Math.sin(a) * 0.12 * k, 1.17 * k - drop, Math.cos(a) * 0.105 * k]);
  }
  const hugged = pts.map((p) => hugPath(ctx.field, p, 1, 0, () => [0, 1, 0], 0.012 * k)[0] as Vec3);
  const beadsN = n * 2;
  const g = tube(hugged, (t) => (0.011 + 0.006 * Math.abs(Math.sin(t * beadsN * Math.PI))) * k, 6);
  const seg = (p: Vec3) => Math.floor(((Math.atan2(p[0], p[2]) + Math.PI) / (Math.PI * 2)) * beadsN);
  return rigidGrid("beads", g, ctx.b("chest"), (p) => (seg(p) % 2 ? HS.bead1 : HS.bead2));
}

/** The tupu: a silver disc pin with its needle, on the chest where the lliclla's edges meet. */
function tupu(ctx: WearCtx): Piece {
  const k = ctx.k;
  const head = lathe(
    [
      [0, 0.004 * k],
      [0.022 * k, 0.004 * k],
      [0.03 * k, 0.0],
      [0.022 * k, -0.004 * k],
      [0, -0.004 * k],
    ],
    16,
  );
  faceForward(head);
  const at: Vec3 = [0, 1.06 * k, 0.125 * k * ctx.sw];
  for (let i = 0; i < head.positions.length; i += 3) {
    head.positions[i] = (head.positions[i] as number) + at[0];
    head.positions[i + 1] = (head.positions[i + 1] as number) + at[1];
    head.positions[i + 2] = (head.positions[i + 2] as number) + at[2];
  }
  const needle = tube(
    [
      [at[0] - 0.035 * k, at[1] + 0.035 * k, at[2] - 0.004 * k],
      [at[0] + 0.05 * k, at[1] - 0.05 * k, at[2] - 0.004 * k],
    ],
    () => 0.0045 * k,
    5,
  );
  return rigidGrid("tupu", joinGrids([head, needle]), ctx.b("chest"), HS.metal);
}

/** A line hugging the front of the torso (a zip, a polo placket), from y0 to y1 (traveler units). */
function frontLine(ctx: WearCtx, name: string, y0: number, y1: number, w: number, slot: number): Piece {
  const k = ctx.k;
  const path = hugPath(ctx.field, [0, y0 * k, 0.12 * k], 8, ((y1 - y0) * k) / 7, () => [0, 1, 0], 0.003 * k);
  const g = tube(path, () => w * k, 4, { flat: 0.3, up: [0, 0, 1] });
  const spine = ctx.b("spine");
  const chest = ctx.b("chest");
  const yc = 0.98 * k;
  return skinnedGrid(
    name,
    g,
    (p) => {
      const t = Math.min(1, Math.max(0, (p[1] - yc + 0.06 * k) / (0.12 * k)));
      return [
        [spine, 1 - t],
        [chest, t],
      ];
    },
    slot,
  );
}

function buckle(ctx: WearCtx): Piece {
  const k = ctx.k;
  return {
    kind: "field",
    name: "buckle",
    prims: [
      {
        shape: { kind: "box", c: [0, 0.858 * k, 0.118 * k], h: [0.03 * k, 0.022 * k, 0.01 * k], round: 0.006 * k },
        bone: ctx.b("hips"),
        blend: 0,
        slot: HS.metal,
      },
    ],
    h: H(ctx, 0.01),
    rigid: ctx.b("hips"),
  };
}

/** Cargo pockets on the outer thighs. */
function pockets(ctx: WearCtx): Piece {
  const k = ctx.k;
  const pl: Prim = {
    shape: {
      kind: "box",
      c: [0.155 * k * ctx.hw, 0.52 * k, 0.005 * k],
      h: [0.02 * k, 0.06 * k, 0.05 * k],
      round: 0.012 * k,
    },
    bone: ctx.b("thighL"),
    blend: 0,
    slot: HS.legs,
  };
  return {
    kind: "field",
    name: "pockets",
    prims: [pl, mirrorX(pl, ctx.b("thighR"))],
    h: H(ctx, 0.014),
    skin: (p) => [[p[0] > 0 ? ctx.b("thighL") : ctx.b("thighR"), 1]],
  };
}

/** Small dark sunglasses: two lenses over the eyes, a bridge and the temples back to the ears. */
function sunglasses(ctx: WearCtx): Piece[] {
  const s = ctx.hr[0] / 0.222;
  const hc = ctx.hc;
  const head = ctx.b("head");
  const ey = hc[1] - 0.06 * s;
  const lens: Prim = {
    shape: {
      kind: "ellipsoid",
      c: [hc[0] + 0.07 * s, ey, hc[2] + 0.2 * s],
      r: [0.05 * s, 0.032 * s, 0.012 * s],
      rot: rotX(0.05),
    },
    bone: head,
    blend: 0,
    slot: HS.dark,
  };
  const pieces: Piece[] = [
    {
      kind: "field",
      name: "lenses",
      prims: [lens, mirrorX(lens, head)],
      h: H(ctx, 0.008),
      rigid: head,
    },
  ];
  if (ctx.lod < 2) {
    const bridge = bezier(
      [hc[0] - 0.025 * s, ey + 0.012 * s, hc[2] + 0.212 * s],
      [hc[0], ey + 0.02 * s, hc[2] + 0.222 * s],
      [hc[0] + 0.025 * s, ey + 0.012 * s, hc[2] + 0.212 * s],
      5,
    );
    const temples: Grid[] = [tube(bridge, () => 0.005 * s, 4)];
    for (const sx of [1, -1])
      temples.push(
        tube(
          [
            [hc[0] + 0.115 * s * sx, ey + 0.01 * s, hc[2] + 0.19 * s],
            [hc[0] + 0.21 * s * sx, ey + 0.015 * s, hc[2] + 0.08 * s],
            [hc[0] + 0.215 * s * sx, ey + 0.0 * s, hc[2] - 0.02 * s],
          ],
          () => 0.006 * s,
          4,
        ),
      );
    pieces.push(rigidGrid("glasses-frame", joinGrids(temples), head, HS.dark));
  }
  return pieces;
}

// ---------------------------------------------------------------- footwear over bare feet

/** Ojotas (tyre-rubber sandals of the Andes) or beach sandals: a sole and straps over a bare foot. */
export function sandals(ctx: WearCtx, kind: "ojotas" | "sandals"): Piece[] {
  const k = ctx.k;
  const pieces: Piece[] = [];
  for (const [sd, sx] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const fx = 0.1 * ctx.hw * k * sx;
    const foot = ctx.b(`foot${sd}`);
    pieces.push({
      kind: "field",
      name: `sole${sd}`,
      prims: [
        {
          shape: { kind: "box", c: [fx, 0.008 * k, 0.036 * k], h: [0.05 * k, 0.008 * k, 0.112 * k], round: 0.007 * k },
          bone: foot,
          blend: 0,
          slot: HS.sole,
        },
      ],
      h: H(ctx, 0.012),
      rigid: foot,
    });
    if (ctx.lod >= 2) continue;
    const strap = (a: Vec3, c: Vec3, e: Vec3) =>
      tube(
        bezier(a, c, e, 9).map((p) => hugPath(ctx.field, p, 1, 0, () => [0, 1, 0], 0.007 * k)[0] as Vec3),
        () => 0.008 * k,
        5,
        { flat: 0.45 },
      );
    const P = (x: number, y: number, z: number): Vec3 => [fx + x * k, y * k, z * k];
    const straps =
      kind === "ojotas"
        ? [
            strap(P(-0.045, 0.014, 0.03), P(0, 0.1, 0.045), P(0.045, 0.014, 0.03)),
            strap(P(0, 0.03, 0.115), P(0, 0.07, 0.06), P(0, 0.09, 0.0)),
          ]
        : [
            strap(P(-0.045, 0.014, 0.08), P(0, 0.075, 0.085), P(0.045, 0.014, 0.08)),
            strap(P(-0.045, 0.014, -0.03), P(0, 0.11, -0.04), P(0.045, 0.014, -0.03)),
          ];
    pieces.push(rigidGrid(`straps${sd}`, joinGrids(straps), foot, HS.shoe));
  }
  return pieces;
}

export { profile };

/**
 * The chumpi: a woven belt wound twice round the waist (two stacked cords at 0.893 and 0.857 traveler units,
 * hugged onto whatever the waist wears), its dyes in a checker of `accent`, `accent2` and `white` that shifts
 * between the two turns like a warp pattern.
 */
function chumpi(ctx: WearCtx): Piece {
  const k = ctx.k;
  const n = res(ctx, 32, 12);
  const segs = n;
  const turns: Grid[] = [];
  for (const y of [0.893, 0.857]) {
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(toOffset(ctx.field, [Math.sin(a) * 0.12 * k * ctx.hw, y * k, Math.cos(a) * 0.1 * k], 0.034 * k));
    }
    turns.push(tube(pts, () => 0.017 * k, 6));
  }
  const SLOTS = [HS.accent, HS.white, HS.accent2, HS.white];
  const seg = (p: Vec3) => Math.floor(((Math.atan2(p[0], p[2]) + Math.PI) / (Math.PI * 2)) * segs);
  return rigidGrid("chumpi", joinGrids(turns), ctx.b("hips"), (p) => {
    const row = p[1] > 0.875 * k ? 0 : 2;
    return SLOTS[(seg(p) + row) % 4] as number;
  });
}
