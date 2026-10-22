import { describe, expect, test } from "bun:test";
import { rng } from "../../tex";
import { flightPoint, newFlight, pickRecord, planFlight, soarPoint, TREE_STRIDE } from "./sim";

describe("bird flight", () => {
  test("arc starts and ends on the perches and rises in between", () => {
    const f = planFlight(newFlight(), { x: 0, y: 2, z: 0 }, { x: 10, y: 4, z: 0 }, 6, 0.16, 0.7);
    const p = { x: 0, y: 0, z: 0 };
    expect(flightPoint(f, 0, p)).toEqual({ x: 0, y: 2, z: 0 });
    expect(flightPoint(f, 1, p)).toEqual({ x: 10, y: 4, z: 0 });
    expect(flightPoint(f, 0.5, p).y).toBeGreaterThan(4);
    expect(f.dur).toBeGreaterThan(10 / 6);
  });
  test("pickRecord honours distance band, kinds, taken spots, tree and traveler clearance", () => {
    const arr: number[] = [];
    for (let i = 0; i < 200; i++) arr.push(i, 3, 0, i % 5, Math.floor(i / 4));
    const taken = new Uint8Array(200);
    taken[12] = 1;
    const R = rng(3);
    for (let k = 0; k < 200; k++) {
      const i = pickRecord(arr, TREE_STRIDE, { x: 10, y: 3, z: 0 }, R, {
        min: 2,
        max: 30,
        kinds: [2],
        notTree: 3,
        taken,
        avoid: { x: 20, z: 0, r: 4 },
      });
      if (i < 0) continue;
      const x = arr[i * TREE_STRIDE] as number;
      expect(Math.abs(x - 10)).toBeGreaterThanOrEqual(2);
      expect(Math.abs(x - 10)).toBeLessThanOrEqual(30);
      expect(arr[i * TREE_STRIDE + 3]).toBe(2);
      expect(arr[i * TREE_STRIDE + 4]).not.toBe(3);
      expect(i).not.toBe(12);
      expect(Math.abs(x - 20)).toBeGreaterThanOrEqual(4);
    }
    expect(pickRecord([], TREE_STRIDE, { x: 0, y: 0, z: 0 }, R, { min: 0, max: 1 })).toBe(-1);
  });
  test("soaring heading is tangent to the circle", () => {
    const o = { x: 0, y: 0, z: 0, yaw: 0 };
    soarPoint(0, 0, 10, 0, 1, o);
    expect(o.x).toBeCloseTo(10);
    // Moving counter-clockwise at angle 0 → +Z.
    expect(Math.sin(o.yaw)).toBeCloseTo(0);
    expect(Math.cos(o.yaw)).toBeCloseTo(1);
  });
});
