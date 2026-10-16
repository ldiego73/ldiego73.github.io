import { describe, expect, test } from "bun:test";
import { CANYON } from "../../plan";
import { cruzThermal, flying, isMorning, onThermal, riseAt, THERMALS, thermalFor } from "./logic";

describe("condors", () => {
  test("thermals are over the canyon, through the rim's height", () => {
    for (const th of THERMALS) {
      expect(th.s - th.r).toBeGreaterThan(0);
      expect(th.s + th.r).toBeLessThan(CANYON.south);
      expect(th.y0).toBeLessThan(th.y1);
    }
  });

  test("in the morning two birds go to the Cruz del Cóndor; they roost at night", () => {
    expect(isMorning(0.33)).toBe(true);
    expect(thermalFor(0, 0.33, -470)).toEqual(cruzThermal(-470));
    expect(thermalFor(2, 0.33, -470)).toBe(THERMALS[2] as (typeof THERMALS)[number]);
    expect(thermalFor(0, 0.55, -470)).toBe(THERMALS[0] as (typeof THERMALS)[number]);
    expect(flying(0.9)).toBe(false);
    expect(flying(0.5)).toBe(true);
  });

  test("a bird circles its thermal within its altitude band", () => {
    const th = THERMALS[1] as (typeof THERMALS)[number];
    for (let t = 0; t < 200; t += 7) {
      const p = onThermal(th, t, 1);
      expect(Math.hypot(p.x - th.x, p.s - th.s)).toBeCloseTo(th.r, 6);
      expect(p.y).toBeGreaterThanOrEqual(th.y0 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(th.y1 + 1e-9);
    }
  });

  test("the finale flock rises from deep in the canyon to above the rim", () => {
    for (let i = 0; i < 7; i++) {
      expect(riseAt(i, 7, 0).y).toBeLessThan(-100);
      expect(riseAt(i, 7, 20).y).toBeGreaterThan(10);
    }
  });
});
