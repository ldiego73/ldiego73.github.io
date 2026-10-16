import { describe, expect, test } from "bun:test";
import { landField } from "../../layout";
import { ISLAND_Y, ISLANDS } from "../../plan";
import { isDay, LOOPS, loopPose, spots, WALK_T } from "./logic";

describe("the lake's people", () => {
  test("islanders stand on the island floors, the rest on land", () => {
    for (const s of spots()) {
      if (s.y === ISLAND_Y) expect(ISLANDS.some((i) => Math.hypot(s.x - i.x, s.z - i.z) < i.r - 0.5)).toBe(true);
      else expect(landField(s.x, s.z)).toBeGreaterThan(1);
    }
    expect(spots().filter((s) => s.night).length).toBeGreaterThan(0);
  });

  test("the fishermen's loops stay on open water, clear of the islands", () => {
    for (const l of LOOPS)
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const p = loopPose(l, a);
        expect(landField(p.x, p.z)).toBeLessThan(-8);
        for (const i of ISLANDS) expect(Math.hypot(p.x - i.x, p.z - i.z)).toBeGreaterThan(i.r + 4);
      }
  });

  test("day hours and the walkers' stretch", () => {
    expect(isDay(0.5)).toBe(true);
    expect(isDay(0.05)).toBe(false);
    expect(WALK_T[0]).toBeLessThan(WALK_T[1]);
  });
});
