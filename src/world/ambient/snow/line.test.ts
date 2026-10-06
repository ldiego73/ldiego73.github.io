import { describe, expect, test } from "bun:test";
import { seasonOf } from "../../calendar";
import { CAP_FLOOR, SNOW_MIN, SUMMIT_Y, snowHour, snowLine, stepSpell } from "./line";

describe("snow line", () => {
  test("no snow below the threshold, a summit dusting just above it, lowest in July", () => {
    expect(snowLine(0)).toBe(Number.POSITIVE_INFINITY);
    expect(snowLine(SNOW_MIN)).toBe(Number.POSITIVE_INFINITY);
    expect(snowLine(0.35)).toBeLessThan(SUMMIT_Y);
    expect(snowLine(0.35)).toBeGreaterThan(SUMMIT_Y - 6);
    expect(snowLine(1)).toBeGreaterThanOrEqual(CAP_FLOOR);
    let last = Number.POSITIVE_INFINITY;
    for (let s = 0.31; s <= 1; s += 0.05) {
      expect(snowLine(s)).toBeLessThan(last);
      last = snowLine(s);
    }
  });

  test("calendar: snowy in mid-July, none in February or October", () => {
    expect(Number.isFinite(snowLine(seasonOf(new Date("2026-07-15T12:00:00")).snow))).toBe(true);
    expect(Number.isFinite(snowLine(seasonOf(new Date("2026-06-24T12:00:00")).snow))).toBe(true);
    expect(snowLine(seasonOf(new Date("2026-02-10T12:00:00")).snow)).toBe(Number.POSITIVE_INFINITY);
    expect(snowLine(seasonOf(new Date("2026-10-06T12:00:00")).snow)).toBe(Number.POSITIVE_INFINITY);
  });

  test("snowfall hours and spells", () => {
    expect(snowHour(0.1)).toBe(true);
    expect(snowHour(0.3)).toBe(true);
    expect(snowHour(0.5)).toBe(false);
    expect(snowHour(0.9)).toBe(true);
    const s = { on: false, left: 1 };
    stepSpell(s, 0.5, 0.5);
    expect(s.on).toBe(false);
    stepSpell(s, 0.6, 0.5);
    expect(s.on).toBe(true);
    expect(s.left).toBeGreaterThanOrEqual(80);
  });
});
