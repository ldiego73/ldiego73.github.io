/**
 * Signed distance field of a character piece: a smooth union of a few dozen primitives (tapered capsules,
 * ellipsoids, rounded boxes), each tied to one bone and one palette slot.
 *
 * Why a field and not separate meshes: the old characters are ~60 rigid primitives whose every silhouette the
 * ink pass outlines, so each joint shows as a seam. A smooth union of the same kind of shapes, polygonised once
 * (./surface-nets.ts), is ONE watertight surface whose shoulders, hips, elbows and neck blend like skin; the
 * per-primitive distances it keeps also give the skin weights (./weights.ts) and the colour regions.
 *
 * Pure (no DOM, no Three): plain numbers and Float32Arrays, so it is unit-tested and runs anywhere.
 * Distances follow Inigo Quilez's formulas (round cone, ellipsoid bound, round box, polynomial smooth min).
 */

export type Vec3 = [number, number, number];

/** Row-major 3×3 rotation (world → primitive local is its transpose). */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export type Shape =
  /** Tapered capsule from a (radius ra) to b (radius rb): limbs, neck, torso columns, fingers. */
  | { kind: "cone"; a: Vec3; b: Vec3; ra: number; rb: number }
  /** Ellipsoid at c with semi-axes r, optionally rotated (`rot` maps local → world). */
  | { kind: "ellipsoid"; c: Vec3; r: Vec3; rot?: Mat3 }
  /** Box at c with half sizes h, edges rounded by `round`, optionally rotated. */
  | { kind: "box"; c: Vec3; h: Vec3; round: number; rot?: Mat3 };

export interface Prim {
  shape: Shape;
  /** Skeleton bone this primitive follows (index into the archetype's bone list). */
  bone: number;
  /** Smooth-union radius with what came before (0 = hard union). Larger = softer, fuller joint. */
  blend: number;
  /** Palette slot of the surface this primitive makes (before the cuts in ./paint.ts). */
  slot: number;
  /** Subtract instead of add (smooth difference with the same blend), e.g. the cleft of a llama's toes. */
  carve?: boolean;
  /** Lumpy wool: amplitude (units) of a value-noise displacement on this primitive's distance. */
  wool?: number;
  /** Wool noise frequency (1/units). */
  woolFreq?: number;
}

/** A primitive with its precomputed bounds (world AABB grown by its blend and wool). */
export interface PreparedPrim extends Prim {
  min: Vec3;
  max: Vec3;
  /** Inverse rotation (world → local) for rotated shapes. */
  inv?: Mat3;
}

export const rotX = (a: number): Mat3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (a: number): Mat3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (a: number): Mat3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export function mulM(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += (a[r * 3 + k] as number) * (b[k * 3 + c] as number);
      o[r * 3 + c] = s;
    }
  return o;
}
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Polynomial smooth minimum (k = blend radius). Exactly min(a, b) when they differ by more than k. */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (for smooth subtraction: smax(a, -b, k)). */
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function sdRoundCone(px: number, py: number, pz: number, a: Vec3, b: Vec3, r1: number, r2: number) {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const pax = px - a[0];
  const pay = py - a[1];
  const paz = pz - a[2];
  if (l2 < 1e-12) return Math.sqrt(pax * pax + pay * pay + paz * paz) - Math.max(r1, r2);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function sdEllipsoid(x: number, y: number, z: number, r: Vec3) {
  const ax = x / r[0];
  const ay = y / r[1];
  const az = z / r[2];
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / r[0];
  const by = ay / r[1];
  const bz = az / r[2];
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

function sdRoundBox(x: number, y: number, z: number, h: Vec3, rad: number) {
  const qx = Math.abs(x) - h[0] + rad;
  const qy = Math.abs(y) - h[1] + rad;
  const qz = Math.abs(z) - h[2] + rad;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  const m = qx > qy ? (qx > qz ? qx : qz) : qy > qz ? qy : qz;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + (m < 0 ? m : 0) - rad;
}

// ---------------------------------------------------------------- wool noise

const hash3 = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Smooth 3D value noise in [-1, 1] (deterministic: the same fleece on every visit). */
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  const v = l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  );
  return v * 2 - 1;
}

// ---------------------------------------------------------------- primitives

