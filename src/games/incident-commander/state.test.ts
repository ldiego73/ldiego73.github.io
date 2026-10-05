import { describe, expect, test } from "bun:test";
import { SCENARIO_INDEX, SCENARIOS } from "./scenarios";
import {
  answer,
  buildDeck,
  burnFor,
  createRun,
  current,
  DIFFICULTY,
  multiplier,
  type RunState,
  shuffle,
  skipReveal,
  slotOf,
  statusText,
  tick,
  timeLimit,
} from "./state";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pickCorrect = (s: RunState) => slotOf(s, current(s).correct);
const pickWrong = (s: RunState) => {
  const q = current(s);
  return [0, 1, 2, 3].find((slot) => s.order[slot] !== q.correct && s.order[slot] !== q.partial)!;
};
const finishReveal = (s: RunState, rng: () => number) => tick(s, s.cfg.reveal + 0.01, rng);
/** Force a specific question on screen (test helper). */
const force = (s: RunState, id: string) => {
  s.cur = SCENARIO_INDEX[id];
  s.step = SCENARIOS[s.cur].step2 ? 2 : 1;
};

describe("scenarios", () => {
  test("at least 80 well-formed bilingual first-step scenarios", () => {
    expect(SCENARIOS.filter((s) => !s.step2).length).toBeGreaterThanOrEqual(80);
    const ids = new Set<string>();
    for (const s of SCENARIOS) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect([1, 2, 3]).toContain(s.sev);
      expect(s.options).toHaveLength(4);
      expect(s.correct).toBeGreaterThanOrEqual(0);
      expect(s.correct).toBeLessThan(4);
      if (s.partial !== undefined) {
        expect(s.partial).not.toBe(s.correct);
        expect(s.partial).toBeLessThan(4);
      }
      expect(s.metric.length).toBeLessThanOrEqual(20);
      for (const t of [s.alert, s.explain, ...s.options]) {
        expect(t.es.length).toBeGreaterThan(0);
        expect(t.en.length).toBeGreaterThan(0);
      }
      for (const opt of s.options) expect(Math.max(opt.es.length, opt.en.length)).toBeLessThanOrEqual(36);
      expect(new Set(s.options.map((o) => o.en)).size).toBe(4);
    }
  });
  test("covers every severity and every diorama component", () => {
    const sevs = new Set(SCENARIOS.map((s) => s.sev));
    expect([...sevs].sort()).toEqual([1, 2, 3]);
    const comps = new Set(SCENARIOS.map((s) => s.comp));
    expect(comps.size).toBe(12);
  });
  test("multi-step links resolve to follow-ups; every follow-up has exactly one parent", () => {
    const parents = SCENARIOS.filter((s) => s.next);
    expect(parents.length).toBeGreaterThanOrEqual(4);
    const reached = new Map<string, number>();
    for (const p of parents) {
      expect(p.step2).toBeUndefined();
      for (const id of [p.next!.ok, p.next!.miss]) {
        expect(SCENARIO_INDEX[id]).toBeDefined();
        const f = SCENARIOS[SCENARIO_INDEX[id]];
        expect(f.step2).toBe(true);
        expect(f.next).toBeUndefined();
        reached.set(id, (reached.get(id) ?? 0) + 1);
      }
    }
    for (const f of SCENARIOS.filter((s) => s.step2)) expect(reached.get(f.id)).toBe(1);
  });
});

describe("difficulty table", () => {
  test("hard is faster, burns more, lasts longer than normal; easy the opposite", () => {
    const { easy, normal, hard } = DIFFICULTY;
    expect(easy.timeStart).toBeGreaterThan(normal.timeStart);
    expect(normal.timeStart).toBeGreaterThan(hard.timeStart);
    expect(easy.timeFloor).toBeGreaterThan(normal.timeFloor);
    expect(normal.timeFloor).toBeGreaterThan(hard.timeFloor);
    expect(easy.burnWrong).toBeLessThan(normal.burnWrong);
    expect(normal.burnWrong).toBeLessThan(hard.burnWrong);
    expect(easy.winAt).toBeLessThan(normal.winAt);
    expect(normal.winAt).toBe(15);
    expect(hard.winAt).toBe(20);
  });
  test("timer: normal 8s→4.5s, hard 5s→3.5s, easy 11s→7s", () => {
    expect(timeLimit(DIFFICULTY.normal, 0)).toBe(8);
    expect(timeLimit(DIFFICULTY.normal, 100)).toBe(4.5);
    expect(timeLimit(DIFFICULTY.hard, 0)).toBe(5);
    expect(timeLimit(DIFFICULTY.hard, 100)).toBe(3.5);
    expect(timeLimit(DIFFICULTY.easy, 0)).toBe(11);
    expect(timeLimit(DIFFICULTY.easy, 100)).toBe(7);
  });
  test("severity scales the burn", () => {
    expect(burnFor(DIFFICULTY.normal, 2, false)).toBe(25);
    expect(burnFor(DIFFICULTY.normal, 1, false)).toBe(35);
    expect(burnFor(DIFFICULTY.normal, 3, false)).toBe(20);
    expect(burnFor(DIFFICULTY.normal, 2, true)).toBe(10);
    expect(burnFor(DIFFICULTY.hard, 1, false)).toBe(42);
    expect(burnFor(DIFFICULTY.easy, 3, false)).toBe(14);
  });
  test("hard deals more SEV1s early than normal, easy fewer", () => {
    const sev1 = (d: "easy" | "normal" | "hard") => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const deck = buildDeck(SCENARIOS, DIFFICULTY[d], seeded(seed));
        n += deck.slice(0, 15).filter((i) => SCENARIOS[i].sev === 1).length;
      }
      return n;
    };
    const [e, n, h] = [sev1("easy"), sev1("normal"), sev1("hard")];
    expect(h).toBeGreaterThan(n * 1.3);
    expect(e).toBeLessThan(n);
  });
});

