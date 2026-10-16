import { describe, expect, test } from "bun:test";
import { prng } from "../khipu/logic";
import { FLEE_R, flightAt, LAND_AWAY, onFlagstones, pickLanding, shouldFlee } from "./logic";

describe("plaza doves", () => {
  test("they land on open flagstones away from the traveler", () => {
    const r = prng(9);
    for (let i = 0; i < 200; i++) {
      const avoid = { x: (r() - 0.5) * 50, z: (r() - 0.5) * 36 };
      const s = pickLanding(r, avoid, { x: avoid.x + 1, z: avoid.z });
      expect(onFlagstones(s.x, s.z)).toBe(true);
      expect(Math.hypot(s.x - avoid.x, s.z - avoid.z)).toBeGreaterThanOrEqual(LAND_AWAY - 1e-9);
    }
    expect(onFlagstones(0, 0)).toBe(false);
  });

  test("a flight arcs up and lands where it was going", () => {
    const a = { x: 0, z: 10 };
    const b = { x: 10, z: 10 };
    expect(flightAt(a, b, 0, 3)).toMatchObject({ x: 0, y: 0, z: 10 });
    expect(flightAt(a, b, 0.5, 3).y).toBeCloseTo(3, 6);
    expect(flightAt(a, b, 1, 3)).toMatchObject({ x: 10, y: 0, z: 10 });
    expect(flightAt(a, b, 0.5, 3).yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  test("they take off when the traveler comes close", () => {
    expect(shouldFlee({ x: 0, z: 0 }, { x: FLEE_R - 0.1, z: 0 })).toBe(true);
    expect(shouldFlee({ x: 0, z: 0 }, { x: FLEE_R + 0.1, z: 0 })).toBe(false);
  });
});
