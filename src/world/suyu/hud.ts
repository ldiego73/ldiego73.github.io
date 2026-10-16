import "../hud.css";
import type { L, Lang } from "../contract";
import { emit, on } from "../events";

/**
 * Corner tools of a suyu world: the mountain's map + help buttons (../hud.ts `qn-tools`) and its help overlay
 * (`.qn-help`), with the world's own help copy (SuyuDef.help). The jungle's ../selva/hud.ts made generic:
 * same classes and ../hud.css (plain CSS, no mountain JS), so every world's corner looks identical.
 *
 * The map button only emits `world:map`; the runtime decides (closed while a modal is open or a vehicle owns
 * the traveler). Help toggles from its button and from `world:help` (H, ?, gamepad Start) and holds a
 * `world:modal` while open. The runtime's `helpOpen()` looks for `.qn-help:not([hidden])` inside hudRoot.
 */
export interface SuyuHud {
  setNight(night: boolean): void;
  dispose(): void;
}

const COPY = {
  map: { es: "Mapa del camino", en: "Trail map" },
  help: { es: "Controles", en: "Controls" },
  close: { es: "Cerrar", en: "Close" },
} satisfies Record<string, L>;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let seq = 0;

export function createSuyuHud(
  root: HTMLElement,
  lang: Lang,
  help: { title: L; lines: Record<Lang, string[]> },
): SuyuHud {
  const hud = el("div", "qn-hud");
  hud.lang = lang;
  root.appendChild(hud);

  const tools = el("div", "qn-tools");
  const mapBtn = el("button", "qn-btn qn-icon");
  mapBtn.type = "button";
  mapBtn.setAttribute("aria-label", `${COPY.map[lang]} (M)`);
  mapBtn.setAttribute("aria-haspopup", "dialog");
  mapBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>';
  const helpBtn = el("button", "qn-btn qn-icon");
  helpBtn.type = "button";
  helpBtn.setAttribute("aria-label", `${COPY.help[lang]} (H)`);
  helpBtn.setAttribute("aria-expanded", "false");
  helpBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2.1v.6"/><path d="M12 18h.01"/></svg>';
  tools.append(mapBtn, helpBtn);
  hud.appendChild(tools);

  const titleId = `qn-suyu-help-title-${++seq}`;
  const overlay = el("div", "qn-help");
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "false");
  overlay.setAttribute("aria-labelledby", titleId);
  const card = el("div", "qn-card qn-help-card");
  const title = el("h2", "qn-title", help.title[lang]);
  title.id = titleId;
  const list = el("ul", "qn-help-list");
  for (const line of help.lines[lang]) list.appendChild(el("li", "", line));
  const close = el("button", "qn-btn qn-btn-primary", COPY.close[lang]);
  close.type = "button";
  card.append(title, list, close);
  overlay.appendChild(card);
  hud.appendChild(overlay);

  /** Where focus was before help opened (the help button, or the canvas after H). */
  let returnTo: HTMLElement | null = null;
  const setHelp = (force?: boolean) => {
    const open = force ?? overlay.hidden !== false;
    if (open === !overlay.hidden) return;
    if (open) returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = !open;
    helpBtn.setAttribute("aria-expanded", String(open));
    emit("world:modal", { open });
    if (open) close.focus({ preventScroll: true });
    else if (overlay.contains(document.activeElement) || document.activeElement === document.body) {
      (returnTo?.isConnected ? returnTo : helpBtn).focus({ preventScroll: true });
    }
  };

  mapBtn.addEventListener("click", () => emit("world:map", undefined));
  helpBtn.addEventListener("click", () => setHelp());
  close.addEventListener("click", () => setHelp(false));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) setHelp(false);
  });
  // The runtime routes Esc only to ambients, so help closes itself.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !overlay.hidden) {
      e.preventDefault();
      setHelp(false);
    }
  };
  window.addEventListener("keydown", onKey);
  const offHelp = on("world:help", () => setHelp());

  return {
    setNight(night) {
      hud.classList.toggle("is-night", night);
    },
    dispose() {
      if (!overlay.hidden) setHelp(false);
      offHelp();
      window.removeEventListener("keydown", onKey);
      hud.remove();
    },
  };
}
