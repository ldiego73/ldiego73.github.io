import type { Achievement, AchievementRule } from "./types";

export interface GameRecord {
  plays: number;
  wins: number;
  losses: number;
  best: number;
  stats: Record<string, number>;
}

/** Cabinet skins: "neon" is the default; "aguayo" is the reward for completing the world passport. */
export type CabinetSkin = "neon" | "aguayo";
export const SKINS: readonly CabinetSkin[] = ["neon", "aguayo"];

export interface ArcadeState {
  games: Record<string, GameRecord>;
  unlocked: Record<string, number>;
  /** Selected cabinet skin (optional: older saves have none and read as "neon"). */
  skin?: CabinetSkin;
}

const KEY = "ldiego73-arcade-v1";

export const emptyState = (): ArcadeState => ({ games: {}, unlocked: {} });

export const emptyRecord = (): GameRecord => ({ plays: 0, wins: 0, losses: 0, best: 0, stats: {} });

/** Storage can be missing or throw (private mode, blocked site data): never fail the game. */
export function load(): ArcadeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as ArcadeState;
    const out: ArcadeState = { games: parsed.games ?? {}, unlocked: parsed.unlocked ?? {} };
    if (SKINS.includes(parsed.skin as CabinetSkin)) out.skin = parsed.skin;
    return out;
  } catch {
    return emptyState();
  }
}

export function save(state: ArcadeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: progress lives for this page view only */
  }
}

const rec = (s: ArcadeState, game: string) => {
  s.games[game] ??= emptyRecord();
  return s.games[game];
};

export function recordStart(s: ArcadeState, game: string): void {
  rec(s, game).plays += 1;
}

export function recordEnd(s: ArcadeState, game: string, score: number, won: boolean): { newBest: boolean } {
  const r = rec(s, game);
  if (won) r.wins += 1;
  else r.losses += 1;
  const newBest = score > r.best;
  if (newBest) r.best = score;
  return { newBest };
}

export function recordStat(s: ArcadeState, game: string, key: string, inc: number): void {
  const r = rec(s, game);
  r.stats[key] = (r.stats[key] ?? 0) + inc;
}

export function ruleMet(s: ArcadeState, rule: AchievementRule, allGames: string[]): boolean {
  switch (rule.kind) {
    case "stat":
      return (s.games[rule.game]?.stats[rule.key] ?? 0) >= rule.gte;
    case "plays":
      return (s.games[rule.game]?.plays ?? 0) >= rule.gte;
    case "wins":
      return (s.games[rule.game]?.wins ?? 0) >= rule.gte;
    case "best":
      return (s.games[rule.game]?.best ?? 0) >= rule.gte;
    case "losses-total":
      return Object.values(s.games).reduce((n, g) => n + g.losses, 0) >= rule.gte;
    case "played-all":
      return allGames.every((g) => (s.games[g]?.plays ?? 0) > 0);
  }
}

/** Unlocks every newly satisfied achievement and returns them. */
export function evaluate(s: ArcadeState, achievements: Achievement[], allGames: string[]): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of achievements) {
    if (s.unlocked[a.id]) continue;
    if (ruleMet(s, a.rule, allGames)) {
      s.unlocked[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}

/** Leaderboard rows: best score per game, highest first. */
export function leaderboard(s: ArcadeState, games: string[]): Array<{ game: string; best: number }> {
  return games.map((game) => ({ game, best: s.games[game]?.best ?? 0 })).sort((a, b) => b.best - a.best);
}

// ---------------------------------------------------------------- cross rewards (world ↔ arcade)

/** Arcade achievement granted by completing the world passport (Qhapaq Ñan). */
export const WALKER_ID = "qhapaq-nan-walker";
/** Pseudo game record that carries world progress into the arcade rules ({ kind: "stat", game: "world" }). */
export const WORLD_GAME = "world";
/** Arcade achievements (not counting the walker) that unlock the golden-thread chullo in the world. */
export const CHULLO_AT = 6;

/** Marks the world passport as complete (idempotent). Returns true when it changed the state. */
export function grantWorldPassport(s: ArcadeState): boolean {
  const r = rec(s, WORLD_GAME);
  if ((r.stats.passport ?? 0) >= 1) return false;
  r.stats.passport = 1;
  return true;
}

/** Unlocked arcade achievements that count toward the world reward (the walker itself doesn't). */
export function arcadeUnlockedCount(s: ArcadeState, ids: readonly string[]): number {
  return ids.filter((id) => id !== WALKER_ID && s.unlocked[id]).length;
}

export const chulloUnlocked = (s: ArcadeState, ids: readonly string[]) => arcadeUnlockedCount(s, ids) >= CHULLO_AT;

export const skinUnlocked = (s: ArcadeState) => !!s.unlocked[WALKER_ID];

/** The skin the cabinets wear: the saved choice, but only once it's unlocked. */
export const activeSkin = (s: ArcadeState): CabinetSkin => (skinUnlocked(s) && s.skin === "aguayo" ? "aguayo" : "neon");

export function setSkin(s: ArcadeState, skin: CabinetSkin): void {
  if (skin === "neon") delete s.skin;
  else if (skinUnlocked(s)) s.skin = skin;
}
