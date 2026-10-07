import { describe, expect, test } from "bun:test";
import {
  type ClimbNotice,
  createClimbTracker,
  createPathRecorder,
  decodePath,
  emptyJourney,
  encodePath,
  formatClock,
  formatDuration,
  GHOST_MAX,
  type GhostPath,
  type JourneyState,
  samplePath,
  shouldReplaceGhost,
  summarize,
} from "./journey";

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

  test("the mountain summary keeps its shape; the jungle summary reads the jungle page", () => {
    const stamps = {
      "station:gate": 1,
      summit: 2,
      "ride:llama": 3,
      "selva:station:puerto": 4,
      "selva:station:collpa": 5,
      "selva:ride:canoe": 6,
      "selva:fauna:bufeo": 7,
      "fauna:puma": 8,
    };
    const m = summarize({ stamps }, emptyJourney());
    expect(m.world).toBe("qhapaq");
    expect(m.route[0]?.id).toBe("gate");
    expect(m.rodeLlama).toBe(true);
    const s = summarize({ stamps }, emptyJourney(), "selva");
    expect(s.world).toBe("selva");
    expect(s.reached).toBe(true);
    expect(s.route.map((r) => r.id)).toEqual([
      "puerto",
      "regaton",
      "maloca",
      "embarcadero",
      "palafitos",
      "arcade",
      "collpa",
    ]);
    expect(s.route.filter((r) => r.stamped).map((r) => r.id)).toEqual(["puerto", "collpa"]);
    expect(s.wildlife.map((l) => l.en)).toEqual(["Pink river dolphin"]);
    expect(s.rodeCanoe).toBe(true);
    expect(s.canopy).toBe(false);
    expect(s.rodeLlama).toBe(false);
    expect(s.stamps.got).toBe(4);
    expect(s.stamps.total).toBeGreaterThan(s.stamps.got);
    // Reaching the mountain summit says nothing about the jungle road.
    expect(summarize({ stamps: { summit: 1 } }, emptyJourney(), "selva").reached).toBe(false);
  });

  test("announces start, void and done transitions once each", () => {
    const m = memory();
    const seen: ClimbNotice[] = [];
    const c = createClimbTracker(
      m,
      () => 1,
      (n) => seen.push(n),
    );
    c.update(0.1, 0.01);
    c.update(0.2, 0.05);
    for (let i = 0; i < 10; i++) c.void(); // the tour voids every frame: one notice
    expect(seen.map((n) => n.phase)).toEqual(["start", "void"]);
    seen.length = 0;
    c.update(0.1, 0.01);
    for (let i = 0; i < 300; i++) c.update(0.2, 0.05 + i * 0.003);
    c.update(0.2, 0.98);
    expect(seen).toEqual([{ phase: "start" }, { phase: "done", ms: 60200, prevBestMs: null, isBest: true }]);
    seen.length = 0;
    // Slower second climb: done, not a best. Walking back to the gate mid-climb voids.
    c.update(0.1, 0.01);
    for (let i = 0; i < 400; i++) c.update(0.2, 0.05 + i * 0.002);
    c.update(0.2, 0.98);
    c.update(0.1, 0.01);
    c.update(0.1, 0.05);
    c.update(0.1, 0.02);
    expect(seen.map((n) => n.phase)).toEqual(["start", "done", "start", "void"]);
    expect(seen[1]).toMatchObject({ prevBestMs: 60200, isBest: false });
  });

  test("race clock format", () => {
    expect(formatClock(222_540)).toBe("03:42.5");
    expect(formatClock(3_729_000)).toBe("1:02:09.0");
    expect(formatClock(-5)).toBe("00:00.0");
  });
});

describe("ghost path", () => {
  const walk = (seconds: number) => {
    const r = createPathRecorder();
    // ~60 fps, a winding walk with turns through ±π.
    for (let t = 0; t <= seconds; t += 1 / 60) {
      const a = t * 0.3;
      r.add(t, -40 + Math.cos(a) * 30 + t * 0.8, 25 + Math.sin(a) * 30, a * 1.7);
    }
    return r;
  };

  test("samples every 0.25 s from the clock start", () => {
    const r = walk(60);
    expect(r.count).toBeGreaterThanOrEqual(240);
    expect(r.count).toBeLessThanOrEqual(241);
    const p = r.toPath(60_000) as GhostPath;
    expect(p.n).toBe(r.count);
    expect(p.xs[0]).toBeCloseTo(-10, 4);
  });

  test("encodes compactly and round-trips within the quantization step", () => {
    const p = walk(600).toPath(600_000) as GhostPath;
    const s = encodePath(p);
    expect(s.length).toBeLessThan(p.n * 3 * 1.2); // ~one char per value
    expect(JSON.stringify(s).length).toBe(s.length + 2); // nothing needs escaping in JSON
    const d = decodePath(s, p.n);
    expect(d).not.toBeNull();
    for (let i = 0; i < p.n; i++) {
      expect(Math.abs((d?.xs[i] ?? 0) - (p.xs[i] ?? 0))).toBeLessThan(0.051);
      expect(Math.abs((d?.zs[i] ?? 0) - (p.zs[i] ?? 0))).toBeLessThan(0.051);
      const dy = (d?.yaws[i] ?? 0) - (p.yaws[i] ?? 0);
      expect(Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)))).toBeLessThan(0.03);
    }
  });

  test("corrupt data or a wrong sample count decodes to null", () => {
    const p = walk(10).toPath(10_000) as GhostPath;
    const s = encodePath(p);
    expect(decodePath(s, p.n + 1)).toBeNull();
    expect(decodePath(`${s}!`, p.n)).toBeNull();
    expect(decodePath(`~zz${s}`, p.n)).toBeNull();
    expect(decodePath("abc\u0001", 2)).toBeNull();
  });

  test("a climb longer than the cap keeps no path; too-short recordings neither", () => {
    const r = createPathRecorder(0.25, 8);
    for (let t = 0; t < 5; t += 0.1) r.add(t, t, 0, 0);
    expect(r.overflow).toBe(true);
    expect(r.toPath(5000)).toBeNull();
    const r2 = createPathRecorder();
    r2.add(0, 0, 0, 0);
    expect(r2.toPath(100)).toBeNull();
    expect(GHOST_MAX).toBe(7200);
  });

  test("replay interpolates between samples and reports when the ghost has finished", () => {
    const p: GhostPath = {
      ms: 500,
      dt: 0.25,
      n: 3,
      xs: new Float32Array([0, 1, 3]),
      zs: new Float32Array([0, 0, 2]),
      yaws: new Float32Array([3, -3, 0]),
    };
    const o = { x: 0, z: 0, yaw: 0 };
    expect(samplePath(p, 0.125, o)).toBe(true);
    expect(o.x).toBeCloseTo(0.5);
    // 3 → -3 rad turns the short way through π, not back through 0.
    expect(Math.abs(o.yaw)).toBeGreaterThan(3);
    expect(samplePath(p, 0.375, o)).toBe(true);
    expect(o.x).toBeCloseTo(2);
    expect(o.z).toBeCloseTo(1);
    expect(samplePath(p, 9, o)).toBe(false);
    expect(o.x).toBe(3);
  });

  test("only a faster climb replaces the stored ghost", () => {
    const g = { ms: 300_000 } as GhostPath;
    expect(shouldReplaceGhost(null, 900_000)).toBe(true);
    expect(shouldReplaceGhost(g, 299_000)).toBe(true);
    expect(shouldReplaceGhost(g, 300_000)).toBe(false);
    expect(shouldReplaceGhost(g, 310_000)).toBe(false);
  });
});
