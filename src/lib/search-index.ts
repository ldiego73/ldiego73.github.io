/**
 * Build-time index for the ⌘K command palette: commands, pages, posts (site + Medium), case studies,
 * repos and arcade games, in the page's language. Serialized into the page as JSON (CommandPalette.astro).
 */
import { ARTIFACTS } from "../data/career";
import { SITE } from "../data/site";
import { GAMES } from "../games/registry";
import { type Lang, t } from "../i18n/ui";
import { getRepos } from "./github";
import { getPosts } from "./posts";

export type PaletteGroup = "commands" | "pages" | "posts" | "projects" | "repos" | "games";
export type PaletteAction = "theme" | "lang" | "copy-email";

export interface PaletteItem {
  g: PaletteGroup;
  /** Title. */
  t: string;
  /** Subtitle (date, tech, tagline…). */
  s?: string;
  /** Link target; external links open in a new tab. */
  h?: string;
  ext?: boolean;
  /** Client-side action instead of a link. */
  a?: PaletteAction;
  /** Extra search words (other language, synonyms). */
  k?: string;
}

const COPY = {
  es: {
    world: "Ir al mundo 3D",
    worldK: "khipu qhapaq ñan 3d world mundo juego",
    theme: "Cambiar tema (claro / oscuro)",
    themeK: "theme dark light modo oscuro claro",
    lang: "Switch to English",
    langK: "idioma language english inglés",
    cv: "Descargar CV (PDF)",
    cvK: "resume curriculum hoja de vida",
    book: "Agendar una consultoría · 60 min",
    bookK: "calendly reunión meeting llamada",
    email: "Copiar mi correo",
    emailK: "email mail contacto",
    rss: "Suscribirme por RSS",
    rssK: "feed blog suscripción",
    home: "Inicio",
    story: "Historia",
    artifacts: "Artefactos",
    contact: "Contacto",
    cvPage: "Hoja de vida (web)",
  },
  en: {
    world: "Go to the 3D world",
    worldK: "khipu qhapaq ñan 3d world mundo game",
    theme: "Toggle theme (light / dark)",
    themeK: "theme dark light mode",
    lang: "Cambiar a español",
    langK: "language idioma spanish español",
    cv: "Download résumé (PDF)",
    cvK: "resume cv curriculum",
    book: "Book a consult · 60 min",
    bookK: "calendly meeting call",
    email: "Copy my email",
    emailK: "email mail contact",
    rss: "Subscribe via RSS",
    rssK: "feed blog subscribe",
    home: "Home",
    story: "Story",
    artifacts: "Artifacts",
    contact: "Contact",
    cvPage: "Résumé (web)",
  },
} as const;

const cache = new Map<Lang, Promise<PaletteItem[]>>();

export function paletteIndex(lang: Lang): Promise<PaletteItem[]> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const p = (async () => {
    const c = COPY[lang];
    const base = `/${lang}/`;
    const fmt = (d: Date) =>
      d.toLocaleDateString(lang === "es" ? "es-PE" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const items: PaletteItem[] = [
      { g: "commands", t: c.world, h: `${base}world/`, k: c.worldK },
      { g: "commands", t: c.theme, a: "theme", k: c.themeK },
      { g: "commands", t: c.lang, a: "lang", k: c.langK },
      { g: "commands", t: c.cv, h: SITE.resume[lang], k: c.cvK },
      { g: "commands", t: c.book, h: SITE.calendly, ext: true, k: c.bookK },
      { g: "commands", t: c.email, s: SITE.email, a: "copy-email", k: c.emailK },
      { g: "commands", t: c.rss, h: `${base}rss.xml`, k: c.rssK },
      { g: "pages", t: c.home, h: base },
      { g: "pages", t: c.story, h: `${base}#story` },
      { g: "pages", t: c.artifacts, h: `${base}#artifacts` },
      { g: "pages", t: t(lang, "nav.projects"), h: `${base}projects/` },
      { g: "pages", t: t(lang, "nav.blog"), h: `${base}blog/` },
      {
        g: "pages",
        t: t(lang, "nav.uses"),
        h: `${base}uses/`,
        k: "uses stack tools herramientas ia ai agents agentes",
      },
      { g: "pages", t: t(lang, "nav.arcade"), h: `${base}arcade/`, k: "games juegos" },
      { g: "pages", t: c.contact, h: `${base}#contact` },
      { g: "pages", t: c.cvPage, h: `${base}cv/`, k: "cv resume" },
    ];
    for (const p of await getPosts(lang))
      items.push({
        g: "posts",
        t: p.title,
        s: `${fmt(p.date)} · ${p.source === "medium" ? "Medium" : "Blog"}`,
        h: p.href,
        ext: p.source === "medium",
        k: [p.description, ...p.tags].join(" "),
      });
    for (const a of ARTIFACTS)
      items.push({ g: "projects", t: a.name[lang], s: a.tech, h: `${base}projects/#${a.id}`, k: a.summary[lang] });
    for (const r of (await getRepos()).slice(0, 12))
      items.push({
        g: "repos",
        t: r.name,
        s: [r.language, r.description].filter(Boolean).join(" · "),
        h: r.url,
        ext: true,
        k: r.topics.join(" "),
      });
    for (const g of GAMES)
      items.push({ g: "games", t: g.title[lang], s: g.tagline[lang], h: `${base}arcade/${g.slug}/`, k: g.marquee });
    return items;
  })();
  cache.set(lang, p);
  return p;
}
