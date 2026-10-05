/**
 * Keep the Service Alive: pure simulation (no DOM, no three).
 * Clients -> edge (TLS) -> LB -> API x3 -> (cache | DB primary), with async writes via a queue.
 * Uptime = served user requests / demanded user requests over one "day".
 */

export type Difficulty = "easy" | "normal" | "hard";
export type Kind = "edge" | "lb" | "api" | "cache" | "queue" | "db";
export type Fault = "crash" | "leak" | "spike" | "dbfail" | "noisy" | "region" | "cert" | "deploy" | "retry";
export type Action = "scale" | "restart" | "failover" | "breaker" | "renew" | "rollback";
export type ActResult = "ok" | "noop" | "cooldown" | "budget" | "maxed";

export interface Comp {
  id: string;
  kind: Kind;
  health: number;
  down: boolean;
  /** Seconds left in a restart (component is offline meanwhile). */
  restarting: number;
  scale: number;
  fault: Fault | null;
  breaker: boolean;
  primary: boolean;
}

export interface Flow {
  demand: number;
  /** Extra load from client retries (not user demand). */
  retry: number;
  lb: number;
  api: number[];
  cacheHit: number;
  db: number;
  queue: number;
  /** Fraction of API responses that are errors (bad deploy). */
  err: number;
  served: number;
}

export interface LogEntry {
  kind: "fault" | "fix" | "down";
  id: string;
  fault?: Fault;
}

/** One incident for the postmortem: requests lost while it was open. */
export interface Incident {
  fault: Fault;
  id: string;
  start: number;
  end: number | null;
  lost: number;
}

export interface Tuning {
  /** Length of the day in seconds. */
  duration: number;
  /** Uptime needed to win. */
  target: number;
  /** Budget cap (and starting budget) and regen per second. */
  budget: number;
  regen: number;
  /** Max simultaneous faults before new incidents wait. */
  maxActive: number;
  /** Seconds between incidents: gap + jitter * rng, shrinking by `ramp` over the day. */
  gap: number;
  jitter: number;
  ramp: number;
  first: number;
  /** Multiplier on every decay rate (how fast things cascade). */
  decay: number;
}

export const DIFFICULTY: Record<Difficulty, Tuning> = {
  easy: {
    duration: 120,
    target: 0.999,
    budget: 150,
    regen: 1,
    maxActive: 1,
    gap: 10,
    jitter: 5,
    ramp: 2,
    first: 8,
    decay: 0.75,
  },
  normal: {
    duration: 120,
    target: 0.9999,
    budget: 100,
    regen: 0.6,
    maxActive: 2,
    gap: 6,
    jitter: 4,
    ramp: 3,
    first: 6,
    decay: 1.1,
  },
  hard: {
    duration: 90,
    target: 0.9999,
    budget: 100,
    regen: 0.6,
    maxActive: 3,
    gap: 4.2,
    jitter: 3,
    ramp: 1.5,
    first: 4,
    decay: 1.6,
  },
};

export interface State {
  t: number;
  d: Tuning;
  comps: Comp[];
  budget: number;
  cd: Record<Action, number>;
  demanded: number;
  served: number;
  nextIncident: number;
  spike: { start: number; amp: number } | null;
  last: Partial<Record<Fault, number>>;
  /** Next time a bad deploy rolls out to another pod. */
  deployNext: number;
  /** Active region index into REGIONS. */
  region: number;
  resolved: number;
  incidents: Incident[];
  over: boolean;
  won: boolean;
  flow: Flow;
  log: LogEntry[];
  rng: () => number;
}

export const REGIONS = ["us-east-1", "us-west-2"];
export const SCALE_COST = 25;
export const MAX_SCALE = 3;
export const ACTIONS: Action[] = ["scale", "restart", "failover", "breaker", "renew", "rollback"];
export const COOLDOWN: Record<Action, number> = {
  scale: 3,
  restart: 4,
  failover: 15,
  breaker: 2,
  renew: 3,
  rollback: 5,
};
/** Actions that act on the whole fleet regardless of the selected component. */
export const GLOBAL: Action[] = ["renew", "rollback"];
const SPIKE_LEAD = 4;
const SPIKE_RAMP = 2;
const SPIKE_HOLD = 12;
const RETRY_MAX = 1600;
const DEPLOY_SPREAD = 3;

