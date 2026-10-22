/**
 * Hats for the human archetypes, all measured from the head (children's larger heads get larger hats):
 *
 *   chullo        knitted cap shrink-wrapped over the cranium, rolled cuff, knitted bands, a point leaning back
 *                 on a spring ("tip"), ear flaps, braided tassels on springs and a woolly pompom;
 *   montera       the flat, wide Cusco hat: dark crown band, woven trim, red lining; `festive` adds a fringe of
 *                 beads and ribbons round the brim (Inti Raymi);
 *   brim hats     one lathe profile with parameters: the highland felt sombrero, the jungle explorer's felt, the
 *                 coast's woven straw, the lake's felt with a band, a canvas sun hat, the Aymara bombín (bowler),
 *                 and the Colca hats: Cabanaconde's wide white brim embroidered with flowers, Collagua's tall white
 *                 crown with a lace band;
 *   cap           a peaked cap (crown, visor, button), optionally with a cloth neck flap on the wind (trek);
 *   feather crown a woven band with standing macaw feathers (Amazonian festivities);
 *   headband      a plain woven band.
 * Colours: `hat` (main), `hatBand`, `hatTrim`, plus `white`, `tie` and the bead / feather slots for details.
 *
 * Pure (no DOM, no Three).
 */
import type { GridPiece, Piece } from "../build";
import { type Field, toOffset } from "../drape";
import { bezier, type Grid, grid, joinGrids, lathe, profile, smoothstep, tube } from "../loft";
import { mirrorX, type Prim, rotX, rotZ, type Vec3 } from "../sdf";
import { HS } from "../slots";
import { type BoneRows, LOD_H, res, rigidGrid, tiltGrid, type WearCtx, type Worn } from "./ctx";

export type HatKind =
  | "chullo"
  | "montera"
  | "montera-fiesta"
  | "felt"
  | "explorer"
  | "straw"
  | "altiplano"
  | "sunhat"
  | "bowler"
  | "cabana"
  | "collagua"
  | "cap"
  | "trek-cap"
  | "feather-crown"
  | "headband";

/** Head scale: head radius over the traveler's (0.222). */
const headS = (ctx: WearCtx) => ctx.hr[0] / 0.222;

/** Extra bones a hat needs (springs on the chullo). */
export function hatBones(kind: HatKind, hc: Vec3, s: number): BoneRows {
  if (kind !== "chullo") return [];
  const P = (x: number, y: number, z: number): Vec3 => [hc[0] + x * s, hc[1] + y * s, hc[2] + z * s];
  return [
    ["tip", "head", P(0, 0.19, -0.075)],
    ["pompom", "tip", P(0, 0.355, -0.163)],
    ["tasselL0", "head", P(0.226, -0.17, 0.005)],
    ["tasselL1", "tasselL0", P(0.228, -0.24, 0.005)],
    ["tasselR0", "head", P(-0.226, -0.17, 0.005)],
    ["tasselR1", "tasselR0", P(-0.228, -0.24, 0.005)],
  ];
}

export function hat(ctx: WearCtx, kind: HatKind): Worn {
  switch (kind) {
    case "chullo":
      return chullo(ctx);
    case "montera":
      return { pieces: montera(ctx, false) };
    case "montera-fiesta":
      return { pieces: montera(ctx, true) };
    case "cap":
      return { pieces: cap(ctx, false) };
    case "trek-cap":
      return { pieces: cap(ctx, true) };
    case "feather-crown":
      return { pieces: featherCrown(ctx) };
    case "headband":
      return { pieces: [band(ctx)] };
    default:
      return { pieces: [brimHat(ctx, BRIMS[kind])] };
  }
}

// ---------------------------------------------------------------- chullo

