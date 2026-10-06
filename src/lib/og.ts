/**
 * Social share images (Open Graph, 1200×630), rendered at build time with satori (layout → SVG) and resvg
 * (SVG → PNG). One image per page and language, served from /og/<lang>/<page>.png (src/pages/og/[...route].png.ts).
 * Same visual language as the site: night background, bone ink, khipu dyes, Archivo / JetBrains Mono / Silkscreen.
 * Screenshots of the 3D world, the arcade hall and each game live in src/assets/og (captured once, committed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { COMPANIES, type Dye } from "../data/career";
import { SITE } from "../data/site";
import { NEON } from "../games/core/neon";
import type { GameMeta } from "../games/core/types";
import type { Lang } from "../i18n/ui";
import type { Repo } from "./github";
import type { PostItem } from "./posts";

export const OG_W = 1200;
export const OG_H = 630;

const C = {
  bg: "#13151b",
  panel: "#1b1e26",
  line: "#2c303b",
  fg: "#ece8e0",
  muted: "#a19e95",
  red: "#d0444b",
  indigo: "#6b7fdc",
  ochre: "#dda63c",
  turq: "#38b8a7",
  alpaca: "#a8825f",
};
const DYE: Record<Dye, string> = { red: C.red, indigo: C.indigo, ochre: C.ochre, turq: C.turq, alpaca: C.alpaca };

// ---------------------------------------------------------------- tiny element builder for satori
type Style = Record<string, string | number>;
interface El {
  type: string;
  props: { style?: Style; children?: Child | Child[]; src?: string; width?: number; height?: number };
}
type Child = El | string | null | false;
const h = (type: string, style: Style, ...children: Child[]): El => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null && c !== false) },
});
const img = (src: string, style: Style): El => ({ type: "img", props: { src, style } });

// ---------------------------------------------------------------- assets
const root = process.cwd();
const fontFile = (pkg: string, file: string) =>
  readFileSync(join(root, "node_modules", "@fontsource", pkg, "files", file));
let fonts: Parameters<typeof satori>[1]["fonts"] | null = null;
const loadFonts = () =>
  (fonts ??= [
    { name: "Archivo", data: fontFile("archivo-narrow", "archivo-narrow-latin-700-normal.woff"), weight: 700 },
    { name: "Archivo", data: fontFile("archivo-narrow", "archivo-narrow-latin-600-normal.woff"), weight: 600 },
    { name: "Hanken", data: fontFile("hanken-grotesk", "hanken-grotesk-latin-400-normal.woff"), weight: 400 },
    { name: "Mono", data: fontFile("jetbrains-mono", "jetbrains-mono-latin-500-normal.woff"), weight: 500 },
    { name: "Pixel", data: fontFile("silkscreen", "silkscreen-latin-700-normal.woff"), weight: 700 },
  ]);
const shot = (name: string) =>
  `data:image/jpeg;base64,${readFileSync(join(root, "src", "assets", "og", `${name}.jpg`)).toString("base64")}`;

// ---------------------------------------------------------------- shared pieces
const COPY = {
  es: {
    role: "Engineering Manager · Principal Architect",
    years: "años",
    companies: "empresas",
    min: "min de lectura",
    world: "Camina mi carrera: un tambo por empresa, del valle a la cumbre.",
    worldTag: "Mundo 3D",
    arcade: "9 juegos en bloques sobre bugs, incidentes y despliegues.",
    play: "Juega en el navegador",
    repos: "en GitHub",
    star: "estrella",
    stars: "estrellas",
    cv: "Hoja de vida",
  },
  en: {
    role: "Engineering Manager · Principal Architect",
    years: "years",
    companies: "companies",
    min: "min read",
    world: "Walk my career: one tambo per company, from the valley to the summit.",
    worldTag: "3D world",
    arcade: "9 blocky games about bugs, incidents and deploys.",
    play: "Play in the browser",
    repos: "on GitHub",
    star: "star",
    stars: "stars",
    cv: "Résumé",
  },
} as const;

const jobs = COMPANIES.filter((c) => !c.education);
const firstYear = Math.min(...jobs.flatMap((c) => c.stages.map((s) => Number(s.start.slice(0, 4)))));
const years = () => new Date().getFullYear() - firstYear;

/** Section label: dye dot + mono caps. */
const label = (text: string, color: string) =>
  h(
    "div",
    { alignItems: "center", gap: 14 },
    h("div", { width: 14, height: 14, borderRadius: 7, background: color }),
    h("div", { fontFamily: "Mono", fontSize: 22, letterSpacing: 3, color: C.muted, textTransform: "uppercase" }, text),
  );

