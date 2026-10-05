import { SITE } from "../data/site";

export interface MediumPost {
  title: string;
  url: string;
  date: Date;
  tags: string[];
  excerpt: string;
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ?? "";
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Parses a Medium RSS feed. Exported for tests. */
export function parseMediumFeed(xml: string): MediumPost[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item = ""]) => {
    const html = tag(item, "content:encoded");
    const text = decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
    return {
      title: decode(tag(item, "title")),
      url: tag(item, "link").split("?")[0] ?? "",
      date: new Date(tag(item, "pubDate")),
      tags: [...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) =>
        decode((m[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "")),
      ),
      excerpt: text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text,
    };
  });
}

let cache: Promise<MediumPost[]> | null = null;

/** Medium posts at build time. Never fails the build: returns [] on any error. */
export function getMediumPosts(): Promise<MediumPost[]> {
  cache ??= (async () => {
    try {
      const res = await fetch(`https://medium.com/feed/@${SITE.mediumUser}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      return parseMediumFeed(await res.text()).filter((p) => p.title && p.url);
    } catch {
      return [];
    }
  })();
  return cache;
}
