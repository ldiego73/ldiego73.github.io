/**
 * Build-time data for the world (GitHub repos, blog and Medium posts), serialized by
 * src/pages/[lang]/world.astro into <script type="application/json" id="world-data">.
 * Empty arrays when the build had no network access, so callers must handle an empty world.
 */
export interface WorldRepo {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  pushedAt: string;
}

export interface WorldPost {
  title: string;
  description: string;
  /** ISO date. */
  date: string;
  href: string;
  source: "site" | "medium";
  tags: string[];
}

export interface WorldData {
  repos: WorldRepo[];
  posts: WorldPost[];
}

let cached: WorldData | null = null;

export function worldData(): WorldData {
  if (cached) return cached;
  try {
    const el = document.getElementById("world-data");
    const parsed = el?.textContent ? (JSON.parse(el.textContent) as Partial<WorldData>) : {};
    cached = { repos: parsed.repos ?? [], posts: parsed.posts ?? [] };
  } catch {
    cached = { repos: [], posts: [] };
  }
  return cached;
}