/** Bottom signature line. */
const footer = (color = C.muted) =>
  h(
    "div",
    {
      position: "absolute",
      left: 64,
      right: 64,
      bottom: 44,
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: "Mono",
      fontSize: 22,
      color,
    },
    h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 28, color: C.fg }, SITE.name),
    h("div", {}, "ldiego73.github.io"),
  );

/** A pendant cord with knots (khipu), drawn with boxes. */
const cord = (color: string, length: number, knots: number[], thick = 6) =>
  h(
    "div",
    { position: "relative", width: 22, height: length, justifyContent: "center" },
    h("div", { width: thick, height: length, background: color, borderRadius: thick }),
    ...knots.map((y) =>
      h("div", {
        position: "absolute",
        top: y,
        left: 11 - 9,
        width: 18,
        height: 14,
        borderRadius: 7,
        background: color,
        border: `2px solid ${C.bg}`,
      }),
    ),
  );

const fitSize = (text: string, max: number, min: number, perChar: number) =>
  Math.max(min, Math.min(max, Math.round(max - Math.max(0, text.length - 18) * perChar)));

const frame = (...children: Child[]) =>
  h(
    "div",
    {
      width: OG_W,
      height: OG_H,
      position: "relative",
      background: C.bg,
      color: C.fg,
      fontFamily: "Hanken",
      padding: "56px 64px",
      flexDirection: "column",
    },
    ...children,
  );

// ---------------------------------------------------------------- templates
export function homeCard(lang: Lang, title: string): El {
  // "Cada nudo, un sistema en producción." → last two words in red, like the hero.
  const words = title.toUpperCase().split(" ");
  const head = words.slice(0, -2).join(" ");
  const tail = words.slice(-2).join(" ");
  const cords = jobs.map((c) => {
    const knots = Math.min(
      4,
      c.stages.reduce((n, s) => n + s.knots.length, 0),
    );
    const len = 230 + (c.name.length % 4) * 30;
    return h(
      "div",
      { flexDirection: "column", alignItems: "center", width: 74 },
      h("div", { fontFamily: "Mono", fontSize: 15, color: C.fg, textAlign: "center" }, c.name.split(" ")[0] ?? c.name),
      h(
        "div",
        { fontFamily: "Mono", fontSize: 14, color: C.muted, marginBottom: 10 },
        c.stages[0]?.start.slice(0, 4) ?? "",
      ),
      cord(
        DYE[c.dye],
        len,
        Array.from({ length: knots }, (_, k) => 40 + k * 52),
      ),
    );
  });
  return frame(
    h(
      "div",
      { flexDirection: "row", flexGrow: 1, alignItems: "center", gap: 30 },
      h(
        "div",
        { flexDirection: "column", width: 520 },
        h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 92, lineHeight: 0.95, color: C.fg }, head),
        h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 92, lineHeight: 0.95, color: C.red }, tail),
        h("div", { marginTop: 26, fontSize: 26, color: C.muted }, COPY[lang].role),
      ),
      h(
        "div",
        { flexDirection: "column", flexGrow: 1 },
        h("div", { height: 6, background: C.fg, borderRadius: 3, opacity: 0.9, marginBottom: -2 }),
        h("div", { flexDirection: "row", justifyContent: "space-between", marginTop: -46 }, ...cords),
      ),
    ),
    footer(),
  );
}

