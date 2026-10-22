/**
 * Birds, from a few proportions each (`BirdShape` → ../plan-bird.ts BirdPlan) plus their own marks:
 *
 *   soaring    Andean condor (white ruff and secondaries, fingered primaries, the male's comb)
 *   parrots    scarlet macaw (blue-and-yellow as a variant): white face with feather lines, long tail
 *   toucan     black, a white bib, the big two-tone bill, blue skin round the eye
 *   hummer     a hummingbird (green, a violet throat), needle bill, hovers
 *   seabirds   Peruvian pelican (pouch, slotted tips), guanay cormorant (red face, white belly), grey gull,
 *              Humboldt penguin (flippers, the black breast band, waddles and dives)
 *   waders     great egret (S neck, dagger bill), Andean flamingo (bent bill, stands on one leg)
 *   water      Titicaca grebe, torrent duck (striped white head, red bill)
 *   ground     eared dove (head bob), rufous-collared sparrow (hops), ornate tinamou (runs, then bursts up),
 *              hoatzin (spiky crest, blue face)
 *
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "../../sdf";
import type { IdleProfile } from "../behaviour";
import type { FlightProfile } from "../flight";
import { type Coat, type Kit, lerp3 } from "../kit";
import { B, type BirdPlan, birdKit, type WingPlan } from "../plan-bird";
import type { AnimalSpec, BirdMotion, EyeStyle } from "../spec";

export interface BirdShape {
  /** Body: centre height, half sizes (x, y, z), pitch (− = upright). */
  by: number;
  body: Vec3;
  pitch: number;
  neck: { len: number; angle: number; r: [number, number]; s?: number };
  head: Vec3;
  bill: Omit<BirdPlan["bill"], "a" | "b"> & { len: number; droop?: number };
  /** Half wingspan (shoulder to tip), chords and the rest of the wing. */
  wing: Omit<WingPlan, "shoulder">;
  tail: { len: number; width: number; pitch?: number; n?: number; slot?: number };
  legs: { hip: number; r: [number, number]; toe: number; webbed?: boolean; thigh?: number; back?: number };
  coat: Coat;
  eye: { dir: Vec3; w: number };
  slots?: BirdPlan["slots"];
  h: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const rotX = (p: Vec3, a: number): Vec3 => [
  p[0],
  p[1] * Math.cos(a) - p[2] * Math.sin(a),
  p[1] * Math.sin(a) + p[2] * Math.cos(a),
];

export function birdPlan(s: BirdShape): BirdPlan {
  const [bw, bh, bl] = s.body;
  const c: Vec3 = [0, s.by, 0];
  // Body-frame points (pitched with the body).
  const P = (x: number, y: number, z: number): Vec3 => add(c, rotX([x, y, z], s.pitch));
  const na = P(0, bh * 0.55, bl * 0.72);
  const n = s.neck;
  const nb = add(na, [0, Math.cos(n.angle) * n.len, Math.sin(n.angle) * n.len]);
  const sCurve = n.s ?? 0;
  const ctrl = add(lerp3(na, nb, 0.5), [0, 0, -n.len * (0.15 + sCurve)]);
  const hc = add(nb, [0, s.head[1] * 0.3, s.head[2] * 0.25]);
  const droop = s.bill.droop ?? 0.15;
  const ba = add(hc, [0, -s.head[1] * 0.1, s.head[2] * 0.82]);
  const bb = add(ba, [0, -Math.sin(droop) * s.bill.len, Math.cos(droop) * s.bill.len]);
  const sh = P(bw * 0.78, bh * 0.45, bl * 0.35);
  const hipY = s.legs.hip;
  const hip: Vec3 = [bw * 0.42, Math.max(hipY, s.by - bh * 0.55), s.legs.back ?? -bl * 0.05];
  const ankle: Vec3 = [bw * 0.4, hipY * 0.48, hip[2] - hipY * 0.08];
  const foot: Vec3 = [bw * 0.4, Math.max(s.legs.r[1] * 1.2, 0.002), hip[2]];
  const { len: _l, droop: _d, ...bill } = s.bill;
  return {
    h: s.h,
    coat: s.coat,
    body: { c, r: s.body, pitch: s.pitch },
    breast: { c: P(0, -bh * 0.3, bl * 0.3), r: [bw * 0.95, bh * 0.82, bl * 0.62] },
    neck: { a: na, ctrl, b: nb, r: n.r },
    head: { c: hc, r: s.head },
    bill: { ...bill, a: ba, b: bb },
    eye: s.eye,
    wing: { ...s.wing, shoulder: sh },
    fold: {
      // The folded wing stands proud of the flank, its primaries crossing over the base of the tail.
      front: P(bw * 1.0, bh * 0.4, bl * 0.42),
      back: P(bw * 0.45, bh * 0.22, -bl * 1.35),
      r: [bh * 0.62, bw * 0.24],
    },
    tail: { base: P(0, bh * 0.05, -bl * 0.85), ...s.tail },
    legs: {
      hip,
      ankle,
      foot,
      r: s.legs.r,
      toe: s.legs.toe,
      ...(s.legs.webbed ? { webbed: true } : {}),
      ...(s.legs.thigh ? { thigh: s.legs.thigh } : {}),
    },
    ...(s.slots ? { slots: s.slots } : {}),
  };
}

/** A bird palette from named colours. */
export function bpal(c: {
  back: string;
  head?: string;
  bill?: string;
  legs?: string;
  belly?: string;
  coverts?: string;
  flight?: string;
  tail?: string;
  face?: string;
  collar?: string;
  accent?: string;
  x1?: string;
  x2?: string;
}): string[] {
  return [
    c.back,
    c.head ?? c.back,
    c.bill ?? "#2a2420",
    c.legs ?? "#4a4038",
    c.belly ?? c.back,
    c.coverts ?? c.back,
    c.flight ?? c.coverts ?? c.back,
    c.tail ?? c.back,
    c.face ?? c.head ?? c.back,
    c.collar ?? "#f2efe8",
    c.accent ?? "#c4383f",
    "#7a2a2a",
    c.x1 ?? "#e8c43a",
    c.x2 ?? "#2a6ab8",
    "#ffffff",
    "#000000",
  ];
}

