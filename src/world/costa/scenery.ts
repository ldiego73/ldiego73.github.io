/**
 * Static set of the Chinchaysuyu coast (SuyuDef.createScenery): the terrain and the road ribbon
 * (./scenery/ground.ts), the Pacific (./scenery/sea.ts: one displaced toon mesh to the horizon), the spray on
 * the cliffs (./scenery/spray.ts), the two rivers (./scenery/river.ts), the bridges and the road's tapial walls (./scenery/props.ts), the coast and
 * the Andes beyond the map (./scenery/backdrop.ts) and the native plants and boulders (./scenery/flora.ts).
 * About a dozen draw calls in all. The stations, people, animals, boats and the finale are ambients.
 */
import * as THREE from "three";
import type { Quality } from "../engine";
import { vertexToon } from "../merge-colors";
import type { SuyuScenery } from "../suyu/contract";
import type { ToonCache } from "../toon";
import { noOutline } from "../toon";
import type { CostaLayout } from "./layout";
import { buildBackdrop } from "./scenery/backdrop";
import { buildFlora } from "./scenery/flora";
import { buildGround } from "./scenery/ground";
import { buildRoadWorks } from "./scenery/props";
import { buildRivers } from "./scenery/river";
import { buildSea } from "./scenery/sea";
import { buildSpray } from "./scenery/spray";

export function createCostaScenery(layout: CostaLayout, toon: ToonCache, quality: Quality): SuyuScenery {
  const group = new THREE.Group();
  group.name = "costa-scenery";
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ground = buildGround(layout, toon);
  group.add(ground.mesh, ground.road);
  const sea = buildSea(layout, toon, quality);
  group.add(sea.mesh);
  const rivers = buildRivers(layout, toon);
  group.add(rivers.mesh);
  const spray = buildSpray(layout, reducedMotion);
  noOutline(spray.points);
  group.add(spray.points);
  const worksGeo = buildRoadWorks(layout);
  const worksMat = vertexToon();
  const works = new THREE.Mesh(worksGeo, worksMat);
  works.name = "costa-roadworks";
  works.castShadow = true;
  works.receiveShadow = true;
  group.add(works);
  const backdrop = buildBackdrop(layout, toon);
  group.add(backdrop.mesh);
  const flora = buildFlora(layout, quality);
  group.add(flora.group);
  return {
    group,
    update(_dt, time, env) {
      const t = reducedMotion ? 0 : time;
      sea.update(t, env.sky.time(), env.scene, env.camera);
      spray.update(t);
      rivers.update(t);
    },
    setNight(n) {
      sea.setNight(n);
    },
    dispose() {
      ground.dispose();
      sea.dispose();
      spray.dispose();
      rivers.dispose();
      worksGeo.dispose();
      worksMat.dispose();
      backdrop.dispose();
      flora.dispose();
    },
  };
}
