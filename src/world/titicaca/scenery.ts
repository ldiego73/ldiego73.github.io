/**
 * Static set of the Collasuyu (SuyuDef.createScenery): the altiplano ground and the road (./scenery/ground.ts),
 * Lake Titicaca's water (./scenery/water.ts), the totora reed beds (./scenery/reeds.ts), ichu, boulders, pirca
 * walls and farmhouses (./scenery/flora.ts), the terraced hills and Taquile's contour walls
 * (./scenery/terraces.ts) and the ring of mountains with the Cordillera Real (./scenery/backdrop.ts).
 *
 * Draw calls: terrain, road, lake + far lake, reeds, ichu, rocks, walls, terraces, mountains: ten (plus the ink
 * pass). The reeds and the ichu ride the shared wind (../style-gl.ts `windSway`); the water moves in its own
 * shader (time uniform, still with prefers-reduced-motion) and reads the same wind for its gust patches.
 * The sun's direction for the water's glints is read from the sky's key light (its one directional light).
 *
 * Thin air at 3800 m: the style profile (../style.ts `STYLES.titicaca`) already leans the day zenith to the
 * altiplano's deep blue and saturates the dome; after the shared sky (../sky.ts) paints it each frame, this
 * page only clears the horizon toward a crisp pale blue (faded out at night), so the band under the
 * Cordillera reads as clean high-altitude air rather than haze. The sky module is unchanged.
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
  const ALTI_HORIZON = new THREE.Color("#a9d2f5");
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
      if (dome) dome.uHorizon.value.lerp(ALTI_HORIZON, 0.4 * (1 - night));
      // The water mirrors the sky: its horizon, a little toward the zenith.
      if (dome) sky.copy(dome.uHorizon.value).lerp(dome.uTop.value, 0.3);
      else sky.copy(zenith);
      lake.update(time, sky, sun, motion);
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
