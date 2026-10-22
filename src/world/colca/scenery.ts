/**
 * Static set of the Kuntisuyu (SuyuDef.createScenery): the walkable ground (./scenery/ground.ts), the road
 * ribbon (./scenery/road.ts), the terraced canyon and its river (./scenery/canyon.ts), the mist layers inside
 * it (./scenery/mist.ts), the far skirt, volcanoes and Sabancaya's plume (./scenery/backdrop.ts) and the
 * instanced plants and stones (./scenery/flora.ts). About fourteen draw calls, all vertex-coloured toon
 * except the mist and the plume. Stations, people and animals are ambients.
 */
import * as THREE from "three";
import type { Quality } from "../engine";
import type { SuyuEnv, SuyuScenery } from "../suyu/contract";
import type { ToonCache } from "../toon";
import type { ColcaLayout } from "./layout";
import { buildBackdrop } from "./scenery/backdrop";
import { buildCanyon } from "./scenery/canyon";
import { buildFlora } from "./scenery/flora";
import { buildGround } from "./scenery/ground";
import { buildMist } from "./scenery/mist";
import { buildRoad } from "./scenery/road";

export function createColcaScenery(layout: ColcaLayout, toon: ToonCache, quality: Quality): SuyuScenery {
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const group = new THREE.Group();
  group.name = "colca-scenery";
  const ground = buildGround(layout, toon);
  const road = buildRoad(layout, toon);
  const canyon = buildCanyon(toon, quality);
  const mist = buildMist(reducedMotion);
  const back = buildBackdrop(toon, reducedMotion);
  const flora = buildFlora(layout, toon, quality);
  group.add(ground.mesh, road.mesh, canyon.group, mist.group, back.group, flora.group);
  let night = 0;
  return {
    group,
    setNight(n) {
      night = n;
    },
    update(dt, _time, env: SuyuEnv) {
      const c = env.camera.position;
      mist.update(dt, env.sky.time(), night, c.x);
      back.update(dt);
    },
    dispose() {
      ground.dispose();
      road.dispose();
      canyon.dispose();
      mist.dispose();
      back.dispose();
      flora.dispose();
    },
  };
}
