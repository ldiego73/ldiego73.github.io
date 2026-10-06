import { describe, expect, test } from "bun:test";
import { CONSTELLATIONS, CRUX } from "./constellations";
import { createWeatherClock, dawnMist, durationOf, FADE, LEVELS, mulberry32, nextKind } from "./weather-schedule";

describe("weather schedule", () => {
  test("cycle order clear → mist → (garua | clear) → clear", () => {
    expect(nextKind("clear", 0.1)).toBe("mist");
    expect(nextKind("mist", 0.1)).toBe("garua");
    expect(nextKind("mist", 0.9)).toBe("clear");
    expect(nextKind("garua", 0.5)).toBe("clear");
  });

  test("each state lasts minutes", () => {
    for (const k of ["clear", "mist", "garua"] as const)
      for (const r of [0, 0.5, 0.999]) {
        const d = durationOf(k, r);
        expect(d).toBeGreaterThanOrEqual(100);
        expect(d).toBeLessThanOrEqual(450);
      }
  });

  test("crossfade is smooth and lands on the target levels", () => {
    const c = createWeatherClock(mulberry32(4), "clear", 1);
    const lv = { fog: 0, cover: 0, rain: 0 };
    expect(c.step(0.5)).toBe(false);
    expect(c.step(0.6)).toBe(true);
    expect(c.kind).toBe("mist");
    expect(c.levels(lv).fog).toBe(0);
    let last = 0;
    for (let i = 0; i < FADE * 10; i++) {
      c.step(0.1);
      const f = c.levels(lv).fog;
      expect(f).toBeGreaterThanOrEqual(last - 1e-9);
      expect(f - last).toBeLessThan(0.01);
      last = f;
    }
    expect(last).toBeCloseTo(LEVELS.mist.fog, 6);
  });

  test("garua only follows mist, and long runs visit every state", () => {
    const c = createWeatherClock(mulberry32(11));
    const seen = new Set<string>([c.kind]);
    let prev = c.kind;
    for (let i = 0; i < 20000; i++)
      if (c.step(1)) {
        if (c.kind === "garua") expect(prev).toBe("mist");
        seen.add(c.kind);
        prev = c.kind;
      }
    expect(seen.size).toBe(3);
  });

  test("dawn mist peaks at sunrise and vanishes at noon / midnight", () => {
    expect(dawnMist(0.255)).toBeCloseTo(0.4, 5);
    expect(dawnMist(0.5)).toBeLessThan(0.001);
    expect(dawnMist(0)).toBeLessThan(0.001);
  });
});

describe("dark constellations", () => {
  test("three ids, bilingual text, non-overlapping on the band", () => {
    expect(CONSTELLATIONS.map((c) => c.id).sort()).toEqual(["hanpatu", "machacuay", "yacana"]);
    for (const c of CONSTELLATIONS) {
      expect(c.text.es.length).toBeGreaterThan(40);
      expect(c.text.en.length).toBeGreaterThan(40);
      expect(c.path.startsWith("M")).toBe(true);
    }
    const spans = CONSTELLATIONS.map((c) => [c.u - c.w / 2, c.u + c.w / 2] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1]);
    // The Southern Cross sits between the Toad and the Llama's head.
    const toad = CONSTELLATIONS.find((c) => c.id === "hanpatu")!;
    const llama = CONSTELLATIONS.find((c) => c.id === "yacana")!;
    for (const [u] of CRUX) {
      expect(u).toBeGreaterThan(toad.u + toad.w / 2);
      expect(u).toBeLessThan(llama.u - llama.w / 2);
    }
  });
});
