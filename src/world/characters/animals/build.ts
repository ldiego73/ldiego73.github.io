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
import type { Prim } from "../sdf";
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
    .map((p) =>
      p.kind === "field"
        ? {
            ...p,
            h: p.h * k,
            relax: lod ? 1 : (p.relax ?? 2),
            prims: lod ? p.prims.map((q) => thicken(q, p.h * k * 0.6)) : p.prims,
          }
        : p,
    );
  return { plan, bones: plan.kit.skeleton(), pieces };
}

/**
 * Coarse voxels lose features thinner than about one voxel (a llama's slim legs would break into a single
 * spike at LOD 2): far LODs thicken every primitive to at least `min` across, keeping the silhouette whole.
 */
export function thicken(p: Prim, min: number): Prim {
  const s = p.shape;
  if (s.kind === "cone") return { ...p, shape: { ...s, ra: Math.max(s.ra, min), rb: Math.max(s.rb, min) } };
  if (s.kind === "ellipsoid")
    return { ...p, shape: { ...s, r: [Math.max(s.r[0], min), Math.max(s.r[1], min), Math.max(s.r[2], min)] } };
  return { ...p, shape: { ...s, h: [Math.max(s.h[0], min), Math.max(s.h[1], min), Math.max(s.h[2], min)] } };
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
