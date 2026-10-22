import { describe, expect, test } from "bun:test";
import { angleDamp, damp, rng } from "./util";

describe("damp", () => {
  test("approaches the target without overshooting", () => {
    const v = damp(0, 10, 4, 0.1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
    expect(damp(0, 10, 4, 100)).toBeCloseTo(10, 6);
    expect(damp(3, 3, 4, 0.1)).toBe(3);
  });
  test("is frame-rate independent", () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = damp(a, 1, 3, 0.01);
    expect(a).toBeCloseTo(damp(0, 1, 3, 0.1), 10);
  });
});

describe("angleDamp", () => {
  test("turns the short way across ±π", () => {
    const v = angleDamp(Math.PI - 0.1, -Math.PI + 0.1, 5, 0.05);
    expect(v).toBeGreaterThan(Math.PI - 0.1);
  });
  test("settles on the target angle", () => {
    expect(angleDamp(0, 1, 5, 100)).toBeCloseTo(1, 6);
  });
});

describe("rng", () => {
  test("is deterministic per seed and stays in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 200; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  test("seed 0 does not get stuck", () => {
    const r = rng(0);
    expect(r()).not.toBe(r());
  });
  test("different seeds give different sequences", () => {
    expect(rng(1)()).not.toBe(rng(2)());
  });
});
