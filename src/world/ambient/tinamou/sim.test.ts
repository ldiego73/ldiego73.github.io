import { describe, expect, test } from "bun:test";
import { mirrorX, tinamouParts } from "./model";
import {
  BURST,
  flightHeight,
  flightProgress,
  flightTime,
  flushRadius,
  freezeRadius,
  isAwake,
  meterSpeed,
  newSpeedMeter,
  whirr,
} from "./sim";

describe("perdiz andina sim", () => {
  test("awake from dawn to dusk, asleep at night", () => {
    expect(isAwake(0.5)).toBe(true);
    expect(isAwake(0.77)).toBe(true);
    expect(isAwake(0.9)).toBe(false);
    expect(isAwake(0.1)).toBe(false);
  });
  test("flush closer when walking than running; freeze further out", () => {
    expect(flushRadius(false)).toBe(3);
    expect(flushRadius(true)).toBe(5);
    expect(freezeRadius(false)).toBeGreaterThan(flushRadius(false));
  });
  test("speed meter smooths and ignores teleports", () => {
    const m = newSpeedMeter();
    meterSpeed(m, 0, 0, 0.016);
    let v = 0;
    for (let i = 1; i <= 120; i++) v = meterSpeed(m, i * 0.06, 0, 0.016);
    expect(v).toBeGreaterThan(3.4);
    expect(v).toBeLessThan(3.9);
    expect(meterSpeed(m, 500, 0, 0.016)).toBeCloseTo(v, 5);
  });
  test("flight: burst up with little ground covered, glide, drop to the ground", () => {
    const T = flightTime(20);
    expect(flightProgress(0, T)).toBe(0);
    expect(flightProgress(BURST, T)).toBeLessThan(0.06);
    expect(flightProgress(T, T)).toBe(1);
    let prev = 0;
    for (let s = 0; s <= T; s += 0.02) {
      const f = flightProgress(s, T);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
    expect(flightHeight(BURST, T, 2)).toBeCloseTo(2, 5);
    expect(flightHeight(T * 0.6, T, 2)).toBeGreaterThan(0.6);
    expect(flightHeight(T - 0.001, T, 2)).toBeLessThan(0.1);
    expect(whirr(0.1, T)).toBe(1);
  });
  test("model: compact plump bird with painted parts; mirrored wing keeps its size", () => {
    const p = tinamouParts();
    p.body.computeBoundingBox();
    const bb = p.body.boundingBox!;
    const len = bb.max.z - bb.min.z;
    expect(len).toBeGreaterThan(0.28);
    expect(len).toBeLessThan(0.42);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.18);
    for (const g of [p.body, p.head, p.wing, p.leg]) expect(g.attributes.color).toBeDefined();
    const l = mirrorX(p.wing);
    l.computeBoundingBox();
    expect(l.boundingBox!.min.x).toBeLessThan(-0.25);
  });
});
