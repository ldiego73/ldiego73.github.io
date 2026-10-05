import { describe, expect, test } from "bun:test";
import { isDrum } from "../contract";
import { layerLength, parseSteps, pitchClass, tokens, trackLoopSteps, validateTrack } from "../notation";
import { WORLD_TRACKS } from "./world";

const { day, night, summit } = WORLD_TRACKS;

describe("world tracks", () => {
  for (const [name, t] of Object.entries(WORLD_TRACKS)) {
    test(`${name} validates, 128-step loop, tempoBoost in range`, () => {
      expect(validateTrack(t)).toEqual([]);
      expect(t.id).toBe(`world.${name}`);
      expect(trackLoopSteps(t)).toBe(128);
      expect(t.tempoBoost ?? 1.12).toBeGreaterThanOrEqual(1.05);
      expect(t.tempoBoost ?? 1.12).toBeLessThanOrEqual(1.12);
    });
    test(`${name} uses Andean voices and the intensity ladder`, () => {
      const voices = new Set(t.layers.map((l) => l.voice));
      for (const v of ["quena", "charango", "bombo", "pad"] as const) expect(voices.has(v)).toBe(true);
      expect(t.layers.some((l) => (l.minIntensity ?? 0) === 0)).toBe(true);
      expect(t.layers.some((l) => (l.minIntensity ?? 0) >= 0.85)).toBe(true);
    });
  }

  test("day and night share the tonic, summit too", () => {
    expect(pitchClass(day.key.root)).toBe(pitchClass(night.key.root));
    expect(pitchClass(summit.key.root)).toBe(pitchClass(day.key.root));
  });
  test("day is faster than night", () => {
    expect(day.bpm).toBeGreaterThan(night.bpm);
  });
  test("night base layers are sparse (note onsets <= 40% of steps)", () => {
    const base = night.layers.filter((l) => (l.minIntensity ?? 0) === 0);
    const hits = new Set<number>();
    for (const l of base) {
      const { events, length } = parseSteps(l.steps, isDrum(l.voice));
      for (let rep = 0; rep < 128 / length; rep++) for (const e of events) hits.add(e.step + rep * length);
    }
    expect(hits.size / 128).toBeLessThanOrEqual(0.4);
  });
  test("lead melodies are 8 bars of 16 steps", () => {
    for (const t of [day, night, summit]) {
      const lead = t.layers.find((l) => l.voice === "quena" && layerLength(l) === 128);
      expect(lead).toBeDefined();
      expect(tokens((lead as { steps: string }).steps).length).toBe(128);
    }
  });
});
