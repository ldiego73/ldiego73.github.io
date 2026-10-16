/**
 * Pure rules for the leave-the-world confirmation (leave.ts): which link clicks leave the world page, where
 * they lead, and the bilingual copy of the «¿Salir del mundo?» dialog. DOM-free so it is unit tested.
 */

import type { Lang } from "./contract";
import type { WorldId } from "./events";

/** Where a leaving navigation goes: another world page, or anywhere else on (or off) the site. */
export type Destination = WorldId | "site";

/** The parts of an anchor that decide whether following it leaves the page in this tab. */
export interface LinkInfo {
  /** Resolved absolute URL (`HTMLAnchorElement.href`). */
  href: string;
  /** `target` attribute ("" when absent). */
  target: string;
  /** The link carries a `download` attribute (the CV): the browser saves a file and the page stays. */
  download: boolean;
}

/**
 * The URL a plain left click on this link would open in the current tab, or null when the page stays:
 * new-tab targets, downloads, non-http schemes (mailto:, tel:, blob:) and in-page `#` anchors.
 */
export function leavingUrl(link: LinkInfo, current: string): URL | null {
  if (link.download) return null;
  if (link.target && link.target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(link.href, current);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const here = new URL(current);
  // Same document, only the fragment differs (or none): an in-page jump, not a navigation.
  if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search && url.hash)
    return null;
  return url;
}

const WORLD_PATH = /^\/(?:es|en)\/world\/(?:(selva|cusco|costa|titicaca|colca)\/?)?$/;

/** Another world page on this site (the mountain is /{lang}/world/), else "site". */
export function destinationOf(url: URL, origin: string): Destination {
  if (url.origin !== origin) return "site";
  const m = WORLD_PATH.exec(url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`);
  if (!m) return "site";
  return (m[1] as WorldId | undefined) ?? "qhapaq";
}

/** Spanish names carry their article ("al Antisuyu", "a Qusqu"), as the punku prompts say them. */
const TO: Record<WorldId, { es: string; en: string }> = {
  qhapaq: { es: "al Qhapaq Ñan, la montaña", en: "the Qhapaq Ñan mountain" },
  wasi: { es: "a la Wasi", en: "the Wasi" },
  selva: { es: "al Antisuyu", en: "the Antisuyu" },
  cusco: { es: "a Qusqu", en: "Qusqu" },
  costa: { es: "al Chinchaysuyu", en: "the Chinchaysuyu" },
  titicaca: { es: "al Collasuyu", en: "the Collasuyu" },
  colca: { es: "al Kuntisuyu", en: "the Kuntisuyu" },
};

export interface LeaveCopy {
  title: string;
  body: string;
  stay: string;
  leave: string;
}

export function leaveCopy(lang: Lang, to: Destination): LeaveCopy {
  const es = lang === "es";
  const body =
    to === "site"
      ? es
        ? "Dejarás el mundo 3D y volverás al sitio."
        : "You'll leave the 3D world and go back to the site."
      : es
        ? `Dejarás este mundo y viajarás ${TO[to].es}.`
        : `You'll leave this world and travel to ${TO[to].en}.`;
  return es
    ? { title: "¿Salir del mundo?", body, stay: "Quedarme", leave: "Salir" }
    : { title: "Leave the world?", body, stay: "Stay", leave: "Leave" };
}
