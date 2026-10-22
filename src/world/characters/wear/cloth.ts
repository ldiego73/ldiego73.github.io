/**
 * Cloth layers: double-sided shells on the shared cloth wind (./material.ts `clothMaterial`), patterned from
 * the shared atlas (../regions.ts) and dyed from a cloth group of five palette slots (../slots.ts):
 *
 *   poncho    a square of wool over the shoulders, hanging over the arms (shorter at the sides, so the hands
 *             show) to mid-thigh front and back, on the "poncho" spring bone;
 *   skirt     one tier of a pollera (a bell from the waist, wrapped over the hips, pleats flaring toward the
 *             hem), or a straight wrap skirt (kené), the cushma's lower half, a Colca embroidered skirt: one
 *             builder, different hems, flares and patterns, on the "skirt" spring bone;
 *   lliclla   a woven shawl over the shoulders and back, its front edges meeting at the tupu;
 *   apron     a bib apron hanging in front from the chest (coast);
 *   vest      a garment open at the front that hugs the torso and lets the arms through: the beach traveler's
 *             open print shirt, a Taquile chaleco.
 * Each is skinned to the body bones it hangs from and to its spring bone toward the free edge; `flex` (0 pinned
 * → 1 free) weights the wind.
 *
 * Pure (no DOM, no Three).
 */
import type { GridPiece } from "../build";
import { drape, drapeArc } from "../drape";
import { grid, smoothstep } from "../loft";
import { REGION, type RegionName } from "../regions";
import type { Vec3 } from "../sdf";
import { CLOTH_GROUPS, type ClothGroup } from "../slots";
import { type BoneRows, res, type WearCtx } from "./ctx";

const group = (g: ClothGroup) => {
  const [base, r, gg, b, w] = CLOTH_GROUPS[g];
  return { base, pattern: [r, gg, b, w] as [number, number, number, number] };
};

export function clothBones(kinds: ReadonlySet<string>, k: number): BoneRows {
  const rows: BoneRows = [];
  if (kinds.has("poncho")) rows.push(["poncho", "chest", [0, 1.16 * k, 0]]);
  if (kinds.has("skirt")) rows.push(["skirt", "hips", [0, 0.87 * k, 0]]);
  return rows;
}

export interface PonchoOpts {
  /** Hem height front/back (traveler units: 0.76 mid-thigh, 0.62 knee). */
  hem?: number;
  group?: ClothGroup;
  region?: RegionName;
}

/**
 * The poncho: leaves the neck opening slightly down and out; the shoulders lift it, then it falls. Skinned to
 * the chest, a little to the upper arms at the sides, and toward the hem to the "poncho" spring bone.
 */
export function poncho(ctx: WearCtx, o: PonchoOpts = {}): GridPiece {
  const k = ctx.k;
  const rows = res(ctx, 26, 8);
  const cols = res(ctx, 64, 20);
  const hem0 = (o.hem ?? 0.76) * k;
  const hemY = (a: number) => hem0 - 0.1 * k * Math.abs(Math.cos(a)) ** 1.4;
  const fold = (s: number, a: number) => {
    const q = s * s;
    return q * k * (0.016 * Math.sin(a * 7 + 0.6) + 0.009 * Math.sin(a * 13 + 2.1));
  };
  const d = drapeArc(ctx.field, {
    rows,
    cols,
    start: (a) => [Math.sin(a) * 0.085 * k * ctx.sw, 1.222 * k, Math.cos(a) * 0.08 * k],
    dir0: (a) => [Math.sin(a), -0.35, Math.cos(a)],
    off: 0.022 * k,
    ds: 0.012 * k,
    gravity: 0.15,
    flare: 0.012,
    stop: (a, p) => p[1] <= hemY(a),
    ripple: fold,
  });
  const chest = ctx.b("chest");
  const armL = ctx.b("armL");
  const armR = ctx.b("armR");
  const pb = ctx.b("poncho");
  const rowOf = (v: number) => Math.floor(v / (cols + 1)) / (rows - 1);
  const ang = (v: number) => d.angle(v % (cols + 1));
  const g = group(o.group ?? "wrap");
  return {
    kind: "grid",
    name: "poncho",
    grid: d.grid,
    layer: "cloth",
    paint: g.base,
    cloth: g.pattern,
    uvRect: REGION[o.region ?? "poncho"],
    skin: (p, v) => {
      const s = rowOf(v);
      const side = Math.sin(ang(v));
      const hang = smoothstep(0.25, 1, s);
      const overArm = smoothstep(0.17 * k, 0.26 * k, Math.abs(p[0])) * smoothstep(0.1, 0.45, s);
      return [
        [chest, 1],
        [armL, 0.55 * overArm * (side > 0 ? 1 : 0)],
        [armR, 0.55 * overArm * (side < 0 ? 1 : 0)],
        [pb, 1.5 * hang],
      ];
    },
    flex: (_p, v) => smoothstep(0.12, 1, rowOf(v)) ** 1.2,
    shade: (_p, v) => {
      const s = rowOf(v);
      const a = ang(v);
      const f = fold(s, a) / Math.max(1e-4, s * s * 0.025 * k);
      return 1 - 0.14 * s * s * (0.5 - 0.5 * f);
    },
  };
}

