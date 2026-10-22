/**
 * Mammals other than camelids, all from ./shape.ts proportions plus their own touches:
 *
 *   equids      horse (the Peruvian Paso: arched neck, near-vertical face, long mane and tail, bay with black
 *               points and a star), mule (long ears, short upright mane, tufted tail, pale muzzle), donkey
 *   felines     puma (tawny, pale muzzle, black tail tip), jaguar / otorongo (rosettes as noise iso-bands)
 *   canid       Andean fox / culpeo (grizzled back, rufous head and legs, bushy black-tipped tail)
 *   ursid       spectacled bear / ukuku (black, cream muzzle and spectacles)
 *   rodents     vizcacha (long ears, curled tail, sits up), capybara / ronsoco, agouti / añuje, cuy
 *   others      collared peccary / sajino (pale collar), lowland tapir / sachavaca (short trunk), taruca
 *               (Andean deer, antlers), squirrel monkey / fraile, three-toed sloth / perezoso
 *
 * The predators' and the bear's eyes are calm on purpose: round pupils, soft lids, no bared teeth.
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "../../sdf";
import type { Kit } from "../kit";
import { lerp3, quad3 } from "../kit";
import { Q, type QuadPlan, quadKit } from "../plan-quad";
import { type AnimalSpec, type EyeStyle, type QuadMotion, recolor } from "../spec";
import { type QuadShape, shapePlan } from "./shape";

/** A quadruped palette from named colours (missing slots fall back sensibly). */
export function qpal(c: {
  coat: string;
  hair?: string;
  hoof?: string;
  nose?: string;
  belly?: string;
  points?: string;
  spot?: string;
  spot2?: string;
  mask?: string;
  inner?: string;
  accent?: string;
}): string[] {
  return [
    c.coat,
    c.hair ?? c.coat,
    c.hoof ?? "#2a221e",
    c.nose ?? "#3a2c28",
    c.belly ?? c.coat,
    c.points ?? "#231915",
    c.spot ?? c.coat,
    c.spot2 ?? c.coat,
    c.mask ?? "#f2ece2",
    c.inner ?? "#c9a99a",
    c.accent ?? "#c4383f",
    "#5a2424",
    "#c2456b",
    "#e07a3a",
    "#2a9d8f",
    "#8a6a4a",
  ];
}

const FUR = (wool: number, freq: number) => ({ wool, freq });

/** Build a species spec from a shape (most presets). */
function spec(
  o: Omit<AnimalSpec, "plan" | "family"> & {
    shape: QuadShape;
    h: number;
    tune?: (p: QuadPlan) => void;
    extra?: (k: Kit, p: QuadPlan) => void;
    woolNormal?: number;
  },
): AnimalSpec {
  const { shape, h, tune, extra, woolNormal, ...rest } = o;
  return {
    ...rest,
    family: "quad",
    plan: () => {
      const p = shapePlan(shape, h);
      tune?.(p);
      if (extra) {
        const prev = p.extra;
        p.extra = (k, pp) => {
          prev?.(k, pp);
          extra(k, pp);
        };
      }
      return { kit: quadKit(p), h, ...(woolNormal !== undefined ? { woolNormal } : {}) };
    },
  };
}

const quadMotion = (m: Partial<QuadMotion> & Pick<QuadMotion, "gaits">): QuadMotion => ({
  kind: "quad",
  idles: { weights: { look: 3, graze: 2, chew: 1, shake: 0.3, scratch: 0.3, sleep: 0.5 } },
  ...m,
});

// ---------------------------------------------------------------- eyes

const DARK_EYE: EyeStyle = {
  iris: "#1c120e",
  irisLow: "#6a4028",
  size: 0.42,
  aspect: 1,
  lid: "#1a110d",
  lidW: 8,
  lashes: 2,
};
const CAT_EYE = (iris: string, low: string): EyeStyle => ({
  iris,
  irisLow: low,
  pupil: "#1a120c",
  pupilK: 0.5,
  size: 0.5,
  aspect: 0.95,
  lid: "#2a1a12",
  lidW: 7,
});

// ---------------------------------------------------------------- equids

/** Mane: soft locks along the top of the neck (to one side for the Paso), a forelock on the brow. */
function mane(k: Kit, p: QuadPlan, o: { side: number; len: number; up: number; r: number; forelock: number }) {
  const n = p.neck;
  const bones = ["neck0", "neck0", "neck1", "neck1", "neck2", "neck2"];
  for (let i = 0; i < 6; i++) {
    const t = 0.08 + (i / 5) * 0.86;
    const a = quad3(n.a, n.ctrl, n.b, t);
    const up = n.r[0] + (n.r[1] - n.r[0]) * t;
    // Along the crest of the neck (up and back from its axis), falling to one side for a long mane.
    const c: Vec3 = [o.side * up * 0.55, a[1] + up * 0.72 + o.up, a[2] - up * 0.62];
    k.add(
      k.ell(
        c,
        [o.r * (o.side ? 1.2 : 0.55), o.len * (o.side ? 1.15 : 0.6), o.r * 1.3],
        bones[i] as string,
        o.r * 0.7,
        Q.points,
        FUR(o.r * 0.4, 1.2 / o.r),
      ),
      "mane",
    );
  }
  if (o.forelock) {
    const hc = p.head.c;
    k.add(
      k.ell(
        [0, hc[1] + p.head.r[1] * 0.75, hc[2] + p.head.r[2] * 0.25],
        [o.forelock * 0.8, o.forelock, o.forelock * 0.9],
        "head",
        o.forelock * 0.5,
        Q.points,
        FUR(o.forelock * 0.3, 1.5 / o.forelock),
      ),
    );
  }
}

