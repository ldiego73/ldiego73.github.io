/**
 * The shared human: skeleton, body field and face placement for every biped (the traveler and the people of
 * every world, built from ./archetype.ts specs). Proportions are about 3 heads tall with the hat on (≈ 3.8
 * bare-headed, a stylised adult, not a chibi): a visible neck and shoulders, a longer torso and legs, tapered
 * limbs (thigh > calf, upper arm > forearm) and mitten hands with a thumb. Children are the same body scaled
 * down with a larger head (`head`), elders a little narrower; `limb` and `belly` give slim, sturdy or heavy
 * builds without new code.
 *
 * The body is ONE field (./sdf.ts): torso ellipsoids, round-cone limbs and a two-ellipsoid head, smooth-unioned
 * so shoulders, hips, elbows and knees blend into each other. Arms are posed slightly away from the body (a
 * relaxed A pose) so the field never bridges a forearm to a hip.
 *
 * Colour comes from `BodyPaint`: crisp bands (./paint.ts) along the torso (trousers | top | collar | skin), the
 * arms (skin | cuff | sleeve) and the legs (sole | shoe | sock | bare | trousers), at heights the garments pick
 * (a short sleeve ends at the elbow, shorts above the knee, a boot top at the calf).
 *
 * Bind pose: origin at the feet, facing +Z, the character's left is +X, every bone world aligned.
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type FaceMap, skeleton } from "./build";
import type { Band } from "./paint";
import { mirrorX, type Prim, type rotX, type Vec3 } from "./sdf";

export interface HumanOpts {
  /** Uniform size (1 = the traveler, ≈ 1.63 u to the crown). */
  scale: number;
  /** Shoulder and hip half widths relative to the traveler's. */
  shoulders: number;
  hips: number;
  /** Chest depth/fullness (1 neutral). */
  chest: number;
  /** Feet: hiking boots, low shoes, or bare feet (for ojotas, sandals or none). */
  feet: "boots" | "shoes" | "bare";
  /** Head size relative to the body (1 adult; children ≈ 1.25). */
  head?: number;
  /** Limb thickness (1 neutral; slim 0.92, sturdy 1.08). */
  limb?: number;
  /** Waist fullness (1 neutral). */
  belly?: number;
}

/** A band along one body region: increasing stops (heights, unscaled body units) and the slots between. */
export interface BandSpec {
  stops: number[];
  slots: number[];
  /** Custom scalar (default the height over the scale): zig-zag yokes, vertical stripes. */
  at?: (p: Vec3) => number;
}

/** How the body is coloured (./archetype.ts derives it from the garments). */
export interface BodyPaint {
  /** Pelvis and waist (trousers | belt | top). */
  waist: BandSpec;
  /** Chest, shoulders and neck (top | yoke | collar | skin). */
  chest: BandSpec;
  arm: BandSpec;
  leg: BandSpec;
  /** Slot of the body's skin (head, hands, bare feet). */
  skin: number;
  /** Default slot of the torso and arm primitives (outside any band). */
  top: number;
  /** Default slot of the legs. */
  legs: number;
  /** Shoe slot (boots and shoes primitives). */
  shoe: number;
}

export const HUMAN_BONES = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "clavL",
  "armL",
  "foreL",
  "handL",
  "clavR",
  "armR",
  "foreR",
  "handR",
  "thighL",
  "shinL",
  "footL",
  "thighR",
  "shinR",
  "footR",
] as const;

