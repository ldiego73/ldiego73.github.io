/**
 * Entry of the Collasuyu page (/{lang}/world/titicaca/): mounts the Lake Titicaca road on the generic suyu
 * runtime. Returns the dispose function (the page calls it on pagehide).
 */
import type { Lang } from "../contract";
import { mountSuyu } from "../suyu";
import { TITICACA_DEF } from "./def";

export function mountTiticaca(host: HTMLElement, opts: { lang: Lang; skipIntro?: boolean }): () => void {
  return mountSuyu(host, opts, TITICACA_DEF);
}
