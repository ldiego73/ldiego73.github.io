/**
 * Builds a species into skinned geometry at a level of detail: the species' plan (./spec.ts) fills a kit, the
 * kit becomes pieces, every field piece's voxel is scaled by the LOD (./lod.ts LOD_VOXEL) and the shared
 * archetype builder (../build.ts) polygonises and skins them. At LOD 2 the small extra pieces (t'ikas, the
 * inside of the mouth, claws) are dropped: at that distance only the silhouette and the colours read.
 *
 * Results are cached per (species, LOD) so a herd, a mount and a crowd share one build. Pure (no DOM, no
 * Three): runs in tests and in the build worker (./worker.ts).
 */
import { type Built, buildArchetype, type Piece } from "../build";
import { LOD_VOXEL, type Lod } from "./lod";
import type { AnimalSpec } from "./spec";

const cache = new Map<string, Built>();

/** Pieces dropped at the far LOD (by name prefix). */
const DETAIL = ["mouth", "tika", "detail"];

export function animalPieces(spec: AnimalSpec, lod: Lod) {
  const plan = spec.plan(lod);
  const k = LOD_VOXEL[lod];
  const pieces: Piece[] = plan.kit
    .pieces({ h: plan.h, ...(plan.woolNormal !== undefined ? { woolNormal: plan.woolNormal } : {}) })
    .filter((p) => lod < 2 || !DETAIL.some((d) => p.name.startsWith(d)))
    .map((p) => (p.kind === "field" ? { ...p, h: p.h * k, relax: lod ? 1 : (p.relax ?? 2) } : p));
  return { plan, bones: plan.kit.skeleton(), pieces };
}

/** Build (or reuse) a species at a LOD. */
export function buildAnimal(spec: AnimalSpec, lod: Lod = 0): Built {
  const key = `${spec.key}:${lod}`;
  let b = cache.get(key);
  if (!b) {
    const { bones, pieces } = animalPieces(spec, lod);
    b = buildArchetype(bones, pieces);
    cache.set(key, b);
  }
  return b;
}

/** Put a build made elsewhere (the worker) into the cache. */
export function cacheAnimal(key: string, lod: Lod, built: Built) {
  cache.set(`${key}:${lod}`, built);
}

export const cachedAnimal = (key: string, lod: Lod) => cache.get(`${key}:${lod}`) ?? null;
