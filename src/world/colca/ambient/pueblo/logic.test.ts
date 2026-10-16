import { describe, expect, test } from "bun:test";
import { STATION_SPOT } from "../../plan";
import { CHURCH, FLOWERS, FOUNTAIN, HOUSES, STOPS, toWorld } from "./logic";

describe("village plan", () => {
  const r = STATION_SPOT.pueblo.r;
  test("houses and the church stand round the plaza, not on it", () => {
    for (const h of HOUSES) expect(Math.hypot(h.x, h.z) - Math.max(h.w, h.d) / 2).toBeGreaterThan(r - 0.5);
    expect(-(CHURCH.z + CHURCH.d / 2)).toBeGreaterThan(r);
  });

  test("stops are on the plaza and clear of the fountain and the bushes", () => {
    for (const [x, z] of STOPS) {
      expect(Math.hypot(x, z)).toBeLessThan(r);
      expect(Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z)).toBeGreaterThan(FOUNTAIN.r + 0.5);
      for (const [fx, fz] of FLOWERS) expect(Math.hypot(x - fx, z - fz)).toBeGreaterThan(1.5);
    }
  });

  test("frame transform (yaw 0 is the identity; π/2 turns local +z to world +x)", () => {
    expect(toWorld({ x: 1, z: 2, yaw: 0 }, 3, 4)).toEqual({ x: 4, z: 6 });
    const p = toWorld({ x: 0, z: 0, yaw: Math.PI / 2 }, 0, 1);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
});