export interface SkirtOpts {
  /** Hem height (traveler units): 0.44 below the knee, 0.27 mid-calf, 0.16 ankle. */
  hem: number;
  /** Clearance over the body, flare per unit of drop, pleat count and depth (0 = straight). */
  off?: number;
  flare?: number;
  pleats?: number;
  pleatK?: number;
  /** Waist height (default 0.875). */
  top?: number;
  group?: ClothGroup;
  /** Override the base slot (the under-tier of a pollera). */
  base?: number;
  region?: RegionName;
  name?: string;
  /** Wind weight at the hem (default 1). */
  flex?: number;
}

/**
 * One skirt tier: a bell from the waist, wrapped over the hips and flaring with pleats toward the hem. Skinned to
 * the hips, toward the hem to the thighs on its side (a step pushes its side of the skirt) and to the "skirt"
 * spring bone (swish).
 */
export function skirt(ctx: WearCtx, o: SkirtOpts): GridPiece {
  const k = ctx.k;
  const rows = res(ctx, 18, 6);
  const cols = res(ctx, 72, 22);
  const top = (o.top ?? 0.875) * k;
  const hem = o.hem * k;
  const pleats = o.pleats ?? 16;
  const pk = o.pleatK ?? 1;
  const pleat = (s: number, a: number) =>
    pk * k * (0.012 + 0.024 * s ** 1.3) * Math.sin(a * pleats) * smoothstep(0.05, 0.4, s);
  const d = drape(ctx.field, {
    rows,
    cols,
    y: (s) => top + (hem - top) * s,
    r0: (s) => (0.13 + s * 0.05) * k * ctx.hw,
    off: (o.off ?? 0.036) * k,
    flare: o.flare ?? 0.47,
    ripple: pleat,
  });
  const hips = ctx.b("hips");
  const sk = ctx.b("skirt");
  const tL = ctx.b("thighL");
  const tR = ctx.b("thighR");
  const rowOf = (v: number) => Math.floor(v / (cols + 1)) / (rows - 1);
  const ang = (v: number) => ((v % (cols + 1)) / cols) * Math.PI * 2;
  const g = group(o.group ?? "skirt");
  const flexK = o.flex ?? 1;
  return {
    kind: "grid",
    name: o.name ?? "skirt",
    grid: d.grid,
    layer: "cloth",
    paint: o.base ?? g.base,
    cloth: g.pattern,
    uvRect: REGION[o.region ?? "pollera"],
    skin: (_p, v) => {
      const s = rowOf(v);
      const a = ang(v);
      const side = Math.sin(a);
      const front = Math.cos(a);
      const q = smoothstep(0.1, 1, s);
      // The front follows the forward leg more than the back does (and the thighs when seated).
      const legK = 0.4 * q * (0.5 + 0.5 * Math.max(0, front));
      return [
        [hips, 1],
        [tL, legK * smoothstep(-0.35, 0.6, side)],
        [tR, legK * smoothstep(-0.35, 0.6, -side)],
        [sk, 0.9 * q],
      ];
    },
    flex: (_p, v) => smoothstep(0.15, 1, rowOf(v)) * flexK,
    shade: (_p, v) => {
      const s = rowOf(v);
      const f = pleats > 0 ? Math.sin(ang(v) * pleats) : 0;
      return (1 - 0.16 * pk * smoothstep(0.1, 0.6, s) * (0.5 - 0.5 * f)) * (1 - 0.08 * (1 - s));
    },
  };
}

/**
 * The lliclla: a woven shawl over the shoulders and back, its two front edges meeting at the tupu on the chest;
 * shorter in front, falling to the waist behind. An open strip of columns (front gap) on the arc drape.
 */
