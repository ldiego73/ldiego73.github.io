/** Pure helpers for the arcade tambo's players (schedule, cabinet choice, giving way). Unit-tested. */
import { within } from "../people/logic";

/** Day and evening: the full hall. */
export const OPEN: [number, number] = [0.27, 0.93];
/** Late night: one or two night owls stay on under the lanterns. */
export const LATE: [number, number] = [0.93, 0.13];
/** Children watch from mid-morning to dusk. */
export const KIDS: [number, number] = [0.3, 0.8];

/**
 * Cabinets taken by players, in order of arrival (index into the hall's nine, left to right). The three
 * central cabinets (3, 4, 5) and their neighbours 1 and 7 stay free for the traveler.
 */
export const PLAYER_CABS = [6, 2, 0, 8] as const;

export interface Roster {
  players: number;
  kids: number;
}
/** How many players and kids want to be in the hall at `time` (0..1), written into `out`. Low quality: fewer. */
export function roster(time: number, low: boolean, out: Roster = { players: 0, kids: 0 }): Roster {
  out.players = 0;
  out.kids = 0;
  if (within(time, OPEN[0], OPEN[1])) {
    out.players = low ? 2 : 4;
    out.kids = within(time, KIDS[0], KIDS[1]) ? (low ? 1 : 2) : 0;
  } else if (within(time, LATE[0], LATE[1])) out.players = low ? 1 : 2;
  return out;
}

/** Cabinets actually used in a hall of `count` cabinets (fewer games: skip missing ones). */
export function cabsFor(count: number): number[] {
  return PLAYER_CABS.filter((i) => i < count);
}

/**
 * Traveler (now, or where they will be in LOOK_AHEAD seconds at their current pace) within this of a
 * person's own cabinet E spot → step aside. Neighbouring E spots are ~1.1 u apart, so playing next door
 * does not move anyone.
 */
export const YIELD_SPOT = 0.9;
/** Tighter for the prediction, so heading for the next cabinet over doesn't count. */
export const YIELD_AHEAD = 0.6;
export const LOOK_AHEAD = 0.6;
/** …or walking right onto where the person stands (on top of the radii). */
export const YIELD_HOME = 0.3;
/** Extra distance before going back (hysteresis). */
export const YIELD_BACK = 0.8;

/**
 * Should a person stand aside? `dSpot` / `dAhead`: traveler (now / predicted) to the person's cabinet E spot,
 * `dHome`: traveler to the person's playing spot, `radii`: traveler + person radius. Hysteresis keeps them
 * aside until the traveler has clearly moved on.
 */
export function shouldYield(aside: boolean, dSpot: number, dAhead: number, dHome: number, radii: number): boolean {
  const m = aside ? YIELD_BACK : 0;
  return dSpot < YIELD_SPOT + m || dAhead < YIELD_AHEAD || dHome < radii + YIELD_HOME + m;
}

/** Seconds until the next little celebration (deterministic per seed and round). */
export function nextCheer(seed: number, round: number): number {
  const r = Math.abs(Math.sin(seed * 12.9898 + round * 78.233) * 43758.5453) % 1;
  return 9 + r * 14;
}