function chullo(ctx: WearCtx): Worn {
  const s = headS(ctx);
  const hc = ctx.hc;
  const b = ctx.b;
  const pieces: Piece[] = [];
  const cap = chulloCap(ctx.head, hc, s, ctx);
  const y0 = hc[1] + 0.17 * s;
  const y1 = hc[1] + 0.31 * s;
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
      const t = smoothstep(y0, y1, p[1]);
      return [
        [b("head"), 1 - t],
        [b("tip"), t],
      ];
    },
  });
  // Ear flaps: knitted tabs hanging from the cuff over the ears, a hatTrim border at the bottom.
  const flapL: Prim = {
    shape: {
      kind: "box",
      c: [hc[0] + 0.222 * s, hc[1] - 0.08 * s, hc[2] - 0.005 * s],
      h: [0.022 * s, 0.085 * s, 0.068 * s],
      round: 0.021 * s,
      rot: rotZ(0.1),
    },
    bone: b("head"),
    blend: 0,
    slot: HS.hat,
  };
  const fy = hc[1] - 0.138 * s;
  pieces.push({
    kind: "field",
    name: "flaps",
    prims: [flapL, mirrorX(flapL, b("head"))],
    h: 0.018 * LOD_H[ctx.lod]!,
    rigid: b("head"),
    bands: [{ prims: [0, 1], at: (p) => p[1], stops: [fy, fy + 0.018 * s], slots: [HS.hatTrim, HS.white, HS.hat] }],
  });
  // Pompom: a wool ball on a spring.
  pieces.push({
    kind: "field",
    name: "pompom",
    prims: [
      {
        shape: {
          kind: "ellipsoid",
          c: [hc[0], hc[1] + 0.377 * s, hc[2] - 0.168 * s],
          r: [0.042 * s, 0.04 * s, 0.042 * s],
        },
        bone: b("pompom"),
        blend: 0,
        slot: HS.tie,
        ...(ctx.lod < 2 ? { wool: 0.014 * s, woolFreq: 60 / s } : {}),
      },
    ],
    h: 0.012 * LOD_H[ctx.lod]!,
    rigid: b("pompom"),
  });
  // Tassels: braided cords with yarn ends, two-bone spring chains.
  if (ctx.lod < 2)
    for (const [side, sx] of [
      ["L", 1],
      ["R", -1],
    ] as const) {
      const x = hc[0] + 0.226 * s * sx;
      const path = bezier(
        [x, hc[1] - 0.16 * s, hc[2] + 0.005 * s],
        [x * 1.02, hc[1] - 0.23 * s, hc[2]],
        [x * 1.02, hc[1] - 0.31 * s, hc[2] - 0.005 * s],
        10,
      );
      const r = profile([
        [0, 0.009 * s],
        [0.62, 0.008 * s],
        [0.7, 0.024 * s],
        [0.86, 0.026 * s],
        [1, 0.0],
      ]);
      const g = tube(path, r, ctx.lod ? 5 : 8);
      const b0 = b(`tassel${side}0`);
      const b1 = b(`tassel${side}1`);
      const ya = hc[1] - 0.19 * s;
      const yb = hc[1] - 0.26 * s;
      const cut = hc[1] - 0.258 * s;
      pieces.push({
        kind: "grid",
        name: `tassel${side}`,
        grid: g,
        layer: "body",
        paint: (p) => {
          const sl = p[1] < cut ? HS.hatTrim : HS.hat;
          return [sl, sl, 1];
        },
        skin: (p) => {
          const t = smoothstep(ya, yb, p[1]);
          return [
            [b0, 1 - t],
            [b1, t],
          ];
        },
      });
    }
  return { pieces };
}

/**
 * The chullo's cap as exact knitted rings: rows climb an axis tilted back from the brim plane, each ring
 * shrink-wrapped over the head at a small clearance and never narrower than a cone that closes to a point
 * leaning back. Row colours switch on duplicated rows, so the stripes are clean; one band is a two-row checker
 * (a knitted pattern read through flat per-triangle colours).
 */
