import { describe, expect, test } from "bun:test";
import { createGovernor, DEFAULT_GOVERNOR, deviceProfile, LEVELS } from "./quality";

const run = (g: ReturnType<typeof createGovernor>, fps: number, seconds: number) => {
  const ms = 1000 / fps;
  for (let t = 0; t < seconds * 1000; t += ms) g.sample(ms);
};

describe("quality governor", () => {
  test("ignores the warm-up and holds at a healthy frame rate", () => {
    const steps: number[] = [];
    const g = createGovernor((l) => steps.push(l));
    run(g, 20, 1.9);
    run(g, 60, 20);
    expect(steps).toEqual([]);
    expect(g.level()).toBe(0);
  });

  test("steps down after ~2 s under 45 fps, one level at a time", () => {
    const steps: number[] = [];
    const g = createGovernor((l) => steps.push(l));
    run(g, 60, 2);
    run(g, 30, 1.6);
    expect(steps).toEqual([]);
    run(g, 30, 0.7);
    expect(steps).toEqual([1]);
    run(g, 30, 2.2);
    expect(steps).toEqual([1, 2]);
    run(g, 30, 20);
    expect(g.level()).toBe(LEVELS.length - 1);
  });

  test("steps up after ~10 s above 58 fps, with a longer wait after a bounce", () => {
    const steps: number[] = [];
    // Original 40 fps / 3 s thresholds: this test is about the climb and the bounce, not the drop.
    const g = createGovernor((l) => steps.push(l), { ...DEFAULT_GOVERNOR, lowFps: 40, downAfter: 3 });
    run(g, 60, 2);
    run(g, 30, 3.5);
    expect(g.level()).toBe(1);
    run(g, 60, 9);
    expect(g.level()).toBe(1);
    run(g, 60, 1.5);
    expect(g.level()).toBe(0);
    // Drops again soon after: a bounce, so the next climb needs ~20 s.
    run(g, 30, 3.5);
    expect(g.level()).toBe(1);
    run(g, 60, 12);
    expect(g.level()).toBe(1);
    run(g, 60, 10);
    expect(g.level()).toBe(0);
  });

  test("long gaps (hidden tab) reset the window instead of counting as slow frames", () => {
    const steps: number[] = [];
    const g = createGovernor((l) => steps.push(l));
    run(g, 60, 2);
    for (let i = 0; i < 20; i++) g.sample(2000);
    run(g, 60, 5);
    expect(steps).toEqual([]);
  });

  test("disabled governor never steps", () => {
    const steps: number[] = [];
    const g = createGovernor((l) => steps.push(l));
    g.setEnabled(false);
    run(g, 10, 20);
    expect(steps).toEqual([]);
  });
});

describe("device profile", () => {
  test("phones: touch + small screen; constrained when few cores or little memory", () => {
    expect(deviceProfile({ coarse: true, minSide: 390, cores: 8, memory: 8 })).toEqual({
      phone: true,
      constrained: false,
    });
    expect(deviceProfile({ coarse: true, minSide: 390, cores: 6, memory: 4 })).toEqual({
      phone: true,
      constrained: true,
    });
    // iOS reports no deviceMemory: decided by the cores alone.
    expect(deviceProfile({ coarse: true, minSide: 375, cores: 4 }).constrained).toBe(true);
  });

  test("desktops, touch laptops and big tablets get no extra cuts", () => {
    expect(deviceProfile({ coarse: false, minSide: 390, cores: 2, memory: 2 })).toEqual({
      phone: false,
      constrained: false,
    });
    expect(deviceProfile({ coarse: true, minSide: 1024, cores: 4 }).phone).toBe(false);
    expect(deviceProfile({ coarse: true, minSide: 744, cores: 4 }).phone).toBe(false);
    expect(deviceProfile({ coarse: true, minSide: 0 }).phone).toBe(false);
  });
});
