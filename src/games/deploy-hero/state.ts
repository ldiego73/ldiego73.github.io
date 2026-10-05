/**
 * Deploy Hero rules: you are kube-scheduler on release day. Pure and deterministic
 * (injectable RNG). No DOM, no three.
 *
 * Units: 1 cpu unit = 500m, 1 mem unit = 2Gi. Nodes expose allocatable cpu/mem
 * (and GPUs on the GPU pool). Pods must fit BOTH resources.
 */

export type Difficulty = "easy" | "normal" | "hard";
export type NodeKind = "od" | "spot" | "gpu";
export type NodeStatus = "Ready" | "NotReady" | "Cordoned";
/** Why a placement is refused (blocked, no failure) or fails (failure). */
export type Fit = "ok" | "notready" | "cordoned" | "taint" | "affinity" | "cpu" | "mem" | "gpu" | "noisy";
export type Cls = "svc" | "data" | "job" | "gpu";

export interface App {
  name: string;
  cpu: number;
  mem: number;
  cls: Cls;
  /** nodeAffinity karpenter.sh/capacity-type=on-demand */
  od?: boolean;
  /** requests nvidia.com/gpu: 1 */
  gpu?: boolean;
}

export const APPS: App[] = [
  { name: "api-gateway", cpu: 2, mem: 1, cls: "svc" },
  { name: "auth", cpu: 1, mem: 1, cls: "svc" },
  { name: "checkout", cpu: 2, mem: 2, cls: "svc" },
  { name: "search", cpu: 2, mem: 3, cls: "svc" },
  { name: "frontend", cpu: 1, mem: 1, cls: "svc" },
  { name: "kafka-consumer", cpu: 1, mem: 2, cls: "data" },
  { name: "redis", cpu: 1, mem: 3, cls: "data" },
  { name: "payments", cpu: 2, mem: 2, cls: "svc", od: true },
  { name: "postgres", cpu: 2, mem: 4, cls: "data", od: true },
  { name: "etl-job", cpu: 3, mem: 2, cls: "job" },
  { name: "llm-infer", cpu: 2, mem: 3, cls: "gpu", gpu: true },
  { name: "ml-trainer", cpu: 3, mem: 4, cls: "gpu", gpu: true },
];
const COMMON = APPS.filter((a) => !a.od && !a.gpu);
const OD_APPS = APPS.filter((a) => a.od);
const GPU_APPS = APPS.filter((a) => a.gpu);
const SVC_APPS = APPS.filter((a) => a.cls === "svc" && !a.od);

export type EventKind = "hpa" | "rolling" | "fail" | "spot";

export interface Tuning {
  /** Seconds a pod may wait Pending before FailedScheduling counts as a failure. */
  timeout: number;
  /** Seconds between arrivals: [at start, at the end of release day]. */
  arrive: [number, number];
  /** Seconds between cluster events (HPA, rollout, node failure, spot notice). */
  eventEvery: number;
  events: EventKind[];
  /** Allocatable per node (units). */
  cpu: number;
  mem: number;
  start: NodeKind[];
  /** Probabilities for a new pod: needs GPU, needs on-demand, noisy (burstable) neighbor. */
  gpuP: number;
  odP: number;
  noisyP: number;
  karpenter: number;
  rollback: number;
  /** Seconds between noisy-neighbor memory bursts. */
  burstEvery: number;
  /** Seconds a NotReady node takes to come back. */
  recover: number;
  /** Spot interruption notice (AWS gives 2 minutes; compressed). */
  notice: number;
}

