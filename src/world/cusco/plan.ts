/**
 * Plan of the Cusco hub (Haukaypata, the great plaza of Inca Qusqu): pure numbers and data tables shared by
 * the layout, the scenery, the ambients, the map and the text mode. No three.js, no DOM.
 *
 * World frame: +x east, −z north (the mountain's convention), y up, the plaza floor at y 0. Yaw: models face
 * +Z, yaw = rotation.y, facing +X is π/2.
 *
 *            Sacsayhuamán (hill, far north)
 *   Chinchaysuyu ↖  [ kallanka hall (north) ]  ↗ Antisuyu (Hatun Rumiyoc street)
 *     [kallanka ]        +---------+            [ Qorikancha ]
 *     [ (west)  ]        |  usnu   |            [  facade    ]
 *                        +---------+
 *   Kuntisuyu ↙   [kancha wall] ↓ [kancha wall]  ↘ Collasuyu
 *                      Qhapaq Ñan (south, to the mountain)
 *
 * The real Haukaypata was larger and its temples were spread over several streets; this is a compressed
 * diorama with the bearings kept: Chinchaysuyu north-west, Antisuyu north-east, Collasuyu south-east,
 * Kuntisuyu south-west. The Qhapaq Ñan to the mountain world leaves due south.
 *
 * GATES is the single table of the five roads: later suyu worlds flip `available` and set their WorldId.
 */
import type { L } from "../contract";
import type { WorldId } from "../events";
import type { SuyuStation } from "../suyu/contract";

export type P2 = readonly [number, number];

/** The flagstone plaza (axis-aligned), its floor height and the usnu in its centre. */
export const PLAZA = { x0: -32, x1: 32, z0: -24, z1: 24, y: 0 } as const;

/**
 * Usnu: three dressed-stone tiers, each a step high (≤ the runtime's MAX_STEP 0.9, so the traveler walks up
 * them), with a carved stair on the south face. Tiers are square, half sizes below; heights are cumulative.
 */
export const USNU = {
  x: 0,
  z: 0,
  tiers: [
    { half: 6.6, top: 0.7 },
    { half: 5.0, top: 1.4 },
    { half: 3.5, top: 2.1 },
  ],
} as const;
export const USNU_TOP = USNU.tiers[USNU.tiers.length - 1]?.top ?? 2.1;

/** Half width of the walkable road band; the stone walls of the street stand at WALL_OFF from the centre. */
export const ROAD_HALF = 2.4;
export const WALL_OFF = 3.5;
/**
 * The buildings round the plaza stand back from its edge by this much (their front walls' faces); the street
 * walls start where they meet those lines, so the plaza is closed all round except at the street mouths.
 */
export const SETBACK = 1.2;
/** Length of each street from its mouth on the plaza to the gate (punku) at its end. */
export const ROAD_LEN = 30;
/** The traveler arrives this far inside a gate (on its street, facing the plaza): out of its prompt range. */
export const ARRIVE_IN = 12;

export interface Gate {
  /** Station id of the gate (and the stem of its sign). */
  id: "qhapaq" | "chinchaysuyu" | "antisuyu" | "collasuyu" | "kuntisuyu";
  /** The world behind the gate. */
  world: WorldId;
  /** Travel opens only when the world's page exists. */
  available: boolean;
  /** Where the street leaves the plaza (a plaza corner or the middle of its south edge). */
  mouth: P2;
  /** Unit direction of the street, plaza → gate. */
  dir: P2;
  /** Carved sign on the punku and the map. */
  name: L;
  /** Bearing as the traveler reads it. */
  bearing: L;
  /** What the suyu holds (the khipu panel, the text mode). Truthful: only what the world's page shows. */
  holds: L;
  /** Passport pages this road leads to (progress on the khipu). */
  pages: ReadonlyArray<WorldId>;
  /** Dye of the suyu's cord on the khipu and its marks (khipu dyes). */
  dye: string;
  /** Colours of the glimpse in the doorway, top → bottom (sky, middle, ground). */
  glimpse: readonly [string, string, string];
}

const D = Math.SQRT1_2;

