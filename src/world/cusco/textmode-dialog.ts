/**
 * The hub's text-mode dialog: ./textmode.ts's document in the suyu runtime's paper overlay. Kept apart from
 * the pure renderer so the page can import that one at build time without the dialog code.
 */
import type { Lang } from "../contract";
import { createSuyuTextMode } from "../suyu/textmode";
import type { TextMode } from "../textmode";
import { renderCuscoTextMode } from "./textmode";

export function createCuscoTextMode(host: HTMLElement, lang: Lang): TextMode {
  return createSuyuTextMode(host, lang, "cusco", renderCuscoTextMode);
}
