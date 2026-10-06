/**
 * Language switch that lands on the exact same place: the page's equivalent in the other language (already
 * in the header link's href: same route, or the translated twin of a post) plus the section you were
 * reading (#hash, or the section currently at the top of the viewport). The choice is remembered so the
 * root "/" opens in that language next time.
 */
export const LANG_KEY = "lang";

/**
 * Id of the section being read: among identified sections whose box spans the reading line (35% down the
 * viewport), the innermost one (smallest). Boxes, not hit-testing: the home has fixed/sticky stages on top.
 */
function currentSection(): string | null {
  if (scrollY < 80) return null;
  const line = innerHeight * 0.35;
  let id: string | null = null;
  let size = Number.POSITIVE_INFINITY;
  for (const el of document.querySelectorAll<HTMLElement>(
    "main section[id], main [id^='chapter-'], main article [id]",
  )) {
    const r = el.getBoundingClientRect();
    if (r.top <= line && r.bottom > line && r.height < size) {
      size = r.height;
      id = el.id;
    }
  }
  return id;
}

/** Target URL for the switch: `alternate` path + the current section. */
export function switchTarget(alternate: string): string {
  const url = new URL(alternate, location.href);
  if (!url.hash) {
    const hash = location.hash.slice(1) || currentSection();
    if (hash) url.hash = hash;
  }
  return url.pathname + url.search + url.hash;
}

export function rememberLang(lang: string) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable */
  }
}

/** Switch using the header's language link (works from the palette too). */
export function switchLang() {
  const a = document.querySelector<HTMLAnchorElement>("a[data-lang-switch]");
  if (!a) return;
  rememberLang(a.hreflang);
  location.href = switchTarget(a.getAttribute("href") ?? "/");
}
