import { describe, expect, test } from "bun:test";
import { CANYON } from "../../plan";
import {
  cruzThermal,
  flying,
  isMorning,
  onRim,
  onThermal,
  PASS,
  PERCHES,
  passAt,
  passDuration,
  perchPose,
  riseAt,
  THERMALS,
  thermalFor,
} from "./logic";

describe("condors", () => {
  test("thermals are over the canyon, through the rim's height", () => {
    for (const th of THERMALS) {
      expect(th.s - th.r).toBeGreaterThan(0);
      expect(th.s + th.r).toBeLessThan(CANYON.south);
      expect(th.y0).toBeLessThan(th.y1);
    }
  });

  test("the first four thermals (all that fly on low quality) pass close to the rim road", () => {
    for (const th of THERMALS.slice(0, 4)) {
      // Nearest pass to the road (s ≈ −8) within ~25 u, and reaching above the rim.
      expect(th.s - th.r + 8).toBeLessThan(25);
      expect(th.y1).toBeGreaterThan(20);
    }
  });

  test("in the morning the last two birds go to the Cruz del Cóndor; they roost at night", () => {
    expect(isMorning(0.33)).toBe(true);
    expect(thermalFor(5, 0.33, -470, 6)).toEqual(cruzThermal(-470));
    expect(thermalFor(3, 0.33, -470, 4)).toEqual(cruzThermal(-470));
    expect(thermalFor(0, 0.33, -470, 6)).toBe(THERMALS[0] as (typeof THERMALS)[number]);
    expect(thermalFor(5, 0.55, -470, 6)).toBe(THERMALS[5] as (typeof THERMALS)[number]);
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

  test("a low pass leaves the thermal, goes right over the traveler and rejoins without a jump", () => {
    const a = { x: 100, s: 30, y: 10 };
    const over = { x: 60, s: -8, y: 9 };
    const b = { x: 120, s: 40, y: 20 };
    const p0 = passAt(a, over, b, 0);
    const pm = passAt(a, over, b, 0.5);
    const p1 = passAt(a, over, b, 1);
    expect([p0.x, p0.s, p0.y]).toEqual([a.x, a.s, a.y]);
    expect(pm.x).toBeCloseTo(over.x, 9);
    expect(pm.s).toBeCloseTo(over.s, 9);
    expect(pm.y).toBeCloseTo(over.y, 9);
    expect(p1.x).toBeCloseTo(b.x, 9);
    expect(p1.s).toBeCloseTo(b.s, 9);
    const dur = passDuration(a, over, b);
    expect(dur).toBeGreaterThanOrEqual(PASS.minDur);
    expect(dur).toBeLessThanOrEqual(PASS.maxDur);
  });

  test("low passes only over the rim, never over the pampa", () => {
    expect(onRim(-8)).toBe(true);
    expect(onRim(-12)).toBe(true);
    expect(onRim(-250)).toBe(false);
    expect(onRim(20)).toBe(false);
  });

  test("perches sit on the rim's shoulder, between the road's edge and the lip", () => {
    for (const p of PERCHES) {
      expect(p.s + p.r).toBeLessThan(0);
      expect(p.s - p.r).toBeGreaterThan(-5.4);
    }
    expect(perchPose(0, 0.3, 0).fold).toBe(0);
    expect(perchPose(0, 0.5, 0).fold).toBe(1);
    expect(perchPose(1, 0.3, 0).fold).toBe(1);
  });

  test("the finale flock rises from deep in the canyon to above the rim", () => {
    for (let i = 0; i < 7; i++) {
      expect(riseAt(i, 7, 0).y).toBeLessThan(-100);
      expect(riseAt(i, 7, 20).y).toBeGreaterThan(10);
    }
  });
});
