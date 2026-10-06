import { describe, expect, test } from "bun:test";
import { asCtx, FakeAudioContext, type FakeNode } from "../../../audio/fake-audio";
import { Layers } from "./layers";
import {
  altitude01,
  birdCall,
  birdGap,
  cricketChirp,
  falloff,
  isGarua,
  type MixInput,
  mixTargets,
  panFor,
  strideFor,
  surfaceAt,
  waterLevel,
  windLevel,
} from "./mix";

const base: MixInput = {
  alt: 0.5,
  summitDist: 100,
  water: 0,
  night: false,
  raining: false,
  inside: false,
  modal: false,
  game: false,
};

describe("soundscape mix", () => {
  test("altitude normalizes and clamps", () => {
    expect(altitude01(5, 0, 10)).toBe(0.5);
    expect(altitude01(-3, 0, 10)).toBe(0);
    expect(altitude01(30, 0, 10)).toBe(1);
    expect(altitude01(3, 4, 4)).toBe(0);
  });

  test("wind grows with altitude and at the summit", () => {
    expect(windLevel(1, 100)).toBeGreaterThan(windLevel(0, 100));
    expect(windLevel(0.8, 2)).toBeGreaterThan(windLevel(0.8, 60));
  });

  test("water falls off with distance and is silent far away", () => {
    expect(falloff(0, 4, 20)).toBe(1);
    expect(falloff(4, 4, 20)).toBeCloseTo(0.5, 5);
    expect(falloff(25, 4, 20)).toBe(0);
    const near = waterLevel(2, 200);
    const far = waterLevel(18, 200);
    expect(near.level).toBeGreaterThan(far.level);
    expect(waterLevel(null, 500).level).toBe(0);
    expect(waterLevel(null, 3).fall).toBeGreaterThan(0.8);
  });

  test("stride grows with speed and while riding", () => {
    expect(strideFor(7.4, false)).toBeGreaterThan(strideFor(3.6, false));
    expect(strideFor(3.6, true)).toBeGreaterThan(strideFor(3.6, false));
    // about 2 steps per second walking, about 3 running
    expect(3.6 / strideFor(3.6, false)).toBeCloseTo(2, 0);
    expect(7.4 / strideFor(7.4, false)).toBeCloseTo(3, 0);
  });

  test("surfaces", () => {
    expect(surfaceAt(true, true, true)).toBe("wood");
    expect(surfaceAt(false, true, true)).toBe("water");
    expect(surfaceAt(false, false, true)).toBe("grass");
    expect(surfaceAt(false, false, false)).toBe("stone");
  });

  test("day/night, inside, modal, game and rain targets", () => {
    const day = mixTargets(base);
    expect(day.day).toBeGreaterThan(0);
    expect(day.night).toBe(0);
    const night = mixTargets({ ...base, night: true });
    expect(night.day).toBe(0);
    expect(night.night).toBeGreaterThan(0);
    expect(mixTargets({ ...base, inside: true }).wind).toBeLessThan(day.wind);
    expect(mixTargets({ ...base, modal: true }).master).toBeLessThan(1);
    expect(mixTargets({ ...base, game: true }).master).toBe(0);
    expect(day.rain).toBe(0);
    expect(mixTargets({ ...base, raining: true }).rain).toBeGreaterThan(0);
  });

  test("weather detail is read defensively", () => {
    expect(isGarua({ kind: "garua" })).toBe(true);
    expect(isGarua({ kind: "garua", active: false })).toBe(false);
    expect(isGarua({ kind: "fog" })).toBe(false);
    expect(isGarua({ kind: "clear" })).toBe(false);
    expect(isGarua(null)).toBe(false);
    expect(isGarua("garua")).toBe(false);
  });

  test("birds and crickets", () => {
    let s = 1;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < 50; i++) {
      const call = birdCall(r);
      expect(call.length).toBeGreaterThanOrEqual(2);
      expect(call.length).toBeLessThanOrEqual(5);
      for (let j = 1; j < call.length; j++) expect(call[j].at).toBeGreaterThan(call[j - 1].at);
      for (const c of call) expect(Math.min(c.f0, c.f1)).toBeGreaterThan(1500);
    }
    expect(cricketChirp(r, 4300).every((c) => c.f0 === 4300)).toBe(true);
    expect(birdGap(0.5, 1, false, false)).toBeGreaterThan(birdGap(0.5, 0, false, false));
    expect(birdGap(0.5, 0, true, true)).toBeGreaterThan(birdGap(0.5, 0, false, false));
  });

  test("pan follows the camera right vector", () => {
    expect(panFor(1, 0, 1, 0)).toBeCloseTo(0.85);
    expect(panFor(-1, 0, 1, 0)).toBeCloseTo(-0.85);
    expect(panFor(0, 1, 1, 0)).toBeCloseTo(0);
    expect(panFor(0, 0, 1, 0)).toBe(0);
  });
});

describe("soundscape layers (fake context)", () => {
  test("builds loops, schedules one-shots in the future and tears everything down", () => {
    const f = new FakeAudioContext();
    const dest = f.createGain();
    const l = new Layers(asCtx(f), dest as unknown as AudioNode);
    const loops = f.sources();
    expect(loops.length).toBeGreaterThanOrEqual(4);
    l.apply(mixTargets({ ...base, water: 0.8, raining: true }), {
      gust: 1,
      windFreq: 500,
      waterBright: 0.5,
      waterPan: 0.3,
    });
    const before = f.sources().length;
    l.chirps(cricketChirp(Math.random, 4300), 2, 0.4, 0.05);
    l.owl(2, -0.3, 0.2);
    for (const s of ["stone", "grass", "wood", "water"] as const) l.step(s, 2, 1, 0.5);
    const shots = f.sources().slice(before);
    expect(shots.length).toBeGreaterThan(8);
    for (const s of shots) expect(s.started).toBeGreaterThanOrEqual(2);
    f.endAll();
    l.dispose();
    for (const s of loops) expect(s.stopped).not.toBeNull();
    const owned = f.nodes.filter((n: FakeNode) => n !== dest && n.kind !== "destination");
    // every node of the graph is disconnected once its sounds ended / the soundscape is disposed
    const still = owned.filter((n) => !n.disconnected && n.outputs.some((o) => o === dest));
    expect(still.length).toBe(0);
    expect(l.master).toBeDefined();
  });
});
