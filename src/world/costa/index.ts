/**
 * Entry of the coast page (/{lang}/world/costa/): mounts the Chinchaysuyu on the generic suyu runtime.
 * Returns the dispose function (the page calls it on pagehide).
 */
import type { Lang } from "../contract";
import { mountSuyu } from "../suyu";
import { COSTA_DEF } from "./def";

export function mountCosta(host: HTMLElement, opts: { lang: Lang; skipIntro?: boolean }): () => void {
  return mountSuyu(host, opts, COSTA_DEF);
}