function star(k: Kit, p: QuadPlan, r: number) {
  const hc = p.head.c;
  const c: Vec3 = [0, hc[1] + p.head.r[1] * 0.35, hc[2] + p.head.r[2] * 0.85];
  k.bands.push({
    prims: k.group("head"),
    at: (q) => Math.hypot(q[0] - c[0], q[1] - c[1], (q[2] - c[2]) * 0.6) - r,
    stops: [0],
    slots: [Q.mask, Q.coat],
  });
}

const EQUID_GAITS = (s: number) => [
  { gait: "walk" as const, speed: 1.5 * s, stride: 1.7 * s },
  { gait: "trot" as const, speed: 3.6 * s, stride: 2.6 * s },
  { gait: "canter" as const, speed: 5.5 * s, stride: 3.2 * s },
  { gait: "gallop" as const, speed: 9 * s, stride: 4.6 * s },
];

const equidSlots = { head: Q.coat, legs: Q.coat, ears: Q.coat, muzzle: Q.coat, tail: Q.points };

/** The horse's proportions (the ride mount's tack is fitted to them: ../../../ambient/mount/). */
export const HORSE_SHAPE: QuadShape = {
  bodyY: 1.12,
  bodyR: [0.28, 0.32],
  half: 0.75,
  rumpUp: 0.02,
  neck: { len: 0.66, angle: 0.68, r: [0.2, 0.105], arch: 0.18 },
  head: { r: [0.085, 0.105, 0.125], muzzle: 0.34, mr: [0.085, 0.062], drop: 1.0, up: 0.1 },
  ears: { len: 0.14, w: 0.05, kind: "pointed", tilt: 0.12, back: 0.15 },
  tail: { len: 0.8, r: [0.07, 0.1], angle: -1.2, segs: 3, curl: -0.08 },
  legs: { r: [0.1, 0.058, 0.046, 0.062], knee: 0.45, hock: 0.45, hockBack: 0.14, mass: 1.35 },
  foot: "hoof",
  coat: FUR(0.003, 40),
  eye: { dir: [0.92, 0.32, 0.2], w: 0.075 },
  hoofY: 0.07,
  pointsY: 0.4,
};

export const HORSE = spec({
  key: "horse",
  name: { es: "caballo de paso", en: "Peruvian Paso horse" },
  latin: "Equus ferus caballus",
  size: 2.2,
  speeds: { walk: 1.5, run: 4, max: 9 },
  h: 0.03,
  shape: HORSE_SHAPE,
  tune: (p) => {
    p.slots = equidSlots;
    if (p.tail) p.tail.coat = FUR(0.035, 22);
  },
  extra: (k, p) => {
    // The Paso's long mane falls to one side; a forelock and a star on the forehead.
    mane(k, p, { side: -1, len: 0.12, up: -0.05, r: 0.05, forelock: 0.045 });
    star(k, p, 0.03);
  },
  palette: qpal({
    coat: "#7b4224",
    nose: "#3a2a24",
    points: "#231915",
    hoof: "#2a211b",
    mask: "#efe6d6",
    belly: "#7b4224",
  }),
  variants: {
    bay: qpal({ coat: "#7b4224", nose: "#3a2a24", points: "#231915", hoof: "#2a211b", mask: "#efe6d6" }),
    chestnut: qpal({ coat: "#9a5530", nose: "#4a302a", points: "#7a3e22", hoof: "#3a2a20", mask: "#efe6d6" }),
    black: qpal({ coat: "#2a2220", nose: "#1e1816", points: "#1a1412", hoof: "#2a211b", mask: "#efe6d6" }),
    grey: qpal({ coat: "#b8b2aa", nose: "#5a524c", points: "#8a8480", hoof: "#3a3430", mask: "#ece6dc" }),
  },
  eye: { ...DARK_EYE, size: 0.44, lashes: 3 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 1.5, stride: 1.7 },
      // The paso llano: fast, smooth, lateral (the rider's back stays still).
      { gait: "paso", speed: 3.5, stride: 2.3 },
      { gait: "canter", speed: 5.5, stride: 3.2 },
      { gait: "gallop", speed: 9, stride: 4.6 },
    ],
    idles: { weights: { look: 3, graze: 2, shake: 0.4, chew: 0.5, sleep: 0.3 } },
    nod: 0.04,
    graze: 1.2,
    tailRest: -0.15,
    tailSwish: 0.5,
    earK: 90,
    earFlick: 1.2,
    breath: 4,
  }),
});

/** The mule's proportions (the ride mount's tack is fitted to them: ../../../ambient/mount/). */
export const MULE_SHAPE: QuadShape = {
  bodyY: 1.0,
  bodyR: [0.27, 0.3],
  half: 0.68,
  neck: { len: 0.62, angle: 0.75, r: [0.2, 0.11], arch: 0.06 },
  head: { r: [0.095, 0.11, 0.13], muzzle: 0.33, mr: [0.09, 0.075], drop: 0.95 },
  ears: { len: 0.27, w: 0.07, kind: "long", tilt: 0.28, back: 0.3 },
  tail: { len: 0.55, r: [0.04, 0.03], angle: -1.3, segs: 2, tuft: [0.05, 0.13, 0.05] },
  legs: { r: [0.085, 0.052, 0.042, 0.055], knee: 0.45, hock: 0.44, hockBack: 0.12, mass: 1.25 },
  foot: "hoof",
  coat: FUR(0.003, 40),
  eye: { dir: [0.92, 0.32, 0.2], w: 0.075 },
  hoofY: 0.065,
  bellyY: 0.82,
};

