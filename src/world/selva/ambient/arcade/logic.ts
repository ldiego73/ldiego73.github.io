/**
 * Pure data for the floating arcade (balsa raft): which games stand on its cabinets and their trim colors
 * (same palette as the mountain's arcade tambo). No DOM, no three.js.
 */
import type { GameMeta } from "../../../../games/core/types";

/** Five cabinets fit under the raft's roof: every other game of the catalog, so the selection is varied. */
export const RAFT_CABINETS = 5;

export function raftGames(games: ReadonlyArray<GameMeta>, n = RAFT_CABINETS): GameMeta[] {
  if (games.length <= n) return [...games];
  const out: GameMeta[] = [];
  const step = (games.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(games[Math.round(i * step)] as GameMeta);
  return out;
}

/** Cabinet trim per neon (the mountain tambo's palette: dyes instead of neon). */
export const CAB_COLOR: Record<string, string> = {
  lime: "#7fae6a",
  amber: "#dda63c",
  violet: "#6b5aa8",
  cyan: "#2a9d8f",
  magenta: "#c2557f",
  red: "#c4383f",
};
export const cabColor = (neon: string) => CAB_COLOR[neon] ?? "#dda63c";

/** Site path of a game's own page (fallback when the in-world overlay cannot load). */
export const gameHref = (lang: "es" | "en", slug: string) => `/${lang}/arcade/${slug}/`;