const S = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** Bone rows of the human skeleton (extra bones for hats, braids, tassels and cloth are appended by archetypes). */
export function humanSkeletonRows(o: HumanOpts): Array<readonly [string, string | null, Vec3]> {
  const k = o.scale;
  const sw = o.shoulders;
  const hw = o.hips;
  const rows: Array<readonly [string, string | null, Vec3]> = [
    ["root", null, [0, 0, 0]],
    ["hips", "root", S([0, 0.8, 0], k)],
    ["spine", "hips", S([0, 0.92, 0], k)],
    ["chest", "spine", S([0, 1.06, 0], k)],
    ["neck", "chest", S([0, 1.19, -0.005], k)],
    ["head", "neck", S([0, 1.27, 0], k)],
  ];
  for (const [s, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    rows.push(
      [`clav${s}`, "chest", S([0.03 * side * sw, 1.15, -0.01], k)],
      [`arm${s}`, `clav${s}`, S([0.18 * side * sw, 1.13, -0.015], k)],
      [`fore${s}`, `arm${s}`, S([(0.18 * sw + 0.045) * side, 0.89, -0.025], k)],
      [`hand${s}`, `fore${s}`, S([(0.18 * sw + 0.068) * side, 0.68, -0.01], k)],
    );
  }
  for (const [s, side] of [
    ["L", 1],
    ["R", -1],
  ] as const)
    rows.push(
      [`thigh${s}`, "hips", S([0.088 * side * hw, 0.76, 0], k)],
      [`shin${s}`, `thigh${s}`, S([0.095 * side * hw, 0.43, 0.005], k)],
      [`foot${s}`, `shin${s}`, S([0.1 * side * hw, 0.085, -0.01], k)],
    );
  return rows;
}

export interface HumanBody {
  prims: Prim[];
  bands: Band[];
  /** Primitive indices of the head (face decal, hair). */
  headPrims: number[];
  /** Primitive indices of the torso (pelvis, waist, chest, clavicles, neck). */
  torsoPrims: number[];
  face: FaceMap;
  /** Head centre and radii (hair, hats and the chullo hug it). */
  head: { c: Vec3; r: Vec3 };
}

/** The traveler's colouring with its old slot numbers (kept for archetypes built before ./archetype.ts). */
export interface HumanSlots {
  skin: number;
  top: number;
  legs: number;
  boot: number;
  cuff: number;
  sole: number;
  sleeveCuff: number;
}

/** Classic paint (long sleeves with a cuff, trousers into boots or bare calves) from a slot set. */
export function classicPaint(o: HumanOpts, s: HumanSlots): BodyPaint {
  return {
    skin: s.skin,
    top: s.top,
    legs: s.legs,
    shoe: s.boot,
    waist: { stops: [0.845], slots: [s.legs, s.top] },
    chest: { stops: [1.172], slots: [s.top, s.skin] },
    arm: { stops: [0.69, 0.715], slots: [s.skin, s.sleeveCuff, s.top] },
    leg:
      o.feet === "bare"
        ? { stops: [0.5], slots: [s.skin, s.legs] }
        : { stops: [0.016, 0.17, 0.205], slots: [s.sole, s.boot, s.cuff, s.legs] },
  };
}

/** The body field. `bones` must contain HUMAN_BONES (any order, extra bones allowed). */
export function humanBody(o: HumanOpts, bones: BoneDef[], paintIn: BodyPaint | HumanSlots): HumanBody {
  const paint: BodyPaint = "waist" in paintIn ? paintIn : classicPaint(o, paintIn);
  const k = o.scale;
  const hk = o.head ?? 1;
  const lk = o.limb ?? 1;
  const b = (n: string) => boneIndex(bones, n);
  const P = (v: Vec3): Vec3 => S(v, k);
  const sw = o.shoulders;
  const hw = o.hips;
  const prims: Prim[] = [];
  const add = (p: Prim) => {
    prims.push(p);
    return prims.length - 1;
  };
  const e = (c: Vec3, r: Vec3, bone: string, blend: number, s = paint.top, rot?: ReturnType<typeof rotX>): Prim => ({
    shape: { kind: "ellipsoid", c: P(c), r: S(r, k), ...(rot ? { rot } : {}) },
    bone: b(bone),
    blend: blend * k,
    slot: s,
  });
  const cone = (a: Vec3, c: Vec3, ra: number, rb: number, bone: string, blend: number, s = paint.top): Prim => ({
    shape: { kind: "cone", a: P(a), b: P(c), ra: ra * k, rb: rb * k },
    bone: b(bone),
    blend: blend * k,
    slot: s,
  });

  // ---- torso: pelvis, waist, chest, shoulder line (clavicles), neck
  const pelvis = add(e([0, 0.79, 0], [0.145 * hw, 0.1, 0.11], "hips", 0, paint.legs));
  const belly = o.belly ?? 1;
  const waist = add(e([0, 0.91, 0.004], [0.135 * (hw + sw) * 0.5 * belly, 0.11, 0.1 * belly], "spine", 0.06));
  const chest = add(e([0, 1.04, 0.004], [0.158 * sw, 0.13, 0.105 * o.chest], "chest", 0.06));
  const clav: number[] = [];
  const clavL = cone([0, 1.13, -0.012], [0.165 * sw, 1.115, -0.015], 0.075, 0.062 * lk, "clavL", 0.05);
  clav.push(add(clavL), add(mirrorX(clavL, b("clavR"))));
  const neck = add(cone([0, 1.15, -0.012], [0, 1.3, 0.0], 0.054, 0.05, "neck", 0.035, paint.skin));

  // ---- head: cranium + softer jaw/cheeks, ears; scaled about the top of the neck by `head`
  const base: Vec3 = [0, 1.28, 0];
  const H = (v: Vec3): Vec3 => [base[0] + v[0] * hk, base[1] + v[1] * hk, base[2] + v[2] * hk];
  const headC = H([0, 0.15, 0]);
  const headR: Vec3 = [0.222 * hk, 0.215 * hk, 0.205 * hk];
  const cranium = add(e(headC, headR, "head", 0.03, paint.skin));
  const jaw = add(e(H([0, 0.05, 0.034]), [0.158 * hk, 0.112 * hk, 0.148 * hk], "head", 0.075, paint.skin));
  const earL = e(H([0.2, 0.11, -0.01]), [0.022 * hk, 0.042 * hk, 0.03 * hk], "head", 0.02, paint.skin);
  const ears = [add(earL), add(mirrorX(earL, b("head")))];

  // ---- arms: tapered upper arm and forearm, mitten hand with a thumb (left, then mirrored)
  const ax = 0.18 * sw;
  const armL = [
    cone([ax - 0.012, 1.125, -0.015], [ax + 0.045, 0.89, -0.025], 0.056 * lk, 0.044 * lk, "armL", 0.03),
    cone([ax + 0.045, 0.89, -0.025], [ax + 0.066, 0.69, -0.008], 0.045 * lk, 0.035 * lk, "foreL", 0.025),
    // Hand: a flattened mitten (palm facing in), fingers rounded, thumb forward.
    {
      shape: {
        kind: "box",
        c: P([ax + 0.07, 0.615, 0.004]),
        h: S([0.024 * lk, 0.062, 0.042 * lk], k),
        round: 0.023 * k * lk,
      },
      bone: b("handL"),
      blend: 0.022 * k,
      slot: paint.skin,
    } as Prim,
    cone([ax + 0.064, 0.652, 0.036], [ax + 0.066, 0.612, 0.066], 0.019 * lk, 0.017 * lk, "handL", 0.012, paint.skin),
  ];
  const armIdx: number[] = [];
  for (const p of armL) armIdx.push(add(p));
  const rName: Record<string, string> = { armL: "armR", foreL: "foreR", handL: "handR" };
  for (const p of armL) {
    const name = bones[p.bone]?.name ?? "";
    armIdx.push(add(mirrorX(p, b(rName[name] ?? name))));
  }

  // ---- legs: thigh > calf, a calf bulge, then boots, shoes or bare feet
  const lx = 0.088 * hw;
  const legL: Prim[] = [
    cone([lx, 0.77, 0], [0.095 * hw, 0.43, 0.006], 0.083 * lk, 0.058 * lk, "thighL", 0.04, paint.legs),
    cone([0.095 * hw, 0.43, 0.006], [0.1 * hw, 0.11, -0.01], 0.056 * lk, 0.04 * lk, "shinL", 0.03, paint.legs),
    e([0.097 * hw, 0.33, -0.014], [0.052 * lk, 0.085, 0.05 * lk], "shinL", 0.035, paint.legs),
  ];
  if (o.feet === "boots" || o.feet === "shoes") {
    // A rounded boot: shaft (hiking boots only), foot, toe cap.
    if (o.feet === "boots")
      legL.push(cone([0.1 * hw, 0.19, -0.008], [0.1 * hw, 0.07, 0.0], 0.06, 0.062, "footL", 0.025, paint.shoe));
    legL.push({
      shape: {
        kind: "box",
        c: P([0.1 * hw, o.feet === "boots" ? 0.048 : 0.04, 0.035]),
        h: S([0.056, o.feet === "boots" ? 0.048 : 0.04, 0.105], k),
        round: 0.04 * k,
      },
      bone: b("footL"),
      blend: 0.03 * k,
      slot: paint.shoe,
    });
  } else {
    // Bare foot (for ojotas and sandals): a slim instep and soft toes.
    legL.push(
      e([0.1 * hw, 0.05, 0.03], [0.042, 0.04, 0.095], "footL", 0.035, paint.skin),
      e([0.1 * hw, 0.03, 0.095], [0.04, 0.024, 0.04], "footL", 0.02, paint.skin),
    );
  }
  const legIdx: number[] = [];
  for (const p of legL) legIdx.push(add(p));
  const lName: Record<string, string> = { thighL: "thighR", shinL: "shinR", footL: "footR" };
  for (const p of legL) {
    const name = bones[p.bone]?.name ?? "";
    legIdx.push(add(mirrorX(p, b(lName[name] ?? name))));
  }

  // ---- colour bands (crisp cuts)
  const yk = (p: Vec3) => p[1] / k;
  const band = (prims: number[], s: BandSpec): Band => ({
    prims,
    at: s.at ?? yk,
    stops: s.stops,
    slots: s.slots,
  });
  const bands: Band[] = [
    band([pelvis, waist], paint.waist),
    band([chest, ...clav, neck], paint.chest),
    band(armIdx, paint.arm),
    band(legIdx, paint.leg),
  ];

  const headPrims = [cranium, jaw, ...ears];
  const face: FaceMap = {
    origin: P(H([0, 0.09, 0.2])),
    right: [1, 0, 0],
    up: [0, 1, 0],
    fwd: [0, 0, 1],
    w: 0.3 * k * hk,
    h: 0.3 * k * hk,
  };
  return {
    prims,
    bands,
    headPrims,
    torsoPrims: [pelvis, waist, chest, ...clav, neck],
    face,
    head: { c: P(headC), r: S(headR, k) },
  };
}

export type { BoneDef };
export { boneIndex, skeleton };