export const DIFFICULTY: Record<Difficulty, Tuning> = {
  easy: {
    timeout: 15,
    arrive: [3.6, 2.6],
    eventEvery: 20,
    events: ["hpa", "rolling", "spot", "hpa", "fail"],
    cpu: 8,
    mem: 8,
    start: ["od", "od", "spot", "gpu"],
    gpuP: 0.07,
    odP: 0.08,
    noisyP: 0.1,
    karpenter: 2,
    rollback: 2,
    burstEvery: 24,
    recover: 8,
    notice: 7,
  },
  normal: {
    timeout: 11,
    arrive: [3.0, 2.0],
    eventEvery: 14,
    events: ["hpa", "rolling", "fail", "spot"],
    cpu: 8,
    mem: 8,
    start: ["od", "od", "spot", "gpu"],
    gpuP: 0.1,
    odP: 0.14,
    noisyP: 0.18,
    karpenter: 1,
    rollback: 1,
    burstEvery: 16,
    recover: 10,
    notice: 5,
  },
  hard: {
    timeout: 8,
    arrive: [2.6, 1.8],
    eventEvery: 10,
    events: ["hpa", "rolling", "fail", "spot", "fail"],
    cpu: 6,
    mem: 7,
    start: ["od", "od", "od", "spot", "gpu"],
    gpuP: 0.13,
    odP: 0.24,
    noisyP: 0.22,
    karpenter: 1,
    rollback: 1,
    burstEvery: 12,
    recover: 13,
    notice: 4,
  },
};

export const GOAL = 40;
export const MAX_FAILS = 3;
export const MAX_NODES = 6;
/** Arrivals stop while the queue is this long (HPA bursts and requeues may exceed it). */
export const QMAX = 7;
/** Only the first pods in the queue are in the active scheduling cycle; their timers tick. */
export const QTICK = 4;
/** Memory a noisy neighbor bursts above its request (units). */
export const BURST = 2;
export const GPUS = 2;
export const WARMUP = 1.2;
/** $/h: m6i.xlarge on-demand, same as spot (~1/3), g5.2xlarge. */
export const PRICE: Record<NodeKind, number> = { od: 0.192, spot: 0.064, gpu: 1.212 };
/** One game second = one cluster minute for the bill. */
export const BILL_EVERY = 5;

export interface Pod {
  id: number;
  app: string;
  cls: Cls;
  cpu: number;
  mem: number;
  gpu: boolean;
  od: boolean;
  noisy: boolean;
  ver: number;
  /** New revision of a rolling update: when scheduled, one old pod terminates. */
  rollout: boolean;
  /** Re-entering the queue (node failure, drain, OOM): does not count as a new deploy. */
  resched: boolean;
  wait: number;
  max: number;
  /** Seconds left running on a node (jobs complete, HPA scales in). */
  life: number;
}

export interface Node {
  id: number;
  kind: NodeKind;
  status: NodeStatus;
  cpu: number;
  mem: number;
  gpus: number;
  pods: Pod[];
  /** NotReady: seconds until Ready again (also used while a new node boots). */
  downIn: number;
  /** Spot interruption notice countdown (0 = none). */
  noticeIn: number;
  /** Cordoned + draining: seconds until the node is removed (consolidation). */
  drainIn: number;
}

export interface State {
  rng: () => number;
  diff: Difficulty;
  tune: Tuning;
  nodes: Node[];
  queue: Pod[];
  sel: number;
  cursor: number;
  t: number;
  arriveIn: number;
  eventIn: number;
  eventIx: number;
  burstIn: number;
  billIn: number;
  deployed: number;
  failures: number;
  score: number;
  spend: number;
  utilSum: number;
  utilN: number;
  karpenter: number;
  rollback: number;
  vers: Record<string, number>;
  nextId: number;
  over: null | "win" | "lose";
}

export type Ev =
  | { t: "arrive"; pod: Pod }
  | { t: "place"; pod: Pod; node: number; gain: number; snug: boolean }
  | { t: "block"; pod: Pod; node: number; why: Fit }
  | { t: "crash"; pod: Pod; node: number; why: Fit }
  | { t: "pending"; pod: Pod }
  | { t: "oom"; pod: Pod; node: number }
  | { t: "requeue"; pods: Pod[]; node: number }
  | { t: "hpa"; app: string; n: number }
  | { t: "rolling"; app: string; ver: number; n: number }
  | { t: "terminate"; pod: Pod; node: number }
  | { t: "complete"; pod: Pod; node: number }
  | { t: "nodeDown"; node: number }
  | { t: "nodeUp"; node: number }
  | { t: "notice"; node: number }
  | { t: "reclaim"; node: number }
  | { t: "karpenter"; node: number; kind: NodeKind }
  | { t: "drain"; node: number }
  | { t: "removed"; node: number }
  | { t: "rollback"; restored: boolean }
  | { t: "bill"; gain: number; util: number }
  | { t: "win"; bonus: number }
  | { t: "lose" };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

