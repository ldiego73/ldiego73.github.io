import { describe, expect, test } from "bun:test";
import {
  APPS,
  type App,
  BURST,
  createGame,
  DIFFICULTY,
  type Difficulty,
  drain,
  type Ev,
  fit,
  GOAL,
  karpenter,
  MAX_FAILS,
  MAX_NODES,
  makePod,
  moveCursor,
  mulberry32,
  type Pod,
  place,
  QMAX,
  rollback,
  type State,
  seed,
  selectPod,
  step,
  usedCpu,
  usedMem,
  WARMUP,
} from "./state";

const app = (n: string) => APPS.find((a) => a.name === n) as App;
/** A quiet game: no arrivals, events or bursts unless a test enables them. */
const quiet = (d: Difficulty = "normal") => {
  const s = createGame(d, mulberry32(7));
  s.arriveIn = s.eventIn = s.burstIn = 1e9;
  s.t = WARMUP;
  return s;
};
const queue = (s: State, name: string, o: Partial<Pod> = {}) => {
  const p = makePod(s, app(name), { noisy: false, ...o });
  s.queue.push(p);
  return p;
};
const run = (s: State, secs: number): Ev[] => {
  const ev: Ev[] = [];
  for (let t = 0; t < secs && !s.over; t += 0.05) ev.push(...step(s, 0.05));
  return ev;
};
const idx = (s: State, kind: string) => s.nodes.findIndex((n) => n.kind === kind);

describe("placement rules", () => {
  test("a pod that fits both cpu and memory is scheduled and counted", () => {
    const s = quiet();
    const p = queue(s, "checkout");
    const ev = place(s, 0);
    const e = ev.find((x) => x.t === "place");
    expect(e).toBeTruthy();
    expect(s.nodes[0].pods).toContain(p);
    expect(s.deployed).toBe(1);
    expect(s.queue.length).toBe(0);
    expect(s.score).toBeGreaterThanOrEqual(100);
  });

  test("tight bin-packing pays more than a loose fit", () => {
    const a = quiet();
    queue(a, "checkout");
    place(a, 0);
    const b = quiet();
    b.nodes[0].pods.push(makePod(b, app("search"), { noisy: false, cpu: 6, mem: 2 }));
    queue(b, "checkout");
    const ev = place(b, 0);
    expect(ev.find((x) => x.t === "place" && x.snug)).toBeTruthy();
    expect(b.score).toBeGreaterThan(a.score + 40);
  });

  test("not enough cpu or memory: OutOfcpu / OutOfmemory failure", () => {
    const s = quiet();
    s.nodes[0].pods.push(makePod(s, app("etl-job"), { cpu: 7, mem: 1 }));
    queue(s, "checkout");
    expect(place(s, 0).find((x) => x.t === "crash" && x.why === "cpu")).toBeTruthy();
    expect(s.failures).toBe(1);
    s.nodes[1].pods.push(makePod(s, app("redis"), { noisy: false, cpu: 1, mem: 7 }));
    queue(s, "postgres");
    expect(place(s, 1).find((x) => x.t === "crash" && x.why === "mem")).toBeTruthy();
    expect(s.failures).toBe(2);
    expect(s.deployed).toBe(0);
  });

  test("GPU pods only fit the GPU node; elsewhere they CrashLoopBackOff", () => {
    const s = quiet();
    queue(s, "llm-infer");
    expect(place(s, 0).some((x) => x.t === "crash" && x.why === "gpu")).toBe(true);
    queue(s, "llm-infer");
    expect(place(s, idx(s, "gpu")).some((x) => x.t === "place")).toBe(true);
  });

  test("taint and affinity are refused without a failure", () => {
    const s = quiet();
    const p = queue(s, "auth");
    expect(place(s, idx(s, "gpu"))[0]).toMatchObject({ t: "block", why: "taint" });
    expect(s.queue).toContain(p);
    s.queue = [];
    queue(s, "payments");
    expect(place(s, idx(s, "spot"))[0]).toMatchObject({ t: "block", why: "affinity" });
    expect(s.failures).toBe(0);
  });

  test("GPU node has a finite number of GPUs", () => {
    const s = quiet();
    const g = idx(s, "gpu");
    for (let i = 0; i < 2; i++) {
      queue(s, "llm-infer", { cpu: 1, mem: 1 });
      place(s, g);
    }
    queue(s, "llm-infer", { cpu: 1, mem: 1 });
    expect(place(s, g)[0]).toMatchObject({ t: "crash", why: "gpu" });
  });

  test("selection and cursor are clamped", () => {
    const s = quiet();
    queue(s, "auth");
    queue(s, "frontend");
    selectPod(s, 3);
    expect(s.sel).toBe(1);
    moveCursor(s, -5);
    expect(s.cursor).toBe(0);
    moveCursor(s, 99);
    expect(s.cursor).toBe(s.nodes.length - 1);
    place(s, 0);
    expect(s.queue[0].app).toBe("auth");
    expect(s.sel).toBe(0);
  });
});

