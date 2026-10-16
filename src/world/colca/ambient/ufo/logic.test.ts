import { describe, expect, test } from "bun:test";
import { TOWER } from "../../plan";
import {
  alpacaLift,
  beamLevel,
  clearOfFigures,
  GAP,
  humPitch,
  LOOK_R,
  lookable,
  onPampa,
  PASS_SECONDS,
  PHASES,
  passAt,
  passStart,
  roadDistance,
  SPOT,
  saucerOffset,
} from "./logic";

describe("pampa UFO schedule", () => {
  test("first pass 20–40 s into the night, then every 60–90 s", () => {
    for (let seed = 0; seed < 50; seed++) {
      const first = passStart(0, seed);
      expect(first).toBeGreaterThanOrEqual(20);
      expect(first).toBeLessThanOrEqual(40);
      for (let k = 1; k < 5; k++) {
        const gap = passStart(k, seed) - passStart(k - 1, seed);
        expect(gap).toBeGreaterThanOrEqual(60);
        expect(gap).toBeLessThanOrEqual(90);
      }
    }
  });

  test("a pass is shorter than the shortest gap", () => {
    expect(PASS_SECONDS).toBeLessThan(GAP.min);
  });

  test("phases follow in order through a pass, nothing between passes", () => {
    const seed = 7;
    const s0 = passStart(0, seed);
    expect(passAt(s0 - 1, seed).phase).toBeNull();
    let t = s0 + 0.01;
    for (const p of PHASES) {
      const st = passAt(t, seed);
      expect(st.phase).toBe(p.id);
      expect(st.k).toBe(0);
      t += p.secs;
    }
    expect(passAt(s0 + PASS_SECONDS + 1, seed).phase).toBeNull();
    const s1 = passStart(1, seed);
    const st = passAt(s1 + 0.5, seed);
    expect(st.k).toBe(1);
    expect(st.phase).toBe("arrive");
  });

  test("u runs 0..1 within each phase", () => {
    for (let t = 0; t < 400; t += 0.37) {
      const st = passAt(t, 3);
      expect(st.u).toBeGreaterThanOrEqual(0);
      expect(st.u).toBeLessThan(1);
    }
  });
});

describe("pampa UFO motion", () => {
  test("arrives from far and high, hovers in place, leaves up", () => {
    const a = saucerOffset("arrive", 0, 0.5);
    expect(a && Math.hypot(a.x, a.z)).toBeGreaterThan(100);
    expect(a?.y).toBeGreaterThan(50);
    expect(saucerOffset("arrive", 0.999, 0.5)?.y).toBeLessThan(0.01);
    expect(saucerOffset("lift", 0.5, 0.5)).toEqual({ x: 0, y: 0, z: 0 });
    expect(saucerOffset("leave", 1, 0.5)?.y).toBeGreaterThan(100);
    expect(saucerOffset(null, 0, 0)).toBeNull();
  });

  test("the alpaca goes up, disappears inside and comes back to the ground", () => {
    expect(alpacaLift("hover", 0.5)).toEqual({ up: 0, scale: 1 });
    expect(alpacaLift("lift", 0).up).toBe(0);
    expect(alpacaLift("lift", 0.999).scale).toBeLessThan(0.05);
    expect(alpacaLift("inside", 0.5).scale).toBe(0);
    expect(alpacaLift("lower", 0).up).toBe(1);
    expect(alpacaLift("lower", 0.999).up).toBeLessThan(0.01);
    expect(alpacaLift("dizzy", 0.2)).toEqual({ up: 0, scale: 1 });
  });

  test("beam only around the abduction, look only over the spot", () => {
    expect(beamLevel(null, 0)).toBe(0);
    expect(beamLevel("arrive", 0.2)).toBe(0);
    expect(beamLevel("lift", 0.3)).toBe(1);
    expect(beamLevel("leave", 0.3)).toBe(0);
    expect(lookable("arrive")).toBe(false);
    expect(lookable("lift")).toBe(true);
    expect(lookable(null)).toBe(false);
  });
});

describe("pampa UFO spot", () => {
  test("off the road, off the geoglyphs, on the pampa, seen from the road and the tower", () => {
    const d = roadDistance(SPOT.x, SPOT.z);
    expect(d).toBeGreaterThan(25);
    // The nearest road point is inside the good-look radius, with room to spare.
    expect(d).toBeLessThan(LOOK_R - 15);
    expect(clearOfFigures(SPOT.x, SPOT.z)).toBe(true);
    expect(onPampa(SPOT.z)).toBe(true);
    const tower = Math.hypot(SPOT.x - TOWER.x, SPOT.z - TOWER.z);
    expect(tower).toBeGreaterThan(TOWER.half + 15);
    expect(tower).toBeLessThan(LOOK_R - 10);
  });
});

describe("pampa UFO hum", () => {
  test("rises with the lift, falls with the descent, zips up on leaving", () => {
    expect(humPitch("lift", 0.9)).toBeGreaterThan(humPitch("lift", 0.1));
    expect(humPitch("lower", 0.9)).toBeLessThan(humPitch("lower", 0.1));
    expect(humPitch("leave", 0.99)).toBeGreaterThan(1500);
  });
});
