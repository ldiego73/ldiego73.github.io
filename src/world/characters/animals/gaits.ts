/**
 * Footfall patterns of four-legged gaits and how an animal picks (and blends) one for its ground speed.
 *
 * A gait is the phase at which each foot strikes within one stride (0..1; lh = left hind, lf = left fore, rh,
 * rf), the duty factor (share of the stride a foot bears weight: a walk keeps ≥ 2 feet down, a gallop has a
 * moment of suspension), how high the swing foot lifts, how much the spine flexes (bounding cats and dogs fold
 * and stretch their backs, a horse barely), how the body rides the steps (bob per footfall or one big arc per
 * stride) and how it rolls (a pace rocks side to side).
 *
 *   walk     lateral sequence, four beats (LH, LF, RH, RF): every quadruped's slow gait
 *   paso     the Peruvian Paso's paso llano: a four-beat lateral gait at running speed with no suspension,
 *            a near-still back, and the "término" (front legs swing outward in an arc)
 *   pace     both legs of a side together (camelids when they hurry)
 *   trot     diagonal pairs together (horses, mules, dogs, pigs, deer)
 *   canter   three beats (left lead): RH, then LH with RF, then LF, then suspension
 *   gallop   four beats, transverse (horses at speed)
 *   bound    rotary gallop with a flexing spine (felines, foxes running), fore and hind pairs almost together
 *   hop      fore pair together, hind pair together, a big arc per stride (vizcachas, rodents dashing)
 *   stalk    a slow cat walk: low body, long stance
 *   crawl    the sprawled diagonal walk of lizards, caimans and turtles, the spine swinging in an S
 *
 * A species lists its gaits with the speed each one is used at (`GaitUse`); `pickGait` finds the two around the
 * current speed and the blend between them, so a llama glides from walk to pace and a horse from walk to trot
 * to canter to gallop without a pop. Stride length grows with speed inside a gait (√ of the speed ratio, what
 * real animals do before they change gait).
 *
 * Pure (no DOM, no Three).
 */

export type LegKey = "lh" | "lf" | "rh" | "rf";
export const LEG_KEYS: readonly LegKey[] = ["lf", "rf", "lh", "rh"];

export type GaitKey = "walk" | "paso" | "pace" | "trot" | "canter" | "gallop" | "bound" | "hop" | "stalk" | "crawl";

export interface Gait {
  /** Footfall phase of each leg (0..1). */
  offs: Record<LegKey, number>;
  /** Stance share of the stride. */
  duty: number;
  /** Swing lift, as a fraction of the leg length. */
  lift: number;
  /** Spine flex (radians at the peak): folding at gather, stretching at extension. */
  flex: number;
  /** Body bob (fraction of leg length) and whether it is one arc per stride (suspension gaits) or per step. */
  bob: number;
  arc: boolean;
  /** Body roll (radians) toward the stance side. */
  roll: number;
  /** Lateral spine wave (sprawled crawl), radians. */
  wave: number;
  /** Front feet swing outward (the Paso's término), units of leg length. */
  termino?: number;
  /** Body lowered (stalk, crawl), fraction of leg length. */
  crouch?: number;
}

export const GAITS: Record<GaitKey, Gait> = {
  walk: {
    offs: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75 },
    duty: 0.66,
    lift: 0.11,
    flex: 0.02,
    bob: 0.012,
    arc: false,
    roll: 0.025,
    wave: 0,
  },
  paso: {
    offs: { lh: 0, lf: 0.22, rh: 0.5, rf: 0.72 },
    duty: 0.56,
    lift: 0.15,
    flex: 0.01,
    bob: 0.004,
    arc: false,
    roll: 0.03,
    wave: 0,
    termino: 0.12,
  },
  pace: {
    offs: { lh: 0, lf: 0.02, rh: 0.5, rf: 0.52 },
    duty: 0.48,
    lift: 0.15,
    flex: 0.02,
    bob: 0.03,
    arc: false,
    roll: 0.05,
    wave: 0,
  },
  trot: {
    offs: { lh: 0, rf: 0.02, rh: 0.5, lf: 0.52 },
    duty: 0.44,
    lift: 0.17,
    flex: 0.03,
    bob: 0.035,
    arc: false,
    roll: 0.015,
    wave: 0,
  },
  canter: {
    offs: { rh: 0, lh: 0.28, rf: 0.3, lf: 0.55 },
    duty: 0.38,
    lift: 0.2,
    flex: 0.08,
    bob: 0.06,
    arc: true,
    roll: 0.02,
    wave: 0,
  },
  gallop: {
    offs: { rh: 0, lh: 0.1, rf: 0.42, lf: 0.52 },
    duty: 0.3,
    lift: 0.24,
    flex: 0.12,
    bob: 0.07,
    arc: true,
    roll: 0.015,
    wave: 0,
  },
  bound: {
    offs: { lh: 0, rh: 0.07, lf: 0.45, rf: 0.55 },
    duty: 0.3,
    lift: 0.22,
    flex: 0.28,
    bob: 0.08,
    arc: true,
    roll: 0.01,
    wave: 0,
  },
  hop: {
    offs: { lh: 0, rh: 0.03, lf: 0.5, rf: 0.53 },
    duty: 0.34,
    lift: 0.18,
    flex: 0.22,
    bob: 0.16,
    arc: true,
    roll: 0,
    wave: 0,
  },
  stalk: {
    offs: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75 },
    duty: 0.76,
    lift: 0.09,
    flex: 0.01,
    bob: 0.004,
    arc: false,
    roll: 0.02,
    wave: 0,
    crouch: 0.16,
  },
  crawl: {
    offs: { lh: 0, rf: 0.04, rh: 0.5, lf: 0.54 },
    duty: 0.62,
    lift: 0.12,
    flex: 0,
    bob: 0.01,
    arc: false,
    roll: 0.02,
    wave: 0.22,
    crouch: 0.05,
  },
};

