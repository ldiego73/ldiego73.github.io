/**
 * The Cusco hub as a suyu world: everything the generic runtime (../suyu/index.ts) needs to mount Haukaypata.
 * Stations, gates and coordinates live in ./plan.ts; the pure layout in ./layout.ts; the static set (valley,
 * plaza, usnu, walls, halls, Qorikancha, Sacsayhuamán, far mountains) in ./scenery.ts; the living and
 * interactive parts in ./ambient/*.ts (globbed below, literal so Vite can split them).
 *
 * Hooks: invisible box proxies of the street walls are raycast by the follow camera only while the traveler is
 * on a street (`areaOccluders`), so the camera never ends up behind a wall in the narrow streets.
 */
import * as THREE from "three";
import type { SuyuDef } from "../suyu/contract";
import { CUSCO_HELP, CUSCO_LOADER, CUSCO_MAP, CUSCO_NAME, CUSCO_PLACE } from "./copy";
import { buildCuscoLayout, type CuscoLayout } from "./layout";
import { CUSCO_STATIONS, DEFAULT_SPAWN, GATES, gateArrival, gatePoint, PLAZA, ROAD_LEN, USNU, WALL_OFF } from "./plan";
import { createCuscoScenery } from "./scenery";
import { createCuscoTextMode } from "./textmode-dialog";

/** Drop-in hub ambients: every ./ambient/<name>.ts exporting `create: CreateAmbient` (helpers in subfolders). */
const ambients = import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"]);

/** Arrivals: through the punku of the world the traveler comes from (only worlds with an open gate). */
const from: SuyuDef["spawn"]["from"] = {};
for (const g of GATES) if (g.available && g.world !== "cusco") from[g.world as "qhapaq"] = gateArrival(g);

export const CUSCO_DEF: SuyuDef<CuscoLayout> = {
  world: "cusco",
  name: CUSCO_NAME,
  stations: CUSCO_STATIONS,
  buildLayout: buildCuscoLayout,
  // A small world (480 u square, mostly far hills): fewer cells than the long road worlds.
  cells: { high: 160, low: 128, phone: 112 },
  createScenery: createCuscoScenery,
  ambients,
  loader: CUSCO_LOADER,
  textMode: (host, lang) => createCuscoTextMode(host, lang),
  atmosphere: {
    // Thin, clear highland air: a whisper of haze, ink kept far.
    fog: 0.06,
    cover: 0.08,
    tint: { color: "#dfe6ee", amount: 0.12 },
    far: 1.25,
    inkFade: [150, 520],
  },
  spawn: { default: DEFAULT_SPAWN, from },
  outfit: "andean",
  place: { id: "haukaypata", label: CUSCO_PLACE },
  visit: { radius: 8 },
  map: {
    ...CUSCO_MAP,
    unlockStamp: "cusco:station:usnu",
    trail: false,
    maxAspect: 1,
    pad: 18,
    roads: (layout) =>
      (layout as CuscoLayout).streets.map((s) => [
        { x: s.from[0], z: s.from[1] },
        { x: s.to[0], z: s.to[1] },
      ]),
    // The plaza and the usnu's base, paved.
    areas: () => [
      [
        { x: PLAZA.x0, z: PLAZA.z0 },
        { x: PLAZA.x1, z: PLAZA.z0 },
        { x: PLAZA.x1, z: PLAZA.z1 },
        { x: PLAZA.x0, z: PLAZA.z1 },
      ],
      [
        { x: USNU.x - USNU.tiers[0].half, z: USNU.z - USNU.tiers[0].half },
        { x: USNU.x + USNU.tiers[0].half, z: USNU.z - USNU.tiers[0].half },
        { x: USNU.x + USNU.tiers[0].half, z: USNU.z + USNU.tiers[0].half },
        { x: USNU.x - USNU.tiers[0].half, z: USNU.z + USNU.tiers[0].half },
      ],
    ],
    // A diamond just past each punku: in its dye when open, grey while closed.
    marks: () =>
      GATES.map((g) => {
        const [x, z] = gatePoint(g);
        return { x: x + g.dir[0] * 5, z: z + g.dir[1] * 5, color: g.available ? g.dye : "#9a948a" };
      }),
    dye: (id) =>
      GATES.find((g) => g.id === id)?.dye ?? (id === "usnu" ? "#dda63c" : id === "qorikancha" ? "#e8b631" : "#a8825f"),
  },
  help: CUSCO_HELP,
  hooks: ({ cam }) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial();
    for (const g of GATES) {
      const yaw = Math.atan2(g.dir[0], g.dir[1]);
      const objects: THREE.Object3D[] = [];
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(geo, mat);
        const nx = -g.dir[1] * side;
        const nz = g.dir[0] * side;
        const mid = ROAD_LEN / 2;
        m.scale.set(1.2, 4, ROAD_LEN);
        m.rotation.y = yaw;
        m.position.set(
          g.mouth[0] + g.dir[0] * mid + nx * (WALL_OFF + 0.4),
          2,
          g.mouth[1] + g.dir[1] * mid + nz * (WALL_OFF + 0.4),
        );
        m.updateMatrixWorld(true);
        objects.push(m);
      }
      const c = { x: g.mouth[0] + g.dir[0] * (ROAD_LEN / 2), z: g.mouth[1] + g.dir[1] * (ROAD_LEN / 2) };
      cam.areaOccluders.push({ objects, x: c.x, z: c.z, r: ROAD_LEN / 2 + 3 });
    }
    return {
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};
