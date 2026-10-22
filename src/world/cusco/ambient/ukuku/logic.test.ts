import { describe, expect, test } from "bun:test";
import { GATES, USNU } from "../../plan";
import { NIGHT_CAMP } from "../life/logic";
import {
  BAND,
  BELL_FAR,
  beat,
  bellGain,
  clockJumped,
  danceStep,
  greetStep,
  HOP_HZ,
  inPlaza,
  isMidnight,
  LINES,
  lineFor,
  nextShown,
  panFor,
  ROUTINE,
  ROUTINE_SECS,
  SPOT,
  STAMP,
  stepAt,
  WANDER,
  yawTo,
} from "./logic";

describe("ukuku: when", () => {
  test("out only in the midnight band, and the T key's night (0.93) is inside it", () => {
    expect(isMidnight(0)).toBe(true);
    expect(isMidnight(0.93)).toBe(true);
    expect(isMidnight(0.1)).toBe(true);
    expect(isMidnight(BAND[1] + 0.01)).toBe(false);
    expect(isMidnight(0.5)).toBe(false);
    expect(isMidnight(0.8)).toBe(false);
  });
  test("clock jumps are told from the natural clock, across midnight too", () => {
    expect(clockJumped(0.5, 0.5 + 1 / 360 / 60)).toBe(false);
    expect(clockJumped(0.9999, 0.0001)).toBe(false);
    expect(clockJumped(0.4, 0.5)).toBe(true);
  });
  test("appears or vanishes only unseen, on a jump or the first frame, never mid-greeting", () => {
    expect(nextShown(null, true, true, false, false)).toBe(true);
    expect(nextShown(false, true, true, false, false)).toBe(false);
    expect(nextShown(false, true, false, false, false)).toBe(true);
    expect(nextShown(false, true, true, true, false)).toBe(true);
    expect(nextShown(true, false, false, true, true)).toBe(true);
    expect(nextShown(true, false, true, false, false)).toBe(true);
  });
});

describe("ukuku: where", () => {
  test("a quiet corner of the plaza: off the usnu, the street mouths and the llamas' camp", () => {
    expect(inPlaza(SPOT, 3)).toBe(true);
    const half = USNU.tiers[0].half;
    expect(Math.abs(SPOT.x - USNU.x) > half + 4 || Math.abs(SPOT.z - USNU.z) > half + 4).toBe(true);
    for (const g of GATES) expect(Math.hypot(SPOT.x - g.mouth[0], SPOT.z - g.mouth[1])).toBeGreaterThan(12);
    expect(Math.hypot(SPOT.x - NIGHT_CAMP.x, SPOT.z - NIGHT_CAMP.z)).toBeGreaterThan(20);
  });
  test("faces the usnu", () => {
    expect(SPOT.yaw).toBeCloseTo(yawTo(SPOT, { x: USNU.x, z: USNU.z }), 6);
  });
});

describe("ukuku: dance", () => {
  test("the routine loops through hops, spins and whip swings", () => {
    const seen = new Set<string>();
    for (let t = 0; t < ROUTINE_SECS; t += 0.25) seen.add(stepAt(t).move);
    expect([...seen].sort()).toEqual(["hop", "spin", "whip"]);
    expect(stepAt(ROUTINE_SECS + 0.1).i).toBe(0);
    expect(stepAt(-0.1).i).toBeGreaterThanOrEqual(0);
  });
  test("each move is a human action; it stays near its spot", () => {
    const actions = new Set<string>();
    for (let t = 0; t < ROUTINE_SECS; t += 0.05) {
      const s = danceStep(t, false);
      actions.add(s.action);
      expect(Math.hypot(s.dx, s.dz)).toBeLessThanOrEqual(WANDER);
      expect(s.side).toBe(1);
    }
    expect([...actions].sort()).toEqual(["dance", "hop", "whip-circle"]);
    expect(danceStep(0.1, false).action).toBe("hop");
  });
  test("it spins whole turns in a spin step", () => {
    // The first spin starts after the first 4 s hop step.
    const start = 4;
    expect(stepAt(start + 0.01).move).toBe("spin");
    expect(danceStep(start + 0.01, false).action).toBe("dance");
    expect(danceStep(start + 2.5 - 1e-6, false).turn).toBeCloseTo(Math.PI * 4, 3);
  });
  test("reduced motion: hands on the hips, a gentle sway, no hops or spins", () => {
    for (let t = 0; t < ROUTINE_SECS; t += 0.1) {
      const s = danceStep(t, true);
      expect(s.action).toBe("hands-hips");
      expect(Math.abs(s.turn)).toBeLessThan(0.2);
      expect(s.dx).toBe(0);
    }
  });
  test("the greeting waves the left arm, standing still", () => {
    const g = greetStep();
    expect(g.action).toBe("wave");
    expect(g.side).toBe(-1);
    expect(g.turn).toBe(0);
  });
  test("the bell rings on every other hop landing, counted from each step's start; slower when reduced", () => {
    // HOP_HZ beats a second within a step.
    expect(beat(1 / HOP_HZ + 0.01, false) - beat(0, false)).toBe(1);
    expect(beat(2 / HOP_HZ + 0.01, false) - beat(0, false)).toBe(2);
    // A new step starts a new count (and so rings), and so does a new loop of the routine.
    const first = (ROUTINE[0] as { secs: number }).secs;
    expect(beat(first + 0.001, false)).not.toBe(beat(first - 0.001, false));
    expect(beat(ROUTINE_SECS + 0.001, false)).not.toBe(beat(0.001, false));
    expect(beat(10, true)).toBeLessThan(beat(10, false));
  });
});

describe("ukuku: bell and words", () => {
  test("the bell fades with distance to silence", () => {
    expect(bellGain(0)).toBeGreaterThan(0.9);
    expect(bellGain(5)).toBeLessThan(bellGain(2));
    expect(bellGain(BELL_FAR)).toBe(0);
    expect(bellGain(100)).toBe(0);
    for (let d = 0; d < BELL_FAR; d += 0.5) expect(bellGain(d + 0.5)).toBeLessThanOrEqual(bellGain(d));
  });
  test("pans to the side it is on", () => {
    expect(panFor(5, 0, 1, 0)).toBeGreaterThan(0);
    expect(panFor(-5, 0, 1, 0)).toBeLessThan(0);
    expect(panFor(0, 0, 1, 0)).toBe(0);
  });
  test("bilingual lines, the invitation first, and the egg stamp", () => {
    for (const l of LINES) {
      expect(l.es.length).toBeGreaterThan(0);
      expect(l.en.length).toBeGreaterThan(0);
    }
    expect(lineFor(0).es).toContain("¿Bailas conmigo?");
    expect(lineFor(LINES.length)).toBe(lineFor(0));
    expect(STAMP).toEqual({
      id: "cusco:egg:ukuku",
      kind: "egg",
      label: { es: "El ukuku de medianoche", en: "The midnight ukuku" },
    });
  });
});
