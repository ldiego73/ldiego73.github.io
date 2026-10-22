/**
 * Builds an archetype (a list of pieces on one skeleton) into two flat geometry blobs ready for the GPU:
 *
 *   body  one opaque draw: the polygonised body surface plus everything rigid or chained to it (hair locks,
 *         braids, the chullo and its pompom, hats, shoes, the backpack). Palette slots + crisp cuts
 *         (./paint.ts) colour it, and a face decal coordinate (`face`) maps the eyes and mouth onto the head.
 *   cloth one double-sided draw on the shared cloth wind: poncho, pollera, lliclla. Pattern masks from a small
 *         atlas pick palette slots, a `flex` weight (0 pinned → 1 free) drives the wind, and a vertex shade
 *         paints the folds.
 *
 * Both are skinned to the same bones (4 weights per vertex). Everything here is plain arrays (no DOM, no
 * Three) so archetypes build and are measured in unit tests; ./character.ts wraps the result in Three objects.
 */
import type { Grid } from "./loft";
import { type Band, paintVertices, solidPaint } from "./paint";
import { type Prim, prepare, type Vec3 } from "./sdf";
import { polygonise } from "./surface-nets";
import { rigidSkin, type Skin, skinFromField } from "./weights";

export interface BoneDef {
  name: string;
  parent: number;
  /** Bind-pose position in model space (the bind pose is world aligned: no bone rotation). */
  at: Vec3;
}

/** Bone list from [name, parent name | null, position] rows (parents first). */
export function skeleton(rows: ReadonlyArray<readonly [string, string | null, Vec3]>): BoneDef[] {
  const out: BoneDef[] = [];
  const idx = new Map<string, number>();
  for (const [name, parent, at] of rows) {
    const p = parent === null ? -1 : idx.get(parent);
    if (p === undefined) throw new Error(`characters: bone ${name} before its parent ${parent}`);
    idx.set(name, out.length);
    out.push({ name, parent: p, at });
  }
  return out;
}

export const boneIndex = (bones: readonly BoneDef[], name: string) => {
  const i = bones.findIndex((b) => b.name === name);
  if (i < 0) throw new Error(`characters: no bone ${name}`);
  return i;
};

/**
 * Planar projection of a face decal onto a piece: every vertex gets its projected (u, v) (so interpolation is
 * exact everywhere), and a mask that is 1 only on the surface that faces `fwd` and lies within `depth` behind
 * the decal plane (so the mouth never repeats on the neck behind the chin).
 */
export interface FaceMap {
  /** Centre of the decal and its axes (unit vectors) in bind space; w, h its size in units. */
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
  w: number;
  h: number;
  /** How far behind the plane the decal still reaches (default 0.1). */
  depth?: number;
  /** Two decals mirrored across x = 0 (the llama's eyes on both sides of its head): fwd is the +x side. */
  mirror?: boolean;
}

export type Pick = Array<[bone: number, weight: number]>;

export interface FieldPiece {
  kind: "field";
  name: string;
  prims: Prim[];
  /** Voxel size (units). Smaller = finer (fingers, ears) and more triangles. */
  h: number;
  bands?: Band[];
  /** Skin falloff width per primitive (default 1.4 × blend + 0.012). */
  width?: (p: Prim) => number;
  /** Weight relaxation rounds (default 2). */
  relax?: number;
  /** All vertices on one bone instead of field weights. */
  rigid?: number;
  /** Custom weights (overrides field weights and `rigid`). */
  skin?: (p: Vec3, n: Vec3) => Pick;
  faces?: FaceMap[];
  /** Vertex shade multiplier (1 = none): soft painted shading under hats, between wool locks. */
  shade?: (p: Vec3, n: Vec3) => number;
  /** How much of the wool's lumps the shading keeps (./surface-nets.ts; default 1). */
  woolNormal?: number;
}

export interface GridPiece {
  kind: "grid";
  name: string;
  grid: Grid;
  layer: "body" | "cloth";
  skin: (p: Vec3, v: number) => Pick;
  /** One slot, or per-vertex [slot below, slot above, signed cut] (lathe rows can switch exactly). */
  paint: number | ((p: Vec3, v: number) => [number, number, number]);
  shade?: (p: Vec3, v: number) => number;
  /** Cloth: wind weight 0 (pinned) → 1 (free edge). */
  flex?: (p: Vec3, v: number) => number;
  /** Cloth: slots for the pattern atlas's R, G, B, A masks (the base colour is `paint`). */
  cloth?: [number, number, number, number];
  /** Cloth: the atlas rectangle [u0, v0, u1, v1] this piece's UVs map into. */
  uvRect?: [number, number, number, number];
}

export type Piece = FieldPiece | GridPiece;

