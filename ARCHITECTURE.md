# Architecture

How ldiego73.github.io is put together: a static Astro site with three Three.js experiences inside it (the home khipu, the arcade and the 3D world), shared procedural audio, and a GitHub Actions pipeline. For commands and conventions see [AGENTS.md](AGENTS.md). For the visual system see [DESIGN.md](DESIGN.md).

```
┌──────────────────────────── Astro (static, prerendered) ────────────────────────────┐
│  src/pages/[lang]/*   ←  src/data/* (single sources)  +  src/i18n/ui.ts  +  content │
│        │                                                                           │
│        ├── home ── src/lib/khipu (Three.js khipu, rope physics)                    │
│        ├── arcade ── src/arcade-lobby (3D hall) + src/games/<slug> (9 games)       │
│        └── world ── src/world (KHIPU · Qhapaq Ñan: core + content + ambients)      │
│                                   │                                                │
│                     src/audio (procedural Web Audio: music, SFX, ambience)         │
└────────────────────────────────────────────────────────────────────────────────────┘
        build → dist/ → GitHub Pages (deploy.yml) · CI + Lighthouse (ci.yml, lighthouse.yml)
```

## 1. Site

### Routing and i18n

- **Config.** `astro.config.mjs` sets `site`, i18n with locales `es` (the default) and `en`, `prefixDefaultLocale: true`, and the MDX and sitemap integrations. Fonts load through the Astro Fonts API.
- **Pages.** Every page lives under `src/pages/[lang]/`: home, `projects/`, `blog/`, `arcade/` (lobby plus `[game].astro`), `world.astro`, `cv.astro`, `uses.astro` and `rss.xml.ts`.
- **Root page.** `src/pages/index.astro` picks the language in this order: a saved `localStorage.lang`, then `navigator.languages`, then Spanish.
- **UI strings.** They live in `src/i18n/ui.ts` (`t()`, `LANGS`, helpers).
- **Language switch.** `src/lib/lang-switch.ts` keeps the reader in place. It goes to the equivalent route (or the translated twin of a post), carries over the section in view as `#hash`, and remembers the choice.

### Layout and shared components

`src/layouts/Base.astro` wraps every content page with:

- meta and OG tags (`ogPathFor` from `src/lib/og.ts`);
- hreflang alternates;
- the theme bootstrap (`localStorage.theme`, light/dark);
- `Header.astro`, which holds the navigation, the ⌘K search button, the language and theme toggles, and the hamburger menu under 1000 px;
- `Footer.astro`;
- `Analytics.astro`;
- `CommandPalette.astro`.

### Data: single sources of truth

| File | Owns |
| --- | --- |
| `src/data/career.ts` | Companies, stages, knots, cross-company artifacts. Read by the home khipu, chapters, CV, world tambos, NPC dialogs, exhibits, the C4 maquettes and the text mode. |
| `src/data/site.ts` | Email, Calendly, social links, the Formspree endpoint, resume paths, the Umami config |
| `src/data/uses.ts` | The `/uses` page: AIDLC phases, AI tooling, the site stack, daily tools |
| `src/content/blog/{es,en}/*.mdx` | Native posts (collection defined in `src/content.config.ts`), paired by `translationKey` |

### Build-time fetchers

`src/lib/github.ts` (public repositories) and `src/lib/medium.ts` (the Medium RSS feed, merged into posts by `src/lib/posts.ts`) run during the build. They never fail it: without network they return empty arrays, and every consumer must render an empty state.

### Generated endpoints

- **OG images.** `src/pages/og/[...route].png.ts` prerenders one PNG per page. It builds them with `satori` and `@resvg/resvg-js`, using `@fontsource` fonts, through `src/lib/og.ts`.
- **RSS.** `src/pages/[lang]/rss.xml.ts` produces the feed with `@astrojs/rss`, styled for browsers by `public/rss.xsl`.

### Client scripts

