import { describe, expect, test } from "bun:test";
import {
  type Action,
  act,
  apis,
  clockOf,
  computeFlow,
  createState,
  DIFFICULTY,
  type Difficulty,
  finalScore,
  fmtUptime,
  get,
  mulberry32,
  postmortem,
  primary,
  REGIONS,
  remedy,
  replica,
  type State,
  step,
  uptime,
} from "./state";

const DT = 1 / 30;
const LEVELS: Difficulty[] = ["easy", "normal", "hard"];

function run(seed: number, policy: (s: State) => void, d: Difficulty = "normal"): State {
  const s = createState(mulberry32(seed), d);
  while (!s.over) {
    policy(s);
    step(s, DT);
  }
  return s;
}

/** A calm sim for unit tests: no random incidents. */
function quiet(d: Difficulty = "normal") {
  const s = createState(mulberry32(1), d);
  s.nextIncident = 999;
  return s;
}

/** What a player should press for component c right now (null: wait). */
function choice(s: State, c: State["comps"][number]): Action | null {
  const fix = remedy(c);
  if (!fix) return null;
  if (fix === "restart" && c.kind === "api" && c.down && s.cd.restart > 0 && !c.breaker) return "breaker";
  if (c.fault === "leak" && !c.down) {
    const othersUp = apis(s).every((o) => o === c || (!o.down && o.restarting <= 0));
    if (!othersUp || s.spike) return null;
  }
  if (fix === "scale" && c.kind === "lb" && c.scale > 0) return null;
  return fix;
}

const URGENCY: Partial<Record<Action, number>> = {
  failover: 5,
  renew: 4,
  rollback: 4,
  breaker: 4,
  restart: 3,
  scale: 2,
};

/**
 * Reads the fault labels on screen, needs `reaction` s to notice + select,
 * performs at most one action every `gap` s and handles the most urgent fault first.
 */
function player(reaction: number, gap: number) {
  const seen = new Map<string, number>();
  let next = 0;
  return (s: State) => {
    const issues: Array<[number, string, Action]> = [];
    for (const c of s.comps) {
      const pick = choice(s, c);
      if (!pick) continue;
      const key = `${c.id}:${c.fault}:${c.down}`;
      if (!seen.has(key)) seen.set(key, s.t);
      if (s.t - (seen.get(key) as number) >= reaction && s.cd[pick] === 0)
        issues.push([(URGENCY[pick] ?? 1) - (c.fault === "leak" ? 2 : 0), c.id, pick]);
    }
    if (s.t < next || !issues.length) return;
    issues.sort((a, b) => b[0] - a[0]);
    act(s, issues[0][1], issues[0][2]);
    next = s.t + gap;
  };
}
/** A competent on-call engineer: 0.3 s to react, fast hands. */
const good = () => player(0.3, 0.15);
/** Human pace: 1.5 s to notice, one action every 0.8 s. */
const human = (reaction = 1.5) => player(reaction, 0.8);

describe("difficulty table", () => {
  test("easy is gentler, hard is shorter, denser and faster", () => {
    const { easy, normal, hard } = DIFFICULTY;
    expect(easy.target).toBe(0.999);
    expect(normal.target).toBe(0.9999);
    expect(hard.target).toBe(0.9999);
    expect(hard.duration).toBe(90);
    expect(easy.budget).toBeGreaterThan(normal.budget);
    expect(easy.maxActive).toBeLessThan(normal.maxActive);
    expect(hard.maxActive).toBeGreaterThan(normal.maxActive);
    expect(hard.decay).toBeGreaterThan(normal.decay);
    expect(easy.gap).toBeGreaterThan(hard.gap);
  });

  test("createState applies the level", () => {
    expect(createState(mulberry32(1), "easy").budget).toBe(150);
    const h = run(3, () => {}, "hard");
    expect(h.t).toBe(90);
  });

  test("hard brings more simultaneous failures than easy", () => {
    const peak = (d: Difficulty) => {
      let max = 0;
      for (let seed = 1; seed <= 10; seed++)
        run(
          seed,
          (s) => {
            max = Math.max(max, s.comps.filter((c) => c.fault).length);
          },
          d,
        );
      return max;
    };
    expect(peak("hard")).toBeGreaterThan(peak("easy"));
  });
});

