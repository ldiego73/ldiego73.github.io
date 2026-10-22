/**
 * How the people of the Antisuyu road dress, as data for the shared characters (../../../characters): which
 * archetype each villager is (`SPEC`, built on the presets' Amazonian river community) and the palette pickers
 * that dye it (`dressOf`). Inspired by Shipibo-Konibo and Asháninka everyday dress, drawn plainly and without
 * caricature:
 *  - men: the cushma, a long tunic to mid-calf with thin vertical warp stripes, in bark browns, achiote
 *    red-brown, faded indigo or natural cotton (dark stripes on the light ones, light on the dark); bare feet;
 *    a few (and the elders) with a feather crown, a woven band with standing macaw feathers;
 *  - women: a short blouse with satin ribbon bands, a straight wrap skirt painted with kené (the maze of fine
 *    geometric lines Shipibo-Konibo women paint and embroider: dark on cream, cream on huito indigo-black,
 *    dark on achiote red), long straight hair with a fringe, a necklace of red huayruro and white seeds;
 *  - children: a tee and shorts (boys; bare-chested in the river) or a blouse and a small kené skirt (girls);
 *  - young men on the road and at the floating arcade: a tee and shorts.
 * The palettes are the ones the community wore on the old part rig, so the road keeps its colours.
 *
 * Pure (no DOM, no Three).
 */
import type { HumanSpec } from "../../../characters/archetype";
import { PEOPLE } from "../../../characters/presets";
import type { Dress } from "../../../characters/slots";

export type Who = "man" | "crown" | "elder" | "woman" | "teen" | "boy" | "girl" | "swimmer" | "youth";

/** The archetype of each kind of villager (every one is cached and built once per page). */
export const SPEC: Record<Who, HumanSpec> = {
  man: PEOPLE.comunero,
  crown: PEOPLE.comuneroCrown,
  elder: { ...PEOPLE.comuneroCrown, age: "elder" },
  woman: PEOPLE.comunera,
  // The teenager leaning on the arcade's rail: a young woman, a little shorter.
  teen: { ...PEOPLE.comunera, height: 0.93 },
  boy: PEOPLE.riverBoy,
  girl: PEOPLE.riverGirl,
  swimmer: PEOPLE.swimmer,
  youth: { ...PEOPLE.riverBoy, age: "adult" },
};

/** Every archetype the jungle uses (prefetched at load, so the builds are done before the traveler arrives). */
export const ALL_SPECS: readonly HumanSpec[] = Object.values(SPEC);

export const SKINS = ["#8a5634", "#9c6339", "#7d4b2d", "#a8703f", "#93603a", "#b27a4a", "#865231"];
const HAIR = "#15100d";
const CREAM = "#efe3c8";
const HUAYRURO = "#b8261f";
const SEED_W = "#efe6d6";
/** Natural (undyed) cotton: the elders' cushma. */
export const NATURAL = "#d8cbb0";
/** Cushmas: bark browns, achiote red-brown, natural cotton, a faded indigo. */
export const CUSHMAS = ["#7b4a2c", "#9a5a35", "#8a3f2a", NATURAL, "#5d4636", "#4a5370", "#a8724a"];
/** Cushma stripes: dark ones on light cloth, light ones on dark cloth. */
export const STRIPES = ["#2a1d17", "#3b2a20", "#efe3c8", "#c8b48a"];
/** Kené skirts: cream with dark lines, huito indigo-black with cream lines, achiote red with dark lines. */
export const SKIRTS: ReadonlyArray<readonly [base: string, line: string]> = [
  [CREAM, "#2b2320"],
  ["#2b3550", CREAM],
  [CREAM, "#8a2f25"],
  ["#1f2230", "#e8d9b8"],
  ["#a8432f", "#2b2320"],
];
/** Blouses: bright satin colours common at markets and feasts, and plainer everyday ones. */
export const BLOUSES = ["#c2456b", "#2a9d8f", "#e07a3a", "#3446a6", "#7a3d8f", "#d6303a", "#3f7f4a", "#e8b631"];
/** Ribbons (blouse bands, crown bands). */
export const RIBBONS = ["#e8b631", "#efe6d6", "#2a9d8f", "#d6303a", "#3446a6", "#ff8a3d"];
/** Children's tees and shorts. */
export const TEES = ["#e8e2d4", "#d6303a", "#2f6fb5", "#e8b631", "#3f7f4a", "#ff8a3d", "#7a3d8f"];
export const SHORTS = ["#2a3f6b", "#3b3330", "#4a6a3a", "#22262f", "#6b4a2e"];
/** Macaw feathers of the crowns: scarlet, with blue or yellow. */
const FEATHERS = ["#2f6fb5", "#e8b631"];

export const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** Light cloth (natural cotton, pale browns) gets dark stripes; dark cloth gets light ones. */
export function stripeFor(cushma: string): string {
  const n = Number.parseInt(cushma.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? (STRIPES[0] as string) : (STRIPES[2] as string);
}

export interface DressOpts {
  skin?: string;
  /** Cushma colour (men). */
  cushma?: string;
  /** Kené skirt [base, line] (women, girls). */
  skirt?: readonly [string, string];
  /** Blouse, tee (women, children, young men). */
  top?: string;
  /** Shorts (boys, young men). */
  shorts?: string;
}

/** One villager's palette (pass it as the Npc palette; colours never live in the spec). */
export function dressOf(who: Who, r: () => number, o: DressOpts = {}): Dress {
  const skin = o.skin ?? pick(r, SKINS);
  switch (who) {
    case "man":
    case "crown":
    case "elder": {
      const c = o.cushma ?? (who === "elder" ? NATURAL : pick(r, CUSHMAS));
      const s = stripeFor(c);
      return {
        skin,
        hair: who === "elder" ? "#3a332e" : HAIR,
        wrap: c,
        wrapR: s,
        wrapG: s,
        // The hem band: a darker line on light cloth, the stripe colour on dark.
        wrapB: s === STRIPES[0] ? "#3b2a20" : s,
        wrapW: c,
        // Feather crown: a woven band with a seed edge and standing macaw feathers.
        hat: s,
        hatBand: pick(r, ["#3b2a20", ...RIBBONS.slice(0, 3)]),
        hatTrim: SEED_W,
        feather1: "#c8312b",
        feather2: pick(r, FEATHERS),
      };
    }
    case "woman":
    case "teen":
    case "girl": {
      const [base, line] = o.skirt ?? pick(r, SKIRTS);
      const top = o.top ?? (who === "girl" ? pick(r, TEES) : pick(r, BLOUSES));
      let ribbon = pick(r, RIBBONS);
      if (ribbon === top) ribbon = CREAM;
      return {
        skin,
        hair: HAIR,
        top,
        trim: ribbon,
        skirt: base,
        skirtR: line,
        skirtG: line,
        skirtB: line,
        skirtW: base,
        bead1: HUAYRURO,
        bead2: SEED_W,
      };
    }
    default: {
      // Boys, swimmers and young men: a tee (or bare chest) and shorts.
      return {
        skin,
        hair: HAIR,
        top: o.top ?? pick(r, TEES),
        trim: pick(r, RIBBONS),
        legs: o.shorts ?? pick(r, SHORTS),
      };
    }
  }
}

/** Instance scale (height jitter only: the archetypes already carry child, elder and adult proportions). */
export function heightJitter(who: Who, r: () => number): number {
  return who === "boy" || who === "girl" || who === "swimmer" ? 0.94 + r() * 0.1 : 0.96 + r() * 0.07;
}
