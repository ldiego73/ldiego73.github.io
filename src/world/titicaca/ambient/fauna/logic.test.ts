import { describe, expect, test } from "bun:test";
import { daylight, diveDepth, frogSurface, LookTimer, rng, soarPose, stepDive, wanderTarget } from "./logic";

describe("lake fauna rules", () => {
  test("a good look fires once", () => {
    const t = new LookTimer(1);
    let fired = 0;
    for (let i = 0; i < 100; i++) if (t.update(0.05, true)) fired++;
    expect(fired).toBe(1);
    const u = new LookTimer(1);
    u.update(0.5, true);
    u.update(0.5, false);
    expect(u.t).toBe(0);
  });

  test("the grebe's dive goes down, under, up and floats again", () => {
    const R = rng(3);
    let s = { phase: "float" as const as "float" | "down" | "under" | "up", timer: 5 };
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const n = stepDive(s.phase, s.timer, 0.05, i === 10, R);
      s = { phase: n.phase, timer: n.timer };
      seen.add(s.phase);
    }
    expect([...seen].sort()).toEqual(["down", "float", "under", "up"]);
    expect(diveDepth("float", 1)).toBe(0);
    expect(diveDepth("under", 1)).toBeGreaterThan(0.5);
  });

  test("wander targets stay in the home circle and pass the rule", () => {
    const R = rng(9);
    for (let i = 0; i < 50; i++) {
      const t = wanderTarget({ x: 10, z: 10, r: 5 }, R, (x) => x > 10);
      expect(Math.hypot(t.x - 10, t.z - 10)).toBeLessThanOrEqual(5);
      expect(t.x >= 10).toBe(true);
    }
  });

  test("gull circles, the frog's surfacing and daylight", () => {
    const p = soarPose({ x: 0, z: 0, r: 10, y: 12, w: 0.3, ph: 0 }, 2);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(10, 6);
    expect(frogSurface(1, false)).toBeGreaterThan(0);
    expect(frogSurface(30, false)).toBe(0);
    expect(frogSurface(30, true)).toBe(0);
    expect(daylight(0.5)).toBe(1);
    expect(daylight(0)).toBe(0);
  });
});
