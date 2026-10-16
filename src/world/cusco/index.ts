/**
 * Entry of the Cusco hub page (/{lang}/world/cusco/): mounts Haukaypata on the generic suyu runtime.
 * Returns the dispose function (the page calls it on pagehide).
 */
import type { Lang } from "../contract";
import { mountSuyu } from "../suyu";
import { CUSCO_DEF } from "./def";

export function mountCusco(host: HTMLElement, opts: { lang: Lang; skipIntro?: boolean }): () => void {
  return mountSuyu(host, opts, CUSCO_DEF);
}
