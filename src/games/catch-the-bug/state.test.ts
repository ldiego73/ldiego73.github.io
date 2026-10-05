import { describe, expect, test } from "bun:test";
import {
  type CatchEvent,
  COMBO_WINDOW,
  collect,
  createState,
  DIFFICULTY,
  type GameState,
  isVisible,
  latAt,
  pace,
  pointsFor,
  RELEASE_EVERY,
  releaseName,
  type StepEvent,
  seeded,
  spawn,
  spawnPower,
  stageOf,
  statusText,
  step,
  tap,
  UNIT_TIME,
} from "./state";

/** Freeze spawns of bugs and power-ups so a test controls the board. */
const quiet = (s: GameState) => {
  s.spawnTimer = 1e9;
  s.powerTimer = 1e9;
  return s;
};

describe("path progression", () => {
  test("bugs advance through DEV, QA, STAGING in order", () => {
    const s = quiet(createState(seeded(3)));
    const b = spawn(s, "normal");
    const seen: number[] = [];
    for (let i = 0; i < 2000 && s.bugs.includes(b); i++) {
      const st = stageOf(b.p);
      if (seen.at(-1) !== st) seen.push(st);
      step(s, 0.02);
    }
    expect(seen).toEqual([0, 1, 2]);
  });

  test("fast bugs outrun normal ones; lateral offset stays on the board", () => {
    const s = createState(seeded(7));
    const n = spawn(s, "normal");
    const f = spawn(s, "fast");
    expect(f.speed).toBeGreaterThan(n.speed);
    const z = spawn(s, "zigzag");
    for (let p = 0; p < 3; p += 0.01) {
      for (const b of [n, f, z]) expect(Math.abs(latAt(b, p))).toBeLessThanOrEqual(1);
    }
  });

  test("heisenbugs blink and cannot be caught while invisible", () => {
    const s = createState(seeded(1));
    const h = spawn(s, "heisen");
    h.phase = 0;
    h.age = 2.0; // inside the invisible window
    expect(isVisible(h)).toBe(false);
    expect(tap(s, h.id)).toBeNull();
    h.age = 0.5;
    expect(isVisible(h)).toBe(true);
    expect(tap(s, h.id)?.type).toBe("catch");
  });
});

describe("incidents", () => {
  test("each bug reaching PROD is an incident; three ends the run once on normal", () => {
    const s = quiet(createState(seeded(5)));
    for (let i = 0; i < 4; i++) spawn(s, "normal", 2.99 - i * 0.2);
    const events: StepEvent[] = [];
    for (let i = 0; i < 400; i++) events.push(...step(s, 0.05));
    expect(events.filter((e) => e.type === "incident")).toHaveLength(3);
    expect(events.filter((e) => e.type === "gameover")).toHaveLength(1);
    expect(s.over).toBe(true);
    expect(statusText(s, "en")).toBe("Incidents 3/3 · Combo x1");
    expect(statusText(s, "es")).toBe("Incidentes 3/3 · Combo x1");
  });

  test("an idle player reaches gameover on every difficulty", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = createState(seeded(9), level);
      let over = false;
      for (let i = 0; i < 60 * 180 && !over; i++) over = step(s, 1 / 60).some((e) => e.type === "gameover");
      expect(over).toBe(true);
      expect(s.incidents).toBe(DIFFICULTY[level].incidents);
    }
  });
});

describe("difficulty", () => {
  test("incident budget: easy 5, normal 3, hard 2", () => {
    expect(createState(seeded(1), "easy").maxIncidents).toBe(5);
    expect(createState(seeded(1), "normal").maxIncidents).toBe(3);
    expect(createState(seeded(1), "hard").maxIncidents).toBe(2);
    expect(statusText(createState(seeded(1), "hard"), "en")).toBe("Incidents 0/2 · Combo x1");
  });

  test("hard is faster and spawns more often than normal, normal than easy", () => {
    for (const t of [0, 30, 90]) {
      const [e, n, h] = (["easy", "normal", "hard"] as const).map((l) => pace(t, l));
      expect(h.speed).toBeGreaterThan(n.speed);
      expect(n.speed).toBeGreaterThan(e.speed);
      expect(h.interval).toBeLessThan(n.interval);
      expect(n.interval).toBeLessThan(e.interval);
    }
  });

  test("easy ramps slower: it takes longer to reach the same pressure", () => {
    expect(pace(60, "easy").interval / DIFFICULTY.easy.interval).toBeGreaterThan(
      pace(60, "normal").interval / DIFFICULTY.normal.interval,
    );
  });

  test("hard sends more heisenbugs", () => {
    const count = (level: "normal" | "hard") => {
      const s = createState(seeded(13), level);
      s.powerTimer = 1e9;
      let n = 0;
      for (let i = 0; i < 60 * 120; i++) {
        step(s, 1 / 60);
        for (const b of s.bugs) if (b.kind === "heisen") n++;
        s.bugs.length = 0;
        s.incidents = 0;
      }
      return n;
    };
    expect(count("hard")).toBeGreaterThan(count("normal") * 1.5);
  });

  test("speed rises and spawn interval falls monotonically, then plateau", () => {
    let prev = pace(0);
    for (let t = 5; t <= 200; t += 5) {
      const d = pace(t);
      expect(d.speed).toBeGreaterThanOrEqual(prev.speed);
      expect(d.interval).toBeLessThanOrEqual(prev.interval);
      prev = d;
    }
    expect(pace(500)).toEqual({ speed: 0.45, interval: 0.45 });
  });

  test("new bug kinds unlock over time", () => {
    const s = createState(seeded(21));
    s.powerTimer = 1e9;
    const kinds = new Set<string>();
    for (let i = 0; i < 60 * 100; i++) {
      step(s, 1 / 60);
      for (const b of s.bugs) kinds.add(b.kind);
      s.bugs.length = 0;
    }
    expect([...kinds].sort()).toEqual(["fast", "flaky", "heisen", "normal", "regression", "zigzag"]);
  });
});

