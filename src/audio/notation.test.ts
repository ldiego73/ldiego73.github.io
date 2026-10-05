import { describe, expect, test } from "bun:test";
import type { Track } from "./contract";
import { noteToMidi, parseSteps, pitchClass, validateTrack } from "./notation";

describe("notation", () => {
  test("notes to MIDI", () => {
    expect(noteToMidi("C4")).toBe(60);
    expect(noteToMidi("A4")).toBe(69);
    expect(noteToMidi("C#3")).toBe(49);
    expect(noteToMidi("Bb2")).toBe(46);
    expect(noteToMidi("H4")).toBeNull();
    expect(pitchClass("Bb")).toBe(10);
  });

  test("steps: rests, ties and velocities", () => {
    const { events, length } = parseSteps("A3 - . C4:0.5 | E4", false);
    expect(length).toBe(5);
    expect(events).toEqual([
      { step: 0, midi: 57, vel: 0.8, len: 2 },
      { step: 3, midi: 60, vel: 0.5, len: 1 },
      { step: 4, midi: 64, vel: 0.8, len: 1 },
    ]);
  });

  test("drums and errors", () => {
    expect(parseSteps("x . X x:0.3", true).events.map((e) => e.vel)).toEqual([0.7, 1, 0.3]);
    expect(() => parseSteps("A3", true)).toThrow();
    expect(() => parseSteps("- A3", false)).toThrow();
    expect(() => parseSteps("A3 Z9", false)).toThrow();
  });
});

describe("validateTrack", () => {
  const ok: Track = {
    id: "t.ok",
    title: "ok",
    bpm: 120,
    key: { root: "A", scale: "minorPentatonic" },
    layers: [
      { voice: "pulse25", steps: "A3 . C4 . D4 . E4 . G4 . E4 . D4 . C4 ." },
      { voice: "kick", steps: "x . . . x . . . x . . . x . . .", minIntensity: 0.3 },
    ],
  };
  test("accepts a clean track", () => expect(validateTrack(ok)).toEqual([]));
  test("rejects out-of-key notes, bad loops and silent intensity 0", () => {
    const bad: Track = {
      ...ok,
      layers: [
        { voice: "pulse25", steps: "A3 . C#4 . D4 . E4 . G4 . E4 . D4 . C4 .", minIntensity: 0.5 },
        { voice: "kick", steps: "x . . x . . x . . . x", minIntensity: 0.3 },
      ],
    };
    const problems = validateTrack(bad).join("\n");
    expect(problems).toContain("outside the key");
    expect(problems).toContain("does not divide");
    expect(problems).toContain("no layer is audible at intensity 0");
  });
});
