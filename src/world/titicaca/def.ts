/**
 * The Collasuyu (Lake Titicaca) as a suyu world: everything the generic runtime (../suyu/index.ts) needs to
 * mount the lake road. Stations, islands and coordinates live in ./plan.ts; the pure layout in ./layout.ts;
 * the static set (altiplano, lake, reeds, terraces, Cordillera Real) in ./scenery.ts; the living and
 * interactive parts in ./ambient/*.ts (globbed below, literal so Vite can split them).
 */
import type { SuyuDef } from "../suyu/contract";
import { TITICACA_HELP, TITICACA_LOADER, TITICACA_MAP, TITICACA_NAME, TITICACA_PLACE } from "./copy";
import { buildTiticacaLayout, type TiticacaLayout } from "./layout";
import { boardwalks, DEFAULT_T, DOCKS, ISLANDS, TITICACA_STATIONS, TITIKALA } from "./plan";
import { createTiticacaScenery } from "./scenery";
import { createTiticacaTextMode } from "./textmode-dialog";

/** Drop-in lake ambients: every ./ambient/<name>.ts exporting `create: CreateAmbient` (helpers in subfolders). */
const ambients = import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"]);

const circle = (x: number, z: number, r: number) =>
  Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
  });

export const TITICACA_DEF: SuyuDef<TiticacaLayout> = {
  world: "titicaca",
  // The passport's "My postcard" and the finale's "Make my postcard" open this world's own card (journey-card.ts).
  postcard: "titicaca",
  name: TITICACA_NAME,
  stations: TITICACA_STATIONS,
  buildLayout: buildTiticacaLayout,
  // 840 u square: ≈ 3.8 u cells on high, like the jungle.
  cells: { high: 220, low: 170, phone: 150 },
  createScenery: createTiticacaScenery,
  ambients,
  loader: TITICACA_LOADER,
  textMode: (host, lang) => createTiticacaTextMode(host, lang),
  atmosphere: {
    // Thin, clear air at 3800 m: almost no haze, crisp ink far away, the Cordillera Real sharp across the lake.
    fog: 0,
    cover: 0.04,
    tint: { color: "#cfe1f6", amount: 0.12 },
    near: 3,
    far: 2.6,
    inkFade: [240, 800],
  },
  spawn: { default: { t: DEFAULT_T }, from: { cusco: { t: DEFAULT_T } } },
  outfit: "altiplano",
  place: { id: "titicaca", label: TITICACA_PLACE },
  visit: { radius: 8 },
  map: {
    ...TITICACA_MAP,
    unlockStamp: "titicaca:station:taquile",
    pad: 30,
    // The islands (reed floors) and their boardwalk; the spurs up to the land plazas.
    areas: () => ISLANDS.map((i) => circle(i.x, i.z, i.r)),
    roads: (layout) => [
      ...boardwalks().map(([a, b]) => [
        { x: a[0], z: a[1] },
        { x: b[0], z: b[1] },
      ]),
      ...(layout as TiticacaLayout).spurs.map((s) => [
        { x: s.a[0], z: s.a[1] },
        { x: s.b[0], z: s.b[1] },
      ]),
    ],
    marks: (layout) => {
      const p = layout.trail.pointAt(0);
      return [
        { x: p.x - 4, z: p.z, color: "#efe6d6" },
        { x: DOCKS.uros.x, z: DOCKS.uros.z, color: "#c9a23c" },
        { x: DOCKS.taquile.x, z: DOCKS.taquile.z, color: "#c9a23c" },
        { x: TITIKALA.x, z: TITIKALA.z, color: "#e8b631" },
      ];
    },
    dye: (id) =>
      ISLANDS.find((i) => i.id === id)?.dye ??
      (id === "taquile" ? "#c4383f" : id === "titikala" ? "#e8b631" : id === "sillustani" ? "#8f877b" : "#a8825f"),
  },
  help: TITICACA_HELP,
};
