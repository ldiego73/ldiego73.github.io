/**
 * Small construction kit shared by the animal body plans (./plan-quad.ts, ./plan-bird.ts, ./plan-swim.ts):
 * named bones, primitive helpers bound to a bone by name, and the pieces list the archetype builder
 * (../build.ts) turns into one skinned surface. A body plan fills the kit from its numbers; a species preset
 * can then add its own primitives (a mane, a trunk, a shell, a crest) through the same calls before the kit is
 * sealed into pieces.
 *
 * Pure (no DOM, no Three).
 */
import { type BoneDef, boneIndex, type FaceMap, type FieldPiece, type Piece, skeleton } from "../build";
import type { Band } from "../paint";
import { type Mat3, mirrorX, type Prim, type Vec3 } from "../sdf";

export type Row = readonly [string, string | null, Vec3];

/** Fur / wool / feather treatment of a group of primitives: lumps (amplitude, frequency) on the field. */
export interface Coat {
  /** Lump amplitude (units, 0 = smooth skin). High frequencies give the jagged rims of fur and feathers. */
  wool: number;
  freq: number;
}

export const SMOOTH: Coat = { wool: 0, freq: 10 };

export class Kit {
  readonly rows: Row[] = [];
  readonly prims: Prim[] = [];
  readonly bands: Band[] = [];
  readonly faces: FaceMap[] = [];
  /** Extra pieces (separate surfaces: t'ikas, the inside of a mouth, flight wings, a shell). */
  readonly extra: Piece[] = [];
  /** Named groups of primitive indices (bands and species extras look them up). */
  readonly groups: Record<string, number[]> = {};
  private bones: BoneDef[] | null = null;

  bone(name: string, parent: string | null, at: Vec3) {
    this.rows.push([name, parent, at]);
    this.bones = null;
  }

  has(name: string) {
    return this.rows.some((r) => r[0] === name);
  }

  at(name: string): Vec3 {
    const r = this.rows.find((x) => x[0] === name);
    if (!r) throw new Error(`animals: no bone ${name}`);
    return r[2];
  }

  skeleton(): BoneDef[] {
    this.bones ??= skeleton(this.rows);
    return this.bones;
  }

  b(name: string) {
    return boneIndex(this.skeleton(), name);
  }

  add(p: Prim, group?: string) {
    this.prims.push(p);
    const i = this.prims.length - 1;
    if (group) {
      const g = this.groups[group] ?? [];
      g.push(i);
      this.groups[group] = g;
    }
    return i;
  }

  /** Adds a primitive and its mirror on the right-side bone (`L` → `R` in the bone name). */
  addPair(p: Prim, rightBone: string, group?: string) {
    const a = this.add(p, group);
    const b = this.add(mirrorX(p, this.b(rightBone)), group);
    return [a, b] as const;
  }

  ell(c: Vec3, r: Vec3, bone: string, blend: number, slot: number, coat: Coat = SMOOTH, rot?: Mat3): Prim {
    return {
      shape: { kind: "ellipsoid", c, r, ...(rot ? { rot } : {}) },
      bone: this.b(bone),
      blend,
      slot,
      ...(coat.wool ? { wool: coat.wool, woolFreq: coat.freq } : {}),
    };
  }

  cone(a: Vec3, b: Vec3, ra: number, rb: number, bone: string, blend: number, slot: number, coat: Coat = SMOOTH): Prim {
    return {
      shape: { kind: "cone", a, b, ra, rb },
      bone: this.b(bone),
      blend,
      slot,
      ...(coat.wool ? { wool: coat.wool, woolFreq: coat.freq } : {}),
    };
  }

  box(
    c: Vec3,
    h: Vec3,
    round: number,
    bone: string,
    blend: number,
    slot: number,
    coat: Coat = SMOOTH,
    rot?: Mat3,
  ): Prim {
    return {
      shape: { kind: "box", c, h, round, ...(rot ? { rot } : {}) },
      bone: this.b(bone),
      blend,
      slot,
      ...(coat.wool ? { wool: coat.wool, woolFreq: coat.freq } : {}),
    };
  }

  group(name: string) {
    return this.groups[name] ?? [];
  }

  /** The body surface plus every extra piece. */
  pieces(o: { h: number; woolNormal?: number; shade?: FieldPiece["shade"]; relax?: number }): Piece[] {
    const body: FieldPiece = {
      kind: "field",
      name: "body",
      prims: this.prims,
      h: o.h,
      bands: this.bands,
      faces: this.faces,
      ...(o.woolNormal !== undefined ? { woolNormal: o.woolNormal } : {}),
      ...(o.shade ? { shade: o.shade } : {}),
      ...(o.relax !== undefined ? { relax: o.relax } : {}),
    };
    return [body, ...this.extra];
  }
}

// ---------------------------------------------------------------- small vector helpers

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Quadratic Bézier point (a → b with control c). */
export const quad3 = (a: Vec3, c: Vec3, b: Vec3, t: number): Vec3 => lerp3(lerp3(a, c, t), lerp3(c, b, t), t);
/** Mirror a left-side point to the right. */
export const mx = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

/** Smoothstep (used by band scalars that blend two regions continuously). */
export const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
