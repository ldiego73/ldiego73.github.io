/**
 * A campesina (Andean highland woman) in the new one-surface construction, drawn from everyday highland dress
 * and never as a caricature: a fitted jobona (jacket) with embroidered cuffs, a layered pollera (two tiers with
 * woven hem bands), a lliclla shawl over the shoulders pinned at the chest with a silver tupu, two long braids
 * tied with wool tassels, a montera (the flat, wide Cusco hat: dark felt, red lining, woven trim), ojotas.
 *
 * Pieces (./build.ts): the body field (bare feet and calves); the hair shell (centre parting) and the braids
 * (three-bone spring chains each); the montera (rings, exact colour rows); the tupu; the ojotas; and the cloth
 * layer: the pollera's two tiers (on the hips, the thighs and a "skirt" spring bone) and the lliclla, both on
 * the cloth wind. Colours are palette slots (CAMPESINA_PALETTE): one geometry can dress many women.
 *
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type GridPiece, type Piece, skeleton } from "./build";
import { drape, drapeArc, type Field, hugPath, makeField } from "./drape";
import { humanBody, humanSkeletonRows } from "./human";
import { bezier, type Grid, joinGrids, lathe, smoothstep, tube } from "./loft";
import { REGION } from "./regions";
import { type Prim, prepare, rotX, type Vec3 } from "./sdf";

export const CAMPESINA_PALETTE = [
  "#a86a42", // 0 skin
  "#2e3a5c", // 1 jobona (dark indigo wool)
  "#a86a42", // 2 legs (bare under the pollera)
  "#3b2c25", // 3 (unused: boots)
  "#efe6d6", // 4 cotton
  "#2f2723", // 5 ojota sole and straps
  "#1d1512", // 6 hair
  "#c2456b", // 7 pollera (magenta bayeta)
  "#c4383f", // 8 woven red
  "#dda63c", // 9 ochre
  "#2a9d8f", // 10 turquoise
  "#efe6d6", // 11 cotton
  "#7d2b3a", // 12 lliclla field (deep cochineal)
  "#e07a3a", // 13 lliclla stripes (orange)
  "#2b2420", // 14 montera felt
  "#b8303a", // 15 montera lining
  "#cfd3d6", // 16 silver (tupu)
  "#e8b631", // 17 tullma tassels (braid ties)
  "#3446a6", // 18 under-tier of the pollera (indigo)
];

const SL = {
  skin: 0,
  top: 1,
  legs: 2,
  cotton: 4,
  sole: 5,
  hair: 6,
  pollera: 7,
  red: 8,
  ochre: 9,
  turq: 10,
  white: 11,
  lliclla: 12,
  orange: 13,
  felt: 14,
  lining: 15,
  silver: 16,
  tassel: 17,
  under: 18,
} as const;

const OPTS = { scale: 0.95, shoulders: 0.9, hips: 1.12, chest: 1.05, feet: "bare" as const };
const K = OPTS.scale;

export function campesinaBones(): BoneDef[] {
  const rows = humanSkeletonRows(OPTS);
  const braid: Array<readonly [string, string | null, Vec3]> = [];
  for (const [s, x] of [
    ["L", 0.105],
    ["R", -0.105],
  ] as const)
    braid.push(
      [`braid${s}0`, "head", [x, 1.29 * K, -0.16 * K]],
      [`braid${s}1`, `braid${s}0`, [x * 1.05, 1.1 * K, -0.2 * K]],
      [`braid${s}2`, `braid${s}1`, [x * 1.05, 0.93 * K, -0.205 * K]],
    );
  return skeleton([...rows, ...braid, ["skirt", "hips", [0, 0.87 * K, 0]]]);
}

export function campesinaPieces(bones: BoneDef[]): Piece[] {
  const b = (n: string) => boneIndex(bones, n);
  const body = humanBody(OPTS, bones, {
    skin: SL.skin,
    top: SL.top,
    legs: SL.legs,
    boot: SL.sole,
    cuff: SL.cotton,
    sole: SL.sole,
    sleeveCuff: SL.ochre,
  });
  const prims = prepare(body.prims);
  const field = makeField(prims);
  const hc = body.head.c;
  const hr = body.head.r;
  const pieces: Piece[] = [
    { kind: "field", name: "body", prims: body.prims, h: 0.02, bands: body.bands, faces: [body.face] },
  ];

  // ---------------------------------------------------------------- hair: a shell with a centre parting
  // The head enlarged a little, cut along a hairline that is high on the forehead and low at the nape, with a
  // soft groove down the middle (the parting the ink picks up as a crease).
  const hairA = Math.atan(0.45);
  const hairPrims: Prim[] = [
    {
      shape: {
        kind: "ellipsoid",
        c: [0, hc[1] + 0.006, hc[2] - 0.008],
        r: [hr[0] + 0.016, hr[1] + 0.018, hr[2] + 0.02],
      },
      bone: b("head"),
      blend: 0,
      slot: SL.hair,
    },
    // Bun of hair at the nape where the braids start.
    {
      shape: { kind: "ellipsoid", c: [0, 1.31 * K, -0.15 * K], r: [0.13, 0.07, 0.07] },
      bone: b("head"),
      blend: 0.05,
      slot: SL.hair,
    },
    {
      shape: {
        kind: "box",
        c: [0, 1.4 * K - 0.3 * Math.cos(hairA), 0.3 * Math.sin(hairA)],
        h: [0.5, 0.3, 0.5],
        round: 0,
        rot: rotX(-hairA),
      },
      bone: b("head"),
      blend: 0.02,
      slot: SL.hair,
      carve: true,
    },
    {
      shape: {
        kind: "cone",
        a: [0, hc[1] + 0.13, hc[2] + 0.2],
        b: [0, hc[1] + 0.2, hc[2] - 0.05],
        ra: 0.012,
        rb: 0.006,
      },
      bone: b("head"),
      blend: 0.012,
      slot: SL.hair,
      carve: true,
    },
  ];
  pieces.push({ kind: "field", name: "hair", prims: hairPrims, h: 0.02, rigid: b("head") });

  // ---------------------------------------------------------------- braids (spring chains)
  for (const s of ["L", "R"] as const) {
    const sx = s === "L" ? 1 : -1;
    const b0 = b(`braid${s}0`);
    const b1 = b(`braid${s}1`);
    const b2 = b(`braid${s}2`);
    const y0 = 1.31 * K;
    // Down the back, over where the lliclla lies (a clearance of shawl + braid), ending at the waist.
    const path = hugPath(
      field,
      [0.1 * sx, y0, -0.16 * K],
      16,
      0.032,
      (i) => [0.004 * sx, -1, -0.04 + (i < 4 ? -0.1 : 0)],
      0.058,
    );
    const N = 11;
    const r = (t: number) => {
      if (t > 0.9) return 0.026 * (1 - (t - 0.9) / 0.1) ** 0.6 + 0.004; // tullma tassel tip
      if (t > 0.84) return 0.03; // wool tie
      const lobe = Math.abs(Math.sin(t * N * Math.PI));
      return (0.024 - 0.006 * t) * (0.86 + 0.24 * lobe);
    };
    const g = tube(path, r, 8, { twist: 0 });
    const ys = path.map((p) => p[1]);
    const yTop = ys[0] as number;
    const yBot = ys[ys.length - 1] as number;
    pieces.push({
      kind: "grid",
      name: `braid${s}`,
      grid: g,
      layer: "body",
      paint: (p) => {
        const t = (yTop - p[1]) / (yTop - yBot);
        const sl = t > 0.9 ? SL.tassel : t > 0.84 ? SL.red : SL.hair;
        return [sl, sl, 1];
      },
      skin: (p) => {
        const t = (yTop - p[1]) / (yTop - yBot);
        return [
          [b("head"), 1 - smoothstep(0.0, 0.12, t)],
          [b0, smoothstep(0.0, 0.12, t) * (1 - smoothstep(0.25, 0.5, t))],
          [b1, smoothstep(0.25, 0.5, t) * (1 - smoothstep(0.55, 0.8, t))],
          [b2, smoothstep(0.55, 0.8, t)],
        ];
      },
    });
  }

  // ---------------------------------------------------------------- montera (rings: exact colour rows)
  const m = montera();
  pieces.push({
    kind: "grid",
    name: "montera",
    grid: m.grid,
    layer: "body",
    paint: (_p, v) => {
      const sl = m.slots[v] as number;
      return [sl, sl, 1];
    },
    skin: () => [[b("head"), 1]],
  });

  // ---------------------------------------------------------------- tupu: the silver pin of the lliclla
  const tupuHead = lathe(
    [
      [0, 0.004],
      [0.022, 0.004],
      [0.03, 0.0],
      [0.022, -0.004],
      [0, -0.004],
    ],
    16,
  );
  const tupuPos: Vec3 = [0, 1.06 * K, 0.125 * K];
  const tp = tupuHead.positions;
  for (let i = 0; i < tp.length; i += 3) {
    // Lathe axis (y) → facing forward (z), placed on the chest.
    const x = tp[i] as number;
    const y = tp[i + 1] as number;
    const z = tp[i + 2] as number;
    tp[i] = x + tupuPos[0];
    tp[i + 1] = -z + tupuPos[1];
    tp[i + 2] = y + tupuPos[2];
    const nx = tupuHead.normals[i] as number;
    const ny = tupuHead.normals[i + 1] as number;
    const nz = tupuHead.normals[i + 2] as number;
    tupuHead.normals[i] = nx;
    tupuHead.normals[i + 1] = -nz;
    tupuHead.normals[i + 2] = ny;
  }
  const needle = tube(
    [
      [tupuPos[0] - 0.035, tupuPos[1] + 0.035, tupuPos[2] - 0.004],
      [tupuPos[0] + 0.05, tupuPos[1] - 0.05, tupuPos[2] - 0.004],
    ],
    () => 0.0045,
    5,
  );
  pieces.push(rigid("tupu", joinGrids([tupuHead, needle]), b("chest"), SL.silver));

  // ---------------------------------------------------------------- ojotas: sole + straps
  for (const [s, sx] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const fx = 0.1 * 1.12 * K * sx;
    const foot = b(`foot${s}`);
    pieces.push({
      kind: "field",
      name: `ojota${s}`,
      prims: [
        {
          shape: { kind: "box", c: [fx, 0.008, 0.036 * K], h: [0.05, 0.008, 0.112], round: 0.007 },
          bone: foot,
          blend: 0,
          slot: SL.sole,
        },
      ],
      h: 0.012,
      rigid: foot,
    });
    const strap = (a: Vec3, c: Vec3, e: Vec3) =>
      tube(
        bezier(a, c, e, 9).map((p) => hugOne(field, p, 0.007)),
        () => 0.008,
        5,
        { flat: 0.45 },
      );
    pieces.push(
      rigid(
        `straps${s}`,
        joinGrids([
          strap([fx - 0.045, 0.014, 0.03], [fx, 0.1, 0.045], [fx + 0.045, 0.014, 0.03]),
          strap([fx, 0.03, 0.115], [fx, 0.07, 0.06], [fx, 0.09, 0.0]),
        ]),
        foot,
        SL.sole,
      ),
    );
  }

  // ---------------------------------------------------------------- pollera (two tiers) and lliclla: cloth
  pieces.push(pollera(field, b, "pollera-under", 0.27 * K, 0.014, 0.43, 16, SL.under));
  pieces.push(pollera(field, b, "pollera", 0.44 * K, 0.028, 0.46, 16, SL.pollera));
  pieces.push(lliclla(field, b));
  return pieces;
}

function rigid(name: string, g: Grid, bone: number, slot: number): GridPiece {
  return { kind: "grid", name, grid: g, layer: "body", skin: () => [[bone, 1]], paint: slot };
}

function hugOne(f: Field, p: Vec3, off: number): Vec3 {
  return hugPath(f, p, 1, 0, () => [0, 1, 0], off)[0] as Vec3;
}

/**
 * The Cusco montera as rings: a low dark crown with a woven band, a wide flat brim with an ochre trim, and the
 * red lining underneath; sits a little forward on the head.
 */