function newNode(s: State, kind: NodeKind): Node {
  return {
    id: s.nextId++,
    kind,
    status: "Ready",
    cpu: s.tune.cpu,
    mem: s.tune.mem,
    gpus: kind === "gpu" ? GPUS : 0,
    pods: [],
    downIn: 0,
    noticeIn: 0,
    drainIn: 0,
  };
}

export function makePod(s: State, app: App, o: Partial<Pod> = {}): Pod {
  const noisy = !app.gpu && app.cls !== "job" && s.rng() < s.tune.noisyP;
  return {
    id: s.nextId++,
    app: app.name,
    cls: app.cls,
    cpu: app.cpu,
    mem: app.mem,
    gpu: !!app.gpu,
    od: !!app.od,
    noisy,
    ver: s.vers[app.name] ?? 1,
    rollout: false,
    resched: false,
    wait: s.tune.timeout,
    max: s.tune.timeout,
    life: 0,
    ...o,
  };
}

export function randomApp(s: State): App {
  const r = s.rng();
  if (r < s.tune.gpuP) return pick(s.rng, GPU_APPS);
  if (r < s.tune.gpuP + s.tune.odP) return pick(s.rng, OD_APPS);
  return pick(s.rng, COMMON);
}

const lifeOf = (s: State, p: Pod) => (p.cls === "job" || p.cls === "gpu" ? 10 + s.rng() * 8 : 16 + s.rng() * 14);

export function createGame(diff: Difficulty = "normal", rng: () => number = Math.random): State {
  const tune = DIFFICULTY[diff];
  const s: State = {
    rng,
    diff,
    tune,
    nodes: [],
    queue: [],
    sel: 0,
    cursor: 0,
    t: 0,
    arriveIn: WARMUP,
    eventIn: tune.eventEvery,
    eventIx: 0,
    burstIn: tune.burstEvery,
    billIn: BILL_EVERY,
    deployed: 0,
    failures: 0,
    score: 0,
    spend: 0,
    utilSum: 0,
    utilN: 0,
    karpenter: tune.karpenter,
    rollback: tune.rollback,
    vers: {},
    nextId: 1,
    over: null,
  };
  s.nodes = tune.start.map((k) => newNode(s, k));
  return s;
}

/** Existing workloads (not counted as deploys) plus a first couple of pods waiting. */
export function seed(s: State): void {
  const by = (n: string) => APPS.find((a) => a.name === n) as App;
  const running: [number, string][] = [
    [0, "postgres"],
    [0, "auth"],
    [1, "api-gateway"],
    [1, "kafka-consumer"],
    [2, "frontend"],
  ];
  for (const [i, name] of running) {
    const p = makePod(s, by(name), { noisy: false });
    p.life = 20 + s.rng() * 20;
    s.nodes[i]?.pods.push(p);
  }
  s.queue.push(makePod(s, by("checkout"), { noisy: false }), makePod(s, by("search")));
}

export const usedCpu = (n: Node) => n.pods.reduce((a, p) => a + p.cpu, 0);
export const usedMem = (n: Node) => n.pods.reduce((a, p) => a + p.mem, 0);
export const usedGpu = (n: Node) => n.pods.reduce((a, p) => a + (p.gpu ? 1 : 0), 0);
export const hasNoisy = (n: Node) => n.pods.some((p) => p.noisy);
export const schedulable = (n: Node) => n.status === "Ready" && n.downIn <= 0 && n.drainIn <= 0;

/**
 * Fit check for pod on node. "notready"/"cordoned"/"taint"/"affinity" are refused like the real
 * scheduler would (no failure). "cpu"/"mem"/"gpu" are failures (OutOfcpu, OutOfmemory,
 * CrashLoopBackOff without a CUDA driver). "noisy" means it fits now but leaves no room for
 * a noisy neighbor's burst: allowed, with OOMKilled risk.
 */