describe("queue and timers", () => {
  test("Pending timeout counts a failure", () => {
    const s = quiet();
    queue(s, "auth");
    const ev = run(s, DIFFICULTY.normal.timeout + 0.2);
    expect(ev.some((e) => e.t === "pending")).toBe(true);
    expect(s.failures).toBe(1);
  });

  test("only the active scheduling cycle ticks", () => {
    const s = quiet();
    for (let i = 0; i < 6; i++) queue(s, "auth");
    run(s, 1);
    expect(s.queue[5].wait).toBe(s.queue[5].max);
    expect(s.queue[0].wait).toBeLessThan(s.queue[0].max);
  });

  test("arrivals stop while the queue is full", () => {
    const s = createGame("normal", mulberry32(3));
    s.eventIn = s.burstIn = 1e9;
    for (let i = 0; i < QMAX; i++) queue(s, "auth", { wait: 1e9, max: 1e9 });
    run(s, 10);
    expect(s.queue.length).toBe(QMAX);
  });

  test("seeded start has running workloads and a waiting queue, none counted as deploys", () => {
    const s = createGame("normal", mulberry32(1));
    seed(s);
    expect(s.nodes.flatMap((n) => n.pods).length).toBeGreaterThan(3);
    expect(s.queue.length).toBe(2);
    expect(s.deployed).toBe(0);
  });
});

describe("cluster events", () => {
  test("HPA scale-out queues a burst of 3 replicas", () => {
    const s = quiet();
    s.tune = { ...s.tune, events: ["hpa"] };
    s.eventIn = 0.01;
    const ev = run(s, 0.1);
    expect(ev.find((e) => e.t === "hpa")).toMatchObject({ n: 3 });
    expect(s.queue.length).toBe(3);
    expect(new Set(s.queue.map((p) => p.app)).size).toBe(1);
  });

  test("node failure: NotReady, pods re-enter the queue with grace, node recovers", () => {
    const s = quiet();
    s.tune = { ...s.tune, events: ["fail"] };
    const p = makePod(s, app("auth"), { life: 1e9 });
    s.nodes[0].pods.push(p);
    s.nodes[1].pods.push(makePod(s, app("auth"), { life: 1e9 }));
    s.eventIn = 0.01;
    const ev = run(s, 0.1);
    const down = ev.find((e) => e.t === "nodeDown");
    expect(down).toBeTruthy();
    const n = s.nodes.find((x) => x.status === "NotReady");
    expect(n?.pods.length).toBe(0);
    expect(s.queue.every((q) => q.resched && q.max > DIFFICULTY.normal.timeout)).toBe(true);
    queue(s, "auth");
    expect(place(s, s.nodes.indexOf(n!)).some((e) => e.t === "block" && e.why === "notready")).toBe(true);
    s.queue = [];
    run(s, DIFFICULTY.normal.recover + 0.5);
    expect(n?.status).toBe("Ready");
  });

  test("rescheduled pods do not count as new deploys", () => {
    const s = quiet();
    queue(s, "auth", { resched: true });
    place(s, 0);
    expect(s.deployed).toBe(0);
  });

  test("spot interruption notice, then the node is reclaimed and its pods requeued", () => {
    const s = quiet();
    s.tune = { ...s.tune, events: ["spot"] };
    const sp = s.nodes[idx(s, "spot")];
    sp.pods.push(makePod(s, app("frontend"), { life: 1e9 }));
    s.eventIn = 0.01;
    expect(run(s, 0.1).some((e) => e.t === "notice")).toBe(true);
    expect(sp.noticeIn).toBeGreaterThan(0);
    const ev = run(s, DIFFICULTY.normal.notice + 0.2);
    expect(ev.some((e) => e.t === "reclaim")).toBe(true);
    expect(s.nodes).not.toContain(sp);
    expect(s.queue.some((p) => p.app === "frontend" && p.resched)).toBe(true);
  });

  test("rolling update: each new revision scheduled terminates one old pod", () => {
    const s = quiet();
    s.tune = { ...s.tune, events: ["rolling"] };
    for (let i = 0; i < 2; i++) s.nodes[i].pods.push(makePod(s, app("frontend"), { life: 1e9 }));
    s.eventIn = 0.01;
    const ev = run(s, 0.1);
    expect(ev.find((e) => e.t === "rolling")).toMatchObject({ app: "frontend", ver: 2, n: 2 });
    selectPod(s, 0);
    const out = place(s, 1);
    expect(out.some((e) => e.t === "terminate" && e.pod.ver === 1)).toBe(true);
    expect(
      s.nodes
        .flatMap((n) => n.pods)
        .filter((p) => p.app === "frontend")
        .map((p) => p.ver)
        .sort(),
    ).toEqual([1, 2]);
  });

  test("noisy neighbor burst OOMKills when the node has no headroom", () => {
    const s = quiet();
    const n = s.nodes[0];
    const noisy = makePod(s, app("redis"), { noisy: true, life: 1e9 });
    n.pods.push(noisy, makePod(s, app("postgres"), { life: 1e9 }), makePod(s, app("auth"), { life: 1e9 }));
    expect(usedMem(n) + BURST).toBeGreaterThan(n.mem);
    s.burstIn = 0.01;
    const ev = run(s, 0.1);
    expect(ev.find((e) => e.t === "oom")).toMatchObject({ pod: { id: noisy.id } });
    expect(s.failures).toBe(1);
    expect(s.queue).toContain(noisy);
  });

  test("fit warns about burst headroom next to a noisy neighbor", () => {
    const s = quiet();
    s.nodes[0].pods.push(makePod(s, app("redis"), { noisy: true }));
    const p = makePod(s, app("postgres"), { noisy: false });
    expect(fit(s.nodes[0], p)).toBe("noisy");
    expect(fit(s.nodes[1], p)).toBe("ok");
  });
});

