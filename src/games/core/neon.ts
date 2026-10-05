/**
 * Block Arcade palette (voxel, Minecraft-like): few colors, flat and matte.
 * Theme-independent: the arcade always reads as a dark room with blocky games.
 * Role names are kept from the earlier neon kit so every game shares one vocabulary.
 *
 * Roles:
 *  void    clear color / background (night stone)
 *  floor   playfield blocks
 *  grid    block seams, walls at rest
 *  ink     text and bright neutral (bone)
 *  dim     secondary text, disabled
 *  cyan    player / primary interactive (diamond)
 *  magenta enemies (only one hazard hue per game; prefer red)
 *  lime    pickups / success (grass)
 *  amber   reward, timers, gold
 *  red     damage, danger (redstone)
 *  violet  structure / secondary (amethyst), use sparingly
 */
export const NEON = {
  void: "#16171d",
  floor: "#2a2c35",
  grid: "#3c3f4b",
  ink: "#efe9da",
  dim: "#9b97a3",
  cyan: "#56b6c9",
  magenta: "#c45a8a",
  lime: "#7fb24a",
  amber: "#e2a83c",
  red: "#c94a3d",
  violet: "#7d68b3",
} as const;

/** Alias with the current name of the style. */
export const BLOCK = NEON;

export type NeonRole = keyof typeof NEON;

/** Default bloom settings tuned for NEON on a dark void (UnrealBloomPass). */
/** Bloom is off by default in the block style; games may opt in for one tiny accent. */
export const BLOOM = { strength: 0.25, radius: 0.3, threshold: 0.9 } as const;

/** Arcade typography (CSS custom properties set by the site; harness loads them from Google Fonts). */
export const ARCADE_FONT = 'var(--font-arcade, "Silkscreen"), "Arial Narrow", sans-serif';
export const HUD_FONT = 'var(--font-mono, "JetBrains Mono"), ui-monospace, monospace';

/** Emissive material helper values: bright neon edges read best with emissiveIntensity 1.2–2.5 under bloom. */
export const EMISSIVE = { soft: 0.2, normal: 0.5, hot: 1 } as const;
