/**
 * The human archetype API: a person is declared as data (`HumanSpec`: body, hair, hat, top, bottom, footwear,
 * cloth layers, worn pieces) and composed here into a skeleton and a list of pieces for ./build.ts. Colours
 * are never in the spec: every piece paints palette slots (./slots.ts), and each person brings a palette, so
 * one archetype dresses a whole village.
 *
 *   const spec: HumanSpec = { sex: "f", hair: "braids", hat: "montera", top: "jobona", bottom: "bare",
 *     feet: "ojotas", layers: [{ kind: "pollera" }, { kind: "lliclla" }], worn: ["tupu"] };
 *   const a = composeHuman(spec, 0);      // bones, pieces, spring chains, gait style, face row
 *   buildArchetype(a.bones, a.pieces);    // (./pipeline.ts does this off the main thread, cached)
 *
 * Specs are plain JSON (they travel to the build worker); `specKey` names them for the caches. Presets for the
 * worlds are in ./presets.ts.
 *
 * Levels of detail (`lod` 0 near, 1 mid, 2 far): coarser voxels and grids, fewer small pieces, and at lod 2 the
 * cloth folds into the body draw (one draw call, its base colour, no wind): the silhouette and the palette stay.
 *
 * Pure (no DOM, no Three).
 */
import type { HangSpec, HumanStyle } from "./anim-human";
import { type BoneDef, boneIndex, type GridPiece, type Piece, skeleton } from "./build";
import { makeField } from "./drape";
import { type BandSpec, type BodyPaint, type HumanOpts, humanBody, humanSkeletonRows } from "./human";
import type { RegionName } from "./regions";
import { type Prim, prepare, type Shape, type Vec3 } from "./sdf";
import { CLOTH_GROUPS, type ClothGroup, HS } from "./slots";
import { apron, clothBones, lliclla, poncho, skirt, vest } from "./wear/cloth";
import { LOD_H, LOD_Q, type Lod, type WearCtx } from "./wear/ctx";
import { beard, type HairStyle, hair, hairBones } from "./wear/hair";
import { type HatKind, hat, hatBones } from "./wear/hats";
import { sandals, type WornKind, worn, wornBones } from "./wear/worn";

export type { HairStyle, HatKind, Lod, WornKind };

export type Sex = "f" | "m";
export type Age = "child" | "adult" | "elder";
export type Build = "slim" | "average" | "sturdy" | "heavy";
export type TopKind =
  /** Long-sleeved knit (the traveler's sweater under the poncho). */
  | "sweater"
  /** Knitted alpaca chompa with a patterned yoke. */
  | "chompa"
  /** Buttoned shirt with a collar, tucked in. */
  | "shirt"
  /** Short-sleeved polo with a collar and placket, tucked in. */
  | "polo"
  /** T-shirt, untucked. */
  | "tee"
  /** Women's blouse, untucked. */
  | "blouse"
  /** The highland woman's fitted jacket with embroidered cuffs. */
  | "jobona"
  /** Zipped jacket. */
  | "jacket"
  /** Two-tone windbreaker (a yoke across the shoulders), zipped. */
  | "windbreaker"
  /** The Amazonian cushma's upper half: vertical warp stripes (pair it with the "cushma" layer). */
  | "cushma"
  /** The unku: a sleeveless tunic to the knee (its skirt is added for you, with a woven band at the waist). */
  | "unku"
  /** Bare torso (children swimming). */
  | "bare";
export type Sleeves = "long" | "short" | "none";
export type BottomKind =
  | "trousers"
  /** Knee-length bayeta trousers (highland men). */
  | "knee-trousers"
  | "shorts"
  | "board-shorts"
  /** Trousers with cargo pockets. */
  | "cargo"
  /** Bare legs (under a skirt, a pollera, a cushma). */
  | "bare";
export type Feet = "boots" | "shoes" | "ojotas" | "sandals" | "bare";