function montera(): { grid: Grid; slots: Uint8Array } {
  // (radius, y, slot), walked clockwise (top outward, rim down, underside inward). A colour change repeats the
  // point with the next slot so the boundary is exact.
  const prof: Array<[number, number, number]> = [
    [0, 0.072, SL.felt],
    [0.1, 0.072, SL.felt],
    [0.128, 0.066, SL.felt],
    [0.138, 0.052, SL.felt],
    [0.138, 0.052, SL.red],
    [0.141, 0.034, SL.red],
    [0.141, 0.034, SL.ochre],
    [0.142, 0.024, SL.ochre],
    [0.142, 0.024, SL.felt],
    [0.16, 0.016, SL.felt],
    [0.24, 0.011, SL.felt],
    [0.29, 0.006, SL.felt],
    [0.29, 0.006, SL.ochre],
    [0.308, -0.002, SL.ochre],
    [0.304, -0.014, SL.ochre],
    [0.29, -0.014, SL.ochre],
    [0.29, -0.014, SL.lining],
    [0.2, -0.011, SL.lining],
    [0.13, -0.008, SL.lining],
    [0, -0.008, SL.lining],
  ];
  const g = lathe(
    prof.map(([r, y]) => [r, y] as const),
    44,
  );
  // Tilt forward a touch and seat on the head.
  const tilt = 0.14;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const y0 = 1.62 * K;
  for (let i = 0; i < g.positions.length; i += 3) {
    const y = g.positions[i + 1] as number;
    const z = g.positions[i + 2] as number;
    g.positions[i + 1] = y * c - z * s + y0;
    g.positions[i + 2] = y * s + z * c + 0.008;
    const ny = g.normals[i + 1] as number;
    const nz = g.normals[i + 2] as number;
    g.normals[i + 1] = ny * c - nz * s;
    g.normals[i + 2] = ny * s + nz * c;
  }
  const slots = new Uint8Array(g.positions.length / 3);
  const cols = g.cols;
  prof.forEach((p, r) => {
    for (let k = 0; k < cols; k++) slots[r * cols + k] = p[2];
  });
  return { grid: g, slots };
}