export const MULE = spec({
  key: "mule",
  name: { es: "mula", en: "mule" },
  latin: "Equus asinus × caballus",
  size: 2,
  speeds: { walk: 1.4, run: 3.6, max: 7 },
  h: 0.028,
  shape: MULE_SHAPE,
  tune: (p) => {
    p.slots = { ...equidSlots, tail: Q.coat };
    p.muzzle.noseAt = (p.muzzle.noseAt ?? 0) - 0.06;
  },
  extra: (k, p) => mane(k, p, { side: 0, len: 0.07, up: 0.0, r: 0.04, forelock: 0 }),
  palette: qpal({ coat: "#6e4a33", nose: "#c9b39a", belly: "#c9b39a", points: "#3f2a1e", hoof: "#2a211b" }),
  variants: {
    brown: qpal({ coat: "#6e4a33", nose: "#c9b39a", belly: "#c9b39a", points: "#3f2a1e" }),
    dark: qpal({ coat: "#3f2e26", nose: "#a89480", belly: "#a89480", points: "#2a1e18" }),
    bay: qpal({ coat: "#8a5634", nose: "#d8c4a8", belly: "#d8c4a8", points: "#2a1e18" }),
  },
  eye: { ...DARK_EYE, size: 0.44, lashes: 3 },
  motion: quadMotion({
    gaits: EQUID_GAITS(0.92),
    idles: { weights: { look: 3, graze: 2, shake: 0.4, chew: 0.6, sleep: 0.3 } },
    nod: 0.05,
    graze: 1.25,
    tailRest: -0.1,
    tailSwish: 0.6,
    earK: 70,
    earFlick: 1.4,
  }),
});

export const DONKEY = spec({
  key: "donkey",
  name: { es: "burro", en: "donkey" },
  latin: "Equus asinus",
  size: 1.6,
  speeds: { walk: 1.2, run: 3, max: 6 },
  h: 0.025,
  shape: {
    bodyY: 0.82,
    bodyR: [0.24, 0.26],
    half: 0.55,
    neck: { len: 0.48, angle: 0.85, r: [0.18, 0.11], arch: 0.04 },
    head: { r: [0.1, 0.115, 0.13], muzzle: 0.3, mr: [0.1, 0.085], drop: 0.85 },
    ears: { len: 0.3, w: 0.075, kind: "long", tilt: 0.3, back: 0.25 },
    tail: { len: 0.45, r: [0.035, 0.025], angle: -1.35, segs: 2, tuft: [0.04, 0.1, 0.04] },
    legs: { r: [0.075, 0.046, 0.037, 0.046], knee: 0.45, hock: 0.44, hockBack: 0.1, mass: 1.2 },
    foot: "hoof",
    coat: FUR(0.006, 32),
    eye: { dir: [0.92, 0.32, 0.2], w: 0.075 },
    hoofY: 0.055,
    bellyY: 0.68,
  },
  tune: (p) => {
    p.slots = { ...equidSlots, tail: Q.coat };
    p.muzzle.noseAt = (p.muzzle.noseAt ?? 0) - 0.07;
  },
  extra: (k, p) => mane(k, p, { side: 0, len: 0.05, up: 0.0, r: 0.035, forelock: 0 }),
  palette: qpal({ coat: "#8a8078", nose: "#e6ddd0", belly: "#e6ddd0", points: "#4a403a", hoof: "#2a2420" }),
  variants: {
    grey: qpal({ coat: "#8a8078", nose: "#e6ddd0", belly: "#e6ddd0", points: "#4a403a" }),
    brown: qpal({ coat: "#6e5442", nose: "#d8c8b4", belly: "#d8c8b4", points: "#3a2c24" }),
  },
  eye: { ...DARK_EYE, size: 0.45, lashes: 3 },
  motion: quadMotion({
    gaits: EQUID_GAITS(0.8),
    nod: 0.05,
    graze: 1.25,
    tailRest: -0.1,
    tailSwish: 0.6,
    earFlick: 1.4,
  }),
});

// ---------------------------------------------------------------- felines

const CAT_GAITS = (s: number) => [
  { gait: "stalk" as const, speed: 0.7 * s, stride: 0.95 * s },
  { gait: "walk" as const, speed: 1.3 * s, stride: 1.2 * s },
  { gait: "trot" as const, speed: 3 * s, stride: 1.9 * s },
  { gait: "bound" as const, speed: 7 * s, stride: 3.2 * s },
];

const catMotion = (s: number): QuadMotion =>
  quadMotion({
    gaits: CAT_GAITS(s),
    idles: { weights: { look: 3, groom: 2, yawn: 1, sit: 2, sleep: 1, scratch: 0.3 }, gap: [2, 7] },
    carry: 0.15,
    nod: 0.02,
    graze: 0.6,
    tailRest: -0.3,
    tailK: 25,
    earK: 90,
    earFlick: 0.6,
    climb: true,
    swim: "paddle",
  });

export const PUMA = spec({
  key: "puma",
  name: { es: "puma", en: "puma" },
  latin: "Puma concolor",
  size: 1.9,
  speeds: { walk: 1.2, run: 4, max: 12 },
  h: 0.022,
  shape: {
    bodyY: 0.5,
    bodyR: [0.16, 0.19],
    half: 0.45,
    rumpUp: 0.03,
    neck: { len: 0.2, angle: 1.0, r: [0.13, 0.1], arch: 0.05 },
    head: { r: [0.1, 0.092, 0.1], muzzle: 0.075, mr: [0.068, 0.052], drop: 0.3 },
    ears: { len: 0.065, w: 0.048, kind: "round", tilt: 0.4, back: 0.25 },
    tail: { len: 0.78, r: [0.045, 0.04], angle: -0.95, segs: 3, curl: 0.28, tuft: [0.045, 0.045, 0.06] },
    legs: { r: [0.075, 0.048, 0.038, 0.048], knee: 0.48, hock: 0.42, hockBack: 0.1, mass: 1.3 },
    foot: "paw",
    coat: FUR(0.003, 55),
    eye: { dir: [0.62, 0.38, 0.69], w: 0.048 },
    bellyY: 0.43,
  },
  tune: (p) => {
    p.slots = { muzzle: Q.belly };
  },
  palette: qpal({ coat: "#b98a55", belly: "#ead9bd", nose: "#9a6a5a", points: "#2a1e16", inner: "#e2c4aa" }),
  eye: { ...CAT_EYE("#a8782e", "#d8b060"), patch: { color: "#3a281c", kind: "tear" } },
  motion: catMotion(1),
});

