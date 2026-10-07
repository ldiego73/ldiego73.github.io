import "../hud.css";
import type { L, Lang } from "../contract";
import { emit, on } from "../events";

/**
 * Corner tools for the Antisuyu page: the mountain's map + help buttons (../hud.ts `qn-tools`) and its help
 * overlay (`.qn-help`), so touch players can open the paper map (and its fast travel) and read the controls.
 * Reuses the mountain's classes and ../hud.css (plain CSS, no mountain JS) for an identical look; the
 * `.kw-hud .qn-hud` rule in world.css drops the tools below the chrome's top bar, same as on the mountain.
 * No minimap here: the paper map (./map.ts) is the only map.
 *
 * The map button only emits `world:map`; the runtime decides (closed while a modal is open or the canoe
 * owns the traveler). Help toggles from its button and from `world:help` (H, ?, gamepad Start) and holds a
 * `world:modal` while open, like the mountain. The runtime's `helpOpen()` looks for `.qn-help:not([hidden])`
 * inside hudRoot, which this overlay is.
 */
export interface SelvaHud {
  setNight(night: boolean): void;
  dispose(): void;
}

const COPY = {
  map: { es: "Mapa del camino", en: "Trail map" },
  help: { es: "Controles", en: "Controls" },
  title: { es: "Cómo caminar el Antisuyu", en: "How to walk the Antisuyu" },
  close: { es: "Cerrar", en: "Close" },
} satisfies Record<string, L>;

const LINES: Record<Lang, string[]> = {
  es: [
    "WASD o flechas: caminar",
    "Shift: correr · Espacio: saltar",
    "E: hablar, leer o usar · en móvil, el botón de acción",
    "Canoa: adelante acelera, atrás frena/retrocede, lados giran; correr da impulso. E sube; E/Esc baja junto a un muelle al ir despacio",
    "M: mapa · el viaje rápido se abre al llegar a la collpa",
    "P: pasaporte y tu postal · F: foto · K: modo texto",
    "T: día o noche · N: música · Esc: cerrar",
    "En móvil: joystick a la izquierda, botones a la derecha, arrastra para girar la cámara.",
    "Con mando: stick izquierdo camina, stick derecho gira la cámara, A salta, X interactúa, B vuelve, Y abre el mapa, RB o RT corre, LB toma una foto, Start muestra esta ayuda.",
  ],
  en: [
    "WASD or arrows: walk",
    "Shift: run · Space: jump",
    "E: talk, read or use · on mobile, the action button",
    "Canoe: forward accelerates, back brakes/reverses, sideways turns; run boosts. E boards; E/Esc lands near a dock at low speed",
    "M: map · fast travel opens once you reach the collpa",
    "P: passport and your postcard · F: photo · K: text mode",
    "T: day or night · N: music · Esc: close",
    "On mobile: joystick on the left, buttons on the right, drag to turn the camera.",
    "With a gamepad: left stick walks, right stick turns the camera, A jumps, X interacts, B goes back, Y opens the map, RB or RT runs, LB takes a photo, Start shows this help.",
  ],
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createSelvaHud(root: HTMLElement, lang: Lang): SelvaHud {
  const hud = el("div", "qn-hud");
  hud.lang = lang;
  root.appendChild(hud);

  // Same buttons and icons as the mountain (../hud.ts).
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

  const help = el("div", "qn-help");
  help.hidden = true;
  help.setAttribute("role", "dialog");
  help.setAttribute("aria-modal", "false");
  help.setAttribute("aria-labelledby", "qn-selva-help-title");
  const card = el("div", "qn-card qn-help-card");
  const title = el("h2", "qn-title", COPY.title[lang]);
  title.id = "qn-selva-help-title";
  const list = el("ul", "qn-help-list");
  for (const line of LINES[lang]) list.appendChild(el("li", "", line));
  const close = el("button", "qn-btn qn-btn-primary", COPY.close[lang]);
  close.type = "button";
  card.append(title, list, close);
  help.appendChild(card);
  hud.appendChild(help);

  /** Where focus was before help opened (the help button, or the canvas after H). */
  let returnTo: HTMLElement | null = null;
  const setHelp = (force?: boolean) => {
    const open = force ?? help.hidden !== false;
    if (open === !help.hidden) return;
    if (open) returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    help.hidden = !open;
    helpBtn.setAttribute("aria-expanded", String(open));
    emit("world:modal", { open });
    if (open) close.focus({ preventScroll: true });
    else if (help.contains(document.activeElement) || document.activeElement === document.body) {
      (returnTo?.isConnected ? returnTo : helpBtn).focus({ preventScroll: true });
    }
  };

  mapBtn.addEventListener("click", () => emit("world:map", undefined));
  helpBtn.addEventListener("click", () => setHelp());
  close.addEventListener("click", () => setHelp(false));
  // Click on the dimmed backdrop (not the card) closes, like Esc.
  help.addEventListener("click", (e) => {
    if (e.target === help) setHelp(false);
  });
  // The runtime routes Esc only to ambients, so help closes itself.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !help.hidden) {
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
      if (!help.hidden) setHelp(false);
      offHelp();
      window.removeEventListener("keydown", onKey);
      hud.remove();
    },
  };
}
