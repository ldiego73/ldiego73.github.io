/**
 * Arcade game contract. Every game in src/games/<slug>/ default-exports a GameModule.
 * The arcade shell (src/games/core/shell.ts) owns the HUD, overlays, pause on blur,
 * the leaderboard and achievements. Games own their canvas, controls and rules.
 */

import type { NEON } from "./neon";

export type Lang = "es" | "en";

/** Fixed Neon Cabinet palette (see core/neon.ts). Theme-independent. */
export type Palette = Record<keyof typeof NEON, string>;

export type Difficulty = "easy" | "normal" | "hard";

export type GameEvent =
  /** Current score changed (shell updates the HUD and aria-live region). */
  | { type: "score"; value: number }
  /** Run ended without winning. Shell shows the game-over overlay. */
  | { type: "gameover"; score: number }
  /** Run ended with a win. Shell shows the win overlay. */
  | { type: "win"; score: number }
  /** Cumulative stat used by achievement rules, e.g. { key: "bugs", inc: 1 }. */
  | { type: "stat"; key: string; inc: number }
  /** Short status line for the HUD, e.g. "Wave 3" or "Uptime 99.98%". */
  | { type: "status"; text: string };

export interface GameContext {
  lang: Lang;
  reducedMotion: boolean;
  /** The Neon Cabinet palette (fixed; same in light and dark site themes). */
  palette: () => Palette;
  emit: (event: GameEvent) => void;
}

export interface GameInstance {
  /**
   * Begin a fresh run at the chosen difficulty (called after Start or Restart).
   * Difficulty must change something the player feels: speed, enemy count, timer, AI, lives.
   */
  start(difficulty: Difficulty): void;
  pause(): void;
  resume(): void;
  /** Free GPU resources, listeners and timers. */
  destroy(): void;
  /** Optional: site theme changed. The arcade palette is fixed, so most games ignore this. */
  onThemeChange?(): void;
}

export interface GameModule {
  mount(el: HTMLElement, ctx: GameContext): GameInstance;
}

/** Achievement rules are declarative and evaluated centrally by the store. */
export type AchievementRule =
  | { kind: "stat"; game: string; key: string; gte: number }
  | { kind: "plays"; game: string; gte: number }
  | { kind: "wins"; game: string; gte: number }
  | { kind: "best"; game: string; gte: number }
  | { kind: "losses-total"; gte: number }
  | { kind: "played-all" };

export interface Achievement {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  rule: AchievementRule;
}

export interface GameMeta {
  slug: string;
  /** Short arcade marquee name, uppercase-friendly (<= 14 chars). */
  marquee: string;
  title: Record<Lang, string>;
  tagline: Record<Lang, string>;
  /** How to play, one short paragraph. */
  howTo: Record<Lang, string>;
  /** Controls as short lines, e.g. ["Flechas / WASD: mover", "Swipe: mover"]. */
  controls: Record<Lang, string[]>;
  kind: "classic" | "original";
  /** Neon role used for the cabinet marquee and accents. */
  neon: "cyan" | "magenta" | "lime" | "amber" | "red" | "violet";
  load: () => Promise<{ default: GameModule }>;
}