/**
 * One tier of the pollera: a bell from the waist, wrapped over the hips and flaring with pleats toward the hem.
 * Skinned to the hips, toward the hem to the thighs on its side (a step pushes its side of the skirt) and to
 * the "skirt" spring bone (swish); the wind moves the hem.
 */
function pollera(
  field: Field,
  b: (n: string) => number,
  name: string,
  hem: number,
  off: number,
  flare: number,
  pleats: number,
  base: number,
): GridPiece {
  const rows = 18;
  const cols = 72;
  const top = 0.875 * K;
  const pleat = (s: number, a: number) => (0.012 + 0.024 * s ** 1.3) * Math.sin(a * pleats) * smoothstep(0.05, 0.4, s);
  const d = drape(field, {
    rows,
    cols,
    y: (s) => top + (hem - top) * s,
    r0: (s) => 0.13 + s * 0.05,
    off,
    flare,
    ripple: pleat,
  });
  const hips = b("hips");
  const skirt = b("skirt");
  const tL = b("thighL");
  const tR = b("thighR");
  const rowOf = (v: number) => Math.floor(v / (cols + 1)) / (rows - 1);
  const ang = (v: number) => ((v % (cols + 1)) / cols) * Math.PI * 2;
  return {
    kind: "grid",
    name,
    grid: d.grid,
    layer: "cloth",
    paint: base,
    cloth: [SL.red, SL.ochre, SL.turq, SL.white],
    uvRect: REGION.pollera,
    skin: (_p, v) => {
      const s = rowOf(v);
      const a = ang(v);
      const side = Math.sin(a);
      const front = Math.cos(a);
      const k = smoothstep(0.1, 1, s);
      // Front of the skirt follows the forward leg more than the back does.
      const legK = 0.32 * k * (0.6 + 0.4 * Math.max(0, front));
      return [
        [hips, 1],
        [tL, legK * smoothstep(-0.35, 0.6, side)],
        [tR, legK * smoothstep(-0.35, 0.6, -side)],
        [skirt, 0.9 * k],
      ];
    },
    flex: (_p, v) => smoothstep(0.15, 1, rowOf(v)),
    // Painted folds: pleat valleys darker, a soft shade under the hips.
    shade: (_p, v) => {
      const s = rowOf(v);
      const f = Math.sin(ang(v) * pleats);
      return (1 - 0.16 * smoothstep(0.1, 0.6, s) * (0.5 - 0.5 * f)) * (1 - 0.08 * (1 - s));
    },
  };
}