export type Layer =
  | { kind: "poncho"; hem?: number; group?: ClothGroup; region?: RegionName }
  /** Pollera: one or two tiers (the under-tier in `accent2`), pattern `pollera` by default. */
  | { kind: "pollera"; tiers?: 1 | 2; hem?: number; region?: RegionName; group?: ClothGroup }
  /** Straight wrap skirt (kené by default), mid-calf. */
  | { kind: "skirt"; hem?: number; region?: RegionName; group?: ClothGroup; flare?: number; pleats?: number }
  /** The cushma's lower half: striped, from the waist to mid-calf, in the `wrap` group. */
  | { kind: "cushma"; hem?: number }
  | { kind: "lliclla"; group?: ClothGroup; region?: RegionName }
  | { kind: "apron"; group?: ClothGroup; region?: RegionName; top?: number; hem?: number }
  /** Open garment hugging the torso (open print shirt, vest). */
  | { kind: "vest"; group?: ClothGroup; region?: RegionName; hem?: number; gap?: number };

export interface TopSpec {
  kind: TopKind;
  sleeves?: Sleeves;
  /** Waistband line (traveler units); default per kind (tucked 0.845, untucked 0.8). */
  hem?: number;
  /** A belt at the waist (`accent2`) with a buckle. */
  belt?: boolean;
}

export interface HumanSpec {
  sex: Sex;
  age?: Age;
  build?: Build;
  /** Overall height factor baked into the geometry (per-person jitter belongs in the instance scale). */
  height?: number;
  hair: HairStyle;
  hat?: HatKind;
  top: TopKind | TopSpec;
  bottom: BottomKind;
  feet: Feet;
  layers?: Layer[];
  worn?: WornKind[];
  /** Face atlas row (./faces.ts); default from sex and age. */
  face?: number;
  /** Facial hair (in the `hair` slot: grey for elders through the palette). */
  beard?: "short" | "full";
  /** No painted face (a knitted mask, a costume head built with `extra`). */
  hideFace?: boolean;
  /**
   * World-specific extra shapes (a costume, a mask, a fleece): signed-distance primitives in traveler units
   * (scaled with the body), each on a named bone of the skeleton and painted with a palette slot. Grouped by
   * bone into rigid pieces of the body draw; `wool` gives a lumpy fleece. Plain data, so it travels to the
   * worker and keys the cache like the rest of the spec.
   */
  extra?: ExtraPrim[];
}

export interface ExtraPrim {
  bone: string;
  shape: Shape;
  slot: number;
  /** Smooth-union radius with the shapes before it on the same bone (default 0.02). */
  blend?: number;
  carve?: boolean;
  wool?: number;
  woolFreq?: number;
}

/** Face atlas rows (./faces.ts draws them in this order). */
export const FACE = { traveler: 0, woman: 1, man: 2, girl: 3, boy: 4, elderWoman: 5, elderMan: 6, teen: 7 } as const;

export interface Composed {
  bones: BoneDef[];
  pieces: Piece[];
  hangs: HangSpec[];
  style: HumanStyle;
  face: number;
  /** Body options used (height, head size). */
  opts: HumanOpts;
}

/** Stable key of a spec (caches, worker requests). */
export function specKey(spec: HumanSpec): string {
  const sorted = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(sorted);
    if (o && typeof o === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o as Record<string, unknown>).sort())
        out[k] = sorted((o as Record<string, unknown>)[k]);
      return out;
    }
    return o;
  };
  return JSON.stringify(sorted(spec));
}

const topOf = (spec: HumanSpec): TopSpec => (typeof spec.top === "string" ? { kind: spec.top } : spec.top);