function chulloCap(head: Field, hc: Vec3, s: number, ctx: WearCtx): { grid: Grid; slots: Uint8Array } {
  const A = Math.atan(0.3);
  const n: Vec3 = [0, Math.cos(A), -Math.sin(A)];
  const e2: Vec3 = [0, Math.sin(A), Math.cos(A)];
  const O: Vec3 = [hc[0], hc[1] + 0.01 * s, hc[2]];
  const H = 0.36 * s;
  const cols = res(ctx, 40, 14);
  type Row = { u: number; slot: number; inset: number; checker?: 0 | 1 };
  const rows: Row[] = [{ u: 0, slot: HS.hatTrim, inset: 0.02 * s }];
  const band = (u0: number, u1: number, slot: number, nn: number, bulge = 0, checker?: 0 | 1) => {
    const m = Math.max(1, Math.round(nn * Math.max(ctx.q, 0.5)));
    for (let i = 0; i <= m; i++) {
      const u = u0 + ((u1 - u0) * i) / m;
      rows.push({
        u,
        slot,
        inset: -bulge * s * Math.sin((Math.PI * i) / m),
        ...(checker !== undefined ? { checker } : {}),
      });
    }
  };
  band(0, 0.1, HS.hatTrim, 3, 0.01); // rolled cuff
  band(0.1, 0.135, HS.white, 1);
  if (ctx.lod < 2) {
    band(0.135, 0.17, HS.hatBand, 1, 0, 0);
    band(0.17, 0.205, HS.hatBand, 1, 0, 1);
  } else band(0.135, 0.205, HS.hatBand, 1);
  band(0.205, 0.24, HS.white, 1);
  band(0.24, 0.5, HS.hat, 4);
  band(0.5, 0.53, HS.hatBand, 1);
  band(0.53, 1, HS.hat, 7);
  const smax = (a: number, b: number, k: number) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  };
  const clear = 0.024 * s;
  const pts: Vec3[][] = [];
  for (const row of rows) {
    const u = row.u;
    const c: Vec3 = [O[0] + n[0] * H * u, O[1] + n[1] * H * u, O[2] + n[2] * H * u - 0.06 * s * u * u];
    const cone = 0.012 * s + 0.2 * s * Math.max(0, 1 - u) ** 1.25;
    const ring: Vec3[] = [];
    for (let kk = 0; kk < cols; kk++) {
      const t = (kk / cols) * Math.PI * 2;
      const d: Vec3 = [Math.sin(t), e2[1] * Math.cos(t), e2[2] * Math.cos(t)];
      let r = 0.02 * s;
      for (let i = 0; i < 60 && head(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r) < clear; i++) r += 0.006 * s;
      const wrap = r > 0.021 * s ? r : 0;
      const rad = (u >= 1 ? 0 : smax(wrap, cone, 0.05 * s)) - row.inset;
      ring.push([c[0] + d[0] * rad, c[1] + d[1] * rad, c[2] + d[2] * rad]);
    }
    pts.push(ring);
  }
  const g = grid(rows.length, cols, (r, c) => (pts[r] as Vec3[])[c] as Vec3, { closed: true });
  const slots = new Uint8Array(rows.length * (cols + 1));
  rows.forEach((row, r) => {
    for (let c = 0; c <= cols; c++) {
      const odd = (c + (row.checker ?? 0)) % 2 === 1;
      slots[r * (cols + 1) + c] = row.checker !== undefined && odd ? HS.hat : row.slot;
    }
  });
  return { grid: g, slots };
}

// ---------------------------------------------------------------- montera

/**
 * The Cusco montera as rings: a low dark crown with a woven band, a wide flat brim with a woven trim, and the
 * red lining underneath; sits a little forward on the head. Festive: a fringe of beads and ribbons hangs from
 * the brim all round.
 */
