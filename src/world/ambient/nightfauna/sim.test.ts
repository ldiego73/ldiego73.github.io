import { describe, expect, test } from "bun:test";
import {
  addGait,
  blendInto,
  foxPresence,
  lerpPose,
  lookoutScore,
  makePose,
  nightAmount,
  P,
  TROT,
  turnToward,
  WALK,
  wrapAngle,
} from "./sim";

describe("time of day", () => {
  test("night amount: 0 by day, 1 at midnight, ramps at dusk", () => {
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0)).toBe(1);
    const dusk = nightAmount(0.77);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });
  test("fox presence: full at dusk and night, low but non-zero by day", () => {
    expect(foxPresence(0)).toBe(1);
    expect(foxPresence(0.73)).toBeGreaterThan(0.6);
    expect(foxPresence(0.5)).toBeCloseTo(0.15, 5);
    expect(foxPresence(0.35)).toBeCloseTo(0.15, 5);
  });
});

describe("angles", () => {
  test("wrapAngle stays in (-π, π]", () => {
    for (const a of [-10, -Math.PI, 0, 3, 7, 20]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
    }
  });
  test("turnToward takes the short way and clamps the step", () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 9);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05, 9);
  });
});

describe("poses", () => {
  const a = makePose([0, 0, 1, 1]);
  const b = makePose([1, 1, 3, 3]);
  test("lerp and blend", () => {
    const out = makePose([]);
    lerpPose(out, a, b, 0.5);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[P.legs]).toBeCloseTo(2);
    out.set(a);
    blendInto(out, b, 1);
    expect(Array.from(out)).toEqual(Array.from(b));
    out.set(a);
    blendInto(out, b, 0);
    expect(Array.from(out)).toEqual(Array.from(a));
  });
  test("gait: legs swing in the right pairs, zero amplitude is a no-op", () => {
    const p = makePose([]);
    addGait(p, 0.1, TROT, 0, 0.5, 0.8);
    expect(Array.from(p).every((v) => v === 0)).toBe(true);
    addGait(p, 0.1, TROT, 1, 0.5, 0.8);
    // Trot: diagonal pairs (FL with HR, FR with HL) move together.
    expect(p[P.legs]).toBeCloseTo(p[P.legs + 6]!, 9);
    expect(p[P.legs + 2]).toBeCloseTo(p[P.legs + 4]!, 9);
    expect(p[P.legs]).toBeCloseTo(-p[P.legs + 2]!, 9);
    const w = makePose([]);
    addGait(w, 0.3, WALK, 1, 0.4, 0.6);
    // Walk: four distinct phases.
    expect(new Set([0, 1, 2, 3].map((k) => w[P.legs + k * 2]!.toFixed(4))).size).toBe(4);
  });
});

describe("lookouts", () => {
  test("prefers a flat ledge a few units above the trail", () => {
    const ledge = lookoutScore({ rise: 3, bumpy: 0.1, drop: 1.4, lateral: 10 });
    const slope = lookoutScore({ rise: 3, bumpy: 0.5, drop: 0.2, lateral: 10 });
    expect(ledge).toBeGreaterThan(slope);
  });
  test("rejects spots below the trail, too high, too steep, on or far from it", () => {
    expect(lookoutScore({ rise: 0.2, bumpy: 0, drop: 1, lateral: 10 })).toBe(-Infinity);
    expect(lookoutScore({ rise: 12, bumpy: 0, drop: 1, lateral: 10 })).toBe(-Infinity);
    expect(lookoutScore({ rise: 3, bumpy: 1, drop: 1, lateral: 10 })).toBe(-Infinity);
    expect(lookoutScore({ rise: 3, bumpy: 0, drop: 1, lateral: 3 })).toBe(-Infinity);
    expect(lookoutScore({ rise: 3, bumpy: 0, drop: 1, lateral: 40 })).toBe(-Infinity);
  });
});
