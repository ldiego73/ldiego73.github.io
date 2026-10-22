/**
 * Hair for the human archetypes, measured from the head:
 *
 *   shell     the head enlarged a little and cut along a hairline (high on the forehead, low at the nape),
 *             with an optional centre parting the ink reads as a crease: the base of every style;
 *   locks     anime-style clumps (tapered, flattened tubes hugging the head): bangs, side locks and a nape
 *             fringe (the traveler under the chullo), or just the bangs for a fringe;
 *   braids    two long braids on three-bone spring chains, tied with wool tassels (tullma);
 *   long      long straight hair down the back on a two-bone spring chain, with a fringe (Amazonian women);
 *   bun       a bun at the nape; ponytail: a tail on a spring;
 *   crop      short hair: a shell with a low hairline and a few short bangs (men, boys).
 * Slots: `hair`, and `tie` for braid ties. Spring chains of the extra bones: ../archetype.ts `hangsOf`.
 *
 * Pure (no DOM, no Three).
 */
import type { Piece } from "../build";
import { hugPath, toOffset } from "../drape";
import { type Grid, joinGrids, profile, smoothstep, tube } from "../loft";
import { type Prim, rotX, type Vec3 } from "../sdf";
import { HS } from "../slots";
import { type BoneRows, LOD_H, res, rigidGrid, type WearCtx, type Worn } from "./ctx";

export type HairStyle = "locks" | "parted" | "braids" | "long" | "bun" | "ponytail" | "crop" | "none";

const headS = (ctx: WearCtx) => ctx.hr[0] / 0.222;

export function hairBones(style: HairStyle, hc: Vec3, s: number, k: number): BoneRows {
  if (style === "braids") {
    const rows: BoneRows = [];
    for (const [sd, x] of [
      ["L", 0.105],
      ["R", -0.105],
    ] as const)
      rows.push(
        [`braid${sd}0`, "head", [x * s, hc[1] - 0.12 * s, hc[2] - 0.15 * s]],
        [`braid${sd}1`, `braid${sd}0`, [x * s * 1.05, 1.1 * k, -0.2 * k]],
        [`braid${sd}2`, `braid${sd}1`, [x * s * 1.05, 0.93 * k, -0.205 * k]],
      );
    return rows;
  }
  if (style === "long")
    return [
      ["hairB0", "head", [0, hc[1] - 0.1 * s, hc[2] - 0.17 * s]],
      ["hairB1", "hairB0", [0, 1.12 * k, -0.17 * k]],
    ];
  if (style === "ponytail") return [["tail0", "head", [0, hc[1] - 0.02 * s, hc[2] - 0.22 * s]]];
  return [];
}

export function hair(ctx: WearCtx, style: HairStyle, opts: { over?: number; underBrim?: boolean } = {}): Worn {
  const pieces: Piece[] = [];
  const s = headS(ctx);
  if (style === "none") return { pieces };
  if (style === "locks") {
    // The traveler's clumped locks (worn under a hat that covers the crown).
    pieces.push(rigidGrid("hair", locks(ctx, "full"), ctx.b("head"), HS.hair));
    return { pieces };
  }
  const low = style === "crop";
  pieces.push(shell(ctx, { parting: style === "parted" || style === "braids", hairline: low ? 0.36 : 0.45 }));
  // Under a brimmed hat the bangs would read as dark marks at the temples from afar: the shell's hairline is enough.
  if ((style === "crop" || style === "long") && !opts.underBrim)
    pieces.push(rigidGrid("bangs", locks(ctx, "bangs"), ctx.b("head"), HS.hair));
  if (style === "braids") {
    const r = braids(ctx, opts.over ?? 0.035);
    pieces.push(...r.pieces);
  }
  if (style === "bun" || style === "braids") {
    // A knot of hair at the nape (where braids start, or the bun itself).
    const big = style === "bun";
    pieces.push({
      kind: "field",
      name: "bun",
      prims: [
        {
          shape: {
            kind: "ellipsoid",
            c: [ctx.hc[0], ctx.hc[1] - (big ? 0.02 : 0.11) * s, ctx.hc[2] - (big ? 0.22 : 0.15) * s],
            r: big ? [0.1 * s, 0.085 * s, 0.075 * s] : [0.13 * s, 0.07 * s, 0.07 * s],
          },
          bone: ctx.b("head"),
          blend: 0,
          slot: HS.hair,
        },
      ],
      h: 0.02 * LOD_H[ctx.lod]!,
      rigid: ctx.b("head"),
    });
  }
  if (style === "long") {
    const r = longHair(ctx, opts.over ?? 0.03);
    pieces.push(...r.pieces);
  }
  if (style === "ponytail") {
    const b0 = ctx.b("tail0");
    const top: Vec3 = [ctx.hc[0], ctx.hc[1] - 0.0 * s, ctx.hc[2] - 0.22 * s];
    const path = hugPath(ctx.field, top, 9, 0.035 * s, (i) => [0, -1, -0.15 + i * 0.01], 0.03 * s);
    const r = profile([
      [0, 0.035 * s],
      [0.15, 0.04 * s],
      [0.8, 0.028 * s],
      [1, 0],
    ]);
    pieces.push({
      kind: "grid",
      name: "ponytail",
      grid: tube(path, r, ctx.lod ? 6 : 8),
      layer: "body",
      paint: HS.hair,
      skin: (p) => {
        const t = smoothstep(top[1], top[1] - 0.12 * s, p[1]);
        return [
          [ctx.b("head"), 1 - t],
          [b0, t],
        ];
      },
    });
  }
  return { pieces };
}