const FEATHER = (wool: number, freq: number): Coat => ({ wool, freq });

const birdEye = (iris: string, o: Partial<EyeStyle> = {}): EyeStyle => ({
  iris,
  irisLow: iris,
  pupil: "#100c0a",
  pupilK: 0.55,
  size: 0.56,
  ...o,
});

function bird(
  o: Omit<AnimalSpec, "plan" | "family" | "motion"> & {
    shape: BirdShape;
    flight: FlightProfile;
    idles?: IdleProfile;
    motion?: Partial<BirdMotion>;
    extra?: (k: Kit, p: BirdPlan) => void;
    tune?: (p: BirdPlan) => void;
  },
): AnimalSpec {
  const { shape, flight, idles, motion, extra, tune, ...rest } = o;
  return {
    ...rest,
    family: "bird",
    plan: (lod) => {
      const p = birdPlan(shape);
      p.res = [1, 0.55, 0.3][lod ?? 0];
      tune?.(p);
      if (extra) p.extra = extra;
      return { kit: birdKit(p), h: shape.h, woolNormal: 0.4 };
    },
    motion: {
      kind: "bird",
      flight,
      idles: idles ?? { weights: { look: 4, groom: 2, graze: 1, shake: 0.5, sleep: 0.5 }, gap: [0.8, 3] },
      pitch: shape.pitch,
      ...motion,
    },
  };
}

// ---------------------------------------------------------------- condor

export const CONDOR = bird({
  key: "condor",
  name: { es: "cóndor andino", en: "Andean condor" },
  latin: "Vultur gryphus",
  size: 3.1,
  speeds: { walk: 0.6, run: 12, max: 20 },
  shape: {
    h: 0.024,
    by: 0.64,
    body: [0.2, 0.2, 0.36],
    pitch: -0.5,
    neck: { len: 0.2, angle: 0.55, r: [0.075, 0.05] },
    head: [0.06, 0.062, 0.075],
    bill: {
      len: 0.09,
      depth: 0.05,
      width: 0.04,
      hook: 0.03,
      lower: 0.4,
      bands: [
        [0, B.face],
        [0.35, B.bill],
      ],
    },
    wing: {
      span: 1.42,
      chord: [0.42, 0.56, 0.3],
      elbow: 0.3,
      wrist: 0.56,
      sweep: 0.12,
      thick: 0.07,
      fingers: { n: 6, len: 0.32 },
      notch: { n: 9, k: 0.12 },
      covert: 0.4,
      patch: { t0: 0.04, t1: 0.6, from: 0.38, slot: B.collar },
    },
    tail: { len: 0.34, width: 0.28, pitch: 0.35, n: 5 },
    legs: { hip: 0.42, r: [0.05, 0.02], toe: 0.08, thigh: 0.6 },
    coat: FEATHER(0.016, 22),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.032 },
    slots: { neck: B.head },
  },
  extra: (k, p) => {
    // The white ruff at the base of the bare neck, and the male's comb (caruncle) on the crown.
    const a = p.neck.a;
    k.add(k.ell(add(a, [0, 0.02, -0.02]), [0.13, 0.08, 0.11], "neck0", 0.03, B.collar, FEATHER(0.025, 30)));
    const h = p.head.c;
    k.add(k.ell(add(h, [0, p.head.r[1] * 0.85, p.head.r[2] * 0.2]), [0.014, 0.035, 0.06], "head", 0.012, B.face));
  },
  palette: bpal({
    back: "#1d1a1a",
    head: "#9a6458",
    bill: "#d9cdb2",
    legs: "#8a8478",
    belly: "#221e1e",
    coverts: "#1d1a1a",
    flight: "#1d1a1a",
    tail: "#1a1717",
    face: "#7a3a34",
    collar: "#f2efe8",
  }),
  eye: birdEye("#6a2a1a", { size: 0.5 }),
  flight: { style: "soarer", flapHz: 1.1, ground: "walk", landHeight: 2.5 },
  idles: { weights: { look: 4, groom: 2, shake: 0.6, sleep: 0.5 }, gap: [1.5, 5] },
});

// ---------------------------------------------------------------- parrots, toucan, hummingbird

const MACAW_PAL = bpal({
  back: "#c8302a",
  head: "#c8302a",
  bill: "#ece2d0",
  legs: "#4a4a4a",
  belly: "#c8302a",
  coverts: "#f0c430",
  flight: "#2a5ab0",
  tail: "#c8302a",
  face: "#f4efe6",
  accent: "#1e1a18",
  x1: "#3a9a5a",
  x2: "#2a5ab0",
});

export const MACAW = bird({
  key: "macaw",
  name: { es: "guacamayo", en: "macaw" },
  latin: "Ara macao",
  size: 0.9,
  speeds: { walk: 0.2, run: 9, max: 14 },
  shape: {
    h: 0.008,
    by: 0.26,
    body: [0.06, 0.068, 0.12],
    pitch: -0.95,
    neck: { len: 0.05, angle: 0.35, r: [0.046, 0.042] },
    head: [0.045, 0.048, 0.05],
    bill: { len: 0.045, depth: 0.06, width: 0.035, hook: 0.035, lower: 0.6, lowerSlot: B.accent, droop: 0.4 },
    wing: {
      span: 0.44,
      chord: [0.13, 0.15, 0.05],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.12,
      thick: 0.03,
      notch: { n: 8, k: 0.1 },
      covert: 0.38,
      tips: { from: 0.6, slot: B.x2 },
    },
    tail: { len: 0.45, width: 0.08, pitch: 0.48, n: 3 },
    legs: { hip: 0.17, r: [0.014, 0.0055], toe: 0.026 },
    coat: FEATHER(0.004, 80),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.05 },
  },
  palette: MACAW_PAL,
  variants: {
    scarlet: MACAW_PAL,
    "blue-yellow": bpal({
      back: "#2a6ab8",
      head: "#3a9a5a",
      bill: "#1e1a18",
      legs: "#4a4a4a",
      belly: "#f0c430",
      coverts: "#2a6ab8",
      flight: "#1e4a9a",
      tail: "#2a6ab8",
      face: "#f4efe6",
      accent: "#1e1a18",
      x2: "#1e4a9a",
    }),
    "red-green": bpal({
      back: "#b8282a",
      head: "#b8282a",
      bill: "#ece2d0",
      belly: "#b8282a",
      coverts: "#3a9a5a",
      flight: "#2a5ab0",
      tail: "#b8282a",
      face: "#f4efe6",
      accent: "#1e1a18",
      x2: "#2a5ab0",
    }),
  },
  eye: birdEye("#e8dca0", { size: 0.32, patch: { color: "#f4efe6", kind: "face" }, lines: "#b8282a" }),
  flight: { style: "flapper", flapHz: 3.2, ground: "walk", landHeight: 2 },
  idles: { weights: { look: 4, groom: 3, yawn: 1, shake: 0.6, graze: 0.5 }, gap: [0.6, 2.5] },
});

