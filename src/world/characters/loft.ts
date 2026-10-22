/**
 * Lofted surfaces for the parts that are not body: hair locks, braids, cords, hat brims and the cloth shells
 * (poncho, pollera, lliclla). Everything is a grid of rows × columns of points with analytic, seam-free normals
 * (central differences across the grid, wrapping around closed rings), so a closed tube or a skirt shows no
 * shading seam and the ink sees no crease where the UV seam is.
 *
 * Also the radius profiles that make limbs, locks and braids taper smoothly (`taper`, `profile`).
 *
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "./sdf";

export interface Grid {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  rows: number;
  cols: number;
}

// ---------------------------------------------------------------- profiles

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Radius from r0 at t = 0 to r1 at t = 1, eased with `power` (> 1 keeps it thick longer, then tapers). */
export function taper(t: number, r0: number, r1: number, power = 1) {
  const u = clamp01(t) ** power;
  return r0 + (r1 - r0) * u;
}

/**
 * Smooth radius profile through control points [(t, r)…] (t increasing, 0..1): monotone cubic (Fritsch–Carlson),
 * so the radius never overshoots between keys (no bulges a sculptor didn't put there).
 */
export function profile(keys: ReadonlyArray<readonly [number, number]>): (t: number) => number {
  const n = keys.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => (keys[0] as readonly [number, number])[1];
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++)
    d.push(((ys[i + 1] as number) - (ys[i] as number)) / ((xs[i + 1] as number) - (xs[i] as number)));
  m[0] = d[0] as number;
  m[n - 1] = d[n - 2] as number;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1] as number;
    const b = d[i] as number;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const di = d[i] as number;
    if (di === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] as number) / di;
    const b = (m[i + 1] as number) / di;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * di;
      m[i + 1] = t * b * di;
    }
  }
  return (t: number) => {
    if (t <= (xs[0] as number)) return ys[0] as number;
    if (t >= (xs[n - 1] as number)) return ys[n - 1] as number;
    let i = 0;
    while (i < n - 2 && t > (xs[i + 1] as number)) i++;
    const x0 = xs[i] as number;
    const h = (xs[i + 1] as number) - x0;
    const s = (t - x0) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * (ys[i] as number) +
      (s3 - 2 * s2 + s) * h * (m[i] as number) +
      (-2 * s3 + 3 * s2) * (ys[i + 1] as number) +
      (s3 - s2) * h * (m[i + 1] as number)
    );
  };
}

// ---------------------------------------------------------------- grids

/**
 * A rows × cols grid of points P(row, col). `closed` wraps the columns into a ring (the last column is a copy of
 * the first for the UVs; normals treat them as one). Normals point along (∂P/∂col × ∂P/∂row) × `flip`.
 */
export function grid(
  rows: number,
  cols: number,
  at: (r: number, c: number) => Vec3,
  o: { closed?: boolean; flip?: boolean } = {},
): Grid {
  const closed = !!o.closed;
  const cc = closed ? cols + 1 : cols;
  const pts: Vec3[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push(at(r, c));
  const P = (r: number, c: number) => {
    const rr = Math.min(rows - 1, Math.max(0, r));
    let ci = c;
    if (closed) ci = ((c % cols) + cols) % cols;
    else ci = Math.min(cols - 1, Math.max(0, c));
    return pts[rr * cols + ci] as Vec3;
  };
  const positions = new Float32Array(rows * cc * 3);
  const normals = new Float32Array(rows * cc * 3);
  const uvs = new Float32Array(rows * cc * 2);
  const sgn = o.flip ? -1 : 1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cc; c++) {
      const p = P(r, c);
      const i = r * cc + c;
      positions.set(p, i * 3);
      const a = P(r, c + 1);
      const b = P(r, c - 1);
      const u = P(r + 1, c);
      const d = P(r - 1, c);
      let tx = a[0] - b[0];
      let ty = a[1] - b[1];
      let tz = a[2] - b[2];
      let sx = u[0] - d[0];
      let sy = u[1] - d[1];
      let sz = u[2] - d[2];
      // Degenerate rows (a tube's pointed tip): fall back to the neighbouring row's tangent.
      if (tx * tx + ty * ty + tz * tz < 1e-14) {
        const r2 = r === 0 ? 1 : r - 1;
        const a2 = P(r2, c + 1);
        const b2 = P(r2, c - 1);
        tx = a2[0] - b2[0];
        ty = a2[1] - b2[1];
        tz = a2[2] - b2[2];
      }
      if (sx * sx + sy * sy + sz * sz < 1e-14) {
        sx = 0;
        sy = 1;
        sz = 0;
      }
      let nx = (ty * sz - tz * sy) * sgn;
      let ny = (tz * sx - tx * sz) * sgn;
      let nz = (tx * sy - ty * sx) * sgn;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
      uvs[i * 2] = c / (cc - 1);
      uvs[i * 2 + 1] = rows > 1 ? r / (rows - 1) : 0;
    }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cc - 1; c++) {
      const a = r * cc + c;
      const b = a + 1;
      const d = a + cc;
      const e = d + 1;
      // Winding matches the normals above: (col × row) unflipped.
      if (o.flip) idx.push(a, d, b, b, d, e);
      else idx.push(a, b, d, b, e, d);
    }
  return { positions, normals, uvs, indices: new Uint32Array(idx), rows, cols: cc };
}

