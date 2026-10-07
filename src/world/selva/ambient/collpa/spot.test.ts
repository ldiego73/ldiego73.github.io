import { describe, expect, test } from "bun:test";
import { buildSelvaLayout } from "../../layout";
import { benchSeat, collpaCliff } from "./spot";

const L = buildSelvaLayout({ cells: 280 });
const cliff = collpaCliff(L);

describe("collpa cliff", () => {
  test("stands on the far bank, across the river from the viewpoint", () => {
    const foot = cliff.point(0, 0);
    expect(L.riverDist(foot.x, foot.z)).toBeGreaterThan(0);
    // Between the viewpoint and the face there is river.
    const mid = { x: (cliff.view.x + foot.x) / 2, z: (cliff.view.z + foot.z) / 2 };
    expect(L.isWater(mid.x, mid.z)).toBe(true);
    const d = Math.hypot(foot.x - cliff.view.x, foot.z - cliff.view.z);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(40);
  });
  test("the face normal points back toward the viewpoint", () => {
    const p = cliff.point(0, 0.5);
    const n = cliff.normalAt(0);
    const tx = cliff.view.x - p.x;
    const tz = cliff.view.z - p.z;
    expect((n.x * tx + n.z * tz) / Math.hypot(tx, tz)).toBeGreaterThan(0.95);
    expect(Math.hypot(n.x, n.z)).toBeCloseTo(1);
  });
  test("rises from below the river to above the far forest floor, and leans back", () => {
    expect(cliff.base).toBeLessThan(L.river.level);
    const top = cliff.point(0, 1);
    expect(top.y).toBeGreaterThan(L.heightAt(top.x, top.z) + 2);
    expect(cliff.local(0, 1).lz).toBeLessThan(cliff.local(0, 0).lz);
  });
  test("footprint covers the massif behind the face, away from the river", () => {
    for (const c of cliff.footprint) expect(L.isWater(c.x, c.z)).toBe(false);
  });
});

describe("collpa bench seat", () => {
  const seat = benchSeat(cliff.frame, 10);
  test("faces the clay lick across the river", () => {
    const p = cliff.point(0, 0.5);
    const to = Math.atan2(p.x - seat.x, p.z - seat.z);
    const d = Math.atan2(Math.sin(to - seat.yaw), Math.cos(to - seat.yaw));
    expect(Math.abs(d)).toBeLessThan(0.05);
  });
  test("sits on the viewpoint and stands up toward the river railing, on dry land", () => {
    expect(Math.hypot(seat.x - cliff.view.x, seat.z - cliff.view.z)).toBeLessThan(0.5);
    expect(seat.y).toBeCloseTo(10.56);
    const s = Math.hypot(seat.stand.x - seat.x, seat.stand.z - seat.z);
    expect(s).toBeGreaterThan(0.8);
    expect(s).toBeLessThan(1.5);
    // The stand point is further toward the cliff than the seat.
    const p = cliff.point(0, 0);
    expect(Math.hypot(p.x - seat.stand.x, p.z - seat.stand.z)).toBeLessThan(Math.hypot(p.x - seat.x, p.z - seat.z));
  });
});
