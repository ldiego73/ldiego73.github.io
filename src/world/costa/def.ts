/**
 * The Chinchaysuyu coast as a suyu world: everything the generic runtime (../suyu/index.ts) needs to mount
 * the coast road. Stations and the culture of each company's monument live in ./plan.ts; the pure layout
 * (road, shoreline, rivers, islets) in ./layout.ts; the static set (terrain, road, the Pacific, spray,
 * bridges, the Andes beyond, plants) in ./scenery.ts; the stations, boats, people, animals and the finale in
 * ./ambient/*.ts (globbed below, literal so Vite can split them).
 */
import type { SuyuDef } from "../suyu/contract";
import { COSTA_HELP, COSTA_LOADER, COSTA_MAP, COSTA_NAME, COSTA_PLACE } from "./copy";
import { buildCostaLayout, type CostaLayout } from "./layout";
import { COSTA_STATIONS, STATION, stationDye } from "./plan";
import { createCostaScenery } from "./scenery";
import { createCostaTextMode } from "./textmode-dialog";

/** Drop-in coast ambients: every ./ambient/<name>.ts exporting `create: CreateAmbient` (helpers in subfolders). */
const ambients = import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"]);

/** Just inside the punku, on the road, facing north (out of the punku's prompt range). */
export const START_T = 0.016;

export const COSTA_DEF: SuyuDef<CostaLayout> = {
  world: "costa",
  // The passport's "My postcard" and the finale's "Make my postcard" open this world's own card (journey-card.ts).
  postcard: "costa",
  name: COSTA_NAME,
  stations: COSTA_STATIONS,
  buildLayout: buildCostaLayout,
  // A long road world (840 u square): the jungle's tiers.
  cells: { high: 280, low: 200, phone: 168 },
  createScenery: createCostaScenery,
  ambients,
  loader: COSTA_LOADER,
  textMode: (host, lang) => createCostaTextMode(host, lang),
  atmosphere: {
    // Coastal air: a light sea haze that warms the distance, but clear enough to see the sun set.
    fog: 0.05,
    cover: 0.14,
    tint: { color: "#efe4cf", amount: 0.14 },
    near: 1.1,
    far: 1.35,
    inkFade: [170, 600],
  },
  spawn: { default: { t: START_T }, from: { cusco: { t: START_T } } },
  outfit: "explorer",
  place: { id: "chinchaysuyu", label: COSTA_PLACE },
  visit: { radius: 7 },
  map: {
    ...COSTA_MAP,
    unlockStamp: `costa:station:${STATION.market}`,
    pad: 40,
    maxAspect: 1,
    dye: stationDye,
  },
  help: COSTA_HELP,
};
