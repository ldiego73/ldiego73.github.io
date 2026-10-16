import { describe, expect, test } from "bun:test";
import { CANOPY_T } from "../../contract";
import { type MuleHomeEnv, muleHome, muleMustStop, nearCanopy } from "./logic";

const base = (over: Partial<MuleHomeEnv> = {}): MuleHomeEnv => ({
  plaza: { x: 0, z: 0, r: 6 },
  station: { x: 0, z: 0 },
  walkable: () => true,
  heightAt: () => 0,
  // Road along the x axis (z = 0 line is far from the rim points at |z| > 2.6).
  trailDistance: (_x, z) => ({ d: Math.abs(z + 10) }),
  halfWidth: 2,
  avoid: [],
  roadDir: { x: 1, z: 0 },
  ...over,
});

describe("muleHome", () => {
  test("stands on the plaza rim, off the road, facing along it", () => {
    const h = muleHome(base());
    expect(Math.hypot(h.x, h.z)).toBeCloseTo(4.2, 5);
    expect(Math.abs(h.z + 10)).toBeGreaterThanOrEqual(3.4);
    expect(h.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  test("keeps clear of avoided points (punku prompt, spawn)", () => {
    const h = muleHome(base({ avoid: [[4.2, 0, 3]] }));
    expect(Math.hypot(h.x - 4.2, h.z)).toBeGreaterThanOrEqual(3);
  });

  test("skips unwalkable spots and falls back to the station", () => {
    const h = muleHome(base({ walkable: () => false, station: { x: 7, z: 8 } }));
    expect(h.x).toBe(7);
    expect(h.z).toBe(8);
  });
});

describe("nearCanopy", () => {
  test("true on the walkway road band, false elsewhere", () => {
    const mid = (CANOPY_T[0] + CANOPY_T[1]) / 2;
    expect(nearCanopy({ t: mid, d: 0 }, 2)).toBe(true);
    expect(nearCanopy({ t: CANOPY_T[0] - 0.003, d: 1 }, 2)).toBe(true);
    expect(nearCanopy({ t: 0.5, d: 0 }, 2)).toBe(false);
    expect(nearCanopy({ t: mid, d: 20 }, 2)).toBe(false);
  });
});

describe("muleMustStop", () => {
  const zone = { x: 0, z: 0, r: 10, on: true };
  const at = (d: number, over: Partial<Parameters<typeof muleMustStop>[0]> = {}) =>
    muleMustStop({ q: { d, t: 0.5 }, halfWidth: 2, onDeck: false, zones: [zone], x: 3, z: 0, ...over });

  test("rides along the road even through a station's keep-out", () => {
    expect(at(0)).toBe(false);
    expect(at(2.9)).toBe(false);
  });

  test("stops off the road inside a station's grounds", () => {
    expect(at(5)).toBe(true);
    expect(at(5, { zones: [{ ...zone, on: false }] })).toBe(false);
    expect(at(5, { x: 30 })).toBe(false);
  });

  test("stops on decks and at the canopy walkway, even on the road", () => {
    expect(at(0, { onDeck: true })).toBe(true);
    expect(at(0, { q: { d: 0, t: (CANOPY_T[0] + CANOPY_T[1]) / 2 } })).toBe(true);
  });
});