- **Command palette.** `src/lib/search-index.ts` builds the ⌘K index at build time. It is embedded as JSON (`#cmdk-data`), and `src/lib/palette.ts` builds the dialog lazily on first open.
- **World prefetch.** `src/lib/prefetch-world.ts` warms the world bundle when the visitor hovers, focuses or touches a "World" link.
- **Analytics.** Umami is cookieless and restricted to the production domain. `src/lib/vitals.ts` sends real-user LCP, CLS and INP to Umami as `web-vital` events.
- **Contact form.** It posts to Formspree (`SITE.formEndpoint`). Without an endpoint, it falls back to a pre-filled `mailto:`.

## 2. 3D world: KHIPU · Qhapaq Ñan

Route `/{lang}/world/`. A floating-island title gives way to a camera swoop, then a third-person climb of the Qhapaq Ñan (the Inca road). The career is the climb: one tambo (way station) per company in chronological order, then the Artifact Bridge, the arcade tambo, the AI Intihuatana, the chasqui post and the summit. The station list is `STATIONS` in `src/world/contract.ts`. Positions are `t` along the trail, from 0 in the valley to 1 at the summit.

### Page and boot

`src/pages/[lang]/world.astro` renders the following at build time:

- the khipu loader (`loaderHtml` from `src/world/loader.ts`);
- the full accessible text mode (`renderTextMode` from `src/world/textmode.ts`), which also serves as the no-WebGL / no-JS fallback;
- a `<script type="application/json" id="world-data">` block holding repositories and posts (`src/world/data.ts`).

The client script then lazy-imports `src/world/index.ts`.

### The three halves

`src/world/contract.ts` is the stable seam. Keep it stable.

**Core** (`src/world/index.ts` orchestrates):

- Engine and quality: `engine.ts` (renderer, quality, adaptive DPR), `quality.ts` (pure auto governor).
- Ground and road: `layout.ts` (pure heightfield, trail spline, gorge, plazas, walkable test), `terrain.ts` with `flora/` (terrain, river, vegetation), `trail.ts` (the stone path).
- Sky and calendar: `sky.ts` (day/night, sun, moon, stars, Milky Way, fog, the weather hook), `calendar.ts` (real date in Cusco: season, Inti Raymi, moon phase; override with `?date=YYYY-MM-DD`).
- Rendering style: `toon.ts`, `outline.ts` and `merge-colors.ts` (see Rendering pipeline below).
- Camera and controls: `camera.ts`, `input.ts`, `chrome.ts`.
- Screens and dialogs: `intro.ts`, `loader.ts`, `map.ts`, `dialogs.ts`, `textmode.ts`.
- Climb record and music: `journey.ts`, `journey-card.ts`, `music.ts`.

`env.ts` assembles the `WorldEnv` object. It also exposes `WorldEnvExtra.extra`, with helpers outside the contract: `groundAt`, `isGrass`, `randomGrassPoint`, `isWater`, `trailDistance` and `stream`.

**Content** (`content.ts`, `avatar.ts`, `cords.ts`, `bridge.ts`, `house.ts`, `tambo.ts`, `landmarks.ts`, `summit.ts`, `props.ts`, `hud.ts`) builds the avatar, the stations, the HUD panels and the guided tour.

**Ambients** are self-contained systems implementing `Ambient` (`update`, plus optional `interact`, `escape`, `prompt` and `dispose`):

- The legacy pair `fauna.ts` and `npcs.ts`, found by fixed path.
- Every top-level `src/world/ambient/<name>.ts` that exports `create: CreateAmbient`, found by `import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"])`.
  - Only top-level files are globbed, so helpers belong in a subfolder `ambient/<name>/` and must not export `create`.
  - Any top-level file that exports `create` gets wired in automatically.

Loading is lazy and fault-tolerant. A module that throws while loading or creating is logged and skipped, and the world still starts.

### Input arbitration

- **E / tap interact.** Ambients are asked first, in load order, then content. An ambient that implements `prompt()` only receives E while its prompt is non-null, so a llama or an egg in range never steals E from a tambo.
- **Esc.** Ambients are asked first, then content. Dialogs capture Esc themselves (`dialogs.ts`).
- **Gamepad.** Gamepads follow the standard mapping (`input.ts`). Some buttons are routed by core even while a modal is open.

