import { describe, expect, test } from "bun:test";
import { asCtx, FakeAudioContext } from "../../../audio/fake-audio";
import { rng } from "../../../audio/sfx";
import { createCreatureRegistry } from "../../creatures";
import { airCutoff, CALL_NAMES, playCall } from "./calls";
import { CALL_RULES, type CallRequest, Critters, callLevel, chatterGap, GLOBAL_GAP, type Situation } from "./critters";

const me = { x: 0, z: 0, rx: 1, rz: 0 };
const day: Situation = { night: false, time: 0.5, raining: false, inside: false };
const night: Situation = { night: true, time: 0.0, raining: false, inside: false };

/** Runs probes at 5 Hz for `secs` and collects every request. */
function run(c: Critters, sit: Situation, secs: number, start = 0, onProbe?: (t: number) => void) {
  const all: Array<CallRequest & { t: number }> = [];
  const buf: CallRequest[] = [];
  for (let t = start; t < start + secs; t += 0.2) {
    onProbe?.(t);
    for (const r of c.probe(t, 0.2, me, sit, buf)) all.push({ ...r, t });
  }
  return all;
}

describe("critter calls", () => {
  test("no bodies, no sound", () => {
    const c = new Critters(createCreatureRegistry(), rng(1));
    expect(run(c, night, 300)).toEqual([]);
    expect(c.nearestSongbird(0, 0, 50)).toBeNull();
  });

  test("puma growls only at night, sparsely, from its side, quieter when far", () => {
    const reg = createCreatureRegistry();
    const puma = reg.add("puma", 0.6, { x: 30, z: 0 });
    expect(run(new Critters(reg, rng(2)), day, 300)).toEqual([]);
    const calls = run(new Critters(reg, rng(2)), night, 300);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeLessThanOrEqual(12); // 28..55 s cooldown
    for (const c of calls) {
      expect(c.call).toBe("growl");
      expect(c.pan).toBeGreaterThan(0.8); // camera right = +x
    }
    puma.x = 70;
    const far = run(new Critters(reg, rng(2)), night, 200);
    expect(Math.max(...far.map((c) => c.level))).toBeLessThan(calls[0]?.level ?? 0);
    puma.x = 200;
    expect(run(new Critters(reg, rng(2)), night, 200)).toEqual([]);
  });

  test("fox yips at dusk/night, not at noon", () => {
    const reg = createCreatureRegistry();
    reg.add("fox", 0.4, { x: -10, z: 5 });
    expect(run(new Critters(reg, rng(3)), day, 200)).toEqual([]);
    const dusk = run(new Critters(reg, rng(3)), { ...day, time: 0.76 }, 200);
    expect(dusk.length).toBeGreaterThan(2);
    expect(dusk.every((c) => c.call === "yip" && c.pan < 0)).toBe(true);
  });

  test("animals never call closer together than the global gap; one animal call per probe", () => {
    const reg = createCreatureRegistry();
    for (const k of ["alpaca", "llama", "vizcacha", "tinamou", "condor", "bear", "colibri"])
      reg.add(k, 0.4, { x: 3, z: 2 });
    const calls = run(new Critters(reg, rng(4)), day, 600);
    expect(new Set(calls.map((c) => c.kind)).size).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < calls.length; i++)
      expect((calls[i]?.t ?? 0) - (calls[i - 1]?.t ?? 0)).toBeGreaterThanOrEqual(GLOBAL_GAP - 1e-9);
    // average rate stays calm: well under one call every 3 s
    expect(calls.length / 600).toBeLessThan(1 / 3);
    // low quality is sparser
    const low = run(new Critters(reg, rng(4), { low: true }), day, 600);
    expect(low.length).toBeLessThan(calls.length);
  });

  test("vicuña: an alarm trill when the nearest starts fleeing (rising edge), not while grazing", () => {
    const reg = createCreatureRegistry();
    const v = reg.add("vicuna", 0.5, { x: 12, z: 0 });
    const c = new Critters(reg, rng(5));
    expect(run(c, day, 30)).toEqual([]);
    // starts running at 6 u/s for 4 s
    const flee = run(c, day, 4, 30, () => {
      v.x += 6 * 0.2;
    });
    expect(flee.filter((r) => r.call === "trill").length).toBe(1);
    // stops, then flees again after the cooldown
    run(c, day, 10, 34);
    const again = run(c, day, 2, 44, () => {
      v.x += 6 * 0.2;
    });
    expect(again.filter((r) => r.call === "trill").length).toBe(1);
  });

  test("vicuña herd: the alarm still fires when the nearest animal changes during the flight", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("vicuna", 0.5, { x: 10, z: 0 });
    const b = reg.add("vicuna", 0.5, { x: 11, z: 3 });
    const c = new Critters(reg, rng(11));
    run(c, day, 20);
    // both bolt away from the listener; b overtakes a as the nearest... a runs off faster
    let trills = 0;
    for (let i = 0; i < 15; i++) {
      a.x += 1.6;
      b.x += 0.8;
      const buf: CallRequest[] = [];
      for (const r of c.probe(20 + i * 0.2, 0.2, me, day, buf)) if (r.call === "trill") trills++;
    }
    expect(trills).toBe(1);
  });

  test("duck whistles only over water", () => {
    const reg = createCreatureRegistry();
    reg.add("duck", 0.3, { x: 8, z: 0 });
    expect(run(new Critters(reg, rng(6), { isWater: () => false }), day, 200)).toEqual([]);
    const wet = run(new Critters(reg, rng(6), { isWater: () => true }), day, 200);
    expect(wet.length).toBeGreaterThan(3);
    expect(wet.every((c) => c.call === "duck")).toBe(true);
  });

  test("indoors the animals stay quiet", () => {
    const reg = createCreatureRegistry();
    reg.add("bear", 0.8, { x: 5, z: 0 });
    expect(run(new Critters(reg, rng(7)), { ...day, inside: true }, 300)).toEqual([]);
  });

  test("people murmur and laugh, children higher; busier crowds more often", () => {
    const reg = createCreatureRegistry();
    reg.add("vendor", 0.4, { x: 4, z: 4 });
    const one = run(new Critters(reg, rng(8)), day, 120).filter((c) => c.call === "chatter" || c.call === "laugh");
    expect(one.length).toBeGreaterThan(10);
    for (let i = 0; i < 6; i++) reg.add(i % 2 ? "child" : "shopper", 0.4, { x: -4 + i, z: 6 });
    const many = run(new Critters(reg, rng(8)), day, 120).filter((c) => c.call === "chatter" || c.call === "laugh");
    expect(many.length).toBeGreaterThan(one.length);
    expect(many.some((c) => c.kind === "child" && c.variant === 1)).toBe(true);
    expect(many.some((c) => c.call === "laugh")).toBe(true);
    expect(chatterGap(9, 0.5)).toBeLessThan(chatterGap(1, 0.5));
  });

  test("songbirds steer the birdsong toward the nearest tangara/sparrow", () => {
    const reg = createCreatureRegistry();
    reg.add("sparrow", 0.1, { x: 20, z: 0 });
    const t = reg.add("tangara", 0.1, { x: 0, z: 6 });
    const c = new Critters(reg, rng(9));
    expect(c.nearestSongbird(0, 0, 35)).toBe(t);
    expect(c.nearestSongbird(0, 0, 5)).toBeNull();
  });

  test("levels fall with distance and stay under each rule's level", () => {
    for (const r of CALL_RULES) {
      expect(callLevel(r, 0)).toBeCloseTo(r.level);
      expect(callLevel(r, r.half)).toBeLessThan(r.level * 0.6);
      expect(callLevel(r, r.range)).toBe(0);
      expect(r.level).toBeLessThanOrEqual(0.55);
    }
    expect(airCutoff(40)).toBeLessThan(airCutoff(2));
  });
});

describe("call synthesis", () => {
  for (const name of CALL_NAMES) {
    test(`${name} builds, schedules ahead and frees itself`, () => {
      const f = new FakeAudioContext();
      const dest = f.createGain() as unknown as AudioNode;
      playCall(asCtx(f), dest, name, 2, { level: 0.4, pan: 0.5, dist: 10, r: rng(1), variant: 1 });
      const src = f.sources();
      expect(src.length).toBeGreaterThan(0);
      for (const s of src) {
        expect(s.started ?? 0).toBeGreaterThanOrEqual(2);
        expect(s.stopped ?? 0).toBeLessThan(2 + 3);
      }
      f.endAll();
      const panner = f.nodes.find((n) => n.kind === "panner");
      expect(panner?.disconnected).toBe(true);
    });
  }
  test("a silent call builds nothing", () => {
    const f = new FakeAudioContext();
    playCall(asCtx(f), f.createGain() as unknown as AudioNode, "growl", 1, { level: 0, pan: 0, dist: 1, r: rng(1) });
    expect(f.sources().length).toBe(0);
  });
});
