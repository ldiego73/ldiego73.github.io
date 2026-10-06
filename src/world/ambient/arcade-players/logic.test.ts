import { describe, expect, test } from "bun:test";
import { cabsFor, nextCheer, PLAYER_CABS, roster, shouldYield, YIELD_AHEAD, YIELD_SPOT } from "./logic";

describe("arcade players roster", () => {
  test("full hall by day, kids only in daylight", () => {
    expect(roster(0.5, false)).toEqual({ players: 4, kids: 2 });
    expect(roster(0.5, true)).toEqual({ players: 2, kids: 1 });
    expect(roster(0.86, false)).toEqual({ players: 4, kids: 0 });
  });
  test("one or two night owls late, empty before dawn", () => {
    expect(roster(0.97, false)).toEqual({ players: 2, kids: 0 });
    expect(roster(0.05, true)).toEqual({ players: 1, kids: 0 });
    expect(roster(0.2, false)).toEqual({ players: 0, kids: 0 });
  });
  test("central cabinets stay free", () => {
    for (const c of [3, 4, 5]) expect(PLAYER_CABS as readonly number[]).not.toContain(c);
    expect(cabsFor(9)).toEqual([6, 2, 0, 8]);
    expect(cabsFor(5)).toEqual([2, 0]);
  });
});

describe("giving way", () => {
  test("steps aside when the traveler heads for its cabinet spot, comes back with hysteresis", () => {
    expect(shouldYield(false, YIELD_SPOT - 0.1, 5, 5, 0.67)).toBe(true);
    expect(shouldYield(false, 3, YIELD_AHEAD - 0.1, 5, 0.67)).toBe(true);
    expect(shouldYield(false, 3, YIELD_AHEAD + 0.2, 5, 0.67)).toBe(false);
    expect(shouldYield(false, YIELD_SPOT + 0.3, 3, 5, 0.67)).toBe(false);
    expect(shouldYield(true, YIELD_SPOT + 0.3, 3, 5, 0.67)).toBe(true);
    expect(shouldYield(true, YIELD_SPOT + 1, 3, 5, 0.67)).toBe(false);
  });
  test("playing at the next cabinet (~1.1 u away) does not move anyone", () => {
    expect(shouldYield(false, 1.125, 1.125, 1.17, 0.68)).toBe(false);
  });
  test("also when the traveler walks onto where it stands", () => {
    expect(shouldYield(false, 4, 4, 0.8, 0.67)).toBe(true);
  });
  test("celebrations are spaced", () => {
    for (let r = 0; r < 20; r++) {
      const s = nextCheer(3.1, r);
      expect(s).toBeGreaterThanOrEqual(9);
      expect(s).toBeLessThan(23);
    }
  });
});
