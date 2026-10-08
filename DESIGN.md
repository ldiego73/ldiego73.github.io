---
name: ldiego73 · Khipu
description: A career told as an Andean khipu: cords per company, subsidiary cords per stage, knots for shipped work.
colors:
  bg: "#13151b"
  bg-deep: "#0e1015"
  surface: "#1b1e26"
  line: "#2c303b"
  fg: "#ece8e0"
  muted: "#a19e95"
  red: "#d0444b"
  indigo: "#6b7fdc"
  ochre: "#dda63c"
  turq: "#38b8a7"
  alpaca: "#a8825f"
  cotton: "#e6e0d3"
  accent: "#c4383f"
  on-accent: "#fff6f2"
  light-bg: "#eef0f3"
  light-surface: "#ffffff"
  light-fg: "#16181e"
  light-red: "#b0262e"
  light-indigo: "#3446a6"
  light-ochre: "#9a6a0c"
  light-turq: "#12776b"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, sans-serif"
    fontSize: "clamp(2.8rem, 1.8rem + 4.6vw, 5.6rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1rem, 0.97rem + 0.15vw, 1.08rem)"
    fontWeight: 400
    lineHeight: 1.65
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
spacing:
  1: "0.5rem"
  2: "1rem"
  3: "1.5rem"
  4: "2.5rem"
  5: "4rem"
  6: "clamp(4rem, 3rem + 5vw, 8rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "15px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "15px 20px"
  cabinet:
    backgroundColor: "{colors.bg-deep}"
    rounded: "{rounded.md}"
---

# Design

## Overview

The site is a khipu, the Andean record-keeping system of cords and knots. One pendant cord per company, a subsidiary cord per stage inside a company, single knots for shipped work, long knots for numbers (turns = digit), and top cords for artifacts that span companies. The cords are the only ornament; everything else is type, hairlines and space. Dark-first (charcoal-indigo ground), with a cool salt-white light theme.

Three WebGL moments carry the world: the hero khipu (rope physics), the artifacts khipu (top cords tie the stages where an artifact appeared) and "Del ruido a la señal" (a point cloud resolving into a torus knot, rendered as glyphs on a phosphor screen). The arcade cabinets reuse the dye palette.

## Colors

Natural-dye roles, never decorative:

- **red** (cochineal): cloud/infra stages and the primary action. `accent` is its button shade.
- **indigo**: architecture stages and structure.
- **ochre**: leadership stages, metrics and rewards.
- **turq**: AI/data and success states.
- **alpaca**: mobile and early career.
- **cotton**: the primary cord and neutral material.

Components set `--dye` from a stage or artifact (`.dye-red`, `.dye-indigo` …) and color their cord, knots and titles from it. The phosphor screen in the AI chapter is the one fixed-color object (amber on near-black) in both themes.

## Typography

- **Display:** Archivo variable, condensed via `font-stretch` 62–82%, weight 800, uppercase, balanced. Wide stretch (125%) only for the wordmark.
- **Body:** Hanken Grotesk, 65–68ch measure.
- **Data:** JetBrains Mono for dates, periods, counts, stacks and code. Never as a "technical" costume for prose.
- Fonts are self-hosted through Astro's font API (the `wdth` axis is requested explicitly).

## Layout

Max width 1240px with a fluid gutter (`clamp(16px, 4vw, 40px)`). Sections breathe with `--space-6`. Chapters use a three-column grid (cord, company, stages) that collapses to cord + content under 900px. Lists are rows separated by hairlines, not card grids. Every page works at 390px with no horizontal scroll (checked by the e2e suite).

## Elevation & Depth

Flat surfaces separated by 1px `--line` hairlines. Depth comes from the 3D scenes only. Tooltips and toasts are the exception: surface + border + one soft shadow.

## Shapes

Radii 4px for controls, 6px for cabinets and the phosphor screen. Round beads (knots) are the recurring shape; long knots are stacked flattened beads.

## Components

- **Hero khipu stage:** canvas + HTML tags (company, year) + tooltip. Vertical tags under 560px.
- **Chapter:** cord stripe in the company dye, company name, stages with role (dye), period (mono), summary, knot list and a large metric when a long knot exists.
- **Artifacts:** tablist of artifacts → top cord on the khipu + use timeline.
- **Cabinet (arcade):** HUD (score, best, status), 4:3 screen (3:4 on phones), overlay with one primary action, achievement toasts. Games follow `src/games/README.md`.
- **Buttons:** primary (accent fill) and secondary (hairline). One primary per region.

## Arcade and 3D world

- **Block Arcade (arcade):** its own fixed-dark room, independent of the site theme. Voxel, Minecraft-like games built from cubes with few colors: palette roles in `src/games/core/neon.ts` (void, floor, grid, ink, dim, cyan, magenta, lime, amber, red, violet; at most ~4 per game), matte flat-shaded materials, no bloom, glow or scanlines. Silkscreen pixel font for marquees and score pop-ups, JetBrains Mono for the HUD. Player = cyan, one hazard (red), one reward (lime or amber). Rules in `src/games/README.md`.
- **KHIPU worlds (3D):** a warm, handmade Andean diorama: flat toon colors with a 3-step ramp and dark ink outlines (Messenger-like), khipu dyes as accents on cords and textiles, paper/cloth UI cards with ink borders. The mountain (Qhapaq Ñan) and the jungle (Antisuyu) share this language; the jungle swaps andesite and ichu for laterite earth, deep greens and a brown river. Direction contract in `.impeccable/surfaces/src-pages-lang-world-astro.md`.

## Do's and Don'ts

- Do derive every claim from Resume.pdf or the career data; label nothing invented.
- Do keep content complete without WebGL; 3D adds, never gates.
- Do respect `prefers-reduced-motion` (frozen physics, no autoplay denoise, no shakes).
- Don't add eyebrows above headings, emoji icons, gradient text or card grids as structure.
- Don't hard-code colors in components or games; read the tokens (`readPalette()` in scripts).