export function postCard(lang: Lang, post: Pick<PostItem, "title" | "description" | "date" | "minutes" | "tags">): El {
  const date = post.date.toLocaleDateString(lang === "es" ? "es-PE" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const meta = [`Blog · ${date}`, post.minutes ? `${post.minutes} ${COPY[lang].min}` : ""].filter(Boolean).join(" · ");
  const size = fitSize(post.title, 78, 50, 1.3);
  return frame(
    label(meta, C.red),
    h(
      "div",
      { flexDirection: "row", flexGrow: 1, alignItems: "center", gap: 48 },
      h(
        "div",
        { flexDirection: "column", flexGrow: 1, flexShrink: 1 },
        h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: size, lineHeight: 1.02 }, post.title),
        h(
          "div",
          { marginTop: 24, fontSize: 27, lineHeight: 1.4, color: C.muted, maxHeight: 115, overflow: "hidden" },
          post.description,
        ),
        h(
          "div",
          { marginTop: 22, gap: 10, flexWrap: "wrap" },
          ...post.tags.slice(0, 4).map((t) =>
            h(
              "div",
              {
                fontFamily: "Mono",
                fontSize: 18,
                color: C.fg,
                border: `2px solid ${C.line}`,
                borderRadius: 20,
                padding: "4px 14px",
              },
              t,
            ),
          ),
        ),
      ),
      h(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 0 },
        h("div", { width: 90, height: 6, background: C.fg, borderRadius: 3 }),
        cord(C.red, 300, [40, 92, 144, 220]),
      ),
    ),
    footer(),
  );
}

export function listCard(o: {
  title: string;
  lede: string;
  dye: string;
  items: Array<{ text: string; meta?: string; color?: string }>;
}): El {
  return frame(
    label(o.title, o.dye),
    h(
      "div",
      { flexDirection: "row", flexGrow: 1, alignItems: "center", gap: 56 },
      h(
        "div",
        { flexDirection: "column", width: 470 },
        h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 96, lineHeight: 1 }, o.title),
        h("div", { marginTop: 22, fontSize: 27, lineHeight: 1.4, color: C.muted }, o.lede),
      ),
      h(
        "div",
        { flexDirection: "column", flexGrow: 1, gap: 14 },
        ...o.items.slice(0, 4).map((it) =>
          h(
            "div",
            {
              alignItems: "center",
              gap: 18,
              background: C.panel,
              border: `2px solid ${C.line}`,
              borderRadius: 10,
              padding: "16px 20px",
            },
            h("div", { width: 8, height: 44, borderRadius: 4, background: it.color ?? o.dye }),
            h(
              "div",
              { flexDirection: "column", flexGrow: 1, flexShrink: 1 },
              h("div", { fontFamily: "Archivo", fontWeight: 600, fontSize: 28, lineHeight: 1.15 }, it.text),
              it.meta ? h("div", { fontFamily: "Mono", fontSize: 18, color: C.muted, marginTop: 4 }, it.meta) : null,
            ),
          ),
        ),
      ),
    ),
    footer(),
  );
}

export function projectsCard(lang: Lang, title: string, lede: string, repos: Repo[]): El {
  const colors = [C.ochre, C.turq, C.indigo, C.red];
  return listCard({
    title,
    lede,
    dye: C.ochre,
    items: repos.slice(0, 4).map((r, i) => ({
      text: r.name,
      // No ★: the subset fonts have no star glyph.
      meta: [r.language, `${r.stars} ${r.stars === 1 ? COPY[lang].star : COPY[lang].stars}`, COPY[lang].repos]
        .filter(Boolean)
        .join(" · "),
      color: colors[i % colors.length],
    })),
  });
}

/** Full-bleed screenshot with a dark gradient and copy on the left. */
function shotCard(
  bg: string,
  tag: string,
  title: string,
  text: string,
  accent: string,
  titleFont = "Archivo",
  /** Where the screenshot starts (px from the left); the copy sits on the dark band before it. */
  imageLeft = 0,
): El {
  return h(
    "div",
    { width: OG_W, height: OG_H, position: "relative", background: C.bg, color: C.fg, fontFamily: "Hanken" },
    img(bg, {
      position: "absolute",
      left: imageLeft,
      top: 0,
      width: OG_W - imageLeft,
      height: OG_H,
      objectFit: "cover",
      objectPosition: "center",
    }),
    h("div", {
      position: "absolute",
      left: 0,
      top: 0,
      width: OG_W,
      height: OG_H,
      backgroundImage: imageLeft
        ? `linear-gradient(90deg, rgba(19,21,27,1) 0%, rgba(19,21,27,1) ${Math.round((imageLeft / OG_W) * 100)}%, rgba(19,21,27,0) ${Math.round((imageLeft / OG_W) * 100) + 16}%)`
        : "linear-gradient(90deg, rgba(19,21,27,0.96) 0%, rgba(19,21,27,0.86) 38%, rgba(19,21,27,0) 72%)",
    }),
    h(
      "div",
      {
        position: "absolute",
        left: 64,
        top: 56,
        bottom: 110,
        width: imageLeft ? imageLeft - 110 : 560,
        flexDirection: "column",
        justifyContent: "center",
      },
      label(tag, accent),
      h(
        "div",
        {
          marginTop: 22,
          fontFamily: titleFont,
          fontWeight: 700,
          fontSize: titleFont === "Pixel" ? 78 : 90,
          lineHeight: 1,
          color: C.fg,
        },
        title,
      ),
      h("div", { marginTop: 24, fontSize: 29, lineHeight: 1.4, color: "#d8d3c8" }, text),
    ),
    footer("#d8d3c8"),
  );
}