/**
 * The lliclla: a woven shawl over the shoulders and back, its two front edges meeting at the tupu on the chest;
 * shorter in front, falling to the waist behind. An open strip of columns (front gap) on the arc drape.
 */
function lliclla(field: Field, b: (n: string) => number): GridPiece {
  const rows = 20;
  const cols = 48;
  const gap = 0.32;
  const hemY = (a: number) => {
    // Distance from the front (0 at the front edges, 1 at the back centre).
    const back = Math.min(1, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.PI);
    return (1.06 - 0.24 * smoothstep(0.1, 1, back)) * K;
  };
  const d = drapeArc(field, {
    rows,
    cols,
    span: [gap, Math.PI * 2 - gap],
    start: (a) => [Math.sin(a) * 0.075, 1.205 * K, Math.cos(a) * 0.07],
    dir0: (a) => [Math.sin(a), -0.45, Math.cos(a)],
    off: 0.03,
    ds: 0.012,
    gravity: 0.16,
    flare: 0.006,
    stop: (a, p) => p[1] <= hemY(a),
    ripple: (s, a) => s * s * 0.008 * Math.sin(a * 9),
  });
  const chest = b("chest");
  const spine = b("spine");
  const armL = b("armL");
  const armR = b("armR");
  const rowOf = (v: number) => Math.floor(v / cols) / (rows - 1);
  return {
    kind: "grid",
    name: "lliclla",
    grid: d.grid,
    layer: "cloth",
    paint: SL.lliclla,
    cloth: [SL.orange, SL.turq, SL.white, SL.ochre],
    uvRect: REGION.lliclla,
    skin: (p, v) => {
      const s = rowOf(v);
      const overArm = smoothstep(0.15, 0.24, Math.abs(p[0])) * smoothstep(0.05, 0.4, s);
      return [
        [chest, 1],
        [spine, 0.5 * smoothstep(0.4, 1, s)],
        [armL, 0.5 * overArm * (p[0] > 0 ? 1 : 0)],
        [armR, 0.5 * overArm * (p[0] < 0 ? 1 : 0)],
      ];
    },
    flex: (_p, v) => smoothstep(0.2, 1, rowOf(v)) * 0.7,
    shade: (_p, v) => 1 - 0.1 * rowOf(v),
  };
}
