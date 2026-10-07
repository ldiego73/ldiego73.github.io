/**
 * Pure canoe logic (no DOM, no three.js): player steering, hull-safe water projection, docking,
 * the legacy polyline used for mooring headings, and dock geometry derived from the
 * layout (pier from the station apron to the top of the bank, stairs down the bank, floating jetty beside the
 * mooring point on the water).
 *
 * Why the docks are computed and not hard-coded: the layout's canoe ends sit ~3.5 u inside the water, ~7 u past
 * the flat station apron and ~5 u below it. The pier runs level over the apron to where the bank starts to
 * fall (the stair top, so the stairs never cut into the bank), the stairs go down to the jetty, and all three
 * are raised walkable decks at their real heights (../../../decks.ts). The traveler walks down to the jetty,
 * boards from it with a short step into the canoe, and is put back on the far jetty on landing.
 */

export type Pt = readonly [number, number];

export interface Route {
  pts: Pt[];
  /** Cumulative arc length at each point (cum[0] = 0). */
  cum: number[];
  length: number;
}

export function buildRoute(path: ReadonlyArray<Pt>): Route {
  const pts: Pt[] = [];
  for (const p of path) {
    const last = pts[pts.length - 1];
    // Drop duplicate points: they would give zero-length segments and NaN tangents.
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
    pts.push([p[0], p[1]]);
  }
  if (pts.length < 2) throw new RangeError("route needs at least two distinct points");
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    cum.push((cum[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { pts, cum, length: cum[cum.length - 1] as number };
}

export interface RoutePose {
  x: number;
  z: number;
  /** Unit tangent toward increasing s. */
  tx: number;
  tz: number;
}

/** Position and tangent at arc length s (clamped to [0, length]). `out` is filled and returned. */
export function routeAt(r: Route, s: number, out: RoutePose = { x: 0, z: 0, tx: 1, tz: 0 }): RoutePose {
  const d = Math.max(0, Math.min(r.length, s));
  // Binary search for the segment holding d.
  let lo = 0;
  let hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((r.cum[mid] as number) <= d) lo = mid;
    else hi = mid;
  }
  const a = r.pts[lo] as Pt;
  const b = r.pts[hi] as Pt;
  const seg = (r.cum[hi] as number) - (r.cum[lo] as number);
  const u = seg > 0 ? (d - (r.cum[lo] as number)) / seg : 0;
  out.x = a[0] + (b[0] - a[0]) * u;
  out.z = a[1] + (b[1] - a[1]) * u;
  // Smooth the heading over a few units so the bow does not snap at polyline corners.
  const ahead = Math.min(r.length, d + 1.5);
  const behind = Math.max(0, d - 1.5);
  const p = pointAt(r, ahead);
  const q = pointAt(r, behind);
  const len = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
  out.tx = (p[0] - q[0]) / len;
  out.tz = (p[1] - q[1]) / len;
  return out;
}

function pointAt(r: Route, s: number): Pt {
  let i = 1;
  while (i < r.cum.length - 1 && (r.cum[i] as number) < s) i++;
  const a = r.pts[i - 1] as Pt;
  const b = r.pts[i] as Pt;
  const seg = (r.cum[i] as number) - (r.cum[i - 1] as number);
  const u = seg > 0 ? (s - (r.cum[i - 1] as number)) / seg : 0;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Model yaw (models face +Z; yaw = rotation.y) for a heading (dx, dz). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Free navigation uses camera-relative world intent projected onto the bow (+Z).
 * Forward/back sets signed thrust (back first brakes, then reverses); lateral intent turns at rest too.
 * This preserves WASD, touch and gamepad semantics without making a backward input turn the boat around.
 */
export const CRUISE = 4.5;
export const MAX_SPEED = 6.5;
export const TURN_RATE = 1.2;
export const HULL_MARGIN = 2.5;
export const BOUNDS_MARGIN = 8;
export interface Boat {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
}
export interface NavigationWater {
  river: { pts: Array<[number, number]> };
  bounds: { x0: number; x1: number; z0: number; z1: number };
  isWater(x: number, z: number): boolean;
  riverDist(x: number, z: number): number;
}

/** Conservative circular hull envelope includes both tips at every yaw, including coarse terrain banks. */
export function boatWater(l: NavigationWater, x: number, z: number): boolean {
  const b = l.bounds;
  if (
    x < b.x0 + BOUNDS_MARGIN ||
    x > b.x1 - BOUNDS_MARGIN ||
    z < b.z0 + BOUNDS_MARGIN ||
    z > b.z1 - BOUNDS_MARGIN ||
    l.riverDist(x, z) > -HULL_MARGIN ||
    !l.isWater(x, z)
  )
    return false;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    if (!l.isWater(x + Math.cos(a) * HULL_MARGIN, z + Math.sin(a) * HULL_MARGIN)) return false;
  }
  return true;
}

/** Nearest centerline point and downstream tangent, including the river beyond the old shortcut. */
function riverNear(l: NavigationWater, x: number, z: number) {
  let best = Infinity;
  let out = { x, z, tx: 1, tz: 0 };
  for (let i = 1; i < l.river.pts.length; i++) {
    const a = l.river.pts[i - 1] as Pt;
    const b = l.river.pts[i] as Pt;
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (!len) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
    const px = a[0] + dx * u,
      pz = a[1] + dz * u;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      out = { x: px, z: pz, tx: dx / len, tz: dz / len };
    }
  }
  return out;
}

/** Project toward the local centerline, preserving travel along the bank instead of rejecting the step.
 * Water queries include the real heightfield: a geometrically wet bank can still be dry at low resolution.
 * Bisection retains a valid hull envelope; the last valid pose is the fallback at world corners.
 */
export function clampBoat(l: NavigationWater, x: number, z: number, previous: { x: number; z: number }) {
  const b = l.bounds;
  const limit = (v: number, lo: number, hi: number) => Math.max(lo + BOUNDS_MARGIN, Math.min(hi - BOUNDS_MARGIN, v));
  x = limit(x, b.x0, b.x1);
  z = limit(z, b.z0, b.z1);
  if (boatWater(l, x, z)) return { x, z };
  const c = riverNear(l, x, z);
  const cx = limit(c.x, b.x0, b.x1),
    cz = limit(c.z, b.z0, b.z1);
  const from = boatWater(l, cx, cz) ? { x: cx, z: cz } : previous;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const u = (lo + hi) / 2;
    if (boatWater(l, from.x + (x - from.x) * u, from.z + (z - from.z) * u)) lo = u;
    else hi = u;
  }
  return { x: from.x + (x - from.x) * lo, z: from.z + (z - from.z) * lo };
}