function montera(ctx: WearCtx, festive: boolean): Piece[] {
  const s = headS(ctx);
  // (radius, y, slot), walked clockwise (top outward, rim down, underside inward).
  const prof: Array<[number, number, number]> = [
    [0, 0.072, HS.hat],
    [0.1, 0.072, HS.hat],
    [0.128, 0.066, HS.hat],
    [0.138, 0.052, HS.hat],
    [0.138, 0.052, HS.hatBand],
    [0.141, 0.034, HS.hatBand],
    [0.141, 0.034, HS.hatTrim],
    [0.142, 0.024, HS.hatTrim],
    [0.142, 0.024, HS.hat],
    [0.16, 0.016, HS.hat],
    [0.24, 0.011, HS.hat],
    [0.29, 0.006, HS.hat],
    [0.29, 0.006, HS.hatTrim],
    [0.308, -0.002, HS.hatTrim],
    [0.304, -0.014, HS.hatTrim],
    [0.29, -0.014, HS.hatTrim],
    [0.29, -0.014, HS.hatBand],
    [0.2, -0.011, HS.hatBand],
    [0.13, -0.008, HS.hatBand],
    [0, -0.008, HS.hatBand],
  ];
  const g = lathe(
    prof.map(([r, y]) => [r * s, y * s] as const),
    res(ctx, 44, 16),
  );
  const y0 = ctx.hc[1] + 0.88 * ctx.hr[1];
  for (let i = 0; i < g.positions.length; i += 3) {
    g.positions[i] = (g.positions[i] as number) + ctx.hc[0];
    g.positions[i + 1] = (g.positions[i + 1] as number) + y0;
    g.positions[i + 2] = (g.positions[i + 2] as number) + ctx.hc[2] + 0.008 * s;
  }
  tiltGrid(g, 0.14, [0, y0, ctx.hc[2]]);
  const slots = new Uint8Array(g.positions.length / 3);
  prof.forEach((p, r) => {
    for (let k = 0; k < g.cols; k++) slots[r * g.cols + k] = p[2];
  });
  const head = ctx.b("head");
  const pieces: Piece[] = [
    {
      kind: "grid",
      name: festive ? "montera-fiesta" : "montera",
      grid: g,
      layer: "body",
      paint: (_p, v) => {
        const sl = slots[v] as number;
        return [sl, sl, 1];
      },
      skin: () => [[head, 1]],
    },
  ];
  if (festive && ctx.lod < 2) {
    // Fringe: short ribbons ending in a bead, round the brim (tilted with the hat).
    const n = res(ctx, 18, 10);
    const list: Grid[] = [];
    const colour: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // Under the brim edge, before the hat's tilt (applied to the joined fringe below).
      const top: Vec3 = [
        ctx.hc[0] + Math.sin(a) * 0.3 * s,
        y0 - 0.01 * s,
        ctx.hc[2] + 0.008 * s + Math.cos(a) * 0.3 * s,
      ];
      const bot: Vec3 = [top[0], top[1] - 0.09 * s, top[2]];
      const r = profile([
        [0, 0.006 * s],
        [0.7, 0.006 * s],
        [0.78, 0.017 * s],
        [0.95, 0.016 * s],
        [1, 0],
      ]);
      list.push(tube([top, bot], r, 5));
      colour.push([HS.bead1, HS.tie, HS.bead2, HS.white][i % 4] as number);
    }
    // One piece per colour (each a joined grid).
    for (const sl of new Set(colour)) {
      const gs = list.filter((_, i) => colour[i] === sl);
      pieces.push(rigidGrid(`fringe${sl}`, tiltGrid(joinGrids(gs), 0.14, [0, y0, ctx.hc[2]]), head, sl));
    }
  }
  return pieces;
}

// ---------------------------------------------------------------- brim hats

interface Brim {
  /** Brim radius, crown top radius, crown height (above the band base), dome on top, pinch (dent) on top. */
  brim: number;
  top: number;
  crown: number;
  dome: number;
  pinch: number;
  /** Band height above the brim base. */
  band: number;
  /** Brim rise at the edge (+ curls up, − droops). */
  curl: number;
  /** Where the band base sits on the head: fraction of the head's height above its centre. */
  seat: number;
  /** Forward tilt (radians, − tips the brim back). */
  tilt: number;
  /** Columns of a two-colour weave or embroidery on the brim top: 0 none. */
  weave?: number;
  /** Embroidered flowers round the brim top in these slots (Cabanaconde). */
  flowers?: number[];
  /** A lace band (white checker) on the crown (Collagua). */
  lace?: boolean;
}

const BRIMS: Record<
  Exclude<HatKind, "chullo" | "montera" | "montera-fiesta" | "cap" | "trek-cap" | "feather-crown" | "headband">,
  Brim