/**
 * The hair shell: the head enlarged a little, cut along a hairline that is high on the forehead and low at the
 * nape (a tilted plane), with a soft groove down the middle when parted.
 */
function shell(ctx: WearCtx, o: { parting: boolean; hairline: number }): Piece {
  const s = headS(ctx);
  const hc = ctx.hc;
  const hr = ctx.hr;
  const head = ctx.b("head");
  const A = Math.atan(o.hairline);
  const pivotY = hc[1] - 0.03 * s;
  const prims: Prim[] = [
    {
      shape: {
        kind: "ellipsoid",
        c: [hc[0], hc[1] + 0.006 * s, hc[2] - 0.008 * s],
        r: [hr[0] + 0.016 * s, hr[1] + 0.018 * s, hr[2] + 0.02 * s],
      },
      bone: head,
      blend: 0,
      slot: HS.hair,
    },
    {
      shape: {
        kind: "box",
        c: [hc[0], pivotY - 0.3 * Math.cos(A), hc[2] + 0.3 * Math.sin(A)],
        h: [0.5, 0.3, 0.5],
        round: 0,
        rot: rotX(-A),
      },
      bone: head,
      blend: 0.02 * s,
      slot: HS.hair,
      carve: true,
    },
  ];
  if (o.parting && ctx.lod < 2)
    prims.push({
      shape: {
        kind: "cone",
        a: [hc[0], hc[1] + 0.13 * s, hc[2] + 0.2 * s],
        b: [hc[0], hc[1] + 0.2 * s, hc[2] - 0.05 * s],
        ra: 0.012 * s,
        rb: 0.006 * s,
      },
      bone: head,
      blend: 0.012 * s,
      slot: HS.hair,
      carve: true,
    });
  return { kind: "field", name: "hairshell", prims, h: 0.02 * LOD_H[ctx.lod]!, rigid: head };
}

/**
 * Anime-style clumped locks: bangs over the forehead, side locks in front of the ears and a fringe at the nape
 * (`full`), or only the bangs. Each lock is a flattened tube that hugs the head and tapers to a point, curling
 * slightly at the tip.
 */
