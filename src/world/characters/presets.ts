/**
 * Ready-made people for every world, as archetype specs (./archetype.ts) plus wardrobes (palette pickers,
 * ./slots.ts). World code composes these instead of building geometry:
 *
 *   const spec = PEOPLE.campesina;                      // or { ...PEOPLE.campesina, hat: "felt" }
 *   const palette = dress(wardrobe.andeanWoman(rng));   // one person's colours
 *
 * The traveler's five outfits (`TRAVELER`) and their palettes (`TRAVELER_DRESS`) are here too. Clothing is
 * drawn from everyday dress of each region (highland Quechua and Aymara, Shipibo-Konibo / Asháninka river
 * communities, the northern coast, the Colca valley), plainly and without caricature.
 *
 * Pure (no DOM, no Three).
 */
import type { HumanSpec } from "./archetype";
import { FACE } from "./archetype";
import type { Dress } from "./slots";

// ---------------------------------------------------------------- the traveler

export type Outfit = "andean" | "explorer" | "beach" | "altiplano" | "trek";

// Clumped anime locks under the chullo; a short crop (a shell with bangs) under the brimmed hats and the cap.
const travelerBase = { sex: "m", build: "sturdy", hair: "crop", face: FACE.traveler } as const;

export const TRAVELER: Record<Outfit, HumanSpec> = {
  andean: {
    ...travelerBase,
    hair: "locks",
    hat: "chullo",
    top: "sweater",
    bottom: "trousers",
    feet: "boots",
    layers: [{ kind: "poncho" }],
    worn: ["backpack"],
  },
  explorer: {
    ...travelerBase,
    hat: "explorer",
    top: { kind: "polo", belt: true },
    bottom: "shorts",
    feet: "boots",
    worn: ["bandana", "backpack", "shirt-collar"],
  },
  beach: {
    ...travelerBase,
    hat: "straw",
    top: "tee",
    bottom: "board-shorts",
    feet: "sandals",
    layers: [{ kind: "vest", region: "floral", group: "wrap" }],
    worn: ["sunglasses", "backpack"],
  },
  altiplano: {
    ...travelerBase,
    hat: "altiplano",
    top: "chompa",
    bottom: "trousers",
    feet: "boots",
    worn: ["chalina", "backpack"],
  },
  trek: {
    ...travelerBase,
    hat: "trek-cap",
    top: "windbreaker",
    bottom: "cargo",
    feet: "boots",
    worn: ["backpack"],
  },
};

const travelerCommon: Dress = {
  skin: "#b9764a",
  hair: "#2b1d15",
  pack: "#6b4a2b",
  packTrim: "#dda63c",
  accent: "#2a9d8f",
  laptop: "#3d4046",
  screen: "#9fd7d0",
  white: "#efe6d6",
  sole: "#2a2420",
  shoe: "#4a2e1c",
  sock: "#efe6d6",
};

export const TRAVELER_DRESS: Record<Outfit, Dress> = {
  andean: {
    ...travelerCommon,
    top: "#7a2f35",
    legs: "#2f3557",
    hat: "#c4383f",
    hatBand: "#dda63c",
    hatTrim: "#3446a6",
    tie: "#dda63c",
    trim: "#3446a6",
    wrap: "#e9dcc4",
    wrapR: "#c4383f",
    wrapG: "#dda63c",
    wrapB: "#3446a6",
    wrapW: "#2a9d8f",
  },
  explorer: {
    ...travelerCommon,
    top: "#e6dcc2",
    trim: "#4f7a62",
    legs: "#a88d5c",
    accent2: "#5a3b24",
    metal: "#dda63c",
    hat: "#c7a96f",
    hatBand: "#5a3b24",
    hatTrim: "#b39257",
    accent: "#c4383f",
  },
  beach: {
    ...travelerCommon,
    top: "#efe6d6",
    trim: "#efe6d6",
    legs: "#2c4a7a",
    shoe: "#6b4026",
    sole: "#3b2a1e",
    hat: "#d8c07a",
    hatTrim: "#bfa25e",
    hatBand: "#3446a6",
    wrap: "#2a8f86",
    wrapR: "#e2675f",
    wrapG: "#dda63c",
    wrapB: "#1d6b5e",
    wrapW: "#efe6d6",
    dark: "#1c1d24",
  },
  altiplano: {
    ...travelerCommon,
    top: "#8a6f58",
    trim: "#c4383f",
    legs: "#3a3a44",
    hat: "#3f2c21",
    hatBand: "#c4383f",
    hatTrim: "#2f2119",
    accent: "#c4383f",
    accent2: "#dda63c",
  },
  trek: {
    ...travelerCommon,
    top: "#c8572f",
    trim: "#2f4858",
    legs: "#6d6a52",
    hat: "#cbb88f",
    hatBand: "#2f4858",
    hatTrim: "#cbb88f",
    sock: "#c8572f",
    shoe: "#3b2a20",
    dark: "#2a2420",
  },
};

