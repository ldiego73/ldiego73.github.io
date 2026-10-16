/**
 * Pure flight of the white condor (../condor-blanco.ts), the Kuntisuyu's rare leucistic bird: when it flies,
 * how it circles its own small thermal in front of the Cruz del Cóndor, when it comes down for a low pass
 * past the lookout and when a look at it counts. No DOM, no three.js (tested in logic.test.ts).
 *
 * Like ../condores/logic.ts, positions are in canyon terms (x along the canyon, s south of the north rim,
 * y above the rim height CANYON.rimY) and the caller turns them into world x/z with ../../plan.ts rimZ.
 */
import { type CPoint, type FlightPose, passAt, passDuration } from "../condores/logic";

export type { CPoint, FlightPose };
export { passAt, passDuration };

/**
 * Sky time window (0.25 = sunrise, 0.5 = noon): the morning thermals, roughly 6:15 to 12:30. It reaches past
 * the black condors' morning (../condores/logic.ts isMorning, to 0.44) on purpose: the T key jumps from night
 * to 0.40 (../../../sky.ts toggle), and with the 360 s day the window must still leave ~43 s after that
 * landing for the bird to be found.
 */
export const WINDOW = { t0: 0.26, t1: 0.52 } as const;
export const inWindow = (time: number) => time > WINDOW.t0 && time < WINDOW.t1;

/** The Cruz del Cóndor platform in canyon terms (x, s from the rim, y of its floor above the rim height). */
export type Anchor = CPoint;

export interface Circle {
  x: number;
  s: number;
  r: number;
  /** Altitude band above the rim height (the bird drifts slowly between them). */
  y0: number;
  y1: number;
  /** Angular speed (rad/s, sign = turn direction). */
  w: number;
}

/**
 * Its own thermal, west of and lower than the black condors' morning circle at the Cruz (x + 6, s 24, r 17,
 * ../condores/logic.ts cruzThermal) so the two barely cross: centre 16 u west and 26 u out (the platform
 * sits ~10 u back from the lip, so the whole circle stays over the canyon; ~30 u from the platform), r 13, so
 * the near arc passes ~17 u from it; 3–10 u above the floor (low enough to stay in the
 * frame of the follow camera, which looks down on the traveler), turning the other way. |w| 0.21 → a loop every ~30 s (halved with reduced motion).
 */
export function circleFor(a: Anchor, reduced = false): Circle {
  return { x: a.x - 16, s: a.s + 26, r: 13, y0: a.y + 3, y1: a.y + 10, w: reduced ? -0.105 : -0.21 };
}

/**
 * Pose on the circle at phase `ph` (radians, integrated by the caller) and clock `t` (seconds): banked into
 * the turn, wings flat with a slow flex and, once every ~37 s, a couple of lazy strokes (condors soar).
 * Reduced motion: no strokes, no flex.
 */
export function onCircle(c: Circle, ph: number, t: number, reduced = false): FlightPose {
  const dir = Math.sign(c.w) || 1;
  const x = c.x + Math.cos(ph) * c.r;
  const s = c.s + Math.sin(ph) * c.r;
  // A slow drift through the band: ~2 min up and down.
  const k = 0.5 + 0.5 * Math.sin(t * 0.05);
  const y = c.y0 + (c.y1 - c.y0) * k;
  const tx = -Math.sin(ph) * dir;
  const ts = Math.cos(ph) * dir;
  const flapT = t % 37;
  const flap = reduced || flapT > 1.8 ? 0 : Math.sin(flapT * 5.2) * 0.4;
  const wing = reduced ? 0.08 : 0.08 + 0.025 * Math.sin(t * 0.6) + flap;
  return { x, s, y, yaw: Math.atan2(tx, ts), bank: 0.3 * dir, wing };
}

/** Phase of the circle point farthest from (x, s): where the bird appears, so it glides in instead of popping. */
export function farthestPhase(c: Circle, x: number, s: number): number {
  return Math.atan2(c.s - s, c.x - x);
}

// ---------------------------------------------------------------- low pass past the lookout

/**
 * Low pass: once the traveler is within `near` u of the platform, the first pass comes `first` s later,
 * then one every `every` s while they stay; leaving the Cruz resets it. `over` is the point the curve goes
 * through: `out` u past the platform centre over the canyon (beyond the parapet, r 8.2, and clear of the
 * cross, whose top is ~4.7 u above the floor 3.6 u out) and `above` u over its floor.
 */
export const PASS = { near: 40, first: 9, every: 50, out: 12, above: 5 } as const;

/** The point the low pass goes through (canyon terms). */
export function passOver(a: Anchor): CPoint {
  return { x: a.x, s: a.s + PASS.out, y: a.y + PASS.above };
}

/**
 * One step of the pass schedule. `next` is the clock time of the next pass (null: the traveler is not at the
 * Cruz). Returns the new `next` and whether a pass starts now. Never with reduced motion.
 */
export function schedule(
  next: number | null,
  clock: number,
  dist: number,
  reduced: boolean,
): { next: number | null; start: boolean } {
  if (reduced || dist > PASS.near) return { next: null, start: false };
  if (next === null) return { next: clock + PASS.first, start: false };
  if (clock >= next) return { next: clock + PASS.every, start: true };
  return { next, start: false };
}

// ---------------------------------------------------------------- a good look

/** Within `r` u of the traveler and on screen for `hold` s (like the mountain's golden condor). */
export const LOOK = { r: 30, hold: 0.6 } as const;

/** Seconds the bird has been in good view after this frame (resets when it is not). */
export const lookStep = (seen: number, dt: number, dist: number, onScreen: boolean) =>
  dist < LOOK.r && onScreen ? seen + dt : 0;