export function fit(n: Node, p: Pod): Fit {
  if (n.status === "Cordoned" || n.drainIn > 0) return "cordoned";
  if (n.status !== "Ready" || n.downIn > 0) return "notready";
  if (n.kind === "gpu" && !p.gpu) return "taint";
  if (p.od && n.kind === "spot") return "affinity";
  if (p.gpu && usedGpu(n) >= n.gpus) return "gpu";
  if (usedCpu(n) + p.cpu > n.cpu) return "cpu";
  if (usedMem(n) + p.mem > n.mem) return "mem";
  if ((hasNoisy(n) || p.noisy) && usedMem(n) + p.mem + BURST > n.mem) return "noisy";
  return "ok";
}
export const isBlock = (f: Fit) => f === "notready" || f === "cordoned" || f === "taint" || f === "affinity";
export const isFail = (f: Fit) => f === "cpu" || f === "mem" || f === "gpu";

/** Average cpu+mem utilization over Ready nodes (0..1). */
export function utilization(s: State): number {
  let c = 0;
  let cc = 0;
  let m = 0;
  let mc = 0;
  for (const n of s.nodes) {
    if (n.status !== "Ready") continue;
    c += usedCpu(n);
    m += usedMem(n);
    cc += n.cpu;
    mc += n.mem;
  }
  return cc ? (c / cc + m / mc) / 2 : 0;
}
export const costRate = (s: State) => s.nodes.reduce((a, n) => a + PRICE[n.kind], 0);
export const selected = (s: State): Pod | undefined => s.queue[s.sel];

function fail(s: State, ev: Ev[]): void {
  s.failures++;
  if (s.failures >= MAX_FAILS && !s.over) {
    s.over = "lose";
    ev.push({ t: "lose" });
  }
}

function requeue(s: State, n: Node, ev: Ev[]): void {
  const pods = n.pods;
  n.pods = [];
  for (const p of pods) {
    p.resched = true;
    p.rollout = false;
    // Grace: evicted pods get a longer window so one event can't cost several failures at once.
    p.wait = p.max = s.tune.timeout * 1.6;
  }
  s.queue.push(...pods);
  if (pods.length) ev.push({ t: "requeue", pods, node: n.id });
}

function clampSel(s: State): void {
  s.sel = Math.max(0, Math.min(s.sel, s.queue.length - 1));
  s.cursor = Math.max(0, Math.min(s.cursor, s.nodes.length - 1));
}

export function selectPod(s: State, i: number): void {
  if (s.queue.length) s.sel = ((i % s.queue.length) + s.queue.length) % s.queue.length;
}
export function moveCursor(s: State, d: number): void {
  s.cursor = Math.max(0, Math.min(s.nodes.length - 1, s.cursor + d));
}

/** Schedule the selected pod onto node index ni. Returns the events produced. */
export function place(s: State, ni: number): Ev[] {
  const ev: Ev[] = [];
  const p = selected(s);
  const n = s.nodes[ni];
  if (s.over || !p || !n) return ev;
  s.cursor = ni;
  const f = fit(n, p);
  if (isBlock(f)) {
    ev.push({ t: "block", pod: p, node: n.id, why: f });
    return ev;
  }
  s.queue.splice(s.sel, 1);
  clampSel(s);
  if (isFail(f)) {
    ev.push({ t: "crash", pod: p, node: n.id, why: f });
    fail(s, ev);
    return ev;
  }
  p.life = lifeOf(s, p);
  n.pods.push(p);
  const fc = n.cpu - usedCpu(n);
  const fm = n.mem - usedMem(n);
  const snug = fc === 0 || fm === 0;
  const pack = (usedCpu(n) / n.cpu + usedMem(n) / n.mem) / 2;
  let gain = p.resched ? 50 : 100;
  gain += Math.round(pack * 60) + (snug ? 40 : 0);
  s.score += gain;
  ev.push({ t: "place", pod: p, node: n.id, gain, snug });
  if (p.rollout) {
    // maxSurge 1 / maxUnavailable 0: one old replica terminates per new one Ready.
    for (const m of s.nodes) {
      const old = m.pods.find((x) => x.app === p.app && x.ver < p.ver);
      if (old) {
        m.pods = m.pods.filter((x) => x !== old);
        ev.push({ t: "terminate", pod: old, node: m.id });
        break;
      }
    }
  }
  if (!p.resched) {
    s.deployed++;
    if (s.deployed % 10 === 0) s.karpenter = Math.min(3, s.karpenter + 1);
    if (s.deployed === 20) s.rollback++;
    if (s.deployed >= GOAL && !s.over) {
      const avg = s.utilN ? s.utilSum / s.utilN : utilization(s);
      const bonus = Math.round(avg * 1500) + (MAX_FAILS - 1 - s.failures) * 250;
      s.score += bonus;
      s.over = "win";
      ev.push({ t: "win", bonus });
    }
  }
  return ev;
}