export const JAGUAR = spec({
  key: "jaguar",
  name: { es: "otorongo", en: "jaguar" },
  latin: "Panthera onca",
  size: 2,
  speeds: { walk: 1.2, run: 4, max: 11 },
  h: 0.023,
  shape: {
    bodyY: 0.5,
    bodyR: [0.2, 0.22],
    half: 0.46,
    rumpUp: 0.02,
    neck: { len: 0.2, angle: 1.05, r: [0.16, 0.12], arch: 0.05 },
    head: { r: [0.12, 0.105, 0.115], muzzle: 0.08, mr: [0.078, 0.06], drop: 0.3 },
    ears: { len: 0.06, w: 0.05, kind: "round", tilt: 0.45, back: 0.25 },
    tail: { len: 0.62, r: [0.05, 0.042], angle: -0.95, segs: 3, curl: 0.25, tuft: [0.045, 0.045, 0.055] },
    legs: { r: [0.09, 0.06, 0.048, 0.06], knee: 0.48, hock: 0.42, hockBack: 0.1, mass: 1.35 },
    foot: "paw",
    coat: FUR(0.003, 55),
    eye: { dir: [0.62, 0.38, 0.69], w: 0.05 },
    bellyY: 0.4,
  },
  tune: (p) => {
    p.slots = { muzzle: Q.belly, head: Q.coat };
    p.spots = { freq: 12, ring: [0.2, 0.29], centre: true, seed: 5, legs: true };
  },
  palette: qpal({
    coat: "#d39a45",
    belly: "#efe6d6",
    nose: "#a06a5a",
    points: "#2a1e16",
    spot: "#2a1e16",
    spot2: "#b8782f",
    inner: "#efe0c8",
  }),
  variants: {
    golden: qpal({ coat: "#d39a45", belly: "#efe6d6", nose: "#a06a5a", spot: "#2a1e16", spot2: "#b8782f" }),
    black: qpal({
      coat: "#2e2622",
      belly: "#3a302a",
      nose: "#3a2c28",
      spot: "#1a1412",
      spot2: "#262019",
      hair: "#2e2622",
    }),
  },
  eye: CAT_EYE("#b8862e", "#e0bc62"),
  motion: catMotion(1),
});

// ---------------------------------------------------------------- canid

export const FOX = spec({
  key: "fox",
  name: { es: "zorro andino", en: "Andean fox" },
  latin: "Lycalopex culpaeus",
  size: 1.1,
  speeds: { walk: 1.1, run: 3.5, max: 10 },
  h: 0.016,
  shape: {
    bodyY: 0.38,
    bodyR: [0.11, 0.13],
    half: 0.3,
    neck: { len: 0.16, angle: 0.95, r: [0.085, 0.065], arch: 0.05 },
    head: { r: [0.07, 0.064, 0.075], muzzle: 0.12, mr: [0.045, 0.022], drop: 0.12 },
    ears: { len: 0.11, w: 0.055, kind: "pointed", tilt: 0.28, back: 0.12 },
    tail: { len: 0.45, r: [0.035, 0.045], angle: -1.0, segs: 2, curl: 0.12, tuft: [0.04, 0.04, 0.06] },
    legs: { r: [0.045, 0.028, 0.022, 0.028], knee: 0.48, hock: 0.4, hockBack: 0.07, mass: 1.15 },
    foot: "paw",
    coat: FUR(0.006, 38),
    eye: { dir: [0.75, 0.4, 0.53], w: 0.042 },
    bellyY: 0.32,
  },
  tune: (p) => {
    p.slots = { muzzle: Q.hair };
    if (p.tail) p.tail.coat = FUR(0.022, 26);
    p.pointsY = 0.08;
  },
  palette: qpal({
    coat: "#8f8274",
    hair: "#b8673a",
    belly: "#ece2d2",
    nose: "#1e1614",
    points: "#1e1614",
    inner: "#e8d8c4",
  }),
  eye: { ...CAT_EYE("#b07a2a", "#d8a850"), size: 0.46 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 1.1, stride: 0.75 },
      { gait: "trot", speed: 2.6, stride: 1.2 },
      { gait: "bound", speed: 6, stride: 2.0 },
    ],
    idles: { weights: { look: 3, sit: 2, scratch: 1, yawn: 1, sleep: 1, groom: 1, shake: 0.5 }, gap: [1.5, 5] },
    carry: 0.12,
    tailRest: -0.4,
    tailK: 30,
    tailWag: 0.05,
    earK: 100,
    earFlick: 1,
  }),
});

// ---------------------------------------------------------------- ursid

