---
version: 1
slug: "src-pages-lang-arcade-index-astro"
primary_target: "src/pages/[lang]/arcade/index.astro"
related_targets: ["src/pages/[lang]/arcade/[game].astro"]
---

# Surface brief: /[lang]/arcade/ (Block Arcade lobby) and /[lang]/arcade/<slug>/

Mode: Experience. Job: pick a game in seconds and feel the craft. Each game page is a single cabinet.

## Direction contract

THESIS: A cozy arcade hall: a curved row of nine boxy cabinets in a room of matte blocks, each cabinet's screen running its attract mode. Refuses the list-of-cards game index.

OWN-WORLD: Block Arcade palette (src/games/core/neon.ts, name kept from the earlier neon kit): void #16171d, floor #2a2c35, grid #3c3f4b, ink #efe9da, plus cyan, magenta, lime, amber, red, violet as roles (at most ~4 per game). Silkscreen pixel font (marquees, score pop-ups), JetBrains Mono (HUD, scores). Matte, flat-shaded voxel look: no bloom, glow or scanlines. Cabinets are boxy bodies trimmed in the game's color; a completed world passport unlocks the woven aguayo skin.

STORY: Enter the hall → camera glides along the row → hover/focus a cabinet to lift it and show title, tagline, best score → click/Enter to play. A high-score marquee board and an achievements wall live in the room (also as accessible HTML below the canvas).

FIRST VIEWPORT: The hall with all nine cabinets lit, the "ARCADE" sign on the back wall, the leaderboard marquee.

SIGNATURE: Cabinet focus: the chosen cabinet slides forward, its screen brightens and the floor reflection follows.

GUARDRAILS: Full HTML fallback list (keyboard and screen readers) of all games with links; WebGL scene is progressive enhancement. Mobile: horizontal swipe carousel of cabinets. No external assets. Same palette and fonts inside every game.
