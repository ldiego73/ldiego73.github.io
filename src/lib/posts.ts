import { getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import type { Lang } from "../i18n/ui";
import { getMediumPosts } from "./medium";

export interface PostItem {
  title: string;
  description: string;
  date: Date;
  href: string;
  tags: string[];
  source: "site" | "medium";
  minutes?: number;
  cover?: ImageMetadata;
  coverAlt?: string;
}

const minutes = (body = "") => Math.max(1, Math.round(body.split(/\s+/).length / 220));

/** Site posts for a language plus Medium posts (language-agnostic), newest first. */
export async function getPosts(lang: Lang): Promise<PostItem[]> {
  const local = (await getCollection("blog", (p) => p.id.startsWith(`${lang}/`) && !p.data.draft)).map((p) => ({
    title: p.data.title,
    description: p.data.description,
    date: p.data.date,
    href: `/${lang}/blog/${p.id.slice(lang.length + 1)}/`,
    tags: p.data.tags,
    source: "site" as const,
    minutes: minutes(p.body),
    cover: p.data.cover,
    coverAlt: p.data.coverAlt,
  }));
  const medium = (await getMediumPosts()).map((p) => ({
    title: p.title,
    description: p.excerpt,
    date: p.date,
    href: p.url,
    tags: p.tags,
    source: "medium" as const,
  }));
  return [...local, ...medium].sort((a, b) => b.date.getTime() - a.date.getTime());
}
