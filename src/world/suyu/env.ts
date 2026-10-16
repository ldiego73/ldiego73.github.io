/**
 * Assembles a suyu world's `SuyuEnv` (WorldEnv contract + `env.suyu` helpers) from its pure layout, the shared
 * toon cache and the shared sky. Every ambient of a suyu world receives exactly this object.
 *
 * Like the jungle's env.ts:
 *  - `stationPose(id)` knows only the world's own station ids. For any other id (a mountain station asked by a
 *    shared module such as the passport) it returns a pose far outside the world instead of throwing.
 *  - `env.suyu.groundAt` includes the highest deck registered in ../decks.ts (`layout.groundAt` does not).
 *  - The helpers live on `env.suyu`; there is no `env.extra` (mountain) or `env.selva` (jungle).
 */
import * as THREE from "three";
import type { Lang, Pose } from "../contract";
import { decks, topOf } from "../decks";
import type { WorldId } from "../events";
import type { SkySystem } from "../sky";
import { noOutline, type ToonCache } from "../toon";
import type { SuyuEnv, SuyuExtra, SuyuLayout, SuyuStation } from "./contract";

/** Far outside any suyu world: nothing is ever "near" it. */
const FAR = 1e5;

export function createSuyuEnv(o: {
  world: WorldId;
  stations: ReadonlyArray<SuyuStation>;
  lang: Lang;
  reducedMotion: boolean;
  quality: "low" | "high";
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  layout: SuyuLayout;
  sky: SkySystem;
  toon: ToonCache;
}): SuyuEnv {
  const L = o.layout;
  const b = L.bounds;
  const known = new Set(o.stations.map((s) => s.id));
  const suyu: SuyuExtra = {
    world: o.world,
    layout: L,
    groundAt: (x, z) => topOf(decks, L.groundAt(x, z), x, z),
    isGround: L.isGround,
    randomGroundPoint(rand = Math.random, near) {
      for (let i = 0; i < 300; i++) {
        let x: number;
        let z: number;
        if (near) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * near.r;
          x = near.x + Math.cos(a) * r;
          z = near.z + Math.sin(a) * r;
        } else {
          x = b.x0 + rand() * (b.x1 - b.x0);
          z = b.z0 + rand() * (b.z1 - b.z0);
        }
        if (L.isGround(x, z)) return new THREE.Vector3(x, L.heightAt(x, z), z);
      }
      return null;
    },
    isWater: L.isWater,
    waterDist: L.waterDist,
    trailDistance(x, z) {
      const q = L.trailQuery(x, z);
      return { d: q.d, t: q.t };
    },
  };
  const stationPose = (id: string): Pose =>
    known.has(id) ? L.stationPose(id) : { position: new THREE.Vector3(FAR, 0, FAR), yaw: 0 };
  return {
    suyu,
    lang: o.lang,
    reducedMotion: o.reducedMotion,
    quality: o.quality,
    scene: o.scene,
    camera: o.camera,
    heightAt: L.heightAt,
    trail: L.trail,
    stationPose,
    walkable: L.walkable,
    addWalkable: L.addWalkable,
    addCollider: L.addCollider,
    sky: o.sky.sky,
    toon: o.toon.toon,
    noOutline,
  };
}