export const BEAR = spec({
  key: "bear",
  name: { es: "oso de anteojos (ukuku)", en: "spectacled bear" },
  latin: "Tremarctos ornatus",
  size: 1.7,
  speeds: { walk: 1, run: 2.6, max: 8 },
  h: 0.026,
  woolNormal: 0.4,
  shape: {
    bodyY: 0.56,
    bodyR: [0.28, 0.3],
    half: 0.42,
    rumpUp: 0.03,
    chestK: 1.05,
    neck: { len: 0.2, angle: 0.95, r: [0.21, 0.16], arch: 0.02 },
    head: { r: [0.15, 0.14, 0.14], muzzle: 0.12, mr: [0.085, 0.062], drop: 0.3 },
    ears: { len: 0.065, w: 0.058, kind: "round", tilt: 0.55, back: 0.2 },
    tail: { len: 0.06, r: [0.04, 0.03], angle: -0.6, segs: 1 },
    legs: { r: [0.12, 0.085, 0.072, 0.08], knee: 0.46, hock: 0.42, hockBack: 0.04, mass: 1.15 },
    foot: "paw",
    coat: FUR(0.022, 14),
    short: FUR(0.008, 30),
    eye: { dir: [0.75, 0.45, 0.48], w: 0.07 },
  },
  tune: (p) => {
    p.slots = { muzzle: Q.belly };
  },
  extra: (k, p) => {
    // The cream bib on the chest.
    const c = lerp3(p.neck.a, p.chest.c, 0.25);
    k.bands.push({
      prims: [...k.group("neck")],
      at: (q) => q[2] - (c[2] + 0.1) + Math.abs(q[0]) * 1.4 + Math.abs(q[1] - c[1]) * 0.5,
      stops: [0],
      slots: [Q.coat, Q.belly],
    });
  },
  palette: qpal({
    coat: "#231d1b",
    hair: "#231d1b",
    belly: "#e2d2a8",
    nose: "#1a1412",
    hoof: "#1a1412",
    inner: "#3a302c",
  }),
  eye: { ...DARK_EYE, size: 0.36, ring: "#e2d2a8", ringW: 22, patch: { color: "#e2d2a8", kind: "brow" } },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 1, stride: 1.05 },
      { gait: "trot", speed: 2.2, stride: 1.5 },
      { gait: "gallop", speed: 5, stride: 2.2 },
    ],
    idles: { weights: { look: 3, sit: 2, yawn: 1, scratch: 1, sleep: 1, graze: 1, shake: 0.4 }, gap: [2, 6] },
    carry: 0.2,
    nod: 0.05,
    graze: 0.7,
    climb: true,
    swim: "paddle",
  }),
});

// ---------------------------------------------------------------- rodents

const RODENT_GAITS = (s: number) => [
  { gait: "walk" as const, speed: 0.4 * s, stride: 0.35 * s },
  { gait: "hop" as const, speed: 1.6 * s, stride: 0.8 * s },
];

export const VIZCACHA = spec({
  key: "vizcacha",
  name: { es: "vizcacha", en: "mountain vizcacha" },
  latin: "Lagidium peruanum",
  size: 0.55,
  speeds: { walk: 0.4, run: 2, max: 4 },
  h: 0.011,
  woolNormal: 0.5,
  shape: {
    bodyY: 0.2,
    bodyR: [0.1, 0.11],
    half: 0.13,
    rumpUp: 0.015,
    rumpK: 1.18,
    neck: { len: 0.06, angle: 0.55, r: [0.075, 0.065], arch: 0 },
    head: { r: [0.06, 0.06, 0.068], muzzle: 0.05, mr: [0.042, 0.03], drop: 0.25 },
    ears: { len: 0.12, w: 0.042, kind: "long", tilt: 0.22, back: 0.3 },
    tail: { len: 0.24, r: [0.02, 0.022], angle: 0.35, segs: 3, curl: 0.55, tuft: [0.032, 0.04, 0.05] },
    legs: { r: [0.032, 0.02, 0.016, 0.02], hind: [0.055, 0.03, 0.02, 0.035], knee: 0.5, hock: 0.32, hockBack: 0.05 },
    foot: "paw",
    coat: FUR(0.008, 45),
    eye: { dir: [0.9, 0.35, 0.25], w: 0.035 },
    bellyY: 0.15,
  },
  tune: (p) => {
    p.slots = { tail: Q.coat };
  },
  palette: qpal({
    coat: "#a69b8f",
    hair: "#9a8f84",
    belly: "#d8d0c4",
    nose: "#3a302c",
    points: "#3a302a",
    inner: "#c9a99a",
  }),
  eye: { ...DARK_EYE, size: 0.5 },
  motion: quadMotion({
    gaits: RODENT_GAITS(1),
    idles: { weights: { sit: 5, look: 3, groom: 2, chew: 2, sleep: 1 }, gap: [1, 4] },
    tailRest: 0.2,
    graze: 0.5,
    earK: 60,
  }),
});

export const CAPYBARA = spec({
  key: "capybara",
  name: { es: "ronsoco", en: "capybara" },
  latin: "Hydrochoerus hydrochaeris",
  size: 1.2,
  speeds: { walk: 0.8, run: 2.5, max: 6 },
  h: 0.02,
  woolNormal: 0.6,
  shape: {
    bodyY: 0.38,
    bodyR: [0.21, 0.23],
    half: 0.36,
    rumpUp: 0.03,
    rumpK: 1.06,
    neck: { len: 0.1, angle: 1.15, r: [0.17, 0.15], arch: 0 },
    head: { r: [0.11, 0.13, 0.14], muzzle: 0.15, mr: [0.105, 0.095], drop: 0.22 },
    ears: { len: 0.04, w: 0.035, kind: "round", tilt: 0.3, back: 0.2 },
    legs: { r: [0.07, 0.05, 0.04, 0.045], knee: 0.45, hock: 0.38, hockBack: 0.04 },
    foot: "paw",
    coat: FUR(0.007, 30),
    eye: { dir: [0.92, 0.42, 0.0], w: 0.045 },
    bellyY: 0.28,
  },
  tune: (p) => {
    p.slots = { muzzle: Q.coat, head: Q.coat };
  },
  palette: qpal({ coat: "#8a5a3a", hair: "#7a4e32", belly: "#a87650", nose: "#2e2220", inner: "#6a4430" }),
  eye: { ...DARK_EYE, size: 0.4, lashes: 0 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 0.8, stride: 0.7 },
      { gait: "trot", speed: 1.8, stride: 1.0 },
      { gait: "gallop", speed: 4, stride: 1.5 },
    ],
    idles: { weights: { graze: 4, chew: 3, look: 2, sit: 1, sleep: 2 }, gap: [2, 6] },
    graze: 0.8,
    swim: "paddle",
  }),
});

