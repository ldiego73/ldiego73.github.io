/**
 * The Kuntisuyu as a suyu world: everything the generic runtime (../suyu/index.ts) needs to mount the road
 * along the Colca canyon and across the Nazca pampa. Stations, the road and the canyon numbers live in
 * ./plan.ts; the pure layout in ./layout.ts; the static set (rim plateau, terraced canyon, river, mist,
 * volcanoes, flora) in ./scenery.ts; the stations, people and animals in ./ambient/*.ts (globbed below,
 * literal so Vite can split them).
 *
 * Air: high and dry, so a long fog (the far rim 300 u away must read), a warm dusty tint by day and the ink
 * kept far so the canyon's depth is drawn; the mist inside the canyon is scenery (scenery/mist.ts).
 */
import type { SuyuDef } from "../suyu/contract";
import { figures } from "./ambient/nazca/logic";
import { COLCA_HELP, COLCA_LOADER, COLCA_MAP, COLCA_NAME, COLCA_PLACE } from "./copy";
import { buildColcaLayout, type ColcaLayout } from "./layout";
import { ARRIVE_T, COLCA_STATIONS, TOWER } from "./plan";
import { createColcaScenery } from "./scenery";
import { createColcaTextMode } from "./textmode-dialog";

/** Drop-in ambients: every ./ambient/<name>.ts exporting `create: CreateAmbient` (helpers in subfolders). */
const ambients = import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"]);

/** Map dyes per station (khipu dyes; the Kuntisuyu's own indigo at the end). */
const DYES: Record<string, string> = {
  punku: "#a8825f",
  pueblo: "#c4383f",
  colcas: "#dda63c",
  nazca: "#c98b5a",
  cahuachi: "#a8643c",
  cruz: "#3446a6",
};
const GLYPH_DYES = ["#c4383f", "#2a9d8f", "#3446a6", "#dda63c", "#8a5a9e"];

export const COLCA_DEF: SuyuDef<ColcaLayout> = {
  world: "colca",
  name: COLCA_NAME,
  stations: COLCA_STATIONS,
  buildLayout: buildColcaLayout,
  // 1 200 u square, mostly gentle plateau and pampa (the canyon is its own finer mesh): ~4–6 u cells.
  cells: { high: 300, low: 230, phone: 200 },
  createScenery: createColcaScenery,
  ambients,
  loader: COLCA_LOADER,
  textMode: (host, lang) => createColcaTextMode(host, lang),
  atmosphere: {
    fog: 0.04,
    cover: 0.06,
    tint: { color: "#ecdcc0", amount: 0.16 },
    near: 1.25,
    far: 1.45,
    // Ink fades out before the far canyon wall: its fine terraces would turn into hatching.
    inkFade: [150, 430],
  },
  spawn: { default: { t: ARRIVE_T }, from: { cusco: { t: ARRIVE_T } } },
  outfit: "andean",
  place: { id: "colca", label: COLCA_PLACE },
  visit: { radius: 9 },
  map: {
    ...COLCA_MAP,
    unlockStamp: "colca:station:cruz",
    maxAspect: 1.3,
    pad: 40,
    dye: (id) => DYES[id] ?? "#a8825f",
    marks: () => [
      ...figures().map((f, i) => ({ x: f.x, z: f.z, color: GLYPH_DYES[i % GLYPH_DYES.length] as string })),
      { x: TOWER.x, z: TOWER.z, color: "#5e3b22" },
    ],
  },
  help: COLCA_HELP,
};
