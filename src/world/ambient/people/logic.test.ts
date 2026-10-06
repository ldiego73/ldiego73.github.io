import { describe, expect, test } from "bun:test";
import { ringDetour } from "./dancers";
import { alongTread, dayDiff, findTread, fleeTarget, headcount, jumped, steer, WORK, within } from "./logic";

describe("schedule", () => {
  test("within handles windows that wrap midnight", () => {
    expect(within(0.5, WORK[0], WORK[1])).toBe(true);
    expect(within(0.8, WORK[0], WORK[1])).toBe(false);
    expect(within(0.9, 0.77, 0.2)).toBe(true);
    expect(within(0.1, 0.77, 0.2)).toBe(true);
    expect(within(0.5, 0.77, 0.2)).toBe(false);
  });
  test("dayDiff is the short way round", () => {
    expect(dayDiff(0.95, 0.05)).toBeCloseTo(0.1);
    expect(dayDiff(0.05, 0.95)).toBeCloseTo(-0.1);
  });
  test("jumped flags clock jumps but not normal frames", () => {
    expect(jumped(0.5, 0.50001, 1 / 60)).toBe(false);
    expect(jumped(0.5, 0.9, 1 / 60)).toBe(true);
    expect(jumped(0.999, 0.0001, 1 / 60)).toBe(false);
  });
});

describe("steer", () => {
  const out = { x: 0, z: 0 };
  test("keeps the heading with nothing ahead", () => {
    steer(0, 0, 0, 1, 0.35, [{ x: 0, z: -2, r: 0.4 }], 2, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(1);
  });
  test("bends away from a body straight ahead, to the free side", () => {
    steer(0, 0, 0, 1, 0.35, [{ x: 0.2, z: 1.2, r: 0.4 }], 2, out);
    expect(out.x).toBeLessThan(-0.2);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1);
  });
  test("ignores bodies off to the side", () => {
    steer(0, 0, 0, 1, 0.35, [{ x: 3, z: 1, r: 0.4 }], 2, out);
    expect(out.x).toBeCloseTo(0);
  });
});

describe("fleeTarget", () => {
  test("runs away from the traveler, kept inside the area", () => {
    const out = { x: 0, z: 0 };
    fleeTarget(1, 0, 0, 0, 0, 0, 10, 3, out);
    expect(out.x).toBeCloseTo(4);
    fleeTarget(3, 0, 0, 0, 0, 0, 4, 3, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(4);
  });
});

describe("terrace treads", () => {
  // Synthetic stepped slope rising along +z: flats 2 u deep, risers between.
  const height = (_x: number, z: number) => Math.floor(z / 2) * 1.5;
  const ok = (x: number) => Math.abs(x) < 9;
  test("follows the flat along the contour and stops at the edges", () => {
    const t = findTread(height, ok, 0, 1, { minLen: 4, maxLen: 30 });
    expect(t).not.toBeNull();
    if (!t) return;
    expect(t.length).toBeGreaterThan(14);
    for (let i = 1; i < t.pts.length; i += 2) expect(Math.abs((t.pts[i] as number) - 1)).toBeLessThan(0.3);
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    alongTread(t, t.length / 2, p);
    expect(Math.abs(p.dx)).toBeCloseTo(1);
  });
  test("rejects short flats", () => {
    expect(findTread(height, (x) => Math.abs(x) < 1.5, 0, 1, { minLen: 6 })).toBeNull();
  });
});

test("low quality means fewer people", () => {
  const h = headcount("high");
  const l = headcount("low");
  expect(l.perSite * l.sites + l.children + l.shoppers).toBeLessThan(h.perSite * h.sites + h.children + h.shoppers);
});

test("dancers bend outward around festival obstacles on the ring", () => {
  const obs = [{ a: 0, r: 5, s: 0.95 }];
  expect(ringDetour(0, 4.85, obs)).toBeCloseTo(5 + 0.95 + 0.45 - 4.85);
  expect(ringDetour(Math.PI / 2, 4.85, obs)).toBe(0);
  const mid = ringDetour(0.33, 4.85, obs);
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(1.55);
});
