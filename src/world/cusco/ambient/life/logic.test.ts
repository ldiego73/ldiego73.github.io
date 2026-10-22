import { describe, expect, test } from "bun:test";
import { CHASQUI, PLAZA, QORI_STELE, USNU } from "../../plan";
import { blocked, destinations, isDay, LOOP, loopAt, loopLength, nightAmount, routeAround, USNU_CLEAR } from "./logic";

const segDist = (a: { x: number; z: number }, b: { x: number; z: number }, p: { x: number; z: number }) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * u, p.z - a.z - dz * u);
};

describe("hub life", () => {
  test("day and night", () => {
    expect(isDay(0.5)).toBe(true);
    expect(isDay(0.02)).toBe(false);
    expect(isDay(0.8)).toBe(false);
  });

  test("destinations are inside the plaza, off the usnu", () => {
    for (const d of destinations()) {
      expect(d.x).toBeGreaterThan(PLAZA.x0);
      expect(d.x).toBeLessThan(PLAZA.x1);
      expect(d.z).toBeGreaterThan(PLAZA.z0);
      expect(d.z).toBeLessThan(PLAZA.z1);
      expect(Math.hypot(d.x - USNU.x, d.z - USNU.z)).toBeGreaterThan(USNU.tiers[0].half);
    }
  });

  test("routes go round the usnu, never across it", () => {
    const c = { x: USNU.x, z: USNU.z };
    const ds = destinations();
    for (const a of ds)
      for (const b of ds) {
        if (a === b) continue;
        const route = routeAround(a, b);
        expect(route[route.length - 1]).toEqual(b);
        let prev = a;
        for (const p of route) {
          expect(segDist(prev, p, c)).toBeGreaterThan(USNU.tiers[0].half + 0.5);
          prev = p;
        }
      }
    expect(routeAround({ x: -20, z: -20 }, { x: 20, z: -20 })).toEqual([{ x: 20, z: -20 }]);
    expect(USNU_CLEAR).toBeGreaterThan(USNU.tiers[0].half);
  });

  test("the caravan loop is continuous and stays inside the plaza, clear of the usnu, stele and post", () => {
    const L = loopLength();
    let prev = loopAt(0);
    for (let s = 0.25; s <= L + 0.01; s += 0.25) {
      const p = loopAt(s);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.3);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(LOOP.hx + 1e-6);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(LOOP.hz + 1e-6);
      expect(Math.hypot(p.x - USNU.x, p.z - USNU.z)).toBeGreaterThan(USNU.tiers[0].half + 3);
      expect(Math.hypot(p.x - QORI_STELE.x, p.z - QORI_STELE.z)).toBeGreaterThan(2);
      expect(p.z).toBeLessThan(CHASQUI.z - CHASQUI.d / 2 - 1);
      // Heading matches the direction of travel.
      const dx = p.x - prev.x;
      const dz = p.z - prev.z;
      expect(Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz).toBeGreaterThan(0);
      prev = p;
    }
  });

  test("the herder waits only for someone ahead of them", () => {
    const h = { x: 0, z: 0, yaw: 0 };
    expect(blocked(h, { x: 0, z: 1.5 })).toBe(true);
    expect(blocked(h, { x: 0, z: -1.5 })).toBe(false);
    expect(blocked(h, { x: 0, z: 4 })).toBe(false);
  });
});

describe("night amount", () => {
  test("0 at noon, 1 at midnight, in between at dusk, never out of range", () => {
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0)).toBe(1);
    const dusk = nightAmount(0.76);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    for (let t = 0; t <= 1; t += 0.01) {
      expect(nightAmount(t)).toBeGreaterThanOrEqual(0);
      expect(nightAmount(t)).toBeLessThanOrEqual(1);
    }
  });
});
