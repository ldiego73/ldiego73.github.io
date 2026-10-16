import { describe, expect, test } from "bun:test";
import { pickSpot, rectAabb, toLocal, toWorld, yearsLabel } from "./logic";

describe("coast station frames", () => {
  const f = { x: 10, z: -4, y: 2, yaw: Math.PI / 2 };
  test("local +Z turns with the yaw and round-trips", () => {
    const p = toWorld(f, 0, 3);
    expect(p.x).toBeCloseTo(13, 6);
    expect(p.z).toBeCloseTo(-4, 6);
    const q = toLocal(f, p.x, p.z);
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.z).toBeCloseTo(3, 6);
    const r = toWorld(f, 2, -5);
    const back = toLocal(f, r.x, r.z);
    expect(back.x).toBeCloseTo(2, 6);
    expect(back.z).toBeCloseTo(-5, 6);
  });
  test("a rotated rectangle's collider covers its corners", () => {
    const g = { x: 0, z: 0, y: 0, yaw: 0.3 };
    const rect = { x: 0, z: -10, hw: 6, hd: 3 };
    const box = rectAabb(g, rect);
    for (const [sx, sz] of [
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
    ]) {
      const p = toWorld(g, rect.x + (sx as number) * rect.hw, rect.z + (sz as number) * rect.hd);
      expect(p.x).toBeGreaterThanOrEqual(box.x0 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(box.x1 + 1e-9);
      expect(p.z).toBeGreaterThanOrEqual(box.z0 - 1e-9);
      expect(p.z).toBeLessThanOrEqual(box.z1 + 1e-9);
    }
    const inset = rectAabb(g, rect, 0.5);
    expect(inset.x1 - inset.x0).toBeCloseTo(box.x1 - box.x0 - 1, 6);
  });
});

describe("reading spots", () => {
  const spots = [
    { id: "plaza", x: 0, z: 0, r: 4, priority: 1 },
    { id: "stall", x: 2, z: 0, r: 2, priority: 2 },
  ];
  test("nearest within radius, priority first", () => {
    expect(pickSpot(spots, -1, 0)?.id).toBe("plaza");
    expect(pickSpot(spots, 1.8, 0.2)?.id).toBe("stall");
    expect(pickSpot(spots, 10, 0)).toBeNull();
  });
});

describe("sign years", () => {
  test("ranges, present and single years", () => {
    expect(yearsLabel([{ start: "2014-01", end: "2016-01" }], "es")).toBe("2014–2016");
    expect(yearsLabel([{ start: "2026-01" }], "es")).toBe("2026–hoy");
    expect(yearsLabel([{ start: "2026-01" }], "en")).toBe("2026–now");
    expect(yearsLabel([{ start: "2019-02", end: "2019-11" }], "en")).toBe("2019");
    expect(yearsLabel([], "en")).toBe("");
  });
});