/** Body proportions from sex, age and build. */
export function bodyOpts(spec: HumanSpec): HumanOpts {
  const f = spec.sex === "f";
  const o: HumanOpts = f
    ? { scale: 0.95, shoulders: 0.9, hips: 1.12, chest: 1.05, feet: "bare" }
    : { scale: 1, shoulders: 1.02, hips: 0.98, chest: 1, feet: "bare" };
  const age = spec.age ?? "adult";
  if (age === "child") {
    o.scale = f ? 0.62 : 0.64;
    o.head = 1.24;
    o.limb = 1.08;
    o.shoulders *= 0.96;
    o.hips = f ? 1.0 : 0.96;
    o.chest = 1;
  } else if (age === "elder") {
    o.scale *= 0.97;
    o.limb = 0.95;
    o.chest *= 0.97;
  }
  switch (spec.build ?? "average") {
    case "slim":
      o.limb = (o.limb ?? 1) * 0.92;
      o.shoulders *= 0.97;
      break;
    case "sturdy":
      o.limb = (o.limb ?? 1) * 1.1;
      o.shoulders *= 1.06;
      o.chest *= 1.06;
      o.hips *= 1.03;
      break;
    case "heavy":
      o.limb = (o.limb ?? 1) * 1.12;
      o.belly = 1.25;
      o.hips *= 1.06;
      o.chest *= 1.08;
      break;
  }
  o.scale *= spec.height ?? 1;
  o.feet = spec.feet === "boots" ? "boots" : spec.feet === "shoes" ? "shoes" : "bare";
  return o;
}

/** Default face row for a spec. */
export function faceOf(spec: HumanSpec): number {
  if (spec.face !== undefined) return spec.face;
  const age = spec.age ?? "adult";
  if (age === "child") return spec.sex === "f" ? FACE.girl : FACE.boy;
  if (age === "elder") return spec.sex === "f" ? FACE.elderWoman : FACE.elderMan;
  return spec.sex === "f" ? FACE.woman : FACE.man;
}