/** Mulberry32: small deterministic PRNG for tests and replays. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const comp = (id: string, kind: Kind, primary = false): Comp => ({
  id,
  kind,
  health: 100,
  down: false,
  restarting: 0,
  scale: 0,
  fault: null,
  breaker: false,
  primary,
});

const emptyFlow = (): Flow => ({
  demand: 0,
  retry: 0,
  lb: 0,
  api: [0, 0, 0],
  cacheHit: 0,
  db: 0,
  queue: 0,
  err: 0,
  served: 0,
});

export function createState(rng: () => number = Math.random, difficulty: Difficulty = "normal"): State {
  const d = DIFFICULTY[difficulty];
  return {
    t: 0,
    d,
    comps: [
      comp("edge", "edge"),
      comp("lb", "lb"),
      comp("api0", "api"),
      comp("api1", "api"),
      comp("api2", "api"),
      comp("cache", "cache"),
      comp("queue", "queue"),
      comp("db0", "db", true),
      comp("db1", "db"),
    ],
    budget: d.budget,
    cd: { scale: 0, restart: 0, failover: 0, breaker: 0, renew: 0, rollback: 0 },
    demanded: 0,
    served: 0,
    nextIncident: d.first,
    spike: null,
    last: {},
    deployNext: 0,
    region: 0,
    resolved: 0,
    incidents: [],
    over: false,
    won: false,
    flow: emptyFlow(),
    log: [],
    rng,
  };
}

export const get = (s: State, id: string) => s.comps.find((c) => c.id === id) as Comp;
export const apis = (s: State) => s.comps.filter((c) => c.kind === "api");
export const primary = (s: State) => s.comps.find((c) => c.kind === "db" && c.primary) as Comp;
export const replica = (s: State) => s.comps.find((c) => c.kind === "db" && !c.primary) as Comp;
const since = (s: State, f: Fault) => s.t - (s.last[f] ?? -99);

export const uptime = (s: State) => (s.demanded > 0 ? s.served / s.demanded : 1);

/** Floors so 99.995% never reads as 100.00%. */
export function fmtUptime(u: number, decimals: number): string {
  const p = 10 ** decimals;
  return (Math.floor(u * 100 * p + 1e-9) / p).toFixed(decimals);
}

/** Effective capacity factor: full above 50 health, linear below, 0 when offline. A bad deploy keeps capacity but errors. */
export const eff = (c: Comp) =>
  c.down || c.restarting > 0 ? 0 : c.fault === "deploy" ? 1 : Math.min(1, c.health / 50);

/** Error rate of a pod running a bad build: 0 above 50 health, 1 at 0. */
export const errOf = (c: Comp) => (c.fault === "deploy" ? Math.max(0, 1 - c.health / 50) : 0);

export const capOf = (c: Comp) => {
  if (c.kind === "lb") return 1200 + 600 * c.scale;
  if (c.kind === "api") return 600 + 300 * c.scale;
  if (c.kind === "db") return 800 + 400 * c.scale;
  return 1;
};

/** Spike envelope (0..amp) at time t. */
export function spikeAt(s: State, t: number): number {
  const sp = s.spike;
  if (!sp) return 0;
  const k = t - sp.start;
  if (k <= 0) return 0;
  if (k < SPIKE_RAMP) return (sp.amp * k) / SPIKE_RAMP;
  if (k < SPIKE_RAMP + SPIKE_HOLD) return sp.amp;
  const d = k - SPIKE_RAMP - SPIKE_HOLD;
  return d < SPIKE_RAMP ? sp.amp * (1 - d / SPIKE_RAMP) : 0;
}

export const baseDemand = (s: State, t: number) =>
  800 + 300 * Math.sin((Math.PI * Math.min(t, s.d.duration)) / s.d.duration);
export const demandAt = (s: State, t: number) => baseDemand(s, t) + spikeAt(s, t);

/** Retry amplification from clients without backoff: starts once edge health is below 60. */
export const retryLoad = (s: State) => {
  const e = get(s, "edge");
  return e.fault === "retry" ? RETRY_MAX * Math.max(0, (60 - e.health) / 60) ** 1.5 : 0;
};

