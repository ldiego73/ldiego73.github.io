/**
 * Travel between worlds that live on different pages (mountain /world/ ↔ jungle /world/selva/).
 * `prefetchWorld` warms the target page and its JavaScript chunks when the traveler nears a portal;
 * `travelTo` emits `world:travel`, fades the screen to the loader colour and navigates.
 */

import type { Lang } from "./contract";
import { emit, type WorldId } from "./events";

export function worldUrl(lang: Lang, to: WorldId, from?: WorldId): string {
  if (to === "selva") return `/${lang}/world/selva/`;
  return `/${lang}/world/${from && from !== "qhapaq" && from !== "wasi" ? `?from=${from}` : ""}`;
}

const warmed = new Set<string>();
export function prefetchWorld(lang: Lang, to: WorldId): void {
  const href = worldUrl(lang, to);
  if (warmed.has(href)) return;
  warmed.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  document.head.append(link);
  // The page is small; the real cost is its JavaScript. Warm those chunks too (they share hashes with the page).
  if (to === "selva") void import("./selva/warm").then((m) => m.warmSelva()).catch(() => {});
}

export function travelTo(lang: Lang, from: WorldId, to: WorldId, fadeMs = 450): void {
  emit("world:travel", { from, to });
  const veil = document.createElement("div");
  veil.className = "kw-travel-veil";
  veil.style.cssText = `position:fixed;inset:0;z-index:60;background:#13151b;opacity:0;transition:opacity ${fadeMs}ms ease`;
  document.body.append(veil);
  requestAnimationFrame(() => {
    veil.style.opacity = "1";
  });
  window.setTimeout(() => location.assign(worldUrl(lang, to, from)), fadeMs);
}
