import { describe, expect, test } from "bun:test";
import { CRAB, type Crab, circle, DIVE, dive, nightAmount, seen, stepCrab } from "./logic";

describe("coast fauna", () => {
  test("seen once within range of any of them", () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 50, z: 0 },
    ];
    expect(seen(pts, 48, 1, 5)).toBe(true);
    expect(seen(pts, 25, 0, 5)).toBe(false);
  });
  test("the pelican's dive: glide, plunge to the water, float, rise", () => {
    expect(dive(1).phase).toBe("glide");
    expect(dive(DIVE.glide + 0.35).phase).toBe("plunge");
    const f = dive(DIVE.glide + DIVE.plunge + 1);
    expect(f.phase).toBe("float");
    expect(f.y).toBe(0);
    expect(dive(DIVE.glide + DIVE.plunge + DIVE.float + 1).phase).toBe("rise");
    // Plunge goes from the glide height down to the water.
    expect(dive(DIVE.glide + DIVE.plunge - 1e-6).y).toBeLessThan(0.01);
  });
  test("gulls fly along their circle", () => {
    const a = circle(0, 10, 0.5, 0);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(10, 6);
    // At angle 0, moving counter-clockwise in x/z: toward +z.
    expect(Math.sin(a.yaw)).toBeCloseTo(0, 6);
    expect(Math.cos(a.yaw)).toBeCloseTo(1, 6);
  });
  test("a crab flees to the water, hides, and comes back when the traveler leaves", () => {
    let c: Crab = { hx: 0, hz: 0, wx: -3, wz: 0, x: 0, z: 0, state: "idle", timer: 0 };
    c = stepCrab(c, 10, 0, 0.1);
    expect(c.state).toBe("idle");
    c = stepCrab(c, 2, 0, 0.1);
    expect(c.state).toBe("run");
    for (let i = 0; i < 40; i++) c = stepCrab(c, 2, 0, 0.1);
    expect(c.state).toBe("hidden");
    for (let i = 0; i < 100; i++) c = stepCrab(c, 2, 0, 0.1);
    expect(c.state).toBe("hidden");
    c = stepCrab(c, 30, 0, CRAB.hide);
    c = stepCrab(c, 30, 0, 0.1);
    expect(c.state).toBe("idle");
    expect(c.x).toBe(0);
  });
});

describe("nightAmount", () => {
  test("full at midnight, none at noon, a ramp through dusk and dawn", () => {
    expect(nightAmount(0)).toBe(1);
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0.9)).toBe(1);
    expect(nightAmount(0.75)).toBeGreaterThan(0);
    expect(nightAmount(0.75)).toBeLessThan(1);
    expect(nightAmount(0.24)).toBeCloseTo(nightAmount(0.76), 6);
  });
});
