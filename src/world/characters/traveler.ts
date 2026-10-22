/**
 * The traveler (the player avatar), "andean" outfit, in the new one-surface construction: chullo with ear flaps,
 * tassels and a pompom over clumped anime locks, a poncho with khipu-dye bands over a sweater, long trousers,
 * hiking boots with cotton sock cuffs, and the backpack with a laptop edge and a bedroll.
 *
 * Pieces (./build.ts): the body field; the chullo field (rigid on the head); the woolly pompom (on a spring
 * bone); two cords with yarn ends (two-bone spring chains); hair locks (tubes hugging the head); the collar
 * ring; the backpack, bedroll and laptop (on a spring "pack" bone); and the poncho (cloth layer, on the wind,
 * hem on a spring bone). Colours are palette slots (TRAVELER_PALETTE), so the outfit can be recoloured.
 *
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type GridPiece, type Pick, type Piece, skeleton } from "./build";
import { drapeArc, type Field, hugPath, makeField, toOffset } from "./drape";
import { humanBody, humanSkeletonRows } from "./human";
import { bezier, type Grid, grid, joinGrids, lathe, profile, smoothstep, tube } from "./loft";
import { REGION } from "./regions";
import { mirrorX, type Prim, prepare, rotX, rotZ, type Vec3 } from "./sdf";

/** Slot → colour (sRGB hex). Index order is the slot number. */
export const TRAVELER_PALETTE = [
  "#b9764a", // 0 skin
  "#7a2f35", // 1 sweater
  "#2f3557", // 2 trousers
  "#4a2e1c", // 3 boots
  "#efe6d6", // 4 cotton (sock cuff, chullo band)
  "#2a2420", // 5 sole
  "#2b1d15", // 6 hair
  "#c4383f", // 7 cochineal red (chullo, poncho bands)
  "#efe6d6", // 8 cotton
  "#3446a6", // 9 indigo
  "#dda63c", // 10 ochre
  "#2a9d8f", // 11 turquoise
  "#6b4a2b", // 12 pack leather
  "#3d4046", // 13 laptop
  "#9fd7d0", // 14 laptop screen edge
  "#e9dcc4", // 15 poncho field (undyed alpaca)
];

const SL = {
  skin: 0,
  top: 1,
  legs: 2,
  boot: 3,
  cuff: 4,
  sole: 5,
  hair: 6,
  red: 7,
  cotton: 8,
  indigo: 9,
  ochre: 10,
  turq: 11,
  pack: 12,
  laptop: 13,
  screen: 14,
  poncho: 15,
} as const;

const OPTS = { scale: 1, shoulders: 1, hips: 1, chest: 1, feet: "boots" as const };

export function travelerBones(): BoneDef[] {
  return skeleton([
    ...humanSkeletonRows(OPTS),
    ["tip", "head", [0, 1.62, -0.075]],
    ["pompom", "tip", [0, 1.785, -0.163]],
    ["tasselL0", "head", [0.226, 1.26, 0.005]],
    ["tasselL1", "tasselL0", [0.228, 1.19, 0.005]],
    ["tasselR0", "head", [-0.226, 1.26, 0.005]],
    ["tasselR1", "tasselR0", [-0.228, 1.19, 0.005]],
    ["poncho", "chest", [0, 1.16, 0]],
    ["pack", "chest", [0, 1.12, -0.17]],
  ]);
}

