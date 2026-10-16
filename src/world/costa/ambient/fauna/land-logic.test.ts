import { describe, expect, test } from "bun:test";
import { chase, stepWander, turnToward, wanderer, waterEdge } from "./land-logic";
import { prng } from "./logic";

const O = { pace: 1, graze: 0.5, rest: [1, 2] as [number, number] };

describe("wandering animals", () => {
  test("stay within range of home and only where allowed", () => {
    const w = wanderer(0, 0, 5);
    const R = prng(7);
    const ok = (x: number) => x > -2;
    for (let i = 0; i < 4000; i++) {
      stepWander(w, 0.05, O, R, ok);
      expect(Math.hypot(w.x, w.z)).toBeLessThanOrEqual(5 + 1e-6);
      expect(w.x).toBeGreaterThan(-2);
    }
  });
  test("walk, then rest (standing or grazing), then walk again", () => {
    const w = wanderer(0, 0, 6);
    const R = prng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(stepWander(w, 0.05, O, R, () => true).state);
    expect(seen.has("walk")).toBe(true);
    expect(seen.has("graze")).toBe(true);
    expect(seen.has("idle")).toBe(true);
  });
  test("turn the short way, capped", () => {
    expect(turnToward(0, 0.1, 1)).toBeCloseTo(0.1, 6);
    expect(turnToward(0, 2, 0.5)).toBeCloseTo(0.5, 6);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 6);
  });
});

describe("sanderlings", () => {
  test("find the water's edge across the beach", () => {
    expect(waterEdge((d) => d > 2.3, -4, 10, 0.5)).toBeCloseTo(2.3, 1);
    expect(waterEdge(() => true, -4, 10, 0.5)).toBe(-4);
    expect(waterEdge(() => false, -4, 10, 0.5)).toBe(10);
  });
  test("scurry toward it at their pace", () => {
    expect(chase(0, 1, 2, 0.1)).toBeCloseTo(0.2, 6);
    expect(chase(0, 0.1, 2, 0.1)).toBe(0.1);
    expect(chase(1, 0, 2, 0.1)).toBeCloseTo(0.8, 6);
  });
});
