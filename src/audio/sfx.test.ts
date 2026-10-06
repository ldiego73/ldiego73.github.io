import { describe, expect, test } from "bun:test";
import type { AudioOutput } from "./contract";
import { asCtx, FakeAudioContext } from "./fake-audio";
import { chimeNotes, createSfx, hashSeed, PENTATONIC, RateGate, renderSfx, rng, SFX_NAMES, sfxForStamp } from "./sfx";

describe("sfx pure parts", () => {
  test("chime is a rising pentatonic phrase, deterministic per seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = chimeNotes(seed);
      expect(n).toEqual(chimeNotes(seed));
      for (const m of n) expect(PENTATONIC as readonly number[]).toContain(m);
      expect(n[1]).toBeGreaterThan(n[0]);
      expect(n[2]).toBeGreaterThan(n[1]);
      expect([69, 74]).toContain(n[2]);
    }
  });

  test("stamp kinds map to their effect", () => {
    expect(sfxForStamp({ id: "station:auna", kind: "station" })).toBe("stamp");
    expect(sfxForStamp({ id: "summit", kind: "summit" })).toBeNull();
    expect(sfxForStamp({ id: "egg:vizcacha-3", kind: "egg" })).toBe("squeak");
    expect(sfxForStamp({ id: "egg:golden-khipu", kind: "egg" })).toBe("sparkle");
  });

  test("rate gate blocks bursts per key only", () => {
    const g = new RateGate();
    expect(g.allow("a", 1, 0.2)).toBe(true);
    expect(g.allow("a", 1.1, 0.2)).toBe(false);
    expect(g.allow("b", 1.1, 0.2)).toBe(true);
    expect(g.allow("a", 1.25, 0.2)).toBe(true);
  });

  test("rng and hash are stable", () => {
    expect(hashSeed("egg:golden-khipu")).toBe(hashSeed("egg:golden-khipu"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 5; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("sfx synthesis (fake context)", () => {
  test("every effect schedules sources in the future and frees its graph", () => {
    for (const name of SFX_NAMES) {
      const f = new FakeAudioContext();
      const ctx = asCtx(f);
      const end = renderSfx(ctx, null, ctx.destination, name, 2, { seed: 3, pan: 0.5 });
      expect(end).toBeGreaterThan(2);
      expect(end).toBeLessThan(4);
      const src = f.sources();
      expect(src.length).toBeGreaterThan(0);
      for (const s of src) {
        expect(s.started).toBeGreaterThanOrEqual(2);
        expect(s.stopped ?? 0).toBeGreaterThan(s.started ?? 0);
      }
    }
  });

  test("musical effects use the engine voices when given", () => {
    const f = new FakeAudioContext();
    const calls: string[] = [];
    const voices = {
      play: (v: string) => {
        calls.push(v);
        return true;
      },
    } as unknown as AudioOutput["voices"];
    renderSfx(asCtx(f), voices, asCtx(f).destination, "stamp", 1, { seed: 1 });
    expect(calls.filter((c) => c === "quena").length).toBe(3);
    calls.length = 0;
    renderSfx(asCtx(f), voices, asCtx(f).destination, "sparkle", 1, { seed: 1 });
    expect(calls.every((c) => c === "bell")).toBe(true);
  });

  test("bus stays silent without a live output, plays and rate-limits with one", () => {
    let out: AudioOutput | null = null;
    const s = createSfx(() => out);
    expect(s.play("tick")).toBe(false);
    const f = new FakeAudioContext();
    const bus = f.createGain();
    out = {
      ctx: asCtx(f),
      sfx: bus as unknown as AudioNode,
      ambient: bus as unknown as AudioNode,
      voices: { play: () => true } as unknown as AudioOutput["voices"],
    };
    expect(s.play("tick")).toBe(true);
    expect(s.play("tick")).toBe(false); // same instant: gated
    f.currentTime += 1;
    expect(s.play("tick")).toBe(true);
    f.state = "suspended";
    f.currentTime += 1;
    expect(s.play("tick")).toBe(false);
  });
});
