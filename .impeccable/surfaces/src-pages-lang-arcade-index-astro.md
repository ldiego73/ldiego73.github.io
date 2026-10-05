---
version: 1
slug: "src-pages-lang-arcade-index-astro"
primary_target: "src/pages/[lang]/arcade/index.astro"
related_targets: ["src/pages/[lang]/arcade/[game].astro"]
---

# Surface brief: /[lang]/arcade/ (Neon Cabinet lobby) and /[lang]/arcade/<slug>/

Mode: Experience. Job: pick a game in seconds and feel the craft. Each game page is a single neon cabinet.

## Direction contract

THESIS: A late-night arcade hall: a curved row of nine neon cabinets in a dark room with a reflective floor, each cabinet's screen running its attract mode. Refuses the list-of-cards game index.

OWN-WORLD: Neon Cabinet palette (src/games/core/neon.ts): void #07060d, floor #0f0d1c, grid #2a2350, ink #f2efff, cyan, magenta, lime, amber, red, violet. Tektur (arcade marquees), JetBrains Mono (HUD, scores). Bloom, scanlines, glass glare. Cabinets are dark bodies with neon trims in the game's color.

STORY: Enter the hall → camera glides along the row → hover/focus a cabinet to lift it and show title, tagline, best score → click/Enter to play. A high-score marquee board and an achievements wall live in the room (also as accessible HTML below the canvas).

FIRST VIEWPORT: The hall with all nine cabinets lit, title "ARCADE" in neon on the back wall, the leaderboard marquee.

SIGNATURE: Cabinet focus: the chosen cabinet slides forward, its screen brightens and the floor reflection follows.

GUARDRAILS: Full HTML fallback list (keyboard and screen readers) of all games with links; WebGL scene is progressive enhancement. Mobile: horizontal swipe carousel of cabinets. No external assets. Same palette and fonts inside every game.