/** Instantaneous request flow through the topology. */
export function computeFlow(s: State): Flow {
  const D = demandAt(s, s.t);
  const R = retryLoad(s);
  const total = D + R;
  const lb = get(s, "lb");
  const x = get(s, "edge").down ? 0 : Math.min(total, capOf(lb) * eff(lb));
  const list = apis(s);
  const caps = list.map((a) => (a.breaker ? 0 : capOf(a) * eff(a)));
  const apiCap = caps.reduce((a, b) => a + b, 0);
  const y = Math.min(x, apiCap);
  const err = apiCap > 0 ? list.reduce((a, c, i) => a + (caps[i] / apiCap) * errOf(c), 0) : 0;
  const cache = get(s, "cache");
  const queue = get(s, "queue");
  const hit = 0.55 * (cache.breaker ? 0 : eff(cache));
  const qEff = queue.breaker ? 1 : eff(queue);
  const dbLoad = y * (1 - hit) + (queue.breaker ? 0.15 * y : 0);
  const p = primary(s);
  const dbCap = capOf(p) * eff(p);
  const dbRatio = dbLoad > 0 ? Math.min(1, dbCap / dbLoad) : 1;
  const qRatio = 1 - 0.2 * (1 - qEff);
  const served = total > 0 ? y * (D / total) * (hit + (1 - hit) * dbRatio) * qRatio * (1 - err) : 0;
  return {
    demand: D,
    retry: R,
    lb: x,
    api: caps.map((c) => (apiCap > 0 ? (y * c) / apiCap : 0)),
    cacheHit: y * hit,
    db: Math.min(dbLoad, dbCap),
    queue: queue.breaker ? 0 : 0.2 * y * qEff,
    err,
    served,
  };
}

/** Deploy incidents belong to the whole API fleet. */
const incId = (c: Comp, f: Fault) => (f === "deploy" ? "api" : c.id);

const closeInc = (s: State, f: Fault, id: string) => {
  for (const i of s.incidents) if (i.end === null && i.fault === f && i.id === id) i.end = s.t;
};

const setFault = (s: State, c: Comp, f: Fault) => {
  if (c.fault) closeInc(s, c.fault, incId(c, c.fault));
  c.fault = f;
  s.last[f] = s.t;
  s.log.push({ kind: "fault", id: c.id, fault: f });
  s.incidents.push({ fault: f, id: incId(c, f), start: s.t, end: null, lost: 0 });
};
const resolve = (s: State, c: Comp) => {
  if (!c.fault) return;
  s.log.push({ kind: "fix", id: c.id, fault: c.fault });
  closeInc(s, c.fault, incId(c, c.fault));
  c.fault = null;
  s.resolved++;
};
const knockDown = (s: State, c: Comp) => {
  if (c.down) return;
  c.down = true;
  c.health = 0;
  s.log.push({ kind: "down", id: c.id });
};

const spikeBusy = (s: State) => !!s.spike || since(s, "spike") < 20;
const fresh = (c: Comp) => !c.fault && !c.down && c.restarting <= 0 && c.health >= 100;

function spawn(s: State): boolean {
  const r = s.rng;
  const list = apis(s);
  const allApis = list.every(fresh);
  const lb = get(s, "lb");
  const edge = get(s, "edge");
  const p = primary(s);
  const rep = replica(s);
  const late = s.t > s.d.duration - 16;
  const opts: Array<[number, () => void]> = [];
  const pick = () => list[Math.floor(r() * list.length)];
  if (!spikeBusy(s) && allApis) {
    opts.push([
      3,
      () => {
        const a = pick();
        setFault(s, a, "crash");
        knockDown(s, a);
      },
    ]);
    opts.push([2, () => setFault(s, pick(), "leak")]);
    if (since(s, "deploy") > 25 && !late)
      opts.push([
        1.5,
        () => {
          setFault(s, pick(), "deploy");
          s.deployNext = s.t + DEPLOY_SPREAD;
        },
      ]);
  }
  if (!s.spike && since(s, "spike") > 25 && s.t < s.d.duration - 24 && lb.fault !== "region") {
    opts.push([
      2.2,
      () => {
        s.spike = { start: s.t + SPIKE_LEAD, amp: 500 + 150 * r() };
        setFault(s, lb, "spike");
        s.last.spike = s.t + SPIKE_LEAD;
      },
    ]);
  }
  const failoverFree = s.cd.failover === 0 && p.fault !== "dbfail" && lb.fault !== "region";
  if (since(s, "dbfail") > 30 && failoverFree && fresh(p) && fresh(rep)) {
    opts.push([1.6, () => setFault(s, p, "dbfail")]);
  }
  if (since(s, "region") > 35 && failoverFree && fresh(lb) && !s.spike && !late) {
    opts.push([1.1, () => setFault(s, lb, "region")]);
  }
  if (fresh(edge) && !s.spike) {
    if (since(s, "cert") > 25) opts.push([1.2, () => setFault(s, edge, "cert")]);
    if (since(s, "retry") > 25) opts.push([1.2, () => setFault(s, edge, "retry")]);
  }
  for (const id of ["cache", "queue"]) {
    const c = get(s, id);
    if (fresh(c) && c.scale === 0) opts.push([1.4, () => setFault(s, c, "noisy")]);
  }
  if (!opts.length) return false;
  let w = r() * opts.reduce((a, o) => a + o[0], 0);
  for (const [k, fn] of opts) {
    w -= k;
    if (w <= 0) {
      fn();
      return true;
    }
  }
  opts[opts.length - 1][1]();
  return true;
}