export const TOUCAN = bird({
  key: "toucan",
  name: { es: "tucán", en: "toucan" },
  latin: "Ramphastos tucanus",
  size: 0.6,
  speeds: { walk: 0.2, run: 7, max: 10 },
  shape: {
    h: 0.0075,
    by: 0.2,
    body: [0.07, 0.075, 0.11],
    pitch: -0.7,
    neck: { len: 0.04, angle: 0.4, r: [0.05, 0.045] },
    head: [0.048, 0.05, 0.05],
    bill: {
      len: 0.17,
      depth: 0.065,
      width: 0.04,
      hook: 0.015,
      lower: 0.75,
      droop: 0.12,
      bands: [
        [0, B.accent],
        [0.12, B.bill],
        [0.8, B.x1],
      ],
    },
    wing: {
      span: 0.3,
      chord: [0.11, 0.12, 0.05],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.05,
      thick: 0.03,
      notch: { n: 6, k: 0.1 },
    },
    tail: { len: 0.17, width: 0.08, pitch: 0.6, n: 3 },
    legs: { hip: 0.13, r: [0.014, 0.0055], toe: 0.026 },
    coat: FEATHER(0.004, 80),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.04 },
    slots: { breast: B.collar },
  },
  palette: bpal({
    back: "#1a1818",
    head: "#1a1818",
    bill: "#e8b830",
    legs: "#5a7ab8",
    belly: "#1a1818",
    collar: "#f4efe0",
    accent: "#1a1818",
    x1: "#c84a2a",
  }),
  eye: birdEye("#2a3a6a", { size: 0.4, ring: "#4aa0d8", ringW: 30 }),
  flight: { style: "flapper", flapHz: 3.5, ground: "hop", landHeight: 2 },
});

export const HUMMINGBIRD = bird({
  key: "hummingbird",
  name: { es: "picaflor", en: "hummingbird" },
  latin: "Colibri coruscans",
  size: 0.15,
  speeds: { walk: 0.05, run: 4, max: 8 },
  shape: {
    h: 0.0022,
    by: 0.032,
    body: [0.011, 0.012, 0.028],
    pitch: -0.5,
    neck: { len: 0.006, angle: 0.4, r: [0.009, 0.0085] },
    head: [0.0095, 0.0095, 0.01],
    bill: { len: 0.026, depth: 0.0045, width: 0.003, droop: 0.05 },
    wing: { span: 0.058, chord: [0.014, 0.018, 0.005], elbow: 0.2, wrist: 0.4, sweep: 0.02, thick: 0.0045 },
    tail: { len: 0.025, width: 0.016, pitch: 0.4, n: 3 },
    legs: { hip: 0.022, r: [0.0035, 0.0018], toe: 0.005 },
    coat: FEATHER(0.0008, 400),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.008 },
    slots: { breast: B.belly },
  },
  palette: bpal({
    back: "#3a9a5a",
    head: "#3a9a5a",
    bill: "#1a1818",
    legs: "#1a1818",
    belly: "#4ab070",
    coverts: "#2e8a4e",
    flight: "#2a3a2e",
    tail: "#2a6a8a",
    face: "#7a5ac8",
  }),
  eye: birdEye("#1a1210", { size: 0.5, patch: { color: "#7a5ac8", kind: "mask" } }),
  flight: { style: "hoverer", flapHz: 16, ground: "hop", landHeight: 0.3 },
  idles: { weights: { look: 5, groom: 1 }, gap: [0.3, 1.5] },
});

// ---------------------------------------------------------------- seabirds

export const PELICAN = bird({
  key: "pelican",
  name: { es: "pelícano peruano", en: "Peruvian pelican" },
  latin: "Pelecanus thagus",
  size: 2.4,
  speeds: { walk: 0.5, run: 9, max: 14 },
  shape: {
    h: 0.02,
    by: 0.48,
    body: [0.17, 0.17, 0.38],
    pitch: -0.3,
    neck: { len: 0.38, angle: 0.25, r: [0.07, 0.05], s: 0.25 },
    head: [0.055, 0.058, 0.075],
    bill: {
      len: 0.38,
      depth: 0.04,
      width: 0.05,
      hook: 0.025,
      lower: 0.5,
      pouch: 0.045,
      droop: 0.55,
      bands: [
        [0, B.bill],
        [0.85, B.accent],
      ],
    },
    wing: {
      span: 1.15,
      chord: [0.32, 0.38, 0.18],
      elbow: 0.35,
      wrist: 0.58,
      sweep: 0.1,
      thick: 0.05,
      fingers: { n: 5, len: 0.22 },
      notch: { n: 9, k: 0.1 },
      covert: 0.45,
    },
    tail: { len: 0.2, width: 0.2, pitch: 0.3, n: 5 },
    legs: { hip: 0.28, r: [0.04, 0.02], toe: 0.08, webbed: true },
    coat: FEATHER(0.01, 28),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.03 },
  },
  palette: bpal({
    back: "#5e5a58",
    head: "#efe8da",
    bill: "#c89a5a",
    legs: "#3a3634",
    belly: "#4a4644",
    coverts: "#8a8480",
    flight: "#2a2624",
    tail: "#3a3634",
    accent: "#c84a3a",
    face: "#c8a080",
  }),
  eye: birdEye("#e8dcb0", { size: 0.38, ring: "#d8b098", ringW: 16 }),
  flight: { style: "soarer", flapHz: 1.4, ground: "walk", landHeight: 1.5 },
  idles: { weights: { look: 3, groom: 3, yawn: 1, shake: 0.5, sleep: 0.5 }, gap: [1.5, 5] },
});

