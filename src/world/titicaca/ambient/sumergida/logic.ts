/**
 * Pure rules of the sunken city (../sumergida.ts), the lake's night secret: where it lies, how dark it has to be,
 * how much of it shows from a given distance, when the traveler has had a good look, and its bilingual copy.
 * No DOM, no three.js (tested in logic.test.ts).
 *
 * The spot is open water off the Taquile pier (the pier's tip is the closest a walker gets, ~25 u) and beside
 * the balsa's straight crossing from the Uros jetty to that pier, so it is found on foot or by boat. From the
 * shore road (~55 u away) only its glow shows.
 */
import type { L } from "../../../contract";

/** Centre of the ruins under the water (x, z). Deep water: well past the reed shelf, clear of the frog and trout. */
export const SPOT = { x: 36, z: -29 } as const;
/** Half size of the ruins decal (world units). */
export const SIZE = 17;
/** Within this distance (and on screen, at night) a look counts. The pier tip qualifies, the road does not. */
export const LOOK_R = 30;
/** Seconds of a good look before it stamps (the golden condor's rule). */
export const LOOK_HOLD = 0.6;
/** The glow fades out beyond this distance (it reads from the road, not from the far end of the lake). */
export const GLOW_FAR = 170;
/** The walls and the disc start to show inside OUTLINE_FAR and are clearest inside OUTLINE_NEAR. */
export const OUTLINE_FAR = 42;
export const OUTLINE_NEAR = 16;

export const STAMP_ID = "titicaca:egg:sunken-city";
export const LABEL: L = { es: "La ciudad sumergida", en: "The sunken city" };
/** Told as a legend, never as fact. */
export const CAPTION: L = {
  es: "Cuentan que bajo el lago duerme una ciudad antigua, con templos de piedra y un disco de oro, y que en las noches quietas su luz sube desde el fondo.",
  en: "Legend says an ancient city sleeps beneath the lake, with stone temples and a golden disc, and that on still nights its light rises from the depths.",
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/**
 * 0 by day, 1 in full night, from the sky's day fraction (0 midnight, 0.25 sunrise). The sun's elevation is
 * sin((time − 0.25)·2π); the shared sky calls it night below −0.04, so the glow starts there and is full by −0.25.
 */
export function nightAmount(time: number): number {
  const e = Math.sin((time - 0.25) * Math.PI * 2);
  return smoothstep(-0.04, -0.25, e);
}

/** How much shows at a distance: the glow (far reaching) and the ruins' outlines (only up close). 0..1 each. */
export function reveal(dist: number, night: number): { glow: number; ruins: number } {
  const n = clamp01(night);
  return {
    glow: n * (1 - smoothstep(GLOW_FAR * 0.55, GLOW_FAR, dist)),
    ruins: n * (1 - smoothstep(OUTLINE_NEAR, OUTLINE_FAR, dist)),
  };
}

/** The slow breathing of the glow, 0.6..1 (still at 0.85 with prefers-reduced-motion). Period ≈ 4.8 s. */
export const pulse = (t: number, reducedMotion: boolean) =>
  reducedMotion ? 0.85 : 0.8 + 0.2 * Math.sin((t * Math.PI * 2) / 4.8);

/** A good look: dark enough, within LOOK_R and the centre on screen (NDC inside a margin, in front of the camera). */
export function isGoodLook(o: { dist: number; night: boolean; ndc: { x: number; y: number; z: number } }): boolean {
  if (!o.night || o.dist > LOOK_R) return false;
  return o.ndc.z < 1 && Math.abs(o.ndc.x) < 0.85 && Math.abs(o.ndc.y) < 0.85;
}

/** Accumulates the seconds of a good look (reset when it breaks); true once it reaches LOOK_HOLD. */
export function holdLook(seen: number, good: boolean, dt: number): { seen: number; done: boolean } {
  const s = good ? seen + dt : 0;
  return { seen: s, done: s >= LOOK_HOLD };
}