export function travelerPieces(bones: BoneDef[]): Piece[] {
  const b = (n: string) => boneIndex(bones, n);
  const body = humanBody(OPTS, bones, {
    skin: SL.skin,
    top: SL.top,
    legs: SL.legs,
    boot: SL.boot,
    cuff: SL.cuff,
    sole: SL.sole,
    sleeveCuff: SL.top,
  });
  const field = makeField(prepare(body.prims));
  const headOnly = makeField(prepare(body.headPrims.map((i) => body.prims[i] as Prim)));
  const hc = body.head.c;

  const pieces: Piece[] = [
    {
      kind: "field",
      name: "body",
      prims: body.prims,
      h: 0.02,
      bands: body.bands,
      faces: [body.face],
      relax: 2,
    },
  ];

  // ---------------------------------------------------------------- chullo
  // A knitted cap shrink-wrapped over the cranium around an axis tilted back (the brim sits high over the
  // brows and low at the nape), rising to a soft point that leans back, with a rolled cuff and knitted bands
  // (rows are exact rings, so every stripe is crisp). Its upper part follows the "tip" spring bone.
  const cap = chulloCap(headOnly);
  pieces.push({
    kind: "grid",
    name: "chullo",
    grid: cap.grid,
    layer: "body",
    paint: (_p, v) => {
      const sl = cap.slots[v] as number;
      return [sl, sl, 1];
    },
    skin: (p) => {
      const t = smoothstep(1.6, 1.74, p[1]);
      return [
        [b("head"), 1 - t],
        [b("tip"), t],
      ];
    },
  });
  // Ear flaps: knitted tabs hanging from the cuff over the ears, an indigo border at the bottom.
  const flapL: Prim = {
    shape: { kind: "box", c: [0.222, 1.35, -0.005], h: [0.022, 0.085, 0.068], round: 0.021, rot: rotZ(0.1) },
    bone: b("head"),
    blend: 0,
    slot: SL.red,
  };
  pieces.push({
    kind: "field",
    name: "flaps",
    prims: [flapL, mirrorX(flapL, b("head"))],
    h: 0.018,
    rigid: b("head"),
    bands: [{ prims: [0, 1], at: (p) => p[1], stops: [1.292, 1.31], slots: [SL.indigo, SL.cotton, SL.red] }],
  });

  // ---------------------------------------------------------------- pompom (wool ball on a spring)
  pieces.push({
    kind: "field",
    name: "pompom",
    prims: [
      {
        shape: { kind: "ellipsoid", c: [0, 1.807, -0.168], r: [0.042, 0.04, 0.042] },
        bone: b("pompom"),
        blend: 0,
        slot: SL.ochre,
        wool: 0.014,
        woolFreq: 60,
      },
    ],
    h: 0.012,
    rigid: b("pompom"),
  });

  // ---------------------------------------------------------------- tassels: braided cords with yarn ends
  for (const [s, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const x = 0.226 * side;
    const path = bezier([x, 1.27, 0.005], [x * 1.02, 1.2, 0.0], [x * 1.02, 1.12, -0.005], 10);
    const r = profile([
      [0, 0.009],
      [0.62, 0.008],
      [0.7, 0.024],
      [0.86, 0.026],
      [1, 0.0],
    ]);
    const g = tube(path, r, 8);
    const b0 = b(`tassel${s}0`);
    const b1 = b(`tassel${s}1`);
    pieces.push(
      gridPiece(
        `tassel${s}`,
        g,
        (p) => {
          const t = smoothstep(1.24, 1.17, p[1]);
          return [
            [b0, 1 - t],
            [b1, t],
          ];
        },
        (p: Vec3) => (p[1] < 1.172 ? SL.red : SL.indigo),
      ),
    );
  }

  // ---------------------------------------------------------------- hair: clumped locks under the chullo
  pieces.push(gridPiece("hair", hairLocks(headOnly, hc), () => [[b("head"), 1]], SL.hair));

  // ---------------------------------------------------------------- collar ring at the poncho's neck opening
  const collarRing: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    // A small circle in the (radius, y) plane, walked clockwise (outward on top first) for outward normals.
    const t = Math.PI / 2 - (i / 10) * Math.PI * 2;
    collarRing.push([0.087 + Math.cos(t) * 0.016, 1.222 + Math.sin(t) * 0.014]);
  }
  const collar = lathe(collarRing, 24, 0.94);
  pieces.push(gridPiece("collar", collar, () => [[b("chest"), 1]], SL.indigo));

  // ---------------------------------------------------------------- backpack (on a spring bone)
  const packBone = b("pack");
  pieces.push({
    kind: "field",
    name: "pack",
    prims: [
      {
        shape: { kind: "box", c: [0, 1.0, -0.275], h: [0.15, 0.165, 0.07], round: 0.055, rot: rotX(0.06) },
        bone: packBone,
        blend: 0,
        slot: SL.pack,
      },
      {
        shape: { kind: "box", c: [0, 0.93, -0.345], h: [0.095, 0.06, 0.03], round: 0.025 },
        bone: packBone,
        blend: 0.015,
        slot: SL.pack,
      },
    ],
    h: 0.022,
    rigid: packBone,
    bands: [{ prims: [0], at: (p) => p[1] - p[2] * 0.06, stops: [1.075], slots: [SL.pack, SL.ochre] }],
  });
  pieces.push({
    kind: "field",
    name: "bedroll",
    prims: [
      {
        shape: { kind: "cone", a: [-0.17, 0.82, -0.27], b: [0.17, 0.82, -0.27], ra: 0.058, rb: 0.058 },
        bone: packBone,
        blend: 0,
        slot: SL.turq,
      },
    ],
    h: 0.022,
    rigid: packBone,
    bands: [{ prims: [0], at: (p) => Math.abs(p[0]), stops: [0.1, 0.12], slots: [SL.turq, SL.cotton, SL.turq] }],
  });
  pieces.push({
    kind: "field",
    name: "laptop",
    prims: [
      {
        shape: { kind: "box", c: [0.01, 1.16, -0.26], h: [0.125, 0.06, 0.016], round: 0.012, rot: rotZ(-0.06) },
        bone: packBone,
        blend: 0,
        slot: SL.laptop,
      },
    ],
    h: 0.013,
    rigid: packBone,
    bands: [{ prims: [0], at: (p) => p[1] + p[0] * 0.06, stops: [1.205], slots: [SL.laptop, SL.screen] }],
  });

  // ---------------------------------------------------------------- poncho (cloth layer)
  pieces.push(poncho(field, b));
  return pieces;
}

