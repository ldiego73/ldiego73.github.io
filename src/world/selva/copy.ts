/**
 * Jungle copy for the shared khipu loader (loader.ts speaks of the mountain). Pure: the page uses
 * `selvaLoaderHtml` at build time and the runtime re-labels the steps it reports.
 */
import type { Lang } from "../contract";
import { type LoadStep, loaderHtml } from "../loader";

export const SELVA_LOADER = {
  es: {
    title: "Tejiendo la selva…",
    modules: "Reuniendo los hilos",
    terrain: "Abriendo la selva",
    content: "Levantando el punku",
    ambients: "Despertando el Antisuyu",
    ready: "Listo",
  },
  en: {
    title: "Weaving the jungle…",
    modules: "Gathering the threads",
    terrain: "Opening the forest",
    content: "Raising the punku",
    ambients: "Waking the Antisuyu",
    ready: "Ready",
  },
} as const satisfies Record<Lang, Record<LoadStep | "title", string>>;

/** The shared loader markup with the jungle title. */
export function selvaLoaderHtml(lang: Lang): string {
  return loaderHtml(lang).replace(
    /<span class="kw-loader-title">[^<]*<\/span>/,
    `<span class="kw-loader-title">${SELVA_LOADER[lang].title}</span>`,
  );
}