describe("failure model", () => {
  test("idle system is fully healthy at start and serves every request", () => {
    const s = createState(mulberry32(1));
    step(s, 0.5);
    expect(s.flow.served).toBeCloseTo(s.flow.demand, 5);
    expect(uptime(s)).toBe(1);
  });

  test("memory leak degrades slowly and ends in a crash", () => {
    const s = quiet();
    const a = get(s, "api1");
    a.fault = "leak";
    step(s, 5);
    expect(a.health).toBeCloseTo(100 - 5 * 1.1 * 5, 0);
    for (let i = 0; i < 40; i++) step(s, 1);
    expect(a.down).toBe(true);
    expect(a.fault as string | null).toBe("crash");
  });

  test("a down API cascades into its neighbours; the breaker stops it; hard cascades faster", () => {
    const hit = (d: Difficulty) => {
      const s = quiet(d);
      const a = get(s, "api0");
      a.fault = "crash";
      a.down = true;
      a.health = 0;
      step(s, 2);
      return s;
    };
    const s = hit("normal");
    expect(get(s, "api1").health).toBeCloseTo(100 - 14 * 1.1 * 2, 0);
    expect(get(hit("hard"), "api1").health).toBeLessThan(get(s, "api1").health);
    expect(act(s, "api0", "breaker")).toBe("ok");
    const h = get(s, "api1").health;
    step(s, 2);
    expect(get(s, "api1").health).toBeGreaterThan(h);
  });

  test("DB primary failure takes everything not cached down", () => {
    const s = quiet();
    primary(s).down = true;
    const f = computeFlow(s);
    expect(f.served / f.demand).toBeCloseTo(0.55, 2);
  });

  test("traffic spike overloads an unscaled load balancer", () => {
    const s = quiet();
    s.t = 60;
    s.spike = { start: 50, amp: 600 };
    const f = computeFlow(s);
    expect(f.lb).toBeLessThan(f.demand);
    get(s, "lb").scale = 1;
    expect(computeFlow(s).lb).toBeCloseTo(f.demand, 5);
  });

  test("region outage drains the load balancer until it is gone", () => {
    const s = quiet();
    const lb = get(s, "lb");
    lb.fault = "region";
    step(s, 2);
    expect(s.flow.served).toBeCloseTo(s.flow.demand, 3);
    for (let i = 0; i < 10; i++) step(s, 1);
    expect(lb.down).toBe(true);
    expect(lb.fault as string | null).toBe("region");
    expect(s.flow.served).toBe(0);
    s.cd.restart = 0;
    expect(act(s, "lb", "restart")).toBe("noop");
  });

  test("an expired certificate rejects every request at the edge", () => {
    const s = quiet();
    const e = get(s, "edge");
    e.fault = "cert";
    step(s, 5);
    expect(e.down).toBe(false);
    expect(s.flow.served).toBeCloseTo(s.flow.demand, 3);
    step(s, 6);
    expect(e.down).toBe(true);
    expect(s.flow.served).toBe(0);
  });

  test("a bad deploy rolls out pod by pod and turns into 500s", () => {
    const s = quiet();
    get(s, "api0").fault = "deploy";
    s.deployNext = 3;
    step(s, 1);
    expect(s.flow.err).toBe(0);
    for (let i = 0; i < 8; i++) step(s, 1);
    expect(apis(s).every((a) => a.fault === "deploy")).toBe(true);
    expect(apis(s).some((a) => a.down)).toBe(false);
    expect(s.flow.err).toBeGreaterThan(0.5);
    expect(s.flow.served / s.flow.demand).toBeLessThan(0.5);
  });

  test("a client retry storm piles extra load onto the LB", () => {
    const s = quiet();
    get(s, "edge").fault = "retry";
    step(s, 2);
    expect(s.flow.retry).toBe(0);
    for (let i = 0; i < 6; i++) step(s, 1);
    expect(s.flow.retry).toBeGreaterThan(1000);
    expect(s.flow.served / s.flow.demand).toBeLessThan(0.7);
  });
});

