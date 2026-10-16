/**
 * Entry of the Kuntisuyu page (/{lang}/world/colca/): mounts the Colca canyon and Nazca road on the generic
 * suyu runtime. Returns the dispose function (the page calls it on pagehide).
 */
import type { Lang } from "../contract";
import { mountSuyu } from "../suyu";
import { COLCA_DEF } from "./def";

export function mountColca(host: HTMLElement, opts: { lang: Lang; skipIntro?: boolean }): () => void {
  return mountSuyu(host, opts, COLCA_DEF);
}