describe("deck", () => {
  test("injected RNG makes the run deterministic; deck holds every first step, no follow-ups", () => {
    const a = createRun(SCENARIOS, "normal", seeded(7));
    const b = createRun(SCENARIOS, "normal", seeded(7));
    const c = createRun(SCENARIOS, "normal", seeded(8));
    expect(a.deck).toEqual(b.deck);
    expect(a.order).toEqual(b.order);
    expect(a.deck).not.toEqual(c.deck);
    const firsts = SCENARIOS.map((s, i) => (s.step2 ? -1 : i)).filter((i) => i >= 0);
    expect([...a.deck].sort((x, y) => x - y)).toEqual(firsts);
  });
  test("shuffle is a permutation and does not mutate", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seeded(3));
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(src);
  });
  test("no repeats within a run at any difficulty, mixing right and wrong answers", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      for (let seed = 1; seed < 40; seed++) {
        const rng = seeded(seed);
        const s = createRun(SCENARIOS, d, rng);
        s.budget = 1e9; // survive every wrong answer
        const seen: string[] = [];
        let i = 0;
        while (s.phase !== "won" && s.phase !== "over") {
          seen.push(current(s).id);
          answer(s, i++ % 3 === 2 ? pickWrong(s) : pickCorrect(s));
          finishReveal(s, rng);
        }
        expect(seen).toHaveLength(DIFFICULTY[d].winAt);
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });
  test("option shuffle remaps correct through the display order", () => {
    const rng = seeded(11);
    const s = createRun(SCENARIOS, "normal", rng);
    for (let i = 0; i < 10; i++) {
      const slot = pickCorrect(s);
      expect(s.order[slot]).toBe(current(s).correct);
      expect(answer(s, slot)!.outcome).toBe("correct");
      finishReveal(s, rng);
    }
  });
});

describe("multi-step incidents", () => {
  test("a correct first step leads to the ok follow-up", () => {
    const rng = seeded(21);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "friday-leak");
    answer(s, pickCorrect(s));
    expect(finishReveal(s, rng)).toBe("next");
    expect(current(s).id).toBe("leak-heap");
    expect(s.step).toBe(2);
  });
  test("a wrong or partial first step leads to the miss follow-up", () => {
    for (const how of ["wrong", "partial", "timeout"] as const) {
      const rng = seeded(22);
      const s = createRun(SCENARIOS, "normal", rng);
      force(s, "friday-leak");
      if (how === "timeout") tick(s, 99, rng);
      else answer(s, how === "wrong" ? pickWrong(s) : slotOf(s, current(s).partial!));
      finishReveal(s, rng);
      expect(current(s).id).toBe("leak-limits");
    }
  });
  test("after a follow-up the run returns to the deck", () => {
    const rng = seeded(23);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "bridge-47");
    answer(s, pickCorrect(s));
    finishReveal(s, rng);
    expect(current(s).id).toBe("bridge-vp");
    answer(s, pickCorrect(s));
    finishReveal(s, rng);
    expect(s.step).toBe(1);
    expect(current(s).step2).toBeUndefined();
  });
  test("a two-step incident is never opened as the last question", () => {
    for (let seed = 1; seed < 60; seed++) {
      const rng = seeded(seed);
      const s = createRun(SCENARIOS, "hard", rng);
      let last = "";
      while (s.phase !== "won" && s.phase !== "over") {
        last = current(s).id;
        answer(s, pickCorrect(s));
        finishReveal(s, rng);
      }
      expect(SCENARIOS[SCENARIO_INDEX[last]].next).toBeUndefined();
    }
  });
});

