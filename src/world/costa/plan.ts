/**
 * Plan of the Chinchaysuyu coast world: pure numbers and tables shared by the layout, the scenery, the
 * ambients, the passport catalog, the map and the text mode. No three.js, no DOM (lib/passport.ts imports
 * the station table, so this file must stay light).
 *
 * World frame: +x east, −z north (the mountain's convention), y up, the Pacific at y 0 to the WEST (−x), so the
 * sun of the shared sky (it rises at +x and sets at −x) goes down into the sea. The road runs south → north
 * (t 0 at z ≈ +370, t 1 at z ≈ −370), the sea always on the traveler's left.
 *
 * The career is the road, exactly as on the mountain: one station per working company of src/data/career.ts
 * (education hangs at its host's station, as on the mountain), in chronological order. Each is a coastal
 * monument after a pre-Inca culture of the Peruvian coast, placed roughly in its real south → north order
 * (Nasca, Paracas, Pachacamac, Chancay, Caral, Moche, Chan Chan); the cultures are scenery, the content of
 * every panel is the company's (career.ts). Then the fishermen's market at Huanchaco with one stall per
 * cross-company artifact, the caballito de totora beaches and, at the road's end, the headland of the finale.
 */
import { COMPANIES } from "../../data/career";
import type { L } from "../contract";
import type { SuyuStation } from "../suyu/contract";

/** A coastal culture a station's monument is drawn after (scenery only). */
export type Culture = "nasca" | "paracas" | "pachacamac" | "chancay" | "caral" | "moche" | "chanchan";

export interface CultureInfo {
  id: Culture;
  /** Monument name on the sign and the text mode. */
  name: L;
  /** What the monument shows (text mode; truthful about the scenery, not about the owner). */
  about: L;
}

export const CULTURES: Record<Culture, CultureInfo> = {
  nasca: {
    id: "nasca",
    name: { es: "Cahuachi · Nasca", en: "Cahuachi · Nazca" },
    about: {
      es: "Una pirámide escalonada de adobe como las de Cahuachi, con cerámica polícroma nasca en las gradas, y en el desierto, trazado con líneas, el colibrí de las pampas de Nasca.",
      en: "A stepped adobe pyramid like those of Cahuachi, with Nazca polychrome pottery on its steps, and on the desert, drawn in lines, the hummingbird of the Nazca plains.",
    },
  },
  paracas: {
    id: "paracas",
    name: { es: "Mantos de Paracas", en: "Paracas mantles" },
    about: {
      es: "Una ramada de esteras sobre postes junto al mar, con grandes mantos bordados en los colores de los textiles paracas colgando a la sombra, sobre una plataforma funeraria baja.",
      en: "A reed-mat shade on posts by the sea, with large embroidered mantles in the colours of Paracas textiles hanging in its shade, on a low funerary platform.",
    },
  },
  pachacamac: {
    id: "pachacamac",
    name: { es: "Pachacamac", en: "Pachacamac" },
    about: {
      es: "Una gran pirámide con rampa frente al mar, de terrazas pintadas de rojo como el Templo del Sol de Pachacamac.",
      en: "A great pyramid with a ramp facing the sea, its terraces painted red like the Temple of the Sun at Pachacamac.",
    },
  },
  chancay: {
    id: "chancay",
    name: { es: "Recinto Chancay", en: "Chancay compound" },
    about: {
      es: "Un recinto de tapial con dos grandes cuchimilcos (figuras de brazos abiertos, crema con líneas negras) a la entrada y vasijas negro sobre blanco.",
      en: "A rammed-earth compound with two large cuchimilcos (open-armed figures, cream with black lines) at its entrance and black-on-white jars.",
    },
  },
  caral: {
    id: "caral",
    name: { es: "Caral · Pirámide Mayor", en: "Caral · Great Pyramid" },
    about: {
      es: "Una pirámide escalonada de piedra con su escalinata central, que baja a una plaza circular hundida, como la Pirámide Mayor de Caral.",
      en: "A stepped stone pyramid with its central stair leading down to a sunken circular plaza, like the Great Pyramid of Caral.",
    },
  },
  moche: {
    id: "moche",
    name: { es: "Huaca de la Luna · Moche", en: "Huaca de la Luna · Moche" },
    about: {
      es: "Una gran plataforma de adobe con frisos escalonados pintados de rojo, amarillo, blanco y negro, como la fachada de la Huaca de la Luna.",
      en: "A great adobe platform with stepped friezes painted red, yellow, white and black, like the facade of the Huaca de la Luna.",
    },
  },
  chanchan: {
    id: "chanchan",
    name: { es: "Chan Chan", en: "Chan Chan" },
    about: {
      es: "Altos muros de barro con frisos de peces, pelícanos, olas y redes en relieve alrededor de una plaza, como los palacios de Chan Chan.",
      en: "High mud walls with friezes of fish, pelicans, waves and nets in relief around a plaza, like the palaces of Chan Chan.",
    },
  },
};

/** Working companies in chronological order (education hangs at its host, like the mountain's tambos). */
export const WORK = COMPANIES.filter((c) => !c.education)
  .map((c) => ({ c, start: Math.min(...c.stages.map((s) => Number(s.start.replace("-", "")))) }))
  .sort((a, b) => a.start - b.start)
  .map((x) => x.c);

