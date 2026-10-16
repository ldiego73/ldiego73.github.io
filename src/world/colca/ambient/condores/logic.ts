/**
 * Pure flight of the Kuntisuyu's condors (../condores.ts): each bird rides a thermal, a slow circle over the
 * canyon near the rim, drifting up and down through it; in the early morning (the hours condors really rise
 * past the Cruz del Cóndor) two of them move to the thermal right in front of the viewpoint and pass close.
 * At night they roost (hidden). Also the finale's rising spiral (../cruz.ts). No DOM, no three.js (tested in
 * logic.test.ts).
 *
 * Positions are given in canyon terms (x along the canyon, s south of the north rim, y above the rim
 * height) and turned into world x/z by the caller with ../../plan.ts rimZ, so the thermals follow the rim.
 */

export interface Thermal {
  /** Centre: x along the canyon, s from the north rim (> 0 over the canyon). */
  x: number;
  s: number;
  r: number;
  /** Altitude band above the rim (min, max): the bird drifts between them. */
  y0: number;
  y1: number;
  /** Angular speed (rad/s, sign = turn direction). */
  w: number;
}

/**
 * Home thermals, the first ones close to the road so they are seen from it (on low quality only the first
 * four fly): one over the canyon edge in front of the village, one in front of the colcas, one where the
 * road leaves the rim, one before the Cruz del Cóndor; then a wide one mid-canyon and one deep down. The rim
 * road runs 8 u north of the rim (s ≈ −8): a thermal at s 26 with r 20 passes ~14 u from the road's edge.
 */
export const THERMALS: ReadonlyArray<Thermal> = [
  { x: 300, s: 28, r: 22, y0: -8, y1: 34, w: 0.11 },
  { x: 125, s: 26, r: 20, y0: -6, y1: 38, w: -0.13 },
  { x: -10, s: 32, r: 24, y0: -22, y1: 30, w: 0.1 },
  { x: -405, s: 34, r: 26, y0: -14, y1: 36, w: -0.12 },
  { x: -230, s: 80, r: 36, y0: -55, y1: 26, w: 0.09 },
  { x: 40, s: 150, r: 46, y0: -110, y1: -40, w: -0.07 },
];

/** The morning thermal right in front of the Cruz del Cóndor (x from the platform; s just past the rim). */
export function cruzThermal(cruzX: number): Thermal {
  return { x: cruzX + 6, s: 24, r: 17, y0: 3, y1: 18, w: 0.16 };
}

/** Morning at the viewpoint: roughly 6:30 to 10:30 (sky time 0.27..0.44, 0.25 = sunrise). */
export const isMorning = (time: number) => time > 0.27 && time < 0.44;
/** Condors fly by day; at dusk they go down to roost. */
export const flying = (time: number) => time > 0.23 && time < 0.76;

/**
 * Which thermal bird i (of n) rides at this time of day: in the morning the last two go to the Cruz (the
 * near-road thermals by the village and the colcas keep theirs, so the canyon is never empty of them).
 */
export function thermalFor(i: number, time: number, cruzX: number, n = THERMALS.length): Thermal {
  if (i >= n - 2 && isMorning(time)) return cruzThermal(cruzX);
  return THERMALS[i % THERMALS.length] as Thermal;
}

export interface FlightPose {
  x: number;
  s: number;
  y: number;
  yaw: number;
  bank: number;
  wing: number;
}

/**
 * Pose on a thermal at clock t (seconds) for bird i: circling, drifting through the altitude band, banked into
 * the turn, wings flat with a slow flex and, now and then, a few deep flaps.
 */
export function onThermal(th: Thermal, t: number, i: number): FlightPose {
  const a = i * 2.1 + th.w * t;
  const dir = Math.sign(th.w) || 1;
  const x = th.x + Math.cos(a) * th.r;
  const s = th.s + Math.sin(a) * th.r;
  const k = 0.5 + 0.5 * Math.sin(t * 0.021 + i * 1.7);
  const y = th.y0 + (th.y1 - th.y0) * k;
  // Tangent of the circle (x, s): (−sin a, cos a) · dir; s grows with world z.
  const tx = -Math.sin(a) * dir;
  const ts = Math.cos(a) * dir;
  const flapT = (t + i * 13) % 45;
  const flap = flapT < 2.2 ? Math.sin(flapT * 5.5) * 0.45 : 0;
  return { x, s, y, yaw: Math.atan2(tx, ts), bank: 0.32 * dir, wing: 0.07 + 0.03 * Math.sin(t * 0.7 + i) + flap };
}

