/**
 * Swimmers (../plan-swim.ts):
 *
 *   sea-lion   South American sea lion (lobo marino): a long body, a thick neck, front flippers it props on
 *              and hind flippers it walks on; lollops on land, beats up and down in water
 *   bufeo      the pink river dolphin (Inia geoffrensis): bulging melon, a long thin beak, broad paddle
 *              flippers, a low hump instead of a fin, pink and grey; porpoises to breathe
 *   trout      a fish (trucha), the Titicaca's and the Colca's rivers: side to side tail beat, countershaded
 *
 * Pure (no DOM, no Three).
 */
import { SMOOTH } from "../kit";
import { F, swimKit } from "../plan-swim";
import type { AnimalSpec, EyeStyle } from "../spec";

const spal = (c: { back: string; flank?: string; belly: string; fin?: string; snout?: string; accent?: string }) => [
  c.back,
  c.flank ?? c.back,
  c.belly,
  c.fin ?? c.back,
  c.snout ?? c.back,
  c.accent ?? c.back,
  "#2a2420",
  "#2a2420",
  "#2a2420",
  "#2a2420",
  "#2a2420",
  "#6a2a2a",
];

const SOFT_EYE: EyeStyle = { iris: "#1a1210", irisLow: "#4a3020", size: 0.5, lid: "#1a1210", lidW: 6 };

export const SEA_LION: AnimalSpec = {
  key: "sea-lion",
  name: { es: "lobo marino", en: "South American sea lion" },
  latin: "Otaria flavescens",
  family: "swim",
  size: 1.9,
  speeds: { walk: 0.6, run: 3, max: 6 },
  plan: () => ({
    kit: swimKit({
      h: 0.02,
      coat: { wool: 0.003, freq: 40 },
      body: { c: [0, 0.25, -0.1], r: [0.24, 0.23, 0.45] },
      chest: { c: [0, 0.3, 0.28], r: [0.24, 0.26, 0.3] },
      neck: { c: [0, 0.42, 0.58], r: [0.16, 0.17, 0.18] },
      head: { c: [0, 0.5, 0.76], r: [0.11, 0.105, 0.13] },
      snout: { a: [0, 0.48, 0.84], b: [0, 0.46, 0.94], r: [0.065, 0.048] },
      jaw: { c: [0, 0.425, 0.88], r: [0.045, 0.025, 0.06], pivot: [0, 0.45, 0.8] },
      tail: {
        pts: [
          [0, 0.2, -0.45],
          [0, 0.16, -0.7],
          [0, 0.14, -0.85],
        ],
        r: [0.18, 0.1, 0.06],
      },
      fins: { at: [0.2, 0.2, 0.32], tip: [0.42, 0.04, 0.12], chord: 0.2, thick: 0.025 },
      hind: { at: [0.07, 0.13, -0.8], tip: [0.2, 0.025, -1.05], chord: 0.15, thick: 0.02 },
      ears: { at: [0.07, 0.56, 0.72], r: 0.016 },
      eye: { dir: [0.8, 0.45, 0.4], w: 0.045 },
      belly: -0.1,
    }),
    h: 0.02,
    woolNormal: 0.6,
  }),
  palette: spal({ back: "#6a5040", belly: "#8a6a52", fin: "#4a382c", snout: "#5a4434" }),
  variants: {
    female: spal({ back: "#8a6a52", belly: "#b8987a", fin: "#5a4434", snout: "#7a5a44" }),
    male: spal({ back: "#5a4232", belly: "#7a5a44", fin: "#3a2c22", snout: "#4a382a" }),
  },
  eye: SOFT_EYE,
  motion: {
    kind: "swim",
    axis: "pitch",
    wave: { amp: 0.35, hz: 1.2, lag: 0.15, taper: 0.2 },
    idles: { weights: { look: 4, yawn: 1.5, sleep: 2, scratch: 1 }, gap: [1.5, 5] },
    land: true,
  },
};