describe("scoring", () => {
  test("earlier stages pay more: DEV x3, QA x2, STAGING x1", () => {
    expect(pointsFor(0.5, 1)).toBe(30);
    expect(pointsFor(1.5, 1)).toBe(20);
    expect(pointsFor(2.5, 1)).toBe(10);
    expect(pointsFor(0.5, 4)).toBe(120);
  });

  test("quick consecutive catches build a combo that expires", () => {
    const s = quiet(createState(seeded(2)));
    const a = spawn(s, "normal", 0.2);
    const b = spawn(s, "normal", 1.2);
    const c = spawn(s, "normal", 2.2);
    expect(tap(s, a.id)).toMatchObject({ type: "catch", stage: 0, combo: 1, points: 30 });
    expect(tap(s, b.id)).toMatchObject({ type: "catch", stage: 1, combo: 2, points: 40 });
    expect(statusText(s, "en")).toBe("Incidents 0/3 · Combo x2");
    c.speed = 0;
    const ev = step(s, COMBO_WINDOW + 0.1);
    expect(ev.some((e) => e.type === "combo-reset")).toBe(true);
    expect(tap(s, c.id)).toMatchObject({ stage: 2, combo: 1, points: 10 });
    expect(s.score).toBe(80);
    expect(s.caught).toBe(3);
  });

  test("flaky bugs need two taps", () => {
    const s = createState(seeded(4));
    const f = spawn(s, "flaky", 0.5);
    expect(tap(s, f.id)?.type).toBe("armor");
    expect(s.score).toBe(0);
    expect(tap(s, f.id)?.type).toBe("catch");
    expect(tap(s, f.id)).toBeNull();
  });

  test("a regression caught late respawns once in DEV; caught early it stays down", () => {
    const s = quiet(createState(seeded(6)));
    const late = spawn(s, "regression", 2.4);
    const r = tap(s, late.id) as CatchEvent;
    expect(r.respawn).not.toBeNull();
    expect(r.respawn?.p).toBe(0);
    expect(s.bugs).toContain(r.respawn as never);
    // The relapsed copy does not come back again, even late.
    (r.respawn as { p: number }).p = 2.5;
    expect((tap(s, r.respawn?.id ?? -1) as CatchEvent).respawn).toBeNull();
    const early = spawn(s, "regression", 0.4);
    expect((tap(s, early.id) as CatchEvent).respawn).toBeNull();
    expect(s.bugs).toHaveLength(0);
  });

  test("a scripted player that catches everything early survives and scores", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = createState(seeded(11), level);
      for (let i = 0; i < 60 * 90; i++) {
        step(s, 1 / 60);
        for (const b of [...s.bugs]) if (b.p > 0.3) tap(s, b.id);
        if (s.power) collect(s, s.power.id);
      }
      expect(s.over).toBe(false);
      expect(s.caught).toBeGreaterThan(40);
      expect(s.score).toBeGreaterThan(s.caught * 30);
    }
  });
});

describe("releases", () => {
  test("waves are named releases announced on schedule", () => {
    expect(releaseName(0)).toBe("v1.0");
    expect(releaseName(1)).toBe("v1.1");
    expect(releaseName(12)).toBe("v2.2");
    const s = quiet(createState(seeded(3)));
    const names: string[] = [];
    for (let i = 0; i < 60 * (RELEASE_EVERY * 2 + 1); i++)
      for (const e of step(s, 1 / 60)) if (e.type === "release") names.push(e.name);
    expect(names).toEqual(["v1.0", "v1.1", "v1.2"]);
  });
});

