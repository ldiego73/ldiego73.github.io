/**
 * Polygonises a character field (./sdf.ts) into one smooth, watertight triangle mesh with Surface Nets, then
 * snaps every vertex onto the true surface and takes its normal from the field gradient.
 *
 * Why Surface Nets (and not marching cubes): one vertex per surface cell gives an even, quad-dominant mesh with
 * about half the triangles of marching cubes and no slivers, and the vertex sharing is implicit (no hash of
 * edge points). The projection step afterwards (Newton along the gradient) puts vertices on the real surface,
 * so thin features (fingers, ears) keep their size, and gradient normals shade like a sculpt: no faceting, so
 * the ink pass sees only the silhouette and real folds.
 *
 * Cost control: the grid is evaluated in 8³ bricks; a brick's centre value decides whether the surface can pass
 * through it at all (the field is close to 1-Lipschitz), so only the thin shell of bricks around the surface is
 * evaluated point by point, each against the few primitives whose bounds reach it.
 *
 * Pure (no DOM, no Three).
 */
import { candidates, fieldAt, fieldBounds, type PreparedPrim, primDistance, type Vec3 } from "./sdf";

export interface Polygonised {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Per vertex: the K nearest primitives (index, −1 when none) and their own distances. */
  near: Int16Array;
  nearD: Float32Array;
  /** K used for `near` / `nearD`. */
  k: number;
  /** Grid points evaluated (dev stats). */
  evals: number;
}

const B = 6;
export const NEAR_K = 6;

/**
 * `woolNormal` (0..1): how much of the wool's lumps the shading normal keeps. 1 = the true surface normal; lower
 * values light the fleece like its smooth base shape (big soft cel bands) while the silhouette stays lumpy.
 */