/** How the body is coloured, from the top, bottom and footwear (bands at traveler-unit heights). */
export function bodyPaint(spec: HumanSpec): BodyPaint {
  const top = topOf(spec);
  const tucked = top.kind === "shirt" || top.kind === "polo" || top.kind === "sweater";
  const waistY = top.hem ?? (tucked ? 0.845 : top.kind === "jobona" ? 0.86 : 0.8);
  const topSlot = top.kind === "cushma" || top.kind === "unku" ? HS.wrap : top.kind === "bare" ? HS.skin : HS.top;
  const bareLegs = spec.bottom === "bare";
  const legSlot = bareLegs ? HS.skin : HS.legs;
  // ---- waist: legs | (belt) | top
  const waist: BandSpec = top.belt
    ? { stops: [waistY - 0.012, waistY + 0.024], slots: [legSlot, HS.accent2, topSlot] }
    : { stops: [waistY], slots: [legSlot, topSlot] };
  // ---- chest: top | (yoke) | collar line | skin
  let chest: BandSpec = { stops: [1.172], slots: [topSlot, HS.skin] };
  if (top.kind === "chompa") {
    // Knitted yoke: a zig-zag band across the chest (the zig fades out toward the neckline).
    const zig = (p: Vec3) => {
      const y = p[1];
      const a = Math.atan2(p[0], p[2]);
      return 0.012 * Math.sin(a * 14) * (1 - Math.min(1, Math.max(0, (y - 1.1) / 0.04)));
    };
    chest = {
      stops: [1.02, 1.035, 1.09, 1.105, 1.172],
      slots: [HS.top, HS.trim, HS.white, HS.trim, HS.top, HS.skin],
      at: (p) => p[1] + zig(p),
    };
  } else if (top.kind === "windbreaker")
    // Yoke line high enough that only the chest and clavicle primitives meet it (a clean edge).
    chest = { stops: [1.095, 1.172], slots: [HS.top, HS.trim, HS.skin] };
  else if (top.kind === "cushma") {
    // Vertical warp stripes, plunging below the stops above the neckline (continuous, so no seam).
    chest = {
      stops: [-5, 0.82],
      slots: [HS.skin, HS.wrap, HS.wrapR],
      // Stripes fade out toward the shoulders (where the surface turns fast around the clavicles the angle
      // scalar would fray them): a stripe needs |sin| > 0.82, so scaling it down there just ends it cleanly.
      at: (p) => {
        const fade = 1 - Math.min(1, Math.max(0, (Math.abs(p[0]) - 0.1) / 0.05));
        return Math.sin(Math.atan2(p[0], p[2]) * 8) * fade - Math.max(0, p[1] - 1.15) * 220;
      },
    };
  } else if (top.kind === "bare") chest = { stops: [], slots: [HS.skin] };
  // ---- arms: skin | cuff | sleeve
  const sleeves: Sleeves =
    top.sleeves ??
    (top.kind === "polo" || top.kind === "tee" || top.kind === "cushma"
      ? "short"
      : top.kind === "bare"
        ? "none"
        : "long");
  const cuff =
    top.kind === "jobona" ? HS.trim : top.kind === "windbreaker" || top.kind === "jacket" ? HS.trim : topSlot;
  const arm: BandSpec =
    sleeves === "long"
      ? { stops: [0.69, 0.715], slots: [HS.skin, cuff, topSlot] }
      : sleeves === "short"
        ? { stops: [0.93, 0.955], slots: [HS.skin, top.kind === "polo" ? HS.trim : topSlot, topSlot] }
        : { stops: [], slots: [HS.skin] };
  // ---- legs: sole | shoe | sock | bare | trousers (bottom up)
  const stops: number[] = [];
  const slots: number[] = [];
  const feet = spec.feet;
  if (feet === "boots") {
    slots.push(HS.sole);
    stops.push(0.016);
    slots.push(HS.shoe);
    stops.push(0.17);
    slots.push(HS.sock);
  } else if (feet === "shoes") {
    slots.push(HS.sole);
    stops.push(0.012);
    slots.push(HS.shoe);
    stops.push(0.085);
    slots.push(HS.sock);
  } else slots.push(HS.skin);
  const hemOf: Record<BottomKind, number> = {
    trousers: 0.205,
    cargo: 0.205,
    "knee-trousers": 0.4,
    shorts: 0.56,
    "board-shorts": 0.47,
    bare: 2,
  };
  let hem = hemOf[spec.bottom];
  if ((feet === "bare" || feet === "ojotas" || feet === "sandals") && hem < 0.13) hem = 0.13;
  // Over low shoes trousers end just above the shoe (into boots they end at the sock cuff).
  if (feet === "shoes" && hem < 0.3) hem = 0.1;
  const sockTop = feet === "boots" ? (spec.bottom === "shorts" ? 0.3 : 0.205) : feet === "shoes" ? 0.11 : 0;
  if (feet === "boots" || feet === "shoes") {
    if (hem > sockTop + 0.01) {
      stops.push(sockTop);
      slots.push(HS.skin);
    }
  }
  if (hem < 1.5) {
    stops.push(Math.max(hem, (stops[stops.length - 1] ?? 0) + 0.01));
    slots.push(HS.legs);
  }
  const leg: BandSpec = { stops, slots };
  return { waist, chest, arm, leg, skin: HS.skin, top: topSlot, legs: legSlot, shoe: HS.shoe };
}

/** Gait and secondary-motion style for a spec. */
export function styleOf(spec: HumanSpec, hangs: HangSpec[]): HumanStyle {
  const f = spec.sex === "f";
  const age = spec.age ?? "adult";
  const k = age === "child" ? 0.64 : 1;
  const skirted = (spec.layers ?? []).some((l) => l.kind === "pollera" || l.kind === "skirt" || l.kind === "cushma");
  return {
    walkCycle: (f ? 0.85 : 0.95) * k * (age === "elder" ? 0.85 : 1),
    runCycle: (f ? 1.8 : 2.0) * k,
    walkSpeed: (f ? 1.05 : 1.25) * (age === "child" ? 0.85 : age === "elder" ? 0.8 : 1),
    runSpeed: (f ? 3.0 : 3.4) * (age === "child" ? 0.8 : 1),
    armSwing: f ? 0.35 : 0.5,
    armOut: skirted ? 0.08 : 0.05,
    hipSway: f ? 1.5 : 1,
    stance: (f ? 0.085 : 0.095) * k,
    stoop: age === "elder" ? 0.14 : 0,
    hangs,
  };
}

