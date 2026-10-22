/**
 * The shared human: skeleton, body field and face placement for every new biped (the traveler, the campesina,
 * and later the people of the worlds). Proportions are about 3 heads tall with the hat on (≈ 3.8 bare-headed,
 * a stylised adult, not a chibi): a slightly smaller head than the old characters, a visible neck and
 * shoulders, a longer torso and legs, tapered limbs (thigh > calf, upper arm > forearm) and mitten hands with
 * a thumb.
 *
 * The body is ONE field (./sdf.ts): torso ellipsoids, round-cone limbs and a two-ellipsoid head, smooth-unioned
 * so shoulders, hips, elbows and knees blend into each other. Arms are posed slightly away from the body (a
 * relaxed A pose) so the field never bridges a forearm to a hip.
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
  /** Feet: hiking boots (traveler) or bare feet for ojotas (campesina). */
  feet: "boots" | "bare";
}

/** Palette slots the body uses (the archetype's palette maps them to colours). */
export interface HumanSlots {
  skin: number;
  top: number;
  /** Trousers / legs. */
  legs: number;
  boot: number;
  cuff: number;
  sole: number;
  /** Sleeve cuff (embroidered band on the campesina's jobona; the sweater's own colour otherwise). */
  sleeveCuff: number;
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
  face: FaceMap;
  /** Head centre and radii (hair, hats and the chullo hug it). */
  head: { c: Vec3; r: Vec3 };
}

