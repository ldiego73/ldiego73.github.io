/** Assembles the WorldEnv contract object from the core systems. */
import * as THREE from "three";
import type { Lang, WorldEnv } from "./contract";
import { type Layout, RIVER_LEVEL } from "./layout";
import type { SkySystem } from "./sky";
import { noOutline, type ToonCache } from "./toon";

/**
 * Core helpers beyond the contract, for ambient systems (fauna, NPCs) and content.
 * Reach them as `(env as WorldEnvExtra).extra` (or `"extra" in env`); the contract types stay unchanged.
 */
export interface WorldExtra {
  /** Ground the avatar stands on (terrain, bridge decks over the gorge). */
  groundAt(x: number, z: number): number;
  /** Open grass: not path, plaza, water, gorge or cliff; gentle slope. */
  isGrass(x: number, z: number): boolean;
  /** A random open-grass point (y on the ground), optionally within r of (x, z). null if none found. */
  randomGrassPoint(rand?: () => number, near?: { x: number; z: number; r: number }): THREE.Vector3 | null;
  /** Inside the river or the mountain stream. */
  isWater(x: number, z: number): boolean;
  /** Distance to the trail centerline (and the closest t). */
  trailDistance(x: number, z: number): { d: number; t: number };
  /** Stream crossing (slab bridge) and waterfall base, for ambient sound/props. */
  stream: { t: number; cross: THREE.Vector3; fallBase: THREE.Vector3 };
}
export type WorldEnvExtra = WorldEnv & { extra: WorldExtra };

export function createEnv(o: {
  lang: Lang;
  reducedMotion: boolean;
  quality: "low" | "high";
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  layout: Layout;
  sky: SkySystem;
  toon: ToonCache;
  groundAt?: (x: number, z: number) => number;
}): WorldEnvExtra {
  const L = o.layout;
  const groundAt = o.groundAt ?? L.groundAt;
  const extra: WorldExtra = {
    groundAt,
    isGrass: L.isGrass,
    randomGrassPoint(rand = Math.random, near) {
      for (let i = 0; i < 300; i++) {
        let x: number;
        let z: number;
        if (near) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * near.r;
          x = near.x + Math.cos(a) * r;
          z = near.z + Math.sin(a) * r;
        } else {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * 165;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        }
        if (L.isGrass(x, z)) return new THREE.Vector3(x, L.heightAt(x, z), z);
      }
      return null;
    },
    isWater(x, z) {
      return L.streamDist(x, z) < 1.1 || L.heightAt(x, z) < RIVER_LEVEL;
    },
    trailDistance(x, z) {
      const q = L.trailQuery(x, z);
      return { d: q.d, t: q.t };
    },
    stream: { t: L.stream.t, cross: L.stream.cross.clone(), fallBase: L.stream.fallBase.clone() },
  };
  return {
    extra,
    lang: o.lang,
    reducedMotion: o.reducedMotion,
    quality: o.quality,
    scene: o.scene,
    camera: o.camera,
    heightAt: L.heightAt,
    trail: L.trail,
    stationPose: L.stationPose,
    walkable: L.walkable,
    addWalkable: L.addWalkable,
    addCollider: L.addCollider,
    sky: o.sky.sky,
    toon: o.toon.toon,
    noOutline,
  };
}
