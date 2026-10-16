/**
 * Static set of the Collasuyu (SuyuDef.createScenery): the altiplano ground and the road (./scenery/ground.ts),
 * Lake Titicaca's water (./scenery/water.ts), the totora reed beds (./scenery/reeds.ts), ichu, boulders, pirca
 * walls and farmhouses (./scenery/flora.ts), the terraced hills and Taquile's contour walls
 * (./scenery/terraces.ts) and the ring of mountains with the Cordillera Real (./scenery/backdrop.ts).
 *
 * Draw calls: terrain, road, lake + far lake, reeds, ichu, rocks, walls, terraces, mountains: ten (plus the ink
 * pass). The water and the reeds move in their shaders (time uniform; still with prefers-reduced-motion).
 * The sun's direction for the water's glints is read from the sky's key light (its one directional light).
 *
 * Thin air at 3800 m: after the shared sky (../sky.ts) paints its dome each frame, the daytime zenith is
 * deepened toward the altiplano's intense blue and the horizon cleared a little (faded out at night). Only this
 * world's page does it, on the dome's own colour uniforms; the sky module is unchanged.
 */
import * as THREE from "three";
import type { Quality } from "../engine";
import type { SuyuEnv, SuyuScenery } from "../suyu/contract";
import type { ToonCache } from "../toon";
import type { TiticacaLayout } from "./layout";
import { buildBackdrop } from "./scenery/backdrop";
import { buildFlora } from "./scenery/flora";
import { buildRoad, buildTerrain } from "./scenery/ground";
import { buildReeds } from "./scenery/reeds";
import { buildTerraces } from "./scenery/terraces";
import { buildLake } from "./scenery/water";

export function createTiticacaScenery(layout: TiticacaLayout, toon: ToonCache, quality: Quality): SuyuScenery {
  const group = new THREE.Group();
  group.name = "titicaca-scenery";
  const terrain = buildTerrain(layout, toon);
  const road = buildRoad(layout, toon);
  const lake = buildLake(layout, toon);
  const reeds = buildReeds(layout, toon, quality);
  const flora = buildFlora(layout, toon, quality);
  const terraceGeo = buildTerraces(layout);
  const terraceMat = toon.vertexToon();
  group.add(terrain.dry, terrain.wet, road.mesh, ...lake.objects, reeds.mesh, flora.group);
  if (terraceGeo) {
    const terraces = new THREE.Mesh(terraceGeo, terraceMat);
    terraces.name = "titicaca-terraces";
    terraces.castShadow = true;
    terraces.receiveShadow = true;
    group.add(terraces);
  }
  const backdrop = buildBackdrop(layout, toon);
  group.add(backdrop.mesh);

  let light: THREE.DirectionalLight | null = null;
  let dome: { uTop: { value: THREE.Color }; uHorizon: { value: THREE.Color } } | null = null;
  let night = 0;
  const sun = new THREE.Vector3(0, 1, 0);
  const sky = new THREE.Color("#cfe2f4");
  const zenith = new THREE.Color("#7fb2e6");
  const ALTI_TOP = new THREE.Color("#1f63c9");
  const ALTI_HORIZON = new THREE.Color("#a7cdf2");
  return {
    group,
    update(_dt, time, env: SuyuEnv) {
      const motion = !env.reducedMotion;
      if (!light || !dome)
        env.scene.traverse((o) => {
          if (!light && (o as THREE.DirectionalLight).isDirectionalLight) light = o as THREE.DirectionalLight;
          const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
          if (!dome && u?.uTop && u.uHorizon) dome = u as unknown as typeof dome;
        });
      if (light) sun.subVectors(light.position, light.target.position).normalize();
      if (dome) {
        const day = 1 - night;
        dome.uTop.value.lerp(ALTI_TOP, 0.5 * day);
        dome.uHorizon.value.lerp(ALTI_HORIZON, 0.35 * day);
      }
      // The water mirrors the sky: its horizon, a little toward the zenith.
      if (dome) sky.copy(dome.uHorizon.value).lerp(dome.uTop.value, 0.3);
      else sky.copy(zenith);
      lake.update(time, sky, sun, motion);
      reeds.update(time, motion);
    },
    setNight(n) {
      night = n;
      lake.setNight(n);
    },
    dispose() {
      terrain.dry.geometry.dispose();
      terrain.wet.geometry.dispose();
      road.mesh.geometry.dispose();
      road.material.dispose();
      lake.dispose();
      reeds.dispose();
      flora.dispose();
      terraceGeo?.dispose();
      backdrop.dispose();
    },
  };
}