export const GUANAY = bird({
  key: "guanay",
  name: { es: "guanay", en: "guanay cormorant" },
  latin: "Leucocarbo bougainvillii",
  size: 1.0,
  speeds: { walk: 0.4, run: 9, max: 13 },
  shape: {
    h: 0.01,
    by: 0.3,
    body: [0.09, 0.095, 0.22],
    pitch: -0.95,
    neck: { len: 0.16, angle: 0.3, r: [0.045, 0.035] },
    head: [0.035, 0.04, 0.05],
    bill: { len: 0.07, depth: 0.022, width: 0.016, hook: 0.01, droop: 0.1 },
    wing: {
      span: 0.5,
      chord: [0.13, 0.15, 0.05],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.1,
      thick: 0.025,
      notch: { n: 8, k: 0.08 },
    },
    tail: { len: 0.13, width: 0.08, pitch: 0.8, n: 3 },
    legs: { hip: 0.1, r: [0.02, 0.012], toe: 0.05, webbed: true, back: -0.12 },
    coat: FEATHER(0.004, 60),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.03 },
    slots: { breast: B.belly, neck: B.back },
  },
  palette: bpal({
    back: "#23262e",
    head: "#23262e",
    bill: "#8a6a5a",
    legs: "#d88a80",
    belly: "#f2efe8",
    tail: "#1a1c22",
  }),
  eye: birdEye("#3a5a3a", { size: 0.42, ring: "#c84a3a", ringW: 22 }),
  flight: { style: "flapper", flapHz: 4.5, ground: "walk", landHeight: 1 },
  idles: { weights: { look: 3, groom: 3, shake: 1, sleep: 0.5 }, gap: [1, 4] },
});

export const GULL = bird({
  key: "gull",
  name: { es: "gaviota", en: "gull" },
  latin: "Larus belcheri",
  size: 1.3,
  speeds: { walk: 0.5, run: 8, max: 12 },
  shape: {
    h: 0.008,
    by: 0.2,
    body: [0.07, 0.075, 0.17],
    pitch: -0.18,
    neck: { len: 0.06, angle: 0.4, r: [0.045, 0.04] },
    head: [0.042, 0.044, 0.055],
    bill: {
      len: 0.055,
      depth: 0.018,
      width: 0.013,
      hook: 0.008,
      droop: 0.05,
      bands: [
        [0, B.bill],
        [0.8, B.accent],
      ],
    },
    wing: {
      span: 0.62,
      chord: [0.12, 0.14, 0.03],
      elbow: 0.3,
      wrist: 0.52,
      sweep: 0.14,
      thick: 0.025,
      covert: 0.6,
      tips: { from: 0.72, slot: B.x2 },
    },
    tail: { len: 0.12, width: 0.1, pitch: 0.1, n: 4 },
    legs: { hip: 0.12, r: [0.016, 0.009], toe: 0.04, webbed: true },
    coat: FEATHER(0.002, 90),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.024 },
    slots: { body: B.coverts },
  },
  palette: bpal({
    back: "#f4f2ee",
    head: "#f4f2ee",
    bill: "#e8c43a",
    legs: "#e8c43a",
    belly: "#f4f2ee",
    coverts: "#8a9098",
    flight: "#8a9098",
    tail: "#f4f2ee",
    accent: "#c83a2a",
    x2: "#1e1c1a",
  }),
  eye: birdEye("#e8dcb0", { size: 0.4 }),
  flight: { style: "soarer", flapHz: 2.6, ground: "walk", landHeight: 1 },
});

export const PENGUIN = bird({
  key: "penguin",
  name: { es: "pingüino de Humboldt", en: "Humboldt penguin" },
  latin: "Spheniscus humboldti",
  size: 0.7,
  speeds: { walk: 0.4, run: 2.5, max: 4 },
  shape: {
    h: 0.013,
    by: 0.3,
    body: [0.12, 0.12, 0.27],
    pitch: -1.35,
    neck: { len: 0.04, angle: 0.2, r: [0.085, 0.075] },
    head: [0.055, 0.06, 0.065],
    bill: {
      len: 0.06,
      depth: 0.025,
      width: 0.018,
      hook: 0.008,
      droop: 0.15,
      bands: [
        [0, B.face],
        [0.3, B.bill],
      ],
    },
    wing: {
      span: 0.2,
      chord: [0.07, 0.07, 0.035],
      elbow: 0.4,
      wrist: 0.7,
      sweep: 0.04,
      thick: 0.02,
      flipper: true,
      under: B.belly,
    },
    tail: { len: 0.05, width: 0.06, pitch: 0.9, n: 3 },
    legs: { hip: 0.08, r: [0.03, 0.018], toe: 0.05, webbed: true },
    coat: FEATHER(0.0015, 90),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.03 },
    slots: { breast: B.belly, neck: B.back },
  },
  extra: (k, p) => {
    // The black breast band and the white stripe from the eye down round the throat.
    const c = p.breast.c;
    k.bands.push({
      prims: k.group("breast"),
      at: (q) => q[1] - c[1] - 0.12 + Math.abs(q[0]) * 0.3,
      stops: [-0.015, 0.015],
      slots: [B.belly, B.back, B.belly],
    });
  },
  palette: bpal({
    back: "#262628",
    head: "#262628",
    bill: "#2a2624",
    legs: "#2a2624",
    belly: "#f4f2ee",
    coverts: "#262628",
    flight: "#262628",
    tail: "#262628",
    face: "#d88a80",
  }),
  eye: birdEye("#6a3a2a", { size: 0.38, ring: "#d88a80", ringW: 18, patch: { color: "#f4f2ee", kind: "brow" } }),
  flight: { style: "swimmer", flapHz: 2, ground: "waddle", landHeight: 0 },
  idles: { weights: { look: 4, groom: 2, shake: 1, yawn: 1, sleep: 1 }, gap: [1, 4] },
});

