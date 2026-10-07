# AGENTS.md

Guide for coding agents working on this repository. Read [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together. Other sources: [README.md](README.md) for commands and content editing, [DESIGN.md](DESIGN.md) for the visual system, [PRODUCT.md](PRODUCT.md) for audience and positioning, and [src/games/README.md](src/games/README.md) for authoring arcade games.

## Project in one paragraph

This is the personal site of Luis Diego, a static Astro site deployed to GitHub Pages. It has bilingual routes (`/es/…`, `/en/…`). The career is told as an Andean khipu. The site also has a blog, projects, a CV, a `/uses` page, an arcade of nine Three.js games, and "KHIPU · Qhapaq Ñan", an explorable 3D world in which the traveler climbs a mountain past one tambo per company. Everything visual and audible in the games and the world is procedural: geometry, canvas textures and Web Audio.

## Toolchain

- **Runtime and package manager:** Bun 1.3.14 (the version CI pins). Node >= 22.12.
- **Language:** TypeScript strict (`astro/tsconfigs/strict`); `bun` types are available globally.
- **Lint and format:** Biome, with 2-space indent, line width 120 and organize-imports on. Biome does not check Markdown.
- **Libraries:** Astro 7, Three.js r186 and `web-vitals`. Do not add runtime dependencies without asking.

## Commands

| Command | Use |
| --- | --- |
| `bun run dev` | Dev server on `localhost:4321` |
| `bun run check` | `astro check` + `biome check .` |
| `bun run format` | Biome autofix (formatting + import order) |
| `bun test src` | Unit tests (bun:test, colocated `*.test.ts`) |
| `bunx tsc --noEmit -p .` | Fast type check without Astro |
| `bun run build` | Static build into `dist/` |
| `bun run test:e2e` | Playwright smoke tests against `astro preview` of `dist/` |
| `bun run arcade:dev --port 5180` | Game harness: `/?game=<slug>&lang=es&theme=dark&autostart=1` |
| `bunx vite --config src/world/dev/vite.config.ts --port 5191` | World harness: `/?lang=es` (`&skip=1` skips the title) |
| `bunx vite --config src/world/content-dev/vite.config.ts --port 5192` | World content with a mock `WorldEnv` |

### Definition of done

Run these in order and fix everything before reporting a task as finished:

1. `bun run check`
2. `bun test src`
3. `bun run build`
4. `bun run test:e2e` (needs the build from step 3)

For visual changes, also take screenshots and look at them. Use the harnesses, the `scripts/shot-*.ts` helpers, or Playwright. Check both languages, light and dark theme where the page has them, and a phone viewport.

### E2E pitfall

Outside CI, `playwright.config.ts` reuses any server already listening on port 4321. If the owner's `astro dev` is running there, the tests hit that server instead of the fresh build and can give stale results. To run against your own build on another port, use a throwaway config. Put it in your scratch space or delete it afterwards, and do not commit it:

```ts
// .pw-alt.config.ts
import base from "./playwright.config";
export default {
  ...base,
  use: { ...base.use, baseURL: "http://localhost:4399" },
  webServer: { command: "bunx astro preview --port 4399 --ignore-lock", port: 4399, reuseExistingServer: false },
};
```

Run it with `bunx playwright test -c .pw-alt.config.ts`.

## Hard rules

- **Git.** Never commit, push, or open PRs unless the owner asks in that conversation. The owner commits and pushes themselves.
- **Truthful content.**
  - Claims about the owner come only from `src/data/career.ts`, `src/data/uses.ts` and the resume PDFs in `public/resume/`.
  - Never invent employers, metrics, dates or tools.
  - NPC dialog, exhibits, the text mode and OG cards all read from these sources.
- **Procedural only.** The world, the arcade and the audio fetch no images, models, audio or fonts at runtime: they use geometry, canvas textures and Web Audio. Site fonts come from the Astro Fonts API (`astro.config.mjs`), and OG images use `@fontsource` files at build time.
- **Bilingual everything.**
  - Every user-facing string exists in Spanish and English: `src/i18n/ui.ts` for the site, and `{ es, en }` objects (type `L`) in the world and games.
  - Blog posts come in pairs in `src/content/blog/{es,en}/` that share a `translationKey`.
  - Spanish is the default locale.
- **Quality over speed.** Performance work must not visibly lower quality. Examples are cutting resolution, removing the ink outline, thinning vegetation or dropping shadows by default. Prefer draw-call reductions (merging, instancing, distance culling) and leave quality steps to the auto governor in `src/world/quality.ts`.
- **Stable contracts.** Do not change `src/world/contract.ts`, `src/world/events.ts` (beyond adding events) or `src/games/core/types.ts` without a reason you state in your report. Many modules depend on them.
- **Secrets.** There are none in the repository. `.env` files are gitignored and not used. The form endpoint, analytics ID and other public values live in `src/data/site.ts`.
- **Accessibility.**
  - Content stays in semantic HTML.
  - The 3D world has a full text mode (`src/world/textmode.ts`) that must keep describing what the world actually does.
  - Respect `prefers-reduced-motion`.
  - Keep keyboard and gamepad paths working.

## Code conventions

- **Pure logic apart from rendering.** Rules, math and state machines go in DOM-free and Three-free modules with a colocated `*.test.ts`. Examples: `layout.ts`, `fauna-sim.ts`, `quality.ts`, `calendar.ts`, `ambient/*/logic.ts`, and `games/<slug>/state.ts`. Three.js code goes in view and builder files.
- **World modules do not import each other.** They communicate through typed window events in `src/world/events.ts` (`emit` / `on`), the `WorldEnv` contract, and shared registries such as `creatures.ts`.
- **One feature, one place.**
  - A new world system is an ambient in `src/world/ambient/<name>.ts`, with helpers in `src/world/ambient/<name>/`.
  - A new game is a folder in `src/games/<slug>/`.
  - See the extension recipes in ARCHITECTURE.md.
- **Comments.** Start each module with a doc block that explains what it is and why, written in English like the rest of the codebase. Comment non-obvious decisions such as coordinates, magic numbers and performance trade-offs. Do not narrate the obvious.
- **Draw calls.** Instance repeated meshes, merge flat-colored toon parts with `src/world/merge-colors.ts`, and register small far details with the distance cull.
- **Storage.**
  - Keep per-visitor state in `localStorage` under a `ldiego73-*` key, with a version suffix when the shape can change.
  - Always wrap storage access in `try/catch`.
  - Never add a second source of truth for something that already has one. For example, visited stations come only from the passport.

## Working style the owner expects

- **Language.** The owner writes in Spanish. Reply in Spanish. Code, comments and docs stay in English.
- **Parallel work.** Large batches are often split across parallel agents. Keep each agent's files disjoint, and resolve cross-file conflicts in the lead session.
- **Verification before claims.** Show screenshots for visual work, and report test or build failures as they are.