function locks(ctx: WearCtx, which: "full" | "bangs"): Grid {
  const s = headS(ctx);
  const hc = ctx.hc;
  const list: Grid[] = [];
  const segs = ctx.lod ? 5 : 7;
  const lock = (ax: number, ay: number, len: number, w: number, curl: number, drift: number) => {
    const dir: Vec3 = [Math.sin(ax) * Math.cos(ay), Math.sin(ay), Math.cos(ax) * Math.cos(ay)];
    const start = toOffset(
      ctx.head,
      [hc[0] + dir[0] * 0.3 * s, hc[1] + dir[1] * 0.3 * s, hc[2] + dir[2] * 0.3 * s],
      0.008 * s,
    );
    const n = res(ctx, 9, 4);
    const path = hugPath(
      ctx.head,
      start,
      n,
      (len * s) / (n - 1),
      (i) => {
        const t = i / (n - 1);
        return [Math.sin(ax) * (0.25 + curl * t) + drift * t, -1, Math.cos(ax) * (0.18 + curl * t * 0.8)];
      },
      0.009 * s,
    );
    const r = profile([
      [0, w * s * 0.7],
      [0.3, w * s],
      [0.75, w * s * 0.6],
      [1, 0],
    ]);
    list.push(tube(path, r, segs, { flat: 0.42, up: dir }));
  };
  const bangs: Array<[number, number, number, number]> = [
    [-0.7, 0.075, 0.03, 0.04],
    [-0.42, 0.11, 0.025, 0.05],
    [-0.12, 0.1, -0.035, 0.052],
    [0.16, 0.12, -0.04, 0.05],
    [0.46, 0.09, -0.03, 0.046],
    [0.72, 0.07, -0.02, 0.04],
  ];
  const ay = which === "bangs" ? 0.62 : 0.5;
  for (const [ax, len, drift, w] of bangs) lock(ax, ay, len, w, 0.2, drift);
  if (which === "full" && ctx.lod < 2) {
    for (const sd of [-1, 1]) {
      lock(sd * 1.12, 0.22, 0.12, 0.03, 0.15, sd * 0.05);
      lock(sd * 1.32, 0.18, 0.1, 0.028, 0.2, sd * 0.02);
    }
    for (let i = -3; i <= 3; i++) lock(Math.PI + i * 0.26, -0.18, 0.07 + (3 - Math.abs(i)) * 0.006, 0.03, 0.3, 0);
  }
  return joinGrids(list);
}

/** Two braids down the back (over whatever is worn there: `over` is the clearance), tied at the ends. */
function braids(ctx: WearCtx, over: number): Worn {
  const s = headS(ctx);
  const k = ctx.k;
  const pieces: Piece[] = [];
  for (const sd of ["L", "R"] as const) {
    const sx = sd === "L" ? 1 : -1;
    const b0 = ctx.b(`braid${sd}0`);
    const b1 = ctx.b(`braid${sd}1`);
    const b2 = ctx.b(`braid${sd}2`);
    const head = ctx.b("head");
    const y0 = ctx.hc[1] - 0.12 * s;
    const n = res(ctx, 16, 7);
    const path = hugPath(
      ctx.field,
      [ctx.hc[0] + 0.1 * s * sx, y0, ctx.hc[2] - 0.16 * s],
      n,
      (0.032 * 15 * k) / (n - 1),
      (i) => [0.004 * sx, -1, -0.04 + (i < n / 4 ? -0.1 : 0)],
      over + 0.023 * k,
    );
    const N = 11;
    const r = (t: number) => {
      if (t > 0.9) return (0.026 * (1 - (t - 0.9) / 0.1) ** 0.6 + 0.004) * s;
      if (t > 0.84) return 0.03 * s;
      const lobe = ctx.lod < 2 ? Math.abs(Math.sin(t * N * Math.PI)) : 0.5;
      return (0.024 - 0.006 * t) * (0.86 + 0.24 * lobe) * s;
    };
    const g = tube(path, r, ctx.lod ? 6 : 8, { twist: 0 });
    const yTop = (path[0] as Vec3)[1];
    const yBot = (path[path.length - 1] as Vec3)[1];
    pieces.push({
      kind: "grid",
      name: `braid${sd}`,
      grid: g,
      layer: "body",
      paint: (p) => {
        const t = (yTop - p[1]) / (yTop - yBot);
        const sl = t > 0.9 ? HS.tie : t > 0.84 ? HS.hatBand : HS.hair;
        return [sl, sl, 1];
      },
      skin: (p) => {
        const t = (yTop - p[1]) / (yTop - yBot);
        return [
          [head, 1 - smoothstep(0.0, 0.12, t)],
          [b0, smoothstep(0.0, 0.12, t) * (1 - smoothstep(0.25, 0.5, t))],
          [b1, smoothstep(0.25, 0.5, t) * (1 - smoothstep(0.55, 0.8, t))],
          [b2, smoothstep(0.55, 0.8, t)],
        ];
      },
    });
  }
  return { pieces };
}