/** The body field. `bones` must contain HUMAN_BONES (any order, extra bones allowed). */
export function humanBody(o: HumanOpts, bones: BoneDef[], slot: HumanSlots): HumanBody {
  const k = o.scale;
  const b = (n: string) => boneIndex(bones, n);
  const P = (v: Vec3): Vec3 => S(v, k);
  const sw = o.shoulders;
  const hw = o.hips;
  const prims: Prim[] = [];
  const add = (p: Prim) => {
    prims.push(p);
    return prims.length - 1;
  };
  const e = (c: Vec3, r: Vec3, bone: string, blend: number, s = slot.top, rot?: ReturnType<typeof rotX>): Prim => ({
    shape: { kind: "ellipsoid", c: P(c), r: S(r, k), ...(rot ? { rot } : {}) },
    bone: b(bone),
    blend: blend * k,
    slot: s,
  });
  const cone = (a: Vec3, c: Vec3, ra: number, rb: number, bone: string, blend: number, s = slot.top): Prim => ({
    shape: { kind: "cone", a: P(a), b: P(c), ra: ra * k, rb: rb * k },
    bone: b(bone),
    blend: blend * k,
    slot: s,
  });

  // ---- torso: pelvis, waist, chest, shoulder line (clavicles), neck
  const pelvis = add(e([0, 0.79, 0], [0.145 * hw, 0.1, 0.11], "hips", 0, slot.legs));
  const waist = add(e([0, 0.91, 0.004], [0.135 * (hw + sw) * 0.5, 0.11, 0.1], "spine", 0.06));
  const chest = add(e([0, 1.04, 0.004], [0.158 * sw, 0.13, 0.105 * o.chest], "chest", 0.06));
  const clav: number[] = [];
  const clavL = cone([0, 1.13, -0.012], [0.165 * sw, 1.115, -0.015], 0.075, 0.062, "clavL", 0.05);
  clav.push(add(clavL), add(mirrorX(clavL, b("clavR"))));
  const neck = add(cone([0, 1.15, -0.012], [0, 1.3, 0.0], 0.054, 0.05, "neck", 0.035, slot.skin));

  // ---- head: cranium + softer jaw/cheeks, a small nose, ears
  const headC: Vec3 = [0, 1.43, 0];
  const headR: Vec3 = [0.222, 0.215, 0.205];
  const cranium = add(e(headC, headR, "head", 0.03, slot.skin));
  const jaw = add(e([0, 1.33, 0.034], [0.158, 0.112, 0.148], "head", 0.075, slot.skin));
  const earL = e([0.2, 1.39, -0.01], [0.022, 0.042, 0.03], "head", 0.02, slot.skin);
  const ears = [add(earL), add(mirrorX(earL, b("head")))];

  // ---- arms: tapered upper arm and forearm, mitten hand with a thumb (left, then mirrored)
  const ax = 0.18 * sw;
  const armL = [
    cone([ax - 0.012, 1.125, -0.015], [ax + 0.045, 0.89, -0.025], 0.056, 0.044, "armL", 0.03),
    cone([ax + 0.045, 0.89, -0.025], [ax + 0.066, 0.69, -0.008], 0.045, 0.035, "foreL", 0.025),
    // Hand: a flattened mitten (palm facing in), fingers rounded, thumb forward.
    {
      shape: { kind: "box", c: P([ax + 0.07, 0.615, 0.004]), h: S([0.024, 0.062, 0.042], k), round: 0.023 * k },
      bone: b("handL"),
      blend: 0.022 * k,
      slot: slot.skin,
    } as Prim,
    cone([ax + 0.064, 0.652, 0.036], [ax + 0.066, 0.612, 0.066], 0.019, 0.017, "handL", 0.012, slot.skin),
  ];
  const armIdx: number[] = [];
  for (const p of armL) armIdx.push(add(p));
  const rName: Record<string, string> = { armL: "armR", foreL: "foreR", handL: "handR" };
  for (const p of armL) {
    const name = bones[p.bone]?.name ?? "";
    armIdx.push(add(mirrorX(p, b(rName[name] ?? name))));
  }

  // ---- legs: thigh > calf, a calf bulge, then boots or bare feet
  const lx = 0.088 * hw;
  const legL: Prim[] = [
    cone([lx, 0.77, 0], [0.095 * hw, 0.43, 0.006], 0.083, 0.058, "thighL", 0.04, slot.legs),
    cone([0.095 * hw, 0.43, 0.006], [0.1 * hw, 0.11, -0.01], 0.056, 0.04, "shinL", 0.03, slot.legs),
    e([0.097 * hw, 0.33, -0.014], [0.052, 0.085, 0.05], "shinL", 0.035, slot.legs),
  ];
  if (o.feet === "boots") {
    // A sturdy rounded hiking boot: shaft, foot, toe cap.
    legL.push(cone([0.1 * hw, 0.19, -0.008], [0.1 * hw, 0.07, 0.0], 0.06, 0.062, "footL", 0.025, slot.boot), {
      shape: { kind: "box", c: P([0.1 * hw, 0.048, 0.035]), h: S([0.056, 0.048, 0.105], k), round: 0.044 * k },
      bone: b("footL"),
      blend: 0.03 * k,
      slot: slot.boot,
    });
  } else {
    // Bare foot for ojotas: a slim instep and soft toes.
    legL.push(
      e([0.1 * hw, 0.05, 0.03], [0.042, 0.04, 0.095], "footL", 0.035, slot.skin),
      e([0.1 * hw, 0.03, 0.095], [0.04, 0.024, 0.04], "footL", 0.02, slot.skin),
    );
  }
  const legIdx: number[] = [];
  for (const p of legL) legIdx.push(add(p));
  const lName: Record<string, string> = { thighL: "thighR", shinL: "shinR", footL: "footR" };
  for (const p of legL) {
    const name = bones[p.bone]?.name ?? "";
    legIdx.push(add(mirrorX(p, b(lName[name] ?? name))));
  }

  // ---- colour bands (crisp cuts): collar and waist on the torso, wrist cuffs, boot tops / ankles
  const bands: Band[] = [
    {
      prims: [pelvis, waist, chest, ...clav, neck],
      at: (p) => p[1] / k,
      stops: [0.845, 1.172],
      slots: [slot.legs, slot.top, slot.skin],
    },
    {
      // Along each forearm: sleeve → cuff → skin at the wrist.
      prims: armIdx,
      at: (p) => p[1] / k,
      stops: [0.69, 0.715],
      slots: [slot.skin, slot.sleeveCuff, slot.top],
    },
    o.feet === "boots"
      ? {
          prims: legIdx,
          at: (p) => p[1] / k,
          stops: [0.016, 0.17, 0.205],
          slots: [slot.sole, slot.boot, slot.cuff, slot.legs],
        }
      : { prims: legIdx, at: (p) => p[1] / k, stops: [0.5], slots: [slot.skin, slot.legs] },
  ];

  const headPrims = [cranium, jaw, ...ears];
  const face: FaceMap = {
    origin: P([0, 1.37, 0.2]),
    right: [1, 0, 0],
    up: [0, 1, 0],
    fwd: [0, 0, 1],
    w: 0.3 * k,
    h: 0.3 * k,
  };
  return { prims, bands, headPrims, face, head: { c: P(headC), r: S(headR, k) } };
}

export type { BoneDef };
export { boneIndex, skeleton };