describe("scoring and budget", () => {
  test("correct answer: base + time bonus, times streak, severity and difficulty", () => {
    const rng = seeded(1);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "noisy-neighbor"); // SEV3, factor 1
    const r1 = answer(s, pickCorrect(s))!;
    expect(r1.points).toBe(150);
    finishReveal(s, rng);
    force(s, "kafka-lag"); // SEV2, factor 1.2
    tick(s, s.limit / 2, rng);
    const r2 = answer(s, pickCorrect(s))!;
    expect(r2.points).toBe(Math.round(125 * 2 * 1.2));
    expect(s.resolved).toBe(2);
    expect(s.budget).toBe(100);
    expect(statusText(s, "es")).toBe("Error budget 100% · Racha x2");
    const h = createRun(SCENARIOS, "hard", rng);
    force(h, "noisy-neighbor");
    expect(answer(h, pickCorrect(h))!.points).toBe(225);
  });
  test("multiplier caps at x5 and floors at x1", () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(3)).toBe(3);
    expect(multiplier(12)).toBe(5);
  });
  test("partial: half points, small burn, resets streak, not resolved", () => {
    const rng = seeded(2);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "cdn-bypass"); // SEV2 with partial
    const r = answer(s, slotOf(s, current(s).partial!))!;
    expect(r.outcome).toBe("partial");
    expect(r.points).toBe(90); // 150/2 * 1.2
    expect(s.budget).toBe(90);
    expect(s.streak).toBe(0);
    expect(s.resolved).toBe(0);
    expect(statusText(s, "en")).toBe("Error budget 90% · Streak x1");
  });
  test("wrong burns by severity and gives nothing", () => {
    const rng = seeded(4);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "dns"); // SEV1
    const r = answer(s, pickWrong(s))!;
    expect(r.outcome).toBe("wrong");
    expect(r.points).toBe(0);
    expect(r.burn).toBe(35);
    expect(s.budget).toBe(65);
  });
  test("answers are ignored outside the ask phase; reveal skip has a guard", () => {
    const rng = seeded(5);
    const s = createRun(SCENARIOS, "normal", rng);
    answer(s, pickCorrect(s));
    expect(answer(s, 0)).toBeNull();
    expect(s.answered).toBe(1);
    expect(skipReveal(s)).toBe(false);
    tick(s, 0.6, rng);
    expect(skipReveal(s)).toBe(true);
    expect(tick(s, 0.01, rng)).toBe("next");
  });
  test("budget clamps at 0", () => {
    const rng = seeded(6);
    const s = createRun(SCENARIOS, "normal", rng);
    s.budget = 10;
    answer(s, pickWrong(s));
    expect(s.budget).toBe(0);
  });
});

describe("timeouts and run end", () => {
  test("timeout burns and enters reveal; time limit shrinks", () => {
    const rng = seeded(9);
    const s = createRun(SCENARIOS, "normal", rng);
    force(s, "kafka-lag");
    expect(s.limit).toBe(8);
    expect(tick(s, 7.9, rng)).toBeNull();
    expect(tick(s, 0.2, rng)).toBe("timeout");
    expect(s.last!.outcome).toBe("timeout");
    expect(s.budget).toBe(75);
    expect(s.phase).toBe("reveal");
    expect(tick(s, 1, rng)).toBeNull();
    expect(tick(s, 3, rng)).toBe("next");
    expect(s.limit).toBe(timeLimit(s.cfg, 1));
    expect(s.limit).toBeLessThan(8);
  });
  test("scripted run: wrong answers reach gameover at every difficulty", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      const rng = seeded(12);
      const s = createRun(SCENARIOS, d, rng);
      let ev = null;
      let n = 0;
      while (ev !== "gameover" && n < 50) {
        answer(s, pickWrong(s));
        ev = finishReveal(s, rng);
        n++;
      }
      expect(ev).toBe("gameover");
      expect(s.phase).toBe("over");
      expect(tick(s, 5, rng)).toBeNull();
      // Hard dies faster than easy.
      if (d === "hard") expect(n).toBeLessThanOrEqual(4);
      if (d === "easy") expect(n).toBeGreaterThanOrEqual(4);
    }
  });
  test("scripted run: idle player times out to gameover", () => {
    const rng = seeded(13);
    const s = createRun(SCENARIOS, "normal", rng);
    let ev = null;
    for (let i = 0; i < 4000 && ev !== "gameover"; i++) ev = tick(s, 0.05, rng);
    expect(ev).toBe("gameover");
    expect(s.answered).toBeGreaterThanOrEqual(3);
  });
  test("scripted run: survive winAt incidents to win, at every difficulty", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      const rng = seeded(14);
      const s = createRun(SCENARIOS, d, rng);
      const events = [];
      for (let i = 0; i < DIFFICULTY[d].winAt; i++) {
        answer(s, i === 5 ? pickWrong(s) : pickCorrect(s));
        events.push(finishReveal(s, rng));
      }
      expect(events.at(-1)).toBe("win");
      expect(events.filter((e) => e === "win")).toHaveLength(1);
      expect(s.resolved).toBe(DIFFICULTY[d].winAt - 1);
    }
  });
  test("dying on the last answer is a gameover, not a win", () => {
    const rng = seeded(15);
    const s = createRun(SCENARIOS, "normal", rng);
    for (let i = 0; i < 14; i++) {
      answer(s, pickCorrect(s));
      finishReveal(s, rng);
    }
    s.budget = 1;
    answer(s, pickWrong(s));
    expect(finishReveal(s, rng)).toBe("gameover");
    expect(s.phase).toBe("over");
  });
});
