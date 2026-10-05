import { SITE } from "../data/site";

export interface Repo {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  pushedAt: string;
  topics: string[];
}

interface ApiRepo {
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  topics?: string[];
  fork: boolean;
  archived: boolean;
}

let cache: Promise<Repo[]> | null = null;

/** Public repos at build time. Never fails the build: returns [] on any error. */
export function getRepos(): Promise<Repo[]> {
  cache ??= (async () => {
    try {
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "ldiego73-site" };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/users/${SITE.githubUser}/repos?per_page=100&sort=pushed`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as ApiRepo[];
      return data
        .filter((r) => !r.fork && !r.archived && r.name !== `${SITE.githubUser}.github.io`)
        .sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at))
        .map((r) => ({
          name: r.name,
          description: r.description,
          url: r.html_url,
          stars: r.stargazers_count,
          language: r.language,
          pushedAt: r.pushed_at,
          topics: r.topics ?? [],
        }));
    } catch {
      return [];
    }
  })();
  return cache;
}