/** Finale: bird i rises from deep in the canyon in a widening spiral round the cross, then circles overhead. */
export function riseAt(
  i: number,
  n: number,
  age: number,
): { dx: number; ds: number; y: number; yaw: number; bank: number; wing: number } {
  const lag = (i / n) * 2.2;
  const t = Math.max(0, age - lag);
  const climb = Math.min(1, t / 9);
  const ease = climb * climb * (3 - 2 * climb);
  const r = 9 + (i % 3) * 6 + 5 * ease;
  const dir = i % 2 ? 1 : -1;
  const a = (i / n) * Math.PI * 2 + dir * t * (0.55 - 0.25 * ease);
  // From 110 below the rim up to 14–30 above it.
  const y = -110 + (124 + (i % 4) * 5) * ease + Math.sin(t * 0.6 + i) * 1.5;
  const tx = -Math.sin(a) * dir;
  const ts = Math.cos(a) * dir;
  const wing = climb < 1 ? 0.25 * Math.sin(t * 5 + i) : 0.06 + 0.03 * Math.sin(t + i);
  return { dx: Math.cos(a) * r, ds: Math.sin(a) * r + 14, y, yaw: Math.atan2(tx, ts), bank: 0.4 * dir, wing };
}

// ---------------------------------------------------------------- low pass over the traveler

/** Canyon-frame point: x along the canyon, s from the north rim, y above the rim height. */
export interface CPoint {
  x: number;
  s: number;
  y: number;
}

/** How often a bird comes down to look at the traveler (clock seconds), and the glide speed (u/s). */
export const PASS = { every: 70, retry: 12, speed: 13, minDur: 8, maxDur: 18, reach: 170, above: 9 } as const;

/**
 * True where a low pass may happen: on the rim (the road along the canyon, or the Cruz platform), between
 * the canyon's lip and ~40 u back from it; never on the pampa (s far below −40).
 */
export const onRim = (s: number) => s > -40 && s < 0;

/** Duration of a pass from a to b through the point above the traveler (a steady glide). */
export function passDuration(a: CPoint, over: CPoint, b: CPoint): number {
  const d = (p: CPoint, q: CPoint) => Math.hypot(p.x - q.x, p.s - q.s, p.y - q.y);
  const t = (d(a, over) + d(over, b)) / PASS.speed;
  return Math.min(PASS.maxDur, Math.max(PASS.minDur, t));
}

/**
 * Pose along a low pass at u (0..1): a quadratic curve from `a` (where the bird left its thermal) to `b`
 * (where it will be on the thermal when the pass ends, so it rejoins without a jump) that goes exactly
 * through `over` (above the traveler) at u = 0.5. Banked into the curve, wings flat with a slow flex.
 */
export function passAt(a: CPoint, over: CPoint, b: CPoint, u: number): FlightPose {
  // Control point so that B(0.5) = over: 0.25 a + 0.5 c + 0.25 b = over.
  const cx = 2 * over.x - 0.5 * (a.x + b.x);
  const cs = 2 * over.s - 0.5 * (a.s + b.s);
  const cy = 2 * over.y - 0.5 * (a.y + b.y);
  const v = 1 - u;
  const x = v * v * a.x + 2 * v * u * cx + u * u * b.x;
  const s = v * v * a.s + 2 * v * u * cs + u * u * b.s;
  const y = v * v * a.y + 2 * v * u * cy + u * u * b.y;
  // Tangent (derivative) for the heading, the second derivative's side for the bank.
  const tx = 2 * v * (cx - a.x) + 2 * u * (b.x - cx);
  const ts = 2 * v * (cs - a.s) + 2 * u * (b.s - cs);
  const ax = 2 * (b.x - 2 * cx + a.x);
  const as = 2 * (b.s - 2 * cs + a.s);
  const turn = Math.sign(tx * as - ts * ax);
  return { x, s, y, yaw: Math.atan2(tx, ts), bank: 0.28 * turn, wing: 0.06 + 0.03 * Math.sin(u * 9) };
}

// ---------------------------------------------------------------- perched pairs

/**
 * Rocks on the rim where a pair of condors sits (x along the canyon, s from the rim: on the plateau's
 * shoulder between the road's edge at s ≈ −5.4 and the lip): one by the colcas, one just east of the Cruz
 * del Cóndor platform (r 8.5 round x ≈ −475), both in plain view from the road.
 */
export const PERCHES: ReadonlyArray<{ x: number; s: number; r: number }> = [
  { x: 142, s: -2.6, r: 1.25 },
  { x: -457, s: -2.4, r: 1.3 },
];

/**
 * Pose of perched bird k (0 or 1 on its rock): sitting upright, wings folded, the head turning now and then;
 * in the early morning they open their wings to the sun (as condors do before the first thermals rise).
 */
export function perchPose(
  k: number,
  time: number,
  clock: number,
): { dx: number; yaw: number; fold: number; wing: number; pitch: number } {
  const sunning = time > 0.25 && time < 0.36 && k === 0;
  const look = Math.sin(clock * 0.23 + k * 2.4) + 0.6 * Math.sin(clock * 0.61 + k);
  return {
    dx: k === 0 ? -0.45 : 0.5,
    yaw: (k === 0 ? 1.15 : -1.3) + look * 0.35,
    fold: sunning ? 0 : 1,
    wing: sunning ? 0.15 + 0.05 * Math.sin(clock * 0.8) : -0.15,
    pitch: -0.55,
  };
}
