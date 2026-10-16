import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../../../../data/career";
import {
  arrived,
  BURST,
  burstScale,
  careerStats,
  finaleTitle,
  glowAt,
  prng,
  SUNSET,
  spawnBurst,
  stepBit,
  towardSunset,
} from "./logic";

describe("coast finale: true career numbers", () => {
  test("the same computations as the mountain summit panel", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const s = careerStats(now);
    const first = Math.min(...COMPANIES.flatMap((c) => c.stages.map((st) => Number(st.start.slice(0, 4)))));
    expect(s.years).toBe(Math.max(1, 2026 - first));
    expect(s.companies).toBe(COMPANIES.filter((c) => !c.education).length);
    expect(s.artifacts).toBe(ARTIFACTS.length);
    expect(s.knots).toBe(COMPANIES.reduce((a, c) => a + c.stages.reduce((b, st) => b + st.knots.length, 0), 0));
    expect(s.knots).toBeGreaterThan(0);
  });
  test("title with and without a name", () => {
    expect(finaleTitle("es", "Ana")).toBe("¡Lo lograste, Ana!");
    expect(finaleTitle("es", "  ")).toBe("¡Lo lograste!");
    expect(finaleTitle("en", "Ana")).toBe("You made it, Ana!");
    expect(finaleTitle("en", "")).toBe("You made it!");
  });
});

describe("coast finale: arrival, sky and burst", () => {
  test("arrival has hysteresis", () => {
    expect(arrived(false, 3, 4)).toBe(true);
    expect(arrived(false, 5, 4)).toBe(false);
    expect(arrived(true, 5, 4)).toBe(true);
    expect(arrived(true, 6.5, 4)).toBe(false);
  });
  test("the sky turns to the sunset the short way", () => {
    expect(towardSunset(0.5, 0)).toBeCloseTo(0.5, 6);
    expect(towardSunset(0.5, 1)).toBeCloseTo(SUNSET, 6);
    expect(towardSunset(0.1, 1)).toBeCloseTo(SUNSET, 6);
    // From just after midnight it goes back through the night, never forward through the dawn.
    const mid = towardSunset(0.05, 0.5);
    expect(mid > 0.74 || mid < 0.06).toBe(true);
  });
  test("bits fly up, fall and settle on the floor", () => {
    const bits = spawnBurst(3, prng(7));
    expect(bits.length).toBe(BURST.shells + BURST.petals);
    let age = 0;
    for (let i = 0; i < 60 * 9; i++) {
      age += 1 / 60;
      for (const b of bits) stepBit(b, 1 / 60, age, () => 0);
    }
    expect(bits.every((b) => b.landed && b.y === 0)).toBe(true);
  });
  test("scale and glow envelopes", () => {
    expect(burstScale(-1)).toBe(0);
    expect(burstScale(0.125)).toBeCloseTo(0.5, 6);
    expect(burstScale(3)).toBe(1);
    expect(burstScale(BURST.life)).toBe(0);
    expect(glowAt(-1)).toBe(0);
    expect(glowAt(0)).toBeCloseTo(1, 6);
    expect(glowAt(6)).toBe(0);
  });
});
