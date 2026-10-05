/**
 * Catch the Bug: pure rules. No DOM, no three. Deterministic with an injectable RNG.
 *
 * A bug's progress `p` runs along the pipeline: [0,1) DEV, [1,2) QA, [2,3) STAGING.
 * Reaching p >= 3 means it hit PROD: an incident. `lat` is the lateral offset in [-1, 1].
 */

import type { Difficulty } from "../core/types";

export type { Difficulty };
export type Rng = () => number;
export type BugKind = "normal" | "fast" | "zigzag" | "flaky" | "heisen" | "regression";
export type PowerKind = "unit" | "review" | "flag";

export interface Bug {
  id: number;
  kind: BugKind;
  p: number;
  speed: number;
  hp: number;
  base: number;
  amp: number;
  freq: number;
  phase: number;
  age: number;
  /** Regression bugs come back once; a relapsed one stays caught. */
  relapsed: boolean;
}

export interface Power {
  id: number;
  kind: PowerKind;
  p: number;
  lat: number;
  ttl: number;
}

export interface Effects {
  /** Seconds left of "Unit tests" (DEV bugs crawl). */
  unit: number;
  /** Bugs left that "Code review" auto-catches when they enter QA. */
  review: number;
  /** PROD arrivals a "Feature flag" will swallow. */
  flag: number;
}

export interface GameState {
  rng: Rng;
  level: Difficulty;
  maxIncidents: number;
  bugs: Bug[];
  power: Power | null;
  powerTimer: number;
  effects: Effects;
  score: number;
  incidents: number;
  caught: number;
  combo: number;
  comboTimer: number;
  elapsed: number;
  spawnTimer: number;
  release: number;
  nextId: number;
  over: boolean;
}

export interface CatchEvent {
  type: "catch";
  bug: Bug;
  stage: number;
  points: number;
  combo: number;
  /** Caught by Code review rather than a tap. */
  auto: boolean;
  /** A regression caught late comes back from DEV. */
  respawn: Bug | null;
}

export type StepEvent =
  | CatchEvent
  | { type: "incident"; bug: Bug; incidents: number }
  | { type: "flagged"; bug: Bug }
  | { type: "release"; index: number; name: string }
  | { type: "power-spawn"; power: Power }
  | { type: "power-expire"; power: Power }
  | { type: "gameover"; score: number }
  | { type: "combo-reset" };

export type TapResult = { type: "armor"; bug: Bug } | CatchEvent | null;

export const STAGES = ["DEV", "QA", "STAGING", "PROD"] as const;
export const PROD_AT = 3;
export const BASE_POINTS = 10;
export const STAGE_MULT = [3, 2, 1] as const;
export const COMBO_WINDOW = 1.6;
export const COMBO_MAX = 8;
export const MAX_BUGS = 40;
export const HEISEN_PERIOD = 2.2;
export const HEISEN_VISIBLE = 1.55;
export const RELEASE_EVERY = 20;
export const POWER_TTL = 6.5;
export const UNIT_TIME = 5;
export const UNIT_SLOW = 0.45;
export const REVIEW_CATCHES = 3;

/**
 * Everything difficulty changes, in one place.
 * incidents: incidents allowed; speed/interval: multipliers on crawl speed and spawn gap;
 * ramp: how fast the curve tightens; unlock: multiplier on when new kinds appear; heisen: heisenbug weight.
 */
export const DIFFICULTY: Record<
  Difficulty,
  { incidents: number; speed: number; interval: number; ramp: number; unlock: number; heisen: number }
> = {
  easy: { incidents: 5, speed: 0.85, interval: 1.2, ramp: 0.6, unlock: 1.3, heisen: 0.6 },
  normal: { incidents: 3, speed: 1, interval: 1, ramp: 1, unlock: 1, heisen: 1 },
  hard: { incidents: 2, speed: 1.18, interval: 0.85, ramp: 1.4, unlock: 0.7, heisen: 2.4 },
};

/** Small seeded PRNG (mulberry32). */
export function seeded(seed = 1): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pace at elapsed seconds: base crawl speed (p/s) and spawn interval (s). Both plateau. */
export function pace(t: number, level: Difficulty = "normal"): { speed: number; interval: number } {
  const d = DIFFICULTY[level];
  const rt = t * d.ramp;
  return {
    speed: d.speed * Math.min(0.45, 0.17 + 0.0035 * rt),
    interval: d.interval * Math.max(0.45, 1.7 - 0.016 * rt),
  };
}

