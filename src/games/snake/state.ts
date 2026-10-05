/** Neon Snake rules: a data stream eating packets. Pure: no DOM, no three. Deterministic with an injectable RNG. */
import type { Difficulty } from "../core/types";

export type Dir = "up" | "down" | "left" | "right";
export type Rng = () => number;
export interface Cell {
  x: number;
  y: number;
}
export type PowerKind = "cache" | "compress";

export interface Tuning {
  /** Seconds per step at 0 packets. */
  base: number;
  /** Fastest step (cap). */
  min: number;
  /** Seconds removed per packet eaten. */
  ramp: number;
  /** Walls wrap around instead of killing. */
  wrap: boolean;
  /** Firewall blocks spawn as the stream grows. */
  firewalls: boolean;
  /** A bug roams and eats segments. */
  bug: boolean;
  /** Score multiplier. */
  mul: number;
}

export const DIFFICULTY: Record<Difficulty, Tuning> = {
  easy: { base: 0.18, min: 0.11, ramp: 0.0022, wrap: true, firewalls: false, bug: false, mul: 1 },
  normal: { base: 0.145, min: 0.075, ramp: 0.0028, wrap: false, firewalls: false, bug: false, mul: 1 },
  hard: { base: 0.115, min: 0.055, ramp: 0.0026, wrap: false, firewalls: true, bug: true, mul: 2 },
};

export const PACKET_POINTS = 10;
export const BONUS_POINTS = 50;
export const BUG_POINTS = 30;
export const POWER_POINTS = 15;
/** Steps a bonus packet / power-up stays on the board. */
export const BONUS_TTL = 44;
export const POWER_TTL = 70;
/** Cache power-up: slow-motion seconds and step-time factor. */
export const CACHE_TIME = 4;
export const CACHE_FACTOR = 1.7;
export const COMPRESS_SHED = 3;
export const START_LEN = 4;
export const MIN_LEN = 3;
export const MAX_FIREWALLS = 14;
export const BUG_TTL = 60;

export interface SnakeState {
  cols: number;
  rows: number;
  diff: Difficulty;
  cfg: Tuning;
  /** Head first. */
  body: Cell[];
  /** Body before the last step (for interpolation; prev[i] is where body[i] came from). */
  prev: Cell[];
  dir: Dir;
  queue: Dir[];
  grow: number;
  food: Cell | null;
  bonus: (Cell & { ttl: number }) | null;
  power: (Cell & { kind: PowerKind; ttl: number }) | null;
  walls: Cell[];
  bug: (Cell & { ttl: number; from: Cell }) | null;
  bugCooldown: number;
  /** Seconds of slow motion left (cache). */
  slow: number;
  score: number;
  /** Packets eaten (lime + amber). */
  eaten: number;
  steps: number;
  alive: boolean;
  hit30: boolean;
}

export interface StepEvents {
  ate: "packet" | "bonus" | "bug" | PowerKind | null;
  /** Where the thing was eaten. */
  at: Cell | null;
  died: boolean;
  milestone30: boolean;
  /** Cells shed by compress or bitten off by the bug. */
  lost: Cell[];
  bitten: boolean;
  wall: Cell | null;
  /** Cell the tail just left (afterglow). */
  left: Cell | null;
}

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const pick = <T>(a: T[], rng: Rng): T => a[Math.floor(rng() * a.length) % a.length];

export function createState(cols: number, rows: number, diff: Difficulty, rng: Rng): SnakeState {
  const y = Math.floor(rows / 2);
  const x0 = Math.max(START_LEN, Math.floor(cols / 3));
  const body: Cell[] = [];
  for (let i = 0; i < START_LEN; i++) body.push({ x: x0 - i, y });
  const s: SnakeState = {
    cols,
    rows,
    diff,
    cfg: DIFFICULTY[diff],
    body,
    prev: body.map((c) => ({ ...c })),
    dir: "right",
    queue: [],
    grow: 0,
    food: null,
    bonus: null,
    power: null,
    walls: [],
    bug: null,
    bugCooldown: 30,
    slow: 0,
    score: 0,
    eaten: 0,
    steps: 0,
    alive: true,
    hit30: false,
  };
  s.food = place(s, rng);
  return s;
}

