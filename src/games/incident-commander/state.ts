/** Pure rules for Incident Commander. No DOM, no three. Deterministic given rng. */

import type { Difficulty } from "../core/types";

export type Rng = () => number;
export type Outcome = "correct" | "partial" | "wrong" | "timeout";
export type Sev = 1 | 2 | 3;

export const RULES = {
  budget: 100,
  base: 100,
  timeBonus: 50,
  maxMult: 5,
  /** Reveal can be skipped once it has been on screen this long. */
  minReveal: 0.5,
} as const;

export interface DiffCfg {
  /** First countdown (s); shrinks by timeStep per answer down to timeFloor. */
  timeStart: number;
  timeFloor: number;
  timeStep: number;
  /** Error budget burned on wrong/timeout and on a partial fix (before severity). */
  burnWrong: number;
  burnPartial: number;
  winAt: number;
  /** Seconds the explanation stays on screen. */
  reveal: number;
  /** Deal weight for SEV1, SEV2, SEV3 (higher = earlier in the deck). */
  sevWeight: [number, number, number];
  /** Score factor. */
  points: number;
}

export const DIFFICULTY: Record<Difficulty, DiffCfg> = {
  easy: {
    timeStart: 11,
    timeFloor: 7,
    timeStep: 0.2,
    burnWrong: 18,
    burnPartial: 7,
    winAt: 12,
    reveal: 4,
    sevWeight: [0.6, 1, 1.5],
    points: 0.75,
  },
  normal: {
    timeStart: 8,
    timeFloor: 4.5,
    timeStep: 0.25,
    burnWrong: 25,
    burnPartial: 10,
    winAt: 15,
    reveal: 3.4,
    sevWeight: [1, 1, 1],
    points: 1,
  },
  hard: {
    timeStart: 5,
    timeFloor: 3.5,
    timeStep: 0.1,
    burnWrong: 30,
    burnPartial: 12,
    winAt: 20,
    reveal: 3,
    sevWeight: [3, 1.4, 0.7],
    points: 1.5,
  },
};

/** Severity scales the burn and the reward. */
export const SEV: Record<Sev, { burn: number; pts: number }> = {
  1: { burn: 1.4, pts: 1.5 },
  2: { burn: 1, pts: 1.2 },
  3: { burn: 0.8, pts: 1 },
};

export const timeLimit = (c: DiffCfg, answered: number) => Math.max(c.timeFloor, c.timeStart - answered * c.timeStep);
export const multiplier = (streak: number) => Math.max(1, Math.min(RULES.maxMult, streak));
export const burnFor = (c: DiffCfg, sev: Sev, partial: boolean) =>
  Math.round((partial ? c.burnPartial : c.burnWrong) * SEV[sev].burn);

export interface Question {
  id: string;
  correct: number;
  partial?: number;
  sev: Sev;
  next?: { ok: string; miss: string };
  step2?: true;
}