describe("power-ups", () => {
  test("they drop occasionally and expire if not collected", () => {
    const s = createState(seeded(8));
    s.spawnTimer = 1e9;
    const ev: StepEvent[] = [];
    for (let i = 0; i < 60 * 40; i++) ev.push(...step(s, 1 / 60));
    expect(ev.filter((e) => e.type === "power-spawn").length).toBeGreaterThanOrEqual(1);
    expect(ev.filter((e) => e.type === "power-expire").length).toBeGreaterThanOrEqual(1);
    expect(collect(s, 12345)).toBeNull();
  });

  test("Unit tests slow DEV bugs for a few seconds", () => {
    const s = quiet(createState(seeded(1)));
    const dev = spawn(s, "normal", 0.1);
    const qa = spawn(s, "normal", 1.1);
    dev.speed = qa.speed = 0.1;
    expect(collect(s, spawnPower(s, "unit").id)?.kind).toBe("unit");
    step(s, 1);
    expect(dev.p).toBeCloseTo(0.1 + 0.1 * 0.45, 5);
    expect(qa.p).toBeCloseTo(1.2, 5);
    step(s, UNIT_TIME);
    const before = dev.p;
    step(s, 1);
    expect(dev.p - before).toBeCloseTo(0.1, 5);
  });

  test("Code review auto-catches the next three bugs entering QA", () => {
    const s = quiet(createState(seeded(2)));
    collect(s, spawnPower(s, "review").id);
    for (let i = 0; i < 4; i++) spawn(s, "normal", 0.99 - i * 0.001).speed = 0.5;
    const caught = step(s, 0.1).filter((e): e is CatchEvent => e.type === "catch");
    expect(caught).toHaveLength(3);
    expect(caught.every((c) => c.auto && c.stage === 1)).toBe(true);
    expect(s.bugs).toHaveLength(1);
    expect(s.effects.review).toBe(0);
    expect(s.caught).toBe(3);
  });

  test("Feature flag ignores one bug reaching PROD", () => {
    const s = quiet(createState(seeded(3)));
    collect(s, spawnPower(s, "flag").id);
    spawn(s, "normal", 2.99);
    spawn(s, "normal", 2.98);
    const ev = step(s, 0.5);
    expect(ev.filter((e) => e.type === "flagged")).toHaveLength(1);
    expect(ev.filter((e) => e.type === "incident")).toHaveLength(1);
    expect(s.incidents).toBe(1);
  });
});

describe("power-up boundaries", () => {
  test("Unit tests lasts exactly five seconds, including the expiry frame", () => {
    const s = quiet(createState(seeded(1)));
    const bug = spawn(s, "normal", 0);
    bug.speed = 0.1;
    collect(s, spawnPower(s, "unit").id);
    for (let i = 0; i < 100; i++) step(s, 0.05);
    expect(bug.p).toBeCloseTo(0.225, 8);
    expect(s.effects.unit).toBeCloseTo(0, 8);
    step(s, 0.05);
    expect(bug.p).toBeCloseTo(0.23, 8);
  });

  test("Unit tests only slows the DEV portion of a crossing frame", () => {
    const s = quiet(createState(seeded(1)));
    const bug = spawn(s, "normal", 0.99);
    bug.speed = 1;
    collect(s, spawnPower(s, "unit").id);
    step(s, 0.1);
    expect(bug.p).toBeCloseTo(1 + 0.1 - 0.01 / 0.45, 8);
  });

  test("review catches armored bugs once and contributes one catch each", () => {
    const s = quiet(createState(seeded(3)));
    collect(s, spawnPower(s, "review").id);
    const bug = spawn(s, "flaky", 0.99);
    bug.speed = 1;
    const events = step(s, 0.05).filter((e) => e.type === "catch");
    expect(events).toHaveLength(1);
    expect(s.caught).toBe(1);
    expect(tap(s, bug.id)).toBeNull();
  });

  test("a scripted run catches bugs then ends exactly once on every difficulty", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = createState(seeded(42), level);
      for (let i = 0; i < 600; i++) {
        step(s, 0.05);
        for (const b of [...s.bugs]) tap(s, b.id);
      }
      const events: StepEvent[] = [];
      for (let i = 0; i < 2400; i++) events.push(...step(s, 0.05));
      expect(s.score).toBeGreaterThan(0);
      expect(s.caught).toBeGreaterThan(0);
      expect(events.filter((e) => e.type === "gameover")).toHaveLength(1);
      expect(s.incidents).toBe(DIFFICULTY[level].incidents);
      expect(tap(s, s.bugs[0]?.id ?? -1)).toBeNull();
      expect(collect(s, spawnPower(s, "flag").id)).toBeNull();
    }
  });
});
