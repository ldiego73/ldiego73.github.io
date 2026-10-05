import { describe, expect, test } from "bun:test";
import { baseline, CAP, createIntensity, intensityOf, START } from "./intensity";

describe("intensity", () => {
  test("starts per difficulty and grows monotonically toward ~0.8 in about 3 minutes", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      expect(baseline(0, d)).toBeCloseTo(START[d]);
      let prev = -1;
      for (let t = 0; t <= 300; t += 5) {
        const v = baseline(t, d);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(baseline(180, d)).toBeCloseTo(0.8);
      expect(baseline(900, d)).toBeCloseTo(0.8);
    }
    expect(START.easy).toBeLessThan(START.normal);
    expect(START.normal).toBeLessThan(START.hard);
  });

  test("score bursts bump intensity and the bump decays", () => {
    const calm = createIntensity("normal");
    const hot = createIntensity("normal");
    calm.tick(10);
    hot.tick(10);
    for (let i = 1; i <= 6; i++) hot.score(i * 10);
    expect(hot.value).toBeGreaterThan(calm.value);
    const peak = hot.value;
    hot.tick(3);
    calm.tick(3);
    expect(hot.value).toBeLessThan(peak);
    hot.tick(30);
    calm.tick(30);
    expect(hot.value).toBeCloseTo(calm.value, 1);
  });

  test("score drops (new run) do not bump", () => {
    const t = createIntensity("normal");
    t.score(50);
    t.tick(60);
    const before = t.value;
    t.score(0);
    expect(t.value).toBeCloseTo(before);
  });

  test("clamps to the cap even with huge bumps and game values", () => {
    const t = createIntensity("hard");
    t.tick(10_000);
    for (let i = 1; i < 50; i++) t.score(i);
    expect(t.value).toBeLessThanOrEqual(CAP);
    expect(intensityOf(0, "easy", 99, 5)).toBe(CAP);
    expect(intensityOf(0, "easy", -1, -3)).toBeCloseTo(START.easy);
    expect(intensityOf(0, "easy", 0, Number.NaN)).toBeCloseTo(START.easy);
  });

  test("a game override raises but never lowers the baseline", () => {
    const t = createIntensity("normal");
    t.game(0.6);
    expect(t.value).toBeCloseTo(0.6);
    t.game(0.05);
    expect(t.value).toBeCloseTo(START.normal);
    t.tick(180);
    t.game(0.3);
    expect(t.value).toBeCloseTo(0.8);
  });

  test("tick ignores non-positive dt and reset restores the start", () => {
    const t = createIntensity("easy");
    t.tick(-5);
    t.tick(0);
    expect(t.value).toBeCloseTo(START.easy);
    t.tick(100);
    t.game(0.7);
    t.reset("hard");
    expect(t.value).toBeCloseTo(START.hard);
  });
});
