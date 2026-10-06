import { describe, expect, test } from "bun:test";
import {
  APACHETA,
  CAMP,
  CAMP_R,
  campCount,
  FIRE,
  firelight,
  HOME,
  KEEP_OUT,
  KIDS,
  KIDS_R,
  KITE_REACH,
  kiteSway,
  ROUTE,
  routeClear,
  routeStart,
  SEATS,
  SOLIDS,
  STALL,
  STOVE,
  toWorld,
  VENDOR_AT,
  WALK,
  WIND,
  within,
} from "./plan";

describe("summit camp plan", () => {
  test("firelight: dark by day, full at night, ramps at dusk and dawn", () => {
    expect(firelight(0.5)).toBe(0);
    expect(firelight(0.4)).toBe(0);
    expect(firelight(0.9)).toBe(1);
    expect(firelight(0.05)).toBe(1);
    const dusk = firelight(0.74);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(firelight(0.76)).toBeGreaterThan(firelight(0.72));
    expect(firelight(0.26)).toBeLessThan(firelight(0.22));
  });

  test("within wraps past midnight", () => {
    expect(within(0.9, 0.8, 0.2)).toBe(true);
    expect(within(0.1, 0.8, 0.2)).toBe(true);
    expect(within(0.5, 0.8, 0.2)).toBe(false);
    expect(within(0.5, 0.28, 0.73)).toBe(true);
  });

  test("toWorld matches the summit group rotation (yaw about +Y)", () => {
    const out = { x: 0, z: 0 };
    toWorld(10, 20, 0, 1, 2, out);
    expect(out).toEqual({ x: 11, z: 22 });
    toWorld(0, 0, Math.PI / 2, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  test("layout keeps clear of the plaza (r 6.2), the festival ring and the build-3 plot", () => {
    for (const p of [FIRE, APACHETA, STALL, KIDS]) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(7.5);
      // build-3 pose sits near local (1.4, -9.9)
      expect(Math.hypot(p.x - 1.4, p.z + 9.9)).toBeGreaterThan(9);
      expect(Math.hypot(p.x - CAMP.x, p.z - CAMP.z)).toBeLessThan(CAMP_R);
    }
    expect(Math.hypot(WIND.x, WIND.z)).toBeCloseTo(1);
    // Kite flies away from the plaza and the chasqui post (local −z / −x side).
    expect(KIDS.z + WIND.z * KITE_REACH).toBeLessThan(KIDS.z);
  });

  test("kite sway is still with reduced motion and bounded otherwise", () => {
    const o = { side: 0, up: 0, roll: 0, pitch: 0 };
    const a = { ...kiteSway(3, true, o) };
    expect(kiteSway(9, true, o)).toEqual(a);
    for (let t = 0; t < 60; t += 0.7) {
      kiteSway(t, false, o);
      expect(Math.abs(o.side)).toBeLessThan(1.5);
      expect(Math.abs(o.roll)).toBeLessThan(0.4);
    }
  });

  test("low quality has fewer people and no steam", () => {
    const hi = campCount("high");
    const lo = campCount("low");
    expect(lo.travellers).toBeLessThan(hi.travellers);
    expect(lo.kids).toBeLessThan(hi.kids);
    expect(lo.steam).toBe(0);
    expect(hi.travellers).toBeGreaterThanOrEqual(2);
  });

  const inZone = (x: number, z: number) => KEEP_OUT.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);
  test("keep-out zones cover the seats, stall, stove, vendor, apacheta and the kite field", () => {
    for (const s of SEATS) expect(inZone(FIRE.x + Math.cos(s.a) * s.r, FIRE.z + Math.sin(s.a) * s.r)).toBe(true);
    for (const p of [FIRE, STALL, STOVE, VENDOR_AT, APACHETA, KIDS]) expect(inZone(p.x, p.z)).toBe(true);
    // The runner's loop downwind of the holder.
    const cx = KIDS.x + WIND.x * 1.6;
    const cz = KIDS.z + WIND.z * 1.6;
    for (let a = 0; a < Math.PI * 2; a += 0.3)
      expect(inZone(cx + Math.cos(a) * KIDS_R * 0.9, cz + Math.sin(a) * KIDS_R * 0.9)).toBe(true);
    // The middle of the camp (fire–stall–kids) is covered too, so herds can't thread through it.
    expect(inZone((FIRE.x + STALL.x + KIDS.x) / 3, (FIRE.z + STALL.z + KIDS.z) / 3)).toBe(true);
    // Zones reach the plaza edge but stay clear of the dancers' ring (r 4.85 + detours) and the western trail
    // band (local x < −16 here).
    for (const k of KEEP_OUT) {
      expect(Math.hypot(k.x, k.z) - k.r).toBeGreaterThan(5.4);
      expect(k.x - k.r).toBeGreaterThan(-15.5);
    }
  });

  test("walkable discs link the plaza edge to the fire and the stall; fire, stall and apacheta are reachable", () => {
    const inWalk = (x: number, z: number) => WALK.some((c) => Math.hypot(x - c.x, z - c.z) <= c.r);
    // The first disc overlaps the plaza (r 6.2).
    const link = WALK[0] as (typeof WALK)[number];
    expect(Math.hypot(link.x, link.z) - link.r).toBeLessThan(6.2);
    // A straight walk from the plaza edge to the fire stays on walkable discs.
    const ex = -6.0;
    const ez = 2.4;
    expect(routeClear([{ x: ex, z: ez }, { x: -9.2, z: 2.8 }, FIRE], inWalk, 0.25)).toBe(true);
    expect(
      routeClear(
        [
          { x: -9.2, z: 2.8 },
          { x: -9.6, z: -0.6 },
        ],
        inWalk,
        0.25,
      ),
    ).toBe(true);
    for (const p of [FIRE, STALL, APACHETA]) expect(inWalk(p.x, p.z)).toBe(true);
    expect(SOLIDS.length).toBeGreaterThanOrEqual(4);
  });

  test("route helpers", () => {
    expect(ROUTE[0]).toBe(HOME);
    const pts = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
    ];
    expect(routeClear(pts, () => true)).toBe(true);
    expect(routeClear(pts, (x, z) => !(x > 3.9 && z > 1.9 && z < 2.1), 0.1)).toBe(false);
    // From home: next is waypoint 1; from the camp end: the last waypoint; toward the camp from the last: done.
    expect(routeStart(pts, 0.1, 0, true)).toBe(1);
    expect(routeStart(pts, 4, 3.9, false)).toBe(2);
    expect(routeStart(pts, 4, 3.9, true)).toBe(3);
    expect(routeStart(pts, 3, 0, false)).toBe(1);
  });
});
