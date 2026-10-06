/**
 * Warm the 3D world while the visitor is about to open it (hover / focus / touch on a "World" link):
 * fetch the world page, read its entry script and prefetch the modules it needs before starting
 * (Three.js + world core, ~240 KB gzip). Everything lands in the HTTP cache, so the world starts sooner.
 * Skipped on Save-Data or 2G connections.
 */
let started = false;

const add = (href: string, as: "script" | "style") => {
  const l = document.createElement("link");
  l.rel = "prefetch";
  l.as = as;
  l.href = href;
  document.head.append(l);
};

export async function prefetchWorld(pageHref: string) {
  if (started) return;
  started = true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
  try {
    const html = await (await fetch(pageHref, { credentials: "same-origin" })).text();
    const entry = html.match(/<script type="module" src="([^"]*world\.astro[^"]*\.js)"/)?.[1];
    if (!entry) return;
    add(entry, "script");
    const js = await (await fetch(entry)).text();
    for (const dep of new Set(js.match(/_astro\/[\w.-]+\.(?:js|css)/g) ?? []))
      add(`/${dep}`, dep.endsWith(".css") ? "style" : "script");
  } catch {
    /* offline or blocked: the world just loads normally */
  }
}