export const worldCard = (lang: Lang) =>
  shotCard(shot("world"), COPY[lang].worldTag, "KHIPU · Qhapaq Ñan", COPY[lang].world, C.turq);

export const arcadeCard = (lang: Lang, lede: string) =>
  shotCard(shot("arcade"), COPY[lang].play, "ARCADE", lede || COPY[lang].arcade, C.ochre, "Pixel", 620);

export function gameCard(lang: Lang, game: GameMeta): El {
  const accent = NEON[game.neon as keyof typeof NEON] ?? C.ochre;
  return frame(
    label(`Arcade · ${COPY[lang].play}`, accent),
    h(
      "div",
      { flexDirection: "row", flexGrow: 1, alignItems: "center", gap: 44 },
      h(
        "div",
        { flexDirection: "column", width: 440 },
        h(
          "div",
          { fontFamily: "Pixel", fontWeight: 700, fontSize: fitSize(game.title[lang], 64, 40, 2.4), lineHeight: 1.05 },
          game.title[lang],
        ),
        h("div", { marginTop: 22, fontSize: 30, lineHeight: 1.35, color: C.muted }, game.tagline[lang]),
      ),
      h(
        "div",
        // Explicit size: the frame's padding doesn't clip children in satori.
        {
          width: OG_W - 128 - 440 - 44,
          border: `6px solid ${accent}`,
          borderRadius: 8,
          overflow: "hidden",
          height: 400,
        },
        img(shot(`game-${game.slug}`), { width: "100%", height: "100%", objectFit: "cover" }),
      ),
    ),
    footer(),
  );
}

export function cvCard(lang: Lang): El {
  return frame(
    label(COPY[lang].cv, C.red),
    h(
      "div",
      { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
      h("div", { fontFamily: "Archivo", fontWeight: 700, fontSize: 110, lineHeight: 1 }, SITE.name),
      h("div", { marginTop: 14, fontSize: 34, color: C.muted }, COPY[lang].role),
      h(
        "div",
        { marginTop: 30, fontFamily: "Mono", fontSize: 24, color: C.fg, gap: 28 },
        h("div", {}, `${years()} ${COPY[lang].years}`),
        h("div", { color: C.muted }, "·"),
        h("div", {}, `${jobs.length} ${COPY[lang].companies}`),
      ),
      h(
        "div",
        { marginTop: 30, gap: 12, flexWrap: "wrap" },
        ...jobs.map((c) =>
          h(
            "div",
            {
              alignItems: "center",
              gap: 10,
              border: `2px solid ${C.line}`,
              borderRadius: 24,
              padding: "6px 16px",
              fontFamily: "Mono",
              fontSize: 20,
            },
            h("div", { width: 12, height: 12, borderRadius: 6, background: DYE[c.dye] }),
            c.name,
          ),
        ),
      ),
    ),
    footer(),
  );
}

// ---------------------------------------------------------------- render
export async function renderPng(el: El): Promise<Buffer> {
  const svg = await satori(el as unknown as Parameters<typeof satori>[0], {
    width: OG_W,
    height: OG_H,
    fonts: loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_W } }).render().asPng();
}

/** Public path of a page's share image: "/es/blog/foo/" → "/og/es/blog/foo.png", "/es/" → "/og/es/home.png". */
export function ogPathFor(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/");
  if (parts.length === 1 && (parts[0] === "es" || parts[0] === "en")) return `/og/${parts[0]}/home.png`;
  return `/og/${clean}.png`;
}