describe("actions", () => {
  test("restart fixes a crash after a brief downtime", () => {
    const s = quiet();
    const a = get(s, "api2");
    a.fault = "crash";
    a.down = true;
    expect(act(s, "api2", "restart")).toBe("ok");
    expect(act(s, "api2", "restart")).toBe("cooldown");
    step(s, 1);
    expect(a.restarting).toBeGreaterThan(0);
    step(s, 1);
    expect(a.down).toBe(false);
    expect(a.fault as string | null).toBe(null);
    expect(s.resolved).toBe(1);
  });

  test("failover promotes the replica and resolves the DB failure", () => {
    const s = quiet();
    const p = primary(s);
    p.fault = "dbfail";
    const r = replica(s);
    expect(act(s, "api0", "failover")).toBe("noop");
    s.cd.failover = 0;
    expect(act(s, p.id, "failover")).toBe("ok");
    expect(primary(s)).toBe(r);
    expect(p.fault as string | null).toBe(null);
  });

  test("failover on the LB moves traffic to the secondary region", () => {
    const s = quiet();
    const lb = get(s, "lb");
    lb.fault = "region";
    for (let i = 0; i < 12; i++) step(s, 1);
    expect(act(s, "lb", "failover")).toBe("ok");
    expect(REGIONS[s.region]).toBe("us-west-2");
    step(s, 0.1);
    expect(s.flow.served).toBeCloseTo(s.flow.demand, 3);
  });

  test("renew fixes the certificate from anywhere; rollback fixes the whole fleet", () => {
    const s = quiet();
    get(s, "edge").fault = "cert";
    expect(act(s, "db1", "renew")).toBe("ok");
    expect(get(s, "edge").fault).toBe(null);
    for (const a of apis(s)) {
      a.fault = "deploy";
      a.health = 10;
    }
    expect(act(s, "cache", "restart")).toBe("noop");
    expect(act(s, "lb", "rollback")).toBe("ok");
    expect(apis(s).every((a) => !a.fault && a.health >= 50)).toBe(true);
    step(s, 0.1);
    expect(s.flow.err).toBe(0);
    expect(act(s, "lb", "renew")).toBe("cooldown");
  });

  test("restart does not cure a bad build", () => {
    const s = quiet();
    const a = get(s, "api1");
    a.fault = "deploy";
    expect(act(s, "api1", "restart")).toBe("noop");
    step(s, 2);
    expect(a.fault).toBe("deploy");
  });

  test("breaker on the edge enables client backoff and ends the retry storm", () => {
    const s = quiet();
    const e = get(s, "edge");
    e.fault = "retry";
    step(s, 6);
    expect(act(s, "edge", "breaker")).toBe("ok");
    step(s, 0.1);
    expect(s.flow.retry).toBe(0);
  });

  test("scale out costs budget and fixes a noisy neighbour; restart does not", () => {
    const s = quiet();
    const c = get(s, "cache");
    c.fault = "noisy";
    expect(act(s, "cache", "restart")).toBe("noop");
    expect(c.fault).toBe("noisy");
    expect(act(s, "cache", "scale")).toBe("ok");
    expect(c.fault as string | null).toBe(null);
    expect(s.budget).toBe(75);
    s.budget = 10;
    s.cd.scale = 0;
    expect(act(s, "lb", "scale")).toBe("budget");
  });

  test("restarting the load balancer is a self-inflicted outage", () => {
    const s = quiet();
    expect(act(s, "lb", "restart")).toBe("noop");
    step(s, 0.5);
    expect(s.flow.served).toBe(0);
  });
});

