import { describe, expect, test } from "bun:test";
import { findCrossing, gentleRun, makePath, type PathSample, ribbonCenterline } from "./path";

const S = (): PathSample => ({ x: 0, y: 0, z: 0, tx: 0, tz: 1, grade: 0 });

describe("duck water path", () => {
  // Straight stream down +z: flat for 2 u, then a 1:1 cascade for 2 u, then flat.
  const path = makePath([0, 5, 0, 0, 5, 1, 0, 5, 2, 0, 4, 3, 0, 3, 4, 0, 3, 5, 0, 3, 6]);

  test("arc length and interpolation", () => {
    expect(path.length).toBeCloseTo(6);
    const s = path.sample(2.5, S());
    expect(s.z).toBeCloseTo(2.5);
    expect(s.y).toBeCloseTo(4.5);
    expect(s.grade).toBeCloseTo(-1);
    expect(s.tz).toBeCloseTo(1);
  });

  test("clamps outside the polyline", () => {
    expect(path.sample(-3, S()).z).toBeCloseTo(0);
    expect(path.sample(99, S()).z).toBeCloseTo(6);
  });

  test("lateral offset goes to the right of the flow", () => {
    // Flow +z, right-hand side (y up) is -x.
    const p = path.at(1, 0.5, S());
    expect(p.x).toBeCloseTo(-0.5);
    expect(p.z).toBeCloseTo(1);
  });

  test("gentle run skips the cascade", () => {
    const run = gentleRun(path, 0, 6, 0.3);
    expect(run).not.toBeNull();
    const [a, b] = run as [number, number];
    expect(b - a).toBeGreaterThan(1.5);
    expect(a < 2 ? b <= 2.05 : a >= 3.95).toBe(true);
    expect(gentleRun(path, 2.1, 3.9, 0.3)).toBeNull();
  });

  test("finds a threshold crossing walking either way", () => {
    const f = (s: number) => Math.abs(s - 3);
    expect(findCrossing(path, 3, 0.1, f, 1.5) ?? 0).toBeCloseTo(4.5, 1);
    expect(findCrossing(path, 3, -0.1, f, 1.5) ?? 0).toBeCloseTo(1.5, 1);
    expect(findCrossing(path, 3, 0.1, f, 9)).toBeNull();
  });

  test("ribbon centerline averages vertex pairs", () => {
    const c = ribbonCenterline([-1, 2, 0, 1, 2, 0, -1, 1, 3, 1, 1, 3]);
    expect(Array.from(c)).toEqual([0, 2, 0, 0, 1, 3]);
  });
});