> = {
  felt: {
    brim: 0.31,
    top: 0.15,
    crown: 0.16,
    dome: 0.03,
    pinch: 0.012,
    band: 0.04,
    curl: 0.012,
    seat: 0.42,
    tilt: 0.05,
  },
  explorer: {
    brim: 0.37,
    top: 0.16,
    crown: 0.15,
    dome: 0.03,
    pinch: 0.02,
    band: 0.045,
    curl: 0.0,
    seat: 0.4,
    tilt: -0.12,
  },
  straw: {
    brim: 0.42,
    top: 0.16,
    crown: 0.12,
    dome: 0.04,
    pinch: 0.0,
    band: 0.035,
    curl: -0.01,
    seat: 0.4,
    tilt: -0.08,
    weave: 48,
  },
  altiplano: {
    brim: 0.28,
    top: 0.15,
    crown: 0.19,
    dome: 0.03,
    pinch: 0.015,
    band: 0.045,
    curl: 0.015,
    seat: 0.44,
    tilt: -0.06,
  },
  sunhat: { brim: 0.36, top: 0.15, crown: 0.13, dome: 0.03, pinch: 0.0, band: 0.035, curl: -0.04, seat: 0.4, tilt: 0 },
  bowler: { brim: 0.25, top: 0.12, crown: 0.13, dome: 0.1, pinch: 0.0, band: 0.035, curl: 0.03, seat: 0.5, tilt: 0 },
  cabana: {
    brim: 0.36,
    top: 0.15,
    crown: 0.075,
    dome: 0.0,
    pinch: 0.0,
    band: 0.03,
    curl: 0.0,
    seat: 0.5,
    tilt: 0.08,
    flowers: [HS.hatBand, HS.tie, HS.bead1],
  },
  collagua: {
    brim: 0.22,
    top: 0.17,
    crown: 0.21,
    dome: 0.01,
    pinch: 0.0,
    band: 0.07,
    curl: 0.01,
    seat: 0.48,
    tilt: 0.04,
    lace: true,
  },
};

/** A brimmed hat as one lathe (clockwise profile, so normals face out), slots per row and per column. */
function brimHat(ctx: WearCtx, o: Brim): GridPiece {
  const s = headS(ctx);
  const hc = ctx.hc;
  const hr = ctx.hr;
  const yb = hc[1] + o.seat * hr[1];
  // Head radius at the band base (+ clearance): the crown's base hugs the head.
  const t = (yb - hc[1]) / hr[1];
  const base = hr[0] * Math.sqrt(Math.max(0, 1 - t * t)) + 0.014 * s;
  const B = o.brim * s;
  const top = Math.max(o.top * s, base * 0.75);
  const C = o.crown * s;
  const rows: Array<[number, number, number]> = [];
  const ring = (r: number, y: number, slot: number) => rows.push([r, y, slot]);
  // Top: from the centre (with the pinch) out to the crown's top edge.
  ring(0, C + o.dome * s - o.pinch * s, HS.hat);
  ring(top * 0.55, C + o.dome * s * 0.75, HS.hat);
  ring(top * 0.9, C + o.dome * s * 0.25, HS.hat);
  ring(top, C, HS.hat);
  // Crown side down to the band; the band; the brim's top surface out to the edge.
  const bandY = o.band * s;
  const side = (y: number) => base + (top - base) * (y / C);
  ring(side(C * 0.6), C * 0.6, HS.hat);
  ring(side(bandY) + 0.002 * s, bandY, HS.hat);
  ring(side(bandY) + 0.004 * s, bandY, o.lace ? HS.white : HS.hatBand);
  if (o.lace) {
    ring(side(bandY * 0.55) + 0.004 * s, bandY * 0.55, HS.white);
    ring(side(bandY * 0.55) + 0.004 * s, bandY * 0.55, HS.hatBand);
  }
  ring(base + 0.004 * s, 0.004 * s, o.lace ? HS.hatBand : HS.hatBand);
  ring(base + 0.004 * s, 0.004 * s, HS.hat);
  ring(base + 0.01 * s, 0, HS.hat);
  const brimRows = 4;
  for (let i = 1; i <= brimRows; i++) {
    const f = i / brimRows;
    const r = base + (B - base) * f;
    ring(r, o.curl * s * f * f, o.flowers && f > 0.3 && f < 0.95 ? HS.hatTrim : HS.hat);
  }
  // Rim and underside back in (the underside closes inside the head, out of sight).
  ring(B + 0.006 * s, o.curl * s - 0.006 * s, HS.hatTrim);
  ring(B, o.curl * s - 0.014 * s, HS.hatTrim);
  ring(B * 0.98, o.curl * s - 0.014 * s, HS.hat);
  ring(base, -0.012 * s, HS.hat);
  ring(0, -0.012 * s, HS.hat);
  const cols = res(ctx, o.weave ?? 40, 16);
  const g = lathe(
    rows.map(([r, y]) => [r, y] as const),
    cols,
  );
  for (let i = 0; i < g.positions.length; i += 3) {
    g.positions[i] = (g.positions[i] as number) + hc[0];
    g.positions[i + 1] = (g.positions[i + 1] as number) + yb;
    g.positions[i + 2] = (g.positions[i + 2] as number) + hc[2];
  }
  tiltGrid(g, o.tilt, [0, yb, hc[2]]);
  const nc = g.cols;
  const slots = new Uint8Array(g.positions.length / 3);
  rows.forEach((row, r) => {
    for (let c = 0; c < nc; c++) {
      let sl = row[2];
      // Woven straw: a two-tone checker on the brim and crown (rows alternate with the columns).
      if (o.weave && sl === HS.hat && (r + c) % 2 === 1) sl = HS.hatTrim;
      // Embroidered flowers: on the brim's embroidered rows, groups of columns in turn.
      if (o.flowers && sl === HS.hatTrim && row[1] >= 0) {
        const k = Math.floor(c / 2) % (o.flowers.length + 1);
        sl = k < o.flowers.length ? (o.flowers[k] as number) : HS.hat;
      }
      if (o.lace && sl === HS.white && c % 2 === 1) sl = HS.hat;
      slots[r * nc + c] = sl;
    }
  });
  const head = ctx.b("head");
  return {
    kind: "grid",
    name: "hat",
    grid: g,
    layer: "body",
    paint: (_p, v) => {
      const sl = slots[v] as number;
      return [sl, sl, 1];
    },
    skin: () => [[head, 1]],
  };
}