### Event bus

Modules do not import each other. They talk through typed window events (`src/world/events.ts`: `emit` / `on`):

- `world:stamp`, `world:mount`, `world:teleport`, `world:quality`;
- `world:modal` (a counter in core pauses movement), `world:game`, `world:interior`, `world:traveler`;
- `world:map`, `world:help`, `world:passport-complete`, `world:textmode`, `world:weather`, `world:postcard`;
- `world:mission`, `world:climb`;
- `world:date`, fired by `setWorldDate`.

### Shared registries and state

- **`src/world/creatures.ts`.** The one registry of moving bodies (traveler, animals, people):
  - Owners `add` a body, write its x/z every frame, and call `separate`, `steer` or `resolve` so nothing walks through anything else.
  - `park` takes a body out of play without removing it.
  - `keepOut(x, z, r)` declares no-go circles (camps, story circles, festival plazas) that fauna steers around, and that can be switched off when a place is empty.
- **Passport** (`src/lib/passport.ts`, `localStorage` key `ldiego73-passport-v1`).
  - `CATALOG` lists every stamp and decides completeness.
  - It is the only source for "visited". The map's fast travel unlocks only after the summit stamp.
  - A complete passport unlocks the arcade's aguayo cabinet skin (`ambient/rewards.ts`).
- **Other per-visitor keys:**
  - `ldiego73-world-journey-v1`: climb times and summit date.
  - `ldiego73-world-ghost-v1`: the best climb's path, for the time-trial ghost.
  - `ldiego73-world-quality`.
  - `qn.traveler`: the traveler's name.
  - The arcade store `ldiego73-arcade-v1`.

### Rendering pipeline

The look is toon shading with hand-inked outlines.

- **Materials.** `env.toon(color)` returns a cached `MeshToonMaterial` with a 3-step ramp.
- **Ink outline.** `outline.ts` runs a normal + depth prepass on layer 0, then a full-screen edge detect that fades into the fog.
  - Objects opt out with `env.noOutline(obj)`, which moves them to layer 1 (`NO_OUTLINE_LAYER`).
  - Transparent or shader-driven objects get an ink-mask twin (`inkMask()` in `toon.ts`).
- **Draw-call budget.** The whole mountain is in view at once, so draw calls dominate the frame cost.
  - `merge-colors.ts` (`mergeColored`, `flattenToonGroup`) folds flat-colored parts into one vertex-colored mesh. `arcade-merge.ts` does the same for the cabinets.
  - Repeated things are instanced.
  - `detail-cull.ts` hides small meshes beyond a distance band (`CULL_BANDS`), rescanning every 5 s, with a tighter factor on phones.
- **Quality governor.** `quality.ts` steps the cost down only when frame times stay low (pixel ratio, then outline) and back up with hysteresis. A manual quality choice disables it.
- **Camera occluders.** `camera.ts` raycasts against named occluders (waterfall cliff, cave) and per-area occluders, so the camera never ends up inside rock.

### Dev hook

In dev builds only (`import.meta.env.DEV`), the world host element exposes `__kw`. It provides `setTime`, `setDate`, `teleport(t, side)`, `orbit`, `face`, `walk`, `tour`, `state()`, `creatures`, `scene` and `engine`. The screenshot scripts in `src/world/dev/`, `fauna-dev/` and `npc-dev/` drive the world harness through it.

## 3. Arcade

- **Lobby.** `src/arcade-lobby/` is the 3D hall: cabinets (`cabinet.ts`), attract screens (`attract.ts`) and the reward skin (`aguayo.ts`). The world's arcade tambo reuses the same cabinets.
- **Games.** `src/games/registry.ts` lists the games and their achievements.
- **Shared core** (`src/games/core/`):
  - `shell.ts` and `shell.css`: the cabinet UI, which owns the HUD, overlays, pause, scores, achievements and the audio slot;
  - `stage.ts`: renderer, camera and loop;
  - `store.ts`: `localStorage`;
  - `neon.ts`: the palette;
  - `input.ts`;
  - `types.ts`: the `GameModule` contract.