export function polygonise(prims: readonly PreparedPrim[], h: number, woolNormal = 1): Polygonised {
  const fb = fieldBounds(prims);
  const pad = h * 2;
  const o: Vec3 = [fb.min[0] - pad, fb.min[1] - pad, fb.min[2] - pad];
  const nx = Math.ceil((fb.max[0] + pad - o[0]) / h) + 1;
  const ny = Math.ceil((fb.max[1] + pad - o[1]) / h) + 1;
  const nz = Math.ceil((fb.max[2] + pad - o[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);
  const brickCand: number[][] = new Array(bx * by * bz);
  /** 1 when a brick was filled with one value (no surface can cross its interior cells). */
  const brickFlat = new Uint8Array(bx * by * bz);
  let evals = 0;

  for (let kb = 0; kb < bz; kb++)
    for (let jb = 0; jb < by; jb++)
      for (let ib = 0; ib < bx; ib++) {
        const i0 = ib * B;
        const j0 = jb * B;
        const k0 = kb * B;
        const i1 = Math.min(i0 + B, nx);
        const j1 = Math.min(j0 + B, ny);
        const k1 = Math.min(k0 + B, nz);
        const min: Vec3 = [o[0] + i0 * h - h, o[1] + j0 * h - h, o[2] + k0 * h - h];
        const max: Vec3 = [o[0] + (i1 - 1) * h + h, o[1] + (j1 - 1) * h + h, o[2] + (k1 - 1) * h + h];
        const cand = candidates(prims, min, max);
        brickCand[ib + bx * (jb + by * kb)] = cand;
        let fill = Number.NaN;
        if (!cand.length) fill = h * 8;
        else {
          // Coarse test at the brick centre: if the surface cannot reach any point of the brick, fill it.
          const cx = (min[0] + max[0]) / 2;
          const cy = (min[1] + max[1]) / 2;
          const cz = (min[2] + max[2]) / 2;
          const half = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
          const fc = fieldAt(prims, cand, cx, cy, cz);
          evals++;
          // 1.35: slack for the ellipsoid bound and wool noise, which are not exactly 1-Lipschitz.
          if (Math.abs(fc) > half * 1.35 + h) fill = fc;
        }
        if (!Number.isNaN(fill)) brickFlat[ib + bx * (jb + by * kb)] = 1;
        for (let k = k0; k < k1; k++)
          for (let j = j0; j < j1; j++)
            for (let i = i0; i < i1; i++) {
              if (!Number.isNaN(fill)) {
                val[id(i, j, k)] = fill;
                continue;
              }
              val[id(i, j, k)] = fieldAt(prims, cand, o[0] + i * h, o[1] + j * h, o[2] + k * h);
              evals++;
            }
      }

  // ---------------------------------------------------------------- one vertex per surface cell
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  let pos = new Float32Array(4096 * 3);
  let cellOf = new Int32Array(4096 * 3);
  let nvert = 0;
  const corner = new Float32Array(8);
  // Cube edges as pairs of corner indices (corner bit 0 = +x, 1 = +y, 2 = +z).
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        // Cells wholly inside a filled brick have one sign at all 8 corners: skip without reading them.
        const ir = i % B;
        if (ir < B - 1 && j % B < B - 1 && k % B < B - 1) {
          if (brickFlat[Math.floor(i / B) + bx * (Math.floor(j / B) + by * Math.floor(k / B))]) {
            i += B - 2 - ir;
            continue;
          }
        }
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = val[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))] as number;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e] as number;
          const b = EDGES[e + 1] as number;
          const va = corner[a] as number;
          const vb = corner[b] as number;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        if (nvert * 3 + 3 > pos.length) {
          const p2 = new Float32Array(pos.length * 2);
          p2.set(pos);
          pos = p2;
          const c2 = new Int32Array(cellOf.length * 2);
          c2.set(cellOf);
          cellOf = c2;
        }
        cellVert[i + cx * (j + cy * k)] = nvert;
        pos[nvert * 3] = o[0] + (i + sx / n) * h;
        pos[nvert * 3 + 1] = o[1] + (j + sy / n) * h;
        pos[nvert * 3 + 2] = o[2] + (k + sz / n) * h;
        cellOf[nvert * 3] = i;
        cellOf[nvert * 3 + 1] = j;
        cellOf[nvert * 3 + 2] = k;
        nvert++;
      }

  // ---------------------------------------------------------------- quads around sign-changing grid edges
  const idx: number[] = [];
  const cell = (i: number, j: number, k: number) => cellVert[i + cx * (j + cy * k)] as number;
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      const t = b;
      b = d;
      d = t;
    }
    // Split along the shorter diagonal (fewer long thin triangles on curved limbs).
    const dac = dist2(pos, a, c);
    const dbd = dist2(pos, b, d);
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = val[id(i, j, k)] as number;
        if (i < cx && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const v1 = val[id(i + 1, j, k)] as number;
          if (v0 < 0 !== v1 < 0)
            quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !(v0 < 0));
        }
        if (j < cy && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const v1 = val[id(i, j + 1, k)] as number;
          if (v0 < 0 !== v1 < 0)
            quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !(v0 < 0));
        }
        if (k < cz && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const v1 = val[id(i, j, k + 1)] as number;
          if (v0 < 0 !== v1 < 0)
            quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !(v0 < 0));
        }
      }

  // ---------------------------------------------------------------- snap to the surface, gradient normals
  const nv = nvert;
  const positions = pos.slice(0, nv * 3);
  const normals = new Float32Array(nv * 3);
  const near = new Int16Array(nv * NEAR_K).fill(-1);
  const nearD = new Float32Array(nv * NEAR_K).fill(1e9);
  const e = h * 0.2;
  const grad = (cand: number[], x: number, y: number, z: number, out: Vec3, noWool = false) => {
    // Tetrahedral gradient: 4 evaluations.
    const a = fieldAt(prims, cand, x + e, y - e, z - e, undefined, noWool);
    const b = fieldAt(prims, cand, x - e, y - e, z + e, undefined, noWool);
    const c = fieldAt(prims, cand, x - e, y + e, z - e, undefined, noWool);
    const d = fieldAt(prims, cand, x + e, y + e, z + e, undefined, noWool);
    const s = 1 / (4 * e);
    out[0] = (a - b - c + d) * s;
    out[1] = (-a - b + c + d) * s;
    out[2] = (-a + b - c + d) * s;
  };
  const g: Vec3 = [0, 0, 0];
  const g2: Vec3 = [0, 0, 0];
  const local: number[] = [];
  for (let v = 0; v < nv; v++) {
    const i = cellOf[v * 3] as number;
    const j = cellOf[v * 3 + 1] as number;
    const k = cellOf[v * 3 + 2] as number;
    const brick = brickCand[Math.floor(i / B) + bx * (Math.floor(j / B) + by * Math.floor(k / B))] as number[];
    let x = positions[v * 3] as number;
    let y = positions[v * 3 + 1] as number;
    let z = positions[v * 3 + 2] as number;
    // Only the primitives whose padded bounds hold this vertex (± a cell) can shape the surface here.
    local.length = 0;
    const m = h * 1.5;
    for (const c of brick) {
      const p = prims[c] as PreparedPrim;
      if (
        x < p.min[0] - m ||
        x > p.max[0] + m ||
        y < p.min[1] - m ||
        y > p.max[1] + m ||
        z < p.min[2] - m ||
        z > p.max[2] + m
      )
        continue;
      local.push(c);
    }
    const cand = local.length ? local : brick;
    // One Newton step along the gradient.
    const f = fieldAt(prims, cand, x, y, z);
    grad(cand, x, y, z, g);
    const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (gl2 > 1e-12 && Math.abs(f) > h * 0.005) {
      let sx = (f * g[0]) / gl2;
      let sy = (f * g[1]) / gl2;
      let sz = (f * g[2]) / gl2;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      // Never jump more than half a cell (thin features would snap onto the wrong side).
      if (sl > h * 0.5) {
        const sc = (h * 0.5) / sl;
        sx *= sc;
        sy *= sc;
        sz *= sc;
      }
      // The step is under half a cell: the gradient taken before it serves as the normal (saves 4 evaluations).
      x -= sx;
      y -= sy;
      z -= sz;
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    let gl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1;
    let nx = g[0] / gl;
    let ny = g[1] / gl;
    let nz = g[2] / gl;
    if (woolNormal < 1 && hasWool(prims, cand)) {
      grad(cand, x, y, z, g2, true);
      const l2 = Math.sqrt(g2[0] * g2[0] + g2[1] * g2[1] + g2[2] * g2[2]) || 1;
      nx = nx * woolNormal + (g2[0] / l2) * (1 - woolNormal);
      ny = ny * woolNormal + (g2[1] / l2) * (1 - woolNormal);
      nz = nz * woolNormal + (g2[2] / l2) * (1 - woolNormal);
      gl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= gl;
      ny /= gl;
      nz /= gl;
    }
    normals[v * 3] = nx;
    normals[v * 3 + 1] = ny;
    normals[v * 3 + 2] = nz;
    // The K nearest (additive) primitives: skin weights and paint regions read them.
    for (const c of cand) {
      const p = prims[c] as PreparedPrim;
      if (p.carve) continue;
      insertNear(near, nearD, v, c, primDistance(p, x, y, z));
    }
  }
  return { positions, normals, indices: new Uint32Array(idx), near, nearD, k: NEAR_K, evals };
}

const hasWool = (prims: readonly PreparedPrim[], cand: number[]) => {
  for (const c of cand) if ((prims[c] as PreparedPrim).wool) return true;
  return false;
};

function dist2(p: Float32Array, a: number, b: number) {
  const dx = (p[a * 3] as number) - (p[b * 3] as number);
  const dy = (p[a * 3 + 1] as number) - (p[b * 3 + 1] as number);
  const dz = (p[a * 3 + 2] as number) - (p[b * 3 + 2] as number);
  return dx * dx + dy * dy + dz * dz;
}

/** Sorted insertion into the vertex's K-nearest list. */
function insertNear(near: Int16Array, nearD: Float32Array, v: number, c: number, d: number) {
  const base = v * NEAR_K;
  if (d >= (nearD[base + NEAR_K - 1] as number)) return;
  let s = NEAR_K - 1;
  while (s > 0 && (nearD[base + s - 1] as number) > d) {
    near[base + s] = near[base + s - 1] as number;
    nearD[base + s] = nearD[base + s - 1] as number;
    s--;
  }
  near[base + s] = c;
  nearD[base + s] = d;
}