/** Worn pieces implied by the spec (a belt's buckle, a polo's placket, a jacket's zip, cargo pockets). */
function wornOf(spec: HumanSpec): Set<WornKind> {
  const w = new Set<WornKind>(spec.worn ?? []);
  const top = topOf(spec);
  if (top.belt) w.add("buckle");
  if (top.kind === "polo") w.add("placket");
  if (top.kind === "jacket" || top.kind === "windbreaker") w.add("zip");
  if (spec.bottom === "cargo") w.add("pockets");
  if ((spec.layers ?? []).some((l) => l.kind === "poncho")) w.add("collar-ring");
  return w;
}

function clothOf(spec: HumanSpec): Set<string> {
  const c = new Set<string>();
  if (topOf(spec).kind === "unku") c.add("skirt");
  for (const l of spec.layers ?? []) {
    if (l.kind === "poncho") c.add("poncho");
    if (l.kind === "pollera" || l.kind === "skirt" || l.kind === "cushma") c.add("skirt");
  }
  return c;
}

// Spring chains (./spring.ts) of the extra bones: stiffness, damping, how far motion and drag tip them.
const tasselHang = (sd: string): HangSpec => ({
  bones: [`tassel${sd}0`, `tassel${sd}1`],
  dir: "down",
  k: 45,
  zeta: 0.22,
  gainAcc: 0.04,
  gainVel: 0.22,
  limit: 1.0,
  hipSway: 0.4,
});
const braidHang = (sd: string): HangSpec => ({
  bones: [`braid${sd}0`, `braid${sd}1`, `braid${sd}2`],
  dir: "down",
  k: 28,
  zeta: 0.25,
  gainAcc: 0.03,
  gainVel: 0.08,
  limit: 0.7,
  hipSway: 0.5,
});

/** The spring chains of a spec's extra bones (LOD independent: every LOD has the same skeleton). */
export function hangsOf(spec: HumanSpec): HangSpec[] {
  const h: HangSpec[] = [];
  if (spec.hat === "chullo")
    h.push(
      { bones: ["tip"], dir: "up", k: 70, zeta: 0.3, gainAcc: 0.03, gainVel: 0.1, limit: 0.5 },
      { bones: ["pompom"], dir: "up", k: 90, zeta: 0.25, gainAcc: 0.02, gainVel: 0.06, limit: 0.4 },
      tasselHang("L"),
      tasselHang("R"),
    );
  if (spec.hair === "braids") h.push(braidHang("L"), braidHang("R"));
  if (spec.hair === "long")
    h.push({
      bones: ["hairB0", "hairB1"],
      dir: "down",
      k: 34,
      zeta: 0.3,
      gainAcc: 0.025,
      gainVel: 0.06,
      limit: 0.5,
      hipSway: 0.4,
    });
  if (spec.hair === "ponytail")
    h.push({
      bones: ["tail0"],
      dir: "down",
      k: 40,
      zeta: 0.25,
      gainAcc: 0.03,
      gainVel: 0.08,
      limit: 0.7,
      hipSway: 0.4,
    });
  const cloth = clothOf(spec);
  if (cloth.has("poncho"))
    h.push({
      bones: ["poncho"],
      dir: "down",
      k: 40,
      zeta: 0.45,
      gainAcc: 0.015,
      gainVel: 0.06,
      limit: 0.35,
      hipSway: 0.3,
    });
  if (cloth.has("skirt"))
    h.push({
      bones: ["skirt"],
      dir: "down",
      k: 32,
      zeta: 0.35,
      gainAcc: 0.012,
      gainVel: 0.04,
      limit: 0.22,
      hipSway: 1.2,
    });
  const w = wornOf(spec);
  if (w.has("backpack") || w.has("daypack"))
    h.push({ bones: ["pack"], dir: "down", k: 110, zeta: 0.35, gainAcc: 0.012, gainVel: 0.01, limit: 0.15 });
  return h;
}

export interface HumanRig {
  bones: BoneDef[];
  hangs: HangSpec[];
  style: HumanStyle;
  face: number;
  opts: HumanOpts;
}