describe("actions", () => {
  test("Karpenter provisions a node matching the selected pod, after booting", () => {
    const s = quiet();
    queue(s, "llm-infer");
    const n0 = s.nodes.length;
    expect(karpenter(s)[0]).toMatchObject({ t: "karpenter", kind: "gpu" });
    expect(s.nodes.length).toBe(n0 + 1);
    expect(s.nodes.at(-1)?.status).toBe("NotReady");
    run(s, 2);
    expect(s.nodes.at(-1)?.status).toBe("Ready");
    s.queue = [];
    queue(s, "auth");
    s.karpenter = 5;
    expect(karpenter(s)[0]).toMatchObject({ kind: "spot" });
    while (s.nodes.length < MAX_NODES) karpenter(s);
    expect(karpenter(s)).toEqual([]);
  });

  test("Karpenter charges run out", () => {
    const s = quiet();
    s.karpenter = 0;
    expect(karpenter(s)).toEqual([]);
  });

  test("cordon and drain requeues pods, then the node is consolidated away", () => {
    const s = quiet();
    s.nodes[0].pods.push(makePod(s, app("auth"), { life: 1e9 }));
    const n = s.nodes[0];
    const ev = drain(s, 0);
    expect(ev[0]).toMatchObject({ t: "drain" });
    expect(n.status).toBe("Cordoned");
    expect(s.queue.length).toBe(1);
    queue(s, "auth");
    selectPod(s, 1);
    expect(place(s, 0)[0]).toMatchObject({ t: "block", why: "cordoned" });
    s.queue = [];
    run(s, 2);
    expect(s.nodes).not.toContain(n);
    expect(usedCpu(n)).toBe(0);
  });

  test("rollback restores a failure and drops the queued rollout", () => {
    const s = quiet();
    s.failures = 2;
    queue(s, "frontend", { ver: 2, rollout: true });
    queue(s, "auth");
    expect(rollback(s)[0]).toMatchObject({ restored: true });
    expect(s.failures).toBe(1);
    expect(s.queue.map((p) => p.app)).toEqual(["auth"]);
    s.rollback = 0;
    expect(rollback(s)).toEqual([]);
  });

  test("FinOps: more nodes cost more and lower utilization", () => {
    const a = quiet();
    const b = quiet();
    b.karpenter = 3;
    queue(b, "auth");
    karpenter(b);
    karpenter(b);
    run(a, 10);
    run(b, 10);
    expect(b.spend).toBeGreaterThan(a.spend);
  });
});

