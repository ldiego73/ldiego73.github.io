import { describe, expect, test } from "bun:test";
import { createClimbTracker, emptyJourney, formatDuration, type JourneyState, summarize } from "./journey";

const memory = () => {
  let saved: JourneyState = emptyJourney();
  return { load: () => saved, save: (s: JourneyState) => (saved = s), get: () => saved };
};

describe("journey", () => {
  test("times a walk from the gate to the summit and keeps the best", () => {
    const m = memory();
    const c = createClimbTracker(m, () => 1000);
    c.update(0.1, 0.01); // at the gate: armed
    for (let i = 0; i < 300; i++) c.update(0.2, 0.05 + i * 0.003); // 60 s of walking
    c.update(0.2, 0.98);
    expect(m.get().climbs).toBe(1);
    expect(m.get().bestMs).toBe(60200);
    expect(m.get().firstSummitAt).toBe(1000);
    // A faster second climb becomes the best; the first summit date stays.
    c.update(0.1, 0.0);
    for (let i = 0; i < 250; i++) c.update(0.2, 0.05 + i * 0.0036);
    c.update(0.2, 0.99);
    expect(m.get().climbs).toBe(2);
    expect(m.get().bestMs).toBe(50200);
    expect(m.get().lastMs).toBe(50200);
  });

  test("a jump to the summit in seconds is not a climb", () => {
    const m = memory();
    const c = createClimbTracker(m);
    c.update(0.1, 0.01);
    c.update(0.2, 0.5);
    c.update(0.2, 0.99);
    expect(m.get().climbs).toBe(0);
  });

  test("fast travel voids the attempt; arriving mid-way never starts the clock", () => {
    const m = memory();
    const c = createClimbTracker(m);
    c.update(0.1, 0.01);
    c.update(1, 0.3);
    c.void();
    c.update(1, 0.99);
    expect(m.get().climbs).toBe(0);
    // Spawning mid-trail (no gate first) doesn't count either.
    const c2 = createClimbTracker(m);
    c2.update(1, 0.5);
    c2.update(1, 0.99);
    expect(m.get().climbs).toBe(0);
  });

  test("formats durations", () => {
    expect(formatDuration(545_000, "es")).toBe("9 min 05 s");
    expect(formatDuration(3_720_000, "en")).toBe("1 h 02 min");
    expect(formatDuration(42_000, "en")).toBe("42 s");
  });

  test("summary reads stamps, wildlife and the route from the passport", () => {
    const s = summarize(
      { stamps: { "station:gate": 1, "station:auna": 2, summit: 3, "fauna:puma": 4, "ride:llama": 5 } },
      emptyJourney(),
    );
    expect(s.reached).toBe(true);
    expect(s.route.find((r) => r.id === "auna")?.stamped).toBe(true);
    expect(s.route.find((r) => r.id === "xepelin")?.stamped).toBe(false);
    expect(s.wildlife.map((l) => l.en)).toEqual(["Puma"]);
    expect(s.rodeLlama).toBe(true);
    expect(s.stamps.got).toBe(5);
  });
});