/** Skeleton, springs, gait style and face row of a spec, without building any geometry (instant). */
export function rigOf(spec: HumanSpec): HumanRig {
  const o = bodyOpts(spec);
  const k = o.scale;
  const hk = o.head ?? 1;
  // Head centre before the bones exist (same formula as ./human.ts).
  const hc: Vec3 = [0, (1.28 + 0.15 * hk) * k, 0];
  const s = hk * k;
  const rows = [
    ...humanSkeletonRows(o),
    ...(spec.hat ? hatBones(spec.hat, hc, s) : []),
    ...hairBones(spec.hair, hc, s, k),
    ...clothBones(clothOf(spec), k),
    ...wornBones(wornOf(spec), k),
  ];
  const bones = skeleton(rows);
  if (bones.length > 32) throw new Error(`characters: ${bones.length} bones (max 32)`);
  const hangs = hangsOf(spec);
  return { bones, hangs, style: styleOf(spec, hangs), face: faceOf(spec), opts: o };
}

/** Compose an archetype: skeleton, pieces at this LOD, spring chains, gait style and face row. */
export function composeHuman(spec: HumanSpec, lod: Lod = 0): Composed {
  const rig = rigOf(spec);
  const o = rig.opts;
  const k = o.scale;
  const hk = o.head ?? 1;
  const bones = rig.bones;
  const layers = spec.layers ?? [];
  const top = topOf(spec);
  const wornKinds = wornOf(spec);
  const body = humanBody(o, bones, bodyPaint(spec));
  const prims = prepare(body.prims);
  const torsoPrims = prepare(body.torsoPrims.map((i) => body.prims[i] as Prim));
  const ctx: WearCtx = {
    bones,
    b: (n) => boneIndex(bones, n),
    k,
    hk,
    hw: o.hips,
    sw: o.shoulders,
    field: makeField(prims),
    torso: makeField(torsoPrims),
    head: makeField(prepare(body.headPrims.map((i) => body.prims[i] as Prim))),
    hc: body.head.c,
    hr: body.head.r,
    lod,
    q: LOD_Q[lod] as number,
  };
  const pieces: Piece[] = [
    {
      kind: "field",
      name: "body",
      prims: body.prims,
      h: 0.02 * (LOD_H[lod] as number) * Math.min(1, Math.max(0.75, k)),
      bands: body.bands,
      faces: spec.hideFace ? [] : [body.face],
      relax: 2,
    },
  ];
  const take = (w: { pieces: Piece[] }) => {
    pieces.push(...w.pieces);
  };
  const overBack = layers.some((l) => l.kind === "lliclla")
    ? 0.035
    : layers.some((l) => l.kind === "poncho")
      ? 0.03
      : 0.012;
  const brim = spec.hat !== undefined && !NO_BRIM.has(spec.hat);
  take(hair(ctx, spec.hair, { over: overBack, underBrim: brim }));
  if (spec.beard) pieces.push(beard(ctx, spec.beard));
  if (spec.extra?.length) pieces.push(...extraPieces(ctx, spec.extra));
  if (top.kind === "unku" && !layers.some((l) => l.kind === "cushma"))
    pieces.push(
      skirt(ctx, {
        name: "unku",
        top: 0.98,
        hem: 0.44,
        off: 0.03,
        flare: 0.2,
        pleats: 4,
        pleatK: 0.25,
        group: "wrap",
        region: "pollera",
        flex: 0.5,
      }),
    );
  if (spec.hat) take(hat(ctx, spec.hat));
  for (const w of wornKinds) take(worn(ctx, w));
  if (spec.feet === "ojotas" || spec.feet === "sandals") pieces.push(...sandals(ctx, spec.feet));
  for (const l of layers) {
    switch (l.kind) {
      case "poncho":
        pieces.push(poncho(ctx, l));
        break;
      case "pollera": {
        const hem = l.hem ?? 0.44;
        if ((l.tiers ?? 2) === 2)
          pieces.push(
            skirt(ctx, {
              name: "pollera-under",
              hem: hem - 0.17,
              off: 0.01,
              flare: 0.41,
              base: HS.accent2,
              group: l.group ?? "skirt",
              region: l.region ?? "pollera",
            }),
          );
        pieces.push(
          skirt(ctx, {
            name: "pollera",
            hem,
            off: 0.036,
            flare: 0.47,
            group: l.group ?? "skirt",
            region: l.region ?? "pollera",
          }),
        );
        break;
      }
      case "skirt":
        pieces.push(
          skirt(ctx, {
            name: "skirt",
            hem: l.hem ?? 0.24,
            off: 0.022,
            flare: l.flare ?? 0.12,
            pleats: l.pleats ?? 6,
            pleatK: 0.35,
            group: l.group ?? "skirt",
            region: l.region ?? "kene",
            flex: 0.6,
          }),
        );
        break;
      case "cushma":
        pieces.push(
          skirt(ctx, {
            name: "cushma",
            top: 0.98,
            hem: l.hem ?? 0.26,
            off: 0.03,
            flare: 0.16,
            pleats: 5,
            pleatK: 0.3,
            group: "wrap",
            region: "stripes",
            flex: 0.6,
          }),
        );
        break;
      case "lliclla":
        pieces.push(lliclla(ctx, l));
        break;
      case "apron":
        pieces.push(apron(ctx, l));
        break;
      case "vest":
        pieces.push(vest(ctx, l));
        break;
    }
  }
  const out = lod >= 2 ? pieces.map(foldCloth) : pieces;
  return { ...rig, pieces: out };
}