/** Karpenter: provision a node that fits the selected pod (GPU, on-demand, or cheapest: spot). */
export function karpenter(s: State): Ev[] {
  if (s.over || s.karpenter <= 0 || s.nodes.length >= MAX_NODES) return [];
  const p = selected(s);
  const kind: NodeKind = p?.gpu ? "gpu" : p?.od ? "od" : "spot";
  const n = newNode(s, kind);
  n.status = "NotReady";
  n.downIn = 1.5; // node boot + kubelet register
  s.nodes.push(n);
  s.karpenter--;
  return [{ t: "karpenter", node: n.id, kind }];
}

/** Cordon & drain node ni: its pods re-enter the queue and the node is consolidated away. */
export function drain(s: State, ni: number): Ev[] {
  const n = s.nodes[ni];
  if (s.over || !n || n.drainIn > 0 || s.nodes.length <= 1) return [];
  const ev: Ev[] = [{ t: "drain", node: n.id }];
  n.status = "Cordoned";
  n.noticeIn = 0;
  n.drainIn = 1.5;
  requeue(s, n, ev);
  return ev;
}

/** helm rollback: restores one failure and drops queued pods of the in-flight rollout. */
export function rollback(s: State): Ev[] {
  if (s.over || s.rollback <= 0) return [];
  s.rollback--;
  const restored = s.failures > 0;
  if (restored) s.failures--;
  s.queue = s.queue.filter((p) => !p.rollout);
  for (const p of s.queue) p.wait = p.max;
  clampSel(s);
  return [{ t: "rollback", restored }];
}

function cycleEvent(s: State, ev: Ev[]): void {
  const kinds = s.tune.events;
  let k = kinds[s.eventIx++ % kinds.length];
  const r = s.rng;
  if (k === "spot") {
    const spot = s.nodes.filter((n) => n.kind === "spot" && schedulable(n) && !n.noticeIn);
    if (spot.length) {
      const n = pick(r, spot);
      n.noticeIn = s.tune.notice;
      ev.push({ t: "notice", node: n.id });
      return;
    }
    k = "fail";
  }
  if (k === "fail") {
    const cands = s.nodes.filter((n) => n.kind !== "gpu" && schedulable(n) && n.pods.length && !n.noticeIn);
    if (cands.length && s.nodes.filter(schedulable).length > 2) {
      const n = pick(r, cands);
      n.status = "NotReady";
      n.downIn = s.tune.recover;
      ev.push({ t: "nodeDown", node: n.id });
      requeue(s, n, ev);
      return;
    }
    k = "hpa";
  }
  if (k === "rolling") {
    const running = s.nodes.flatMap((n) => n.pods).filter((p) => p.cls !== "job" && p.cls !== "gpu");
    if (running.length) {
      const app = pick(r, running).app;
      const ver = Math.max(1, ...running.filter((p) => p.app === app).map((p) => p.ver)) + 1;
      s.vers[app] = ver;
      const cnt = Math.min(3, running.filter((p) => p.app === app).length);
      const a = APPS.find((x) => x.name === app) as App;
      for (let i = 0; i < cnt; i++) s.queue.push(makePod(s, a, { ver, rollout: true }));
      ev.push({ t: "rolling", app, ver, n: cnt });
      return;
    }
  }
  const a = pick(r, SVC_APPS);
  for (let i = 0; i < 3; i++) s.queue.push(makePod(s, a));
  ev.push({ t: "hpa", app: a.name, n: 3 });
}

