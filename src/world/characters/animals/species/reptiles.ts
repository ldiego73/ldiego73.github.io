/**
 * Reptiles and the frog: sprawled bodies (elbows and knees out to the side, ./shape.ts `legs.sprawl`) that
 * walk in a diagonal crawl with the spine swinging in an S (../gaits.ts "crawl"):
 *
 *   caiman     lagarto / black and spectacled caimans: long flat snout, eyes on top, a bumpy armoured back,
 *              a long tail in four segments (it swims with it, legs folded back)
 *   taricaya   Podocnemis unifilis, the river turtle: a domed dark shell, yellow spots on the head
 *   iguana     green, a crest of soft spines, a dewlap
 *   lizard     a small Andean lizard (Liolaemus), striped
 *   frog       sits folded and moves by jumps (QuadMotion.frog); the Titicaca water frog is a variant
 *
 * Calm faces: round pupils, no teeth shown at rest (the caiman's lunge opens the jaw for a moment).
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "../../sdf";
import { Kit, SMOOTH } from "../kit";
import { eyeDecal, onEllipsoid, Q, type QuadPlan, quadKit } from "../plan-quad";
import type { AnimalSpec, EyeStyle, QuadMotion } from "../spec";
import { qpal } from "./mammals";
import { type QuadShape, shapePlan } from "./shape";

const REPTILE_EYE = (iris: string, low: string): EyeStyle => ({
  iris,
  irisLow: low,
  pupil: "#14100c",
  pupilK: 0.42,
  size: 0.58,
  aspect: 1,
});

const crawl = (speed: number, stride: number, m: Partial<QuadMotion> = {}): QuadMotion => ({
  kind: "quad",
  gaits: [
    { gait: "crawl", speed, stride },
    { gait: "trot", speed: speed * 3, stride: stride * 1.6 },
  ],
  idles: { weights: { look: 3, sleep: 2, yawn: 0.5 }, gap: [3, 9] },
  sprawl: true,
  tailRest: 0,
  tailK: 30,
  earFlick: 0,
  ...m,
});

function reptile(
  o: Omit<AnimalSpec, "plan" | "family"> & {
    shape: QuadShape;
    h: number;
    tune?: (p: QuadPlan) => void;
    extra?: (k: Kit, p: QuadPlan) => void;
  },
): AnimalSpec {
  const { shape, h, tune, extra, ...rest } = o;
  return {
    ...rest,
    family: "quad",
    plan: () => {
      const p = shapePlan(shape, h);
      tune?.(p);
      if (extra) p.extra = extra;
      return { kit: quadKit(p), h, woolNormal: 0.5 };
    },
  };
}

export const CAIMAN = reptile({
  key: "caiman",
  name: { es: "lagarto (caimán)", en: "caiman" },
  latin: "Caiman crocodilus",
  size: 2,
  speeds: { walk: 0.4, run: 1.5, max: 4 },
  h: 0.02,
  shape: {
    bodyY: 0.15,
    bodyR: [0.16, 0.1],
    half: 0.3,
    rumpK: 0.9,
    neck: { len: 0.12, angle: 1.47, r: [0.12, 0.1], arch: 0 },
    head: { r: [0.085, 0.055, 0.11], muzzle: 0.3, mr: [0.065, 0.04], drop: 0.03 },
    tail: { len: 1.0, r: [0.1, 0.018], angle: -0.04, segs: 4 },
    legs: { r: [0.045, 0.035, 0.03, 0.026], knee: 0.5, hock: 0.5, sprawl: 0.11, spread: 0.85 },
    foot: "reptile",
    coat: { wool: 0.009, freq: 30 },
    short: { wool: 0.004, freq: 50 },
    eye: { dir: [0.45, 0.88, 0.15], w: 0.04 },
    bellyY: 0.1,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, muzzle: Q.coat, tail: Q.coat };
    p.muzzle.noseAt = undefined;
  },
  extra: (k, p) => {
    // Two low ridges of scutes along the back and the tail's double crest.
    for (let i = 0; i < 7; i++) {
      const z = p.chest.c[2] - i * 0.12;
      for (const sx of [1, -1])
        k.add(
          k.ell([sx * 0.05, p.body.c[1] + p.body.r[1] * 0.85, z], [0.022, 0.018, 0.04], "body", 0.015, Q.points, {
            wool: 0.004,
            freq: 60,
          }),
        );
    }
    // Bands across the tail (darker), the belly pale.
    k.bands.push({ prims: k.group("tail"), at: (q) => Math.sin(q[2] * 22), stops: [0.55], slots: [Q.coat, Q.points] });
  },
  palette: qpal({ coat: "#4a5238", belly: "#c8c09a", points: "#2e3424", hoof: "#2e3424", nose: "#3a4030" }),
  variants: {
    spectacled: qpal({ coat: "#4a5238", belly: "#c8c09a", points: "#2e3424", hoof: "#2e3424", nose: "#3a4030" }),
    black: qpal({ coat: "#2a2c26", belly: "#b8b090", points: "#1a1c18", hoof: "#1a1c18", nose: "#222420" }),
  },
  eye: REPTILE_EYE("#b8902e", "#e0c060"),
  motion: crawl(0.4, 0.55, { swim: "tail", idles: { weights: { look: 2, sleep: 4, yawn: 1 }, gap: [4, 10] } }),
});

export const TURTLE = reptile({
  key: "taricaya",
  name: { es: "taricaya", en: "yellow-spotted river turtle" },
  latin: "Podocnemis unifilis",
  size: 0.5,
  speeds: { walk: 0.12, run: 0.3, max: 0.6 },
  h: 0.008,
  shape: {
    bodyY: 0.09,
    bodyR: [0.13, 0.055],
    half: 0.11,
    neck: { len: 0.07, angle: 1.3, r: [0.033, 0.028], arch: 0 },
    head: { r: [0.036, 0.03, 0.045], muzzle: 0.025, mr: [0.024, 0.018], drop: 0.15 },
    tail: { len: 0.05, r: [0.02, 0.008], angle: -0.3, segs: 1 },
    legs: { r: [0.025, 0.02, 0.018, 0.02], knee: 0.5, hock: 0.5, sprawl: 0.07, spread: 0.85 },
    foot: "reptile",
    coat: SMOOTH,
    eye: { dir: [0.75, 0.5, 0.4], w: 0.022 },
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, muzzle: Q.coat };
    p.muzzle.noseAt = undefined;
  },
  extra: (k, p) => {
    // The shell: a domed carapace and a flat plastron on the body bone, with scute seams.
    const c = p.body.c;
    const cara = k.add(k.ell([0, c[1] + 0.025, -0.005], [0.15, 0.07, 0.19], "body", 0.01, Q.spot, SMOOTH));
    k.add(k.ell([0, c[1] - 0.02, -0.005], [0.13, 0.03, 0.17], "body", 0.01, Q.belly, SMOOTH));
    k.bands.push({
      prims: [cara],
      at: (q) => Math.min(Math.abs(Math.sin(q[2] * 24)), Math.abs(Math.sin(q[0] * 20))),
      stops: [0.08],
      slots: [Q.points, Q.spot],
    });
    // The yellow spots on the head (the species' name).
    const h = p.head.c;
    const pts: Vec3[] = [
      [0, h[1] + 0.025, h[2] + 0.01],
      [0.028, h[1] + 0.005, h[2] - 0.012],
      [-0.028, h[1] + 0.005, h[2] - 0.012],
      [0.02, h[1] - 0.015, h[2] + 0.03],
      [-0.02, h[1] - 0.015, h[2] + 0.03],
    ];
    k.bands.push({
      prims: k.group("head"),
      at: (q) => Math.min(...pts.map((s) => Math.hypot(q[0] - s[0], q[1] - s[1], q[2] - s[2]))) - 0.011,
      stops: [0],
      slots: [Q.accent, Q.coat],
    });
  },
  palette: qpal({
    coat: "#3e4236",
    belly: "#c8b880",
    spot: "#2e3428",
    points: "#5a5a40",
    accent: "#e8c43a",
    hoof: "#2e3028",
  }),
  eye: REPTILE_EYE("#8a8a50", "#b8b070"),
  motion: crawl(0.12, 0.16, { swim: "tail", idles: { weights: { look: 3, sleep: 3 }, gap: [3, 8] } }),
});

export const IGUANA = reptile({
  key: "iguana",
  name: { es: "iguana", en: "green iguana" },
  latin: "Iguana iguana",
  size: 1.2,
  speeds: { walk: 0.3, run: 1.4, max: 3 },
  h: 0.011,
  shape: {
    bodyY: 0.12,
    bodyR: [0.075, 0.075],
    half: 0.15,
    neck: { len: 0.07, angle: 1.2, r: [0.055, 0.045], arch: 0 },
    head: { r: [0.04, 0.045, 0.055], muzzle: 0.05, mr: [0.032, 0.022], drop: 0.2 },
    tail: { len: 0.75, r: [0.045, 0.008], angle: -0.08, segs: 4 },
    legs: { r: [0.024, 0.019, 0.015, 0.014], knee: 0.5, hock: 0.5, sprawl: 0.07, spread: 0.85 },
    foot: "reptile",
    coat: { wool: 0.003, freq: 90 },
    eye: { dir: [0.85, 0.45, 0.25], w: 0.026 },
    bellyY: 0.085,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, muzzle: Q.coat, tail: Q.coat };
    p.muzzle.noseAt = undefined;
  },
  extra: (k, p) => {
    // Crest of soft spines from the nape down the back; a dewlap under the jaw.
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = p.head.c[2] - 0.04 - t * 0.38;
      const y = p.body.c[1] + p.body.r[1] * 0.9 + (1 - t) * 0.02;
      const bone = z > p.chest.c[2] - 0.04 ? "neck1" : "body";
      const l = 0.028 * (1 - t * 0.6);
      k.add(k.cone([0, y, z], [0, y + l, z - l * 0.5], 0.008, 0.002, bone, 0.006, Q.points));
    }
    k.add(k.ell([0, p.head.c[1] - 0.045, p.head.c[2] - 0.005], [0.008, 0.035, 0.03], "jaw", 0.012, Q.belly));
  },
  palette: qpal({ coat: "#5a9a4a", belly: "#a8c890", points: "#7aa860", hoof: "#4a7a3a", nose: "#4a7a3a" }),
  eye: REPTILE_EYE("#c89a3a", "#e8c070"),
  motion: crawl(0.3, 0.22, { idles: { weights: { look: 4, sleep: 2 }, gap: [2, 6] } }),
});

export const LIZARD = reptile({
  key: "lizard",
  name: { es: "lagartija", en: "Andean lizard" },
  latin: "Liolaemus sp.",
  size: 0.22,
  speeds: { walk: 0.25, run: 1.2, max: 2 },
  h: 0.0035,
  shape: {
    bodyY: 0.025,
    bodyR: [0.017, 0.012],
    half: 0.03,
    neck: { len: 0.012, angle: 1.3, r: [0.012, 0.011], arch: 0 },
    head: { r: [0.011, 0.009, 0.014], muzzle: 0.012, mr: [0.008, 0.005], drop: 0.15 },
    tail: { len: 0.11, r: [0.009, 0.002], angle: -0.05, segs: 3 },
    legs: { r: [0.005, 0.004, 0.0035, 0.0035], knee: 0.5, hock: 0.5, sprawl: 0.014, spread: 0.85 },
    foot: "reptile",
    coat: SMOOTH,
    eye: { dir: [0.85, 0.45, 0.25], w: 0.007 },
    bellyY: 0.018,
  },
  tune: (p) => {
    p.slots = { head: Q.coat, legs: Q.coat, muzzle: Q.coat, tail: Q.coat };
    p.muzzle.noseAt = undefined;
    p.spots = { freq: 120, ring: [0.25, 9], seed: 4 };
  },
  palette: qpal({ coat: "#8a7656", belly: "#d8c8a0", spot: "#4a3a2a", hoof: "#5a4a36", nose: "#5a4a36" }),
  eye: REPTILE_EYE("#5a4a2a", "#8a7040"),
  motion: crawl(0.25, 0.06, { idles: { weights: { look: 5 }, gap: [0.5, 3] } }),
});

// ---------------------------------------------------------------- frog

function frogPlan(): QuadPlan {
  return {
    h: 0.0042,
    coat: SMOOTH,
    body: { c: [0, 0.033, -0.005], r: [0.034, 0.026, 0.044] },
    chest: { c: [0, 0.036, 0.022], r: [0.033, 0.025, 0.03] },
    rump: { c: [0, 0.028, -0.035], r: [0.031, 0.024, 0.03] },
    blend: 0.012,
    neck: { a: [0, 0.04, 0.04], ctrl: [0, 0.043, 0.047], b: [0, 0.045, 0.052], r: [0.03, 0.03] },
    head: { c: [0, 0.044, 0.058], r: [0.036, 0.02, 0.028] },
    muzzle: { a: [0, 0.042, 0.07], b: [0, 0.039, 0.08], r: [0.024, 0.016] },
    jaw: { c: [0, 0.033, 0.07], r: [0.024, 0.008, 0.02], pivot: [0, 0.036, 0.05] },
    front: {
      top: [0.024, 0.03, 0.03],
      knee: [0.034, 0.018, 0.04],
      ankle: [0.034, 0.005, 0.046],
      r: [0.008, 0.007, 0.0055, 0.006],
    },
    hind: {
      top: [0.028, 0.026, -0.04],
      knee: [0.05, 0.016, -0.012],
      ankle: [0.044, 0.006, -0.052],
      r: [0.012, 0.009, 0.006, 0.008],
    },
    foot: "reptile",
    bellyY: 0.026,
    spots: { freq: 70, ring: [0.3, 9], seed: 2 },
    slots: { head: Q.coat, legs: Q.coat, muzzle: Q.coat },
    eye: { dir: [0.6, 0.7, 0.3], w: 0.016 },
    extra: (k) => {
      // Eyes on bulges at the top of the head (the decal sits on the bulge, not on the skull).
      const c: Vec3 = [0.02, 0.06, 0.06];
      const r: Vec3 = [0.01, 0.01, 0.01];
      k.addPair(k.ell(c, r, "head", 0.006, Q.coat), "head", "bulge");
      const e = onEllipsoid(c, r, [0.5, 0.75, 0.45]);
      k.faces.length = 0;
      k.faces.push(eyeDecal(e.p, e.n, 0.016, 0.008));
    },
  };
}

export const FROG: AnimalSpec = {
  key: "frog",
  name: { es: "rana", en: "frog" },
  latin: "Pristimantis / Telmatobius",
  family: "quad",
  size: 0.15,
  speeds: { walk: 0.3, run: 0.8, max: 1.2 },
  plan: () => ({ kit: quadKit(frogPlan()), h: 0.0042, woolNormal: 0.6 }),
  palette: qpal({ coat: "#5a8a3a", belly: "#e0dca0", spot: "#3a5a28", hoof: "#5a8a3a", nose: "#4a7a30" }),
  variants: {
    green: qpal({ coat: "#5a8a3a", belly: "#e0dca0", spot: "#3a5a28", hoof: "#5a8a3a", nose: "#4a7a30" }),
    titicaca: qpal({ coat: "#6a6a52", belly: "#b8a888", spot: "#4a4a3a", hoof: "#6a6a52", nose: "#5a5a46" }),
  },
  eye: REPTILE_EYE("#c8a03a", "#e8c870"),
  motion: {
    kind: "quad",
    gaits: [{ gait: "hop", speed: 0.5, stride: 0.25 }],
    idles: { weights: { look: 2, sleep: 2, yawn: 1 }, gap: [2, 6] },
    frog: true,
    swim: "paddle",
    earFlick: 0,
  },
};

export const REPTILES = { caiman: CAIMAN, taricaya: TURTLE, iguana: IGUANA, lizard: LIZARD, frog: FROG };
export { Kit };