/** Culture of each company station, in road order (south → north). */
const ORDER: Culture[] = ["nasca", "paracas", "pachacamac", "chancay", "caral", "moche", "chanchan"];
/** Road t of each company station (ascending) and which side of the road (−1 sea side, 1 inland). */
const SLOTS: Array<{ t: number; side: -1 | 1; offset: number }> = [
  { t: 0.075, side: 1, offset: 15 },
  { t: 0.17, side: -1, offset: 13 },
  { t: 0.27, side: -1, offset: 15 },
  { t: 0.375, side: 1, offset: 14 },
  { t: 0.48, side: 1, offset: 15 },
  { t: 0.585, side: -1, offset: 14 },
  { t: 0.685, side: -1, offset: 13 },
];

export interface CompanyStop {
  /** Station id = company id. */
  id: string;
  companyId: string;
  culture: Culture;
  t: number;
  side: -1 | 1;
  offset: number;
}

/** One stop per working company; more companies than cultures reuse the cycle with spread t. */
export const COMPANY_STOPS: ReadonlyArray<CompanyStop> = WORK.map((c, i) => {
  const n = WORK.length;
  const slot =
    n === SLOTS.length
      ? (SLOTS[i] as (typeof SLOTS)[number])
      : { t: 0.075 + (0.61 * i) / Math.max(1, n - 1), side: (i % 2 ? -1 : 1) as -1 | 1, offset: 14 };
  return { id: c.id, companyId: c.id, culture: ORDER[i % ORDER.length] as Culture, ...slot };
});

/** The fishermen's market of Huanchaco: one stall per cross-company artifact (career.ts ARTIFACTS). */
export const MARKET = { t: 0.785, side: -1 as const, offset: 15 };
/** The two caballito beaches: the south one at the market, the north one past the headland. */
export const BEACHES = { south: 0.8, north: 0.905 } as const;
/** Where the road starts (the punku back to Qusqu) and ends (the finale headland). */
export const PUNKU_T = 0.004;
/** Reach of the punku's "Volver a Qusqu" prompt round the doorway (the horse keeps its own prompt clear of it). */
export const PUNKU_PROMPT_R = 3.6;
export const FINALE_T = 1;

/** Ids of the special stations. */
export const STATION = {
  punku: "punku",
  market: "huanchaco",
  north: "playa-norte",
  finale: "mamacocha",
} as const;

const companyName = (id: string) => COMPANIES.find((c) => c.id === id)?.name ?? id;

/**
 * Stations of the coast. Passport: `costa:station:<id>` for every company and the market (required); the
 * punku, the north beach and the finale stamp nothing here (the finale stamps `costa:summit` itself, the
 * caballito `costa:ride:caballito`). Poses come from the layout (road t, side, offset).
 */
export const COSTA_STATIONS: ReadonlyArray<SuyuStation> = [
  {
    id: STATION.punku,
    kind: "gate",
    t: PUNKU_T,
    side: 1,
    offset: 0,
    label: { es: "Punku del Chinchaysuyu", en: "Chinchaysuyu punku" },
    stamp: false,
  },
  ...COMPANY_STOPS.map(
    (s): SuyuStation => ({
      id: s.id,
      kind: "company",
      t: s.t,
      side: s.side,
      offset: s.offset,
      label: {
        es: `${companyName(s.companyId)} · ${CULTURES[s.culture].name.es}`,
        en: `${companyName(s.companyId)} · ${CULTURES[s.culture].name.en}`,
      },
    }),
  ),
  {
    id: STATION.market,
    kind: "market",
    t: MARKET.t,
    side: MARKET.side,
    offset: MARKET.offset,
    label: { es: "Mercado de Huanchaco · artefactos", en: "Huanchaco market · artifacts" },
  },
  {
    id: STATION.north,
    kind: "beach",
    t: BEACHES.north,
    side: -1,
    offset: 12,
    label: { es: "Playa del norte · caballitos", en: "North beach · caballitos" },
    stamp: false,
  },
  {
    id: STATION.finale,
    kind: "finale",
    t: FINALE_T,
    side: -1,
    offset: 0,
    label: { es: "Inti y la Mamacocha · fin del camino", en: "Inti and the Mamacocha · road's end" },
    stamp: false,
  },
];

export const stopOf = (id: string) => COMPANY_STOPS.find((s) => s.id === id) ?? null;

/** Dye of a station on the map and the khipu (company dyes from career.ts; specials fixed). */
export const MAP_DYES: Record<string, string> = {
  red: "#c4383f",
  indigo: "#3446a6",
  ochre: "#dda63c",
  turq: "#2a9d8f",
  alpaca: "#a8825f",
};
export function stationDye(id: string): string {
  const c = COMPANIES.find((x) => x.id === id);
  if (c) return MAP_DYES[c.dye] ?? "#a8825f";
  if (id === STATION.market) return "#2a9d8f";
  if (id === STATION.finale) return "#e8b631";
  if (id === STATION.north) return "#5fb8c2";
  return "#9a948a";
}
