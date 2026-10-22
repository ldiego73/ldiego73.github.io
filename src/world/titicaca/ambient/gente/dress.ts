/**
 * Who the lake's people are (../gente.ts): for each role, the person's archetype on the shared characters
 * (../../../characters/presets.ts specs), the palette that keeps each community's everyday dress, the prop in
 * their hands or on their back, and how far they glance at the traveler.
 *  - Uros and Aymara women: pollera, lliclla and the bombín (bowler hat), in bright bayeta colours.
 *  - Taquile: the men in a white shirt, black vest and trousers, the red chullo of married men, knitting a
 *    chullo; the women in a red pollera (a green under-tier), a white blouse and a black shawl, spinning with
 *    the pushka. Only Taquile's own weavers wear Taquile's dress (the shepherdess spins in a pollera and bombín).
 *  - Men on the islands, the boats and the road: chullo (or felt hat) and poncho; the paqo, an elder.
 *  - Children: the highland wawas.
 * Pure (no DOM, no Three): tested in dress.test.ts.
 */
import type { HumanSpec } from "../../../characters/archetype";
import { PEOPLE, wardrobe } from "../../../characters/presets";
import type { PropKind } from "../../../characters/props";
import type { Dress } from "../../../characters/slots";
import type { Role } from "./logic";

/** Taquile's women: no hat (their black shawl is the lliclla), a white blouse over a red pollera. */
const TAQUILE_WOMAN: HumanSpec = {
  sex: "f",
  hair: "braids",
  top: "blouse",
  bottom: "bare",
  feet: "ojotas",
  layers: [{ kind: "pollera" }, { kind: "lliclla" }],
};

/** Every archetype the lake uses (for prefetching at load). */
export const LAKE_SPECS: readonly HumanSpec[] = [
  PEOPLE.aymara,
  PEOPLE.taquile,
  TAQUILE_WOMAN,
  PEOPLE.campesino,
  PEOPLE.campesinoFelt,
  PEOPLE.wawaBoy,
  PEOPLE.wawaGirl,
  PEOPLE.amauta,
];

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** Bowler felts: dark brown, black, a few in the lighter coffee colour. */
const BOMBIN = ["#2a221e", "#1f1a17", "#3b2c25", "#6b4a36"];

const aymaraWoman = (r: () => number): Dress => ({
  ...wardrobe.andeanWoman(r),
  hat: pick(r, BOMBIN),
  hatBand: "#1a1513",
  hatTrim: "#1a1513",
  top: pick(r, ["#efe6d6", "#c2456b", "#3446a6", "#7a2f35", "#2a9d8f"]),
  shoe: "#1f1a17",
});

const taquileMan = (r: () => number): Dress => ({
  ...wardrobe.andeanMan(r),
  top: "#efe6d6",
  trim: "#efe6d6",
  legs: "#1f1a17",
  hat: "#b8282f",
  hatBand: "#efe6d6",
  hatTrim: "#b8282f",
  tie: "#efe6d6",
  wrap: "#1f1a17",
  wrapR: "#1f1a17",
  wrapG: "#1f1a17",
  wrapB: "#1f1a17",
  wrapW: "#1f1a17",
});

const taquileWoman = (r: () => number): Dress => ({
  ...wardrobe.andeanWoman(r),
  top: pick(r, ["#efe6d6", "#b8282f"]),
  trim: "#2f7a46",
  skirt: "#b8282f",
  skirtR: "#2f7a46",
  skirtG: "#dda63c",
  skirtB: "#1f1a17",
  skirtW: "#efe6d6",
  accent2: "#2f7a46",
  shawl: "#1f1a17",
  shawlR: "#2a2420",
  shawlG: "#b8282f",
  shawlB: "#2a2420",
  shawlW: "#3b3330",
});

export interface Who {
  spec: HumanSpec;
  palette: (r: () => number) => Dress;
  kid: boolean;
}

/**
 * The person for a role. `seed` decides the alternatives the old crowd also had: walkers, travellers and
 * pilgrims are men on even seeds; children are boys on odd seeds; travelling men wear a felt hat on every third
 * seed; spinners with a seed below 100 are Taquile's (the shepherdess has a larger one).
 */
export function specOf(role: Role, seed: number): Who {
  const kid = role === "kid";
  if (kid)
    return seed % 2 === 1
      ? { spec: PEOPLE.wawaBoy, palette: (r) => wardrobe.andeanMan(r), kid }
      : { spec: PEOPLE.wawaGirl, palette: (r) => wardrobe.andeanWoman(r), kid };
  if (role === "knit") return { spec: PEOPLE.taquile, palette: taquileMan, kid };
  if (role === "spin" && seed < 100) return { spec: TAQUILE_WOMAN, palette: taquileWoman, kid };
  if (role === "paqo") return { spec: PEOPLE.amauta, palette: (r) => wardrobe.andeanMan(r), kid };
  const man =
    role === "work" ||
    role === "fisher" ||
    ((role === "walk" || role === "travel" || role === "pilgrim") && seed % 2 === 0);
  if (man) {
    const felt = role === "travel" && seed % 3 === 0;
    return {
      spec: felt ? PEOPLE.campesinoFelt : PEOPLE.campesino,
      palette: (r) => wardrobe.andeanMan(r, false, felt),
      kid,
    };
  }
  return { spec: PEOPLE.aymara, palette: aymaraWoman, kid };
}

/** Loads and tools: the q'ipi on the women travellers' and the mother's backs (and every fourth man's). */
export function propOf(role: Role, seed: number): { kind: PropKind; tint: string } | null {
  switch (role) {
    case "knit":
      // The chullo on the needles is red, like the one he wears.
      return { kind: "knitting", tint: "#b8282f" };
    case "spin":
      return { kind: "pushka", tint: seed % 2 ? "#efe6d6" : "#8a6a4a" };
    case "fisher":
      return { kind: "net", tint: "#cfc6b0" };
    case "paqo":
      // His ch'uspa, the woven coca bag.
      return { kind: "pouch", tint: "#b8282f" };
    case "mother":
      return { kind: "qipi", tint: "#c4383f" };
    case "travel": {
      const man = seed % 2 === 0;
      if (man && seed % 4 !== 0) return null;
      return { kind: "qipi", tint: ["#c4383f", "#2a9d8f", "#c2456b", "#dda63c"][seed % 4] as string };
    }
    default:
      return null;
  }
}

/** How far a person glances at the traveler (0: never; busy hands, running children, people in boats). */
export function lookOf(role: Role): number {
  switch (role) {
    case "kid":
    case "fisher":
    case "sitWeave":
    case "knit":
    case "paqo":
    case "pray":
      return 0;
    case "travel":
    case "walk":
      return 4;
    default:
      return 6;
  }
}
