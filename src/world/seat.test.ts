import { describe, expect, test } from "bun:test";
import { createStandLatch, nearSeat, type Seat, SIT_HIP, seatedFeetY, seatFrom, sitDetail, yawToward } from "./seat";

const seat: Seat = { id: "s", x: 1, y: 2, z: 3, yaw: 0.5, view: 1, pose: "desk", stand: { x: 1, z: 4 } };

describe("seat protocol", () => {
  test("a sit detail round-trips into the same seat", () => {
    expect(seatFrom(sitDetail(seat))).toEqual(seat);
  });
  test("standing up and malformed requests are not seats", () => {
    expect(seatFrom({ seated: false })).toBeNull();
    expect(seatFrom({ seated: true, x: 1, z: 2 })).toBeNull();
    expect(seatFrom({ seated: true, x: Number.NaN, y: 0, z: 0 })).toBeNull();
    expect(seatFrom(undefined)).toBeNull();
  });
  test("defaults: bench pose, facing +Z, no stand point (the runtime uses where it sat down from)", () => {
    const s = seatFrom({ seated: true, x: 0, y: 1, z: 0, stand: { x: Number.NaN, z: 0 } });
    expect(s).toEqual({ id: "seat", x: 0, y: 1, z: 0, yaw: 0, view: 0, pose: "bench", stand: null });
    expect(seatFrom({ seated: true, x: 0, y: 1, z: 0, yaw: 2 })?.view).toBe(2);
  });
  test("feet hang below the seat surface by the hip height", () => {
    expect(seatedFeetY(seat)).toBeCloseTo(2 - SIT_HIP);
    expect(SIT_HIP).toBeGreaterThan(0.4);
    expect(SIT_HIP).toBeLessThan(0.56);
  });
  test("yawToward matches the models' +Z facing", () => {
    expect(yawToward(0, 0, 0, 1)).toBeCloseTo(0);
    expect(yawToward(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2);
  });
  test("nearSeat picks the nearest seat in range", () => {
    const a = { x: 0, z: 0 };
    const b = { x: 1, z: 0 };
    expect(nearSeat([a, b], 0.8, 0)).toBe(b);
    expect(nearSeat([a, b], 0.2, 0)).toBe(a);
    expect(nearSeat([a, b], 5, 5)).toBeNull();
  });
});

describe("stand-up latch", () => {
  test("held movement while sitting down does not stand up until released", () => {
    const l = createStandLatch();
    l.reset();
    expect(l.wantsUp({ x: 0, y: 1 }, false)).toBe(false);
    expect(l.wantsUp({ x: 0, y: 1 }, false)).toBe(false);
    expect(l.wantsUp({ x: 0, y: 0 }, false)).toBe(false);
    expect(l.wantsUp({ x: 0, y: 0.1 }, false)).toBe(false);
    expect(l.wantsUp({ x: 0.6, y: 0 }, false)).toBe(true);
  });
  test("jump always stands up", () => {
    const l = createStandLatch();
    l.reset();
    expect(l.wantsUp({ x: 0, y: 1 }, true)).toBe(true);
  });
  test("reset disarms again", () => {
    const l = createStandLatch();
    l.wantsUp({ x: 0, y: 0 }, false);
    l.reset();
    expect(l.wantsUp({ x: 1, y: 0 }, false)).toBe(false);
  });
});