/** Seconds per grid step: ramps with packets eaten, capped, stretched while the cache is active. */
export function interval(s: SnakeState): number {
  const v = Math.max(s.cfg.min, s.cfg.base - s.eaten * s.cfg.ramp);
  return s.slow > 0 ? v * CACHE_FACTOR : v;
}

/** Real-time clock for timed effects (cache). */
export function tick(s: SnakeState, dt: number): void {
  s.slow = Math.max(0, s.slow - dt);
}

/** Buffers one turn ahead of the current move; reversals and repeats are ignored. */
export function turn(s: SnakeState, d: Dir): void {
  if (!s.alive) return;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (d === last || d === OPPOSITE[last] || s.queue.length >= 2) return;
  s.queue.push(d);
}

export function occupied(s: SnakeState, c: Cell): boolean {
  return (
    s.body.some((b) => same(b, c)) ||
    s.walls.some((b) => same(b, c)) ||
    (!!s.food && same(s.food, c)) ||
    (!!s.bonus && same(s.bonus, c)) ||
    (!!s.power && same(s.power, c)) ||
    (!!s.bug && same(s.bug, c))
  );
}

function freeCells(s: SnakeState, ok: (c: Cell) => boolean = () => true): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < s.rows; y++)
    for (let x = 0; x < s.cols; x++) {
      const c = { x, y };
      if (!occupied(s, c) && ok(c)) out.push(c);
    }
  return out;
}

function place(s: SnakeState, rng: Rng, ok?: (c: Cell) => boolean): Cell | null {
  const free = freeCells(s, ok);
  return free.length ? pick(free, rng) : null;
}

const far = (s: SnakeState, n: number) => (c: Cell) => Math.abs(c.x - s.body[0].x) + Math.abs(c.y - s.body[0].y) >= n;

export function step(s: SnakeState, rng: Rng): StepEvents {
  const ev: StepEvents = {
    ate: null,
    at: null,
    died: false,
    milestone30: false,
    lost: [],
    bitten: false,
    wall: null,
    left: null,
  };
  if (!s.alive) return ev;
  s.steps++;
  const next = s.queue.shift();
  if (next) s.dir = next;
  const d = DELTA[s.dir];
  const head = { x: s.body[0].x + d.x, y: s.body[0].y + d.y };
  if (s.cfg.wrap) {
    head.x = (head.x + s.cols) % s.cols;
    head.y = (head.y + s.rows) % s.rows;
  }
  const tailMoves = s.grow === 0;
  const hitsSelf = s.body.some((c, i) => same(c, head) && !(tailMoves && i === s.body.length - 1));
  const out = head.x < 0 || head.y < 0 || head.x >= s.cols || head.y >= s.rows;
  if (out || hitsSelf || s.walls.some((w) => same(w, head))) {
    s.alive = false;
    ev.died = true;
    return ev;
  }
  s.prev = s.body.map((c) => ({ ...c }));
  s.body.unshift(head);
  if (tailMoves) ev.left = s.body.pop() as Cell;
  else s.grow--;
  const mul = s.cfg.mul;

  const eatPacket = (pts: number) => {
    s.score += pts * mul;
    s.eaten++;
    s.grow++;
  };
  if (s.bonus) {
    if (same(s.bonus, head)) {
      ev.at = { ...s.bonus };
      s.bonus = null;
      eatPacket(BONUS_POINTS);
      ev.ate = "bonus";
    } else if (--s.bonus.ttl <= 0) s.bonus = null;
  }
  if (s.power) {
    if (same(s.power, head)) {
      ev.at = { ...s.power };
      ev.ate = s.power.kind;
      s.score += POWER_POINTS * mul;
      if (s.power.kind === "cache") s.slow = CACHE_TIME;
      else {
        const keep = Math.max(MIN_LEN, s.body.length - COMPRESS_SHED);
        ev.lost = s.body.splice(keep);
        s.grow = 0;
      }
      s.power = null;
    } else if (--s.power.ttl <= 0) s.power = null;
  }
  if (s.bug && same(s.bug, head)) {
    ev.at = { ...s.bug };
    ev.ate = "bug";
    s.score += BUG_POINTS * mul;
    s.bug = null;
    s.bugCooldown = 40;
  }
  if (s.food && same(s.food, head)) {
    ev.at = { ...s.food };
    s.food = null;
    eatPacket(PACKET_POINTS);
    ev.ate = "packet";
    if (!s.bonus && s.eaten >= 3 && rng() < 0.25) s.bonus = withTtl(place(s, rng, far(s, 3)), BONUS_TTL);
    if (!s.power && s.eaten >= 5 && rng() < 0.14) {
      const kind: PowerKind = s.body.length >= START_LEN + COMPRESS_SHED && rng() < 0.5 ? "compress" : "cache";
      const c = place(s, rng, far(s, 3));
      s.power = c ? { ...c, kind, ttl: POWER_TTL } : null;
    }
    if (s.cfg.firewalls && s.eaten >= 4 && s.eaten % 3 === 1 && s.walls.length < MAX_FIREWALLS) {
      const w = place(s, rng, far(s, 4));
      if (w) {
        s.walls.push(w);
        ev.wall = w;
      }
    }
    s.food = place(s, rng);
  }
  if (s.cfg.bug) moveBug(s, rng, ev);
  if (s.eaten >= 30 && !s.hit30) {
    s.hit30 = true;
    ev.milestone30 = true;
  }
  return ev;
}

