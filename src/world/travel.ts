/**
 * Travel between worlds that live on different pages (the mountain /world/, the jungle /world/selva/, the Cusco
 * hub /world/cusco/ and the suyu roads /world/costa/, /world/titicaca/ and /world/colca/). `prefetchWorld` warms
 * the target page and its JavaScript chunks when the traveler nears a portal; `travelTo` first asks «¿Salir del
 * mundo?» (leave.ts), then emits `world:travel`, fades the screen to the loader colour and navigates. It resolves
 * false when the traveler stays: nothing was emitted or drawn, so they are exactly where they were.
 *
 * `?from=<world>` tells the target page where the traveler came from, so it starts at the matching portal:
 * the mountain reads it with trailhead.ts `arrivalFrom` (ARRIVALS), every suyu-runtime world (the hub and the
 * three suyu roads) with suyu/arrival.ts. The jungle has a single entrance and its own runtime, so its URL never
 * carries it.
 */

import type { Lang } from "./contract";
import { emit, type WorldId } from "./events";
import { confirmLeave } from "./leave";

/** Worlds whose page reads `?from=` (the jungle starts at its only punku whatever the origin). */
const FROM_AWARE = new Set<WorldId>(["qhapaq", "cusco", "costa", "titicaca", "colca"]);

export function worldUrl(lang: Lang, to: WorldId, from?: WorldId): string {
  const q = from && from !== to && from !== "wasi" && FROM_AWARE.has(to) ? `?from=${from}` : "";
  if (to === "selva") return `/${lang}/world/selva/`;
  if (to === "cusco") return `/${lang}/world/cusco/${q}`;
  if (to === "costa") return `/${lang}/world/costa/${q}`;
  if (to === "titicaca") return `/${lang}/world/titicaca/${q}`;
  if (to === "colca") return `/${lang}/world/colca/${q}`;
  // The mountain (and the Wasi inside it): coming from its own house is not an arrival.
  return `/${lang}/world/${from === "qhapaq" ? "" : q}`;
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
  else if (to === "cusco") void import("./cusco/warm").then((m) => m.warmCusco()).catch(() => {});
  else if (to === "costa") void import("./costa/warm").then((m) => m.warmCosta()).catch(() => {});
  else if (to === "titicaca") void import("./titicaca/warm").then((m) => m.warmTiticaca()).catch(() => {});
  else if (to === "colca") void import("./colca/warm").then((m) => m.warmColca()).catch(() => {});
}

let leaving = false;
export async function travelTo(lang: Lang, from: WorldId, to: WorldId, fadeMs = 450): Promise<boolean> {
  // A punku pressed again while the dialog is up (or during the fade) is not a second trip.
  if (leaving || !(await confirmLeave(lang, to))) return false;
  leaving = true;
  emit("world:travel", { from, to });
  const veil = document.createElement("div");
  veil.className = "kw-travel-veil";
  veil.style.cssText = `position:fixed;inset:0;z-index:60;background:#13151b;opacity:0;transition:opacity ${fadeMs}ms ease`;
  document.body.append(veil);
  requestAnimationFrame(() => {
    veil.style.opacity = "1";
  });
  window.setTimeout(() => location.assign(worldUrl(lang, to, from)), fadeMs);
  // Back from the next page through the bfcache: lift the veil and allow another trip.
  window.addEventListener(
    "pageshow",
    () => {
      leaving = false;
      veil.remove();
    },
    { once: true },
  );
  return true;
}
