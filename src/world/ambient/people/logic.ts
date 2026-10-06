/** Pure helpers for the people simulation (schedules, steering, terrace treads, flee targets). Unit-tested. */

/** Signed shortest difference b - a on the 0..1 day circle. */
export function dayDiff(a: number, b: number) {
  let d = (b - a) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

/** True when the clock moved more than a frame plausibly allows (T key, dev setTime): snap, don't walk. */
export function jumped(prev: number, cur: number, dt: number) {
  // The fastest natural day cycle is minutes long; anything over ~1/200 of a day in one frame is a jump.
  return Math.abs(dayDiff(prev, cur)) > Math.max(0.005, dt * 0.01);
}

/** Is `time` (0..1, 0.25 sunrise, 0.75 sunset) within the [from, to] window? */
export function within(time: number, from: number, to: number) {
  const t = ((time % 1) + 1) % 1;
  return from <= to ? t >= from && t <= to : t >= from || t <= to;
}

/** Working hours on the andenes: from just after sunrise to just before sunset. */
export const WORK: [number, number] = [0.27, 0.725];
/** Market hours at the feria. */
export const MARKET: [number, number] = [0.29, 0.71];
/** Children play outside. */
export const PLAY: [number, number] = [0.3, 0.7];
/** The couple by the night fire. */
export const FIRE: [number, number] = [0.77, 0.2];

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/**
 * Steering: desired unit direction (dx, dz) bent away from obstacles in front within `look` units.
 * Returns the new unit direction in `out`. Bodies behind or off to the side are ignored, so people walk
 * around each other early instead of being pushed.
 */
export function steer(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  obstacles: ArrayLike<Obstacle>,
  look: number,
  out: { x: number; z: number },
) {
  let ax = 0;
  let az = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i] as Obstacle;
    const ox = o.x - x;
    const oz = o.z - z;
    const along = ox * dx + oz * dz;
    if (along <= 0 || along > look + o.r) continue;
    const lat = ox * -dz + oz * dx;
    const clear = r + o.r + 0.25;
    if (Math.abs(lat) >= clear) continue;
    // Turn away from the obstacle's side, harder the closer and more central it is.
    const k = (1 - along / (look + o.r)) * (1 - Math.abs(lat) / clear);
    const s = lat >= 0 ? -1 : 1;
    ax += -dz * s * k * 1.6;
    az += dx * s * k * 1.6;
  }
  let nx = dx + ax;
  let nz = dz + az;
  const l = Math.hypot(nx, nz);
  if (l < 1e-6) {
    nx = -dz;
    nz = dx;
  } else {
    nx /= l;
    nz /= l;
  }
  out.x = nx;
  out.z = nz;
  return out;
}

/** Where a child runs when the traveler comes close: away from them, kept inside the play area (+margin). */
export function fleeTarget(
  px: number,
  pz: number,
  ax: number,
  az: number,
  cx: number,
  cz: number,
  R: number,
  dist: number,
  out: { x: number; z: number },
) {
  let dx = px - ax;
  let dz = pz - az;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  let tx = px + dx * dist;
  let tz = pz + dz * dist;
  const ox = tx - cx;
  const oz = tz - cz;
  const ol = Math.hypot(ox, oz);
  if (ol > R) {
    tx = cx + (ox / ol) * R;
    tz = cz + (oz / ol) * R;
  }
  out.x = tx;
  out.z = tz;
  return out;
}

export interface Tread {
  /** Polyline along the terrace flat: [x, z] pairs. */
  pts: number[];
  /** Ground height of the tread. */
  y: number;
  length: number;
}

/**
 * Walk along a terrace tread (contour line) from (x, z) in both directions, keeping to ground within
 * `tol` of the start height and where `ok(x, z)` holds (open grass, not the riser). Returns null when
 * the flat is shorter than `minLen`.
 */
export function findTread(
  heightAt: (x: number, z: number) => number,
  ok: (x: number, z: number) => boolean,
  x: number,
  z: number,
  opts: { step?: number; maxLen?: number; minLen?: number; tol?: number } = {},
): Tread | null {
  const step = opts.step ?? 0.6;
  const maxLen = opts.maxLen ?? 14;
  const minLen = opts.minLen ?? 6;
  const tol = opts.tol ?? 0.22;
  const y0 = heightAt(x, z);
  if (!ok(x, z)) return null;
  // Sampled wider than a tread so the risers give the macro slope (a flat alone has no gradient).
  const grad = (px: number, pz: number) => {
    const e = 2;
    const gx = (heightAt(px + e, pz) - heightAt(px - e, pz)) / (2 * e);
    const gz = (heightAt(px, pz + e) - heightAt(px, pz - e)) / (2 * e);
    return [gx, gz] as const;
  };
  const walk = (sign: number) => {
    const out: number[] = [];
    let cx = x;
    let cz = z;
    let hx = 0;
    let hz = 0;
    for (let i = 0; i < maxLen / 2 / step; i++) {
      // Contour direction: perpendicular to the gradient of the *macro* slope (sampled wider than a tread).
      const [gx, gz] = grad(cx, cz);
      let tx = -gz;
      let tz = gx;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-4) {
        tx = hx || 1;
        tz = hz;
      } else {
        tx /= tl;
        tz /= tl;
      }
      if (i === 0) {
        tx *= sign;
        tz *= sign;
      } else if (tx * hx + tz * hz < 0) {
        tx = -tx;
        tz = -tz;
      }
      const nx = cx + tx * step;
      const nz = cz + tz * step;
      if (Math.abs(heightAt(nx, nz) - y0) > tol || !ok(nx, nz)) break;
      cx = nx;
      cz = nz;
      hx = tx;
      hz = tz;
      out.push(cx, cz);
    }
    return out;
  };
  const a = walk(1);
  const b = walk(-1);
  const pts: number[] = [];
  for (let i = b.length - 2; i >= 0; i -= 2) pts.push(b[i] as number, b[i + 1] as number);
  pts.push(x, z);
  pts.push(...a);
  let length = 0;
  for (let i = 2; i < pts.length; i += 2)
    length += Math.hypot((pts[i] as number) - (pts[i - 2] as number), (pts[i + 1] as number) - (pts[i - 1] as number));
  if (length < minLen) return null;
  return { pts, y: y0, length };
}

/** Point at arc length s along a tread polyline (clamped), written into out (with the heading). */
export function alongTread(t: Tread, s: number, out: { x: number; z: number; dx: number; dz: number }) {
  const p = t.pts;
  let rest = Math.max(0, Math.min(t.length, s));
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2] as number;
    const az = p[i - 1] as number;
    const bx = p[i] as number;
    const bz = p[i + 1] as number;
    const l = Math.hypot(bx - ax, bz - az);
    if (rest <= l || i === p.length - 2) {
      const k = l > 0 ? Math.min(1, rest / l) : 0;
      out.x = ax + (bx - ax) * k;
      out.z = az + (bz - az) * k;
      out.dx = l > 0 ? (bx - ax) / l : 1;
      out.dz = l > 0 ? (bz - az) / l : 0;
      return out;
    }
    rest -= l;
  }
  out.x = p[0] as number;
  out.z = p[1] as number;
  out.dx = 1;
  out.dz = 0;
  return out;
}

/** People per group for a quality level. */
export function headcount(quality: "low" | "high") {
  return quality === "high"
    ? { sites: 3, perSite: 4, stalls: 3, shoppers: 4, children: 5, dancers: 10 }
    : { sites: 2, perSite: 2, stalls: 2, shoppers: 2, children: 3, dancers: 6 };
}
