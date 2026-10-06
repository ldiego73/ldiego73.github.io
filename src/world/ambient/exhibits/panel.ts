/**
 * Paper-and-ink dialog for the tambo exhibits and the bridge C4 maquettes (right side of the screen, so
 * it never covers content's left panel). Focus moves to the title on open and back on close; Esc closes
 * (also routed through the ambient's escape()), and so does E; `world:modal` is dispatched exactly once per
 * open/close.
 */
import { emit } from "../../events";
import "./exhibits.css";

export interface XPanel {
  readonly kicker: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

let seq = 0;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createXPanel(hudRoot: HTMLElement, o: { name: string; closeLabel: string; lang: string }): XPanel {
  const id = `qnx-${o.name}-${++seq}`;
  const layer = h("div", `qnx-layer qnx-${o.name}`);
  layer.lang = o.lang;
  const panel = h("section", "qnx-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", `${id}-title`);
  panel.hidden = true;
  const head = h("header", "qnx-head");
  const kicker = h("p", "qnx-kicker");
  const title = h("h2", "qnx-title");
  title.id = `${id}-title`;
  title.tabIndex = -1;
  head.append(kicker, title);
  const close = h("button", "qnx-close");
  close.type = "button";
  close.setAttribute("aria-label", o.closeLabel);
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const body = h("div", "qnx-body");
  panel.append(head, close, body);
  layer.appendChild(panel);
  hudRoot.appendChild(layer);

  let open = false;
  let back: Element | null = null;
  const api: XPanel = {
    kicker,
    title,
    body,
    open() {
      if (open) return;
      open = true;
      back = document.activeElement;
      panel.hidden = false;
      panel.classList.remove("is-open");
      void panel.offsetWidth;
      panel.classList.add("is-open");
      title.focus({ preventScroll: true });
      // On phones this panel is a bottom sheet: the tambo/artifact panel steps aside while it is open.
      document.documentElement.classList.add("qn-xpanel-open");
      emit("world:modal", { open: true });
    },
    close() {
      if (!open) return;
      open = false;
      panel.hidden = true;
      panel.classList.remove("is-open");
      const b = back as HTMLElement | null;
      back = null;
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        if (b && b !== document.body && b.isConnected && typeof b.focus === "function")
          b.focus({ preventScroll: true });
        else (document.querySelector("canvas") as HTMLElement | null)?.focus?.({ preventScroll: true });
      }
      document.documentElement.classList.remove("qn-xpanel-open");
      emit("world:modal", { open: false });
    },
    isOpen: () => open,
    dispose() {
      api.close();
      panel.removeEventListener("keydown", onKey);
      close.removeEventListener("click", onClose);
      layer.remove();
    },
  };
  // Core ignores keys while a modal is open, so the panel itself lets E toggle it closed (like Esc).
  const onKey = (e: KeyboardEvent) => {
    const toggle = (e.key === "e" || e.key === "E") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (e.key !== "Escape" && !toggle) return;
    e.preventDefault();
    e.stopPropagation();
    api.close();
  };
  const onClose = () => api.close();
  panel.addEventListener("keydown", onKey);
  close.addEventListener("click", onClose);
  return api;
}
