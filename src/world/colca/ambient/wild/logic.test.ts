import { describe, expect, test } from "bun:test";
import { fleeFrom, foxHours, hoverPlan, seenWithin } from "./logic";

describe("Kuntisuyu wildlife helpers", () => {
  test("fleeing heads away from the traveler but stays on the home range", () => {
    const t = fleeFrom({ x: 0, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 0 }, 50, 10);
    expect(t.x).toBeCloseTo(10, 6);
    const c = fleeFrom({ x: 20, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, 25, 10);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(25, 6);
  });

  test("hummingbird plan picks two different flowers and a dart fraction", () => {
    for (let t = 0; t < 60; t += 0.37) {
      const p = hoverPlan(t, 6, 2);
      expect(p.from).not.toBe(p.to);
      expect(p.from).toBeLessThan(6);
      expect(p.k).toBeGreaterThanOrEqual(0);
      expect(p.k).toBeLessThanOrEqual(1);
    }
  });

  test("fox hours and the seen test", () => {
    expect(foxHours(0.8)).toBe(true);
    expect(foxHours(0.1)).toBe(true);
    expect(foxHours(0.5)).toBe(false);
    expect(seenWithin({ x: 0, z: 0 }, { x: 3, z: 4 }, 6)).toBe(true);
  });
});
