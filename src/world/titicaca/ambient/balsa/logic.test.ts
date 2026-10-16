import { describe, expect, test } from "bun:test";
import { canSail, type Dock, dockingEnd, docks, earnsRideStamp, HULL, idleEnd, pierY, stepBoat } from "./logic";

const ds = docks(0.8);
const ok = (x: number, z: number) => canSail(x, z, ds);
const hullOk = (d: Dock) => {
  const { x, z, yaw } = d.moor;
  return (
    ok(x, z) &&
    ok(x + Math.sin(yaw) * HULL.halfL, z + Math.cos(yaw) * HULL.halfL) &&
    ok(x - Math.sin(yaw) * HULL.halfL, z - Math.cos(yaw) * HULL.halfL)
  );
};

describe("balsa de totora", () => {
  test("both moorings float in open water and are dockable", () => {
    for (const d of ds) {
      expect(hullOk(d)).toBe(true);
      expect(dockingEnd({ x: d.moor.x, z: d.moor.z, yaw: d.moor.yaw, v: 0, w: 0 }, ds)).toBe(d.end);
      expect(pierY(d, d.root[0], d.root[1])).toBeCloseTo(d.rootY, 6);
      expect(pierY(d, d.tip[0], d.tip[1])).toBeCloseTo(d.tipY, 6);
    }
    expect(canSail(0, 30, ds)).toBe(false);
  });

  test("forward input moves along the bow, sideways input turns even at rest, a blocked step stops", () => {
    const start = { x: 0, z: -150, yaw: 0, v: 0, w: 0 };
    let b = start;
    for (let i = 0; i < 120; i++) b = stepBoat(b, { x: 0, z: 1, running: false }, 1 / 30, () => true);
    expect(b.z).toBeGreaterThan(start.z + 2);
    expect(Math.abs(b.x)).toBeLessThan(1e-6);
    let t = start;
    for (let i = 0; i < 60; i++) t = stepBoat(t, { x: -1, z: 0, running: false }, 1 / 30, () => true);
    expect(Math.abs(t.yaw)).toBeGreaterThan(0.1);
    const moving = { ...start, v: 3 };
    const stopped = stepBoat(moving, { x: 0, z: 1, running: false }, 1 / 30, () => false);
    expect(stopped.v).toBe(0);
    expect(stopped.z).toBe(start.z);
  });

  test("only the other landing earns the stamp; the boatman brings the boat over", () => {
    expect(earnsRideStamp(0, 1)).toBe(true);
    expect(earnsRideStamp(1, 1)).toBe(false);
    expect(idleEnd({ at: 0, d0: 100, d1: 5, dBoat: 200 })).toBe(1);
    expect(idleEnd({ at: 0, d0: 100, d1: 5, dBoat: 40 })).toBe(0);
    expect(idleEnd({ at: 1, d0: 100, d1: 100, dBoat: 200 })).toBe(1);
  });
});