export interface RunState {
  phase: "ask" | "reveal" | "over" | "won";
  cfg: DiffCfg;
  qs: readonly Question[];
  budget: number;
  score: number;
  streak: number;
  resolved: number;
  answered: number;
  /** Shuffled indices of first-step questions. */
  deck: number[];
  pos: number;
  /** Index into qs of the question on screen. */
  cur: number;
  /** 1 for a normal/first step, 2 for a follow-up. */
  step: 1 | 2;
  /** order[displaySlot] = original option index. */
  order: number[];
  limit: number;
  timeLeft: number;
  revealLeft: number;
  last: { outcome: Outcome; slot: number; points: number; burn: number } | null;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted shuffle (Efraimidis–Spirakis): higher sevWeight surfaces earlier. Follow-ups are excluded. */
export function buildDeck(qs: readonly Question[], c: DiffCfg, rng: Rng): number[] {
  return qs
    .map((q, i) => ({ i, q, k: rng() ** (1 / c.sevWeight[q.sev - 1]) }))
    .filter((x) => !x.q.step2)
    .sort((a, b) => b.k - a.k)
    .map((x) => x.i);
}

export function createRun(qs: readonly Question[], difficulty: Difficulty, rng: Rng): RunState {
  const cfg = DIFFICULTY[difficulty];
  const deck = buildDeck(qs, cfg, rng);
  const s: RunState = {
    phase: "ask",
    cfg,
    qs,
    budget: RULES.budget,
    score: 0,
    streak: 0,
    resolved: 0,
    answered: 0,
    deck,
    pos: 0,
    cur: deck[0],
    step: 1,
    order: shuffle([0, 1, 2, 3], rng),
    limit: timeLimit(cfg, 0),
    timeLeft: timeLimit(cfg, 0),
    revealLeft: 0,
    last: null,
  };
  return s;
}

export const current = (s: RunState) => s.qs[s.cur];

/** Answer with a displayed slot (0-3), or -1 for timeout. */
export function answer(s: RunState, slot: number): RunState["last"] {
  if (s.phase !== "ask") return null;
  const q = current(s);
  const pick = slot < 0 ? -1 : s.order[slot];
  const outcome: Outcome =
    slot < 0 ? "timeout" : pick === q.correct ? "correct" : pick === q.partial ? "partial" : "wrong";
  const raw = RULES.base + (RULES.timeBonus * Math.max(0, s.timeLeft)) / s.limit;
  const k = SEV[q.sev].pts * s.cfg.points;
  let points = 0;
  let burn = 0;
  if (outcome === "correct") {
    s.streak++;
    points = Math.round(raw * multiplier(s.streak) * k);
    s.resolved++;
  } else {
    s.streak = 0;
    if (outcome === "partial") points = Math.round((raw / 2) * k);
    burn = burnFor(s.cfg, q.sev, outcome === "partial");
    s.budget = Math.max(0, s.budget - burn);
  }
  s.score += points;
  s.answered++;
  s.last = { outcome, slot, points, burn };
  s.phase = "reveal";
  s.revealLeft = s.cfg.reveal;
  return s.last;
}

/** Display slot holding an original option index. */
export const slotOf = (s: RunState, original: number) => s.order.indexOf(original);

/** Player asks to move on from the explanation (after a short guard). */
export function skipReveal(s: RunState): boolean {
  if (s.phase !== "reveal" || s.cfg.reveal - s.revealLeft < RULES.minReveal) return false;
  s.revealLeft = 0;
  return true;
}

/** Picks the next question: the follow-up of a multi-step incident, else the next deck card. */
function advance(s: RunState, rng: Rng) {
  const q = current(s);
  if (q.next && s.step === 1) {
    const id = s.last?.outcome === "correct" ? q.next.ok : q.next.miss;
    const next = s.qs.findIndex((x) => x.id === id);
    if (next >= 0) {
      s.cur = next;
      s.step = 2;
      return;
    }
  }
  s.step = 1;
  const left = s.cfg.winAt - s.answered;
  // Do not open a two-step incident when only one question remains.
  for (let guard = 0; guard <= s.deck.length; guard++) {
    s.pos++;
    if (s.pos >= s.deck.length) {
      s.deck = buildDeck(s.qs, s.cfg, rng);
      s.pos = 0;
    }
    if (left > 1 || !s.qs[s.deck[s.pos]].next) break;
  }
  s.cur = s.deck[s.pos];
}

export type TickEvent = "timeout" | "next" | "gameover" | "win" | null;

/** Advances timers. Budget exhaustion beats the win check on the same answer. */
export function tick(s: RunState, dt: number, rng: Rng): TickEvent {
  if (s.phase === "ask") {
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft <= 0) {
      answer(s, -1);
      return "timeout";
    }
    return null;
  }
  if (s.phase !== "reveal") return null;
  s.revealLeft -= dt;
  if (s.revealLeft > 0) return null;
  if (s.budget <= 0) {
    s.phase = "over";
    return "gameover";
  }
  if (s.answered >= s.cfg.winAt) {
    s.phase = "won";
    return "win";
  }
  advance(s, rng);
  s.order = shuffle([0, 1, 2, 3], rng);
  s.limit = timeLimit(s.cfg, s.answered);
  s.timeLeft = s.limit;
  s.phase = "ask";
  return "next";
}

export function statusText(s: RunState, lang: "es" | "en"): string {
  return `Error budget ${s.budget}% · ${lang === "es" ? "Racha" : "Streak"} x${multiplier(s.streak)}`;
}
