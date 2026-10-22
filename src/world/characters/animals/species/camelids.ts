/**
 * The four Andean camelids, all from one camelid plan (the approved llama's construction made parametric):
 *
 *   llama    Lama glama: tall, banana ears curving inward, a woolly barrel and neck, t'ikas (yarn tassels)
 *            at the ears; an optional pack (aguayo blanket and two saddlebags) on its own bone
 *   alpaca   Vicugna pacos: shorter, much fluffier (fleece to the knees, a topknot), short straight ears
 *   vicuña   Vicugna vicugna: slender and small, cinnamon back, white belly and a long white chest bib
 *   guanaco  Lama guanicoe: llama-sized and leaner, red-brown back, white belly, a grey face
 *
 * Coat variants for the llama: white, brown, black, spotted (white with brown patches), cafe (two tones).
 * Pure (no DOM, no Three).
 */

import type { Vec3 } from "../../sdf";
import { type Coat, type Kit, lerp3 } from "../kit";
import { Q, type QuadPlan, quadKit } from "../plan-quad";
import type { AnimalSpec, EyeStyle, QuadMotion } from "../spec";
import { recolor } from "../spec";

export interface CamelidShape {
  /** Overall scale (llama = 1). */
  s: number;
  /** Fleece amplitude multiplier (llama 1, alpaca ≈ 2, vicuña ≈ 0.35). */
  fluff: number;
  /** Neck length multiplier. */
  neck: number;
  /** Leg length multiplier (alpacas are short-legged). */
  legs: number;
  /** Banana ears (llama) or straight pointed ears. */
  banana: boolean;
  /** Leg wool reaches the knee (alpaca). */
  legWool?: boolean;
  /** Barrel girth multiplier. */
  girth?: number;
  /** Ear t'ikas and a pack bone. */
  tikas?: boolean;
  pack?: boolean;
  /** A long white bib on the chest (vicuña). */
  bib?: boolean;
  /** Topknot of fleece on the head (alpaca). */
  topknot?: number;
}