export interface WaterBody {
  x: number;
  z: number;
  r: number;
  solid: boolean;
  kind: string;
}
/** Inertia and drag with a gentle 0.22 u/s downstream current. No input means no paddle thrust. */
export function stepBoat(
  l: NavigationWater,
  boat: Boat,
  intent: { x: number; z: number; running: boolean },
  dt: number,
  bodies: readonly WaterBody[] = [],
): Boat {
  dt = Math.max(0, Math.min(0.05, dt));
  const hx = Math.sin(boat.yaw),
    hz = Math.cos(boat.yaw);
  // Steer toward the stick (camera-relative): full turn rate until within ~35° of it, and paddle only with the
  // part of the stick that points ahead. A stick pointing behind turns the canoe around instead of crawling
  // backward (a pure cross/dot split turns slowest exactly when the target is behind).
  const mag = Math.min(1, Math.hypot(intent.x, intent.z));
  const dot = intent.x * hx + intent.z * hz;
  const cross = intent.x * hz - intent.z * hx;
  const angle = mag > 1e-4 ? Math.atan2(cross, dot) : 0;
  const along = mag * Math.max(0, Math.cos(angle));
  const turn = mag * Math.max(-1, Math.min(1, angle / 0.6));
  const yaw = boat.yaw + turn * TURN_RATE * dt;
  const current = riverNear(l, boat.x, boat.z);
  const thrust = along * (along < 0 ? 2.2 : (intent.running ? MAX_SPEED : CRUISE) - 0.22);
  const k = 1 - Math.exp(-dt * 1.1);
  let vx = boat.vx + (Math.sin(yaw) * thrust + current.tx * 0.22 - boat.vx) * k;
  let vz = boat.vz + (Math.cos(yaw) * thrust + current.tz * 0.22 - boat.vz) * k;
  // Soft world edge: remove outward momentum gradually before the hard hull-safe limit.
  const b = l.bounds;
  if ((vx < 0 && boat.x < b.x0 + BOUNDS_MARGIN + 6) || (vx > 0 && boat.x > b.x1 - BOUNDS_MARGIN - 6))
    vx *= Math.exp(-dt * 4);
  if ((vz < 0 && boat.z < b.z0 + BOUNDS_MARGIN + 6) || (vz > 0 && boat.z > b.z1 - BOUNDS_MARGIN - 6))
    vz *= Math.exp(-dt * 4);
  let x = boat.x + vx * dt,
    z = boat.z + vz * dt;
  for (const o of bodies) {
    if (!o.solid || o.kind === "traveler" || o.kind === "canoe") continue;
    const dx = x - o.x,
      dz = z - o.z,
      d = Math.hypot(dx, dz),
      r = 1.1 + o.r;
    if (d >= r) continue;
    const nx = d > 1e-5 ? dx / d : Math.sin(yaw + Math.PI / 2);
    const nz = d > 1e-5 ? dz / d : Math.cos(yaw + Math.PI / 2);
    const push = Math.min(r - d, dt * 2);
    x += nx * push;
    z += nz * push;
    const into = vx * nx + vz * nz;
    if (into < 0) {
      vx -= nx * into * k;
      vz -= nz * into * k;
    }
  }
  const p = clampBoat(l, x, z, boat);
  const dx = x - p.x,
    dz = z - p.z,
    d = Math.hypot(dx, dz);
  if (d > 1e-6) {
    const nx = dx / d,
      nz = dz / d,
      outward = vx * nx + vz * nz;
    // A small rebound, keeping tangential velocity so the canoe slides and can turn off the bank.
    if (outward > 0) {
      vx -= nx * outward * 1.12;
      vz -= nz * outward * 1.12;
    }
  }
  return { ...p, yaw, vx, vz };
}

