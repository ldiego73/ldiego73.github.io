import { describe, expect, test } from "bun:test";
import { landField } from "../../layout";
import { ISLAND_Y, ISLANDS, SHEEP, TITIKALA } from "../../plan";
import {
  gathering,
  isDay,
  LOOPS,
  loopPose,
  spots,
  stepTraveller,
  TRAVEL_HIDE,
  TRAVEL_T,
  type Traveller,
  travellers,
  WALK_T,
} from "./logic";

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

describe("the offering at Titikala", () => {
  const T = TITIKALA;
  const clear = (x: number, z: number) => {
    // Rock box, table, stela, ring stones, board (../titikala.ts colliders) plus a person's radius.
    const inRock = x > T.x - 5.6 - 0.4 && x < T.x + 5.2 + 0.4 && z > T.z - 5.5 - 2 && z < T.z - 5.5 + 2.2;
    return (
      !inRock &&
      Math.hypot(x - T.x, z - (T.z - 1.4)) > 1.8 &&
      Math.hypot(x - T.x, z - (T.z - 9.6)) > 1.6 &&
      Math.hypot(x - T.x, z - T.z) < T.r - 1.2 &&
      Math.hypot(x - (T.x - 4.2), z - (T.z + T.r - 2)) > 1.8
    );
  };
  for (const high of [true, false])
    test(`spots clear the finale's colliders and the walk to the rock (${high ? "high" : "low"})`, () => {
      const g = gathering(high);
      expect(g.length).toBe(high ? 8 : 5);
      for (const s of g) {
        // Kids run a 1.4 circle round their spot.
        const r = s.role === "kid" ? 1.4 : 0;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const x = s.x + Math.cos(a) * r;
          const z = s.z + Math.sin(a) * r;
          expect(clear(x, z)).toBe(true);
          if (z > T.z - 1.4) expect(Math.abs(x - T.x)).toBeGreaterThan(3);
        }
      }
      expect(g.some((s) => s.role === "paqo" && s.night)).toBe(true);
    });
});

describe("travellers on the road", () => {
  const always = () => true;
  const never = () => false;
  test("turn back at an end when in sight", () => {
    const s: Traveller = { u: TRAVEL_T[1] - 0.0001, dir: 1 };
    stepTraveller(s, 1, 1.1, 670, never, Math.random);
    expect(s.dir).toBe(-1);
    expect(s.u).toBeLessThanOrEqual(TRAVEL_T[1]);
  });
  test("reappear elsewhere when out of sight", () => {
    const s: Traveller = { u: TRAVEL_T[0] + 0.00001, dir: -1 };
    let k = 0;
    const seq = [0.5, 0.2];
    stepTraveller(s, 1, 1.1, 670, always, () => seq[k++ % 2] as number);
    expect(s.u).toBeCloseTo(TRAVEL_T[0] + 0.5 * (TRAVEL_T[1] - TRAVEL_T[0]), 6);
    expect(s.dir).toBe(1);
  });
  test("spread along the whole road, both ways", () => {
    const list = travellers(8);
    expect(Math.min(...list.map((t) => t.u))).toBeLessThan(0.15);
    expect(Math.max(...list.map((t) => t.u))).toBeGreaterThan(0.85);
    expect(new Set(list.map((t) => t.dir)).size).toBe(2);
    expect(TRAVEL_HIDE).toBeGreaterThan(100);
  });
  test("the shepherdess stands by her flock on land", () => {
    const sp = spots().find((s) => s.role === "spin" && Math.hypot(s.x - SHEEP.x, s.z - SHEEP.z) < SHEEP.r + 3);
    expect(sp).toBeDefined();
    if (sp) expect(landField(sp.x, sp.z)).toBeGreaterThan(5);
  });
});
