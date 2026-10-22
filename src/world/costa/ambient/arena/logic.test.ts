import { describe, expect, test } from "bun:test";
import { activation, CALM_SHARE, createGrains, type GrainContext, RADIUS, stepGrains } from "./logic";

const seeded = (s: number) => () => {
  s = (s * 16807) % 2147483647;
  return s / 2147483647;
};

const ctx = (over: Partial<GrainContext> = {}): GrainContext => ({
  fx: 0,
  fz: 0,
  wind: () => ({ x: 1, z: 0, gust: 0 }),
  gustAmp: 0.3,
  ground: () => 2,
  isSand: () => true,
  rand: seeded(7),
  ...over,
});

describe("blown sand", () => {
  test("grains spawn round the traveler and drift downwind", () => {
    const g = createGrains(200);
    const c = ctx();
    stepGrains(g, 0.016, c);
    for (let i = 0; i < g.n; i++) expect(Math.hypot(g.x[i] as number, g.z[i] as number)).toBeLessThan(RADIUS * 1.6);
    const x0 = Array.from(g.x);
    stepGrains(g, 0.1, c);
    let moved = 0;
    for (let i = 0; i < g.n; i++) if ((g.x[i] as number) > (x0[i] as number)) moved++;
    expect(moved).toBeGreaterThan(g.n * 0.9);
  });

  test("grains sit on the ground and hop only a little", () => {
    const g = createGrains(100);
    for (let k = 0; k < 30; k++) stepGrains(g, 0.05, ctx());
    for (let i = 0; i < g.n; i++) {
      expect(g.y[i] as number).toBeGreaterThanOrEqual(2);
      expect(g.y[i] as number).toBeLessThan(2.8);
    }
  });

  test("a gust shows many more grains than calm air", () => {
    const vis = (gust: number) => {
      const g = createGrains(400);
      const c = ctx({ wind: () => ({ x: 1, z: 0, gust }) });
      for (let k = 0; k < 40; k++) stepGrains(g, 0.05, c);
      return g.alpha.reduce((a, b) => a + b, 0);
    };
    expect(vis(0.3)).toBeGreaterThan(vis(0) * 2.5);
  });

  test("activation is a soft step at the gust share", () => {
    expect(activation(0, 0)).toBeGreaterThan(0.9);
    expect(activation(CALM_SHARE + 0.3, 0)).toBe(0);
    expect(activation(0.9, 1)).toBe(1);
  });

  test("no grains over water", () => {
    const g = createGrains(100);
    for (let k = 0; k < 10; k++) stepGrains(g, 0.05, ctx({ isSand: () => false }));
    expect(g.alpha.every((a) => a === 0)).toBe(true);
  });

  test("still air (reduced motion: no gust amplitude) keeps only the thin drift", () => {
    const g = createGrains(400);
    const c = ctx({ gustAmp: 0, wind: () => ({ x: 0.6, z: 0, gust: 0 }) });
    for (let k = 0; k < 40; k++) stepGrains(g, 0.05, c);
    const shown = g.alpha.filter((a) => a > 0.01).length;
    expect(shown).toBeLessThan(g.n * (CALM_SHARE + 0.15));
  });
});
