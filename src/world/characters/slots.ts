/**
 * The palette slots every human archetype shares (pure data). A built body never stores a colour: each vertex
 * names a slot, and each person brings a palette (one colour per slot), so ONE geometry dresses many people.
 * Because every human uses the same table, a wardrobe is just a named object (`dress({ skin, top, ... })`) and
 * the crowd can keep one palette row per person (./crowd.ts).
 *
 * Cloth pieces (poncho, pollera, lliclla, cushma skirt, open shirt) pick a base slot plus four pattern slots
 * (the R, G, B and white masks of the pattern atlas, ./patterns.ts), so each cloth group has five slots.
 *
 * Pure (no DOM, no Three).
 */

export const PALETTE_SIZE = 40;

/** Slot numbers (the index in a palette array). */
export const HS = {
  skin: 0,
  hair: 1,
  /** Shirt, sweater, jacket, jobona, blouse, tee (and its sleeves). */
  top: 2,
  /** Cuffs, collar, yoke, ribbons, zip, embroidery on the top. */
  trim: 3,
  /** Trousers, shorts (bare legs use the skin colour here). */
  legs: 4,
  shoe: 5,
  sole: 6,
  sock: 7,
  hat: 8,
  hatBand: 9,
  /** Brim edge, lining, the chullo's second dye. */
  hatTrim: 10,
  /** Poncho, cushma, open shirt, chalina, aguayo bundle: base and the four pattern dyes. */
  wrap: 11,
  wrapR: 12,
  wrapG: 13,
  wrapB: 14,
  wrapW: 15,
  /** Pollera, wrap skirt, cushma skirt, apron: base and the four pattern dyes. */
  skirt: 16,
  skirtR: 17,
  skirtG: 18,
  skirtB: 19,
  skirtW: 20,
  /** Lliclla, shawl, bundle cloth: base and the four pattern dyes. */
  shawl: 21,
  shawlR: 22,
  shawlG: 23,
  shawlB: 24,
  shawlW: 25,
  /** Silver tupu, buckles, glasses frames. */
  metal: 26,
  /** Braid ties (tullma), tassels, pompoms, cords. */
  tie: 27,
  /** Backpack, carry basket, worn bags. */
  pack: 28,
  packTrim: 29,
  /** Free accents (bandana, belt, the under-tier of a pollera, bedroll). */
  accent: 30,
  accent2: 31,
  laptop: 32,
  screen: 33,
  bead1: 34,
  bead2: 35,
  feather1: 36,
  feather2: 37,
  /** Plain cotton white (fringes, lace, socks). */
  white: 38,
  /** Near-black (lenses, soles, felt). */
  dark: 39,
} as const;

export type SlotName = keyof typeof HS;
export type Dress = Partial<Record<SlotName, string>>;

/** Defaults: an undyed, earthy outfit (a wardrobe overrides what it needs). */
export const DEFAULT_DRESS: Record<SlotName, string> = {
  skin: "#b07048",
  hair: "#1d1512",
  top: "#7a2f35",
  trim: "#dda63c",
  legs: "#2f3557",
  shoe: "#4a2e1c",
  sole: "#2a2420",
  sock: "#efe6d6",
  hat: "#c4383f",
  hatBand: "#dda63c",
  hatTrim: "#3446a6",
  wrap: "#e9dcc4",
  wrapR: "#c4383f",
  wrapG: "#dda63c",
  wrapB: "#3446a6",
  wrapW: "#2a9d8f",
  skirt: "#c2456b",
  skirtR: "#c4383f",
  skirtG: "#dda63c",
  skirtB: "#3446a6",
  skirtW: "#efe6d6",
  shawl: "#7d2b3a",
  shawlR: "#e07a3a",
  shawlG: "#2a9d8f",
  shawlB: "#efe6d6",
  shawlW: "#dda63c",
  metal: "#cfd3d6",
  tie: "#e8b631",
  pack: "#6b4a2b",
  packTrim: "#dda63c",
  accent: "#2a9d8f",
  accent2: "#3446a6",
  laptop: "#3d4046",
  screen: "#9fd7d0",
  bead1: "#c4383f",
  bead2: "#1d1512",
  feather1: "#d6303a",
  feather2: "#2a6fd6",
  white: "#efe6d6",
  dark: "#1c1d24",
};

/** A full palette (PALETTE_SIZE hex strings) from a partial dress over `base`. */
export function dress(d: Dress, base: Record<SlotName, string> = DEFAULT_DRESS): string[] {
  const out = new Array<string>(PALETTE_SIZE);
  for (const k of Object.keys(HS) as SlotName[]) out[HS[k]] = d[k] ?? base[k];
  return out;
}

/** Slots of a cloth group: base then the R, G, B, white pattern dyes. */
export const CLOTH_GROUPS = {
  wrap: [HS.wrap, HS.wrapR, HS.wrapG, HS.wrapB, HS.wrapW],
  skirt: [HS.skirt, HS.skirtR, HS.skirtG, HS.skirtB, HS.skirtW],
  shawl: [HS.shawl, HS.shawlR, HS.shawlG, HS.shawlB, HS.shawlW],
} as const;
export type ClothGroup = keyof typeof CLOTH_GROUPS;
