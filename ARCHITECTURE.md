# Architecture

How ldiego73.github.io is put together: a static Astro site with three Three.js experiences inside it (the home khipu, the arcade and the 3D world), shared procedural audio, and a GitHub Actions pipeline. For commands and conventions see [AGENTS.md](AGENTS.md). For the visual system see [DESIGN.md](DESIGN.md).

```
┌──────────────────────────── Astro (static, prerendered) ────────────────────────────┐
│  src/pages/[lang]/*   ←  src/data/* (single sources)  +  src/i18n/ui.ts  +  content │
│        │                                                                           │
│        ├── home ── src/lib/khipu (Three.js khipu, rope physics)                    │
│        ├── arcade ── src/arcade-lobby (3D hall) + src/games/<slug> (9 games)       │
│        ├── world ── src/world (Qhapaq Ñan mountain + Wasi house: core, content,   │
│        │            ambients)                                                      │
│        ├── world/selva ── src/world/selva (Antisuyu jungle: own runtime, page)     │
│        ├── world/cusco ── src/world/cusco (Qusqu hub) on src/world/suyu (generic   │
│        │                  suyu runtime for the hub and the suyu worlds)            │
│        └── world/costa ── src/world/costa (Chinchaysuyu coast) on src/world/suyu   │
│        ├── world/titicaca ── src/world/titicaca (Collasuyu lake) on src/world/suyu │
│        └── world/colca ── src/world/colca (Kuntisuyu: Colca canyon + Nazca) on suyu │
│                                   │                                                │
│                     src/audio (procedural Web Audio: music, SFX, ambience)         │
└────────────────────────────────────────────────────────────────────────────────────┘
        build → dist/ → GitHub Pages (deploy.yml) · CI + Lighthouse (ci.yml, lighthouse.yml)
```

## 1. Site

### Routing and i18n

- **Config.** `astro.config.mjs` sets `site`, i18n with locales `es` (the default) and `en`, `prefixDefaultLocale: true`, and the MDX and sitemap integrations. Fonts load through the Astro Fonts API.
- **Pages.** Every page lives under `src/pages/[lang]/`: home, `projects/`, `blog/`, `arcade/` (lobby plus `[game].astro`), `world/index.astro` (mountain), `world/selva.astro` (jungle), `world/cusco.astro` (the Qusqu hub), `world/titicaca.astro` (the Collasuyu lake), `world/colca.astro` (the Kuntisuyu), `cv.astro`, `uses.astro`, `services.astro` and `rss.xml.ts`.
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
| `src/data/services.ts` | The `/services` page: consulting formats with reference prices (USD floors), how an engagement starts, AI principles, FAQ, and the contact form's format and budget options |
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

## 2. 3D worlds: the Tawantinsuyu

The world is a set of worlds, each loaded only when the traveler goes there (`WorldId` in `src/world/events.ts`):

