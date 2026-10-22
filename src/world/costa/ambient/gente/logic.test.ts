import { describe, expect, test } from "bun:test";
import { isDay, laneTarget, respawns, SEA_SEAT, shoreRun, strayed, TRAVEL } from "./logic";

describe("coast people", () => {
  test("out by day only", () => {
    expect(isDay(0.5)).toBe(true);
    expect(isDay(0.26)).toBe(false);
    expect(isDay(0.8)).toBe(false);
  });
  test("walkers keep to their right", () => {
    const out = { x: 0, z: 0 };
    // Walking north (−z): their right is east (+x).
    laneTarget(0, 0, 0, -1, 1, out);
    expect(out.x).toBeCloseTo(1.2, 6);
    // Walking back south: their right is west.
    laneTarget(0, 0, 0, -1, -1, out);
    expect(out.x).toBeCloseTo(-1.2, 6);
  });
  test("children run down to the water and back", () => {
    expect(shoreRun(0, false).out).toBeCloseTo(0, 6);
    expect(shoreRun(2.7, false).out).toBeCloseTo(4.5, 6);
    expect(shoreRun(5.99, false).out).toBeLessThan(0.1);
    expect(shoreRun(2.7, true).out).toBe(0);
  });
});

describe("travellers", () => {
  const len = 760;
  test("stray once beyond KEEP along the road", () => {
    expect(strayed(0.5, 0.5 + 100 / len, len)).toBe(false);
    expect(strayed(0.5, 0.5 + (TRAVEL.keep + 1) / len, len)).toBe(true);
  });
  test("respawn SPAWN away on either side, inside the road, mostly walking toward the player", () => {
    for (const r1 of [0.1, 0.4, 0.6, 0.95]) {
      const c = respawns(0.5, len, r1, 0.2);
      expect(c.length).toBe(2);
      for (const s of c) {
        const d = Math.abs(s.t - 0.5) * len;
        expect(d).toBeGreaterThanOrEqual(TRAVEL.spawnMin - 1e-6);
        expect(d).toBeLessThanOrEqual(TRAVEL.spawnMax + 1e-6);
        expect(strayed(s.t, 0.5, len)).toBe(false);
        // Toward the player: ahead of them (t larger) walks back (dir −1).
        expect(s.dir).toBe(s.t > 0.5 ? -1 : 1);
      }
      expect(c[0]?.t > 0.5).toBe(r1 < 0.5);
    }
    expect(respawns(0.5, len, 0.3, 0.9).every((s) => s.dir === (s.t > 0.5 ? 1 : -1))).toBe(true);
  });
  test("near the road's ends only the inner side is offered", () => {
    const c = respawns(0.04, len, 0.7, 0.2);
    expect(c.length).toBe(1);
    expect(c[0]?.t).toBeGreaterThan(0.04);
  });
});

describe("SEA_SEAT", () => {
  test("a surfer at sea sits on the deck with the legs in the water", () => {
    // Below the water line, but not by more than the pelvis rests above the feet in the ride pose.
    expect(SEA_SEAT).toBeLessThan(0);
    expect(SEA_SEAT).toBeGreaterThan(-0.5);
  });
});
