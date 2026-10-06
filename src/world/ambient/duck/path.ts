/**
 * Water paths for the torrent ducks: a polyline with the exact water-surface height at each point
 * (sampled from the stream ribbon mesh, or a flat line across the waterfall pool), walked by arc length.
 * Pure (no three.js scene access) so it can be unit tested.
 */

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Unit downstream direction (xz). */
  tx: number;
  tz: number;
  /** dy/ds of the water surface (negative going downhill). */
  grade: number;
}

export interface WaterPath {
  /** Flat x, y, z per point (spring → downstream). */
  pts: Float32Array;
  /** Cumulative arc length (xz) per point. */
  s: Float32Array;
  length: number;
  sample(s: number, out: PathSample): PathSample;
  /** Lateral offset point: `lat` > 0 is to the right of the downstream direction. */
  at(s: number, lat: number, out: PathSample): PathSample;
}

export function makePath(xyz: ArrayLike<number>): WaterPath {
  const n = Math.floor(xyz.length / 3);
  const pts = Float32Array.from(xyz as ArrayLike<number>).subarray(0, n * 3);
  const s = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 3]! - pts[(i - 1) * 3]!;
    const dz = pts[i * 3 + 2]! - pts[(i - 1) * 3 + 2]!;
    s[i] = s[i - 1]! + Math.hypot(dx, dz);
  }
  const length = n > 0 ? s[n - 1]! : 0;
  const sample = (q: number, out: PathSample) => {
    if (n < 2) {
      out.x = pts[0] ?? 0;
      out.y = pts[1] ?? 0;
      out.z = pts[2] ?? 0;
      out.tx = 0;
      out.tz = 1;
      out.grade = 0;
      return out;
    }
    const c = Math.min(length, Math.max(0, q));
    // Binary search for the segment.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid]! <= c) lo = mid;
      else hi = mid;
    }
    const seg = s[hi]! - s[lo]! || 1;
    const f = (c - s[lo]!) / seg;
    const a = lo * 3;
    const b = hi * 3;
    out.x = pts[a]! + (pts[b]! - pts[a]!) * f;
    out.y = pts[a + 1]! + (pts[b + 1]! - pts[a + 1]!) * f;
    out.z = pts[a + 2]! + (pts[b + 2]! - pts[a + 2]!) * f;
    const dx = pts[b]! - pts[a]!;
    const dz = pts[b + 2]! - pts[a + 2]!;
    const l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l;
    out.tz = dz / l;
    out.grade = (pts[b + 1]! - pts[a + 1]!) / seg;
    return out;
  };
  return {
    pts,
    s,
    length,
    sample,
    at(q, lat, out) {
      sample(q, out);
      // Right of the downstream direction (+Y up): (-tz, tx).
      out.x += -out.tz * lat;
      out.z += out.tx * lat;
      return out;
    },
  };
}

/**
 * Centerline from a ribbon geometry's positions (vertex pairs: left, right per polyline point).
 * Returns flat x, y, z per point.
 */
export function ribbonCenterline(pos: ArrayLike<number>): Float32Array {
  const pairs = Math.floor(pos.length / 6);
  const out = new Float32Array(pairs * 3);
  for (let i = 0; i < pairs; i++) {
    const o = i * 6;
    out[i * 3] = (pos[o]! + pos[o + 3]!) / 2;
    out[i * 3 + 1] = (pos[o + 1]! + pos[o + 4]!) / 2;
    out[i * 3 + 2] = (pos[o + 2]! + pos[o + 5]!) / 2;
  }
  return out;
}

/** Arc length where `f(s)` first crosses `threshold` (walking from `from` by `step`, either sign). */
export function findCrossing(
  path: WaterPath,
  from: number,
  step: number,
  f: (s: number) => number,
  threshold: number,
): number | null {
  let prev = from;
  let pv = f(prev);
  for (let q = from + step; q >= 0 && q <= path.length; q += step) {
    const v = f(q);
    if ((pv - threshold) * (v - threshold) <= 0) {
      const k = Math.abs(v - pv) < 1e-6 ? 0 : (threshold - pv) / (v - pv);
      return prev + (q - prev) * k;
    }
    prev = q;
    pv = v;
  }
  return null;
}

/** The longest sub-interval of [a, b] whose surface |grade| stays under `max` (sampled every `step`). */
export function gentleRun(path: WaterPath, a: number, b: number, max: number, step = 0.1): [number, number] | null {
  const tmp: PathSample = { x: 0, y: 0, z: 0, tx: 0, tz: 1, grade: 0 };
  let best: [number, number] | null = null;
  let start = -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let q = lo; q <= hi + 1e-6; q += step) {
    const ok = Math.abs(path.sample(Math.min(q, hi), tmp).grade) < max;
    if (ok && start < 0) start = q;
    if ((!ok || q + step > hi + 1e-6) && start >= 0) {
      const end = ok ? Math.min(q, hi) : q - step;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = -1;
    }
  }
  return best && best[1] - best[0] > 0.3 ? best : null;
}