/** Parallel-transport frames along a polyline (no twist flips on curved locks and braids). */
export function frames(path: readonly Vec3[], up: Vec3 = [0, 0, 1]) {
  const n = path.length;
  const T: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)] as Vec3;
    const b = path[Math.min(n - 1, i + 1)] as Vec3;
    T.push(norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
  }
  const N: Vec3[] = [];
  const Bn: Vec3[] = [];
  let nrm = norm(cross(cross(T[0] as Vec3, up), T[0] as Vec3));
  if (!Number.isFinite(nrm[0]) || Math.hypot(...nrm) < 0.5) nrm = norm(cross(T[0] as Vec3, [1, 0, 0]));
  for (let i = 0; i < n; i++) {
    const t = T[i] as Vec3;
    if (i > 0) {
      // Remove the tangent component and renormalise (transport the previous normal).
      const d = dot(nrm, t);
      nrm = norm([nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d]);
    }
    N.push(nrm);
    Bn.push(cross(t, nrm));
  }
  return { T, N, B: Bn };
}

/**
 * A tube along `path` with radius r(t) (t = 0..1 along the path), `segs` sides, flattened across by `flat`
 * (1 round, 0.4 a ribbon-like lock) in the frame's normal direction. A zero radius at the end makes a point.
 * The start is capped with a fan unless its radius is zero.
 */
export function tube(
  path: readonly Vec3[],
  r: (t: number) => number,
  segs: number,
  o: { flat?: number; up?: Vec3; twist?: number } = {},
): Grid {
  const f = frames(path, o.up);
  const flat = o.flat ?? 1;
  const n = path.length;
  const g = grid(
    n,
    segs,
    (row, c) => {
      const t = n > 1 ? row / (n - 1) : 0;
      const a = (c / segs) * Math.PI * 2 + (o.twist ?? 0) * t;
      const rad = r(t);
      const p = path[row] as Vec3;
      const N = f.N[row] as Vec3;
      const Bv = f.B[row] as Vec3;
      const cx = Math.cos(a) * rad * flat;
      const cy = Math.sin(a) * rad;
      return [p[0] + N[0] * cx + Bv[0] * cy, p[1] + N[1] * cx + Bv[1] * cy, p[2] + N[2] * cx + Bv[2] * cy];
    },
    { closed: true },
  );
  if (r(0) <= 1e-5) return g;
  return capStart(g, path[0] as Vec3, f.T[0] as Vec3);
}

/** Adds a fan cap over the first ring of a closed grid (normal −tangent). */
function capStart(g: Grid, centre: Vec3, t: Vec3): Grid {
  const nv = g.positions.length / 3;
  const positions = new Float32Array((nv + 1) * 3);
  positions.set(g.positions);
  positions.set(centre, nv * 3);
  const normals = new Float32Array((nv + 1) * 3);
  normals.set(g.normals);
  normals.set([-t[0], -t[1], -t[2]], nv * 3);
  const uvs = new Float32Array((nv + 1) * 2);
  uvs.set(g.uvs);
  const idx = Array.from(g.indices);
  for (let c = 0; c < g.cols - 1; c++) idx.push(nv, c + 1, c);
  return { ...g, positions, normals, uvs, indices: new Uint32Array(idx) };
}

/**
 * Surface of revolution around +Y: profile points (radius, y) walked clockwise in the (radius right, y up)
 * plane — outward along a top, down an outer wall, inward along a bottom — so normals face out. Rows follow the
 * profile, columns go around. `squash` scales z (oval hats).
 */
export function lathe(prof: ReadonlyArray<readonly [number, number]>, segs: number, squash = 1): Grid {
  return grid(
    prof.length,
    segs,
    (r, c) => {
      const [rad, y] = prof[r] as readonly [number, number];
      const a = (c / segs) * Math.PI * 2;
      return [Math.sin(a) * rad, y, Math.cos(a) * rad * squash];
    },
    { closed: true, flip: true },
  );
}

/** Concatenates grids (indices offset). */
export function joinGrids(list: readonly Grid[]): Grid {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.positions.length / 3;
    ni += g.indices.length;
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const indices = new Uint32Array(ni);
  let v = 0;
  let i = 0;
  for (const g of list) {
    positions.set(g.positions, v * 3);
    normals.set(g.normals, v * 3);
    uvs.set(g.uvs, v * 2);
    for (let k = 0; k < g.indices.length; k++) indices[i + k] = (g.indices[k] as number) + v;
    v += g.positions.length / 3;
    i += g.indices.length;
  }
  return { positions, normals, uvs, indices, rows: 0, cols: 0 };
}

// ---------------------------------------------------------------- vec helpers

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Quadratic Bézier sampled into n points (curved locks, braids, ears). */
export function bezier(a: Vec3, c: Vec3, b: Vec3, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
    ]);
  }
  return out;
}
