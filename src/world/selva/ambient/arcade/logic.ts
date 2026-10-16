/**
 * Pure data for the floating arcade (balsa raft): which games stand on its cabinets and their trim colors
 * (same palette as the mountain's arcade tambo), and the raft's plan in the station frame (pond, raft deck,
 * boardwalk, the cabinet arc), shared by the station (../arcade.ts) and the players on the raft
 * (../comunidad/raft.ts). No DOM, no three.js.
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

// ---------------------------------------------------------------- plan (station frame, local +Z = the road)

/** Pond centre/radius (local). */
export const POND = { x: 0, z: -11.6, r: 6.4 } as const;
/** The raft rectangle and its deck height above the station origin; the pond's water height. */
export const RAFT = { x0: -4.3, x1: 4.3, z0: -12.6, z1: -6.9 } as const;
export const RAFT_TOP = 0.12;
export const WATER = 0.06;
/** Cabinet row (z of the arc's middle). */
export const CAB_Z = -11.5;
/** Boardwalk from the plaza (overlapping its rim) to the raft: half width, plaza end, where its rails start. */
export const WALK = { hw: 1.2, z1: -4.5, rail0: -5.3 } as const;

/**
 * Cabinet i of n in a shallow arc on the raft, facing the gangplank: local position and yaw (the cabinet's
 * front faces local (sin yaw, cos yaw)). The outer cabinets sit a little forward and turn inward.
 */
export function cabPose(i: number, n: number): { x: number; z: number; yaw: number } {
  const u = n > 1 ? i / (n - 1) - 0.5 : 0;
  return { x: u * 6.6, z: CAB_Z + u * u * 1.6, yaw: -u * 0.55 };
}
