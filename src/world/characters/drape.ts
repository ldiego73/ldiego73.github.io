/**
 * Clothing and hair that sit ON a body: helpers that read the body field (./sdf.ts) to shrink-wrap a surface
 * over it.
 *
 *  - `drape`: a cloth shell (poncho, pollera, lliclla) as rings around a vertical axis. Each ring point starts
 *    at the ring above it (cloth cannot tuck inward under its own weight), marches outward until it clears
 *    the body by a thickness, then flares a little; pleats ripple the radius toward the hem. The rows are
 *    the grid rows of ./loft.ts, so the shell has seam-free normals and natural UVs (u around, v down).
 *  - `hug`: a lock or a braid that follows the head or the back at an offset (the path is pushed out of the
 *    field point by point).
 *
 * Pure (no DOM, no Three).
 */
import { type Grid, grid } from "./loft";
import { fieldAt, type PreparedPrim, type Vec3 } from "./sdf";

export type Field = (x: number, y: number, z: number) => number;

export function makeField(prims: readonly PreparedPrim[]): Field {
  const all = prims.map((_, i) => i);
  return (x, y, z) => fieldAt(prims, all, x, y, z);
}

/** Field gradient (unit) by central differences. */
export function fieldNormal(f: Field, p: Vec3, e = 0.004): Vec3 {
  const gx = f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]);
  const gy = f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]);
  const gz = f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

/** Moves p along the field gradient until the field reads `off` (a point `off` above the surface). */
export function toOffset(f: Field, p: Vec3, off: number, iters = 6): Vec3 {
  let q: Vec3 = [p[0], p[1], p[2]];
  for (let i = 0; i < iters; i++) {
    const d = f(q[0], q[1], q[2]) - off;
    if (Math.abs(d) < 1e-4) break;
    const n = fieldNormal(f, q);
    q = [q[0] - n[0] * d, q[1] - n[1] * d, q[2] - n[2] * d];
  }
  return q;
}

/** Pushes p outward along the field gradient only if it is closer than `off` (never pulls it in). */
export function pushOut(f: Field, p: Vec3, off: number): Vec3 {
  const d = f(p[0], p[1], p[2]);
  if (d >= off) return p;
  return toOffset(f, p, off);
}

export interface DrapeOpts {
  rows: number;
  cols: number;
  /** Ring height at row s (0 top … 1 hem) and angle a (0 = front +Z, π/2 = left +X). */
  y(s: number, a: number): number;
  /** Ring centre (x, z) at a height (default the axis). */
  centre?(y: number): [number, number];
  /** Smallest radius a ring may have at row s (neck opening, waist). */
  r0(s: number, a: number): number;
  /** Clearance over the body. */
  off: number;
  /** Radius gained per unit of drop once the cloth hangs (bell / poncho flare). */
  flare: number;
  /** Extra radius (pleats, folds) at row s, angle a. */
  ripple?(s: number, a: number): number;
  /** Angle span of row s: [from, to] (default the full ring, closed). Partial rows make open cloth (lliclla). */
  span?(s: number): [number, number];
}

/** Radii of every grid point (rows × cols), computed top-down so each ring hangs from the one above. */
export function drapeRadii(f: Field, o: DrapeOpts): Float32Array {
  const R = new Float32Array(o.rows * o.cols);
  const ang = (s: number, c: number) => angleAt(o, s, c);
  for (let r = 0; r < o.rows; r++) {
    const s = o.rows > 1 ? r / (o.rows - 1) : 0;
    for (let c = 0; c < o.cols; c++) {
      const a = ang(s, c);
      const y = o.y(s, a);
      const [cx, cz] = o.centre?.(y) ?? [0, 0];
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let rad = o.r0(s, a);
      if (r > 0) {
        const above = R[(r - 1) * o.cols + c] as number;
        const dy = Math.max(0, o.y((r - 1) / (o.rows - 1), a) - y);
        rad = Math.max(rad, above + o.flare * dy);
      }
      // March outward until the point clears the body (a few sphere-tracing steps).
      for (let i = 0; i < 24; i++) {
        const d = f(cx + dx * rad, y, cz + dz * rad);
        if (d >= o.off) break;
        rad += Math.max(0.002, o.off - d);
      }
      R[r * o.cols + c] = rad;
    }
  }
  return R;
}

function angleAt(o: DrapeOpts, s: number, c: number) {
  if (!o.span) return (c / o.cols) * Math.PI * 2;
  const [a0, a1] = o.span(s);
  return a0 + ((a1 - a0) * c) / (o.cols - 1);
}