// ---------------------------------------------------------------- caps, crowns, bands

function cap(ctx: WearCtx, flap: boolean): Piece[] {
  const s = headS(ctx);
  const hc = ctx.hc;
  const head = ctx.b("head");
  const pieces: Piece[] = [];
  // Crown: rings hugging the head from the rim line up to a soft dome (the head field at a clearance).
  const rows = res(ctx, 10, 5);
  const cols = res(ctx, 36, 14);
  const rimY = hc[1] + 0.3 * ctx.hr[1];
  const pts: Vec3[][] = [];
  for (let r = 0; r < rows; r++) {
    const f = r / (rows - 1);
    const ringPts: Vec3[] = [];
    for (let c = 0; c < cols; c++) {
      const a = (c / cols) * Math.PI * 2;
      // From the rim (pitched slightly up at the front) over the top.
      const el = (f * Math.PI) / 2;
      const dir: Vec3 = [Math.sin(a) * Math.cos(el), Math.sin(el) + 0.25 * (1 - f), Math.cos(a) * Math.cos(el)];
      const start: Vec3 = [hc[0] + dir[0] * 0.3 * s, rimY + (hc[1] + 0.25 * s - rimY) * f, hc[2] + dir[2] * 0.3 * s];
      // Clear of the hair shell (the head + ~0.02): the cap sits over the hair, not under it.
      const p =
        f < 1 ? toOffset(ctx.head, start, 0.032 * s) : toOffset(ctx.head, [hc[0], hc[1] + 0.4 * s, hc[2]], 0.036 * s);
      ringPts.push(p);
    }
    pts.push(ringPts);
  }
  const g = grid(rows, cols, (r, c) => (pts[r] as Vec3[])[c] as Vec3, { closed: true });
  pieces.push(rigidGrid("cap", g, head, HS.hat));
  // Button on top and the visor (a flattened, slightly drooping ellipsoid at the front of the rim).
  pieces.push({
    kind: "field",
    name: "visor",
    prims: [
      {
        shape: {
          kind: "ellipsoid",
          c: [hc[0], rimY + 0.01 * s, hc[2] + 0.23 * s],
          r: [0.135 * s, 0.012 * s, 0.11 * s],
          rot: rotX(0.22),
        },
        bone: head,
        blend: 0,
        slot: HS.hatBand,
      },
      {
        shape: { kind: "ellipsoid", c: [hc[0], hc[1] + 0.262 * s, hc[2]], r: [0.026 * s, 0.014 * s, 0.026 * s] },
        bone: head,
        blend: 0,
        slot: HS.hatBand,
      },
    ],
    h: 0.012 * LOD_H[ctx.lod]!,
    rigid: head,
  });
  if (flap) {
    // Neck flap (cubrenuca): cloth hanging from the back of the rim, on the wind.
    const fr = res(ctx, 6, 3);
    const fc = res(ctx, 16, 6);
    const a0 = Math.PI - 1.35;
    const a1 = Math.PI + 1.35;
    const grd = grid(
      fr,
      fc,
      (r, c) => {
        const f = r / (fr - 1);
        const a = a0 + ((a1 - a0) * c) / (fc - 1);
        const rad = (0.215 + 0.04 * f) * s;
        return [hc[0] + Math.sin(a) * rad, rimY + 0.02 * s - f * 0.17 * s, hc[2] + Math.cos(a) * rad];
      },
      { flip: true },
    );
    pieces.push({
      kind: "grid",
      name: "neckflap",
      grid: grd,
      layer: "cloth",
      paint: HS.hat,
      cloth: [HS.hat, HS.hat, HS.hat, HS.hat],
      skin: () => [[head, 1]],
      flex: (p) => smoothstep(rimY, rimY - 0.17 * s, p[1]) * 0.5,
    });
  }
  return pieces;
}

