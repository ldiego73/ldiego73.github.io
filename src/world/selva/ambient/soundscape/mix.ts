/**
 * Pure mixing rules of the jungle soundscape (no Web Audio, no DOM): bed levels by the hour and the river's
 * distance, the stereo pan of a source relative to the listener, and how often an animal calls by distance.
 * Unit-tested in mix.test.ts.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const sunElevation = (time: number) => Math.sin((time - 0.25) * Math.PI * 2);

export interface BedMix {
  /** Day insects (cicadas): strongest at midday heat. */
  cicadas: number;
  /** Night chorus (crickets / katydids): full in the dark. */
  chorus: number;
  /** The river's murmur by proximity. */
  river: number;
  /** Whole soundscape (0 inside a building or while a game is open). */
  master: number;
}

/**
 * Bed levels for a day time (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset), the listener's distance to the
 * river bank (`riverDist`, negative over the water) and whether the world is hushed (interior, game).
 */
export function bedMix(time: number, riverDist: number, hushed: boolean): BedMix {
  const e = sunElevation(time);
  const night = smooth(0.05, -0.2, e);
  return {
    cicadas: (1 - night) * (0.45 + 0.55 * smooth(0.2, 0.9, e)),
    chorus: night,
    river: 1 - smooth(4, 40, riverDist),
    master: hushed ? 0 : 1,
  };
}

/**
 * Stereo pan (−1 left … 1 right) of a source at (dx, dz) from the listener whose right-hand direction is
 * (rx, rz) (unit, horizontal). Kept within ±0.85 so nothing sounds glued to one ear.
 */
export function panFor(dx: number, dz: number, rx: number, rz: number) {
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return 0;
  return Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d));
}

/** Loudness of a call heard from `d` units, silent past `far`. */
export const callGain = (d: number, far: number) => (d >= far ? 0 : (1 - d / far) ** 1.6);

/**
 * Seconds until the next call of a kind given the nearest animal's distance: chatty when close, rarer far
 * off, and never (Infinity) beyond `far`. `r` is a 0..1 random draw.
 */
export function callGap(d: number, far: number, base: number, r: number) {
  if (d >= far) return Number.POSITIVE_INFINITY;
  return base * (0.6 + r * 0.8) * (1 + (2 * d) / far);
}

export { howlerHour } from "../wild/logic";