// ---------------------------------------------------------------- waders, water birds

export const HERON = bird({
  key: "heron",
  name: { es: "garza blanca", en: "great egret" },
  latin: "Ardea alba",
  size: 1.4,
  speeds: { walk: 0.4, run: 7, max: 11 },
  shape: {
    h: 0.01,
    by: 0.72,
    body: [0.07, 0.08, 0.17],
    pitch: -0.4,
    neck: { len: 0.4, angle: 0.15, r: [0.035, 0.025], s: 0.55 },
    head: [0.026, 0.03, 0.04],
    bill: { len: 0.12, depth: 0.018, width: 0.012, droop: 0.05 },
    wing: {
      span: 0.7,
      chord: [0.2, 0.24, 0.1],
      elbow: 0.32,
      wrist: 0.56,
      sweep: 0.06,
      thick: 0.03,
      notch: { n: 9, k: 0.1 },
    },
    tail: { len: 0.12, width: 0.1, pitch: 0.45, n: 4 },
    legs: { hip: 0.62, r: [0.014, 0.008], toe: 0.07 },
    coat: FEATHER(0.003, 70),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.018 },
  },
  palette: bpal({ back: "#f6f4ee", bill: "#e8b830", legs: "#1e1c1a" }),
  variants: {
    egret: bpal({ back: "#f6f4ee", bill: "#e8b830", legs: "#1e1c1a" }),
    cocoi: bpal({
      back: "#8a929a",
      head: "#f2efe8",
      belly: "#f2efe8",
      bill: "#e8b830",
      legs: "#2a2826",
      flight: "#3a3e44",
      coverts: "#8a929a",
      face: "#1e1c1a",
    }),
  },
  eye: birdEye("#e8c43a", { size: 0.42, ring: "#a8c04a", ringW: 14 }),
  flight: { style: "flapper", flapHz: 2.2, ground: "walk", landHeight: 1.5 },
  idles: { weights: { look: 3, graze: 3, groom: 2, sleep: 0.5 }, gap: [1.5, 5] },
  motion: { neckS: 0.55, oneLeg: true },
});

export const FLAMINGO = bird({
  key: "flamingo",
  name: { es: "parihuana (flamenco)", en: "Andean flamingo" },
  latin: "Phoenicoparrus andinus",
  size: 1.5,
  speeds: { walk: 0.5, run: 8, max: 12 },
  shape: {
    h: 0.011,
    by: 0.98,
    body: [0.1, 0.1, 0.2],
    pitch: -0.1,
    neck: { len: 0.55, angle: 0.25, r: [0.04, 0.026], s: 0.45 },
    head: [0.03, 0.036, 0.045],
    bill: {
      len: 0.1,
      depth: 0.035,
      width: 0.022,
      hook: 0.045,
      lower: 0.9,
      droop: 0.6,
      bands: [
        [0, B.bill],
        [0.5, B.accent],
      ],
    },
    wing: {
      span: 0.75,
      chord: [0.2, 0.24, 0.08],
      elbow: 0.32,
      wrist: 0.56,
      sweep: 0.08,
      thick: 0.035,
      covert: 0.5,
      notch: { n: 8, k: 0.08 },
    },
    tail: { len: 0.1, width: 0.12, pitch: 0.2, n: 4 },
    legs: { hip: 0.82, r: [0.017, 0.01], toe: 0.06, webbed: true },
    coat: FEATHER(0.004, 60),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.02 },
  },
  palette: bpal({
    back: "#f0b8c0",
    head: "#f0b8c0",
    bill: "#f0e070",
    legs: "#e8d860",
    belly: "#f4c4c8",
    coverts: "#e86a80",
    flight: "#1e1c1a",
    tail: "#f0b8c0",
    accent: "#1e1c1a",
  }),
  eye: birdEye("#e8a03a", { size: 0.4 }),
  flight: { style: "flapper", flapHz: 2.6, ground: "walk", landHeight: 1.5 },
  idles: { weights: { look: 2, graze: 4, groom: 3, sleep: 1 }, gap: [1, 4] },
  motion: { neckS: 0.4, oneLeg: true },
});

export const GREBE = bird({
  key: "grebe",
  name: { es: "zambullidor del Titicaca", en: "Titicaca grebe" },
  latin: "Rollandia microptera",
  size: 0.45,
  speeds: { walk: 0.2, run: 1.2, max: 2 },
  shape: {
    h: 0.006,
    by: 0.08,
    body: [0.07, 0.055, 0.14],
    pitch: 0.05,
    neck: { len: 0.07, angle: 0.25, r: [0.035, 0.03] },
    head: [0.03, 0.035, 0.04],
    bill: {
      len: 0.045,
      depth: 0.014,
      width: 0.01,
      droop: 0.05,
      bands: [
        [0, B.bill],
        [0.4, B.x1],
      ],
    },
    wing: { span: 0.15, chord: [0.07, 0.08, 0.03], elbow: 0.3, wrist: 0.55, sweep: 0.03, thick: 0.02 },
    tail: { len: 0.02, width: 0.04, pitch: 0.3, n: 3 },
    legs: { hip: 0.04, r: [0.012, 0.008], toe: 0.04, webbed: true, back: -0.12 },
    coat: FEATHER(0.003, 70),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.022 },
    slots: { breast: B.belly, neck: B.accent },
  },
  extra: (k, p) => {
    // A white throat and a small crest.
    k.add(
      k.ell(
        add(p.head.c, [0, p.head.r[1] * 0.75, -p.head.r[2] * 0.2]),
        [0.018, 0.016, 0.028],
        "head",
        0.01,
        B.back,
        FEATHER(0.004, 120),
      ),
    );
  },
  palette: bpal({
    back: "#3a302a",
    head: "#2a2420",
    bill: "#e8c43a",
    legs: "#3a3430",
    belly: "#efe6d6",
    accent: "#8a4a2a",
    x1: "#2a2420",
  }),
  eye: birdEye("#c8302a", { size: 0.42 }),
  flight: { style: "swimmer", flapHz: 4, ground: "waddle", landHeight: 0 },
  idles: { weights: { look: 4, groom: 2, shake: 1 }, gap: [1, 3] },
});

