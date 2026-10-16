/**
 * Static set of the Cusco hub (SuyuDef.createScenery): the valley ground (./scenery/ground.ts), the stone
 * architecture of the plaza, the streets and Sacsayhuamán (./scenery/buildings.ts, three merged meshes), the
 * ring of apus (./scenery/backdrop.ts) and the native plants on the slopes (./scenery/flora.ts). Everything is
 * vertex-coloured toon, so the whole set is about eight draw calls (plus the ink pass). Nothing here moves;
 * the gates, the khipu, people and animals are ambients.
 */
import * as THREE from "three";
import type { Quality } from "../engine";
import { vertexToon } from "../merge-colors";
import type { SuyuScenery } from "../suyu/contract";
import type { ToonCache } from "../toon";
import type { CuscoLayout } from "./layout";
import { buildBackdrop } from "./scenery/backdrop";
import { buildArchitecture } from "./scenery/buildings";
import { buildFlora } from "./scenery/flora";
import { buildGround } from "./scenery/ground";

export function createCuscoScenery(layout: CuscoLayout, toon: ToonCache, quality: Quality): SuyuScenery {
  const group = new THREE.Group();
  group.name = "cusco-scenery";
  const ground = buildGround(layout, toon);
  group.add(ground.mesh);
  const arch = buildArchitecture(layout);
  const mat = vertexToon();
  const meshes = (["plaza", "streets", "far"] as const).map((k) => {
    const m = new THREE.Mesh(arch[k], mat);
    m.name = `cusco-${k}`;
    m.castShadow = k !== "far";
    m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const apus = buildBackdrop(toon, layout.heightAt);
  group.add(apus.mesh);
  const flora = buildFlora(layout, toon, quality);
  group.add(flora.group);
  return {
    group,
    update() {},
    dispose() {
      ground.dispose();
      for (const m of meshes) m.geometry.dispose();
      mat.dispose();
      apus.dispose();
      flora.dispose();
    },
  };
}