export const AGOUTI = spec({
  key: "agouti",
  name: { es: "añuje", en: "agouti" },
  latin: "Dasyprocta variegata",
  size: 0.55,
  speeds: { walk: 0.6, run: 2.4, max: 5 },
  h: 0.011,
  shape: {
    bodyY: 0.25,
    bodyR: [0.085, 0.1],
    half: 0.15,
    rumpUp: 0.03,
    rumpK: 1.28,
    neck: { len: 0.07, angle: 0.9, r: [0.065, 0.055], arch: 0 },
    head: { r: [0.055, 0.06, 0.07], muzzle: 0.07, mr: [0.04, 0.028], drop: 0.35 },
    ears: { len: 0.035, w: 0.03, kind: "round", tilt: 0.35, back: 0.2 },
    legs: { r: [0.032, 0.018, 0.013, 0.017], hind: [0.05, 0.024, 0.015, 0.02], knee: 0.48, hock: 0.38, hockBack: 0.04 },
    foot: "paw",
    coat: FUR(0.004, 50),
    eye: { dir: [0.92, 0.35, 0.18], w: 0.034 },
  },
  palette: qpal({ coat: "#b8702e", hair: "#9a5a24", belly: "#c88a48", nose: "#3a2a22" }),
  eye: { ...DARK_EYE, size: 0.48 },
  motion: quadMotion({
    gaits: RODENT_GAITS(1.3),
    idles: { weights: { look: 4, chew: 3, sit: 2, groom: 1, graze: 2 }, gap: [1, 3] },
    graze: 0.7,
  }),
});

export const CUY = spec({
  key: "cuy",
  name: { es: "cuy", en: "guinea pig" },
  latin: "Cavia porcellus",
  size: 0.3,
  speeds: { walk: 0.3, run: 1.2, max: 2 },
  h: 0.0075,
  woolNormal: 0.5,
  shape: {
    bodyY: 0.075,
    bodyR: [0.068, 0.062],
    half: 0.07,
    rumpK: 1.05,
    neck: { len: 0.03, angle: 1.2, r: [0.058, 0.054], arch: 0 },
    head: { r: [0.05, 0.047, 0.055], muzzle: 0.035, mr: [0.033, 0.026], drop: 0.3 },
    ears: { len: 0.025, w: 0.022, kind: "round", tilt: 0.6, back: 0.2 },
    legs: { r: [0.016, 0.012, 0.01, 0.012], knee: 0.5, hock: 0.45, hockBack: 0.01, spread: 0.6 },
    foot: "paw",
    coat: FUR(0.006, 60),
    eye: { dir: [0.9, 0.35, 0.25], w: 0.026 },
  },
  tune: (p) => {
    p.spots = { freq: 14, ring: [0.08, 9], seed: 9 };
    p.slots = { head: Q.coat, muzzle: Q.coat, ears: Q.inner, legs: Q.coat };
  },
  palette: qpal({ coat: "#f2ece2", spot: "#a0602e", nose: "#c98a80", inner: "#d8a898" }),
  variants: {
    tricolor: qpal({ coat: "#f2ece2", spot: "#a0602e", nose: "#c98a80", inner: "#d8a898" }),
    brown: qpal({ coat: "#9a5a2e", spot: "#f2ece2", nose: "#7a4a40", inner: "#c88a78" }),
    piebald: qpal({ coat: "#f2ece2", spot: "#2a2220", nose: "#c98a80", inner: "#d8a898" }),
    cream: qpal({ coat: "#e8d0a8", spot: "#e8d0a8", nose: "#c98a80", inner: "#d8a898" }),
  },
  eye: { ...DARK_EYE, size: 0.5, lashes: 0 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 0.25, stride: 0.16 },
      { gait: "trot", speed: 0.8, stride: 0.3 },
    ],
    idles: { weights: { chew: 4, look: 3, graze: 3, groom: 1 }, gap: [1, 3] },
    graze: 0.4,
  }),
});

// ---------------------------------------------------------------- peccary, tapir, deer

