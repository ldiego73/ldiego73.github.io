import { describe, expect, test } from "bun:test";
import { devilHours, devilMote, dustLevel, envelope, spawnDevil, stepDevil, wrap } from "./logic";

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length] as number;
};

describe("pampa dust", () => {
  test("devils only in the hot hours", () => {
    expect(devilHours(0.3)).toBe(false);
    expect(devilHours(0.5)).toBe(true);
    expect(devilHours(0.8)).toBe(false);
  });

  test("envelope swells, holds and dies", () => {
    expect(envelope(0, 20)).toBe(0);
    expect(envelope(10, 20)).toBe(1);
    expect(envelope(20, 20)).toBe(0);
    expect(envelope(-1, 20)).toBe(0);
  });

  test("a devil spawns upwind and drifts downwind", () => {
    const d = spawnDevil(0, 0, -1, 0, seq([0.5, 0.5, 0.5, 0.5, 0.5, 0.2, 0.3]));
    // Wind toward −x: upwind is +x.
    expect(d.x).toBeGreaterThan(40);
    const x0 = d.x;
    for (let k = 0; k < 60; k++) stepDevil(d, 0.1, -1, 0);
    expect(d.x).toBeLessThan(x0 - 10);
    let alive = true;
    for (let k = 0; k < 400 && alive; k++) alive = stepDevil(d, 0.1, -1, 0);
    expect(alive).toBe(false);
  });

  test("motes climb a widening, leaning helix", () => {
    const d = spawnDevil(0, 0, 1, 0, seq([0.3, 0.6, 0.4, 0.7, 0.2, 0.9, 0.1]));
    d.age = d.life / 2;
    const low = devilMote(d, 0, 0, 1, 0);
    const high = devilMote(d, 0, 4.5, 1, 0);
    expect(high.y).toBeGreaterThan(low.y);
    expect(Math.hypot(high.x, high.z)).toBeGreaterThan(Math.hypot(low.x, low.z));
    for (let i = 0; i < 60; i++) {
      const m = devilMote(d, i, 2, 1, 0);
      expect(m.a).toBeGreaterThanOrEqual(0);
      expect(m.a).toBeLessThanOrEqual(0.75);
      expect(m.y).toBeLessThanOrEqual(d.h + 1e-6);
    }
  });

  test("wrap keeps values in the box", () => {
    expect(wrap(35, 0, 30)).toBeCloseTo(-25);
    expect(wrap(-31, 0, 30)).toBeCloseTo(29);
    expect(wrap(10, 100, 30)).toBeCloseTo(70);
  });

  test("low dust shows only in gusts, by day", () => {
    expect(dustLevel(0, 1)).toBe(0);
    expect(dustLevel(0.7, 1)).toBeGreaterThan(0.7);
    expect(dustLevel(0.7, 0)).toBe(0);
  });
});
