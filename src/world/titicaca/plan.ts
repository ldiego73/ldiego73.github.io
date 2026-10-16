/**
 * Plan of the Collasuyu world (Lake Titicaca, page /{lang}/world/titicaca/): pure numbers and data tables shared
 * by the layout, the scenery, the ambients, the map and the text mode. No three.js, no DOM.
 *
 * World frame: +x east, −z north (the mountain's convention), y up, the lake surface at y = LEVEL (0). Yaw:
 * models face +Z, yaw = rotation.y, facing +X is π/2.
 *
 *            Cordillera Real (snowy, far across the lake, north)
 *   ~~~~~~~~~~~~~~~~~~~~~~~~~ Lake Titicaca ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *        (D) (E)≈balsa≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈┐           Isla del Sol ▲ Titikala
 *     (A)  (B)  (C)  Uros floating islands                   ┆  Taquile ▲         ┃
 *   ~~~~~~~~~┃~~~~~~ (totora boardwalk)              muelle ⚓┆  (hill)  ┃         ┃
 *   punku ══════════════════════════════════════════════════════════════════════════┛ road
 *            ▲ Sillustani (chullpas on a hill)      terraced hills, puna (south)
 *
 * A compressed diorama of the Collasuyu shore at ~3800 m: the road runs west → east along the southern shore
 * (the real Qhapaq Ñan skirted the lake), the Uros islands float in a bay off it, Taquile is a terraced
 * headland, and the road ends on a headland standing for the Isla del Sol, at the sacred rock Titikala.
 *
 * Content: one Uros island per SKILLS group (src/data/career.ts), Taquile holds EDUCATION and CERTIFICATIONS.
 * Ids of the islands come from the group's English name, so the passport stamps stay stable.
 */
import { CERTIFICATIONS, EDUCATION, SKILLS } from "../../data/career";
import type { L } from "../contract";
import type { SuyuStation } from "../suyu/contract";

export type P2 = readonly [number, number];

/** Lake surface height. */
export const LEVEL = 0;
/** Half size of the heightfield square (world units). */
export const HALF = 420;
/** Half width of the walkable road band. */
export const ROAD_HALF = 2.6;

/** Road control points west → east (Catmull-Rom through them): the punku first, Titikala last. */
export const ROAD_POINTS: ReadonlyArray<P2> = [
  [-330, 30],
  [-270, 27],
  [-210, 34],
  [-150, 31],
  [-90, 24],
  [-30, 31],
  [30, 27],
  [85, 21],
  [140, 27],
  [200, 22],
  [246, 8],
  [276, -22],
  [292, -62],
];

/**
 * The southern shore (main lake edge): the lake lies north of z = shoreZ(x). The Uros bay (around x −120) comes
 * closest to the road. Pure, smooth, used by layout.ts' land field.
 */
export function shoreZ(x: number): number {
  const bay = 7 * Math.exp(-(((x + 122) / 46) ** 2));
  // Land reaches further out where Taquile's hill and the Isla del Sol's neck join the shore.
  const capes = 7 * Math.exp(-(((x - 100) / 38) ** 2)) + 10 * Math.exp(-(((x - 262) / 42) ** 2));
  return 6 + 4 * Math.sin(x / 41 + 0.6) + 2.2 * Math.sin(x / 17 + 2.1) + bay - capes;
}

/** Land blobs joined to the shore: Taquile's hill and the Isla del Sol headland (ellipses, x/z radii). */
export const HEADLANDS = [
  { id: "taquile", x: 108, z: -30, rx: 40, rz: 34, h: 13 },
  { id: "sol-neck", x: 266, z: -16, rx: 30, rz: 34, h: 2.2 },
  { id: "sol", x: 292, z: -80, rx: 46, rz: 48, h: 7.5 },
  // Far islands across the water (scenery only, never walked): a big hilly one like Amantaní and an islet.
  { id: "amantani", x: -40, z: -300, rx: 74, rz: 42, h: 30 },
  { id: "islote", x: 170, z: -250, rx: 26, rz: 20, h: 9 },
] as const;

