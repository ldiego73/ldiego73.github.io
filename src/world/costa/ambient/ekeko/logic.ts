/**
 * Pure rules of the hidden Ekeko of the coast (../ekeko.ts): where the statuette sits at the Huanchaco market,
 * when the traveler can look at it, its sparkle schedule, the bounce it gives when looked at and the "look"
 * state (stamp once, caption timer). No DOM, no three.js (tested in logic.test.ts).
 *
 * Placement: on a fruit crate tucked against the OUTER side of the market's last stall (STALLS[4], the fruit
 * stall at the north end of the arc), half under its reed roof, beside the stall's own reading spot but not in
 * it: the crate sits at stall-local (2.15, −0.15), just outside the side posts (±1.7) and under the roof's edge
 * (±1.95), and the artifact panel's spot (stall-local (0, 2.6), r 2.1) is ≈ 3.5 u away, so with the look range
 * of 1.7 the two prompts barely overlap.
 */
import type { L } from "../../../contract";
import { type Frame, toWorld } from "../huacas/logic";
import { STALLS } from "../huacas/market";

/** Which market stall hides it: the last of the arc (the fruit stall; its +x side faces open ground). */
export const STALL_INDEX = 4;
/** Crate centre in the stall's local frame (+Z = the counter side, facing the plaza). */
export const CRATE_AT = { x: 2.15, z: -0.15 } as const;
/** Crate height: the statuette stands on it, just under the counter's 0.95 so it reads as "set aside". */
export const CRATE_H = 0.5;
/** Collider radius of the crate (the traveler walks round it). */
export const CRATE_R = 0.42;
/** Prompt range from the crate centre (small: you must step right up to it). */
export const RANGE = 1.7;
/** The caption closes on its own after this long, or when the traveler walks this far away. */
export const CAPTION_S = 9;
export const CAPTION_AWAY = 5;
/** Bounce length after "E · Mirar". */
export const BOUNCE_S = 1.1;
/** One sparkle every PERIOD seconds, lasting FLASH seconds (a careful eye catches it, a hurried one does not). */
export const SPARKLE_PERIOD = 4.6;
export const SPARKLE_FLASH = 0.55;
/** Reduced motion: a steady faint glint instead of the flash. */
export const STEADY_GLINT = 0.32;
/** The sparkle is drawn only while the camera is this close (no cost from the far road). */
export const SPARKLE_NEAR = 45;

export const STAMP = {
  id: "costa:egg:ekeko",
  kind: "egg" as const,
  label: { es: "El Ekeko", en: "The Ekeko" } satisfies L,
};

export const COPY = {
  look: { es: "E · Mirar", en: "E · Look" },
  close: { es: "E · Cerrar", en: "E · Close" },
  title: { es: "El Ekeko", en: "The Ekeko" },
  body: {
    es: "El dios andino de la abundancia: un hombrecito bigotudo y sonriente, de chullo y brazos abiertos, cargado de miniaturas: costalitos de comida, una casita, billetes, ollas, un charango. En la feria de las Alasitas, que empieza cada 24 de enero en La Paz y se celebra también en otras ciudades del altiplano como Puno, la gente compra en miniatura lo que desea tener durante el año. ¿Qué hace tan lejos del lago, entre las frutas de Huanchaco? Alguien lo trajo para que no falte nada.",
    en: "The Andean god of abundance: a cheerful, mustached little man in a chullo, arms open, loaded with miniatures: little sacks of food, a tiny house, banknotes, pots, a charango. At the Alasitas fair, which opens every January 24 in La Paz and is also held in other highland cities such as Puno, people buy in miniature what they hope to have in the year ahead. What is he doing so far from the lake, among the fruit of Huanchaco? Someone brought him so that nothing would be missing.",
  },
} satisfies Record<string, L>;

export interface EkekoSpot {
  /** Crate centre (world). */
  x: number;
  z: number;
  /** Facing of the crate and the statuette (rotation.y; models face +Z): the stall's facing, toward the plaza. */
  yaw: number;
}

/** Where the crate stands, given the market station's frame (its plaza pose; y unused). */
export function ekekoSpot(market: Frame): EkekoSpot {
  const st = STALLS[STALL_INDEX] as (typeof STALLS)[number];
  const c = toWorld(market, st.x, st.z);
  const sf: Frame = { x: c.x, z: c.z, y: market.y, yaw: market.yaw + st.yaw };
  const p = toWorld(sf, CRATE_AT.x, CRATE_AT.z);
  // Turned a little toward open ground (local +x), so it peeks out from beside the stall.
  return { x: p.x, z: p.z, yaw: sf.yaw + 0.5 };
}

/** Sparkle intensity 0..1 at time t (s). Reduced motion: a steady faint glint. */
export function sparkle(t: number, reducedMotion: boolean): number {
  if (reducedMotion) return STEADY_GLINT;
  const k = (((t % SPARKLE_PERIOD) + SPARKLE_PERIOD) % SPARKLE_PERIOD) / SPARKLE_FLASH;
  if (k >= 1) return 0;
  // A quick rise and a slower fade.
  return k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
}

/** Bounce pose `e` seconds after a look: a hop with squash on landing and a little wobble. */
export function bounce(e: number, reducedMotion: boolean): { lift: number; squash: number; tilt: number } {
  if (reducedMotion || e < 0 || e >= BOUNCE_S) return { lift: 0, squash: 1, tilt: 0 };
  const k = e / BOUNCE_S;
  // Two hops, the second smaller.
  const hop = k < 0.55 ? Math.sin((k / 0.55) * Math.PI) * 0.12 : Math.sin(((k - 0.55) / 0.45) * Math.PI) * 0.04;
  const squash = 1 - Math.max(0, Math.sin(k * Math.PI * 4)) * 0.08 * (1 - k);
  const tilt = Math.sin(k * Math.PI * 6) * 0.18 * (1 - k);
  return { lift: hop, squash, tilt };
}

/** Within looking range of the crate (horizontal distance). */
export const inRange = (s: EkekoSpot, x: number, z: number) => Math.hypot(s.x - x, s.z - z) <= RANGE;

/** Look state: caption timer, bounce clock and the once-per-visit stamp. */
export function createLook() {
  let found = false;
  let caption = 0;
  let since = Number.POSITIVE_INFINITY;
  return {
    /** "E · Mirar": opens the caption, restarts the bounce; `stamp` is true only the first time. */
    look(): { stamp: boolean } {
      caption = CAPTION_S;
      since = 0;
      const stamp = !found;
      found = true;
      return { stamp };
    },
    close() {
      caption = 0;
    },
    /** Advances the clocks; closes the caption when it runs out or the traveler is `dist` away. */
    tick(dt: number, dist: number) {
      since += dt;
      if (caption > 0) caption = dist > CAPTION_AWAY ? 0 : Math.max(0, caption - dt);
    },
    get open() {
      return caption > 0;
    },
    /** Seconds since the last look (Infinity before the first). */
    get since() {
      return since;
    },
  };
}