describe("uptime math and postmortem", () => {
  test("the final step accounts only for the time left and freezes the result", () => {
    const s = quiet("hard");
    s.t = 89.95;
    const demanded = computeFlow({ ...s, t: 90 }).demand * 0.05;
    step(s, 1);
    expect(s.t).toBe(90);
    expect(s.demanded).toBeCloseTo(demanded, 7);
    expect(s.won).toBe(true);
    const score = finalScore(s);
    step(s, 10);
    expect(finalScore(s)).toBe(score);
    expect(act(s, "lb", "restart")).toBe("noop");
  });

  test("the postmortem includes prevented incidents and closes active incidents at day end", () => {
    const s = quiet();
    s.incidents.push(
      { fault: "cert", id: "edge", start: 2, end: 3, lost: 0 },
      { fault: "region", id: "lb", start: 115, end: null, lost: 12 },
    );
    s.t = 119.9;
    step(s, 0.2);
    const top = postmortem(s);
    expect(top).toHaveLength(2);
    expect(top[0].end).toBe(120);
    expect(top[1].lost).toBe(0);
  });

  test("uptime is served / demanded and formatting floors", () => {
    const s = createState();
    s.demanded = 100000;
    s.served = 99995;
    expect(uptime(s)).toBeCloseTo(0.99995, 8);
    expect(fmtUptime(uptime(s), 2)).toBe("99.99");
    expect(fmtUptime(uptime(s), 3)).toBe("99.995");
    expect(fmtUptime(1, 3)).toBe("100.000");
  });

  test("score is served requests plus the uptime tier bonus", () => {
    const s = createState();
    s.demanded = 1000;
    s.served = 1000;
    expect(finalScore(s)).toBe(51000);
    s.served = 995;
    expect(finalScore(s)).toBe(5995);
  });

  test("the day maps onto a 24 h clock", () => {
    const s = createState(mulberry32(1), "hard");
    expect(clockOf(s)).toBe("00:00");
    s.t = 45;
    expect(clockOf(s)).toBe("12:00");
    s.t = 90;
    expect(clockOf(s)).toBe("00:00");
  });

  test("postmortem ranks incidents by requests lost", () => {
    const s = run(4, () => {});
    const top = postmortem(s);
    expect(top.length).toBe(3);
    expect(top[0].lost).toBeGreaterThanOrEqual(top[1].lost);
    expect(top[1].lost).toBeGreaterThanOrEqual(top[2].lost);
    const lost = s.incidents.reduce((a, i) => a + i.lost, 0);
    expect(lost).toBeLessThanOrEqual(s.demanded - s.served + 1);
    expect(lost).toBeGreaterThan(0);
  });
});

describe("playability per difficulty", () => {
  for (const d of LEVELS) {
    test(`${d}: a good policy wins every seed and resolves incidents`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const s = run(seed, good(), d);
        if (!s.won)
          console.log(
            d,
            seed,
            uptime(s),
            s.incidents.filter((i) => i.lost > 0.5),
          );
        expect(s.t).toBe(DIFFICULTY[d].duration);
        expect(s.won).toBe(true);
        expect(s.resolved).toBeGreaterThan(3);
      }
    });

    test(`${d}: an idle operator loses the day`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const s = run(seed, () => {}, d);
        expect(s.over).toBe(true);
        expect(s.won).toBe(false);
        expect(uptime(s)).toBeLessThan(0.99);
      }
    });
  }

  test("human pace (2 s to react): easy and normal are winnable, hard is a stretch", () => {
    const rate = (d: Difficulty, reaction: number, n = 40) => {
      let wins = 0;
      for (let seed = 1; seed <= n; seed++) if (run(seed, human(reaction), d).won) wins++;
      return wins / n;
    };
    expect(rate("easy", 2)).toBeGreaterThanOrEqual(0.9);
    const normal = rate("normal", 2);
    const hard = rate("hard", 2);
    expect(normal).toBeGreaterThanOrEqual(0.8);
    expect(hard).toBeLessThan(normal - 0.2);
    expect(hard).toBeGreaterThan(0.1);
    expect(rate("hard", 1.5)).toBeGreaterThanOrEqual(0.8);
  });

  test("easy forgives a slow responder (4 s); normal does not", () => {
    let easy = 0;
    for (let seed = 1; seed <= 20; seed++) if (run(seed, human(4), "easy").won) easy++;
    expect(easy).toBeGreaterThanOrEqual(16);
  });

  test("a slow responder (4 s) mostly misses four nines on normal", () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) if (run(seed, human(4)).won) wins++;
    expect(wins).toBeLessThan(15);
  });
});