/** Far LOD: a cloth piece becomes part of the body draw (its base colour, single-sided, no wind). */
function foldCloth(p: Piece): Piece {
  if (p.kind !== "grid" || p.layer !== "cloth") return p;
  const out: GridPiece = { kind: "grid", name: p.name, grid: p.grid, layer: "body", skin: p.skin, paint: p.paint };
  if (p.shade) out.shade = p.shade;
  return out;
}

/** World extra shapes: one rigid field piece per bone (scaled with the body). */
function extraPieces(ctx: WearCtx, list: readonly ExtraPrim[]): Piece[] {
  const k = ctx.k;
  const byBone = new Map<string, Prim[]>();
  const S = (v: Vec3): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  for (const e of list) {
    const bone = ctx.b(e.bone);
    const sh = e.shape;
    const shape: Prim["shape"] =
      sh.kind === "cone"
        ? { kind: "cone", a: S(sh.a), b: S(sh.b), ra: sh.ra * k, rb: sh.rb * k }
        : sh.kind === "ellipsoid"
          ? { kind: "ellipsoid", c: S(sh.c), r: S(sh.r), ...(sh.rot ? { rot: sh.rot } : {}) }
          : { kind: "box", c: S(sh.c), h: S(sh.h), round: sh.round * k, ...(sh.rot ? { rot: sh.rot } : {}) };
    const prim: Prim = {
      shape,
      bone,
      blend: (e.blend ?? 0.02) * k,
      slot: e.slot,
      ...(e.carve ? { carve: true } : {}),
      ...(e.wool && ctx.lod < 2 ? { wool: e.wool * k, woolFreq: (e.woolFreq ?? 30) / k } : {}),
    };
    const arr = byBone.get(e.bone) ?? [];
    arr.push(prim);
    byBone.set(e.bone, arr);
  }
  return [...byBone.entries()].map(([name, prims]) => ({
    kind: "field" as const,
    name: `extra-${name}`,
    prims,
    h: 0.02 * (LOD_H[ctx.lod] as number) * Math.min(1, Math.max(0.75, k)),
    rigid: ctx.b(name),
    woolNormal: 0.4,
  }));
}

/** Hats without a brim over the forehead (bangs still show under them). */
const NO_BRIM = new Set<HatKind>(["chullo", "headband", "headband-plume", "feather-crown"]);

/** Every slot a cloth group uses (for palette checks). */
export const clothSlots = (g: ClothGroup) => CLOTH_GROUPS[g];