export function lliclla(ctx: WearCtx, o: { group?: ClothGroup; region?: RegionName } = {}): GridPiece {
  const k = ctx.k;
  const rows = res(ctx, 20, 6);
  const cols = res(ctx, 48, 16);
  const gap = 0.32;
  const hemY = (a: number) => {
    const back = Math.min(1, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.PI);
    return (1.06 - 0.24 * smoothstep(0.1, 1, back)) * k;
  };
  const d = drapeArc(ctx.field, {
    rows,
    cols,
    span: [gap, Math.PI * 2 - gap],
    start: (a) => [Math.sin(a) * 0.075 * k, 1.205 * k, Math.cos(a) * 0.07 * k],
    dir0: (a) => [Math.sin(a), -0.45, Math.cos(a)],
    off: 0.03 * k,
    ds: 0.012 * k,
    gravity: 0.16,
    flare: 0.006,
    stop: (a, p) => p[1] <= hemY(a),
    ripple: (s, a) => s * s * 0.008 * k * Math.sin(a * 9),
  });
  const chest = ctx.b("chest");
  const spine = ctx.b("spine");
  const armL = ctx.b("armL");
  const armR = ctx.b("armR");
  const rowOf = (v: number) => Math.floor(v / cols) / (rows - 1);
  const g = group(o.group ?? "shawl");
  return {
    kind: "grid",
    name: "lliclla",
    grid: d.grid,
    layer: "cloth",
    paint: g.base,
    cloth: g.pattern,
    uvRect: REGION[o.region ?? "lliclla"],
    skin: (p, v) => {
      const s = rowOf(v);
      const overArm = smoothstep(0.15 * k, 0.24 * k, Math.abs(p[0])) * smoothstep(0.05, 0.4, s);
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

/**
 * A bib apron: a panel in front, from the chest (`top`) to above the knee (`hem`), hanging off the body on the
 * ring drape restricted to a front arc.
 */
export function apron(
  ctx: WearCtx,
  o: { top?: number; hem?: number; group?: ClothGroup; region?: RegionName } = {},
): GridPiece {
  const k = ctx.k;
  const rows = res(ctx, 12, 5);
  const cols = res(ctx, 20, 8);
  const top = (o.top ?? 1.1) * k;
  const hem = (o.hem ?? 0.5) * k;
  const half = 0.85;
  const d = drape(ctx.field, {
    rows,
    cols,
    y: (s) => top + (hem - top) * s,
    r0: () => 0.05 * k,
    off: 0.02 * k,
    flare: 0.12,
    span: () => [-half, half],
  });
  const chest = ctx.b("chest");
  const hips = ctx.b("hips");
  const tL = ctx.b("thighL");
  const tR = ctx.b("thighR");
  const rowOf = (v: number) => Math.floor(v / cols) / (rows - 1);
  const g = group(o.group ?? "shawl");
  const waist = 0.88 * k;
  return {
    kind: "grid",
    name: "apron",
    grid: d.grid,
    layer: "cloth",
    paint: g.base,
    cloth: g.pattern,
    uvRect: REGION[o.region ?? "plain"],
    skin: (p, v) => {
      const above = smoothstep(waist - 0.05 * k, waist + 0.08 * k, p[1]);
      const s = rowOf(v);
      return [
        [chest, above],
        [hips, 1 - above],
        [tL, 0.25 * s * (p[0] > 0 ? 1 : 0)],
        [tR, 0.25 * s * (p[0] < 0 ? 1 : 0)],
      ];
    },
    flex: (p) => smoothstep(waist, hem, p[1]) * 0.6,
  };
}

/**
 * A garment open at the front that hugs the torso (the torso-only field, so the arms come out through its
 * sides): an open shirt, a vest. From the shoulders (`top`) to the hips (`hem`).
 */
export function vest(
  ctx: WearCtx,
  o: { hem?: number; gap?: number; group?: ClothGroup; region?: RegionName; name?: string } = {},
): GridPiece {
  const k = ctx.k;
  const rows = res(ctx, 14, 5);
  const cols = res(ctx, 44, 16);
  const top = 1.17 * k;
  const hem = (o.hem ?? 0.82) * k;
  const gap = o.gap ?? 0.28;
  const d = drape(ctx.torso, {
    rows,
    cols,
    y: (s) => top + (hem - top) * s,
    r0: (s) => (0.07 + 0.08 * Math.min(1, s * 4)) * k,
    off: 0.018 * k,
    flare: 0.06,
    span: () => [gap, Math.PI * 2 - gap],
  });
  const chest = ctx.b("chest");
  const spine = ctx.b("spine");
  const hips = ctx.b("hips");
  const g = group(o.group ?? "wrap");
  return {
    kind: "grid",
    name: o.name ?? "vest",
    grid: d.grid,
    layer: "cloth",
    paint: g.base,
    cloth: g.pattern,
    uvRect: REGION[o.region ?? "floral"],
    skin: (p) => {
      const y = p[1] / k;
      const tC = smoothstep(0.95, 1.08, y);
      const tH = 1 - smoothstep(0.84, 0.95, y);
      return [
        [chest, tC],
        [spine, 1 - tC - tH * 0.6],
        [hips, tH * 0.6],
      ];
    },
    flex: (p) => smoothstep(0.98 * k, hem, p[1]) * 0.35,
  };
}

export type { Vec3 };
/** A plain grid helper re-exported for worn pieces that need one. */
export { grid };
