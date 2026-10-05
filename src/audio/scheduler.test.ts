import { describe, expect, test } from "bun:test";
import type { Track } from "./contract";
import { layerGate, Scheduler, slew, stepSeconds, trackNormalization } from "./scheduler";

const track = (over: Partial<Track> = {}): Track => ({
  id: "t",
  title: "t",
  bpm: 120,
  key: { root: "C", scale: "major" },
  layers: [
    { voice: "kick", steps: "x . . . x . . . x . . . x . . .", gain: 0.5 },
    { voice: "triangle", steps: "C3 . . . G3 . . . C3 . . . G3 . . .", gain: 0.5 },
    { voice: "pulse25", steps: "C5 D5 E5 G5", gain: 0.4, minIntensity: 0.5 },
  ],
  ...over,
});

describe("scheduler", () => {
  test("event times at 120 bpm / 4 steps per beat (125 ms per step)", () => {
    const s = new Scheduler(track(), 10);
    const ev = s.collect(10.6, 0);
    const kicks = ev.filter((e) => e.voice === "kick").map((e) => e.time);
    expect(kicks[0]).toBeCloseTo(10, 6);
    expect(kicks[1]).toBeCloseTo(10.5, 6);
    expect(kicks.length).toBe(2);
    expect(ev.some((e) => e.voice === "pulse25")).toBe(false);
  });

  test("window is half open and resumes without repeats or gaps", () => {
    const s = new Scheduler(track(), 0);
    const a = s.collect(0.5, 0);
    const b = s.collect(1.0, 0);
    const steps = [...a, ...b].map((e) => `${e.layer}:${e.step}`);
    expect(new Set(steps).size).toBe(steps.length);
    expect(b.every((e) => e.time >= 0.5 && e.time < 1.0)).toBe(true);
  });

  test("loops wrap and shorter layers repeat", () => {
    const s = new Scheduler(track({ tempoBoost: 1 }), 0);
    const ev = s.collect(16 * 0.125 * 2, 1); // two loops, intensity 1 so the 4-step layer plays
    const lead = ev.filter((e) => e.voice === "pulse25");
    expect(lead.length).toBe(32);
    expect(lead.slice(0, 8).map((e) => e.midi)).toEqual([72, 74, 76, 79, 72, 74, 76, 79]);
    expect(ev.filter((e) => e.voice === "kick").length).toBe(8);
    expect(s.loopSteps).toBe(16);
  });

  test("ties extend duration, octave shifts notes", () => {
    const t = track({
      layers: [{ voice: "triangle", steps: "C3 - - - D3 . . . ".repeat(2), octave: -1 }, track().layers[0]!],
    });
    const ev = new Scheduler(t, 0).collect(1, 0).filter((e) => e.voice === "triangle");
    expect(ev[0]?.dur).toBeCloseTo(4 * 0.125, 6);
    expect(ev[0]?.midi).toBe(48 - 12);
  });

  test("swing delays odd steps only", () => {
    const t = track({ swing: 0.4, layers: [{ voice: "hat", steps: "x ".repeat(16) }, track().layers[0]!] });
    const hats = new Scheduler(t, 0).collect(0.5, 0).filter((e) => e.voice === "hat");
    expect(hats[0]?.time).toBeCloseTo(0, 6);
    expect(hats[1]?.time).toBeCloseTo(0.125 + 0.4 * 0.125, 6);
    expect(hats[2]?.time).toBeCloseTo(0.25, 6);
  });

  test("intensity gating is soft", () => {
    const l = { voice: "pulse25" as const, steps: "C5", minIntensity: 0.5, maxIntensity: 0.9 };
    expect(layerGate(l, 0.2)).toBe(0);
    expect(layerGate(l, 0.5)).toBe(1);
    expect(layerGate(l, 0.9)).toBe(1);
    expect(layerGate(l, 1.05)).toBe(0);
    const mid = layerGate(l, 0.425);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(layerGate({ voice: "kick", steps: "x" }, 0)).toBe(1);
    // gated-out layers emit nothing, fading layers emit reduced gain
    const t = track();
    const full = new Scheduler(t, 0).collect(1, 1).find((e) => e.voice === "pulse25");
    const fading = new Scheduler(t, 0).collect(1, 0.42).find((e) => e.voice === "pulse25");
    expect(fading).toBeDefined();
    expect(fading!.gain / trackNormalization(t, 0.42)).toBeLessThan(full!.gain / trackNormalization(t, 1));
  });

  test("tempo scales with intensity up to tempoBoost", () => {
    const t = track({ tempoBoost: 1.2 });
    expect(stepSeconds(t, 0)).toBeCloseTo(0.125, 9);
    expect(stepSeconds(t, 1)).toBeCloseTo(0.125 / 1.2, 9);
    expect(stepSeconds(track({ tempoBoost: 1 }), 1)).toBeCloseTo(0.125, 9);
    expect(stepSeconds(track(), 1)).toBeCloseTo(0.125 / 1.12, 9);
  });

  test("tempo change keeps the step position continuous", () => {
    const s = new Scheduler(
      track({ tempoBoost: 1.5, layers: [{ voice: "hat", steps: "x ".repeat(16) }, track().layers[0]!] }),
      0,
    );
    const all = [...s.collect(1, 0), ...s.collect(2, 0.5), ...s.collect(3, 1)].filter((e) => e.voice === "hat");
    const steps = all.map((e) => e.step);
    expect(steps).toEqual(steps.map((_, i) => i)); // no skipped or repeated step
    for (let i = 1; i < all.length; i++) expect(all[i]!.time).toBeGreaterThan(all[i - 1]!.time);
    const gaps = all.slice(1).map((e, i) => e.time - all[i]!.time);
    expect(gaps[0]).toBeCloseTo(0.125, 6);
    expect(gaps[gaps.length - 1]).toBeCloseTo(0.125 / 1.5, 6);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.125 + 1e-9);
  });

  test("stalled timer drops past events instead of bursting", () => {
    const s = new Scheduler(track(), 0);
    const ev = s.collect(5, 0, 4.9);
    expect(ev.every((e) => e.time >= 4.9)).toBe(true);
    expect(s.step).toBeGreaterThan(30);
  });

  test("normalization lowers gain as layers stack up", () => {
    const t = track();
    expect(trackNormalization(t, 1)).toBeLessThan(trackNormalization(t, 0));
  });

  test("slew limits the rate", () => {
    expect(slew(0, 1, 0.6, 1.2)).toBeCloseTo(0.5, 9);
    expect(slew(0.9, 1, 0.6, 1.2)).toBe(1);
    expect(slew(1, 0, 0.12, 1.2)).toBeCloseTo(0.9, 9);
  });
});