export const DUCK = bird({
  key: "duck",
  name: { es: "pato de los torrentes", en: "torrent duck" },
  latin: "Merganetta armata",
  size: 0.6,
  speeds: { walk: 0.3, run: 6, max: 10 },
  shape: {
    h: 0.0065,
    by: 0.11,
    body: [0.07, 0.06, 0.15],
    pitch: 0,
    neck: { len: 0.07, angle: 0.35, r: [0.03, 0.026] },
    head: [0.032, 0.036, 0.042],
    bill: { len: 0.045, depth: 0.016, width: 0.022, flat: true, droop: 0.15 },
    wing: { span: 0.3, chord: [0.09, 0.1, 0.04], elbow: 0.3, wrist: 0.55, sweep: 0.1, thick: 0.02, covert: 0.5 },
    tail: { len: 0.1, width: 0.06, pitch: 0.15, n: 3 },
    legs: { hip: 0.06, r: [0.014, 0.009], toe: 0.04, webbed: true },
    coat: FEATHER(0.002, 90),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.022 },
    slots: { neck: B.head },
  },
  extra: (k) => {
    // The male's black stripes on the white head: crown and a line through the eye down the neck.
    k.bands.push({
      prims: [...k.group("head"), ...k.group("neck")],
      at: (q) => Math.abs(Math.sin(q[1] * 85 + q[2] * 20)),
      stops: [0.3],
      slots: [B.face, B.head],
    });
  },
  palette: bpal({
    back: "#4a423c",
    head: "#f2efe8",
    bill: "#c83a2a",
    legs: "#c83a2a",
    belly: "#6a5444",
    coverts: "#5a524c",
    flight: "#2a6a5a",
    tail: "#3a342e",
    face: "#1e1c1a",
  }),
  eye: birdEye("#3a1a12", { size: 0.42 }),
  flight: { style: "flapper", flapHz: 5, ground: "waddle", landHeight: 0.8 },
});

// ---------------------------------------------------------------- ground and forest birds

export const DOVE = bird({
  key: "dove",
  name: { es: "cuculí (paloma)", en: "eared dove" },
  latin: "Zenaida auriculata",
  size: 0.45,
  speeds: { walk: 0.3, run: 8, max: 12 },
  shape: {
    h: 0.005,
    by: 0.075,
    body: [0.045, 0.05, 0.09],
    pitch: -0.2,
    neck: { len: 0.03, angle: 0.4, r: [0.03, 0.026] },
    head: [0.025, 0.027, 0.03],
    bill: { len: 0.016, depth: 0.007, width: 0.006, droop: 0.15 },
    wing: { span: 0.22, chord: [0.07, 0.08, 0.025], elbow: 0.3, wrist: 0.55, sweep: 0.06, thick: 0.015, covert: 0.5 },
    tail: { len: 0.1, width: 0.045, pitch: 0.15, n: 3 },
    legs: { hip: 0.04, r: [0.008, 0.005], toe: 0.018 },
    coat: FEATHER(0.0015, 140),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.014 },
  },
  palette: bpal({
    back: "#9a8a7a",
    head: "#a8968a",
    bill: "#2a2420",
    legs: "#c87a7a",
    belly: "#c8a8a0",
    coverts: "#8a7a6a",
    flight: "#5a524c",
    tail: "#7a6e64",
  }),
  eye: birdEye("#1e1612", { size: 0.46, ring: "#7aa0c8", ringW: 8 }),
  flight: { style: "flapper", flapHz: 7, ground: "walk", landHeight: 0.8 },
  idles: { weights: { look: 3, graze: 4, groom: 1, shake: 0.5 }, gap: [0.4, 2] },
  motion: { headBob: true },
});

export const SPARROW = bird({
  key: "sparrow",
  name: { es: "pichitanka (gorrión)", en: "rufous-collared sparrow" },
  latin: "Zonotrichia capensis",
  size: 0.22,
  speeds: { walk: 0.3, run: 6, max: 9 },
  shape: {
    h: 0.0028,
    by: 0.03,
    body: [0.02, 0.022, 0.04],
    pitch: -0.35,
    neck: { len: 0.01, angle: 0.4, r: [0.015, 0.014] },
    head: [0.014, 0.015, 0.016],
    bill: { len: 0.01, depth: 0.007, width: 0.006, droop: 0.1 },
    wing: { span: 0.1, chord: [0.03, 0.035, 0.012], elbow: 0.3, wrist: 0.55, sweep: 0.03, thick: 0.007, covert: 0.5 },
    tail: { len: 0.05, width: 0.022, pitch: 0.3, n: 3 },
    legs: { hip: 0.018, r: [0.004, 0.0025], toe: 0.008 },
    coat: FEATHER(0.0008, 250),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.008 },
    slots: { neck: B.collar },
  },
  extra: (k) => {
    // Grey and black stripes on the crown.
    k.bands.push({
      prims: k.group("head"),
      at: (q) => Math.abs(Math.sin(q[0] * 300)),
      stops: [0.5],
      slots: [B.face, B.head],
    });
  },
  palette: bpal({
    back: "#8a6a4a",
    head: "#9a9690",
    bill: "#3a3430",
    legs: "#c8a888",
    belly: "#e8e2d8",
    coverts: "#7a5a3a",
    flight: "#4a3a2a",
    tail: "#5a4a3a",
    face: "#2a2420",
    collar: "#b8622a",
  }),
  eye: birdEye("#1e1612", { size: 0.5, patch: { color: "#2a2420", kind: "stripe" } }),
  flight: { style: "flapper", flapHz: 12, ground: "hop", landHeight: 0.5 },
  idles: { weights: { look: 5, graze: 4, groom: 1, shake: 0.6 }, gap: [0.2, 1.2] },
});

