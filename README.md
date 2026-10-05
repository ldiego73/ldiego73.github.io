# ldiego73.github.io

Personal site of Luis Diego. The career is told as a khipu, the Andean record of cords and knots: one cord per company, a subsidiary cord per stage, knots for shipped work and top cords for artifacts that span companies. Includes a bilingual blog, projects, a printable CV, a 3D arcade with nine games and an explorable 3D world ("Khipu Neón") with a playable character.

Built with [Astro](https://astro.build) and [Three.js](https://threejs.org), managed with [Bun](https://bun.sh), deployed to GitHub Pages with GitHub Actions.

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
| `bun run test:e2e` | Playwright smoke tests against the build (pages, i18n, theme, all games) |
| `bun run arcade:dev --port 5180` | Game harness: `/?game=<slug>&lang=es&theme=dark&autostart=1` |
| `bunx vite --config src/world/dev/vite.config.ts --port 5191` | 3D world harness: `/?lang=es` (`&skip=1` starts in the world) |

## Structure

```
src/
  data/career.ts        Companies, stages, knots and cross-company artifacts (single source of truth)
  data/site.ts          Email, Calendly, form endpoint, resume paths, social links
  i18n/ui.ts            UI strings (es, en) and helpers
  lib/khipu/            Khipu model (tested) and Three.js scene with rope physics
  lib/signal.ts         "Del ruido a la señal" glyph renderer
  lib/github.ts         Public repos at build time (never fails the build)
  lib/medium.ts         Medium RSS at build time (never fails the build)
  content/blog/{es,en}/ MDX posts; translationKey links both languages
  games/                Arcade: core contract, neon kit, shell, store, registry and one folder per game
  arcade-lobby/         3D arcade hall (cabinets, attract screens), shared with the world
  world/                Khipu Neón: explorable 3D world (intro, avatar, zones, HUD)
  pages/[lang]/         Home, projects, blog, arcade, world, cv, rss.xml
scripts/                Screenshot, resume PDF and social image helpers
e2e/                    Playwright smoke tests
```

## Content

- **Experience:** edit `src/data/career.ts`. The khipu, chapters, flat view and CV all read from it.
- **Blog:** add `src/content/blog/es/<slug>.mdx` and `src/content/blog/en/<slug>.mdx` with the same `translationKey`. Medium posts from `@ldiego73` are merged in at build time.
- **Social links:** append to `SOCIALS` in `src/data/site.ts`.
- **Contact form:** set `formEndpoint` in `src/data/site.ts` (Getform, Formspree or similar). While empty, the form opens a pre-filled email instead.
- **Resume:** `public/resume/luis-diego-cv-es.pdf` is the original. Regenerate the English one after editing career data: build, run `bunx astro preview --port 4330 --ignore-lock`, then `bun scripts/resume-pdf.ts 4330`.

## Arcade

Games live in `src/games/<slug>/` and follow `src/games/README.md`: pure rules in `state.ts` with tests, Three.js in `view.ts`, wiring in `index.ts`. All games share the Neon Cabinet look (`src/games/core/neon.ts`, bloom in `core/stage.ts`) and three difficulty levels. The shared cabinet handles HUD, difficulty, pause, best scores and achievements (stored in `localStorage`).

Games: Data Snake, Pac-Bug, Monolith Breaker, Zero-Day Sweeper, Request Invaders, Catch the Bug, Incident Commander, Deploy Hero and Keep the Service Alive.

## 3D world

`/es/world/` and `/en/world/`: an opt-in world reached from the header ("Mundo 3D"). A desk intro (press Enter), then a character walks the career as cords (Story Walk), the Artifact Bridge, the Arcade Hall (real games via `mountCabinet`), the AI Tower, the Contact Beacon and "under construction" plots. Keyboard, mouse, touch joystick and a guided tour. Code in `src/world/`.

## Deploy

- `.github/workflows/ci.yml`: lint, types, unit tests, build and Playwright smoke tests on pull requests and non-main pushes.
- `.github/workflows/deploy.yml`: builds with `withastro/action` (Bun) and publishes with `actions/deploy-pages` on every push to `main`, or manually.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**, and make `main` the default branch.

## License

MIT
