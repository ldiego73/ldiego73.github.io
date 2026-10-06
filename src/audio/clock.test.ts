import { describe, expect, test } from "bun:test";
import { AudioEngine } from "./engine";
import { asCtx, FakeAudioContext } from "./fake-audio";
import { stepSeconds } from "./scheduler";
import { WORLD_TRACKS } from "./tracks/world";

describe("music clock and music bus", () => {
  test("a runner reports its step grid, advancing as it schedules", () => {
    const f = new FakeAudioContext();
    const engine = new AudioEngine(asCtx(f));
    const day = WORLD_TRACKS.day;
    const r = engine.createRunner(day, 2, 0.2);
    const c0 = r.clock();
    expect(c0).toMatchObject({ trackId: "world.day", step: 0, time: 2 });
    expect(c0.stepSec).toBeCloseTo(stepSeconds(day, 0.2));
    expect(c0.swing).toBeCloseTo(day.swing ?? 0);
    r.schedule(3, 2, 0.2, 0.025);
    const c1 = r.clock();
    expect(c1.step).toBeGreaterThan(0);
    expect(c1.time).toBeGreaterThanOrEqual(3);
    expect(c1.time).toBeLessThan(3 + c1.stepSec + 1e-9);
  });

  test("the music bus feeds the duck node (motifs duck and pause with the music)", () => {
    const f = new FakeAudioContext();
    const engine = new AudioEngine(asCtx(f));
    const bus = engine.musicBus as unknown as { outputs: unknown[] };
    expect(bus.outputs).toContain(engine.duckNode);
  });
});