/** Health decay per second for a fault (before the difficulty multiplier). */
const DECAY: Partial<Record<Fault, number>> = {
  leak: 5,
  dbfail: 15,
  noisy: 6,
  region: 12,
  cert: 10,
  deploy: 20,
  retry: 14,
};

export function step(s: State, dt: number): void {
  if (s.over) return;
  dt = Math.max(0, Math.min(dt, s.d.duration - s.t));
  const { d } = s;
  s.t = Math.min(d.duration, s.t + dt);
  for (const a of ACTIONS) s.cd[a] = Math.max(0, s.cd[a] - dt);
  s.budget = Math.min(d.budget, s.budget + d.regen * dt);

  if (s.t >= s.nextIncident && s.t < d.duration - 10) {
    const active = s.comps.filter((c) => c.fault).length;
    const ok = active < d.maxActive && spawn(s);
    s.nextIncident = s.t + (ok ? d.gap + d.jitter * s.rng() - (d.ramp * s.t) / d.duration : 2);
  }
  const lb = get(s, "lb");
  if (s.spike && s.t > s.spike.start + 2 * SPIKE_RAMP + SPIKE_HOLD) {
    s.spike = null;
    if (lb.fault === "spike") {
      closeInc(s, "spike", "lb");
      lb.fault = null;
    }
  }
  // A bad build keeps rolling out to the next healthy pod until someone rolls it back.
  const list = apis(s);
  if (list.some((a) => a.fault === "deploy") && s.t >= s.deployNext) {
    const next = list.find((a) => !a.fault && !a.down && a.restarting <= 0);
    if (next) {
      next.fault = "deploy";
      s.log.push({ kind: "fault", id: next.id, fault: "deploy" });
    }
    s.deployNext = s.t + DEPLOY_SPREAD;
  }

  for (const c of s.comps) {
    if (c.restarting > 0) {
      c.restarting -= dt;
      if (c.restarting <= 0) {
        c.restarting = 0;
        c.down = false;
        c.health = 100;
        c.breaker = false;
        if (c.fault === "crash" || c.fault === "leak") resolve(s, c);
      }
    }
  }

  const total = demandAt(s, s.t) + retryLoad(s);
  const apiDown = list.filter((a) => a.down && a.restarting <= 0 && !a.breaker).length;
  for (const c of s.comps) {
    if (c.down || c.restarting > 0) continue;
    let decay = (c.fault && DECAY[c.fault]) || 0;
    if (c.kind === "api" && apiDown) decay += 14 * apiDown;
    if (c.kind === "lb" && total > capOf(c)) decay += 5;
    if (decay > 0) {
      c.health -= decay * d.decay * dt;
      if (c.health <= 0) {
        c.health = 0;
        if (c.fault === "deploy" || c.fault === "retry") continue;
        if ((c.kind === "api" || c.kind === "lb") && (!c.fault || c.fault === "spike" || c.fault === "leak"))
          setFault(s, c, "crash");
        knockDown(s, c);
      }
    } else {
      c.health = Math.min(100, c.health + (c.kind === "db" && !c.primary ? 6 : 8) * dt);
    }
  }

  s.flow = computeFlow(s);
  s.demanded += s.flow.demand * dt;
  s.served += s.flow.served * dt;
  const lost = Math.max(0, s.flow.demand - s.flow.served) * dt;
  const open = s.incidents.filter((i) => i.end === null);
  for (const i of open) i.lost += lost / open.length;

  if (s.t >= d.duration) {
    s.over = true;
    s.won = uptime(s) >= d.target;
    for (const i of s.incidents) if (i.end === null) i.end = s.t;
  }
}

