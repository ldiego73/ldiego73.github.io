/**
 * How the people of the coast dress, on the shared characters (../../../characters): the archetype specs
 * (HumanSpec, built once per page off the main thread) and the palette pickers that colour each person, so
 * the walkers, families, fishermen, vendors, surfers and children of ../gente.ts and the gathering of
 * ../reunion.ts and the caballito fishermen of ../caballito.ts all come from one wardrobe.
 *
 * The northern coast's everyday dress: men in a light cotton shirt with short sleeves, dark trousers and the
 * wide straw hat (the fishermen barefoot on the sand, the others in sandals); women in a short-sleeved blouse,
 * a plain skirt and a bib apron, the hair in a bun, some with the straw hat; children in a tee and shorts or a
 * blouse and skirt, barefoot; surfers in board shorts. Light, sun-faded cottons (the colours the coast's old
 * people rig used). No caricature: plain clothes, warm brown skins.
 *
 * Pure (no DOM, no Three); tested in dress.test.ts.
 */
import type { HumanSpec } from "../../../characters/archetype";
import { HAIRS, PEOPLE } from "../../../characters/presets";
import type { Dress } from "../../../characters/slots";

/** Who: the coast's archetypes (each one a build per LOD, so the list stays short). */
export type CoastWho = "man" | "manHat" | "fisher" | "woman" | "womanHat" | "boy" | "girl" | "surfer" | "surferWoman";

const { hat: _manHat, ...pescadorBare } = PEOPLE.pescador;
const { hat: _womanHat, ...vendedoraBare } = PEOPLE.vendedora;

export const COAST_PEOPLE: Record<CoastWho, HumanSpec> = {
  /** Walkers: shirt, trousers, sandals (with or without the straw hat). */
  man: { ...pescadorBare, feet: "sandals" },
  manHat: { ...PEOPLE.pescador, feet: "sandals" },
  /** Fishermen: the same, barefoot on the sand. */
  fisher: PEOPLE.pescador,
  /** Blouse, plain skirt, bib apron, the hair in a bun. */
  woman: vendedoraBare,
  womanHat: PEOPLE.vendedora,
  boy: PEOPLE.riverBoy,
  girl: { ...PEOPLE.riverGirl, layers: [{ kind: "skirt", region: "plain", hem: 0.3 }] },
  surfer: PEOPLE.surfer,
  surferWoman: { sex: "f", hair: "ponytail", top: "tee", bottom: "board-shorts", feet: "bare" },
};

/** Every coastal archetype (prefetch at load). */
export const COAST_SPECS: readonly HumanSpec[] = Object.values(COAST_PEOPLE);

/** Coastal palettes: light cottons, sun-faded colours. */
export const SHIRTS = ["#efe9dc", "#d9e4ea", "#e8d7b8", "#c9dbd2", "#f2e2c8", "#b8cfe0"];
export const BLOUSES = ["#e7a1a8", "#f1d38a", "#a8cfe0", "#efe9dc", "#c4d9a8"];
export const APRONS = ["#2a9d8f", "#c4383f", "#3446a6", "#dda63c"];
export const TROUSERS = ["#2f3557", "#4a4a52", "#6e6258", "#3b4a5e"];
export const SKIRTS = ["#3446a6", "#2a9d8f", "#7a4a6a", "#4a5a3a"];
export const COAST_SKINS = ["#9a6440", "#b9764a", "#8e5a38", "#a86a42", "#7a4a30", "#b47a50"];
/** Children's tees and the surfers' board shorts: brighter dyes. */
export const TEES = ["#e2675f", "#f1d38a", "#8fb8c9", "#3f7f4a", "#efe9dc", "#dda63c"];
export const BOARD_SHORTS = ["#2a9d8f", "#c4383f", "#3446a6", "#dda63c", "#2f3557"];
const STRAW = { hat: "#d8c07a", hatTrim: "#bfa25e" } as const;

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** The colours of one person of the coast (a fresh pick from the seeded `r`). */
export function coastDress(who: CoastWho, r: () => number): Dress {
  const base: Dress = { skin: pick(r, COAST_SKINS), hair: pick(r, HAIRS), sole: "#2a2420", shoe: "#4a3424" };
  switch (who) {
    case "man":
    case "manHat":
    case "fisher":
      return {
        ...base,
        ...STRAW,
        top: pick(r, SHIRTS),
        trim: "#efe6d6",
        legs: pick(r, TROUSERS),
        // The hat band in the women's apron dyes (the old rig's accent slot).
        hatBand: pick(r, ["#2a2420", ...APRONS]),
      };
    case "woman":
    case "womanHat":
      return {
        ...base,
        ...STRAW,
        top: pick(r, BLOUSES),
        trim: "#efe6d6",
        skirt: pick(r, SKIRTS),
        shawl: pick(r, APRONS),
        hatBand: "#2a2420",
        shoe: "#2a2420",
      };
    case "boy":
      return { ...base, top: pick(r, TEES), legs: pick(r, TROUSERS) };
    case "girl":
      return { ...base, top: pick(r, BLOUSES), skirt: pick(r, SKIRTS), trim: "#efe6d6" };
    case "surfer":
      return { ...base, legs: pick(r, BOARD_SHORTS) };
    case "surferWoman":
      return { ...base, top: pick(r, ["#2f3557", "#1f2a33", ...TEES]), legs: pick(r, BOARD_SHORTS) };
  }
}

/** A man's or a woman's archetype, with or without the straw hat. */
export const adult = (man: boolean, hat: boolean): CoastWho =>
  man ? (hat ? "manHat" : "man") : hat ? "womanHat" : "woman";