export const TINAMOU = bird({
  key: "tinamou",
  name: { es: "perdiz (keu)", en: "ornate tinamou" },
  latin: "Nothoprocta ornata",
  size: 0.5,
  speeds: { walk: 0.5, run: 3, max: 8 },
  shape: {
    h: 0.0075,
    by: 0.17,
    body: [0.085, 0.085, 0.14],
    pitch: -0.05,
    neck: { len: 0.07, angle: 0.45, r: [0.035, 0.026] },
    head: [0.026, 0.03, 0.035],
    bill: { len: 0.032, depth: 0.01, width: 0.009, hook: 0.008, droop: 0.25 },
    wing: { span: 0.28, chord: [0.1, 0.11, 0.05], elbow: 0.3, wrist: 0.55, sweep: 0.03, thick: 0.02 },
    tail: { len: 0.03, width: 0.05, pitch: 0.4, n: 3 },
    legs: { hip: 0.11, r: [0.014, 0.008], toe: 0.03, thigh: 0.6 },
    coat: FEATHER(0.004, 70),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.016 },
  },
  tune: (p) => {
    p.slots = { body: B.back, breast: B.belly };
  },
  extra: (k) => {
    // Barred and spotted back.
    k.bands.push({
      prims: k.group("torso"),
      at: (q) => Math.sin(q[2] * 90) * Math.sin(q[0] * 70),
      stops: [0.45],
      slots: [B.back, B.accent],
    });
  },
  palette: bpal({
    back: "#8a7056",
    head: "#b8a890",
    bill: "#3a3430",
    legs: "#c8b070",
    belly: "#a89880",
    coverts: "#8a7056",
    flight: "#6a5644",
    tail: "#6a5644",
    accent: "#3a2e22",
  }),
  eye: birdEye("#3a2a1a", { size: 0.46, patch: { color: "#e8e0d0", kind: "brow" } }),
  flight: { style: "runner", flapHz: 9, ground: "walk", landHeight: 0.6 },
  idles: { weights: { look: 4, graze: 4, groom: 1 }, gap: [0.5, 2.5] },
  motion: { headBob: true },
});

export const HOATZIN = bird({
  key: "hoatzin",
  name: { es: "shansho", en: "hoatzin" },
  latin: "Opisthocomus hoazin",
  size: 0.7,
  speeds: { walk: 0.2, run: 4, max: 6 },
  shape: {
    h: 0.0075,
    by: 0.24,
    body: [0.065, 0.075, 0.13],
    pitch: -0.65,
    neck: { len: 0.1, angle: 0.4, r: [0.03, 0.022] },
    head: [0.025, 0.027, 0.03],
    bill: { len: 0.022, depth: 0.014, width: 0.012, hook: 0.006, droop: 0.2 },
    wing: {
      span: 0.3,
      chord: [0.12, 0.13, 0.06],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.05,
      thick: 0.025,
      covert: 0.45,
      tips: { from: 0.55, slot: B.accent },
    },
    tail: { len: 0.26, width: 0.1, pitch: 0.75, n: 5 },
    legs: { hip: 0.13, r: [0.013, 0.005], toe: 0.026 },
    coat: FEATHER(0.005, 70),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.024 },
    slots: { neck: B.belly },
  },
  extra: (k, p) => {
    // The spiky crest: a fan of thin feathers on the crown, on their own spring-free bone.
    const h = p.head.c;
    for (let i = 0; i < 7; i++) {
      const a = -0.5 + (i / 6) * 1.2;
      const base: Vec3 = [0, h[1] + p.head.r[1] * 0.7, h[2] - 0.005 - i * 0.004];
      const tip: Vec3 = [Math.sin(i * 1.7) * 0.004, base[1] + Math.cos(a) * 0.05, base[2] - Math.sin(a + 0.6) * 0.04];
      k.add(k.cone(base, tip, 0.004, 0.0015, "head", 0.002, B.collar));
    }
    // Pale streaks on the back and the buff tail tip.
    k.bands.push({
      prims: k.group("tail"),
      at: (q) => -q[2] - (-p.tail.base[2] + p.tail.len * 0.75),
      stops: [0],
      slots: [B.tail, B.belly],
    });
  },
  palette: bpal({
    back: "#5a4632",
    head: "#b8865a",
    bill: "#3a3028",
    legs: "#4a4038",
    belly: "#d8b888",
    coverts: "#6a5440",
    flight: "#4a3828",
    tail: "#3a2e22",
    accent: "#a84a2a",
    collar: "#a8784a",
  }),
  eye: birdEye("#c8302a", { size: 0.38, ring: "#4a9ad8", ringW: 26 }),
  flight: { style: "flapper", flapHz: 3, ground: "hop", landHeight: 1 },
  idles: { weights: { look: 4, groom: 2, shake: 0.5, sleep: 0.5 }, gap: [1, 3] },
});

// ---------------------------------------------------------------- phase B: puna ibis, huallata, small parrots