// ---------------------------------------------------------------- people of the worlds

export const PEOPLE = {
  // Highlands (mountain, Qusqu): campesinos with poncho and chullo or felt hat, campesinas with jobona,
  // pollera, lliclla and montera, their children, festival dancers, an elder.
  campesino: {
    sex: "m",
    hair: "crop",
    hat: "chullo",
    top: "shirt",
    bottom: "knee-trousers",
    feet: "ojotas",
    layers: [{ kind: "poncho", hem: 0.7 }],
  },
  campesinoFelt: {
    sex: "m",
    hair: "crop",
    hat: "felt",
    top: "shirt",
    bottom: "knee-trousers",
    feet: "ojotas",
    layers: [{ kind: "poncho", hem: 0.7 }],
  },
  campesina: {
    sex: "f",
    hair: "braids",
    hat: "montera",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera" }, { kind: "lliclla" }],
    worn: ["tupu"],
  },
  campesinaFelt: {
    sex: "f",
    hair: "braids",
    hat: "felt",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera" }, { kind: "lliclla" }],
    worn: ["tupu"],
  },
  wawaBoy: {
    sex: "m",
    age: "child",
    hair: "crop",
    hat: "chullo",
    top: "sweater",
    bottom: "knee-trousers",
    feet: "ojotas",
    layers: [{ kind: "poncho", hem: 0.72 }],
  },
  wawaGirl: {
    sex: "f",
    age: "child",
    hair: "braids",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera", tiers: 1, hem: 0.4 }],
  },
  dancerWoman: {
    sex: "f",
    hair: "braids",
    hat: "montera-fiesta",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera" }, { kind: "lliclla" }],
  },
  dancerMan: {
    sex: "m",
    hair: "crop",
    hat: "chullo",
    top: "shirt",
    bottom: "knee-trousers",
    feet: "ojotas",
    layers: [{ kind: "poncho", hem: 0.72 }],
  },
  amauta: {
    sex: "m",
    age: "elder",
    hair: "crop",
    hat: "chullo",
    top: "shirt",
    bottom: "trousers",
    feet: "ojotas",
    layers: [{ kind: "poncho", hem: 0.62 }],
  },
  elderWoman: {
    sex: "f",
    age: "elder",
    hair: "braids",
    hat: "felt",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera" }, { kind: "lliclla" }],
    worn: ["tupu"],
  },
  // Antisuyu river community: the cushma, the kené wrap skirt with a ribboned blouse, children.
  comunero: { sex: "m", hair: "crop", top: "cushma", bottom: "bare", feet: "bare", layers: [{ kind: "cushma" }] },
  comuneroCrown: {
    sex: "m",
    hair: "crop",
    hat: "feather-crown",
    top: "cushma",
    bottom: "bare",
    feet: "bare",
    layers: [{ kind: "cushma" }],
  },
  comunera: {
    sex: "f",
    hair: "long",
    top: { kind: "blouse", sleeves: "short" },
    bottom: "bare",
    feet: "bare",
    layers: [{ kind: "skirt", region: "kene" }],
    worn: ["beads"],
  },
  riverBoy: { sex: "m", age: "child", hair: "crop", top: "tee", bottom: "shorts", feet: "bare" },
  riverGirl: {
    sex: "f",
    age: "child",
    hair: "long",
    top: { kind: "blouse", sleeves: "short" },
    bottom: "bare",
    feet: "bare",
    layers: [{ kind: "skirt", region: "kene", hem: 0.3 }],
  },
  swimmer: { sex: "m", age: "child", hair: "crop", top: "bare", bottom: "shorts", feet: "bare" },
  // Chinchaysuyu coast: fishermen and market women of the northern coast, a surfer.
  pescador: {
    sex: "m",
    hair: "crop",
    hat: "straw",
    top: { kind: "shirt", sleeves: "short" },
    bottom: "trousers",
    feet: "bare",
  },
  vendedora: {
    sex: "f",
    hair: "bun",
    hat: "straw",
    top: { kind: "blouse", sleeves: "short" },
    bottom: "bare",
    feet: "shoes",
    layers: [{ kind: "skirt", region: "plain", flare: 0.3, pleats: 10, hem: 0.3 }, { kind: "apron" }],
  },
  surfer: { sex: "m", hair: "crop", top: "bare", bottom: "board-shorts", feet: "bare" },
  // Collasuyu lake: an Aymara woman with her bombín, a Taquile man with his chullo and vest.
  aymara: {
    sex: "f",
    hair: "braids",
    hat: "bowler",
    top: "blouse",
    bottom: "bare",
    feet: "shoes",
    layers: [{ kind: "pollera" }, { kind: "lliclla" }],
  },
  taquile: {
    sex: "m",
    hair: "crop",
    hat: "chullo",
    top: "shirt",
    bottom: "trousers",
    feet: "ojotas",
    layers: [{ kind: "vest", region: "plain", group: "wrap", gap: 0.4, hem: 0.86 }],
  },
  // Kuntisuyu: the Colca valley women's hats and embroidered skirts, valley men, travellers on the road.
  cabanaconde: {
    sex: "f",
    hair: "braids",
    hat: "cabana",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera", region: "bordado" }, { kind: "lliclla" }],
  },
  collagua: {
    sex: "f",
    hair: "braids",
    hat: "collagua",
    top: "jobona",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera", region: "bordado" }, { kind: "lliclla" }],
  },
  // A Taquile woman: the dark head cloth (chukoo) over a blouse, pollera and woven belt.
  taquileWoman: {
    sex: "f",
    hair: "braids",
    hat: "head-shawl",
    top: "blouse",
    bottom: "bare",
    feet: "ojotas",
    layers: [{ kind: "pollera" }],
    worn: ["chumpi"],
  },
  // A chasqui runner of the royal road: unku tunic, woven belt, a plumed headband.
  chasqui: {
    sex: "m",
    hair: "crop",
    hat: "headband-plume",
    top: "unku",
    bottom: "bare",
    feet: "ojotas",
    worn: ["chumpi"],
  },
  valleyMan: { sex: "m", hair: "crop", hat: "felt", top: "shirt", bottom: "trousers", feet: "shoes" },
  hikerBeard: {
    sex: "m",
    hair: "crop",
    beard: "short",
    top: "jacket",
    bottom: "cargo",
    feet: "boots",
    worn: ["daypack", "sunglasses"],
  },
  hiker: { sex: "m", hair: "crop", hat: "cap", top: "jacket", bottom: "cargo", feet: "boots", worn: ["daypack"] },
  hikerWoman: {
    sex: "f",
    hair: "ponytail",
    hat: "sunhat",
    top: "jacket",
    bottom: "trousers",
    feet: "boots",
    worn: ["daypack"],
  },
} satisfies Record<string, HumanSpec>;

