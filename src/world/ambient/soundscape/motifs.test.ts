import { describe, expect, test } from "bun:test";
import { isDrum } from "../../../audio/contract";
import { parseSteps, pitchClass, trackLoopSteps, validateTrack } from "../../../audio/notation";
import { STATIONS } from "../../contract";
import {
  dueSteps,
  MINOR_BAR_TONES,
  MOTIF_STEPS,
  MOTIFS,
  motifAllowed,
  pickPlace,
  proximity,
  STATION_FULL,
  STATION_OUT,
  SUMMIT_BAR_TONES,
  stepTime,
} from "./motifs";

describe("place motifs", () => {
  test("every non-build station, the summit and the festival have a motif; builds none", () => {
    for (const s of STATIONS) expect(!!MOTIFS[s.id]).toBe(s.kind !== "build");
    expect(MOTIFS.summit?.mood).toBe("summit");
    expect(MOTIFS.festival?.mood).toBe("minor");
  });

  for (const [id, m] of Object.entries(MOTIFS)) {
    test(`${id}: valid notation in key, 128-step loop, quiet gains`, () => {
      const problems = validateTrack(m).filter((p) => !p.includes("layers, has"));
      expect(problems).toEqual([]);
      expect(trackLoopSteps(m)).toBe(MOTIF_STEPS);
      expect(m.level).toBeLessThanOrEqual(1);
      // offline renders (see the soundscape report) put every motif 6..14 dB under the track it decorates
      for (const l of m.layers) expect(l.gain ?? 0.6).toBeLessThanOrEqual(0.55);
    });

    test(`${id}: every note fits the chord of its bar (day and night, or summit)`, () => {
      const table = m.mood === "summit" ? SUMMIT_BAR_TONES : MINOR_BAR_TONES;
      for (const l of m.layers) {
        if (isDrum(l.voice)) continue;
        const { events, length } = parseSteps(l.steps, false);
        for (const e of events) {
          if (e.midi === null) continue;
          const bar = Math.floor(((e.step % length) % 128) / 16);
          const ok = (table[bar] ?? []).map((n) => pitchClass(n));
          expect({ id, bar, step: e.step, pc: e.midi % 12, ok: ok.includes(e.midi % 12) }).toMatchObject({ ok: true });
        }
      }
    });
  }

  test("minor motifs only over day/night, the summit motif only over the summit track", () => {
    const a = MOTIFS.avances;
    const s = MOTIFS.summit;
    if (!a || !s) throw new Error("missing");
    expect(motifAllowed(a, "world.day")).toBe(true);
    expect(motifAllowed(a, "world.night")).toBe(true);
    expect(motifAllowed(a, "world.summit")).toBe(false);
    expect(motifAllowed(s, "world.summit")).toBe(true);
    expect(motifAllowed(s, "world.day")).toBe(false);
    expect(motifAllowed(a, "arcade.snake")).toBe(false);
    expect(motifAllowed(a, null)).toBe(false);
  });

  test("proximity fades smoothly from full to silent", () => {
    expect(proximity(0, STATION_FULL, STATION_OUT)).toBe(1);
    expect(proximity(STATION_FULL, STATION_FULL, STATION_OUT)).toBe(1);
    expect(proximity(STATION_OUT, STATION_FULL, STATION_OUT)).toBe(0);
    let prev = 1;
    for (let d = STATION_FULL; d <= STATION_OUT; d += 0.5) {
      const w = proximity(d, STATION_FULL, STATION_OUT);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  test("pickPlace: strongest wins, the current one holds until clearly beaten", () => {
    const w = new Map([
      ["a", 0.6],
      ["b", 0.7],
    ]);
    expect(pickPlace(w, null)).toBe("b");
    expect(pickPlace(w, "a")).toBe("a"); // 0.7 < 0.6 + 0.15
    w.set("b", 0.8);
    expect(pickPlace(w, "a")).toBe("b");
    w.set("a", 0);
    w.set("b", 0.004);
    expect(pickPlace(w, "b")).toBeNull();
    expect(pickPlace(new Map(), "a")).toBeNull();
  });
});

describe("motif timing on the music grid", () => {
  const clock = { step: 100, time: 10, stepSec: 0.15, swing: 0.1 };

  test("stepTime follows the grid and swings odd steps", () => {
    expect(stepTime(clock, 100)).toBeCloseTo(10);
    expect(stepTime(clock, 102)).toBeCloseTo(10.3);
    expect(stepTime(clock, 101)).toBeCloseTo(10.15 + 0.015);
    expect(stepTime(clock, 98)).toBeCloseTo(9.7);
  });

  test("dueSteps covers the window once, never twice, and drops a stall instead of bursting", () => {
    const seen = new Set<number>();
    let last = 99;
    for (let now = 9.9; now < 12; now += 0.016) {
      const { from, to } = dueSteps(clock, last, now, 0.15);
      for (let s = from; s <= to; s++) {
        expect(seen.has(s)).toBe(false);
        seen.add(s);
        expect(stepTime(clock, s)).toBeGreaterThanOrEqual(now - 0.005);
        expect(stepTime(clock, s)).toBeLessThan(now + 0.15);
      }
      if (to >= from) last = to;
    }
    // contiguous coverage
    const arr = [...seen].sort((a, b) => a - b);
    for (let i = 1; i < arr.length; i++) expect((arr[i] ?? 0) - (arr[i - 1] ?? 0)).toBe(1);
    // a 3 s stall: the missed steps are skipped, only the upcoming window plays
    const { from, to } = dueSteps(clock, 100, 13, 0.15);
    expect(stepTime(clock, from)).toBeGreaterThanOrEqual(13 - 0.005);
    expect(to - from).toBeLessThanOrEqual(1);
  });
});
