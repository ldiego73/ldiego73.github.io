/**
 * Share images, one per page and language (see src/lib/og.ts). Prerendered to static PNGs at build:
 * /og/<lang>/home.png, /og/<lang>/blog.png, /og/<lang>/blog/<slug>.png, /og/<lang>/projects.png,
 * /og/<lang>/arcade.png, /og/<lang>/arcade/<game>.png, /og/<lang>/world.png, /og/<lang>/cv.png.
 */

import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
import { GAMES } from "../../games/registry";
import { LANGS, type Lang, t } from "../../i18n/ui";
import { getRepos } from "../../lib/github";
import {
  arcadeCard,
  cvCard,
  gameCard,
  homeCard,
  listCard,
  postCard,
  projectsCard,
  renderPng,
  worldCard,
} from "../../lib/og";
import { getPosts } from "../../lib/posts";

type Card = () => Promise<Parameters<typeof renderPng>[0]>;

export const getStaticPaths = (async () => {
  const repos = await getRepos();
  const entries = await getCollection("blog", (p) => !p.data.draft);
  const out: Array<{ params: { route: string }; props: { card: Card } }> = [];
  const add = (route: string, card: Card) => out.push({ params: { route }, props: { card } });
  for (const lang of LANGS as readonly Lang[]) {
    const posts = await getPosts(lang);
    add(`${lang}/home`, async () => homeCard(lang, t(lang, "hero.title")));
    add(`${lang}/blog`, async () =>
      listCard({
        title: t(lang, "blog.title"),
        lede: t(lang, "blog.lede"),
        dye: "#d0444b",
        items: posts.slice(0, 4).map((p) => ({
          text: p.title,
          meta: `${p.date.toISOString().slice(0, 10)} · ${p.source === "medium" ? "Medium" : "Blog"}`,
          color: p.source === "medium" ? "#6b7fdc" : "#d0444b",
        })),
      }),
    );
    add(`${lang}/projects`, async () => projectsCard(lang, t(lang, "projects.title"), t(lang, "projects.lede"), repos));
    add(`${lang}/arcade`, async () => arcadeCard(lang, t(lang, "arcade.lede")));
    for (const g of GAMES) add(`${lang}/arcade/${g.slug}`, async () => gameCard(lang, g));
    add(`${lang}/world`, async () => worldCard(lang));
    add(`${lang}/uses`, async () =>
      listCard({
        title: lang === "es" ? "Lo que uso" : "Uses",
        lede:
          lang === "es"
            ? "Mi stack, mis herramientas y cómo trabajo con agentes de IA."
            : "My stack, my tools and how I work with AI agents.",
        dye: "#6b7fdc",
        items: [
          {
            text: lang === "es" ? "tech-lead + 10 agentes" : "tech-lead + 10 agents",
            meta: lang === "es" ? "De SDLC a AIDLC" : "From SDLC to AIDLC",
            color: "#6b7fdc",
          },
          { text: "Claude Code · Codex · Orca · Herdr", meta: "agents & orchestration", color: "#38b8a7" },
          { text: "Zed · Cursor · Ghostty", meta: "editor & terminal", color: "#dda63c" },
          { text: "Astro · Three.js · Bun", meta: lang === "es" ? "este sitio" : "this site", color: "#d0444b" },
        ],
      }),
    );
    add(`${lang}/cv`, async () => cvCard(lang));
    // Site posts only (Medium posts open on Medium with their own image).
    for (const e of entries.filter((e) => e.id.startsWith(`${lang}/`))) {
      const slug = e.id.split("/").slice(1).join("/");
      const item = posts.find((p) => p.href.endsWith(`/blog/${slug}/`));
      add(`${lang}/blog/${slug}`, async () =>
        postCard(lang, {
          title: e.data.title,
          description: e.data.description,
          date: e.data.date,
          minutes: item?.minutes,
          tags: e.data.tags ?? [],
        }),
      );
    }
  }
  return out;
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderPng(await (props.card as Card)());
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
};
