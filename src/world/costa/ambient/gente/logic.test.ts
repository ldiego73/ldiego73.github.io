import { describe, expect, test } from "bun:test";
import { isDay, laneTarget, shoreRun } from "./logic";

describe("coast people", () => {
  test("out by day only", () => {
    expect(isDay(0.5)).toBe(true);
    expect(isDay(0.26)).toBe(false);
    expect(isDay(0.8)).toBe(false);
  });
  test("walkers keep to their right", () => {
    const out = { x: 0, z: 0 };
    // Walking north (−z): their right is east (+x).
    laneTarget(0, 0, 0, -1, 1, out);
    expect(out.x).toBeCloseTo(1.2, 6);
    // Walking back south: their right is west.
    laneTarget(0, 0, 0, -1, -1, out);
    expect(out.x).toBeCloseTo(-1.2, 6);
  });
  test("children run down to the water and back", () => {
    expect(shoreRun(0, false).out).toBeCloseTo(0, 6);
    expect(shoreRun(2.7, false).out).toBeCloseTo(4.5, 6);
    expect(shoreRun(5.99, false).out).toBeLessThan(0.1);
    expect(shoreRun(2.7, true).out).toBe(0);
  });
});