/** The draped shell as a grid (closed ring unless `span` is given). */
export function drape(
  f: Field,
  o: DrapeOpts,
): { grid: Grid; radii: Float32Array; angle(r: number, c: number): number } {
  const R = drapeRadii(f, o);
  const closed = !o.span;
  const angle = (r: number, c: number) => angleAt(o, o.rows > 1 ? r / (o.rows - 1) : 0, c);
  const g = grid(
    o.rows,
    o.cols,
    (r, c) => {
      const s = o.rows > 1 ? r / (o.rows - 1) : 0;
      const a = angle(r, c);
      const y = o.y(s, a);
      const [cx, cz] = o.centre?.(y) ?? [0, 0];
      const rad = (R[r * o.cols + c] as number) + (o.ripple?.(s, a) ?? 0);
      return [cx + Math.sin(a) * rad, y, cz + Math.cos(a) * rad];
    },
    { closed, flip: true },
  );
  return { grid: g, radii: R, angle };
}

/**
 * A path that hugs the field at `off`: start point, then steps of `step` along `dir(i)` (e.g. down and a little
 * out), each re-pushed out of the body. Used for hair locks and braids.
 */
export function hugPath(
  f: Field,
  start: Vec3,
  n: number,
  step: number,
  dir: (i: number, p: Vec3) => Vec3,
  off: number,
): Vec3[] {
  const out: Vec3[] = [pushOut(f, start, off)];
  for (let i = 1; i < n; i++) {
    const p = out[i - 1] as Vec3;
    const d = dir(i, p);
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    out.push(pushOut(f, [p[0] + (d[0] / l) * step, p[1] + (d[1] / l) * step, p[2] + (d[2] / l) * step], off));
  }
  return out;
}

export interface ArcDrapeOpts {
  rows: number;
  cols: number;
  /** Where column a starts (the neck or waist ring) and which way the cloth leaves it. */
  start(a: number): Vec3;
  dir0(a: number): Vec3;
  /** Clearance over the body. */
  off: number;
  /** Step length (units) and how fast the direction turns toward straight down per step (0..1). */
  ds: number;
  gravity: number;
  /** Outward drift per step once the cloth hangs free (a flared hem). */
  flare: number;
  /** True when the column has reached its hem. */
  stop(a: number, p: Vec3, length: number): boolean;
  /** Extra outward offset (folds) at arc fraction s and angle a. */
  ripple?(s: number, a: number): number;
  /** Angle span of the columns (default the full ring, closed). */
  span?: [number, number];
}

/**
 * Cloth that hangs like cloth: every column leaves its start ring, slides over whatever body is under it (pushed
 * out to the clearance) and turns toward straight down step by step, drifting outward a little once free. The
 * column is then resampled at even arc length, so the rows follow the cloth (bands stay parallel to the hem and
 * a rounded shoulder has as many rows as the fall). Used for the poncho over shoulders and arms, the lliclla.
 */
export function drapeArc(f: Field, o: ArcDrapeOpts): { grid: Grid; angle(c: number): number } {
  const closed = !o.span;
  const angle = (c: number) => {
    if (!o.span) return (c / o.cols) * Math.PI * 2;
    return o.span[0] + ((o.span[1] - o.span[0]) * c) / (o.cols - 1);
  };
  const cols: Vec3[][] = [];
  for (let c = 0; c < o.cols; c++) {
    const a = angle(c);
    const out: Vec3 = [Math.sin(a), 0, Math.cos(a)];
    let p = pushOut(f, o.start(a), o.off);
    let d = norm3(o.dir0(a));
    const path: Vec3[] = [p];
    const lens: number[] = [0];
    let len = 0;
    for (let i = 0; i < 400; i++) {
      let q: Vec3 = [p[0] + d[0] * o.ds, p[1] + d[1] * o.ds, p[2] + d[2] * o.ds];
      const touching = f(q[0], q[1], q[2]) < o.off;
      q = pushOut(f, q, o.off);
      const step = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || o.ds;
      // New heading: where we actually went, bent toward gravity (and outward once hanging free).
      d = norm3([
        (q[0] - p[0]) / step + (touching ? 0 : out[0] * o.flare),
        (q[1] - p[1]) / step - o.gravity,
        (q[2] - p[2]) / step + (touching ? 0 : out[2] * o.flare),
      ]);
      len += step;
      p = q;
      path.push(p);
      lens.push(len);
      if (o.stop(a, p, len)) break;
    }
    // Resample at even arc length.
    const col: Vec3[] = [];
    let k = 0;
    for (let r = 0; r < o.rows; r++) {
      const target = (r / (o.rows - 1)) * len;
      while (k < lens.length - 2 && (lens[k + 1] as number) < target) k++;
      const l0 = lens[k] as number;
      const l1 = lens[k + 1] ?? l0;
      const t = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
      const a0 = path[k] as Vec3;
      const a1 = path[k + 1] ?? a0;
      const s = r / (o.rows - 1);
      const rip = o.ripple?.(s, a) ?? 0;
      col.push([
        a0[0] + (a1[0] - a0[0]) * t + out[0] * rip,
        a0[1] + (a1[1] - a0[1]) * t,
        a0[2] + (a1[2] - a0[2]) * t + out[2] * rip,
      ]);
    }
    cols.push(col);
  }
  const g = grid(o.rows, o.cols, (r, c) => (cols[c] as Vec3[])[r] as Vec3, { closed, flip: true });
  return { grid: g, angle };
}

const norm3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