function gridPiece(
  name: string,
  grid: Grid,
  skin: (p: Vec3) => Pick,
  paint: number | ((p: Vec3) => number),
): GridPiece {
  const pt: GridPiece["paint"] =
    typeof paint === "number"
      ? paint
      : (p: Vec3) => {
          const s = paint(p);
          return [s, s, 1];
        };
  return { kind: "grid", name, grid, layer: "body", skin: (p) => skin(p), paint: pt };
}

/**
 * Anime-style clumped locks: bangs from under the chullo's brim over the forehead, side locks in front of the
 * ear flaps, and a fringe at the nape. Each lock is a flattened tube that hugs the head and tapers to a point,
 * curling slightly at the tip.
 */
function hairLocks(head: Field, hc: Vec3) {
  const locks: Grid[] = [];
  const lock = (ax: number, ay: number, len: number, w: number, curl: number, drift: number) => {
    // Start on the head surface in direction (yaw ax, pitch ay) from the head centre.
    const dir: Vec3 = [Math.sin(ax) * Math.cos(ay), Math.sin(ay), Math.cos(ax) * Math.cos(ay)];
    const start = toOffset(head, [hc[0] + dir[0] * 0.3, hc[1] + dir[1] * 0.3, hc[2] + dir[2] * 0.3], 0.008);
    const n = 9;
    const path = hugPath(
      head,
      start,
      n,
      len / (n - 1),
      (i) => {
        const t = i / (n - 1);
        // Down, drifting sideways, curling outward at the tip.
        return [Math.sin(ax) * (0.25 + curl * t) + drift * t, -1, Math.cos(ax) * (0.18 + curl * t * 0.8)];
      },
      0.009,
    );
    const r = profile([
      [0, w * 0.7],
      [0.3, w],
      [0.75, w * 0.6],
      [1, 0],
    ]);
    // Flattened against the head: the frame's normal is the outward head direction.
    locks.push(tube(path, r, 7, { flat: 0.42, up: dir }));
  };
  // Bangs: a few broad clumps swept a little to the traveler's right, of uneven length (anime fringe).
  const bangs: Array<[number, number, number, number]> = [
    [-0.7, 0.075, 0.03, 0.04],
    [-0.42, 0.11, 0.025, 0.05],
    [-0.12, 0.1, -0.035, 0.052],
    [0.16, 0.12, -0.04, 0.05],
    [0.46, 0.09, -0.03, 0.046],
    [0.72, 0.07, -0.02, 0.04],
  ];
  for (const [ax, len, drift, w] of bangs) lock(ax, 0.5, len, w, 0.2, drift);
  // Side locks in front of the ear flaps.
  for (const s of [-1, 1]) {
    lock(s * 1.12, 0.22, 0.12, 0.03, 0.15, s * 0.05);
    lock(s * 1.32, 0.18, 0.1, 0.028, 0.2, s * 0.02);
  }
  // Nape fringe under the back of the chullo.
  for (let i = -3; i <= 3; i++) lock(Math.PI + i * 0.26, -0.18, 0.07 + (3 - Math.abs(i)) * 0.006, 0.03, 0.3, 0);
  return joinGrids(locks);
}

