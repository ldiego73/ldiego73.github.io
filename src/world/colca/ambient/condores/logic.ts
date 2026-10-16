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

/** Home thermals along the rim, east → west (the village, the colcas, mid-canyon, toward the Cruz). */
export const THERMALS: ReadonlyArray<Thermal> = [
  { x: 330, s: 70, r: 34, y0: -40, y1: 30, w: 0.11 },
  { x: 130, s: 58, r: 28, y0: -30, y1: 36, w: -0.13 },
  { x: -60, s: 96, r: 40, y0: -70, y1: 20, w: 0.09 },
  { x: -250, s: 80, r: 36, y0: -55, y1: 26, w: -0.1 },
  { x: -400, s: 64, r: 30, y0: -35, y1: 40, w: 0.12 },
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

/** Which thermal bird i rides at this time of day: the first two go to the Cruz in the morning. */
export function thermalFor(i: number, time: number, cruzX: number): Thermal {
  if (i < 2 && isMorning(time)) return cruzThermal(cruzX);
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
