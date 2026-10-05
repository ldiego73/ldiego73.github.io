import type { Difficulty } from "./types";

/** Pure music-intensity model for the cabinet shell. No DOM, no audio. */

export const START: Record<Difficulty, number> = { easy: 0.12, normal: 0.2, hard: 0.3 };
export const TARGET = 0.8;
export const CAP = 0.9;
/** Seconds of play to go from START to TARGET. */
export const RAMP_S = 180;
/** Intensity added per score increase event (stacks while events are frequent). */
export const BUMP_PER_EVENT = 0.05;
export const BUMP_MAX = 0.2;
/** Bump decay time constant (s). */
export const BUMP_TAU = 3;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Smooth rise (smoothstep) from the starting intensity to ~0.8 over RAMP_S seconds of play. */
export function baseline(elapsed: number, difficulty: Difficulty): number {
  const x = Math.min(1, Math.max(0, elapsed / RAMP_S));
  const s = x * x * (3 - 2 * x);
  const a = START[difficulty];
  return a + (TARGET - a) * s;
}

/** Final value: baseline + decaying score bump, capped; a game override can only raise it. */
export function intensityOf(elapsed: number, difficulty: Difficulty, bump: number, game: number | null): number {
  const base = Math.min(CAP, baseline(elapsed, difficulty) + Math.min(BUMP_MAX, Math.max(0, bump)));
  return Math.min(CAP, Math.max(base, game === null ? 0 : clamp01(game)));
}

export interface IntensityTracker {
  /** Advance play time. Call only while the game is actually running (pause/overlay: do not call). */
  tick(dt: number): void;
  /** Report the current score; increases add a bump. */
  score(value: number): void;
  /** Game override (0..1) from an `intensity` event. */
  game(value: number): void;
  reset(difficulty: Difficulty): void;
  readonly value: number;
}

export function createIntensity(difficulty: Difficulty = "normal"): IntensityTracker {
  let diff = difficulty;
  let elapsed = 0;
  let bump = 0;
  let last = 0;
  let over: number | null = null;
  return {
    tick(dt) {
      if (!(dt > 0)) return;
      elapsed += dt;
      bump *= Math.exp(-dt / BUMP_TAU);
    },
    score(v) {
      if (v > last) bump = Math.min(BUMP_MAX, bump + BUMP_PER_EVENT);
      last = v;
    },
    game(v) {
      over = clamp01(v);
    },
    reset(d) {
      diff = d;
      elapsed = 0;
      bump = 0;
      last = 0;
      over = null;
    },
    get value() {
      return intensityOf(elapsed, diff, bump, over);
    },
  };
}