/** Only slow boats alongside a real mooring can land; never dismount into open water. */
export function dockingEnd(boat: Boat, docks: readonly DockGeo[]): 0 | 1 | null {
  if (Math.hypot(boat.vx, boat.vz) > 0.85) return null;
  let best = 3.2,
    end: 0 | 1 | null = null;
  for (const d of docks) {
    const distance = Math.hypot(boat.x - d.moor.x, boat.z - d.moor.z);
    if (distance <= best) {
      best = distance;
      end = d.end;
    }
  }
  return end;
}
export const earnsRideStamp = (boarded: 0 | 1, landed: 0 | 1) => boarded !== landed;

/** Shortest-arc angle interpolation. */
export function angleLerp(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ------------------------------------------------------------------------------------------------ docks

export interface DockGeo {
  /** Which end of the route: 0 = start (embarcadero), 1 = end (palafitos). */
  end: 0 | 1;
  station: string;
  /** Plaza height (the pier frame origin height). */
  y: number;
  /** Pier head: the last flat point before the bank falls away, where the stairs start. */
  head: { x: number; z: number };
  /** Where the pier starts on the plaza side (toward the station centre). */
  root: { x: number; z: number };
  /** Pier tip over the water and the mooring point beside it (the canoe's route end). */
  tip: { x: number; z: number };
  moor: { x: number; z: number };
  /** Unit direction from the plaza out along the pier. */
  dir: { x: number; z: number };
}

export interface DockEnv {
  heightAt(x: number, z: number): number;
  stationPose(id: string): { position: { x: number; y: number; z: number }; yaw: number };
}

/** Max terrain deviation (u) still counted as the flat apron (the level pier runs over it). */
export const DRY_TOL = 0.12;

/**
 * Dock geometry at one end of the route. The pier runs from the station centre toward the mooring point;
 * its head (the stair top) is the last point on that line where the terrain is still within DRY_TOL of the
 * plaza, so the stairs start where the bank starts to fall.
 */
export function dockGeo(env: DockEnv, station: string, moor: Pt, end: 0 | 1): DockGeo {
  const pose = env.stationPose(station);
  const cx = pose.position.x;
  const cz = pose.position.z;
  const y = env.heightAt(cx, cz);
  const dx = moor[0] - cx;
  const dz = moor[1] - cz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  let dry = 0;
  for (let d = 0; d <= len; d += 0.2) {
    if (Math.abs(env.heightAt(cx + ux * d, cz + uz * d) - y) > DRY_TOL) break;
    dry = d;
  }
  // Stand a step back from the edge of the flat part.
  const head = Math.max(0, dry - 0.5);
  // The pier reaches to ~1.6 u short of the mooring point; the canoe lies alongside its tip.
  const tip = Math.max(head + 1, len - 1.6);
  return {
    end,
    station,
    y,
    head: { x: cx + ux * head, z: cz + uz * head },
    root: { x: cx + ux * Math.max(0, head - 4.2), z: cz + uz * Math.max(0, head - 4.2) },
    tip: { x: cx + ux * tip, z: cz + uz * tip },
    moor: { x: moor[0], z: moor[1] },
    dir: { x: ux, z: uz },
  };
}

// ------------------------------------------------------------------------------------------------ trip

export type Trip =
  | { kind: "moored"; end: 0 | 1 }
  /** Step from the jetty down into the canoe (u: 0 → 1). */
  | { kind: "boarding"; end: 0 | 1; u: number }
  /** Player owns the hull pose and velocity until choosing a nearby dock. */
  | { kind: "riding"; boat: Boat }
  /** Step from the canoe up onto the destination jetty (u: 0 → 1). */
  | { kind: "landing"; end: 0 | 1; u: number };

/** Seconds of the step between the jetty and the canoe seat (boarding and landing). */
export const HOP_TIME = 1.0;

/** Floating jetty at the foot of the stairs: this far before the mooring point, this high above the river. */
export const JETTY_BACK = 1.9;
export const JETTY_LIFT = 0.32;
/** Pier deck top above the plaza (clears the apron's DRY_TOL bumps) and where the stairs start (local z). */
export const PIER_Y = 0.12;
export const STAIR_TOP = 0.8;

export type P3 = readonly [number, number, number];

/**
 * The pier in its own frame (origin at the head, +Z out along `dir`, y relative to the plaza `d.y`): the level
 * deck from the root to the stair top, the stairs down to the jetty, the jetty and the spot on it where the
 * traveler boards and lands (far enough from the moored hull, a creatures body of radius 1.1, not to be pushed).
 */
export interface PierPlan {
  /** Local z of the pier root (≤ 0). */
  back: number;
  deckY: number;
  stairTop: number;
  /** Local z of the stairs' foot and of the jetty's ends. */
  foot: number;
  jetty: { z0: number; z1: number; halfW: number };
  /** Top of the stairs' last tread target and of the jetty (local y). */
  stairFootY: number;
  jettyY: number;
  /** Local z of the boarding / landing spot on the jetty. */
  stand: number;
}

export function pierPlan(d: DockGeo, level: number): PierPlan {
  const moorD = Math.hypot(d.moor.x - d.head.x, d.moor.z - d.head.z);
  const foot = Math.max(STAIR_TOP + 1, moorD - JETTY_BACK);
  const water = level - d.y;
  return {
    back: -Math.hypot(d.head.x - d.root.x, d.head.z - d.root.z),
    deckY: PIER_Y,
    stairTop: STAIR_TOP,
    foot,
    jetty: { z0: foot - 0.3, z1: foot + 1.5, halfW: 1.3 },
    stairFootY: water + JETTY_LIFT + 0.04,
    jettyY: water + JETTY_LIFT,
    stand: foot + 0.2,
  };
}

/** World point where the traveler stands on the jetty to board (and is put back on landing); y = feet. */
export function standPoint(d: DockGeo, level: number): P3 {
  const k = pierPlan(d, level).stand;
  return [d.head.x + d.dir.x * k, level + JETTY_LIFT, d.head.z + d.dir.z * k];
}

/** The step between a point on the jetty and the canoe seat (landing walks it backwards). */
export function boardPath(from: P3, seat: P3): P3[] {
  return [from, seat];
}

/** Point at fraction u (0..1, eased) of a 3D polyline, by length. */
export function alongPath(pts: ReadonlyArray<P3>, u: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, u));
  const k = c * c * (3 - 2 * c);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist3(pts[i - 1] as P3, pts[i] as P3);
  let want = k * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as P3;
    const b = pts[i] as P3;
    const seg = dist3(a, b);
    if (want <= seg || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, want / seg) : 1;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    want -= seg;
  }
  const last = pts[pts.length - 1] as P3;
  return [last[0], last[1], last[2]];
}

const dist3 = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** Only boarding and landing are automatic; navigation never changes state without interaction. */
export function stepTrip(trip: Trip, dt: number, boat: Boat): Trip {
  if (trip.kind === "boarding" || trip.kind === "landing") {
    const u = trip.u + dt / HOP_TIME;
    if (u < 1) return { ...trip, u };
    return trip.kind === "boarding" ? { kind: "riding", boat } : { kind: "moored", end: trip.end };
  }
  return trip;
}

/**
 * Where the idle canoe should be. It stays where it was left, but when the traveler comes near the other dock
 * (and the canoe is far out of sight) the boatman brings it over, so either landing always has it waiting.
 */
export function idleEnd(o: {
  at: 0 | 1;
  /** Traveler distance to each dock head. */
  d0: number;
  d1: number;
  /** Traveler distance to the canoe. */
  dCanoe: number;
}): 0 | 1 {
  const near = 30;
  const unseen = 70;
  if (o.at === 0 && o.d1 < near && o.dCanoe > unseen) return 1;
  if (o.at === 1 && o.d0 < near && o.dCanoe > unseen) return 0;
  return o.at;
}