| World | Where it lives | How it loads |
| --- | --- | --- |
| `qhapaq`: the Qhapaq Ñan mountain climb | `/{lang}/world/`, `src/world/` | The page's main bundle |
| `wasi`: the owner's Andean house at the trailhead (career, education and CV, contact, passport table) | Inside the mountain page, `src/world/ambient/wasi.ts` | The exterior is built with the mountain. The interior (`ambient/wasi/interior.ts`) is a dynamic `import()` fired within ~45 u of the house and disposed beyond 120 u |
| `selva`: the Antisuyu jungle road (uses, blog, projects, arcade, canoe, canopy, Amazon fauna) | `/{lang}/world/selva/`, `src/world/selva/` | Its own page and runtime. It never imports the mountain's layout, terrain, fauna, NPCs or content |
| `cusco`: Qusqu, the hub at Haukaypata (usnu with the khipu of the suyus, Qorikancha, twelve-angled stone, chasqui post, five punkus) | `/{lang}/world/cusco/`, `src/world/cusco/` | Its own page, on the generic suyu runtime (`src/world/suyu/`) |
| `costa`: the Chinchaysuyu coastal road (one station per company with a pre-Inca coastal culture, the Huanchaco artifact market, caballito de totora ride, sea fauna, the Mamacocha headland finale) | `/{lang}/world/costa/`, `src/world/costa/` | Its own page, on the generic suyu runtime |
| `titicaca`: the Collasuyu lake road (skills on the Uros floating islands, education and certifications on Taquile, the totora boat, the Isla del Sol finale, lake fauna) | `/{lang}/world/titicaca/`, `src/world/titicaca/` | Its own page, on the generic suyu runtime |
| `colca`: the Kuntisuyu road along the Colca canyon and across the Nazca pampa (colcas with each stage's knots, the artifacts as geoglyphs, a Collagua village, condors, the Cruz del Cóndor finale) | `/{lang}/world/colca/`, `src/world/colca/` | Its own page, on the generic suyu runtime |

**Travelling between worlds.** `src/world/trailhead.ts` holds the tinkuy (crossroads) coordinates: the Wasi footprint, the Antisuyu branch and its punku, and the Qusqu branch (the road running on south from the trail's start) and its punku. `ambient/tinkuy.ts` builds the signpost (four arrows), both branches and both punkus. Near a punku it prefetches that world's page (`prefetchWorld` in `src/world/travel.ts`); E there calls `travelTo`, which first asks «¿Salir del mundo?» (`src/world/leave.ts` `confirmLeave`, on the shared `createModal`; it resolves `false` on Stay, so a punku clears its busy flag), then emits `world:travel`, fades and navigates with `?from=<world>` (`worldUrl`). The jungle's own punku travels back to `/{lang}/world/?from=selva`; the mountain page reads `?from=` with `arrivalFrom()` and starts at `ARRIVALS.selva` or `ARRIVALS.cusco` on the matching branch, skipping the title. The Qusqu hub's five punkus lead to the mountain, the jungle, the coast, the lake and the canyon (all open); a suyu-runtime world (the hub, costa, titicaca, colca) reads `?from=` with `suyu/arrival.ts` and starts in front of the punku the traveler came through. The coast, the lake and the canyon return to the hub's matching gate; the jungle's punku returns to the mountain's tinkuy, whose Qusqu branch leads back to the hub. Every same-tab link that leaves a world page (the chrome's back button, finale and panel links) goes through the same dialog: each runtime installs `guardLeaving(lang)` (one capture-phase click listener; pure rules in `leave-logic.ts`). New-tab links, downloads, `mailto:` and the text mode's links are left alone. **Fast travel between worlds:** the chrome's «Viajar» button (also V and gamepad LT, wired by each runtime) opens `src/world/travel-panel.ts`, a `createModal` dialog with a small SVG map of the Tawantinsuyu: one card per world placed by its gate's direction in `GATES`, ✓ on worlds with a passport stamp, «Estás aquí» on the current one (pure rules and copy in `travel-panel-logic.ts`). Choosing a world closes the panel and calls `travelTo`, so the same «¿Salir del mundo?» dialog and `?from=` apply; worlds that don't know the origin start at their default spawn, and the mountain skips its title for any world origin (`trailhead.ts` `travelledFrom`).

**One passport, one page per world.** `src/lib/passport.ts` tags every stamp with its `world` (absent means `qhapaq`), lists the pages in `WORLD_PAGES`, and `passportComplete(state, world?)` checks one page or all of them. The passport ambient (`ambient/passport.ts`) runs in both runtimes and opens on the page of the current world (`setPassportWorld`, i.e. `document.documentElement.dataset.world`). The arcade reward needs every page.

### 2.1 Mountain: KHIPU · Qhapaq Ñan

Route `/{lang}/world/`. A floating-island title gives way to a camera swoop, then a third-person climb of the Qhapaq Ñan (the Inca road). The career is the climb: one tambo (way station) per company in chronological order, then the Artifact Bridge, the arcade tambo, the AI Intihuatana, the chasqui post and the summit. The station list is `STATIONS` in `src/world/contract.ts`. Positions are `t` along the trail, from 0 in the valley to 1 at the summit.

### Page and boot

`src/pages/[lang]/world/index.astro` renders the following at build time:

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
- Camera and controls: `camera.ts`, `input.ts`, `chrome.ts`, `travel-panel.ts` (the «Viajar» panel).
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
- **`src/world/decks.ts`.** The registry of raised walkable surfaces (the Wasi plinth and steps, the jungle piers, stairs, boardwalks, porches, raft and viewpoint):
  - Ambients `add({ shape, y })` a circle, an axis-aligned box or an oriented box (`obox`, station frames) with a constant or per-point height, and call the returned remover on dispose.
  - Both runtimes stand the traveler on a deck it can step up to (within `MAX_STEP` of the feet; only what is underfoot while airborne), count a reachable deck as walkable, and keep the follow camera above decks. Under a high deck the traveler stays on the terrain.
  - `env.extra.groundAt` (mountain) and `env.selva.groundAt` (jungle) include the highest deck, so fauna and people stand on the planks. The registry is cleared with `creatures`.
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
- **Camera occluders.** `camera.ts` raycasts against named occluders (waterfall cliff, cave, the Antisuyu punku) and per-area occluders, so the camera never ends up inside rock.

### Dev hook

In dev builds only (`import.meta.env.DEV`), the world host element exposes `__kw`. It provides `setTime`, `setDate`, `teleport(t, side)`, `orbit`, `face`, `walk`, `tour`, `state()`, `creatures`, `scene` and `engine`. The screenshot scripts in `src/world/dev/`, `fauna-dev/` and `npc-dev/` drive the world harness through it.

### 2.2 Jungle: Antisuyu (`src/world/selva/`)

Route `/{lang}/world/selva/`. Not a climb but a long, mostly flat road (about 815 u) west → east through the lowland forest, beside a wide brown river. `src/world/selva/contract.ts` is its seam: `SELVA_STATIONS` (punku, the trader's boat with the uses, the blog maloca, the canoe landing, the project stilt houses, the floating arcade, the macaw clay lick), `CANOE_STRETCH`, `CANOPY_T`, the `SelvaLayout` interface and `SelvaEnv` (= `WorldEnv` + `env.selva` helpers). It reuses the mountain's contract types, so jungle ambients are written the same way.

- **Runtime.** `selva/index.ts` (`mountSelva`) composes the shared modules: engine, toon and ink, sky, follow camera, input, chrome, avatar, creatures, decks, detail cull, quality governor, loader, photo mode, passport and rewards. It duplicates the mountain's movement loop on purpose (same constants). No title: it starts at the punku. `selva/env.ts` builds `SelvaEnv`; `selva/music.ts` picks day and night tracks.
- **Ground.** `selva/layout.ts` is pure and tested: heightfield, road spline, river, plazas, walkable test, canoe route and the canopy walkway deck (`canopyDeckAt`). `selva/scenery.ts` (+ `scenery/`) builds terrain, river water, the instanced forest, the far canopy carpet, the walkway and the mist; `scenery/clearance.ts` keeps vegetation off roads, plazas, docks and the station footprints (`ambient/embarcadero/footprints.ts`).
- **Ambients.** Every top-level `selva/ambient/<name>.ts` exporting `create` is globbed by the jungle runtime (helpers in same-name folders). Stations: `regaton`, `maloca`, `embarcadero`, `canoe`, `palafitos`, `arcade`, `collpa`, `dosel`, `punku`. Finale: `kene` (the Shipibo kené totem past the collpa: celebration burst, `selva:summit` stamp and the "¡Lo lograste!" panel). People: `comunidad` (riverside villagers, kids, fisherman, peque-peque, travellers coming and going on the road, players at the floating arcade, and the gathering in the kené clearing). Mount: `mula` (on the shared road mount `src/world/ambient/mount/ride.ts`, which the coast horse, the lake llama and the Colca mule and quad bike also use). Fauna: `guacamayos`, `monos`, `perezoso`, `bufeo`, `caiman`, `ronsoco`, `tucan`, `jaguar`, `sajinos`, `anuje`, `taricaya`, `sachavaca`, `shansho`, `insects`, plus `soundscape`. Shared fauna kit in `ambient/wild/`.
- **Canoe ride.** `selva/ride.ts` is the hook: the canoe ambient emits `world:mount {vehicle: "canoe"}`, sets `ride.active` and writes `ride.pose` every frame; the runtime moves the traveler there instead of walking and fills `ride.intent` from the controls.
- **Map, postcard and text mode.** `selva/map.ts` (M or gamepad Y; fast travel after the `selva:station:collpa` stamp), the world-aware postcard (`summarize(…, "selva")`, `createJourneyDialog({ world })`), and `selva/textmode.ts` (`renderSelvaTextMode`, rendered at build time by `selva.astro`, with the field guide `selva/wildlife.ts`).
- **Harnesses.** `bunx vite --config src/world/selva/dev/vite.config.ts --port 5203` (`?lang=es&skip=1`, same `__kw` hook) and the scenery-only harness in `selva/scenery-dev/`.

### 2.3 The generic suyu runtime (`src/world/suyu/`)

The jungle's runtime made generic, so the hub and the coming suyu worlds (coast, lake, canyon) do not each clone 1 100 lines. A world folder describes itself with a `SuyuDef` (`suyu/contract.ts`) and its page calls `mountSuyu(host, { lang }, def)` (`suyu/index.ts`). The jungle and the mountain keep their own runtimes.

- **Shared, unchanged:** engine, toon + ink, sky, follow camera, input (keyboard, touch, gamepad), chrome, loader, photo mode, name editor, creatures, decks, seats, detail cull, quality governor, avatar, journey postcard, passport and rewards. Same walking physics, E/Esc routing, `world:modal` counter, `world:mount`/`world:sit`/`world:teleport` handling and `__kw` dev hook as the other runtimes. Each world dresses the avatar through `SuyuDef.outfit` (`avatar.ts` `Outfit`: andean in the hub, beach on the coast, altiplano at the lake, trek in the canyon; the jungle uses explorer). Road mounts share `src/world/ambient/mount/`: `ride.ts` (`createRideMount`: home spot, follow, stop rules, Esc/E, no `vehicle` so the runtime keeps walking), `gait.ts` (trot or lateral gait) and the models `mule.ts`, `horse.ts`, `llama.ts`, `quad.ts`.
- **`SuyuLayout`** (pure, the world's `layout.ts`): `trail`, `heightAt`, `groundAt`, `stationPose`, `walkable`/`addWalkable`/`addCollider`/`colliders`, `plazas`, `isWater`, `waterDist` (negative in water), `isGround`, `trailQuery`, `grid`, `bounds`. World-specific queries go in the world's own type that extends it.
- **`SuyuEnv`** = `WorldEnv` + `env.suyu` (`world`, `layout`, `groundAt` with decks, `isGround`, `randomGroundPoint`, `isWater`, `waterDist`, `trailDistance`).
- **`SuyuDef` fields:** `world` (a `WorldId`), `name`, `stations` (`SuyuStation`: id, kind, t, side, offset, label, optional `stamp` kind or `false`, optional `visit` radius), `buildLayout`, `cells` (heightfield tiers), `createScenery` (else `suyu/fallback-ground.ts`), `ambients` (the world's literal `import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"])`), `loader` copy, `textMode` factory, `music` (day/night tracks), `atmosphere` (weather fog/cover, fog tint, near/far scale, ink fade), `spawn` (`default` and per origin `from`, a road `t` or a point), `outfit` (avatar), `place` (photo place), `visit.radius`, `map` (`suyu/map.ts`: title, canvas description, unlock stamp, extra roads and marks, aspect), `help` (controls copy for `suyu/hud.ts`), `postcard` (which card `journey-card.ts` draws: each world sets its own; the hub's is the whole Tawantinsuyu, one cord per passport page), and `hooks` (camera occluder proxies, per-frame extras).
- **Stamps:** a station within its visit radius stamps `<world>:station:<id>` with its kind (default `station`, which is required by the passport; `egg`/`npc` are bonus; `false` stamps nothing). Add the matching `CATALOG` entries.
- **Secrets:** each suyu world hides one or two bonus `egg` stamps (`<world>:egg:<id>`, in `CATALOG`, shown as "???" until found; the text modes only hint at them): `selva/ambient/chullachaqui.ts` (mismatched footprints to the forest spirit), `costa/ambient/ekeko.ts` (statuette at the Huanchaco market), `titicaca/ambient/sumergida.ts` (night glow of a sunken temple off the Taquile pier), `colca/ambient/condor-blanco.ts` (white condor at the Cruz in the morning), `colca/ambient/ufo.ts` (night saucer over the Nazca pampa that lifts and returns an alpaca), `cusco/ambient/ukuku.ts` (ukuku dancing in the plaza at night). Pure rules in each `<name>/logic.ts`.
- **Vehicles:** `suyu/ride.ts`, the canoe's protocol for any boat or raft.
- **Helpers:** `suyu/map-logic.ts` and `suyu/arrival.ts` are pure and tested; `suyu/textmode.ts` shows a world's pure text renderer in the paper overlay; `suyu/copy.ts` titles the loader.

### 2.4 Qusqu, the hub (`src/world/cusco/`)

Route `/{lang}/world/cusco/`. Haukaypata, the great plaza of Inca Qusqu, as a compact diorama with the real bearings (−z north).

- **Plan** (`cusco/plan.ts`, pure): the plaza, the usnu's three tiers (each a step: walkable through `groundAt`), the five streets and `GATES`, the single table of the roads: Qhapaq Ñan south to the mountain, Chinchaysuyu north-west (`costa`), Antisuyu north-east (`selva`), Collasuyu south-east (`titicaca`), Kuntisuyu south-west (`colca`), each with `available`, the passport pages it leads to, what the world holds and its dye. Every gate is open (`qhapaq`, `selva`, `costa`, `titicaca`, `colca`); a gate with `available: false` would show a log bar and "coming soon". Stations: usnu and Qorikancha (required stamps), the twelve-angled stone (`egg`) and the chasqui post (`npc`), plus one per gate (no stamp).
- **Layout** (`cusco/layout.ts`, pure, tested): the Huatanay valley heightfield (flat core, rising hills, Sacsayhuamán's hill), the walkable plaza and streets, the axis trail from the Qhapaq gate north over the usnu.
- **Scenery** (`cusco/scenery.ts` + `scenery/`): valley ground, `scenery/masonry.ts` (a fast typed-array builder for ashlar walls with trapezoidal doors and niches), the plaza mesh (paving, usnu, kallanka halls, kancha walls and houses, the Qorikancha facade with its gold band and Inti disc), the streets mesh (walls, paving, Hatun Rumiyoc), Sacsayhuamán's zigzag walls, the ring of apus and instanced native plants. About eight draw calls.
- **Ambients:** `punkus` (the five gates: stone, glimpses and signs in three meshes; open ones travel and prefetch, closed ones say "coming soon"), `khipu` (the khipu of the suyus on the usnu, knots = stamps per road in decimal positions; the panel with progress per page; the once-ever Tawantinsuyu finale when every page is complete, `FINALE_KEY`), `chasqui` (post + contact card), `landmarks` (Qorikancha stele, Hatun Rumiyoc plaque), `life` (walkers, the seated chasqui, a herder with instanced pack llamas), `doves` (native eared doves that take off as you come near).
- **Text mode** `cusco/textmode.ts` (rendered at build time by `cusco.astro`). **Harness:** `bunx vite --config src/world/cusco/dev/vite.config.ts --port 5221` (`?lang=es`, `&from=selva` to arrive through a punku), with `dev/shots.mjs` and `dev/panels.mjs`.

### 2.5 Coast: Chinchaysuyu (`src/world/costa/`)

Route `/{lang}/world/costa/`, on the suyu runtime (`costa/def.ts`, `mountCosta`). The Sierra's career journey retold along a desert coastal road (about 840 u) running south → north with the Pacific always to the west.

- **Plan** (`costa/plan.ts`, pure): `WORK` (the working companies of `src/data/career.ts`, chronological), `COMPANY_STOPS` (one station per company, each dressed as a pre-Inca coastal culture from `CULTURES`: Nasca, Paracas, Pachacamac, Chancay, Caral, Moche, Chan Chan), `MARKET` (Huanchaco: one stall per artifact of the career, stamp `costa:station:huanchaco`, which also unlocks map fast travel), `BEACHES`, the punku and the `mamacocha` finale. `COSTA_STATIONS` feeds the passport catalog.
- **Ground** (`costa/layout.ts`, pure and tested): heightfield with cliffs, beaches, two rivers with bridges, islets (sea-lion rocks, penguin point, guano island), flat aprons under the monuments and a slope limiter so the road stays walkable.
- **Scenery** (`costa/scenery/`): terrain and road, the sea (`sea.ts`, a toon shader with foam, swash, fresnel and sun/moon glitter; `waves.ts` shares the wave function between TypeScript and GLSL so boats float on the same surface), spray, rivers, props, backdrop and flora.
- **Ambients:** `huacas` (stations, monuments, panels, market, signs, geoglyph), `caballito` (the totora reed boat between the two beaches, `costa:ride:caballito`), `finale` (the headland at sunset: burst, `costa:summit`, the "¡Lo lograste!" panel with the true career stats), `punku` (back to Qusqu), `gente` (people in coastal dress, extra `PartSpec`s; travellers walking the whole road both ways, market families, surfers, a beach vendor), `reunion` (the gathering at the finale: an offering to the Mamacocha, a family, a chicha and ceviche stall, kids), `caballo` (the Paso horse road mount), `orilla` and `aves` (sea lions, penguins, crabs, pelicans, gulls, guanays: bonus `costa:fauna:*` stamps, field guide `costa/wildlife.ts`), `tierra` (viringo dogs, burros, goats, cañán lizards, sanderlings, boobies; no stamps) and `soundscape`.
- **Text mode** `costa/textmode.ts` (rendered at build time by `costa.astro`). **Harness:** `bunx vite --config src/world/costa/dev/vite.config.ts --port 5231` (`?lang=es&skip=1`), with `dev/shoot.mjs` and `dev/og-shot.mjs` (writes `src/assets/og/costa.jpg`).
### 2.6 Collasuyu, Lake Titicaca (`src/world/titicaca/`)

Route `/{lang}/world/titicaca/`. The owner's knowledge as a shore road (~670 u) west → east along the southern shore of Lake Titicaca on the altiplano, the lake to the north (−z) and the snowy Cordillera Real across it. Built on the generic suyu runtime (`def.ts` is its `SuyuDef`).

- **Plan and layout** (`plan.ts`, `layout.ts`, pure, tested): road control points, the shore (`shoreZ`) and headlands (Taquile, the Isla del Sol, far decor islands) joined into a signed land field (`landField`, also `waterDist`), the heightfield (lake bed shelf, beach, puna, altiplano hills, domes, cones under the terraced hills), land plazas and their spurs, the five Uros islands (one per `SKILLS` group, ids from the group's English name), the boardwalk, the two balsa landings and the stations.
- **Scenery** (`scenery.ts` + `scenery/`, about ten draw calls): terrain with chacras (`fields.ts`), the road ribbon, the lake water shader (depth tint, ripples, foam, sky sheen, sun glints), instanced totora reeds and ichu (no outline: thin blades would be all ink), rocks, pirca walls and farmhouses, terraced hills and Taquile's contour walls, the mountain ring (fogless, haze baked in). It also deepens the sky dome's daytime zenith on this page only.
- **Ambients:** `punku` (stone gate back to Qusqu, prefetch, `?from=titicaca`), `sillustani` (chullpas, bonus `egg`), `uros` (islands as decks, huts, tower, boards, the skills panel with ←/→ browsing), `balsa` (the reed boat on `suyu/ride.ts`, `titicaca:ride:balsa`), `taquile` (village, arch, loom; EDUCATION and CERTIFICATIONS in a woven panel), `titikala` (finale: burst, `titicaca:summit`, reward panel with true stats), `gente` (Uros families, Taquile weavers, fishermen, a herder, travellers walking the whole road both ways, the offering gathering at Titikala; three additive people parts in `gente/parts.ts`), `llama` (the saddled llama road mount), `aves` (grebes, flamingos, gulls), `orilla` (alpacas, llamas, vizcachas, the giant frog), `puna` (sheep with a dog, huallatas, puna ibises, teals, trout, cuyes; no stamps). Pure rules in each `ambient/<name>/logic.ts`; shared models in `ambient/kit/`.
- **Text mode** `titicaca/textmode.ts` with the field guide `titicaca/wildlife.ts`. **Harness:** `bunx vite --config src/world/titicaca/dev/vite.config.ts --port 5241` (`?lang=es`), with `dev/shots.mjs` and `dev/og-shot.mjs`.

### 2.7 Kuntisuyu: the Colca canyon and the Nazca pampa (`src/world/colca/`)

Route `/{lang}/world/colca/`, on the generic suyu runtime. The owner's architecture work: the knots (achievements) of every career stage and the cross-company artifacts, all read from `src/data/career.ts` through `colca/content.ts`.

- **Plan and layout** (`colca/plan.ts`, `colca/layout.ts`, pure, tested): the road (a Catmull-Rom through `ROAD_CTRL`, resampled every ~1 u) from the punku at the east end of the canyon's north rim, west along the rim, north down onto the Nazca pampa (a shallow bowl round the mirador tower) and back up to the Cruz del Cóndor on the rim. Canyon coordinate `s = z − rimZ(x)`; `canyonY` is the smooth cross-section (rock lip, terraces, steep walls, the river ~175 u down). The river is the only water (`isWater`), far below the road; walkable is the road, the plazas and the decks.
- **Scenery** (`colca/scenery.ts` + `scenery/`): the heightfield minus the canyon (`ground.ts`), the road ribbon (`road.ts`), the canyon as one swept, terraced, strata-coloured mesh plus the river (`canyon.ts`), two mist ribbons inside it (`mist.ts`), the far skirt, the volcanoes (Sabancaya with its plume, Hualca Hualca, Ampato, Mismi) (`backdrop.ts`) and instanced ichu, tola, cacti and stones (`flora.ts`).
- **Stations** (ambients): `punku` (back to Qusqu, `?from=colca` lands at the hub's Kuntisuyu gate), `pueblo` (Collagua village and white church), `colcas` (one granary per stage on a stepped cliff, a knot per achievement on its cord; the panel lists company → stage → knots), `nazca` (one geoglyph per artifact, `colca/glyphs.ts` + `ambient/nazca/`; a climbable mirador tower on decks; the panel shows the artifact and every use), `cahuachi` (bonus), `cruz` (the finale: condors rise, feathers and confetti, `colca:summit`, the "¡Lo lograste!" panel with true counts from `content.ts finaleStats`).
- **Life:** `condores` (thermals over the canyon close to the rim road, a low pass over the traveler, perched pairs by the colcas and the Cruz; two pass the Cruz in the morning), `vicunas`, `vizcachas`, `picaflores`, `zorro` (dusk) with `colca:fauna:*` stamps and the field guide `colca/wildlife.ts`; `gente` (villagers in the valley's embroidered dress, with the Colca garments added to the shared people rig in `ambient/gente/garments.ts`, children, a farmer with pack llamas); `viajeros` (people coming and going along the whole road, canyon and pampa); the gathering at the Cruz (in `cruz.ts`); road mounts `mula` (the canyon, up to the pampa) and `cuatrimoto` (the quad bike, from the Nazca pampa to the Cruz), with their stretches in `ambient/mounts/logic.ts`.
- **Text mode** `colca/textmode.ts` (rendered at build time by `colca.astro`). **Harness:** `bunx vite --config src/world/colca/dev/vite.config.ts --port 5251` (`?lang=es`), with `dev/og-shot.mjs`.

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

1. Create `src/world/ambient/<name>.ts` (mountain) or `src/world/selva/ambient/<name>.ts` (jungle) that exports `create: CreateAmbient`. Put builders and pure logic in `src/world/ambient/<name>/`, with tests for the logic.
2. Register moving bodies in `creatures`, and declare `keepOut` zones for static gatherings. Register floors, decks and steps above the terrain in `decks` (walkable areas only cover ground-level paths).
3. Use `env.toon`, instancing and merging. Call `noOutline` only for glows and particles.
4. Respect `env.quality`, `env.reducedMotion` and `env.sky.isNight()`.
5. If it has an interaction, implement `prompt()` together with `interact()`, and emit `world:modal` while a panel is open.
6. If it is fauna, describe it in `src/world/wildlife.ts` so the text mode stays truthful.

**Add a passport stamp:**

1. Add the kind to `StampKind` in `src/world/events.ts` if it is new.
2. Add the entry to `CATALOG` in `src/lib/passport.ts`.
3. Emit `world:stamp` with the same id.

The catalog decides when the passport is complete and therefore when the arcade reward unlocks, so update the passport tests.

**Add a new world:**

1. Add its id to `WorldId` (`src/world/events.ts`) and a page to `WORLD_PAGES`, with its stamps tagged `world`, in `src/lib/passport.ts`.
2. Small and close to the trail: build it as a mountain ambient whose heavy part is a dynamic `import()` loaded on approach (like the Wasi). Large: give it its own folder, contract, runtime and page (like `src/world/selva/`), and a portal in `src/world/trailhead.ts` + `travel.ts` (`worldUrl`, `ARRIVALS`).
3. Give it its own text mode, OG card (`src/pages/og/[...route].png.ts`) and an e2e smoke test. Keep mountain-only modules out of its bundle.

**Add a suyu world on the generic runtime** (the coast, the lake, the canyon):

1. Add its id to `WorldId` (`src/world/events.ts`), a page to `WORLD_PAGES` and its stamps (tagged `world`) to `CATALOG` in `src/lib/passport.ts`, and a `SECTIONS` entry in `ambient/passport.ts`.
2. Create `src/world/<id>/`: `layout.ts` (pure, implements or extends `SuyuLayout`, with tests), `scenery.ts`, `ambient/*.ts`, `textmode.ts` (pure renderer + tests), `copy.ts`, and `def.ts` exporting a `SuyuDef` whose `ambients` is the folder's own literal `import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"])`; `index.ts` calls `mountSuyu(host, opts, def)`. Copy `src/world/cusco/dev/` for a harness.
3. Add `src/pages/[lang]/world/<id>.astro` (copy `cusco.astro`), an OG card (`src/lib/og.ts`, `src/pages/og/[...route].png.ts`, a screenshot in `src/assets/og/`), a `warm.ts`, and the id to `worldUrl`/`prefetchWorld` in `src/world/travel.ts`.
4. Open its gate in Qusqu: in `src/world/cusco/plan.ts` `GATES`, set `world` to the new `WorldId`, `available: true` and its `pages`. Its punku in the hub should travel back with `travelTo(lang, "<id>", "cusco")`, and the hub's `spawn.from` picks it up from `GATES`.
5. Add an e2e smoke test. Keep the mountain's and the jungle's modules out of its bundle.

**Add or move a station:** edit `STATIONS` in `src/world/contract.ts` (mountain) or `SELVA_STATIONS` in `src/world/selva/contract.ts` (jungle). This change ripples to:

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
