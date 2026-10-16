import { describe, expect, test } from "bun:test";
import { callGain, callGap, panFor, surf, wind } from "./mix";

describe("coast soundscape mix", () => {
  test("the surf is loud by the water and faint far inland", () => {
    expect(surf(0, 0)).toBeGreaterThan(surf(80, 0));
    expect(surf(200, 0)).toBeLessThan(0.15);
    for (let t = 0; t < 12; t += 0.5) {
      expect(surf(2, t)).toBeGreaterThan(0);
      expect(surf(2, t)).toBeLessThanOrEqual(1);
    }
  });
  test("wind rises on the cliffs", () => {
    expect(wind(15, false)).toBeGreaterThan(wind(1, false));
    expect(wind(1, true)).toBeGreaterThan(wind(1, false));
  });
  test("pan, gain and call gaps", () => {
    expect(panFor(1, 0, 1, 0)).toBeCloseTo(0.85, 6);
    expect(panFor(-1, 0, 1, 0)).toBeCloseTo(-0.85, 6);
    expect(callGain(50, 40)).toBe(0);
    expect(callGain(0, 40)).toBe(1);
    expect(callGap(50, 40, 3, 0.5)).toBe(Number.POSITIVE_INFINITY);
    expect(callGap(5, 40, 3, 0.5)).toBeLessThan(callGap(30, 40, 3, 0.5));
  });
});
