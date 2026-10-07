/** Jungle soundscape mixing rules. */
import { describe, expect, test } from "bun:test";
import { bedMix, callGain, callGap, howlerHour, panFor } from "./mix";

describe("jungle soundscape mix", () => {
  test("cicadas by day, the night chorus after dark", () => {
    const noon = bedMix(0.5, 100, false);
    const midnight = bedMix(0, 100, false);
    expect(noon.cicadas).toBeGreaterThan(0.9);
    expect(noon.chorus).toBe(0);
    expect(midnight.cicadas).toBe(0);
    expect(midnight.chorus).toBe(1);
  });

  test("the river is loud on the bank and fades into the forest", () => {
    expect(bedMix(0.5, -3, false).river).toBe(1);
    expect(bedMix(0.5, 20, false).river).toBeGreaterThan(0);
    expect(bedMix(0.5, 20, false).river).toBeLessThan(1);
    expect(bedMix(0.5, 60, false).river).toBe(0);
  });

  test("hushed indoors or during a game", () => {
    expect(bedMix(0.5, 0, true).master).toBe(0);
    expect(bedMix(0.5, 0, false).master).toBe(1);
  });

  test("pan follows the listener's right hand and stays off the hard edges", () => {
    expect(panFor(10, 0, 1, 0)).toBeCloseTo(0.85, 6);
    expect(panFor(-10, 0, 1, 0)).toBeCloseTo(-0.85, 6);
    expect(panFor(0, 10, 1, 0)).toBeCloseTo(0, 6);
    expect(panFor(0, 0, 1, 0)).toBe(0);
  });

  test("calls are louder and more frequent close by, silent past their range", () => {
    expect(callGain(0, 40)).toBe(1);
    expect(callGain(20, 40)).toBeLessThan(callGain(10, 40));
    expect(callGain(40, 40)).toBe(0);
    expect(callGap(5, 40, 2, 0.5)).toBeLessThan(callGap(30, 40, 2, 0.5));
    expect(callGap(50, 40, 2, 0.5)).toBe(Number.POSITIVE_INFINITY);
  });

  test("howlers roar at dawn and dusk only", () => {
    expect(howlerHour(0.25)).toBe(true);
    expect(howlerHour(0.74)).toBe(true);
    expect(howlerHour(0.5)).toBe(false);
    expect(howlerHour(0)).toBe(false);
  });
});