export const IBIS = bird({
  key: "ibis",
  name: { es: "yanavico (ibis de la puna)", en: "puna ibis" },
  latin: "Plegadis ridgwayi",
  size: 0.9,
  speeds: { walk: 0.4, run: 7, max: 11 },
  shape: {
    h: 0.008,
    by: 0.32,
    body: [0.06, 0.065, 0.14],
    pitch: -0.25,
    neck: { len: 0.15, angle: 0.4, r: [0.03, 0.022], s: 0.2 },
    head: [0.024, 0.027, 0.032],
    // The long, down-curved probing bill.
    bill: { len: 0.13, depth: 0.014, width: 0.01, hook: 0.035, droop: 0.55 },
    wing: {
      span: 0.44,
      chord: [0.13, 0.15, 0.06],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.06,
      thick: 0.025,
      covert: 0.5,
      notch: { n: 8, k: 0.08 },
    },
    tail: { len: 0.08, width: 0.06, pitch: 0.3, n: 3 },
    legs: { hip: 0.27, r: [0.012, 0.0055], toe: 0.05 },
    coat: FEATHER(0.003, 80),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.02 },
  },
  palette: bpal({
    back: "#4a2a2e",
    head: "#3a2428",
    bill: "#5a2a2a",
    legs: "#4a2a2a",
    belly: "#42262a",
    coverts: "#2e4a3a",
    flight: "#24382e",
    tail: "#2a3a30",
  }),
  eye: birdEye("#c83a2a", { size: 0.42 }),
  flight: { style: "flapper", flapHz: 3, ground: "walk", landHeight: 1.2 },
  idles: { weights: { graze: 5, look: 2, groom: 1, shake: 0.4, stretch: 0.3 }, gap: [0.6, 2.5] },
});

export const GOOSE = bird({
  key: "goose",
  name: { es: "huallata (ganso andino)", en: "Andean goose" },
  latin: "Oressochen melanopterus",
  size: 0.9,
  speeds: { walk: 0.45, run: 7, max: 11 },
  shape: {
    h: 0.009,
    by: 0.3,
    body: [0.1, 0.1, 0.2],
    pitch: -0.18,
    neck: { len: 0.17, angle: 0.3, r: [0.05, 0.038], s: 0.1 },
    head: [0.038, 0.042, 0.048],
    bill: { len: 0.045, depth: 0.024, width: 0.022, droop: 0.15 },
    wing: { span: 0.55, chord: [0.17, 0.19, 0.07], elbow: 0.3, wrist: 0.55, sweep: 0.1, thick: 0.035, covert: 0.4 },
    tail: { len: 0.08, width: 0.1, pitch: 0.2, n: 4 },
    legs: { hip: 0.17, r: [0.02, 0.01], toe: 0.05, webbed: true },
    coat: FEATHER(0.004, 60),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.024 },
  },
  palette: bpal({
    back: "#f4f2ee",
    head: "#f4f2ee",
    bill: "#e89a9a",
    legs: "#e8a0a0",
    belly: "#f6f4f0",
    coverts: "#f4f2ee",
    flight: "#1e1c1a",
    tail: "#1e1c1a",
  }),
  eye: birdEye("#3a2a1a", { size: 0.44 }),
  flight: { style: "flapper", flapHz: 3.2, ground: "walk", landHeight: 1 },
  idles: { weights: { graze: 5, look: 2, groom: 2, shake: 0.5, stretch: 0.4, sleep: 0.5 }, gap: [0.8, 3] },
});

const PARROT_PAL = bpal({
  back: "#5aa04a",
  head: "#6aaa4a",
  bill: "#d8ccb0",
  legs: "#8a8478",
  belly: "#6aaa50",
  coverts: "#4a904a",
  flight: "#2a5ab0",
  tail: "#5a9a40",
  face: "#e8e8e0",
  accent: "#c83a2a",
  x2: "#2a5ab0",
});

export const PARROT = bird({
  key: "parrot",
  name: { es: "loro", en: "parrot" },
  latin: "Amazona farinosa / Pionus menstruus",
  size: 0.45,
  speeds: { walk: 0.15, run: 8, max: 12 },
  shape: {
    h: 0.005,
    by: 0.17,
    body: [0.042, 0.047, 0.075],
    pitch: -0.9,
    neck: { len: 0.03, angle: 0.35, r: [0.032, 0.03] },
    head: [0.032, 0.034, 0.034],
    bill: { len: 0.026, depth: 0.034, width: 0.022, hook: 0.02, lower: 0.6, droop: 0.4 },
    wing: {
      span: 0.24,
      chord: [0.08, 0.09, 0.03],
      elbow: 0.3,
      wrist: 0.55,
      sweep: 0.08,
      thick: 0.018,
      covert: 0.4,
      tips: { from: 0.55, slot: B.x2 },
    },
    tail: { len: 0.11, width: 0.05, pitch: 0.55, n: 3 },
    legs: { hip: 0.11, r: [0.01, 0.004], toe: 0.018 },
    coat: FEATHER(0.002, 140),
    eye: { dir: [0.85, 0.35, 0.4], w: 0.024 },
  },
  palette: PARROT_PAL,
  variants: {
    mealy: PARROT_PAL,
    "blue-headed": bpal({
      back: "#4a9a4a",
      head: "#3a5ac8",
      bill: "#2a2420",
      legs: "#8a8478",
      belly: "#5aa04a",
      coverts: "#4a904a",
      flight: "#2a5ab0",
      tail: "#c83a3a",
      face: "#2a2a3a",
      accent: "#c83a2a",
      x2: "#2a4ab0",
    }),
  },
  eye: birdEye("#c8a040", { size: 0.36, ring: "#e8e8e0", ringW: 20 }),
  flight: { style: "flapper", flapHz: 5, ground: "walk", landHeight: 1.5 },
  idles: { weights: { look: 4, groom: 3, yawn: 1, shake: 0.6, stretch: 0.4 }, gap: [0.5, 2.5] },
});

export const BIRDS = {
  ibis: IBIS,
  goose: GOOSE,
  parrot: PARROT,
  condor: CONDOR,
  macaw: MACAW,
  toucan: TOUCAN,
  hummingbird: HUMMINGBIRD,
  pelican: PELICAN,
  guanay: GUANAY,
  gull: GULL,
  penguin: PENGUIN,
  heron: HERON,
  flamingo: FLAMINGO,
  grebe: GREBE,
  duck: DUCK,
  dove: DOVE,
  sparrow: SPARROW,
  tinamou: TINAMOU,
  hoatzin: HOATZIN,
};
