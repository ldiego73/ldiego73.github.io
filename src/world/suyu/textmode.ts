/**
 * Text-mode dialog of a suyu world: the world's own pure renderer (the same function its page runs at build
 * time for the no-WebGL fallback) shown in the mountain's paper overlay (../textmode.ts createOverlay: focus
 * trap, Esc, `world:modal`). Built lazily on first open. Worlds call it from their SuyuDef.textMode.
 */
import type { Lang } from "../contract";
import { createOverlay, esc, type TextMode } from "../textmode";

export type RenderTextDoc = (lang: Lang, opts: { headingLevel: number; titleId: string }) => string;

const CLOSE = { es: "Cerrar", en: "Close" } as const;

export function createSuyuTextMode(host: HTMLElement, lang: Lang, world: string, render: RenderTextDoc): TextMode {
  const titleId = `kw-${world}-tmo-title`;
  const ov = createOverlay(host, { className: "kw-tm", labelledBy: titleId });
  ov.panel.lang = lang;
  ov.panel.tabIndex = -1;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const bar = document.createElement("div");
    bar.className = "kw-tm-bar";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "kw-btn";
    close.innerHTML = `<kbd>Esc</kbd> <span>${esc(CLOSE[lang])}</span>`;
    close.addEventListener("click", () => ov.close());
    bar.append(close);
    const doc = document.createElement("article");
    doc.className = "kw-textdoc";
    doc.innerHTML = render(lang, { headingLevel: 2, titleId });
    ov.panel.append(bar, doc);
  };
  return {
    panel: ov.panel,
    open() {
      build();
      ov.open(ov.panel.querySelector<HTMLElement>(".kw-tm-bar .kw-btn"));
    },
    close: () => ov.close(),
    toggle() {
      if (ov.isOpen()) ov.close();
      else this.open();
    },
    isOpen: () => ov.isOpen(),
    dispose: () => ov.dispose(),
  };
}