/** Release name for wave i: v1.0 … v1.9, v2.0 … */
export const releaseName = (i: number) => `v${1 + Math.floor(i / 10)}.${i % 10}`;

export function createState(rng: Rng = Math.random, level: Difficulty = "normal"): GameState {
  return {
    rng,
    level,
    maxIncidents: DIFFICULTY[level].incidents,
    bugs: [],
    power: null,
    powerTimer: 10 + rng() * 6,
    effects: { unit: 0, review: 0, flag: 0 },
    score: 0,
    incidents: 0,
    caught: 0,
    combo: 1,
    comboTimer: 0,
    elapsed: 0,
    spawnTimer: 0.3,
    release: -1,
    nextId: 1,
    over: false,
  };
}

/** Pipeline stage index for progress p: 0 DEV, 1 QA, 2 STAGING, 3 PROD. */
export function stageOf(p: number): number {
  return Math.max(0, Math.min(3, Math.floor(p)));
}

export function pointsFor(p: number, combo: number): number {
  const s = stageOf(p);
  return s >= 3 ? 0 : BASE_POINTS * STAGE_MULT[s] * combo;
}

/** Lateral offset in [-1, 1] at progress p: a gentle wave, or a triangle wave for zig-zaggers. */
export function latAt(b: Bug, p = b.p): number {
  const x = b.freq * p + b.phase;
  const w = b.kind === "zigzag" ? (2 / Math.PI) * Math.asin(Math.sin(x * Math.PI * 2)) : Math.sin(x * Math.PI * 2);
  return Math.max(-1, Math.min(1, b.base + b.amp * w));
}

/** Seconds into the heisenbug blink cycle. */
export const heisenClock = (b: Bug) => (b.age + b.phase * HEISEN_PERIOD) % HEISEN_PERIOD;

/** Heisenbugs blink out for part of each cycle; invisible bugs cannot be caught. */
export function isVisible(b: Bug): boolean {
  return b.kind !== "heisen" || heisenClock(b) < HEISEN_VISIBLE;
}

function pickKind(s: GameState): BugKind {
  const d = DIFFICULTY[s.level];
  const t = s.elapsed / d.unlock;
  const w: Array<[BugKind, number]> = [
    ["normal", 1],
    ["zigzag", t > 8 ? 0.4 : 0],
    ["fast", t > 15 ? 0.32 : 0],
    ["flaky", t > 22 ? 0.28 : 0],
    ["regression", t > 28 ? 0.22 : 0],
    ["heisen", t > (s.level === "hard" ? 20 : 35) ? 0.18 * d.heisen : 0],
  ];
  let r = s.rng() * w.reduce((a, [, x]) => a + x, 0);
  for (const [k, x] of w) {
    r -= x;
    if (r < 0) return k;
  }
  return "normal";
}

export function spawn(s: GameState, kind: BugKind = pickKind(s), p = 0): Bug {
  const r = s.rng;
  const { speed } = pace(s.elapsed, s.level);
  const zig = kind === "zigzag";
  const bug: Bug = {
    id: s.nextId++,
    kind,
    p,
    speed: speed * (kind === "fast" ? 1.65 : kind === "flaky" ? 0.85 : 1) * (0.9 + r() * 0.2),
    hp: kind === "flaky" ? 2 : 1,
    base: (r() * 2 - 1) * (zig ? 0.25 : 0.6),
    amp: zig ? 0.55 + r() * 0.2 : 0.12 + r() * 0.2,
    freq: zig ? 1.6 + r() * 0.6 : 0.5 + r() * 0.6,
    phase: r(),
    age: 0,
    relapsed: false,
  };
  s.bugs.push(bug);
  return bug;
}

export function spawnPower(s: GameState, kind?: PowerKind): Power {
  const r = s.rng;
  const kinds: PowerKind[] = ["unit", "review", "flag"];
  const power: Power = {
    id: s.nextId++,
    kind: kind ?? kinds[Math.floor(r() * 3) % 3],
    p: 0.35 + r() * 2.3,
    lat: r() * 1.4 - 0.7,
    ttl: POWER_TTL,
  };
  s.power = power;
  return power;
}