export function act(s: State, id: string, a: Action): ActResult {
  if (s.over) return "noop";
  if (s.cd[a] > 0) return "cooldown";
  const c = get(s, id);
  if (a === "renew") {
    s.cd.renew = COOLDOWN.renew;
    const e = get(s, "edge");
    if (e.fault !== "cert") return "noop";
    resolve(s, e);
    e.down = false;
    e.health = 100;
    return "ok";
  }
  if (a === "rollback") {
    s.cd.rollback = COOLDOWN.rollback;
    const bad = apis(s).filter((x) => x.fault === "deploy");
    if (!bad.length) return "noop";
    for (const x of bad) {
      x.fault = null;
      x.health = Math.max(x.health, 50);
      s.log.push({ kind: "fix", id: x.id, fault: "deploy" });
    }
    closeInc(s, "deploy", "api");
    s.resolved++;
    return "ok";
  }
  if (a === "scale") {
    if (c.kind === "edge") return "noop";
    if (c.scale >= MAX_SCALE) return "maxed";
    if (s.budget < SCALE_COST) return "budget";
    s.budget -= SCALE_COST;
    c.scale++;
    s.cd.scale = COOLDOWN.scale;
    if (c.fault === "spike" || c.fault === "noisy") {
      resolve(s, c);
      return "ok";
    }
    return c.kind === "cache" || c.kind === "queue" ? "noop" : "ok";
  }
  if (a === "restart") {
    s.cd.restart = COOLDOWN.restart;
    if (c.kind === "edge") return "noop";
    const useful = (c.down && c.fault !== "region") || c.fault === "crash" || c.fault === "leak";
    c.restarting = c.kind === "db" ? 2.5 : 1.5;
    if (c.fault === "noisy") c.health = 100;
    return useful ? "ok" : "noop";
  }
  if (a === "failover") {
    if (c.kind === "lb" && c.fault === "region") {
      s.cd.failover = COOLDOWN.failover;
      s.region = 1 - s.region;
      resolve(s, c);
      c.down = false;
      c.health = 100;
      return "ok";
    }
    if (c.kind !== "db") {
      s.cd.failover = 2;
      return "noop";
    }
    s.cd.failover = COOLDOWN.failover;
    const p = primary(s);
    const r = replica(s);
    p.primary = false;
    r.primary = true;
    if (p.fault === "dbfail" || p.down) {
      resolve(s, p);
      p.down = false;
      p.restarting = 0;
      p.health = 5;
      return "ok";
    }
    return "noop";
  }
  // breaker: client backoff on the edge, or isolate a failing dependency
  s.cd.breaker = COOLDOWN.breaker;
  if (c.kind === "edge") {
    if (c.fault !== "retry") return "noop";
    resolve(s, c);
    c.health = 100;
    return "ok";
  }
  if (c.kind === "lb" || c.kind === "db") return "noop";
  c.breaker = !c.breaker;
  if (!c.breaker) return "ok";
  return c.down || c.fault ? "ok" : "noop";
}

/** The action that fixes a component's current problem (button hint and scripted players). */
export function remedy(c: Comp): Action | null {
  if (c.restarting > 0) return null;
  if (c.fault === "region") return "failover";
  if (c.fault === "deploy") return "rollback";
  if (c.fault === "cert") return "renew";
  if (c.fault === "retry") return "breaker";
  if (c.kind === "api" && c.down) return "restart";
  if (c.fault === "crash" || c.fault === "leak") return "restart";
  if (c.fault === "spike" || c.fault === "noisy") return "scale";
  if (c.fault === "dbfail") return "failover";
  return null;
}

export const BONUS: Array<[number, number]> = [
  [0.9999, 50000],
  [0.999, 20000],
  [0.99, 5000],
];

export function finalScore(s: State): number {
  const u = uptime(s);
  const bonus = BONUS.find(([k]) => u >= k)?.[1] ?? 0;
  return Math.floor(s.served) + bonus;
}

/** Top incidents by requests lost (ties by duration), for the end-of-day postmortem. */
export function postmortem(s: State, n = 3): Incident[] {
  const dur = (i: Incident) => (i.end ?? s.t) - i.start;
  return [...s.incidents].sort((a, b) => b.lost - a.lost || dur(b) - dur(a)).slice(0, n);
}

/** Map sim time onto a 24 h wall clock ("HH:MM"). */
export function clockOf(s: State, t = s.t): string {
  const m = Math.floor((Math.min(t, s.d.duration) / s.d.duration) * 1440);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
