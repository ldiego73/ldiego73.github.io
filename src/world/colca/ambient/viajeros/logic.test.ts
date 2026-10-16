import { describe, expect, test } from "bun:test";
import { STATION_SPOT } from "../../plan";
import { GATHER, inCorridor, LANE, PAMPA, PLAY, RIM, STALL, startWalk, stepWalk, TRAVELLERS } from "./logic";

describe("people on the Kuntisuyu road", () => {
  test("walkers stay on the road, on stretches inside the road", () => {
    expect(LANE).toBeLessThan(2.6 - 0.5);
    for (const s of TRAVELLERS) {
      expect(s.t0).toBeGreaterThan(0.015);
      expect(s.t1).toBeLessThan(0.99);
      expect(s.t0).toBeLessThan(s.t1);
    }
  });

  test("both the canyon and the pampa have people coming and going, on low quality too", () => {
    const low = TRAVELLERS.filter((s) => !s.high);
    for (const [a, b] of [RIM, PAMPA]) {
      const here = low.filter((s) => s.t1 > a && s.t0 < b);
      expect(here.some((s) => s.dir === 1)).toBe(true);
      expect(here.some((s) => s.dir === -1)).toBe(true);
    }
    // Pampa people are visitors and locals, canyon people valley folk and walkers.
    expect(TRAVELLERS.filter((s) => s.t0 >= PAMPA[0] && s.t1 <= PAMPA[1]).some((s) => s.role === "archaeologist")).toBe(
      true,
    );
  });

  test("a walker goes there and back, pausing at each end, and waits while blocked", () => {
    const s = { role: "trekker" as const, t0: 0.1, t1: 0.11, start: 0.5, dir: 1 as const, speed: 1 };
    const w = startWalk(s);
    const L = 1000;
    expect(stepWalk(w, s, 1, L, true, () => 0)).toBe(0);
    const t = w.t;
    expect(stepWalk(w, s, 0.5, L, true, () => 0)).toBe(0);
    expect(w.t).toBe(t);
    for (let i = 0; i < 200 && w.dir === 1; i++) stepWalk(w, s, 0.1, L, false, () => 0);
    expect(w.dir).toBe(-1);
    expect(w.t).toBeCloseTo(0.11, 9);
    expect(w.wait).toBeGreaterThan(2);
    for (let i = 0; i < 400; i++) stepWalk(w, s, 0.1, L, false, () => 0);
    expect(w.t).toBeGreaterThanOrEqual(0.1);
    expect(w.t).toBeLessThanOrEqual(0.11);
  });

  test("the Cruz gathering keeps the way to the cross, the pedestal and the benches clear", () => {
    const r = STATION_SPOT.cruz.r;
    for (const g of GATHER) {
      const reach = g.pose === "play" ? PLAY.r + 0.3 : 0.4;
      expect(Math.hypot(g.x, g.z) + reach).toBeLessThan(r - 0.6);
      expect(Math.hypot(g.x, g.z - 3.6)).toBeGreaterThan(1.45 + 0.5);
      for (const cx of [-2.1, 0, 2.1]) for (const cz of [-8, -4, 0, 3]) expect(inCorridor(cx, cz)).toBe(true);
      expect(Math.abs(g.x) - reach).toBeGreaterThan(2.2);
      if (g.pose !== "sit") for (const sx of [-1, 1]) expect(Math.hypot(g.x - sx * 4.4, g.z - 2.6)).toBeGreaterThan(1);
    }
    expect(Math.abs(STALL.x) - STALL.w / 2).toBeGreaterThan(2.2);
    // 5–8 people on high quality, fewer on low.
    expect(GATHER.length).toBeGreaterThanOrEqual(5);
    expect(GATHER.length).toBeLessThanOrEqual(8);
    expect(GATHER.filter((g) => !g.high).length).toBeLessThan(GATHER.length);
  });
});