export const BUFEO: AnimalSpec = {
  key: "bufeo",
  name: { es: "bufeo colorado", en: "pink river dolphin" },
  latin: "Inia geoffrensis",
  family: "swim",
  size: 2.3,
  speeds: { walk: 0.8, run: 3, max: 6 },
  plan: () => ({
    kit: swimKit({
      h: 0.022,
      coat: SMOOTH,
      body: { c: [0, 0.3, 0], r: [0.25, 0.27, 0.5] },
      chest: { c: [0, 0.32, 0.4], r: [0.24, 0.26, 0.3] },
      neck: { c: [0, 0.33, 0.7], r: [0.17, 0.18, 0.15] },
      head: { c: [0, 0.36, 0.86], r: [0.14, 0.15, 0.14] },
      melon: { c: [0, 0.42, 0.93], r: [0.12, 0.11, 0.1] },
      snout: { a: [0, 0.33, 0.98], b: [0, 0.29, 1.34], r: [0.05, 0.028] },
      jaw: { c: [0, 0.285, 1.14], r: [0.034, 0.02, 0.17], pivot: [0, 0.31, 0.96] },
      tail: {
        pts: [
          [0, 0.3, -0.45],
          [0, 0.3, -0.8],
          [0, 0.29, -1.05],
          [0, 0.28, -1.18],
        ],
        r: [0.2, 0.12, 0.06, 0.04],
      },
      fluke: { span: 0.28, chord: 0.15 },
      fins: { at: [0.2, 0.22, 0.45], tip: [0.46, 0.12, 0.24], chord: 0.22, thick: 0.03 },
      dorsal: { at: [0, 0.55, -0.25], h: 0.05, chord: 0.45, hump: true },
      eye: { dir: [0.9, 0.2, 0.4], w: 0.03 },
      belly: -0.04,
    }),
    h: 0.022,
  }),
  palette: spal({ back: "#b88a8e", flank: "#d8a0a4", belly: "#f0c4c4", fin: "#c89496", snout: "#d8a6a8" }),
  variants: {
    pink: spal({ back: "#b88a8e", flank: "#d8a0a4", belly: "#f0c4c4", fin: "#c89496", snout: "#d8a6a8" }),
    grey: spal({ back: "#8a8488", flank: "#a8a0a4", belly: "#e0c8c8", fin: "#948c90", snout: "#b0a0a4" }),
  },
  eye: { ...SOFT_EYE, size: 0.42 },
  motion: {
    kind: "swim",
    axis: "pitch",
    wave: { amp: 0.28, hz: 1, lag: 0.12, taper: 0.1 },
    idles: { weights: { look: 3 }, gap: [2, 5] },
    porpoise: true,
  },
};

export const TROUT: AnimalSpec = {
  key: "trout",
  name: { es: "trucha", en: "trout" },
  latin: "Oncorhynchus mykiss",
  family: "swim",
  size: 0.4,
  speeds: { walk: 0.4, run: 1.5, max: 3 },
  plan: () => ({
    kit: swimKit({
      h: 0.0045,
      coat: SMOOTH,
      body: { c: [0, 0.05, 0], r: [0.028, 0.048, 0.1] },
      chest: { c: [0, 0.05, 0.06], r: [0.028, 0.045, 0.06] },
      neck: { c: [0, 0.05, 0.11], r: [0.026, 0.04, 0.04] },
      head: { c: [0, 0.05, 0.14], r: [0.024, 0.034, 0.04] },
      snout: { a: [0, 0.048, 0.16], b: [0, 0.045, 0.18], r: [0.017, 0.012] },
      jaw: { c: [0, 0.038, 0.17], r: [0.012, 0.006, 0.02], pivot: [0, 0.042, 0.15] },
      tail: {
        pts: [
          [0, 0.05, -0.08],
          [0, 0.05, -0.13],
          [0, 0.05, -0.17],
          [0, 0.05, -0.2],
        ],
        r: [0.024, 0.015, 0.008, 0.005],
      },
      fluke: { span: 0.04, chord: 0.05, vertical: true },
      fins: { at: [0.022, 0.03, 0.08], tip: [0.045, 0.015, 0.05], chord: 0.022, thick: 0.004 },
      dorsal: { at: [0, 0.092, 0.0], h: 0.022, chord: 0.04 },
      eye: { dir: [0.9, 0.25, 0.35], w: 0.014 },
      belly: -0.012,
    }),
    h: 0.0045,
  }),
  palette: spal({
    back: "#5a6a52",
    flank: "#8a9a7a",
    belly: "#e8e0d0",
    fin: "#7a7a62",
    snout: "#5a6a52",
    accent: "#d88a8a",
  }),
  eye: { iris: "#c8b070", irisLow: "#e0c890", pupil: "#100c0a", pupilK: 0.55, size: 0.6 },
  motion: {
    kind: "swim",
    axis: "yaw",
    wave: { amp: 0.45, hz: 2.5, lag: 0.18, taper: 0.1 },
    idles: { weights: { look: 1 }, gap: [2, 5] },
  },
};

export const MARINE = { "sea-lion": SEA_LION, bufeo: BUFEO, trout: TROUT };
export { F };