/** Remove a bug and score it. Shared by taps and Code review. */
function catchBug(s: GameState, b: Bug, auto: boolean): CatchEvent {
  s.bugs.splice(s.bugs.indexOf(b), 1);
  s.combo = s.comboTimer > 0 ? Math.min(COMBO_MAX, s.combo + 1) : 1;
  s.comboTimer = COMBO_WINDOW;
  const stage = stageOf(b.p);
  const points = pointsFor(b.p, s.combo);
  s.score += points;
  s.caught++;
  let respawn: Bug | null = null;
  if (b.kind === "regression" && !b.relapsed && stage >= 2) {
    respawn = spawn(s, "regression", 0);
    respawn.relapsed = true;
    respawn.speed = b.speed;
  }
  return { type: "catch", bug: b, stage, points, combo: s.combo, auto, respawn };
}

/** Advance the simulation by dt seconds. Returns what happened for the view. */
export function step(s: GameState, dt: number): StepEvent[] {
  const ev: StepEvent[] = [];
  if (s.over) return ev;
  s.elapsed += dt;
  const rel = Math.floor(s.elapsed / RELEASE_EVERY);
  if (rel > s.release) {
    s.release = rel;
    ev.push({ type: "release", index: rel, name: releaseName(rel) });
  }
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0 && s.combo > 1) {
      s.combo = 1;
      ev.push({ type: "combo-reset" });
    }
  }
  const fx = s.effects;
  // Integrate the active part of this frame before expiring Unit tests.
  const unitDt = Math.min(dt, fx.unit);
  fx.unit = Math.max(0, fx.unit - dt);
  if (s.power) {
    s.power.ttl -= dt;
    if (s.power.ttl <= 0) {
      ev.push({ type: "power-expire", power: s.power });
      s.power = null;
    }
  } else {
    s.powerTimer -= dt;
    if (s.powerTimer <= 0) {
      s.powerTimer = 14 + s.rng() * 8;
      ev.push({ type: "power-spawn", power: spawnPower(s) });
    }
  }
  s.spawnTimer -= dt;
  if (s.spawnTimer <= 0) {
    if (s.bugs.length < MAX_BUGS) spawn(s);
    s.spawnTimer += pace(s.elapsed, s.level).interval;
  }
  for (const b of [...s.bugs]) {
    b.age += dt;
    const prev = b.p;
    const slowDt = prev < 1 ? Math.min(unitDt, (1 - prev) / (b.speed * UNIT_SLOW)) : 0;
    b.p += b.speed * (slowDt * UNIT_SLOW + dt - slowDt);
    if (fx.review > 0 && prev < 1 && b.p >= 1) {
      fx.review--;
      ev.push(catchBug(s, b, true));
      continue;
    }
    if (b.p < PROD_AT) continue;
    s.bugs.splice(s.bugs.indexOf(b), 1);
    if (fx.flag > 0) {
      fx.flag--;
      ev.push({ type: "flagged", bug: b });
      continue;
    }
    s.incidents++;
    s.combo = 1;
    s.comboTimer = 0;
    ev.push({ type: "incident", bug: b, incidents: s.incidents });
    if (s.incidents >= s.maxIncidents) {
      s.over = true;
      ev.push({ type: "gameover", score: s.score });
      break;
    }
  }
  return ev;
}

/** Player taps bug `id`. Flaky bugs need two taps; invisible heisenbugs dodge. */
export function tap(s: GameState, id: number): TapResult {
  if (s.over) return null;
  const b = s.bugs.find((x) => x.id === id);
  if (!b || !isVisible(b)) return null;
  b.hp--;
  if (b.hp > 0) return { type: "armor", bug: b };
  return catchBug(s, b, false);
}

/** Player taps the power-up `id`. Returns the collected power or null. */
export function collect(s: GameState, id: number): Power | null {
  const pw = s.power;
  if (s.over || !pw || pw.id !== id) return null;
  s.power = null;
  if (pw.kind === "unit") s.effects.unit = UNIT_TIME;
  else if (pw.kind === "review") s.effects.review = REVIEW_CATCHES;
  else s.effects.flag = Math.min(2, s.effects.flag + 1);
  return pw;
}

export function statusText(s: GameState, lang: "es" | "en"): string {
  return `${lang === "es" ? "Incidentes" : "Incidents"} ${s.incidents}/${s.maxIncidents} · Combo x${s.combo}`;
}