/** Advance the simulation by dt seconds. Returns the events that happened. */
export function step(s: State, dt: number): Ev[] {
  const ev: Ev[] = [];
  if (s.over) return ev;
  s.t += dt;
  const T = s.tune;

  // Running pods: jobs complete, services scale in.
  for (const n of s.nodes) {
    n.pods = n.pods.filter((p) => {
      p.life -= dt;
      if (p.life > 0) return true;
      ev.push({ t: "complete", pod: p, node: n.id });
      return false;
    });
  }

  // Node lifecycle.
  for (const n of [...s.nodes]) {
    if (n.downIn > 0) {
      n.downIn -= dt;
      if (n.downIn <= 0 && n.status === "NotReady") {
        n.downIn = 0;
        n.status = "Ready";
        ev.push({ t: "nodeUp", node: n.id });
      }
    }
    if (n.noticeIn > 0) {
      n.noticeIn -= dt;
      if (n.noticeIn <= 0) {
        n.noticeIn = 0;
        ev.push({ t: "reclaim", node: n.id });
        requeue(s, n, ev);
        s.nodes = s.nodes.filter((x) => x !== n);
      }
    }
    if (n.drainIn > 0) {
      n.drainIn -= dt;
      if (n.drainIn <= 0) {
        s.nodes = s.nodes.filter((x) => x !== n);
        ev.push({ t: "removed", node: n.id });
      }
    }
  }
  clampSel(s);

  if (s.t < WARMUP) return ev;

  // Arrivals from the registry.
  s.arriveIn -= dt;
  if (s.arriveIn <= 0 && s.queue.length < QMAX) {
    const k = Math.min(1, s.deployed / GOAL);
    s.arriveIn = T.arrive[0] + (T.arrive[1] - T.arrive[0]) * k;
    const p = makePod(s, randomApp(s));
    s.queue.push(p);
    ev.push({ t: "arrive", pod: p });
  }

  // Cluster events.
  s.eventIn -= dt;
  if (s.eventIn <= 0) {
    s.eventIn = T.eventEvery;
    cycleEvent(s, ev);
  }

  // Noisy neighbors burst over their requests: OOMKilled where there is no headroom.
  s.burstIn -= dt;
  if (s.burstIn <= 0) {
    s.burstIn = T.burstEvery;
    for (const n of s.nodes) {
      if (n.status !== "Ready") continue;
      const victim = n.pods.find((p) => p.noisy);
      if (victim && usedMem(n) + BURST > n.mem) {
        n.pods = n.pods.filter((p) => p !== victim);
        victim.resched = true;
        victim.rollout = false;
        victim.wait = victim.max = T.timeout * 1.6;
        s.queue.push(victim);
        ev.push({ t: "oom", pod: victim, node: n.id });
        fail(s, ev);
      }
    }
  }

  // Pending timers: only pods in the active scheduling cycle tick.
  for (let i = 0; i < Math.min(QTICK, s.queue.length); i++) {
    const p = s.queue[i];
    p.wait -= dt;
    if (p.wait <= 0) {
      s.queue.splice(i--, 1);
      ev.push({ t: "pending", pod: p });
      fail(s, ev);
    }
  }
  clampSel(s);

  // FinOps: spend accrues per cluster minute; packing pays every bill tick.
  s.spend += (costRate(s) * dt) / 60;
  s.billIn -= dt;
  if (s.billIn <= 0) {
    s.billIn = BILL_EVERY;
    const util = utilization(s);
    s.utilSum += util;
    s.utilN++;
    const gain = Math.round(util * 40);
    s.score += gain;
    ev.push({ t: "bill", gain, util });
  }
  return ev;
}