export const GATES: ReadonlyArray<Gate> = [
  {
    id: "qhapaq",
    world: "qhapaq",
    available: true,
    mouth: [0, PLAZA.z1],
    dir: [0, 1],
    name: { es: "Qhapaq Ñan", en: "Qhapaq Ñan" },
    bearing: { es: "al sur, hacia la montaña", en: "south, to the mountain" },
    holds: {
      es: "La subida de la montaña: un tambo por empresa de mi carrera, el puente de artefactos, el tambo arcade, la Intihuatana de la IA, el puesto del chasqui y la cumbre; al pie, la Wasi, mi casa andina.",
      en: "The mountain climb: one tambo per company of my career, the artifact bridge, the arcade tambo, the AI Intihuatana, the chasqui post and the summit; at its foot, the Wasi, my Andean house.",
    },
    pages: ["qhapaq", "wasi"],
    dye: "#dda63c",
    glimpse: ["#cfe3f2", "#9cc2a0", "#7a8c62"],
  },
  {
    id: "chinchaysuyu",
    world: "costa",
    available: true,
    mouth: [PLAZA.x0, PLAZA.z0],
    dir: [-D, -D],
    name: { es: "Chinchaysuyu", en: "Chinchaysuyu" },
    bearing: { es: "al noroeste, hacia la costa", en: "north-west, to the coast" },
    holds: {
      es: "El camino de la costa junto al Pacífico: mi carrera otra vez, una huaca por empresa (de Nasca a Chan Chan), el mercado de artefactos de Huanchaco, un paseo en caballito de totora, fauna marina y el Inti hundiéndose en la Mamacocha al final del camino.",
      en: "The coast road beside the Pacific: my career again, one huaca per company (from Nazca to Chan Chan), the Huanchaco market of artifacts, a ride on a totora reed boat, sea life and Inti sinking into the Mamacocha at the road's end.",
    },
    pages: ["costa"],
    dye: "#c4383f",
    glimpse: ["#f1e3c4", "#9fd0d6", "#e3c68f"],
  },
  {
    id: "antisuyu",
    world: "selva",
    available: true,
    mouth: [PLAZA.x1, PLAZA.z0],
    dir: [D, -D],
    name: { es: "Antisuyu", en: "Antisuyu" },
    bearing: { es: "al noreste, hacia la selva", en: "north-east, to the jungle" },
    holds: {
      es: "El camino de la selva junto a un gran río: lo que uso, mis escritos, mis proyectos y el arcade, con canoa, puentes del dosel y fauna amazónica.",
      en: "The jungle road beside a great river: what I use, my writing, my projects and the arcade, with a canoe, canopy bridges and Amazon wildlife.",
    },
    pages: ["selva"],
    dye: "#2a9d8f",
    glimpse: ["#cfeec0", "#3f9a56", "#1f5a34"],
  },
  {
    id: "collasuyu",
    world: "titicaca",
    available: true,
    mouth: [PLAZA.x1, PLAZA.z1],
    dir: [D, D],
    name: { es: "Collasuyu", en: "Collasuyu" },
    bearing: { es: "al sureste, hacia el lago Titicaca", en: "south-east, to Lake Titicaca" },
    holds: {
      es: "El camino del lago Titicaca: mis habilidades en las islas flotantes de los uros, mi formación y certificaciones en Taquile, una balsa de totora y la roca sagrada de la Isla del Sol.",
      en: "The Lake Titicaca road: my skills on the Uros floating islands, my education and certifications on Taquile, a totora reed boat and the sacred rock of the Isla del Sol.",
    },
    pages: ["titicaca"],
    dye: "#efe6d6",
    glimpse: ["#dfeaf6", "#4f86c4", "#c9b77a"],
  },
  {
    id: "kuntisuyu",
    world: "colca",
    available: true,
    mouth: [PLAZA.x0, PLAZA.z1],
    dir: [-D, D],
    name: { es: "Kuntisuyu", en: "Kuntisuyu" },
    bearing: { es: "al suroeste, hacia el Colca y Nasca", en: "south-west, to the Colca and Nazca" },
    holds: {
      es: "El camino del cañón del Colca y la pampa de Nasca: los logros de cada etapa de mi carrera guardados en colcas, mis artefactos de arquitectura trazados como geoglifos, un pueblo collagua, cóndores y el mirador de la Cruz del Cóndor.",
      en: "The road of the Colca canyon and the Nazca pampa: the achievements of each stage of my career stored in colcas, my architecture artifacts drawn as geoglyphs, a Collagua village, condors and the Cruz del Cóndor lookout.",
    },
    pages: ["colca"],
    dye: "#3446a6",
    glimpse: ["#f3dcb4", "#c98b5a", "#8a5a35"],
  },
];

/** Gate centre (the doorway on the street axis). */
export const gatePoint = (g: Gate): P2 => [g.mouth[0] + g.dir[0] * ROAD_LEN, g.mouth[1] + g.dir[1] * ROAD_LEN];
/** Yaw the punku faces: back toward the plaza (its front is the plaza side). */
export const gateYaw = (g: Gate) => Math.atan2(-g.dir[0], -g.dir[1]);
/** Arrival on the gate's street, ARRIVE_IN inside, facing the plaza. */
export function gateArrival(g: Gate): { x: number; z: number; yaw: number } {
  const [x, z] = gatePoint(g);
  return { x: x - g.dir[0] * ARRIVE_IN, z: z - g.dir[1] * ARRIVE_IN, yaw: gateYaw(g) };
}
export const gateOf = (world: string) => GATES.find((g) => g.world === world) ?? null;

/** Hatun Rumiyoc: the twelve-angled stone in the north-west wall of the Antisuyu street, `s` u from the mouth. */
export const HATUN_RUMIYOC = { s: 13, side: -1 as const };
/** World point on the face of a street wall (side −1 left of the walking direction, 1 right) at distance s. */
export function wallPoint(g: Gate, s: number, side: -1 | 1, off = WALL_OFF - 0.5): { x: number; z: number } {
  const nx = -g.dir[1] * side;
  const nz = g.dir[0] * side;
  return { x: g.mouth[0] + g.dir[0] * s + nx * off, z: g.mouth[1] + g.dir[1] * s + nz * off };
}

