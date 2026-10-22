/**
 * Level of detail for animals: which mesh a body uses at a distance and how often its pose is recomputed.
 *
 *   LOD 0  the full surface (voxel h)            near: mounts, a herd next to the trail
 *   LOD 1  the same field at 2× the voxel        mid distance (≈ a quarter of the triangles)
 *   LOD 2  3.5× the voxel, no small extras       far (a dozen pixels tall: silhouette and colour only)
 *
 * Distances scale with the animal's size (a condor stays detailed farther away than a cuy), and with a phone
 * factor. Far bodies are posed less often (every 2nd or 4th frame); the farthest band can be culled.
 *
 * Pure (no DOM, no Three).
 */

export type Lod = 0 | 1 | 2;

/** Voxel multiplier per LOD (applied to every field piece's h). */
export const LOD_VOXEL: Record<Lod, number> = { 0: 1, 1: 2, 2: 3.5 };

export interface LodBands {
  /** Below `near` × size → LOD 0; below `mid` × size → LOD 1; below `far` × size → LOD 2; beyond → hidden. */
  near: number;
  mid: number;
  far: number;
}

/** Defaults in body sizes (a 1.5 m llama: LOD 0 to 21 m, LOD 1 to 60 m, LOD 2 to 240 m). */
export const LOD_BANDS: LodBands = { near: 14, mid: 40, far: 160 };

/** The LOD for a body of `size` units at distance `d`, or −1 when it is too far to draw. */
export function lodFor(d: number, size: number, bands: LodBands = LOD_BANDS, k = 1): Lod | -1 {
  const s = Math.max(0.15, size) * k;
  if (d < bands.near * s) return 0;
  if (d < bands.mid * s) return 1;
  if (d < bands.far * s) return 2;
  return -1;
}

/** Re-pose every n-th frame at this LOD (1 = every frame). */
export const POSE_EVERY: Record<Lod, number> = { 0: 1, 1: 2, 2: 4 };

/** True when instance `i` is posed on frame `frame` at this LOD (spread evenly so a herd never spikes). */
export function poseThisFrame(lod: Lod, i: number, frame: number) {
  const n = POSE_EVERY[lod];
  return (i + frame) % n === 0;
}