/**
 * The poncho: a square of wool over the shoulders, hanging over the arms (shorter at the sides, so the hands
 * show) and to mid-thigh front and back, with soft folds toward the hem. Skinned to the chest, a little to the
 * upper arms at the sides, and toward the hem to the "poncho" spring bone; the wind moves the free hem.
 */
function poncho(field: Field, b: (n: string) => number): GridPiece {
  const rows = 26;
  const cols = 64;
  // Hem: lower front and back (a rectangle worn lengthwise), shorter over the arms so the hands show.
  const hemY = (a: number) => 0.76 - 0.1 * Math.abs(Math.cos(a)) ** 1.4;
  const fold = (s: number, a: number) => {
    const k = s * s;
    return k * (0.016 * Math.sin(a * 7 + 0.6) + 0.009 * Math.sin(a * 13 + 2.1));
  };
  const d = drapeArc(field, {
    rows,
    cols,
    // Leave the neck opening slightly downward and out; the shoulders lift it, then it falls.
    start: (a) => [Math.sin(a) * 0.085, 1.222, Math.cos(a) * 0.08],
    dir0: (a) => [Math.sin(a), -0.35, Math.cos(a)],
    off: 0.022,
    ds: 0.012,
    gravity: 0.15,
    flare: 0.012,
    stop: (a, p) => p[1] <= hemY(a),
    ripple: fold,
  });
  const chest = b("chest");
  const armL = b("armL");
  const armR = b("armR");
  const pb = b("poncho");
  const rowOf = (v: number) => Math.floor(v / (cols + 1)) / (rows - 1);
  const ang = (v: number) => d.angle(v % (cols + 1));
  return {
    kind: "grid",
    name: "poncho",
    grid: d.grid,
    layer: "cloth",
    paint: SL.poncho,
    cloth: [SL.red, SL.ochre, SL.indigo, SL.turq],
    uvRect: REGION.poncho,
    skin: (p, v) => {
      const s = rowOf(v);
      const side = Math.sin(ang(v));
      const hang = smoothstep(0.25, 1, s);
      // Over the arms the cloth follows the upper arm a little (an arm swinging forward lifts its side).
      const overArm = smoothstep(0.17, 0.26, Math.abs(p[0])) * smoothstep(0.1, 0.45, s);
      return [
        [chest, 1],
        [armL, 0.55 * overArm * (side > 0 ? 1 : 0)],
        [armR, 0.55 * overArm * (side < 0 ? 1 : 0)],
        [pb, 1.5 * hang],
      ];
    },
    flex: (_p, v) => smoothstep(0.12, 1, rowOf(v)) ** 1.2,
    // Folds painted: valleys of the ripple a shade darker toward the hem.
    shade: (_p, v) => {
      const s = rowOf(v);
      const a = ang(v);
      const f = fold(s, a) / Math.max(1e-4, s * s * 0.025);
      return 1 - 0.14 * s * s * (0.5 - 0.5 * f);
    },
  };
}