describe("difficulty", () => {
  test("each level changes timers, cadence, node size and rules", () => {
    const { easy, normal, hard } = DIFFICULTY;
    expect(easy.timeout).toBeGreaterThan(normal.timeout);
    expect(normal.timeout).toBeGreaterThan(hard.timeout);
    expect(easy.arrive[1]).toBeGreaterThan(normal.arrive[1]);
    expect(normal.arrive[1]).toBeGreaterThan(hard.arrive[1]);
    expect(easy.eventEvery).toBeGreaterThan(normal.eventEvery);
    expect(normal.eventEvery).toBeGreaterThan(hard.eventEvery);
    expect(hard.cpu).toBeLessThan(normal.cpu);
    expect(hard.mem).toBeLessThan(normal.mem);
    expect(hard.odP + hard.gpuP).toBeGreaterThan(normal.odP + normal.gpuP);
    expect(normal.odP + normal.gpuP).toBeGreaterThan(easy.odP + easy.gpuP);
    expect(hard.noisyP).toBeGreaterThan(easy.noisyP);
    expect(easy.karpenter).toBeGreaterThan(hard.karpenter);
    const h = createGame("hard", mulberry32(1));
    expect(h.nodes[0].cpu).toBe(hard.cpu);
    expect(h.queue.length).toBe(0);
  });
});

/** Greedy scheduler bot: best fit, Karpenter before gambling on burst headroom, drain spot on notice. */
function bot(s: State): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < s.nodes.length; i++)
    if (s.nodes[i].noticeIn > 0 && s.nodes[i].drainIn <= 0) out.push(...drain(s, i));
  if (s.failures >= 2) out.push(...rollback(s));
  for (const risky of [false, true]) {
    if (risky && s.karpenter > 0 && s.nodes.length < MAX_NODES && s.queue[0]?.wait < 4) {
      selectPod(s, 0);
      return [...out, ...karpenter(s)];
    }
    for (let q = 0; q < s.queue.length; q++) {
      const p = s.queue[q];
      if (risky && p.wait > 2.5) continue;
      let best = -1;
      let slack = 1e9;
      for (let i = 0; i < s.nodes.length; i++) {
        const f = fit(s.nodes[i], p);
        if (f !== "ok" && !(risky && f === "noisy")) continue;
        const n = s.nodes[i];
        const sl = n.cpu - usedCpu(n) - p.cpu + n.mem - usedMem(n) - p.mem;
        if (sl < slack) {
          slack = sl;
          best = i;
        }
      }
      if (best >= 0) {
        selectPod(s, q);
        return [...out, ...place(s, best)];
      }
    }
  }
  return out;
}

function play(d: Difficulty, seedN: number, act: boolean) {
  const s = createGame(d, mulberry32(seedN));
  seed(s);
  const ev: Ev[] = [];
  for (let t = 0; t < 900 && !s.over; t += 0.05) {
    if (act && Math.round(t * 20) % 8 === 0) ev.push(...bot(s));
    ev.push(...step(s, 0.05));
  }
  return { s, ev };
}

describe("playability", () => {
  for (const d of ["easy", "normal", "hard"] as Difficulty[]) {
    test(`a greedy scheduler survives release day on ${d}`, () => {
      let wins = 0;
      for (const sd of [1, 2, 3, 4, 5]) {
        const { s, ev } = play(d, sd, true);
        if (s.over === "win") {
          wins++;
          expect(s.deployed).toBe(GOAL);
          expect(ev.filter((e) => e.t === "win").length).toBe(1);
        }
      }
      expect(wins).toBeGreaterThanOrEqual(d === "hard" ? 3 : 4);
    });
    test(`an idle scheduler loses on ${d}`, () => {
      const { s, ev } = play(d, 9, false);
      expect(s.over).toBe("lose");
      expect(s.failures).toBe(MAX_FAILS);
      expect(ev.filter((e) => e.t === "lose").length).toBe(1);
    });
  }

  test("a long run keeps freeing capacity (no gridlock)", () => {
    const { ev } = play("normal", 2, true);
    expect(ev.filter((e) => e.t === "complete" || e.t === "terminate").length).toBeGreaterThan(10);
    expect(ev.some((e) => e.t === "hpa")).toBe(true);
    expect(ev.some((e) => e.t === "bill")).toBe(true);
  });
});