/** Sillustani's hill south of the road (the chullpas stand on its flattened top). */
export const SILLUSTANI = { x: -196, z: 78, r: 34, h: 9 } as const;
/** Terraced hills on the land side (Andean andenes): centre, radius, height. */
export const TERRACE_HILLS = [
  { x: -268, z: 128, r: 44, h: 15 },
  { x: -60, z: 104, r: 40, h: 18 },
  { x: 40, z: 146, r: 50, h: 20 },
  { x: 175, z: 96, r: 38, h: 16 },
  { x: 240, z: 150, r: 46, h: 18 },
] as const;

// ---------------------------------------------------------------- the Uros floating islands

export interface Island {
  /** Station id (`titicaca:station:<id>`). */
  id: string;
  /** Index into SKILLS. */
  group: number;
  x: number;
  z: number;
  /** Radius of the reed deck. */
  r: number;
  /** Dye of its banner and its panel. */
  dye: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Where the islands float (the bay north of the Uros landing), in the order of SKILLS. */
const ISLAND_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-152, -22, 8.5],
  [-122, -36, 9.5],
  [-92, -22, 8.5],
  [-140, -64, 8],
  [-104, -66, 8],
];
const ISLAND_DYES = ["#c4383f", "#2a9d8f", "#dda63c", "#3446a6", "#c2456b", "#e07a3a"];

export const ISLANDS: ReadonlyArray<Island> = SKILLS.slice(0, ISLAND_SPOTS.length).map((g, i) => {
  const [x, z, r] = ISLAND_SPOTS[i] as readonly [number, number, number];
  return { id: `isla-${slug(g.group.en)}`, group: i, x, z, r, dye: ISLAND_DYES[i % ISLAND_DYES.length] as string };
});

/** The hub island the boardwalk from the shore reaches first (the biggest one). */
export const HUB_ISLAND = 1;
/** Deck heights above the lake: the springy island floors and the floating boardwalk. */
export const ISLAND_Y = LEVEL + 0.5;
export const WALK_Y = LEVEL + 0.32;
export const WALK_HALF = 1.15;

/** The Uros landing on the shore (where the boardwalk starts) and the boardwalk polylines (x, z). */
export const UROS_LANDING = { x: -122, z: 16 } as const;
const hub = () => ISLANDS[HUB_ISLAND] as Island;
/** Boardwalk segments: shore → hub island, then hub → every other island. */
export function boardwalks(): Array<[P2, P2]> {
  const h = hub();
  const out: Array<[P2, P2]> = [
    [
      [UROS_LANDING.x, UROS_LANDING.z - 3],
      [h.x, h.z + h.r - 1],
    ],
  ];
  for (const isl of ISLANDS) {
    if (isl === h) continue;
    const dx = isl.x - h.x;
    const dz = isl.z - h.z;
    const d = Math.hypot(dx, dz);
    out.push([
      [h.x + (dx / d) * (h.r - 1), h.z + (dz / d) * (h.r - 1)],
      [isl.x - (dx / d) * (isl.r - 1), isl.z - (dz / d) * (isl.r - 1)],
    ]);
  }
  return out;
}

// ---------------------------------------------------------------- Taquile, the balsa, Titikala

/** Taquile's village plaza (top of the headland) and its stone arch on the path up. */
export const TAQUILE = { x: 104, z: -24, r: 8 } as const;
/** The weavers' workshop (cooperative) on the plaza: where the panel opens. */
export const LOOM = { x: 104, z: -30.5, yaw: 0 } as const;

/** Balsa landings: a jetty off the far Uros island, and a pier from the shore below Taquile. */
export const DOCKS = {
  uros: { island: 4, x: -104, z: -84, yaw: Math.PI },
  taquile: { x: 52, z: -10, yaw: 0, landX: 52, landZ: 11 },
} as const;

/** The sacred rock at the road's end (Isla del Sol): the finale plaza is around it. */
export const TITIKALA = { x: 297, z: -82, r: 11 } as const;

/** Arrival on the road, far enough in that the follow camera starts clear of the punku behind the traveler. */
export const DEFAULT_T = 0.024;

/**
 * Stations of the Collasuyu. Passport: `titicaca:station:<id>`. The islands and Taquile are required; Sillustani
 * is a bonus find ("egg"); the punku, the Uros landing, the Taquile pier and Titikala stamp nothing (the finale
 * stamps `titicaca:summit` itself). t/side/offset are informative (poses come from this plan, see layout.ts).
 */