/**
 * The chullo's cap as exact knitted rings: rows climb an axis tilted back from the brim plane (y = 1.44 + 0.3 z),
 * each ring shrink-wrapped over the head at a small clearance and never narrower than a cone that closes to a
 * point leaning back. Row colours switch on duplicated rows, so the stripes are clean; one band is a two-row
 * checker (a knitted pattern read through flat per-triangle colours).
 */
function chulloCap(head: Field): { grid: Grid; slots: Uint8Array } {
  const A = Math.atan(0.3);
  const n: Vec3 = [0, Math.cos(A), -Math.sin(A)];
  const e2: Vec3 = [0, Math.sin(A), Math.cos(A)];
  const O: Vec3 = [0, 1.44, 0];
  const H = 0.36;
  const cols = 40;
  // Rows as (u along the axis, slot, inset) — a boundary repeats u with the next colour.
  type Row = { u: number; slot: number; inset: number; checker?: 0 | 1 };
  const rows: Row[] = [{ u: 0, slot: SL.indigo, inset: 0.02 }];
  const band = (u0: number, u1: number, slot: number, n: number, bulge = 0, checker?: 0 | 1) => {
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      rows.push({
        u,
        slot,
        inset: -bulge * Math.sin((Math.PI * i) / n),
        ...(checker !== undefined ? { checker } : {}),
      });
    }
  };
  band(0, 0.1, SL.indigo, 3, 0.01); // rolled cuff
  band(0.1, 0.135, SL.cotton, 1);
  band(0.135, 0.17, SL.ochre, 1, 0, 0);
  band(0.17, 0.205, SL.ochre, 1, 0, 1);
  band(0.205, 0.24, SL.cotton, 1);
  band(0.24, 0.5, SL.red, 4);
  band(0.5, 0.53, SL.ochre, 1);
  band(0.53, 1, SL.red, 7);
  const smax = (a: number, b: number, k: number) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  };
  const pts: Vec3[][] = [];
  for (const row of rows) {
    const u = row.u;
    const c: Vec3 = [O[0] + n[0] * H * u, O[1] + n[1] * H * u, O[2] + n[2] * H * u - 0.06 * u * u];
    const cone = 0.012 + 0.2 * Math.max(0, 1 - u) ** 1.25;
    const ring: Vec3[] = [];
    for (let k = 0; k < cols; k++) {
      const t = (k / cols) * Math.PI * 2;
      const d: Vec3 = [Math.sin(t), e2[1] * Math.cos(t), e2[2] * Math.cos(t)];
      let r = 0.02;
      for (let i = 0; i < 60 && head(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r) < 0.024; i++) r += 0.006;
      const wrap = r > 0.021 ? r : 0;
      const rad = (u >= 1 ? 0 : smax(wrap, cone, 0.05)) - row.inset;
      ring.push([c[0] + d[0] * rad, c[1] + d[1] * rad, c[2] + d[2] * rad]);
    }
    pts.push(ring);
  }
  // Rows climb (bottom → tip), so the unflipped winding faces out.
  const g = grid(rows.length, cols, (r, c) => (pts[r] as Vec3[])[c] as Vec3, { closed: true });
  const slots = new Uint8Array(rows.length * (cols + 1));
  rows.forEach((row, r) => {
    for (let c = 0; c <= cols; c++) {
      const odd = (c + (row.checker ?? 0)) % 2 === 1;
      slots[r * (cols + 1) + c] = row.checker !== undefined && odd ? SL.red : row.slot;
    }
  });
  return { grid: g, slots };
}
