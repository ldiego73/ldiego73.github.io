/**
 * Herds of the shared animal core (../../../characters/animals) for the lake's fauna
 * ambients, created without blocking the load: the species' far LOD is built off the main thread first
 * (`prefetchAnimals`), then the herd is made (it would otherwise build that LOD synchronously) and added to
 * the ambient's group; the nearer LODs keep arriving from the worker and sharpen it a moment later. Until then
 * the ambient's sim runs as usual and simply has nothing to draw.
 */
import type * as THREE from "three";
import { prefetchAnimals } from "../../../characters/animals/assets";
import { createHerd, type Herd, type HerdOptions } from "../../../characters/animals/crowd";
import type { SpeciesKey } from "../../../characters/animals/species";

export interface LazyHerds {
  /** A herd by name, or null until its build has landed. */
  get(name: string): Herd | null;
  /** Ask for a herd (named `name`, default the species key); `ready` runs once it exists (add the members there). */
  herd(key: SpeciesKey, o: HerdOptions, ready: (h: Herd) => void, name?: string): void;
  /** Pose and upload every herd (call once per frame after the sims set their members). */
  update(dt: number, t: number, camera: THREE.Camera): void;
  /** Draw calls of the colour pass (one per herd LOD in use). */
  drawCalls(): number;
  dispose(): void;
}

export function lazyHerds(parent: THREE.Object3D): LazyHerds {
  const herds = new Map<string, Herd>();
  let dead = false;
  return {
    get: (name) => herds.get(name) ?? null,
    herd(key, o, ready, name = key) {
      prefetchAnimals([key], [2]).then(() => {
        if (dead) return;
        const h = createHerd(key, o);
        herds.set(name, h);
        parent.add(h.group);
        ready(h);
      });
    },
    update(dt, t, camera) {
      for (const h of herds.values()) h.update(dt, t, camera);
    },
    drawCalls() {
      let n = 0;
      for (const h of herds.values()) {
        const s = h.stats();
        n += s.lod.filter((c) => c > 0).length;
      }
      return n;
    },
    dispose() {
      dead = true;
      for (const h of herds.values()) h.dispose();
      herds.clear();
    },
  };
}