export const SAJINO = spec({
  key: "sajino",
  name: { es: "sajino", en: "collared peccary" },
  latin: "Pecari tajacu",
  size: 0.95,
  speeds: { walk: 0.8, run: 3, max: 8 },
  h: 0.016,
  woolNormal: 0.5,
  shape: {
    bodyY: 0.32,
    bodyR: [0.13, 0.17],
    half: 0.24,
    chestK: 1.1,
    rumpK: 0.88,
    neck: { len: 0.1, angle: 1.3, r: [0.13, 0.1], arch: 0 },
    head: { r: [0.08, 0.09, 0.1], muzzle: 0.15, mr: [0.06, 0.042], drop: 0.3 },
    ears: { len: 0.05, w: 0.035, kind: "pointed", tilt: 0.4, back: 0.25 },
    tail: { len: 0.03, r: [0.02, 0.015], angle: -1, segs: 1 },
    legs: { r: [0.045, 0.026, 0.02, 0.026], knee: 0.45, hock: 0.4, hockBack: 0.04 },
    foot: "trotter",
    coat: FUR(0.014, 34),
    eye: { dir: [0.92, 0.38, 0.1], w: 0.034 },
    hoofY: 0.03,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, muzzle: Q.coat };
  },
  extra: (k, p) => {
    // The pale collar across the shoulders (sajino = "collared").
    const z0 = p.neck.a[2] - 0.01;
    k.bands.push({
      prims: [...k.group("neck")],
      at: (q) => q[2] - z0,
      stops: [-0.025, 0.025],
      slots: [Q.coat, Q.belly, Q.coat],
    });
    // A bristly crest along the back.
    for (let i = 0; i < 4; i++) {
      const z = p.body.c[2] + p.body.r[2] * (0.5 - i * 0.3);
      k.add(
        k.ell([0, p.body.c[1] + p.body.r[1] * 0.92, z], [0.035, 0.04, 0.07], "body", 0.04, Q.points, FUR(0.02, 40)),
      );
    }
  },
  palette: qpal({ coat: "#4a423c", belly: "#cfc2ae", nose: "#5a4a44", points: "#2a2420" }),
  eye: { ...DARK_EYE, size: 0.42, lashes: 1 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 0.8, stride: 0.6 },
      { gait: "trot", speed: 2, stride: 0.9 },
      { gait: "gallop", speed: 5, stride: 1.4 },
    ],
    idles: { weights: { graze: 4, look: 2, chew: 1, shake: 0.5, sleep: 0.5 }, gap: [1, 4] },
    graze: 0.7,
    carry: 0.2,
    tailWag: 0.15,
  }),
});

export const TAPIR = spec({
  key: "tapir",
  name: { es: "sachavaca", en: "lowland tapir" },
  latin: "Tapirus terrestris",
  size: 2,
  speeds: { walk: 0.9, run: 2.8, max: 7 },
  h: 0.026,
  shape: {
    bodyY: 0.62,
    bodyR: [0.24, 0.3],
    half: 0.52,
    rumpUp: 0.04,
    rumpK: 1.06,
    neck: { len: 0.2, angle: 1.15, r: [0.22, 0.16], arch: 0 },
    head: { r: [0.11, 0.15, 0.17], muzzle: 0.2, mr: [0.075, 0.045], drop: 0.75 },
    ears: { len: 0.07, w: 0.055, kind: "round", tilt: 0.4, back: 0.25 },
    tail: { len: 0.06, r: [0.035, 0.025], angle: -1.2, segs: 1 },
    legs: { r: [0.1, 0.07, 0.056, 0.068], knee: 0.45, hock: 0.42, hockBack: 0.06, mass: 1.1 },
    foot: "hoof",
    coat: FUR(0.004, 40),
    eye: { dir: [0.92, 0.5, 0.0], w: 0.045 },
    hoofY: 0.05,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, ears: Q.inner, muzzle: Q.hair };
  },
  extra: (k, p) => mane(k, p, { side: 0, len: 0.05, up: 0.0, r: 0.035, forelock: 0 }),
  palette: qpal({
    coat: "#3d3330",
    hair: "#4a3e38",
    nose: "#2a2220",
    points: "#2a2220",
    inner: "#d8d0c4",
    hoof: "#2a2220",
  }),
  eye: { ...DARK_EYE, size: 0.38, lashes: 1 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 0.9, stride: 1.1 },
      { gait: "trot", speed: 2.2, stride: 1.6 },
      { gait: "gallop", speed: 5, stride: 2.4 },
    ],
    idles: { weights: { graze: 4, look: 2, chew: 2, sleep: 1, shake: 0.3 }, gap: [2, 6] },
    graze: 0.9,
    carry: 0.15,
    swim: "paddle",
  }),
});

export const DEER = spec({
  key: "taruca",
  name: { es: "taruca", en: "taruca (Andean deer)" },
  latin: "Hippocamelus antisensis",
  size: 1.5,
  speeds: { walk: 1.1, run: 3.5, max: 11 },
  h: 0.02,
  shape: {
    bodyY: 0.78,
    bodyR: [0.17, 0.22],
    half: 0.4,
    rumpUp: 0.02,
    neck: { len: 0.38, angle: 0.55, r: [0.11, 0.07], arch: 0.06 },
    head: { r: [0.065, 0.075, 0.1], muzzle: 0.16, mr: [0.055, 0.036], drop: 0.55 },
    ears: { len: 0.15, w: 0.06, kind: "long", tilt: 0.75, back: 0.1 },
    tail: { len: 0.1, r: [0.035, 0.03], angle: -0.9, segs: 1, tuft: [0.035, 0.045, 0.03] },
    legs: { r: [0.06, 0.03, 0.022, 0.026], knee: 0.47, hock: 0.42, hockBack: 0.1, mass: 1.3 },
    foot: "hoof",
    coat: FUR(0.004, 40),
    eye: { dir: [0.92, 0.38, 0.12], w: 0.05 },
    hoofY: 0.035,
    bellyY: 0.62,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, ears: Q.coat, tail: Q.belly };
  },
  extra: (k, p) => {
    // Antlers: a short beam forking in two above each ear (the taruca's simple fork).
    k.bone("antlers", "head", p.head.c);
    const hc = p.head.c;
    for (const sx of [1, -1]) {
      const base: Vec3 = [sx * 0.035, hc[1] + p.head.r[1] * 0.8, hc[2] - 0.01];
      const fork: Vec3 = [sx * 0.07, base[1] + 0.13, base[2] - 0.02];
      k.add(k.cone(base, fork, 0.016, 0.012, "antlers", 0.008, Q.mask));
      k.add(k.cone(fork, [sx * 0.08, fork[1] + 0.12, fork[2] + 0.06], 0.012, 0.005, "antlers", 0.006, Q.mask));
      k.add(k.cone(fork, [sx * 0.11, fork[1] + 0.08, fork[2] - 0.07], 0.011, 0.005, "antlers", 0.006, Q.mask));
    }
  },
  palette: qpal({
    coat: "#8a7a66",
    belly: "#e6ddd0",
    nose: "#2e2420",
    hoof: "#2a221e",
    mask: "#d8c8a8",
    inner: "#c8a898",
  }),
  eye: { ...DARK_EYE, size: 0.46, lashes: 3 },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 1.1, stride: 1.1 },
      { gait: "trot", speed: 2.5, stride: 1.6 },
      { gait: "bound", speed: 6, stride: 3 },
    ],
    idles: { weights: { graze: 4, look: 3, chew: 2, groom: 1, sleep: 0.5 }, gap: [1.5, 5] },
    graze: 1.1,
    earFlick: 1.5,
    tailWag: 0.04,
  }),
});

