/**
 * Scenery of the Antisuyu jungle world (/{lang}/world/selva/): terrain, red-earth road and plazas, the brown
 * river, the layered instanced forest, the canopy walkway, the far canopy carpet, and river mist and light
 * shafts. Built once from the layout; the runtime (selva/index.ts) imports it lazily.
 *
 * What it reads from `env` in update(): `env.camera.position` (tile view ranges), `env.sky.time()` (dawn /
 * night mist and daytime light shafts) and `env.reducedMotion` (stills water, drift, wind and mist).
 * What it writes to the layout at build time: circle colliders for the trunks near the road, the plazas and
 * the canopy walkway (`layout.addCollider`). It adds no walkables: the walkway deck is already walkable through
 * `layout.groundAt`, and the platforms around the walkway ceibas are visual only.
 * Draw-call notes are in the module doc blocks of ./scenery/*.
 */
import type * as THREE from "three";
import * as T from "three";
import { detectDevice } from "../quality";
import type { ToonCache } from "../toon";
import type { SelvaEnv, SelvaLayout } from "./contract";
import { buildAtmos } from "./scenery/atmos";
import { buildWalkway } from "./scenery/canopy";
import { buildCarpet } from "./scenery/far";
import { createForest } from "./scenery/forest";
import { buildGroundExtras, buildRoad, buildTerrain, mudPatches } from "./scenery/ground";
import { planScenery } from "./scenery/placement";
import { buildWater } from "./scenery/water";

export interface SelvaScenery {
  group: THREE.Group;
  update(dt: number, time: number, env: SelvaEnv): void;
  setNight?(night: number): void;
  dispose(): void;
}

export function createSelvaScenery(layout: SelvaLayout, toon: ToonCache, quality: "low" | "high"): SelvaScenery {
  const phone = detectDevice().phone;
  const group = new T.Group();
  group.name = "selva-scenery";
  const plan = planScenery(layout, quality, phone);
  for (const c of plan.colliders) layout.addCollider({ kind: "circle", x: c.x, z: c.z, r: c.r });

  const terrain = buildTerrain(layout, toon, plan.sandbars);
  const mud = mudPatches(layout, quality);
  const road = buildRoad(layout, toon, mud);
  const extras = buildGroundExtras(layout, toon, mud, plan.sandbars, quality);
  group.add(terrain, road.mesh);
  if (extras) group.add(extras);

  const water = buildWater(layout, toon, quality);
  group.add(...water.objects);

  const forest = createForest(plan, toon, { quality, phone, reducedMotion: false });
  group.add(...forest.objects);

  const walkway = buildWalkway(layout, toon, plan);
  group.add(...walkway.objects);

  const carpet = buildCarpet(layout, toon, quality);
  group.add(carpet);

  const atmos = buildAtmos(layout, quality);
  group.add(...atmos.objects);

  let motion = true;
  return {
    group,
    update(dt, time, env) {
      motion = !env.reducedMotion;
      forest.update(motion ? time : 0, env.camera.position);
      water.update(dt, time, motion);
      const fog = env.scene.fog as THREE.Fog | null;
      atmos.update(dt, time, env.sky.time(), fog?.color ?? null, motion);
    },
    setNight(night) {
      water.setNight(night);
      atmos.setNight(night);
    },
    dispose() {
      group.removeFromParent();
      forest.dispose();
      water.dispose();
      walkway.dispose();
      atmos.dispose();
      carpet.geometry.dispose();
      road.material.dispose();
      terrain.geometry.dispose();
      road.mesh.geometry.dispose();
      extras?.geometry.dispose();
    },
  };
}