export type PersonPreset = keyof typeof PEOPLE;

// ---------------------------------------------------------------- wardrobes (palette pickers)

/** Skin tones (warm browns) and hair. */
export const SKINS = ["#9a6440", "#b9764a", "#8e5a38", "#a86a42", "#c08458", "#9b6239", "#b47a50", "#a56b45"];
export const HAIRS = ["#1d1512", "#15100d", "#241812", "#2b1d15"];
export const GREY_HAIR = ["#8a8178", "#a39a90", "#6e665e"];
/** Poncho fields: cochineal reds, alpaca browns, deep indigo, natural grey. */
export const PONCHOS = ["#9e2f33", "#8a3a2c", "#7d5137", "#2f3a6b", "#6e6258", "#b0453a"];
/** Polleras: dyed bayeta in bright natural-dye colours. */
export const POLLERAS = ["#c2456b", "#3446a6", "#2a9d8f", "#3f7f4a", "#d0663a", "#8a2f6a", "#c4383f"];
/** Weaves / accents (lliclla, chullo, hem bands). */
export const WEAVES = ["#c4383f", "#dda63c", "#2a9d8f", "#c2456b", "#3446a6", "#e07a3a"];
/** Trousers / jackets. */
export const DARKS = ["#2a2420", "#2f3557", "#3b3330", "#4a3a2e", "#22262f"];
export const FESTIVE = ["#d6303a", "#e8b631", "#e0457b", "#2a9d8f", "#3446a6", "#ff8a3d"];
/** Undyed cottons and light shirts. */
export const LIGHTS = ["#efe6d6", "#e6dcc2", "#d9e2e6", "#f1e9d0", "#dfe6d6"];
/** Cushma bark browns, achiote red-browns, natural cotton. */
export const CUSHMAS = ["#7a4a2e", "#8e3b2a", "#e9dcc4", "#6b4a36", "#a0522d"];

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** Palette pickers: each returns a Dress for one person (pass `dress()` from ./slots.ts the result). */
export const wardrobe = {
  /** `felt`: a felt hat (dark felt, a woven band) instead of a dyed chullo. */
  andeanMan(r: () => number, festive = false, felt = false): Dress {
    const poncho = festive ? pick(r, FESTIVE) : pick(r, PONCHOS);
    return {
      skin: pick(r, SKINS),
      hair: pick(r, HAIRS),
      top: pick(r, LIGHTS),
      trim: pick(r, LIGHTS),
      legs: pick(r, DARKS),
      shoe: "#2f2723",
      sole: "#2f2723",
      hat: felt ? pick(r, ["#3b2c25", "#2b2420", "#4a3a2e"]) : pick(r, WEAVES),
      hatBand: pick(r, WEAVES),
      hatTrim: felt ? "#2a2420" : pick(r, ["#3446a6", "#2a2420", "#c4383f"]),
      tie: pick(r, WEAVES),
      wrap: poncho,
      wrapR: pick(r, WEAVES),
      wrapG: pick(r, WEAVES),
      wrapB: "#efe6d6",
      wrapW: pick(r, WEAVES),
    };
  },
  /** `felt`: a felt sombrero (the montera's colours otherwise). */
  andeanWoman(r: () => number, festive = false, felt = false): Dress {
    return {
      skin: pick(r, SKINS),
      hair: pick(r, HAIRS),
      top: festive ? pick(r, FESTIVE) : pick(r, DARKS),
      trim: pick(r, WEAVES),
      legs: "#a86a42",
      shoe: "#2f2723",
      sole: "#2f2723",
      hat: festive ? pick(r, FESTIVE) : felt ? pick(r, ["#3b2c25", "#efe6d6", "#4a3a2e"]) : "#2b2420",
      hatBand: felt ? pick(r, WEAVES) : "#b8303a",
      hatTrim: pick(r, WEAVES),
      tie: pick(r, ["#e8b631", "#c4383f", "#2a9d8f"]),
      skirt: festive ? pick(r, FESTIVE) : pick(r, POLLERAS),
      skirtR: pick(r, WEAVES),
      skirtG: pick(r, WEAVES),
      skirtB: pick(r, ["#3446a6", "#2a9d8f", "#2a2420"]),
      skirtW: "#efe6d6",
      accent2: pick(r, POLLERAS),
      shawl: pick(r, ["#7d2b3a", "#2f3a6b", "#3f2c4a", "#5a2a2a"]),
      shawlR: pick(r, WEAVES),
      shawlG: pick(r, WEAVES),
      shawlB: "#efe6d6",
      shawlW: pick(r, WEAVES),
    };
  },
  amazonMan(r: () => number): Dress {
    const c = pick(r, CUSHMAS);
    return {
      skin: pick(r, ["#8e5a38", "#9a6440", "#7e4e30", "#a0663e"]),
      hair: "#15100d",
      wrap: c,
      wrapR: pick(r, ["#3a2418", "#efe3c8", "#6b2a1e"]),
      wrapB: pick(r, ["#3a2418", "#6b2a1e"]),
      wrapW: "#efe3c8",
      feather1: "#d6303a",
      feather2: pick(r, ["#2a6fd6", "#e8b631"]),
      hatBand: "#3a2418",
      hatTrim: "#efe3c8",
    };
  },
  amazonWoman(r: () => number): Dress {
    return {
      skin: pick(r, ["#8e5a38", "#9a6440", "#7e4e30", "#a0663e"]),
      hair: "#15100d",
      top: pick(r, ["#2a6fd6", "#d6303a", "#e8b631", "#3f9a5a", "#c2456b"]),
      trim: pick(r, ["#e8b631", "#efe3c8", "#2a9d8f"]),
      skirt: "#efe3c8",
      skirtR: "#1f1a17",
      skirtG: "#4a2a1e",
      skirtB: "#1f1a17",
      skirtW: "#efe3c8",
      bead1: "#c4383f",
      bead2: "#1d1512",
    };
  },
  coastMan(r: () => number): Dress {
    return {
      skin: pick(r, SKINS),
      hair: pick(r, HAIRS),
      top: pick(r, ["#efe6d6", "#d9e2e6", "#8fb8c9", "#e6dcc2"]),
      trim: "#efe6d6",
      legs: pick(r, ["#3a3a44", "#c8b48a", "#2f3557"]),
      hat: "#d8c07a",
      hatTrim: "#bfa25e",
      hatBand: "#2a2420",
    };
  },
  coastWoman(r: () => number): Dress {
    return {
      skin: pick(r, SKINS),
      hair: pick(r, HAIRS),
      top: pick(r, ["#efe6d6", "#e2675f", "#8fb8c9", "#dda63c"]),
      skirt: pick(r, ["#2f3557", "#7a2f35", "#3f7f4a"]),
      skirtR: pick(r, WEAVES),
      skirtW: "#efe6d6",
      shawl: pick(r, ["#efe6d6", "#d9e2e6", "#f1e9d0"]),
      shawlR: pick(r, ["#2a9d8f", "#c4383f"]),
      shawlW: "#efe6d6",
      hat: "#d8c07a",
      hatTrim: "#bfa25e",
      hatBand: "#2a2420",
      shoe: "#2a2420",
    };
  },
  traveller(r: () => number): Dress {
    return {
      skin: pick(r, [...SKINS, "#d9a07a", "#e8b896"]),
      hair: pick(r, [...HAIRS, "#6b4a2b", "#b08a4a"]),
      top: pick(r, ["#c8572f", "#2f6b8a", "#3f7f4a", "#8a2f6a", "#d6a23a"]),
      trim: pick(r, ["#2f4858", "#1f1a17", "#efe6d6"]),
      legs: pick(r, ["#6d6a52", "#3a3a44", "#4a5560"]),
      hat: pick(r, ["#cbb88f", "#efe6d6", "#2f4858"]),
      hatBand: pick(r, ["#2f4858", "#6b4a2b"]),
      pack: pick(r, ["#2f6b8a", "#c4383f", "#3f7f4a", "#2a2420"]),
      packTrim: pick(r, ["#1f1a17", "#dda63c"]),
      shoe: "#3b2a20",
      sock: "#6e6258",
    };
  },
};