export const TITICACA_STATIONS: ReadonlyArray<SuyuStation> = [
  {
    id: "punku",
    kind: "gate",
    t: 0,
    side: 1,
    offset: 0,
    label: { es: "Punku del Collasuyu", en: "Collasuyu gateway" },
    stamp: false,
  },
  {
    id: "sillustani",
    kind: "chullpas",
    t: 0.2,
    side: 1,
    offset: 40,
    label: { es: "Chullpas de Sillustani", en: "Sillustani chullpas" },
    stamp: "egg",
    visit: 9,
  },
  {
    id: "uros",
    kind: "landing",
    t: 0.31,
    side: -1,
    offset: 12,
    label: { es: "Embarcadero de los uros", en: "Uros landing" },
    stamp: false,
  },
  ...ISLANDS.map(
    (isl): SuyuStation => ({
      id: isl.id,
      kind: "island",
      t: 0.31,
      side: -1,
      offset: 30 + Math.abs(isl.z),
      // The group first: the map prints the part before " · " beside its dot.
      label: {
        es: `${(SKILLS[isl.group] as (typeof SKILLS)[number]).group.es} · isla uro`,
        en: `${(SKILLS[isl.group] as (typeof SKILLS)[number]).group.en} · Uros island`,
      },
      visit: isl.r - 0.5,
    }),
  ),
  {
    id: "muelle",
    kind: "pier",
    t: 0.6,
    side: -1,
    offset: 14,
    label: { es: "Muelle de Taquile", en: "Taquile pier" },
    stamp: false,
  },
  {
    id: "taquile",
    kind: "school",
    t: 0.66,
    side: -1,
    offset: 46,
    label: { es: "Taquile · formación", en: "Taquile · education" },
    visit: 7,
  },
  {
    id: "titikala",
    kind: "finale",
    t: 1,
    side: -1,
    offset: 18,
    label: { es: "Isla del Sol · Titikala", en: "Isla del Sol · Titikala" },
    stamp: false,
  },
];

// ---------------------------------------------------------------- content tallies (true counts)

export const skillGroups = () => SKILLS.slice(0, ISLANDS.length);
export const skillCount = () => skillGroups().reduce((n, g) => n + g.items.length, 0);
export const educationCount = () => EDUCATION.length;
export const certificationCount = () => CERTIFICATIONS.length;

/** Short display name of an island (the skill group's name). */
export const islandGroup = (isl: Island): { group: L; items: string[] } =>
  SKILLS[isl.group] as { group: L; items: string[] };

/** Adobe farmhouses on the land side of the road (scenery), doorways toward the lake (yaw π faces north). */
export const HOUSES: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
  { x: -300, z: 64, yaw: Math.PI + 0.2 },
  { x: -292, z: 72, yaw: Math.PI - 0.3 },
  { x: -238, z: 60, yaw: Math.PI + 0.1 },
  { x: -98, z: 60, yaw: Math.PI - 0.15 },
  { x: -40, z: 66, yaw: Math.PI + 0.25 },
  { x: -31, z: 74, yaw: Math.PI - 0.1 },
  { x: 22, z: 62, yaw: Math.PI },
  { x: 150, z: 62, yaw: Math.PI + 0.3 },
  { x: 214, z: 56, yaw: Math.PI - 0.2 },
  { x: 222, z: 66, yaw: Math.PI + 0.1 },
];

// ---------------------------------------------------------------- life on the shore and the water

/** Grazing herds on the puna by the road (alpacas, llamas): centre and roaming radius, on open ground. */
export const HERDS = {
  alpacas: { x: -24, z: 54, r: 13 },
  llamas: { x: 172, z: 50, r: 12 },
} as const;
/** The shallow bay where the Andean flamingos wade (between Taquile and the Isla del Sol). */
export const FLAMINGO_BAY = { x: 196, z: -4, r: 14 } as const;
/** Where the giant water frog surfaces now and then (the reeds by the Taquile pier). */
export const FROG_SPOT = { x: 40, z: -2 } as const;
