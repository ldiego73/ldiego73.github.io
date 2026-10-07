/**
 * Fullscreen game overlay for the floating arcade: the same thing the mountain's arcade tambo does through its
 * content HUD (hud.openGame + games/core/shell mountCabinet), rebuilt here because the jungle has no content
 * HUD. The shell is imported lazily on the first play, so the game registry's chunks and the cabinet UI stay
 * out of the jungle's start-up. Emits `world:game {open}` (the runtime pauses walking and holds the engine),
 * closes on its back button or Esc (capture phase, before the shell turns Esc into pause), and falls back to
 * a link to the game's own page if the shell fails to load.
 * Helpers only: this file does not export `create`.
 */
import "../../../../games/core/shell.css";
import "./arcade.css";
import type { GameMeta } from "../../../../games/core/types";
import { emit } from "../../../events";
import { gameHref } from "./logic";

const COPY = {
  es: {
    back: "Volver a la selva",
    loading: "Encendiendo el gabinete…",
    fail: "No se pudo cargar el juego aquí.",
    open: "Jugar en el arcade",
  },
  en: {
    back: "Back to the jungle",
    loading: "Powering up the cabinet…",
    fail: "The game couldn't load here.",
    open: "Play in the arcade",
  },
} as const;

export interface GameOverlay {
  open(meta: GameMeta): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createGameOverlay(lang: "es" | "en"): GameOverlay {
  const c = COPY[lang];
  const layer = document.createElement("div");
  layer.className = "qns-game-layer";
  layer.lang = lang;
  layer.hidden = true;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-labelledby", "qns-game-title");
  const bar = document.createElement("div");
  bar.className = "qns-game-bar";
  const title = document.createElement("h2");
  title.id = "qns-game-title";
  title.className = "qns-game-title";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "qns-game-back";
  back.innerHTML = `<kbd>Esc</kbd> <span></span>`;
  (back.querySelector("span") as HTMLElement).textContent = c.back;
  bar.append(title, back);
  const host = document.createElement("div");
  host.className = "qns-game-host";
  layer.append(bar, host);
  document.body.append(layer);

  let open = false;
  let token = 0;
  let dispose: (() => void) | null = null;
  let returnFocus: Element | null = null;

  const close = () => {
    if (!open) return;
    open = false;
    token++;
    dispose?.();
    dispose = null;
    layer.hidden = true;
    host.replaceChildren();
    host.className = "qns-game-host";
    host.removeAttribute("style");
    host.removeAttribute("data-skin");
    emit("world:game", { open: false });
    const r = returnFocus as HTMLElement | null;
    returnFocus = null;
    if (r?.isConnected && typeof r.focus === "function") r.focus({ preventScroll: true });
  };
  const fail = (meta: GameMeta) => {
    host.replaceChildren();
    const p = document.createElement("p");
    p.className = "qns-game-msg";
    p.textContent = c.fail;
    const a = document.createElement("a");
    a.className = "qns-game-back";
    a.href = gameHref(lang, meta.slug);
    a.textContent = c.open;
    host.append(p, a);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  window.addEventListener("keydown", onKey, true);
  back.addEventListener("click", close);

  return {
    open(meta) {
      if (open) return;
      open = true;
      returnFocus = document.activeElement;
      const my = ++token;
      title.textContent = meta.title[lang];
      host.replaceChildren();
      const loading = document.createElement("p");
      loading.className = "qns-game-msg";
      loading.textContent = c.loading;
      host.append(loading);
      layer.hidden = false;
      emit("world:game", { open: true });
      import("../../../../games/core/shell")
        .then(({ mountCabinet }) => {
          if (my !== token) return;
          host.replaceChildren();
          return mountCabinet(host, meta, lang).then((d) => {
            if (my !== token || !open) {
              d();
              return;
            }
            dispose = d;
            host.querySelector<HTMLElement>(".cab-screen")?.focus({ preventScroll: true });
          });
        })
        .catch(() => {
          if (my === token) fail(meta);
        });
    },
    close,
    isOpen: () => open,
    dispose() {
      close();
      window.removeEventListener("keydown", onKey, true);
      back.removeEventListener("click", close);
      layer.remove();
    },
  };
}