function withTtl(c: Cell | null, ttl: number) {
  return c ? { ...c, ttl } : null;
}

/** Hard mode: a bug wanders in from an edge, crawls toward the middle of the stream and bites segments off. */
function moveBug(s: SnakeState, rng: Rng, ev: StepEvents): void {
  if (!s.bug) {
    if (s.eaten < 6 || --s.bugCooldown > 0 || rng() > 0.06) return;
    const c = place(
      s,
      rng,
      (c) => (c.x === 0 || c.y === 0 || c.x === s.cols - 1 || c.y === s.rows - 1) && far(s, 6)(c),
    );
    if (c) s.bug = { ...c, ttl: BUG_TTL, from: { ...c } };
    return;
  }
  const b = s.bug;
  b.from = { x: b.x, y: b.y };
  if (--b.ttl <= 0) {
    s.bug = null;
    s.bugCooldown = 40;
    return;
  }
  if (s.steps % 2) return; // bugs crawl at half speed
  const target = s.body[Math.floor(s.body.length / 2)];
  const opts = (Object.values(DELTA) as Cell[])
    .map((d) => ({ x: b.x + d.x, y: b.y + d.y }))
    .filter(
      (c) =>
        c.x >= 0 &&
        c.y >= 0 &&
        c.x < s.cols &&
        c.y < s.rows &&
        !same(c, s.body[0]) &&
        !s.walls.some((w) => same(w, c)) &&
        !(s.food && same(s.food, c)),
    );
  if (!opts.length) return;
  const dist = (c: Cell) => Math.abs(c.x - target.x) + Math.abs(c.y - target.y) + rng() * 1.5;
  opts.sort((p, q) => dist(p) - dist(q));
  const to = opts[0];
  const hit = s.body.findIndex((c) => same(c, to));
  if (hit > 0) {
    const keep = Math.max(MIN_LEN, hit);
    ev.lost = ev.lost.concat(s.body.splice(keep));
    ev.bitten = true;
    s.grow = 0;
    s.bug = null;
    s.bugCooldown = 50;
    return;
  }
  b.x = to.x;
  b.y = to.y;
}

/** Mulberry32: small seeded RNG for tests and replays. */
export function seeded(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Attract-mode pilot: steer toward the packet, avoiding immediate death. */
export function autopilot(s: SnakeState): Dir {
  const goal = s.bonus ?? s.food ?? s.body[0];
  const h = s.body[0];
  const safe = (d: Dir) => {
    let c = { x: h.x + DELTA[d].x, y: h.y + DELTA[d].y };
    if (s.cfg.wrap) c = { x: (c.x + s.cols) % s.cols, y: (c.y + s.rows) % s.rows };
    if (c.x < 0 || c.y < 0 || c.x >= s.cols || c.y >= s.rows) return false;
    return !s.walls.some((w) => same(w, c)) && !s.body.slice(0, -1).some((b) => same(b, c));
  };
  const dirs = (["up", "down", "left", "right"] as Dir[]).filter((d) => d !== OPPOSITE[s.dir] && safe(d));
  if (!dirs.length) return s.dir;
  const score = (d: Dir) => Math.abs(h.x + DELTA[d].x - goal.x) + Math.abs(h.y + DELTA[d].y - goal.y);
  dirs.sort((a, b) => score(a) - score(b));
  return dirs[0];
}
