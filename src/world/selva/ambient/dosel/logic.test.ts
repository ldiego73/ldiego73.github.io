import { describe, expect, test } from "bun:test";
import { CANOPY_T } from "../../contract";
import { BINS, binOf, coverage, feed, newTrack } from "./logic";

const [t0, t1] = CANOPY_T;
const walk = (from: number, to: number, steps = 400) => {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(from + ((to - from) * i) / steps);
  return out;
};

describe("canopy walkway tracker", () => {
  test("bins cover the range", () => {
    expect(binOf(t0, CANOPY_T)).toBe(0);
    expect(binOf(t1, CANOPY_T)).toBe(BINS - 1);
    expect(binOf(t0 - 0.001, CANOPY_T)).toBe(-1);
  });

  test("a full crossing stamps once, in either direction", () => {
    for (const [a, b] of [
      [t0 - 0.01, t1 + 0.01],
      [t1 + 0.01, t0 - 0.01],
    ] as const) {
      const tr = newTrack();
      let hits = 0;
      for (const t of walk(a, b)) if (feed(tr, t, true, CANOPY_T)) hits++;
      expect(hits).toBe(1);
      expect(tr.done).toBe(true);
    }
  });

  test("turning back halfway does not count, and leaving resets the stay", () => {
    const tr = newTrack();
    for (const t of walk(t0 - 0.01, (t0 + t1) / 2)) feed(tr, t, true, CANOPY_T);
    expect(coverage(tr)).toBeGreaterThan(0.4);
    for (const t of walk((t0 + t1) / 2, t0 - 0.01)) feed(tr, t, true, CANOPY_T);
    expect(tr.done).toBe(false);
    expect(coverage(tr)).toBe(0);
  });

  test("a teleport into the middle of the walkway breaks continuity", () => {
    const tr = newTrack();
    for (const t of walk(t0, t0 + (t1 - t0) * 0.4)) feed(tr, t, true, CANOPY_T);
    // Jump to the far end in one frame, then finish there.
    let hit = false;
    for (const t of walk(t1 - 0.001, t1)) hit = feed(tr, t, true, CANOPY_T) || hit;
    expect(hit).toBe(false);
    expect(tr.done).toBe(false);
  });

  test("off the deck (e.g. riding the canoe) never counts", () => {
    const tr = newTrack();
    for (const t of walk(t0, t1)) feed(tr, t, false, CANOPY_T);
    expect(tr.done).toBe(false);
  });
});
