import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE } from "../../data/site";
import { LANGS, type Lang, t } from "../../i18n/ui";
import { getPosts } from "../../lib/posts";

export const getStaticPaths = () => LANGS.map((lang) => ({ params: { lang } }));

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const posts = await getPosts(lang);
  return rss({
    title: `${SITE.name} · ${t(lang, "blog.title")}`,
    description: t(lang, "blog.lede"),
    site: context.site ?? SITE.url,
    items: posts.map((p) => ({ title: p.title, description: p.description, pubDate: p.date, link: p.href })),
    customData: `<language>${lang}</language>`,
    // Opened in a browser, the feed renders as a styled page (public/rss.xsl) instead of raw XML.
    stylesheet: "/rss.xsl",
  });
}