export interface GeoData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /** Two palette slots per vertex (negative / positive side of the cut). */
  slots: Uint8Array;
  cut: Float32Array;
  /** Face decal (u, v, mask) per vertex. */
  face: Float32Array;
  /** Vertex shade as an RGB multiplier. */
  shade: Float32Array;
  /** Cloth only. */
  uv?: Float32Array;
  flex?: Float32Array;
  cloth?: Float32Array;
}

export interface Built {
  bones: BoneDef[];
  body: GeoData;
  cloth: GeoData | null;
  /** Build time per piece and in total (ms), triangle counts. */
  stats: { ms: number; pieces: Array<{ name: string; ms: number; tris: number }>; bodyTris: number; clothTris: number };
}

interface Part {
  layer: "body" | "cloth";
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  skin: Skin;
  slots: Uint8Array;
  cut: Float32Array;
  face: Float32Array;
  shade: Float32Array;
  uv?: Float32Array;
  flex?: Float32Array;
  cloth?: Float32Array;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function fieldPart(pc: FieldPiece, nBones: number): Part {
  const prims = prepare(pc.prims);
  const m = polygonise(prims, pc.h, pc.woolNormal ?? 1);
  const nv = m.positions.length / 3;
  let skin: Skin;
  if (pc.skin) skin = pickSkin(nv, (v) => pc.skin?.(vec(m.positions, v), vec(m.normals, v)) ?? []);
  else if (pc.rigid !== undefined) skin = rigidSkin(nv, pc.rigid);
  else {
    const width = pc.width ?? ((p: Prim) => p.blend * 1.4 + 0.012);
    skin = skinFromField(m.near, m.nearD, m.k, nv, m.indices, {
      primBone: prims.map((p) => p.bone),
      primWidth: prims.map((p) => width(p)),
      bones: nBones,
      relax: pc.relax ?? 2,
    });
  }
  const nearest = (v: number) => m.near[v * m.k] as number;
  const paint = paintVertices(
    m.positions,
    nearest,
    prims.map((p) => p.slot),
    pc.bands ?? [],
  );
  const face = new Float32Array(nv * 3);
  for (const f of pc.faces ?? []) projectFace(f, m.positions, m.normals, face);
  const shade = new Float32Array(nv * 3).fill(1);
  if (pc.shade)
    for (let v = 0; v < nv; v++) {
      const s = pc.shade(vec(m.positions, v), vec(m.normals, v));
      shade[v * 3] = s;
      shade[v * 3 + 1] = s;
      shade[v * 3 + 2] = s;
    }
  return {
    layer: "body",
    position: m.positions,
    normal: m.normals,
    index: m.indices,
    skin,
    slots: paint.slots,
    cut: paint.cut,
    face,
    shade,
  };
}

function gridPart(pc: GridPiece): Part {
  const g = pc.grid;
  const nv = g.positions.length / 3;
  const skin = pickSkin(nv, (v) => pc.skin(vec(g.positions, v), v));
  let slots: Uint8Array;
  let cut: Float32Array;
  if (typeof pc.paint === "number") ({ slots, cut } = solidPaint(nv, pc.paint));
  else {
    slots = new Uint8Array(nv * 2);
    cut = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const [a, b, d] = pc.paint(vec(g.positions, v), v);
      slots[v * 2] = a;
      slots[v * 2 + 1] = b;
      cut[v] = d;
    }
  }
  const shade = new Float32Array(nv * 3).fill(1);
  if (pc.shade)
    for (let v = 0; v < nv; v++) {
      const s = pc.shade(vec(g.positions, v), v);
      shade[v * 3] = s;
      shade[v * 3 + 1] = s;
      shade[v * 3 + 2] = s;
    }
  const part: Part = {
    layer: pc.layer,
    position: g.positions,
    normal: g.normals,
    index: g.indices,
    skin,
    slots,
    cut,
    face: new Float32Array(nv * 3),
    shade,
  };
  if (pc.layer === "cloth") {
    const r = pc.uvRect ?? [0, 0, 1, 1];
    const uv = new Float32Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      uv[v * 2] = r[0] + (g.uvs[v * 2] as number) * (r[2] - r[0]);
      uv[v * 2 + 1] = r[1] + (g.uvs[v * 2 + 1] as number) * (r[3] - r[1]);
    }
    part.uv = uv;
    const flex = new Float32Array(nv);
    if (pc.flex) for (let v = 0; v < nv; v++) flex[v] = pc.flex(vec(g.positions, v), v);
    part.flex = flex;
    const cl = new Float32Array(nv * 4);
    const s = pc.cloth ?? [0, 0, 0, 0];
    for (let v = 0; v < nv; v++) cl.set(s, v * 4);
    part.cloth = cl;
  }
  return part;
}

const vec = (a: Float32Array, v: number): Vec3 => [a[v * 3] as number, a[v * 3 + 1] as number, a[v * 3 + 2] as number];