/** Long straight hair: a wide flattened tube from the back of the head down to mid-back. */
function longHair(ctx: WearCtx, over: number): Worn {
  const s = headS(ctx);
  const k = ctx.k;
  const head = ctx.b("head");
  const b0 = ctx.b("hairB0");
  const b1 = ctx.b("hairB1");
  const top: Vec3 = [ctx.hc[0], ctx.hc[1] + 0.02 * s, ctx.hc[2] - 0.2 * s];
  const n = res(ctx, 12, 6);
  const path = hugPath(ctx.field, top, n, (0.48 * k) / (n - 1), (i) => [0, -1, i < 3 ? -0.25 : -0.02], over + 0.02 * k);
  const w = profile([
    [0, 0.16 * s],
    [0.25, 0.17 * s],
    [0.85, 0.15 * s],
    [1, 0.05 * s],
  ]);
  const g = tube(path, w, ctx.lod ? 8 : 12, { flat: 0.22, up: [0, 0, -1] });
  const yTop = top[1];
  const yBot = (path[path.length - 1] as Vec3)[1];
  return {
    pieces: [
      {
        kind: "grid",
        name: "longhair",
        grid: g,
        layer: "body",
        paint: HS.hair,
        skin: (p) => {
          const t = (yTop - p[1]) / (yTop - yBot);
          return [
            [head, 1 - smoothstep(0.05, 0.25, t)],
            [b0, smoothstep(0.05, 0.25, t) * (1 - smoothstep(0.45, 0.75, t))],
            [b1, smoothstep(0.45, 0.75, t)],
          ];
        },
      },
    ],
  };
}

/**
 * A beard: a shell over the jaw (a little larger than it), cut above the mouth line in front and kept as
 * sideburns up the cheeks, the mouth itself left clear for the face decal. Short: close trimmed; full: fuller
 * and lower on the chest.
 */
export function beard(ctx: WearCtx, kind: "short" | "full"): Piece {
  const s = headS(ctx);
  const hc = ctx.hc;
  const head = ctx.b("head");
  const full = kind === "full";
  const grow = (full ? 0.026 : 0.012) * s;
  // The jaw of ./human.ts sits at the head base + (0, 0.05, 0.034) with radii (0.158, 0.112, 0.148).
  const base: Vec3 = [hc[0], hc[1] - 0.15 * s, hc[2]];
  const jc: Vec3 = [base[0], base[1] + (full ? 0.03 : 0.045) * s, base[2] + 0.04 * s];
  const prims: Prim[] = [
    {
      shape: {
        kind: "ellipsoid",
        c: jc,
        r: [0.158 * s + grow, (0.112 + (full ? 0.04 : 0)) * s + grow, 0.148 * s + grow],
      },
      bone: head,
      blend: 0,
      slot: HS.hair,
    },
    // Remove the top: everything above a plane rising toward the back (the sideburns stay up the cheeks).
    {
      shape: {
        kind: "box",
        // Plane through P = base + (0, 0.06, 0.15)·s with normal (0, cos A, sin A): the box sits on it.
        c: [base[0], base[1] + 0.06 * s + 0.3 * Math.cos(0.75), base[2] + 0.15 * s + 0.3 * Math.sin(0.75)],
        h: [0.5, 0.3, 0.5],
        round: 0,
        rot: rotX(0.75),
      },
      bone: head,
      blend: 0.015 * s,
      slot: HS.hair,
      carve: true,
    },
    // Keep the mouth clear.
    {
      shape: {
        kind: "ellipsoid",
        c: [base[0], base[1] + 0.005 * s, base[2] + 0.2 * s],
        r: [0.05 * s, 0.025 * s, 0.06 * s],
      },
      bone: head,
      blend: 0.01 * s,
      slot: HS.hair,
      carve: true,
    },
  ];
  return { kind: "field", name: "beard", prims, h: 0.014 * LOD_H[ctx.lod]!, rigid: head };
}
