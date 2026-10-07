/**
 * Assembles the jungle's `SelvaEnv` (WorldEnv contract + `env.selva` helpers) from the pure layout, the shared
 * toon cache and the shared sky. Ambients under src/world/selva/ambient/ receive exactly this object.
 *
 * Differences from the mountain's env.ts:
 *  - `stationPose(id)` knows only SELVA_STATIONS ids. For any other id (a mountain station asked by a shared
 *    module such as the passport) it returns a pose far outside the world instead of throwing, so shared
 *    modules that map over mountain ids still build and never fire "you are near" there.
 *  - The jungle helpers live on `env.selva` (contract.ts SelvaExtra); there is no `env.extra`.
 *  - `env.selva.groundAt` includes the highest deck registered in ../decks.ts (`layout.groundAt` does not).
 */
import * as THREE from "three";
import type { Lang, Pose } from "../contract";
import { decks, topOf } from "../decks";
import type { SkySystem } from "../sky";
import { noOutline, type ToonCache } from "../toon";
import { SELVA_STATIONS, type SelvaEnv, type SelvaExtra, type SelvaLayout } from "./contract";

/** Far outside the ±525 u jungle square: nothing is ever "near" it. */
const FAR = 1e5;
const known = new Set(SELVA_STATIONS.map((s) => s.id));

export function createSelvaEnv(o: {
  lang: Lang;
  reducedMotion: boolean;
  quality: "low" | "high";
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  layout: SelvaLayout;
  sky: SkySystem;
  toon: ToonCache;
}): SelvaEnv {
  const L = o.layout;
  const b = L.bounds;
  const selva: SelvaExtra = {
    layout: L,
    // Fauna and people stand on the highest registered deck (piers, boardwalks, floors: ../decks.ts).
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
    riverDist: L.riverDist,
    trailDistance(x, z) {
      const q = L.trailQuery(x, z);
      return { d: q.d, t: q.t };
    },
  };
  const stationPose = (id: string): Pose =>
    known.has(id) ? L.stationPose(id) : { position: new THREE.Vector3(FAR, 0, FAR), yaw: 0 };
  return {
    selva,
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