function featherCrown(ctx: WearCtx): Piece[] {
  const s = headS(ctx);
  const head = ctx.b("head");
  const pieces: Piece[] = [band(ctx, 0.04)];
  // Feathers standing round the front half, alternating dyes, leaning out a little.
  const prims: Prim[] = [];
  const n = ctx.lod < 2 ? 9 : 5;
  const y = ctx.hc[1] + 0.42 * ctx.hr[1];
  for (let i = 0; i < n; i++) {
    const a = -1.5 + (3 * i) / (n - 1);
    const r = ctx.hr[0] * 0.98;
    const len = (0.13 + 0.05 * Math.cos(a)) * s;
    prims.push({
      shape: {
        kind: "ellipsoid",
        c: [ctx.hc[0] + Math.sin(a) * (r + 0.01 * s), y + len * 0.75, ctx.hc[2] + Math.cos(a) * (r + 0.01 * s)],
        r: [0.022 * s, len, 0.008 * s],
        rot: rotZ(-Math.sin(a) * 0.25),
      },
      bone: head,
      blend: 0,
      slot: i % 2 ? HS.feather2 : HS.feather1,
    });
  }
  pieces.push({ kind: "field", name: "feathers", prims, h: 0.01 * LOD_H[ctx.lod]!, rigid: head });
  return pieces;
}

/** A woven band round the head (headband, or the base of the feather crown). */
function band(ctx: WearCtx, w = 0.035): GridPiece {
  const s = headS(ctx);
  const y = ctx.hc[1] + 0.32 * ctx.hr[1];
  const t = (y - ctx.hc[1]) / ctx.hr[1];
  const r = ctx.hr[0] * Math.sqrt(1 - t * t) + 0.012 * s;
  const prof: Array<readonly [number, number]> = [
    [r - 0.004 * s, w * s],
    [r + 0.008 * s, w * s * 0.9],
    [r + 0.01 * s, w * s * 0.5],
    [r + 0.008 * s, w * s * 0.1],
    [r - 0.004 * s, 0],
  ];
  const g = lathe(prof, res(ctx, 32, 12));
  for (let i = 0; i < g.positions.length; i += 3) {
    g.positions[i] = (g.positions[i] as number) + ctx.hc[0];
    g.positions[i + 1] = (g.positions[i + 1] as number) + y;
    g.positions[i + 2] = (g.positions[i + 2] as number) + ctx.hc[2];
  }
  return rigidGrid("headband", g, ctx.b("head"), (p) =>
    Math.abs(p[1] - y - w * s * 0.5) < w * s * 0.18 ? HS.hatTrim : HS.hatBand,
  );
}
