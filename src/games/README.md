# Arcade: game authoring guide

Every game lives in `src/games/<slug>/` and default-exports a `GameModule` (see `core/types.ts`).
The cabinet shell (`core/shell.ts`) owns the HUD, Start/Pause/Restart overlays, pause on blur,
leaderboard, achievements and the aria-live score. A game only owns its canvas, controls and rules.

## Hard rules

- Write only inside `src/games/<slug>/`. Never edit `core/`, `registry.ts`, `package.json`, `bun.lock`,
  or another game's folder. No new dependencies: `three` (r186) is the only library.
- Never run `astro build`, `astro dev` or `bun install`. Use the harness (below), `bun test src/games/<slug>`
  and `bunx tsc --noEmit -p .` (ignore errors outside your folder; yours must be zero).
- Split pure rules from rendering: `state.ts` (no DOM, no three; deterministic with an injectable RNG)
  with `state.test.ts` (bun:test), and `view.ts` (Three.js). `index.ts` wires them into `mount()`.
- No external assets (no image, font or audio fetches). Geometry, materials and canvas textures only.
  Text inside the 3D scene: draw to a CanvasTexture or use DOM elements positioned over the canvas.
- Budget: the game's own code under ~25 KB minified. Keep draw calls modest (instancing for many objects).

## Contract

```ts
mount(el, ctx) => { start, pause, resume, destroy, onThemeChange }
```

- `mount` builds the scene and renders an idle "attract mode" frame (the shell shows its overlay on top).
  Do not start gameplay until `start(difficulty)`. `start()` must fully reset state (it is also "restart").
- `difficulty` is `"easy" | "normal" | "hard"`. It must change things the player feels (speed, enemy count and AI,
  timers, lives, spawn rates, board size). Put the numbers in one `DIFFICULTY` table in `state.ts` and test each level.
- `ctx.emit({ type: "score", value })` whenever the score changes.
- `ctx.emit({ type: "status", text })` for a short HUD line (wave, lives, uptime). Localize with `ctx.lang`.
- `ctx.emit({ type: "stat", key, inc })` for achievement stats (keys listed in your task).
- End a run with exactly one `ctx.emit({ type: "gameover", score })` or `ctx.emit({ type: "win", score })`.
- `pause()/resume()` stop and restart the loop and timers. `destroy()` frees everything (`stage.dispose()`,
  listeners, intervals).
- `ctx.palette()` returns the fixed Neon Cabinet palette (`core/neon.ts`). The arcade does not follow the site's
  light/dark theme: a CRT is always dark. `onThemeChange` is optional and usually omitted.

## Toolkit

- `core/stage.ts`: `createStage(el, { camera: "ortho" | "persp", viewHeight, bloom })` gives renderer (ACES tone
  mapping, void clear color), scene, camera, resize, neon bloom post-processing (on by default; `stage.bloomPass`
  to pulse it), `loop((dt, t) => ...)`, `pause/resume`, `dispose`. `addLights(scene)` is the neon light rig.
- `core/input.ts`: `onDirection(el, cb)` for arrows/WASD + swipe; `heldKeys(el)` for continuous input.
  Keyboard listeners go on `el` or its parent `.cab-screen` (the shell focuses `.cab-screen`;
  use `el.closest(".cab-screen")` for key events). Touch: pointer events on the canvas, `touch-action: none`.
- `core/neon.ts`: `NEON` roles (`void, floor, grid, ink, dim, cyan, magenta, lime, amber, red, violet`), `BLOOM`,
  `EMISSIVE` intensities, `ARCADE_FONT` / `HUD_FONT` for DOM or CanvasTexture text. Never hard-code other colors.

## Visual language: Block Arcade (voxel, Minecraft-like)

The owner wants the arcade simple and calm: a blocky, Minecraft-like look with FEW colors, so the games
showcase the work (infra concepts) instead of effects. Replaces the earlier neon look completely.

- **Geometry:** everything is built from cubes on a grid (voxels): `BoxGeometry` blocks, instanced when many.
  Characters are blocky (bug = a few cubes with cube legs; pod = a crate; packet = a small cube; player = a
  blocky robot/miner). No spheres/tubes/capsules unless made of cubes. Hard edges, no bevels.
- **Materials:** `MeshLambertMaterial` or `MeshStandardMaterial` with `flatShading`, roughness 1. Optional
  tiny pixel textures (CanvasTexture 8×8 or 16×16, `NearestFilter`, `generateMipmaps = false`) for grass/stone/
  crate faces. No emissive glow, no bloom (stage bloom is off by default), no scanlines, no glow halos.
- **Palette:** `NEON`/`BLOCK` in `core/neon.ts` (void, floor, grid, ink, dim, cyan, magenta, lime, amber, red,
  violet). Use at most ~4 roles per game: background/floor neutrals + player (cyan) + one hazard (red) + one
  reward (lime or amber). Never add colors outside the palette.
- **Light:** `addLights(scene)` (warm sun + sky fill). Simple soft shadows are OK if cheap; otherwise none.
- **Camera:** a clean 3/4 or top-down view of a blocky board; readable at 390 px.
- **Juice (subtle):** block-break particles (small cubes), short hit-stop, small screen shake, step-based
  animations (Minecraft-like bob). Score pop-ups in `ARCADE_FONT` (Silkscreen, pixel font). All of it off
  or reduced with `ctx.reducedMotion`.
- **Text in scene:** `ARCADE_FONT` / `HUD_FONT` on CanvasTexture (NearestFilter) or DOM over the canvas.
- **Mobile:** blocky on-screen controls (square buttons with a dark edge) only on coarse pointers.

Three.js references (read the relevant ones before writing view code): `~/.agents/skills/threejs-fundamentals/SKILL.md`,
`threejs-geometry` (instancing), `threejs-materials`, `threejs-lighting`, `threejs-textures` (pixel textures),
`threejs-animation`, `threejs-interaction` (raycasting/input) — all under `~/.agents/skills/`.

## Harness and verification

```sh
bunx vite --config src/games/dev/vite.config.ts --port <your port> &   # or: bun run arcade:dev --port <port>
bun scripts/shot-game.ts <slug> <your port>      # writes test-results/<slug>/*.png, prints console errors
```

Open the PNGs and check desktop + mobile in dark + light. One fix round, then one confirm round. Stop the
vite server when done (`pkill -f "port <your port>"`). Also verify playability in logic tests: a scripted
sequence of inputs reaches gameover and (where applicable) win.

## Report back

List files created, test results, the screenshot paths, the stat keys emitted, and any copy change you
suggest for the registry entry (do not edit the registry yourself).
