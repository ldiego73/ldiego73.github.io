import { describe, expect, test } from "bun:test";
import { type Boat, dockingEnd, earnsStamp, idleLanding, stepBoat, type Water } from "./logic";

/** Open water west of x = 0, the beach to the east. */
const sea: Water = {
  ok: (x) => x < 0,
  shore: (x) => (x > -40 ? { x: 1, z: 0 } : null),
  crest: () => 0,
};
const still: Boat = { x: -20, z: 0, yaw: -Math.PI / 2, vx: 0, vz: 0 };
const run = (b: Boat, it: { x: number; z: number; running: boolean }, secs: number, w = sea) => {
  let s = b;
  for (let i = 0; i < secs * 60; i++) s = stepBoat(w, s, it, 1 / 60);
  return s;
};

describe("caballito steering", () => {
  test("paddles forward along its bow and keeps inertia", () => {
    const s = run(still, { x: -1, z: 0, running: false }, 2);
    expect(s.x).toBeLessThan(-22);
    const coast = run(s, { x: 0, z: 0, running: false }, 0.5);
    expect(coast.x).toBeLessThan(s.x);
  });
  test("turns toward the stick before paddling that way", () => {
    const s = run(still, { x: 0, z: -1, running: false }, 0.4);
    expect(Math.abs(s.yaw - still.yaw)).toBeGreaterThan(0.2);
  });
  test("never leaves the water", () => {
    const s = run({ ...still, x: -2, yaw: Math.PI / 2 }, { x: 1, z: 0, running: true }, 4);
    expect(s.x).toBeLessThan(0);
  });
  test("a breaking crest pushes it toward the beach", () => {
    const surf: Water = { ...sea, crest: () => 1 };
    const s = run(still, { x: 0, z: 0, running: false }, 1, surf);
    expect(s.x).toBeGreaterThan(still.x);
  });
});

describe("caballito landings", () => {
  const landings = [
    { x: 2, z: 0, bx: -1, bz: 0 },
    { x: 2, z: -80, bx: -1, bz: -80 },
  ];
  test("docks at the near landing only when slow", () => {
    expect(dockingEnd({ ...still, x: -4 }, landings)).toBe(0);
    expect(dockingEnd({ ...still, x: -4, z: -78 }, landings)).toBe(1);
    expect(dockingEnd({ ...still, x: -30 }, landings)).toBeNull();
    expect(dockingEnd({ ...still, x: -4, vx: 6 }, landings)).toBeNull();
  });
  test("only the other beach earns the stamp", () => {
    expect(earnsStamp(0, 1)).toBe(true);
    expect(earnsStamp(1, 0)).toBe(true);
    expect(earnsStamp(0, 0)).toBe(false);
  });
  test("the boat comes round only when out of sight", () => {
    expect(idleLanding({ at: 0, d0: 200, d1: 10, dBoat: 120 })).toBe(1);
    expect(idleLanding({ at: 0, d0: 200, d1: 10, dBoat: 40 })).toBe(0);
    expect(idleLanding({ at: 1, d0: 12, d1: 100, dBoat: 100 })).toBe(0);
    expect(idleLanding({ at: 1, d0: 100, d1: 100, dBoat: 100 })).toBe(1);
  });
});
