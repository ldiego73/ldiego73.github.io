/**
 * Who the Kuntisuyu's people are and what they wear, on the shared characters (../../../characters): the
 * archetype specs (`HumanSpec`, from presets.ts `PEOPLE`) and the palettes (`Dress`) for the village
 * (../gente.ts) and the road and the Cruz del Cóndor (../viajeros.ts). No geometry lives here: the Colca hats
 * (the white Cabanaconde hat with its embroidered brim, the tall white Collagua hat with its lace band) and the
 * bordado pollera are core garments; this file only picks them and dyes them as the valley does.
 *
 *  - Valley women: white hat; the pollera's base in deep bayeta colours with the embroidery (rows of flowers,
 *    the wide white hem with big flowers) in fuchsia, gold, green and turquoise; an embroidered jobona.
 *  - Valley men: felt hat and poncho (the mountain's campesino), or shirt and trousers (people from Nasca).
 *  - Children: a boy in poncho and chullo, a girl in a short bordado pollera and the Cabana hat.
 *  - Walkers, visitors and archaeologists: jackets, caps or canvas sun hats, day packs; khaki for the
 *    archaeologists.
 *
 * Pure (no DOM, no Three): tested in dress.test.ts.
 */
import type { HumanSpec } from "../../../characters/archetype";
import { HAIRS, PEOPLE, SKINS, wardrobe } from "../../../characters/presets";
import type { Dress } from "../../../characters/slots";

export const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** Seeded PRNG (mulberry32): every visit dresses the same people the same way. */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The valley's hats are white (felt or straw, whitened). */
const HAT_WHITE = "#f5f1e8";
/** Embroidery threads: fuchsia, gold, green, turquoise, orange, violet. */
export const FLOWERS = ["#d6306f", "#e9b23a", "#3f9a5a", "#2a9db0", "#e0572f", "#8b3fa8"];
/** Pollera fields (bayeta) under the embroidery. */
export const BORDADOS = ["#2f3b8f", "#7b2350", "#1f6f6a", "#8c1f2a", "#3d2b6b", "#c2456b"];
/** Outdoor shells and packs (walkers), khaki field clothes (archaeologists), trousers. */
export const SHELLS = ["#2f6db0", "#d0553a", "#3f8a5a", "#e2a83a", "#5a4e8c", "#c23b5a"];
export const KHAKI = ["#b8a77e", "#9c8d68", "#c9b58a", "#7d7a5c"];
export const PACKS = ["#2a9d8f", "#c4383f", "#e07a3a", "#3446a6", "#5b5a58"];
export const TROUSERS = ["#3b3a36", "#5a5046", "#2f3557", "#6b6152", "#4a4a44"];
/** Visitors come from everywhere: the valley's skins plus a few lighter and darker ones. */
const VISITOR_SKINS = [...SKINS, "#e8c4a4", "#d9a882", "#f0cfb0", "#7a4a30"];
const LIGHT_HAIRS = [...HAIRS, "#6b4a2b", "#b08a4a", "#8a6a4a"];

/** Three different embroidery threads, in a seeded order. */
function threads(r: () => number): [string, string, string] {
  const i = Math.floor(r() * FLOWERS.length);
  const at = (k: number) => FLOWERS[(i + k * 2) % FLOWERS.length] as string;
  return [at(0), at(1), at(2)];
}

/** A woman (or girl) of the Colca valley in her embroidered dress. */
export function valleyWoman(r: () => number): Dress {
  const base = wardrobe.andeanWoman(r);
  const [a, b, c] = threads(r);
  return {
    ...base,
    top: pick(r, BORDADOS),
    trim: a,
    hat: HAT_WHITE,
    // The Cabana hat's brim flowers (hatBand, tie, bead1) and ribbon; the Collagua hat's ribbon and lace.
    hatBand: b,
    hatTrim: c,
    tie: a,
    bead1: c,
    white: "#fbf8f0",
    skirt: pick(r, BORDADOS),
    skirtR: a,
    skirtG: b,
    skirtB: c,
    skirtW: "#f4efe4",
    shawl: pick(r, ["#7b2350", "#2f3b8f", "#3d2b6b", "#8c1f2a", "#1f6f6a"]),
    shawlR: b,
    shawlG: a,
    shawlB: "#efe6d6",
    shawlW: c,
  };
}

/** A man of the valley (felt hat, poncho) or of Nasca (felt hat, shirt). */
export const valleyMan = (r: () => number): Dress => wardrobe.andeanMan(r, false, true);

/** A walker or visitor: shell jacket, cap or sun hat, a day pack. Khaki field clothes for archaeologists. */
export function outdoor(r: () => number, khaki = false): Dress {
  const shell = khaki ? pick(r, KHAKI) : pick(r, SHELLS);
  return {
    skin: pick(r, VISITOR_SKINS),
    hair: pick(r, LIGHT_HAIRS),
    top: shell,
    trim: khaki ? "#6b5a3e" : pick(r, ["#2f4858", "#1f1a17", "#efe6d6"]),
    legs: khaki ? pick(r, ["#8a7a58", "#6d6a52"]) : pick(r, TROUSERS),
    hat: khaki ? "#d8c9a3" : pick(r, ["#cbb88f", "#efe6d6", "#2f4858", ...SHELLS]),
    hatBand: khaki ? "#6b5a3e" : pick(r, ["#2f4858", "#6b4a2b", "#c4383f"]),
    hatTrim: khaki ? "#c9b58a" : "#e6dcc2",
    pack: pick(r, PACKS),
    packTrim: pick(r, ["#1f1a17", "#dda63c", "#2b2a2c"]),
    accent: pick(r, PACKS),
    shoe: pick(r, ["#3b2a20", "#4a4038", "#2a2420"]),
    sole: "#2a2420",
    sock: pick(r, ["#6e6258", "#efe6d6", "#c8572f"]),
  };
}

// ---------------------------------------------------------------- specs

/** The archetypes this world uses (prefetched at load). */
export const COLCA = {
  cabana: PEOPLE.cabanaconde,
  collagua: PEOPLE.collagua,
  /** Valley man: felt hat and poncho. */
  man: PEOPLE.campesinoFelt,
  /** People from Nasca: felt hat, shirt and trousers. */
  nascaMan: PEOPLE.valleyMan,
  nascaWoman: PEOPLE.campesinaFelt,
  boy: PEOPLE.wawaBoy,
  girl: {
    ...PEOPLE.wawaGirl,
    hat: "cabana",
    layers: [{ kind: "pollera", region: "bordado", tiers: 1, hem: 0.4 }],
  },
  trekker: PEOPLE.hiker,
  trekkerWoman: PEOPLE.hikerWoman,
  /** Visitors without a pack. */
  tourist: { ...PEOPLE.hiker, worn: [] },
  touristWoman: { ...PEOPLE.hikerWoman, worn: [] },
  /** Archaeologists: the canvas sun hat, no pack. */
  archaeologist: { ...PEOPLE.hiker, hat: "sunhat", worn: [] },
  archaeologistWoman: { ...PEOPLE.hikerWoman, worn: [] },
} satisfies Record<string, HumanSpec>;

export type ColcaWho = keyof typeof COLCA;

/** Every spec, for prefetchHumans. */
export const ALL_SPECS: readonly HumanSpec[] = Object.values(COLCA);