function pickSkin(nv: number, pick: (v: number) => Pick): Skin {
  const index = new Uint16Array(nv * 4);
  const weight = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const list = pick(v)
      .filter((e) => e[1] > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = list.reduce((s, e) => s + e[1], 0);
    if (!sum) {
      weight[v * 4] = 1;
      continue;
    }
    for (let s = 0; s < list.length; s++) {
      const e = list[s] as [number, number];
      index[v * 4 + s] = e[0];
      weight[v * 4 + s] = e[1] / sum;
    }
  }
  return { index, weight };
}

/** Writes (u, v, mask) of a face decal for every vertex (mask 0 off the face). Pure; exported for tests. */
export function projectFace(f: FaceMap, pos: Float32Array, nrm: Float32Array, out: Float32Array) {
  const nv = pos.length / 3;
  const depth = f.depth ?? 0.1;
  for (let v = 0; v < nv; v++) {
    let px = pos[v * 3] as number;
    let nx = nrm[v * 3] as number;
    if (f.mirror && px < 0) {
      // The left side reads its decal mirrored (the same eye, front corner toward the muzzle).
      px = -px;
      nx = -nx;
    }
    const dx = px - f.origin[0];
    const dy = (pos[v * 3 + 1] as number) - f.origin[1];
    const dz = (pos[v * 3 + 2] as number) - f.origin[2];
    const facing = nx * f.fwd[0] + (nrm[v * 3 + 1] as number) * f.fwd[1] + (nrm[v * 3 + 2] as number) * f.fwd[2];
    const ahead = dx * f.fwd[0] + dy * f.fwd[1] + dz * f.fwd[2];
    const mask = smooth(0.15, 0.5, facing) * smooth(-depth, -depth * 0.6, ahead);
    if (mask <= 0 && (out[v * 3 + 2] as number) > 0) continue;
    out[v * 3] = (dx * f.right[0] + dy * f.right[1] + dz * f.right[2]) / f.w + 0.5;
    out[v * 3 + 1] = (dx * f.up[0] + dy * f.up[1] + dz * f.up[2]) / f.h + 0.5;
    out[v * 3 + 2] = mask;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function merge(parts: Part[]): GeoData {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.position.length / 3;
    ni += p.index.length;
  }
  const out: GeoData = {
    position: new Float32Array(nv * 3),
    normal: new Float32Array(nv * 3),
    index: new Uint32Array(ni),
    skinIndex: new Uint16Array(nv * 4),
    skinWeight: new Float32Array(nv * 4),
    slots: new Uint8Array(nv * 2),
    cut: new Float32Array(nv),
    face: new Float32Array(nv * 3),
    shade: new Float32Array(nv * 3),
  };
  const cloth = parts.some((p) => p.uv);
  if (cloth) {
    out.uv = new Float32Array(nv * 2);
    out.flex = new Float32Array(nv);
    out.cloth = new Float32Array(nv * 4);
  }
  let v = 0;
  let i = 0;
  for (const p of parts) {
    const n = p.position.length / 3;
    out.position.set(p.position, v * 3);
    out.normal.set(p.normal, v * 3);
    for (let k = 0; k < p.index.length; k++) out.index[i + k] = (p.index[k] as number) + v;
    out.skinIndex.set(p.skin.index, v * 4);
    out.skinWeight.set(p.skin.weight, v * 4);
    out.slots.set(p.slots, v * 2);
    out.cut.set(p.cut, v);
    out.face.set(p.face, v * 3);
    out.shade.set(p.shade, v * 3);
    if (cloth && p.uv && p.flex && p.cloth) {
      out.uv?.set(p.uv, v * 2);
      out.flex?.set(p.flex, v);
      out.cloth?.set(p.cloth, v * 4);
    }
    v += n;
    i += p.index.length;
  }
  return out;
}

/** Build every piece of an archetype (call once per archetype and cache: ./character.ts does). */
export function buildArchetype(bones: BoneDef[], pieces: readonly Piece[]): Built {
  const t0 = now();
  const parts: Part[] = [];
  const stats: Built["stats"]["pieces"] = [];
  for (const pc of pieces) {
    const t = now();
    const part = pc.kind === "field" ? fieldPart(pc, bones.length) : gridPart(pc);
    parts.push(part);
    stats.push({ name: pc.name, ms: now() - t, tris: part.index.length / 3 });
  }
  const body = merge(parts.filter((p) => p.layer === "body"));
  const clothParts = parts.filter((p) => p.layer === "cloth");
  const cloth = clothParts.length ? merge(clothParts) : null;
  return {
    bones,
    body,
    cloth,
    stats: {
      ms: now() - t0,
      pieces: stats,
      bodyTris: body.index.length / 3,
      clothTris: cloth ? cloth.index.length / 3 : 0,
    },
  };
}
