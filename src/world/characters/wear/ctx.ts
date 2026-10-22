/**
 * What every garment, hat and hair builder gets (./hats.ts, ./hair.ts, ./cloth.ts, ./worn.ts): the skeleton,
 * the body field to drape over, the head to hug, the body's scale and the level of detail.
 *
 * Builders write coordinates in the traveler's units and scale them with `ctx.k` (or measure from the head,
 * which children have larger), so one builder dresses a child, an adult and an elder. `ctx.q` scales grid
 * resolutions (1 near … ~0.4 far) and `ctx.lod` lets a builder skip details nobody can see from afar.
 *
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type GridPiece, type Pick, type Piece } from "../build";
import type { Field } from "../drape";
import type { Grid } from "../loft";
import type { Vec3 } from "../sdf";

export type Lod = 0 | 1 | 2;

/** Grid resolution factor per LOD. */
export const LOD_Q: readonly number[] = [1, 0.6, 0.36];
/** Voxel size multiplier per LOD (surface nets cell = piece h × this). */
export const LOD_H: readonly number[] = [1, 1.7, 2.9];

export interface WearCtx {
  bones: BoneDef[];
  /** Bone index by name (throws when missing). */
  b(name: string): number;
  /** Body scale (1 = the traveler) and head scale (children > 1). */
  k: number;
  hk: number;
  /** Hip and shoulder width factors of the body. */
  hw: number;
  sw: number;
  /** Whole body field (drapes) and torso-only field (shirts that let the arms through). */
  field: Field;
  torso: Field;
  /** Head-only field (hair, chullo) and the head ellipsoid. */
  head: Field;
  hc: Vec3;
  hr: Vec3;
  lod: Lod;
  q: number;
}

/** A row count at this LOD (never below `min`). */
export const res = (ctx: WearCtx, n: number, min = 3) => Math.max(min, Math.round(n * ctx.q));

/** A builder's output (the spring chains of its extra bones are in ../archetype.ts `hangsOf`). */
export interface Worn {
  pieces: Piece[];
}

/** Extra bone rows a builder needs: [name, parent, position]. */
export type BoneRows = Array<readonly [string, string | null, Vec3]>;

/** A rigid (one-bone) grid piece on the body layer. */
export function rigidGrid(name: string, g: Grid, bone: number, slot: number | ((p: Vec3) => number)): GridPiece {
  const paint: GridPiece["paint"] =
    typeof slot === "number"
      ? slot
      : (p: Vec3) => {
          const s = slot(p);
          return [s, s, 1];
        };
  return { kind: "grid", name, grid: g, layer: "body", skin: () => [[bone, 1]], paint };
}

/** A body-layer grid piece with custom weights. */
export function skinnedGrid(
  name: string,
  g: Grid,
  skin: (p: Vec3) => Pick,
  slot: number | ((p: Vec3) => number),
): GridPiece {
  const piece = rigidGrid(name, g, 0, slot);
  piece.skin = (p) => skin(p);
  return piece;
}

/** Moves a grid by (dx, dy, dz) in place. */
export function translateGrid(g: Grid, d: Vec3): Grid {
  for (let i = 0; i < g.positions.length; i += 3) {
    g.positions[i] = (g.positions[i] as number) + d[0];
    g.positions[i + 1] = (g.positions[i + 1] as number) + d[1];
    g.positions[i + 2] = (g.positions[i + 2] as number) + d[2];
  }
  return g;
}

/** Rotates a grid about the x axis through `o` (positions and normals), in place. */
export function tiltGrid(g: Grid, a: number, o: Vec3): Grid {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < g.positions.length; i += 3) {
    const y = (g.positions[i + 1] as number) - o[1];
    const z = (g.positions[i + 2] as number) - o[2];
    g.positions[i + 1] = y * c - z * s + o[1];
    g.positions[i + 2] = y * s + z * c + o[2];
    const ny = g.normals[i + 1] as number;
    const nz = g.normals[i + 2] as number;
    g.normals[i + 1] = ny * c - nz * s;
    g.normals[i + 2] = ny * s + nz * c;
  }
  return g;
}

/** Turns a lathe (axis +Y) to face forward (+Z) in place: (x, y, z) → (x, −z, y). */
export function faceForward(g: Grid): Grid {
  for (let i = 0; i < g.positions.length; i += 3) {
    const y = g.positions[i + 1] as number;
    const z = g.positions[i + 2] as number;
    g.positions[i + 1] = -z;
    g.positions[i + 2] = y;
    const ny = g.normals[i + 1] as number;
    const nz = g.normals[i + 2] as number;
    g.normals[i + 1] = -nz;
    g.normals[i + 2] = ny;
  }
  return g;
}

export { boneIndex };