- **Each game** lives in `src/games/<slug>/`: `state.ts` (pure rules with tests), `view.ts` (Three.js) and `index.ts` (`mount`). Authoring rules are in [src/games/README.md](src/games/README.md).

## 4. Audio (`src/audio/`)

Everything is procedural Web Audio: there are no audio files.

- **Tracks are data.** `contract.ts` defines step strings, a tempo, a key and voice names, including Andean voices: quena, zampoña, charango and bombo.
- **Scheduling.** `scheduler.ts` is a pure step scheduler. `voices.ts` holds the synth voices. `engine.ts` holds the audio graph, which ends in a limiter.
- **Buses.** `player.ts` is the `getMusic()` singleton, with separate music, SFX and ambient buses under one master volume and mute.
- **Sound effects.** `sfx.ts` plays one-shot effects (`sfx.play("stamp")`), and `stingers.ts` plays the jingles.
- **Who uses it.**
  - The arcade shell uses it through `games/core/audio-control.ts`.
  - The world has a music director (`src/world/music.ts`) that picks tracks by time of day, location and activity.
  - `ambient/soundscape.ts` plays wind, water, rain, birds and footsteps, and hooks sound effects to world events.
- **Testing.** `fake-audio.ts` stands in for Web Audio in unit tests. `scripts/audio-qa.ts` renders tracks offline for listening checks.

## 5. Build, CI and deploy

| Workflow | Trigger | Does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull requests, pushes to branches other than `main` | `bun run check`, unit tests, build, Lighthouse CI on the build (`lighthouse/ci.json`, mobile), Playwright smoke tests (desktop + Pixel 7, SwiftShader WebGL) |
| `.github/workflows/deploy.yml` | Push to `main`, manual | `withastro/action` build with Bun, then `actions/deploy-pages` |
| `.github/workflows/lighthouse.yml` | After a successful deploy, weekly, manual | Lighthouse against the live site (`lighthouse/prod.json`), with a summary from `scripts/lhci-summary.ts` |

E2E tests (`e2e/smoke.spec.ts`) check that every page renders without errors or horizontal scroll, that the language switch and the theme work, that every game starts, that the world intro enters, and that the cabinet audio slot works.

## 6. Extension recipes

**Add a world system** (an animal, people, props, an effect):

1. Create `src/world/ambient/<name>.ts` that exports `create: CreateAmbient`. Put builders and pure logic in `src/world/ambient/<name>/`, with tests for the logic.
2. Register moving bodies in `creatures`, and declare `keepOut` zones for static gatherings.
3. Use `env.toon`, instancing and merging. Call `noOutline` only for glows and particles.
4. Respect `env.quality`, `env.reducedMotion` and `env.sky.isNight()`.
5. If it has an interaction, implement `prompt()` together with `interact()`, and emit `world:modal` while a panel is open.
6. If it is fauna, describe it in `src/world/wildlife.ts` so the text mode stays truthful.

**Add a passport stamp:**

1. Add the kind to `StampKind` in `src/world/events.ts` if it is new.
2. Add the entry to `CATALOG` in `src/lib/passport.ts`.
3. Emit `world:stamp` with the same id.

The catalog decides when the passport is complete and therefore when the arcade reward unlocks, so update the passport tests.

**Add or move a station:** edit `STATIONS` in `src/world/contract.ts`. This change ripples to:

- the passport catalog (one stamp per non-build station);
- the map and fast travel;
- the text mode;
- the guided tour;
- the climb tracker;
- every ambient placed by station id.

Check them all.

**Add a company or career fact:** edit `src/data/career.ts` only. The home, CV, world tambos, dialogs and exhibits all read from it. Regenerate the English resume as described in README.

**Add a game:** follow [src/games/README.md](src/games/README.md), then add it to `src/games/registry.ts`. The lobby and the command palette pick it up from the registry. Add the slug to the game list in `e2e/smoke.spec.ts` by hand.

**Add a blog post:** add `src/content/blog/es/<slug>.mdx` and `src/content/blog/en/<slug>.mdx` with the same `translationKey`. RSS, the palette index, OG images and the world's khipu of writings pick it up.
