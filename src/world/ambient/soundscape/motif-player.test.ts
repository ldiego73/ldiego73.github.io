import { describe, expect, test } from "bun:test";
import type { MusicClock } from "../../../audio/contract";
import { asCtx, FakeAudioContext } from "../../../audio/fake-audio";
import { MotifPlayer } from "./motif-player";

const clockAt = (f: FakeAudioContext, trackId = "world.day", stepSec = 0.144): MusicClock => {
  // the music's grid: step 0 at t = 0
  const step = Math.ceil(f.currentTime / stepSec);
  return { trackId, step, time: step * stepSec, stepSec, swing: 0 };
};

function play(f: FakeAudioContext, m: MotifPlayer, secs: number, trackId = "world.day") {
  for (let t = 0; t < secs; t += 1 / 60) {
    f.currentTime += 1 / 60;
    m.update(clockAt(f, trackId));
  }
}

describe("motif player", () => {
  test("silent until a place is near; then plays notes on the grid, ahead of time", () => {
    const f = new FakeAudioContext();
    f.currentTime = 0;
    const m = new MotifPlayer(asCtx(f), f.createGain() as unknown as AudioNode);
    play(f, m, 4);
    expect(f.sources().length).toBe(0);
    m.set("ai", 1, 0.3);
    const before = f.sources().length;
    play(f, m, 20); // a full 8-bar loop at 104 bpm is ~18.5 s
    const started = f.sources().slice(before);
    expect(started.length).toBeGreaterThan(10);
    // every note starts on a 16th-note step of the grid
    const onsets = new Set(started.map((s) => Math.round((s.started ?? 0) * 1000)));
    for (const ms of onsets) {
      const k = ms / 144;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(0.02);
    }
    expect(m.level("ai")).toBe(1);
  });

  test("the summit motif waits for the summit track; station motifs stop there", () => {
    const f = new FakeAudioContext();
    f.currentTime = 0;
    const m = new MotifPlayer(asCtx(f), f.createGain() as unknown as AudioNode);
    m.set("summit", 1, 0);
    play(f, m, 20, "world.day");
    expect(f.sources().length).toBe(0);
    play(f, m, 20, "world.summit");
    expect(f.sources().length).toBeGreaterThan(0);
    m.set("summit", 0, 0);
    m.set("topsort", 1, 0);
    const n = f.sources().length;
    play(f, m, 20, "world.summit");
    expect(f.sources().length).toBe(n);
    play(f, m, 5, "arcade.snake");
    expect(f.sources().length).toBe(n);
  });

  test("fading out stops new notes and ramps the gain to zero; dispose disconnects", () => {
    const f = new FakeAudioContext();
    f.currentTime = 0;
    const m = new MotifPlayer(asCtx(f), f.createGain() as unknown as AudioNode);
    m.set("topsort", 1, -0.4);
    play(f, m, 6);
    m.set("topsort", 0, 0);
    const n = f.sources().length;
    play(f, m, 10);
    expect(f.sources().length).toBe(n);
    m.update(null);
    m.dispose();
    m.dispose();
    const gains = f.nodes.filter((x) => x.kind === "panner");
    expect(gains.some((g) => g.disconnected)).toBe(true);
  });
});