/** Qorikancha facade: on the east side of the plaza, facing west; the gold sun disc above its doorway. */
export const QORIKANCHA = { x: 33.9, z: 0, halfLen: 13, height: 6.2, thick: 1.4, yaw: -Math.PI / 2 } as const;
/** Chasqui post: a small stone shelter on the south-west of the plaza, facing north. */
export const CHASQUI = { x: -15, z: 23.2, w: 3.8, d: 3.0, yaw: Math.PI } as const;
/** The khipu of the four suyus on the usnu top: a frame across the top tier, facing south (the stair). */
export const KHIPU = { x: 0, z: -0.9, width: 4.2, yaw: 0 } as const;

/** The Qorikancha's carved stele on the plaza, left of the doorway (seen from the plaza). */
export const QORI_STELE = { x: 30.4, z: 4.6 } as const;

export const DEFAULT_SPAWN = { x: 0, z: 17, yaw: Math.PI } as const;

const ANTISUYU = GATES[2] as Gate;
const hatun = wallPoint(ANTISUYU, HATUN_RUMIYOC.s, HATUN_RUMIYOC.side, WALL_OFF - 1.4);
/** Road t of a point on the hub's axis (the trail runs from the Qhapaq gate north to the plaza's north edge). */
export const AXIS = { z0: PLAZA.z1 + ROAD_LEN, z1: PLAZA.z0 } as const;
const axisT = (z: number) => Math.max(0, Math.min(1, (AXIS.z0 - z) / (AXIS.z0 - AXIS.z1)));

/**
 * Stations of the hub. Passport: `cusco:station:<id>`; the usnu and the Qorikancha are required (kind
 * "station"), the twelve-angled stone is a bonus find ("egg"), the chasqui post a bonus ("npc"), the gates
 * stamp nothing. t/side/offset are informative here (poses come from this plan, see layout.ts).
 */
export const CUSCO_STATIONS: ReadonlyArray<SuyuStation> = [
  {
    id: "usnu",
    kind: "usnu",
    t: axisT(USNU.z),
    side: 1,
    offset: 0,
    label: { es: "Usnu · khipu de los suyus", en: "Usnu · khipu of the suyus" },
  },
  {
    id: "qorikancha",
    kind: "temple",
    t: axisT(QORIKANCHA.z),
    side: 1,
    offset: QORIKANCHA.x,
    label: { es: "Qorikancha · templo del Sol", en: "Qorikancha · temple of the Sun" },
  },
  {
    id: "hatun-rumiyoc",
    kind: "stone",
    t: axisT(hatun.z),
    side: 1,
    offset: hatun.x,
    label: { es: "Hatun Rumiyoc · piedra de doce ángulos", en: "Hatun Rumiyoc · twelve-angled stone" },
    stamp: "egg",
    // Stand right in front of it (the street is the way to the Antisuyu gate: walking by is not finding it).
    visit: 2.3,
  },
  {
    id: "chasqui",
    kind: "contact",
    t: axisT(CHASQUI.z),
    side: -1,
    offset: -CHASQUI.x,
    label: { es: "Puesto del chasqui · contacto", en: "Chasqui post · contact" },
    stamp: "npc",
  },
  ...GATES.map(
    (g): SuyuStation => ({
      id: g.id,
      kind: "gate",
      t: axisT(gatePoint(g)[1]),
      side: g.dir[0] < 0 ? -1 : 1,
      offset: Math.abs(gatePoint(g)[0]),
      label: { es: `${g.name.es} · punku`, en: `${g.name.en} · punku` },
      stamp: false,
    }),
  ),
];

/** Station pose position + facing (toward where the traveler stands to visit). */
export function stationSpot(id: string): { x: number; z: number; yaw: number } | null {
  if (id === "usnu") return { x: USNU.x, z: USNU.z + USNU.tiers[0].half + 0.4, yaw: 0 };
  if (id === "qorikancha") return { x: QORIKANCHA.x - 3.4, z: QORIKANCHA.z, yaw: QORIKANCHA.yaw };
  if (id === "hatun-rumiyoc") {
    const g = ANTISUYU;
    // Facing out of the wall, across the street.
    const yaw = Math.atan2(-g.dir[1] * -HATUN_RUMIYOC.side, g.dir[0] * -HATUN_RUMIYOC.side);
    return { x: hatun.x, z: hatun.z, yaw };
  }
  if (id === "chasqui") return { x: CHASQUI.x, z: CHASQUI.z - CHASQUI.d / 2 - 1.4, yaw: CHASQUI.yaw };
  const g = GATES.find((x) => x.id === id);
  if (!g) return null;
  const [x, z] = gatePoint(g);
  return { x, z, yaw: gateYaw(g) };
}