/** Distance from (x, y, z) to one primitive (negative inside), wool included. Allocation free. */
export function primDistance(p: PreparedPrim, x: number, y: number, z: number, noWool = false): number {
  const s = p.shape;
  let d: number;
  if (s.kind === "cone") d = sdRoundCone(x, y, z, s.a, s.b, s.ra, s.rb);
  else {
    let dx = x - s.c[0];
    let dy = y - s.c[1];
    let dz = z - s.c[2];
    const m = p.inv;
    if (m) {
      const lx = m[0] * dx + m[1] * dy + m[2] * dz;
      const ly = m[3] * dx + m[4] * dy + m[5] * dz;
      const lz = m[6] * dx + m[7] * dy + m[8] * dz;
      dx = lx;
      dy = ly;
      dz = lz;
    }
    d = s.kind === "ellipsoid" ? sdEllipsoid(dx, dy, dz, s.r) : sdRoundBox(dx, dy, dz, s.h, s.round);
  }
  if (p.wool && !noWool) {
    const f = p.woolFreq ?? 14;
    // Two octaves, biased outward: fleece puffs out of the base shape more than it dents into it.
    const n = noise3(x * f, y * f, z * f) * 0.65 + noise3(x * f * 2.3 + 7, y * f * 2.3, z * f * 2.3) * 0.35;
    d -= p.wool * (0.55 + 0.45 * n);
  }
  return d;
}

function shapeBounds(s: Shape): { min: Vec3; max: Vec3 } {
  if (s.kind === "cone") {
    const r = Math.max(s.ra, s.rb);
    return {
      min: [Math.min(s.a[0], s.b[0]) - r, Math.min(s.a[1], s.b[1]) - r, Math.min(s.a[2], s.b[2]) - r],
      max: [Math.max(s.a[0], s.b[0]) + r, Math.max(s.a[1], s.b[1]) + r, Math.max(s.a[2], s.b[2]) + r],
    };
  }
  // Rotated ellipsoid / box: bound by the circumscribed sphere of the box (cheap and safe).
  const e = s.kind === "ellipsoid" ? s.r : s.h;
  const r = s.rot ? Math.hypot(e[0], e[1], e[2]) : 0;
  const ex: Vec3 = s.rot ? [r, r, r] : [e[0], e[1], e[2]];
  return {
    min: [s.c[0] - ex[0], s.c[1] - ex[1], s.c[2] - ex[2]],
    max: [s.c[0] + ex[0], s.c[1] + ex[1], s.c[2] + ex[2]],
  };
}

export function prepare(prims: readonly Prim[]): PreparedPrim[] {
  return prims.map((p) => {
    const b = shapeBounds(p.shape);
    const pad = p.blend + (p.wool ?? 0) * 1.2;
    const rot = p.shape.kind === "cone" ? undefined : p.shape.rot;
    return {
      ...p,
      min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad],
      max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad],
      ...(rot ? { inv: transpose(rot) } : {}),
    };
  });
}

/** Bounds of the whole field (union of the primitives' padded boxes). */
export function fieldBounds(prims: readonly PreparedPrim[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.carve) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k] as number, p.min[k] as number);
      max[k] = Math.max(max[k] as number, p.max[k] as number);
    }
  }
  return { min, max };
}

/**
 * Field value at a point from a candidate list of primitive indices (in order: the union is order dependent
 * only inside blend radii). `dists`, when given, receives each candidate's own distance (skin weights, paint).
 */
export function fieldAt(
  prims: readonly PreparedPrim[],
  cand: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  dists?: Float32Array,
  noWool = false,
): number {
  let d = 1e9;
  for (let i = 0; i < cand.length; i++) {
    const idx = cand[i] as number;
    const p = prims[idx] as PreparedPrim;
    const di = primDistance(p, x, y, z, noWool);
    if (dists) dists[idx] = di;
    d = p.carve ? smax(d, -di, p.blend) : smin(d, di, p.blend);
  }
  return d;
}

/** Indices of the primitives whose padded bounds overlap the box [min, max]. */
export function candidates(prims: readonly PreparedPrim[], min: Vec3, max: Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i] as PreparedPrim;
    if (
      p.max[0] < min[0] ||
      p.min[0] > max[0] ||
      p.max[1] < min[1] ||
      p.min[1] > max[1] ||
      p.max[2] < min[2] ||
      p.min[2] > max[2]
    )
      continue;
    out.push(i);
  }
  return out;
}

/** Mirror a primitive across the x = 0 plane onto another bone (left → right limbs). */
export function mirrorX(p: Prim, bone: number): Prim {
  const m = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  const mr = (r?: Mat3): Mat3 | undefined =>
    r ? [r[0], -r[1], -r[2], -r[3], r[4], r[5], -r[6], r[7], r[8]] : undefined;
  const s = p.shape;
  let shape: Shape;
  if (s.kind === "cone") shape = { ...s, a: m(s.a), b: m(s.b) };
  else if (s.kind === "ellipsoid") {
    const rot = mr(s.rot);
    shape = { kind: "ellipsoid", c: m(s.c), r: s.r, ...(rot ? { rot } : {}) };
  } else {
    const rot = mr(s.rot);
    shape = { kind: "box", c: m(s.c), h: s.h, round: s.round, ...(rot ? { rot } : {}) };
  }
  return { ...p, shape, bone };
}
