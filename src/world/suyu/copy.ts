/**
 * Loader markup for a suyu world's page: the shared khipu loader (../loader.ts) with the world's own title
 * (SuyuDef.loader). Pure, so the page renders it at build time; the runtime re-labels the steps it reports.
 */
import type { Lang } from "../contract";
import { loaderHtml } from "../loader";

export function suyuLoaderHtml(lang: Lang, title: string): string {
  return loaderHtml(lang).replace(
    /<span class="kw-loader-title">[^<]*<\/span>/,
    `<span class="kw-loader-title">${title.replace(/[&<>"]/g, "")}</span>`,
  );
}