export function camelidPlan(c: CamelidShape): QuadPlan {
  const s = c.s;
  const L = c.legs;
  const g = c.girth ?? 1;
  // Llama numbers (the approved prototype), scaled: the leg multiplier stretches the heights below the barrel
  // (0..0.6) and lifts everything above it by the same amount.
  const Y = (y: number) => y + 0.84 * (L - 1) * Math.min(1, y / 0.6);
  const P = (x: number, y: number, z: number): Vec3 => [x * s, Y(y) * s, z * s];
  const fleece: Coat = { wool: 0.03 * c.fluff * s, freq: 6.5 / s };
  const neckTop = P(0, 0.84 + 0.66 * c.neck, 0.33 + 0.22 * c.neck);
  return {
    h: 0.026 * s,
    coat: fleece,
    short: c.fluff > 0.5 ? { wool: 0.004 * s, freq: 40 / s } : { wool: 0.003 * s, freq: 55 / s },
    body: { c: P(0, 0.85, -0.04), r: [0.27 * s * g, 0.26 * s * g, 0.44 * s] },
    chest: { c: P(0, 0.84, 0.25), r: [0.25 * s * g, 0.27 * s * g, 0.22 * s] },
    rump: { c: P(0, 0.87, -0.35), r: [0.25 * s * g, 0.25 * s * g, 0.22 * s] },
    neck: {
      a: P(0, 0.92, 0.33),
      ctrl: P(0, 0.92 + 0.42 * c.neck, 0.33 + 0.2 * c.neck),
      b: neckTop,
      r: [0.165 * s * (c.fluff > 1.5 ? 1.12 : 1), 0.09 * s],
      coat: { wool: 0.028 * c.fluff * s, freq: 8 / s },
    },
    head: { c: add(neckTop, [0, 0.03 * s, 0.02 * s]), r: [0.09 * s, 0.088 * s, 0.105 * s] },
    muzzle: {
      a: add(neckTop, [0, 0.02 * s, 0.08 * s]),
      b: add(neckTop, [0, -0.018 * s, 0.172 * s]),
      r: [0.072 * s, 0.058 * s],
      noseAt: 0.143 * s,
    },
    jaw: {
      c: add(neckTop, [0, -0.045 * s, 0.15 * s]),
      r: [0.045 * s, 0.027 * s, 0.046 * s],
      pivot: add(neckTop, [0, -0.03 * s, 0.09 * s]),
    },
    ears: c.banana
      ? {
          a: add(neckTop, [0.044 * s, 0.07 * s, -0.015 * s]),
          mid: add(neckTop, [0.068 * s, 0.165 * s, -0.02 * s]),
          b: add(neckTop, [0.046 * s, 0.24 * s, -0.005 * s]),
          r: [0.029 * s, 0.025 * s, 0.008 * s],
        }
      : {
          a: add(neckTop, [0.048 * s, 0.07 * s, -0.02 * s]),
          mid: add(neckTop, [0.07 * s, 0.13 * s, -0.035 * s]),
          b: add(neckTop, [0.082 * s, 0.185 * s, -0.04 * s]),
          r: [0.027 * s, 0.024 * s, 0.009 * s],
        },
    tail: {
      pts: [P(0, 0.97, -0.52), P(0, 0.94, -0.66)],
      r: [0.07 * s, 0.058 * s],
      coat: { wool: 0.026 * c.fluff * s, freq: 12 / s },
    },
    front: {
      top: P(0.125, 0.8, 0.31),
      knee: P(0.125, 0.43, 0.33),
      ankle: P(0.125, 0.088, 0.33),
      r: [0.105 * s * (c.legWool ? 1.25 : 1), 0.05 * s, 0.039 * s, 0.032 * s],
    },
    hind: {
      top: P(0.125, 0.82, -0.33),
      knee: P(0.125, 0.42, -0.41),
      ankle: P(0.125, 0.088, -0.37),
      r: [0.125 * s * (c.legWool ? 1.25 : 1), 0.05 * s, 0.039 * s, 0.032 * s],
    },
    foot: "camelid",
    hoofY: 0.016 * s,
    bellyY: Y(0.69) * s,
    spots: { freq: 3.4 / s, ring: [0.22, 9], seed: 11 },
    eye: { dir: [0.92, 0.2, 0.33], w: 0.1 * s, depth: 0.05 * s },
    extra: (k, p) => camelidExtras(k, p, c),
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function camelidExtras(k: Kit, p: QuadPlan, c: CamelidShape) {
  const s = c.s;
  const head = p.head.c;
  // Forelock: a fluffy tuft between the ears (a big topknot on the alpaca).
  const tk = c.topknot ?? 1;
  k.add(
    k.ell(
      add(head, [0, 0.075 * s * (0.8 + 0.2 * tk), -0.03 * s]),
      [0.068 * s * tk, 0.045 * s * tk, 0.064 * s * tk],
      "head",
      0.035 * s,
      Q.coat,
      { wool: 0.02 * s * tk, freq: 22 / s },
    ),
  );
  if (c.bib) {
    // The vicuña's long white chest bib: a soft hanging tuft below the base of the neck.
    k.add(
      k.ell(lerp3(p.neck.a, p.chest.c, 0.35), [0.09 * s, 0.16 * s, 0.08 * s], "chest", 0.06 * s, Q.belly, {
        wool: 0.02 * s,
        freq: 16 / s,
      }),
      "bib",
    );
  }
  if (c.tikas && p.ears) {
    // T'ikas: yarn pompoms tied at the base of each ear, on their own bones (scale 0 hides them).
    const e = p.ears;
    k.bone("tikaL", "earL", e.a);
    k.bone("tikaR", "earR", [-e.a[0], e.a[1], e.a[2]]);
    for (const [side, sx] of [
      ["L", 1],
      ["R", -1],
    ] as const) {
      const bone = k.b(`tika${side}`);
      const at = (dx: number, dy: number, dz: number): Vec3 => [(e.a[0] + dx) * sx, e.a[1] + dy, e.a[2] + dz];
      const ball = (c0: Vec3, r: number, slot: number) => ({
        shape: { kind: "ellipsoid" as const, c: c0, r: [r, r, r] as Vec3 },
        bone,
        blend: 0,
        slot,
        wool: r * 0.35,
        woolFreq: 140 / s,
      });
      k.extra.push({
        kind: "field",
        name: `tika${side}`,
        prims: [
          ball(at(0.028 * s, 0.03 * s, 0.005 * s), 0.025 * s, Q.t1),
          ball(at(0.046 * s, 0.008 * s, 0.021 * s), 0.02 * s, Q.t2),
          ball(at(0.034 * s, 0.002 * s, -0.013 * s), 0.018 * s, Q.t3),
        ],
        h: 0.011 * s,
        rigid: bone,
      });
    }
  }
  if (c.pack) {
    // Pack: an aguayo blanket over the back and two saddlebags, on a pack bone (scale 0 hides it).
    const top = p.body.c[1] + p.body.r[1];
    k.bone("pack", "body", [0, top, p.body.c[2]]);
    const bone = k.b("pack");
    const z = p.body.c[2];
    const bx = p.body.r[0];
    const prims = [
      // Blanket: a slab over the back, its sides falling over the flanks.
      {
        shape: {
          kind: "box" as const,
          c: [0, top + 0.005 * s, z] as Vec3,
          h: [bx * 0.75, 0.03 * s, 0.26 * s] as Vec3,
          round: 0.025 * s,
        },
        bone,
        blend: 0,
        slot: Q.t1,
      },
      {
        shape: {
          kind: "box" as const,
          c: [bx * 0.86, top - 0.1 * s, z] as Vec3,
          h: [0.03 * s, 0.12 * s, 0.25 * s] as Vec3,
          round: 0.025 * s,
        },
        bone,
        blend: 0.05 * s,
        slot: Q.t1,
      },
      {
        shape: {
          kind: "box" as const,
          c: [-bx * 0.86, top - 0.1 * s, z] as Vec3,
          h: [0.03 * s, 0.12 * s, 0.25 * s] as Vec3,
          round: 0.025 * s,
        },
        bone,
        blend: 0.05 * s,
        slot: Q.t1,
      },
      // Saddlebags (costales) hanging on both sides.
      {
        shape: {
          kind: "box" as const,
          c: [bx * 1.0, top - 0.2 * s, z] as Vec3,
          h: [0.07 * s, 0.11 * s, 0.15 * s] as Vec3,
          round: 0.05 * s,
        },
        bone,
        blend: 0,
        slot: Q.t4,
      },
      {
        shape: {
          kind: "box" as const,
          c: [-bx * 1.0, top - 0.2 * s, z] as Vec3,
          h: [0.07 * s, 0.11 * s, 0.15 * s] as Vec3,
          round: 0.05 * s,
        },
        bone,
        blend: 0,
        slot: Q.t4,
      },
    ];
    k.extra.push({
      kind: "field",
      name: "pack",
      prims,
      h: 0.032 * s,
      rigid: bone,
      // Aguayo stripes: bands across the blanket by the angle around the barrel (and the bags stay plain).
      bands: [
        {
          prims: [0, 1, 2],
          at: (q) => Math.atan2(Math.abs(q[0]), q[1] - p.body.c[1]),
          stops: [0.35, 0.55, 0.8, 1.0, 1.25],
          slots: [Q.t1, Q.t2, Q.t1, Q.t3, Q.t1, Q.t2],
        },
      ],
    });
  }
}

const CAMELID_EYE: EyeStyle = {
  iris: "#1c120e",
  irisLow: "#784828",
  size: 0.46,
  aspect: 1.1,
  lid: "#1a110d",
  lidW: 10,
  lashes: 4,
};

const camelidMotion = (walk: number, pace: number, gallop: number, s: number): QuadMotion => ({
  kind: "quad",
  gaits: [
    { gait: "walk", speed: walk, stride: 1.45 * s },
    { gait: "pace", speed: pace, stride: 2.1 * s },
    { gait: "gallop", speed: gallop, stride: 3.0 * s },
  ],
  idles: { weights: { graze: 3, chew: 3, look: 3, shake: 0.3, sleep: 1, scratch: 0.2 }, gap: [2, 6] },
  carry: 0,
  nod: 0.035,
  graze: 1.15,
  tailRest: 0.2,
  tailK: 40,
  earK: 70,
  earFlick: 1,
  breath: 3.9,
});

// Palette (quadruped slots, ./spec.ts): coat, short hair, pads, nose, belly, points, spot, spot centre, mask,
// inner ear, accent, mouth, t'ika magenta, orange, turquoise, and the costal's wool.
export const LLAMA_PAL = [
  "#f1ebe0",
  "#e6dccb",
  "#3b302b",
  "#5e463e",
  "#d9cbb4",
  "#3b302b",
  "#f1ebe0",
  "#f1ebe0",
  "#5e463e",
  "#c9a99a",
  "#c2456b",
  "#6b2e2e",
  "#c2456b",
  "#e07a3a",
  "#2a9d8f",
  "#8a6a4a",
];

export const LLAMA: AnimalSpec = {
  key: "llama",
  name: { es: "llama", en: "llama" },
  latin: "Lama glama",
  family: "quad",
  size: 1.7,
  speeds: { walk: 1.0, run: 2.4, max: 5 },
  plan: () => ({
    kit: quadKit(camelidPlan({ s: 1, fluff: 1, neck: 1, legs: 1, banana: true, tikas: true, pack: true })),
    h: 0.026,
    woolNormal: 0.3,
    seat: { bone: "body", at: [0, 0.3, 0] },
  }),
  palette: LLAMA_PAL,
  variants: {
    white: LLAMA_PAL,
    brown: recolor(LLAMA_PAL, { 0: "#8a5a3a", 1: "#7a4e33", 4: "#7a4e33", 6: "#8a5a3a", 7: "#8a5a3a", 9: "#6a4030" }),
    black: recolor(LLAMA_PAL, {
      0: "#3a302c",
      1: "#2e2624",
      4: "#342b28",
      6: "#3a302c",
      7: "#3a302c",
      3: "#2a2220",
      9: "#4a3a34",
    }),
    spotted: recolor(LLAMA_PAL, { 6: "#7a4e33", 7: "#7a4e33" }),
    cafe: recolor(LLAMA_PAL, { 0: "#b98f68", 1: "#efe6d6", 4: "#efe6d6", 6: "#b98f68", 7: "#b98f68" }),
  },
  eye: CAMELID_EYE,
  motion: camelidMotion(1.0, 2.4, 5, 1),
};

export const ALPACA_PAL = recolor(LLAMA_PAL, { 0: "#f3ead9", 1: "#efe4d0", 4: "#e8dcc5" });

export const ALPACA: AnimalSpec = {
  key: "alpaca",
  name: { es: "alpaca", en: "alpaca" },
  latin: "Vicugna pacos",
  family: "quad",
  size: 1.4,
  speeds: { walk: 0.9, run: 2.1, max: 4.5 },
  plan: () => ({
    kit: quadKit(
      camelidPlan({
        s: 0.86,
        fluff: 1.8,
        neck: 0.98,
        legs: 0.84,
        banana: false,
        legWool: true,
        girth: 1.08,
        topknot: 2.1,
      }),
    ),
    h: 0.03 * 0.86,
    woolNormal: 0.25,
  }),
  palette: ALPACA_PAL,
  variants: {
    white: ALPACA_PAL,
    fawn: recolor(ALPACA_PAL, { 0: "#c9a77a", 1: "#c19e72", 4: "#b8956a", 6: "#c9a77a", 7: "#c9a77a" }),
    brown: recolor(ALPACA_PAL, { 0: "#6e4630", 1: "#654029", 4: "#5e3c27", 6: "#6e4630", 7: "#6e4630" }),
    grey: recolor(ALPACA_PAL, { 0: "#8f8a86", 1: "#7f7a76", 4: "#7a7570", 6: "#8f8a86", 7: "#8f8a86" }),
    black: recolor(ALPACA_PAL, { 0: "#2f2a28", 1: "#2a2524", 4: "#2a2524", 6: "#2f2a28", 7: "#2f2a28", 3: "#221c1a" }),
  },
  eye: CAMELID_EYE,
  motion: camelidMotion(0.9, 2.1, 4.5, 0.86),
};

const VICUNA_PAL = [
  "#c38a52",
  "#c99260",
  "#3b302b",
  "#4a3a32",
  "#f3ece0",
  "#3b302b",
  "#c38a52",
  "#c38a52",
  "#f3ece0",
  "#b9805a",
  "#c2456b",
  "#6b2e2e",
  "#c2456b",
  "#e07a3a",
  "#2a9d8f",
  "#8a6a4a",
];

export const VICUNA: AnimalSpec = {
  key: "vicuna",
  name: { es: "vicuña", en: "vicuña" },
  latin: "Vicugna vicugna",
  family: "quad",
  size: 1.4,
  speeds: { walk: 1.1, run: 2.6, max: 12 },
  plan: () => {
    const p = camelidPlan({ s: 0.82, fluff: 0.35, neck: 1.08, legs: 1.06, banana: false, girth: 0.86, bib: true });
    // White lower legs and belly line a little higher on the slender barrel.
    p.slots = { legs: Q.coat, head: Q.hair };
    p.bellyY = (p.bellyY ?? 0) + 0.04;
    p.pointsY = 0.3;
    p.spots = undefined;
    return { kit: quadKit(p), h: 0.026 * 0.82, woolNormal: 0.5 };
  },
  palette: recolor(VICUNA_PAL, { 5: "#f3ece0" }),
  eye: { ...CAMELID_EYE, size: 0.5 },
  motion: { ...camelidMotion(1.1, 2.6, 7, 0.82), graze: 1.2 },
};

const GUANACO_PAL = recolor(VICUNA_PAL, {
  0: "#a8683e",
  1: "#7d6a62",
  4: "#efe7da",
  6: "#a8683e",
  7: "#a8683e",
  5: "#a8683e",
});

export const GUANACO: AnimalSpec = {
  key: "guanaco",
  name: { es: "guanaco", en: "guanaco" },
  latin: "Lama guanicoe",
  family: "quad",
  size: 1.7,
  speeds: { walk: 1.1, run: 2.6, max: 11 },
  plan: () => {
    const p = camelidPlan({ s: 0.98, fluff: 0.45, neck: 1.0, legs: 1.04, banana: false, girth: 0.92 });
    p.slots = { legs: Q.coat, head: Q.hair };
    p.spots = undefined;
    return { kit: quadKit(p), h: 0.026 * 0.98, woolNormal: 0.5 };
  },
  palette: GUANACO_PAL,
  eye: CAMELID_EYE,
  motion: camelidMotion(1.1, 2.6, 7, 1),
};
