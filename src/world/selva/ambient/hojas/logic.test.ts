import { describe, expect, test } from "bun:test";
import { FALL, type Leaf, leafScale, REST, releaseRate, stepLeaf } from "./logic";

const leaf = (o: Partial<Leaf> = {}): Leaf => ({
  x: 0,
  y: 12,
  z: 0,
  rx: 0,
  rz: 0.4,
  wx: 1,
  wz: 0.7,
  ph: 0,
  w: 3,
  rest: -1,
  tint: 0,
  s: 1,
  live: true,
  ...o,
});

describe("release rate", () => {
  test("a trickle in still air, a flurry in a gust", () => {
    const still = releaseRate(0, 0.35, false);
    const gust = releaseRate(0.35, 0.35, false);
    expect(still).toBeGreaterThan(0);
    expect(gust).toBeGreaterThan(still * 8);
    expect(releaseRate(0.2, 0.35, false)).toBeLessThan(gust);
  });
  test("reduced motion: no flurry", () => {
    expect(releaseRate(0.35, 0.35, true)).toBeLessThan(releaseRate(0, 0.35, false));
    expect(releaseRate(0.35, 0.35, true)).toBe(releaseRate(0, 0.35, true));
  });
});

describe("a falling leaf", () => {
  test("falls slowly, lands, rests, then returns to the pool", () => {
    const l = leaf();
    let t = 0;
    while (l.rest < 0 && t < 60) {
      stepLeaf(l, 1 / 60, { x: 0, z: 0 }, 2);
      t += 1 / 60;
    }
    // 10 u at about the terminal speed (with the glide between 0.6× and 1.2×).
    expect(t).toBeGreaterThan(10 / (FALL * 1.2));
    expect(t).toBeLessThan(10 / (FALL * 0.6) + 0.1);
    expect(l.y).toBeCloseTo(2.03, 5);
    const at = [l.x, l.z];
    for (let k = 0; k < 60 * (REST - 1); k++) stepLeaf(l, 1 / 60, { x: 3, z: 3 }, 2);
    expect([l.x, l.z]).toEqual(at);
    expect(leafScale(l)).toBeCloseTo(1, 1);
    for (let k = 0; k < 90; k++) stepLeaf(l, 1 / 60, { x: 0, z: 0 }, 2);
    expect(l.live).toBe(false);
    expect(leafScale(l)).toBe(0);
  });
  test("drifts downwind", () => {
    const still = leaf();
    const blown = leaf();
    for (let k = 0; k < 300; k++) {
      stepLeaf(still, 1 / 60, { x: 0, z: 0 }, -100);
      stepLeaf(blown, 1 / 60, { x: 0.6, z: -0.2 }, -100);
    }
    expect(blown.x - still.x).toBeGreaterThan(2);
    expect(blown.z - still.z).toBeLessThan(-0.5);
  });
  test("reduced motion falls slower", () => {
    const a = leaf();
    const b = leaf();
    for (let k = 0; k < 120; k++) {
      stepLeaf(a, 1 / 60, { x: 0, z: 0 }, -100);
      stepLeaf(b, 1 / 60, { x: 0, z: 0 }, -100, 0.5);
    }
    expect(12 - b.y).toBeLessThan(12 - a.y);
  });
});
