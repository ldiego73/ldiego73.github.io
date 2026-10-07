/**
 * Pure helpers shared by the Antisuyu fauna ambients (no three.js, no DOM): time-of-day windows, the
 * "good look" timer behind the passport stamps, flee targets, the dolphin's surfacing arc, leap
 * parabolas between branches, and spot pickers that only read the pure jungle layout (banks, water,
 * forest floor beside the road). Unit-tested in logic.test.ts.
 *
 * Day time follows the Sky contract: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
 */
import type { SelvaLayout } from "../../contract";

export const TAU = Math.PI * 2;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Exponential approach factor for a rate (per second) and a frame dt. */
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * ease(rate, dt);

/** Wrap an angle to [-π, π). */
export function wrapAngle(a: number) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Turn `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number) {
  const d = wrapAngle(to - from);
  return from + (Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep);
}

/** Seeded RNG (Park–Miller), 0 ≤ r < 1. */
export function rng(seed: number) {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------- time of day

/** Sun elevation proxy (-1..1) for a day time. */
export const sunElevation = (time: number) => Math.sin((time - 0.25) * TAU);
/** 0 by day … 1 at full night, ramping through dusk and dawn. */
export const nightAmount = (time: number) => smooth(0.05, -0.2, sunElevation(time));
/** 1 in full daylight, 0 at night (the complement of nightAmount). */
export const dayAmount = (time: number) => 1 - nightAmount(time);

/**
 * Macaws at the clay lick: they gather on the wall in the early morning (≈ 6–9 h, time 0.25–0.38) and are
 * gone by mid-morning. 0..1, used both for "are they there" and how many cling to the wall.
 */
export const collpaPresence = (time: number) => smooth(0.235, 0.27, time) * (1 - smooth(0.38, 0.43, time));

/** Diurnal birds and monkeys: active from a little after dawn to a little before dusk. */
export const diurnal = (time: number) => smooth(0.23, 0.28, time) * (1 - smooth(0.74, 0.79, time));

/** Morphos fly in the bright middle of the day (≈ 8–16 h). */
export const morphoHours = (time: number) => smooth(0.3, 0.35, time) * (1 - smooth(0.64, 0.7, time));

/** The coto (red howler) roars around dawn and dusk (monos.ts poses it, soundscape.ts voices it). */
export const howlerHour = (time: number) => (time > 0.235 && time < 0.29) || (time > 0.72 && time < 0.775);

/** The jaguar walks only in true night (after dusk is over, before the first light). */
export const jaguarHours = (time: number) => time < 0.2 || time > 0.82;

// ---------------------------------------------------------------- good look (passport)

/**
 * Accumulates how long an animal has been "well seen" (close to the traveler and on screen). Gaps of a
 * frame or two (an occluding leaf, a turn of the camera) only drain it slowly; a real loss of sight resets
 * it within a fraction of a second. `update` returns true exactly once, when the look is long enough.
 */
export class LookTimer {
  t = 0;
  done = false;
  constructor(readonly need = 1.5) {}
  update(dt: number, ok: boolean): boolean {
    if (this.done) return false;
    this.t = ok ? this.t + dt : Math.max(0, this.t - dt * 3);
    if (this.t >= this.need) {
      this.done = true;
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------- motion shapes

/** Point `dist` away from a threat at (fx, fz), seen from (x, z) (a random sideways jitter when on top). */
export function awayFrom(x: number, z: number, fx: number, fz: number, dist: number, out: { x: number; z: number }) {
  let dx = x - fx;
  let dz = z - fz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) {
    dx = 1;
    dz = 0;
  } else {
    dx /= d;
    dz /= d;
  }
  out.x = x + dx * dist;
  out.z = z + dz * dist;
  return out;
}

/**
 * Surfacing arc of a river dolphin over progress u (0 → 1): the body rises from `depth` below the surface,
 * the back crests `rise` above it at mid-arc, and sinks again. `y` is the height of the body pivot relative
 * to the water surface, `pitch` the nose-up (+) / nose-down (−) angle for a forward run `len`.
 */
export function surfaceArc(u: number, len: number, rise: number, depth: number) {
  const k = clamp01(u);
  const s = Math.sin(Math.PI * k);
  const y = -depth + (rise + depth) * s;
  const dy = (rise + depth) * Math.PI * Math.cos(Math.PI * k);
  return { y, pitch: Math.atan2(dy, Math.max(0.1, len)) };
}

/** Parabolic leap from a to b (peak `h` above the higher end) at progress u; writes into out. */
export function leapPoint(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  h: number,
  u: number,
  out: { x: number; y: number; z: number },
) {
  const k = clamp01(u);
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  const top = Math.max(a.y, b.y) + h;
  // Quadratic Bézier in y through the control height that makes the curve peak near `top`.
  const c = 2 * top - (a.y + b.y) / 2;
  out.y = (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c + k * k * b.y;
  return out;
}

// ---------------------------------------------------------------- places on the jungle layout

/** Ground classification for the river margin (height relative to the water surface). */
export interface Margin {
  /** Dry bank: solid ground a hand above the water line. */
  dry: boolean;
  /** Shallow water: a wading bird or a lurking caiman (ground under the surface but not deep). */
  shallow: boolean;
  /** Deep water: swimming / diving. */
  deep: boolean;
}

export function margin(layout: SelvaLayout, x: number, z: number): Margin {
  const h = layout.heightAt(x, z);
  const lv = layout.river.level;
  return { dry: h > lv + 0.15, shallow: h <= lv - 0.05 && h > lv - 1.1, deep: h <= lv - 1.6 };
}

/** Off the road band, the station plazas and spurs, and inside the world: where animals may stand. */
export function offRoad(layout: SelvaLayout, x: number, z: number, pad = 1.2) {
  const b = layout.bounds;
  if (x < b.x0 + 4 || x > b.x1 - 4 || z < b.z0 + 4 || z > b.z1 - 4) return false;
  if (layout.trailQuery(x, z).d <= layout.trail.halfWidth + pad) return false;
  for (const p of layout.plazas) if (Math.hypot(x - p.x, z - p.z) < p.r + 2 + pad) return false;
  return !layout.walkable(x, z);
}

/** Pure ground slope (rise per unit) at (x, z). */
export function slopeAt(layout: SelvaLayout, x: number, z: number) {
  const h = layout.heightAt;
  return Math.hypot(h(x + 0.7, z) - h(x - 0.7, z), h(x, z + 0.7) - h(x, z - 0.7)) / 1.4;
}

/** Road point and the unit normal toward the river side (side -1) at t. */
export function roadFrame(layout: SelvaLayout, t: number) {
  const p = layout.trail.pointAt(t);
  const tg = layout.trail.tangentAt(t);
  const l = Math.hypot(tg.x, tg.z) || 1;
  // Side s puts a station at p + (−tg.z, tg.x)·s·offset (contract), so side −1 is (tg.z, −tg.x).
  return { x: p.x, y: p.y, z: p.z, tx: tg.x / l, tz: tg.z / l, rx: tg.z / l, rz: -tg.x / l };
}

/** Point at road t, `lat` units to the side (+ toward the river, − away from it). */
export function besideRoad(layout: SelvaLayout, t: number, lat: number) {
  const f = roadFrame(layout, t);
  return { x: f.x + f.rx * lat, z: f.z + f.rz * lat };
}

/**
 * A spot on the dry bank (height between `lo` and `hi` above the water) near the river side of road t:
 * scans outward from the road toward the river. Null when the bank is not reachable there.
 */
export function bankSpot(layout: SelvaLayout, t: number, lo = 0.2, hi = 2.6, along = 0) {
  const lv = layout.river.level;
  const f = roadFrame(layout, t);
  for (let lat = 6; lat < 60; lat += 0.5) {
    const x = f.x + f.rx * lat + f.tx * along;
    const z = f.z + f.rz * lat + f.tz * along;
    const h = layout.heightAt(x, z);
    if (h < lv + lo) return null; // went past the band into the water
    if (h <= lv + hi && offRoad(layout, x, z)) return { x, z, y: h };
  }
  return null;
}

/**
 * Open water near road t: walks from the bank outward until the river bed is at least `depth` below the
 * surface, then `extra` units further (clamped to stay in the water).
 */
export function waterSpot(layout: SelvaLayout, t: number, depth = 1.6, extra = 0, along = 0) {
  const lv = layout.river.level;
  const f = roadFrame(layout, t);
  let found = -1;
  for (let lat = 6; lat < 80; lat += 0.5) {
    const x = f.x + f.rx * lat + f.tx * along;
    const z = f.z + f.rz * lat + f.tz * along;
    if (layout.heightAt(x, z) <= lv - depth && layout.isWater(x, z)) {
      found = lat;
      break;
    }
  }
  if (found < 0) return null;
  let lat = found + extra;
  const at = (l: number) => ({ x: f.x + f.rx * l + f.tx * along, z: f.z + f.rz * l + f.tz * along });
  while (lat > found) {
    const p = at(lat);
    if (layout.heightAt(p.x, p.z) <= lv - depth && layout.isWater(p.x, p.z)) return { ...p, lat };
    lat -= 0.5;
  }
  return { ...at(found), lat: found };
}

/**
 * Tree sites beside the road between t0 and t1, `n` of them, on open forest floor `lat0..lat1` units off
 * the centerline on `side` (−1 away from the river, 1 toward it, 0 either), at least `gap` apart.
 * Deterministic for a seed. Sites that fail (water, plaza, steep) are skipped, so fewer may come back.
 */
export function treeSites(
  layout: SelvaLayout,
  o: { t0: number; t1: number; n: number; lat0: number; lat1: number; side: -1 | 0 | 1; gap: number; seed: number },
) {
  const R = rng(o.seed);
  const out: Array<{ x: number; z: number; y: number; t: number }> = [];
  for (let k = 0; k < o.n * 30 && out.length < o.n; k++) {
    const t = o.t0 + (o.t1 - o.t0) * (o.n > 1 ? (out.length + R() * 0.8) / o.n : R());
    const side = o.side || (R() < 0.5 ? -1 : 1);
    const lat = (o.lat0 + (o.lat1 - o.lat0) * R()) * side;
    const p = besideRoad(layout, t, lat);
    if (!offRoad(layout, p.x, p.z, 1.6)) continue;
    if (layout.riverDist(p.x, p.z) < 3 || slopeAt(layout, p.x, p.z) > 0.55) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < o.gap)) continue;
    out.push({ x: p.x, z: p.z, y: layout.heightAt(p.x, p.z), t });
  }
  return out;
}

/** Road t well away from every station plaza and the canopy walkway (for crossings, ant trails…). */
export function quietT(t: number, stations: readonly number[], canopy: readonly [number, number], pad = 0.035) {
  if (t < 0.03 || t > 0.97) return false;
  if (t > canopy[0] - pad && t < canopy[1] + pad) return false;
  return stations.every((s) => Math.abs(s - t) > pad);
}