// ---------------------------------------------------------------- primate, sloth

export const MONKEY = spec({
  key: "squirrel-monkey",
  name: { es: "fraile", en: "squirrel monkey" },
  latin: "Saimiri boliviensis",
  size: 0.6,
  speeds: { walk: 0.6, run: 2, max: 4 },
  h: 0.0085,
  shape: {
    bodyY: 0.2,
    bodyR: [0.045, 0.052],
    half: 0.1,
    chestK: 1.08,
    neck: { len: 0.035, angle: 0.55, r: [0.036, 0.034], arch: 0 },
    head: { r: [0.046, 0.048, 0.046], muzzle: 0.02, mr: [0.022, 0.017], drop: 0.15, up: 0.25 },
    ears: { len: 0.022, w: 0.02, kind: "round", tilt: 1.0, back: 0.0 },
    tail: { len: 0.4, r: [0.014, 0.011], angle: -0.5, segs: 3, curl: 0.3, tuft: [0.016, 0.016, 0.035] },
    legs: { r: [0.017, 0.012, 0.01, 0.012], hind: [0.022, 0.014, 0.01, 0.013], knee: 0.52, hock: 0.45, hockBack: 0.02 },
    foot: "hand",
    coat: FUR(0.004, 70),
    eye: { dir: [0.45, 0.25, 0.86], w: 0.036 },
    bellyY: 0.14,
  },
  tune: (p) => {
    p.slots = { muzzle: Q.points, ears: Q.mask, legs: Q.hair };
  },
  palette: qpal({
    coat: "#8a8a6a",
    hair: "#e0a030",
    belly: "#efe2c4",
    nose: "#1e1614",
    points: "#2a2018",
    hoof: "#c08a60",
    inner: "#efe2c4",
  }),
  eye: { ...DARK_EYE, size: 0.4, lashes: 0, patch: { color: "#f4efe6", kind: "face" }, sclera: "#f4efe6" },
  motion: quadMotion({
    gaits: [
      { gait: "walk", speed: 0.6, stride: 0.35 },
      { gait: "bound", speed: 2, stride: 0.8 },
    ],
    idles: { weights: { look: 5, groom: 3, sit: 3, scratch: 1, chew: 1, yawn: 0.5 }, gap: [0.6, 2.5] },
    tailRest: -0.6,
    tailK: 20,
    climb: true,
  }),
});

export const SLOTH = spec({
  key: "sloth",
  name: { es: "perezoso", en: "three-toed sloth" },
  latin: "Bradypus variegatus",
  size: 0.65,
  speeds: { walk: 0.08, run: 0.2, max: 0.3 },
  h: 0.012,
  woolNormal: 0.35,
  shape: {
    bodyY: 0.33,
    bodyR: [0.12, 0.14],
    half: 0.15,
    neck: { len: 0.08, angle: 0.55, r: [0.1, 0.08], arch: 0 },
    head: { r: [0.07, 0.065, 0.065], muzzle: 0.028, mr: [0.036, 0.03], drop: 0.1 },
    tail: { len: 0.04, r: [0.03, 0.02], angle: -0.8, segs: 1 },
    legs: {
      r: [0.036, 0.028, 0.024, 0.028],
      hind: [0.036, 0.028, 0.024, 0.026],
      knee: 0.5,
      hock: 0.48,
      hockBack: 0.0,
      spread: 0.85,
    },
    foot: "claw",
    coat: FUR(0.03, 15),
    short: FUR(0.012, 30),
    eye: { dir: [0.5, 0.25, 0.83], w: 0.045 },
  },
  tune: (p) => {
    p.slots = { head: Q.belly, muzzle: Q.belly, legs: Q.coat };
  },
  palette: qpal({ coat: "#8a7a62", belly: "#d8c8a8", nose: "#2a201a", hoof: "#3a2e24", points: "#3a2e24" }),
  eye: { ...DARK_EYE, size: 0.34, lashes: 0, patch: { color: "#3a2a20", kind: "mask" } },
  motion: quadMotion({
    gaits: [{ gait: "walk", speed: 0.08, stride: 0.25 }],
    idles: { weights: { look: 3, sleep: 3, yawn: 1, groom: 1, scratch: 0.5 }, gap: [3, 8] },
    nod: 0.01,
    climb: true,
    hang: true,
    swim: "paddle",
    breath: 5,
  }),
});

export const MAMMALS = {
  horse: HORSE,
  mule: MULE,
  donkey: DONKEY,
  puma: PUMA,
  jaguar: JAGUAR,
  fox: FOX,
  bear: BEAR,
  vizcacha: VIZCACHA,
  capybara: CAPYBARA,
  agouti: AGOUTI,
  cuy: CUY,
  sajino: SAJINO,
  tapir: TAPIR,
  taruca: DEER,
  "squirrel-monkey": MONKEY,
  sloth: SLOTH,
};

export { recolor };
