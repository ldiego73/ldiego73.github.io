# ldiego73.github.io

Personal site of Luis Diego. The career is told as a khipu, the Andean record of cords and knots: one cord per company, a subsidiary cord per stage, knots for shipped work and top cords for artifacts that span companies. Includes a bilingual blog, projects, a printable CV, a `/uses` page, a 3D arcade with nine games and "KHIPU", a set of explorable 3D worlds with a playable traveler.

Built with [Astro](https://astro.build) and [Three.js](https://threejs.org), managed with [Bun](https://bun.sh), deployed to GitHub Pages with GitHub Actions.

How the pieces fit together: [ARCHITECTURE.md](ARCHITECTURE.md). Conventions for contributors and coding agents: [AGENTS.md](AGENTS.md). Visual system: [DESIGN.md](DESIGN.md).

## Commands

| Command | What it does |
| --- | --- |
| `bun install` | Install dependencies |
| `bun run dev` | Dev server at `localhost:4321` (redirects `/` to `/es/` or `/en/`) |
| `bun run build` | Static build into `dist/` |
| `bun run preview` | Serve `dist/` |
| `bun run check` | `astro check` + Biome lint/format check |
| `bun run format` | Biome autofix |
| `bun run test` | Unit tests (`bun test src`) |
| `bun run test:e2e` | Playwright smoke tests against the build (pages, i18n, theme, all games, both world pages) |
| `bun run arcade:dev --port 5180` | Game harness: `/?game=<slug>&lang=es&theme=dark&autostart=1` |
| `bunx vite --config src/world/dev/vite.config.ts --port 5191` | Mountain world harness: `/?lang=es` (`&skip=1` starts in the world) |
| `bunx vite --config src/world/selva/dev/vite.config.ts --port 5203` | Jungle world harness: `/?lang=es&skip=1` |

## Structure

```
src/
  data/career.ts        Companies, stages, knots and cross-company artifacts (single source of truth)
  data/site.ts          Email, Calendly, form endpoint, resume paths, social links, analytics
  data/uses.ts          The /uses page: AI-assisted delivery, tools, site stack
  i18n/ui.ts            UI strings (es, en) and helpers
  lib/khipu/            Khipu model (tested) and Three.js scene with rope physics
  lib/og.ts             Social share cards (rendered at build time by pages/og/)
  lib/passport.ts       World passport: one page of stamps per world
  lib/github.ts         Public repos at build time (never fails the build)
  lib/medium.ts         Medium RSS at build time (never fails the build)
  content/blog/{es,en}/ MDX posts; translationKey links both languages
  games/                Arcade: core contract, Block Arcade kit, shell, store, registry and one folder per game
  arcade-lobby/         3D arcade hall (cabinets, attract screens), shared with the worlds
  audio/                Procedural Web Audio: music engine, sound effects, phone-speaker profile
  world/                KHIPU worlds: mountain runtime, shared core, ambients, Wasi house
  world/selva/          Antisuyu jungle world: its own runtime, layout, scenery, ambients
  pages/[lang]/         Home, projects, blog, uses, arcade, world (+ world/selva), cv, rss.xml
  pages/og/             One PNG share card per page
scripts/                Screenshot, resume PDF, social image and Lighthouse summary helpers
e2e/                    Playwright smoke tests
lighthouse/             Lighthouse CI budgets (pull requests and production)
```

## Content

- **Experience:** edit `src/data/career.ts`. The khipu, chapters, flat view, CV, world tambos, NPC dialogs and the Wasi house all read from it.
- **Blog:** add `src/content/blog/es/<slug>.mdx` and `src/content/blog/en/<slug>.mdx` with the same `translationKey`. Medium posts from `@ldiego73` are merged in at build time. Posts also appear in the worlds (the mountain's writing khipu and the jungle's maloca).
- **Uses:** edit `src/data/uses.ts` (the `/uses` page and the jungle trader's boat).
- **Social links:** append to `SOCIALS` in `src/data/site.ts`.
- **Contact form:** posts to Formspree (`formEndpoint` in `src/data/site.ts`). While empty, the form opens a pre-filled email instead.
- **Resume:** `public/resume/luis-diego-cv-es.pdf` is the original. Regenerate the English one after editing career data: build, run `bunx astro preview --port 4330 --ignore-lock`, then `bun scripts/resume-pdf.ts 4330`.

## Arcade

Games live in `src/games/<slug>/` and follow `src/games/README.md`: pure rules in `state.ts` with tests, Three.js in `view.ts`, wiring in `index.ts`. All games share the Block Arcade look: voxel blocks, few colors from the palette in `src/games/core/neon.ts`, matte materials and the Silkscreen pixel font. The shared cabinet handles HUD, difficulty, pause, best scores and achievements (stored in `localStorage`).

Games: Data Snake, Pac-Bug, Monolith Breaker, Zero-Day Sweeper, Request Invaders, Catch the Bug, Incident Commander, Deploy Hero and Keep the Service Alive.

## 3D worlds

Reached from the header ("Mundo 3D"). Toon-shaded and hand-inked, built only from procedural geometry, canvas textures and Web Audio. Each world loads only when the traveler goes there:

- **Qhapaq Ñan** (`/es/world/`, `/en/world/`): a floating-island title, then a third-person climb of an Andean mountain along the Inca road. One tambo per company in chronological order, the Q'eswachaka bridge of artifacts, the arcade tambo with playable cabinets, the AI Intihuatana, the chasqui post and the summit. Fauna, people, weather, real moon phases and seasons, a time trial, missions and secrets.
- **Wasi** (inside the mountain page): the Andean house at the trailhead. Its interior loads on approach and holds the career, education and CV, contact and the passport table; you can sit on the bench and at the desk.
- **Antisuyu** (`/es/world/selva/`, `/en/world/selva/`): reached through a stone punku at the trailhead. A long road through the lowland jungle beside a river: the trader's boat (uses), the story maloca (blog), the project stilt houses, the floating arcade, a canoe you paddle, a canopy walkway and the macaw clay lick, with Amazon wildlife.

Shared across the worlds: the passport (one page per world), the postcard, the paper map with fast travel, keyboard, mouse, touch and gamepad controls, an automatic quality governor, and a full accessible text mode for each world.

## Deploy

- `.github/workflows/ci.yml`: lint, types, unit tests, build, Lighthouse CI and Playwright smoke tests on pull requests and non-main pushes.
- `.github/workflows/deploy.yml`: builds with `withastro/action` (Bun) and publishes with `actions/deploy-pages` on every push to `main`, or manually.
- `.github/workflows/lighthouse.yml`: Lighthouse against the live site after each deploy, weekly and on demand. Real-user Core Web Vitals go to Umami.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**, and make `main` the default branch.

## License

MIT