/** One gait a species uses: at `speed` (units/s) its stride is `stride` units long. */
export interface GaitUse {
  gait: GaitKey;
  speed: number;
  stride: number;
}

export interface GaitPick {
  /** The gaits below and above the speed (the same when outside the range). */
  a: GaitUse;
  b: GaitUse;
  /** Blend a → b (0..1, smoothstepped near the change-over). */
  t: number;
  /** Stride length at this speed (units per cycle). */
  stride: number;
}

const ss = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Which gait (or blend of two) at this speed. `uses` must be sorted by speed. Gaits change over the upper
 * quarter of the speed band between two gaits (an animal holds a gait, then switches fairly quickly).
 */
export function pickGait(uses: readonly GaitUse[], speed: number): GaitPick {
  const first = uses[0];
  if (!first) throw new Error("animals: a species needs at least one gait");
  if (uses.length === 1 || speed <= first.speed) {
    return { a: first, b: first, t: 0, stride: strideAt(first, speed) };
  }
  for (let i = 0; i < uses.length - 1; i++) {
    const a = uses[i] as GaitUse;
    const b = uses[i + 1] as GaitUse;
    if (speed <= b.speed) {
      const u = (speed - a.speed) / Math.max(1e-6, b.speed - a.speed);
      const t = ss((u - 0.55) / 0.35);
      return { a, b, t, stride: strideAt(a, speed) * (1 - t) + strideAt(b, speed) * t };
    }
  }
  const last = uses[uses.length - 1] as GaitUse;
  return { a: last, b: last, t: 0, stride: strideAt(last, speed) };
}

/** Stride at a speed inside one gait (√ of the speed ratio, never below 35 % of the nominal stride). */
export function strideAt(u: GaitUse, speed: number) {
  const r = Math.max(0, speed) / Math.max(1e-6, u.speed);
  return u.stride * Math.max(0.35, Math.min(1.6, Math.sqrt(r)));
}

/** Blend two footfall offsets the short way round the cycle. */
export function blendPhase(a: number, b: number, t: number) {
  let d = b - a;
  d -= Math.round(d);
  const p = a + d * t;
  return p - Math.floor(p);
}

/** A gait blended between two (offsets the short way round, numbers linearly). */
export function blendGait(a: Gait, b: Gait, t: number): Gait {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    offs: {
      lh: blendPhase(a.offs.lh, b.offs.lh, t),
      lf: blendPhase(a.offs.lf, b.offs.lf, t),
      rh: blendPhase(a.offs.rh, b.offs.rh, t),
      rf: blendPhase(a.offs.rf, b.offs.rf, t),
    },
    duty: m(a.duty, b.duty),
    lift: m(a.lift, b.lift),
    flex: m(a.flex, b.flex),
    bob: m(a.bob, b.bob),
    arc: t < 0.5 ? a.arc : b.arc,
    roll: m(a.roll, b.roll),
    wave: m(a.wave, b.wave),
    termino: m(a.termino ?? 0, b.termino ?? 0),
    crouch: m(a.crouch ?? 0, b.crouch ?? 0),
  };
}

/** Phase of one leg given the body phase and its footfall offset (0 = foot strike). */
export function legPhaseOf(phase: number, offset: number) {
  const p = phase - offset;
  return p - Math.floor(p);
}

/**
 * Spine gather/extension at a body phase for suspension gaits: −1 fully gathered (hind feet under the chest,
 * just after the hind strike), +1 stretched (fore reach, just after the fore strike). The hind strike is the
 * first hind offset.
 */
export function spineFlex(phase: number, g: Gait) {
  const hind = Math.min(g.offs.lh, g.offs.rh);
  return -Math.cos((phase - hind) * Math.PI * 2 - 0.4);
}

/** Bob of the body at a phase (0 = lowest, 1 = highest). Suspension gaits: one arc per stride. */
export function bobAt(phase: number, g: Gait) {
  const a = phase * Math.PI * 2;
  if (g.arc) {
    // Highest during suspension (after the last fore foot lifts), lowest at the hind strike.
    const fore = Math.max(g.offs.lf, g.offs.rf);
    return 0.5 - 0.5 * Math.cos(a - (fore + g.duty * 0.5) * Math.PI * 2 + Math.PI);
  }
  // Two steps per stride: highest at mid-stance of each support pair.
  return 0.5 + 0.5 * Math.cos(a * 2 - 0.6);
}

/** Feet on the ground at a phase (tests, debugging): the legs whose phase is inside their stance. */
export function feetDown(phase: number, g: Gait): LegKey[] {
  return LEG_KEYS.filter((k) => legPhaseOf(phase, g.offs[k]) < g.duty);
}
