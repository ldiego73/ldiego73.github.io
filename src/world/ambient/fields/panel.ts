/**
 * Shared paper-and-ink dialog for the data stations. Keyboard accessible: focus moves to the title on
 * open and back on close, Esc closes (also routed through the ambient's escape()), ←/→ call `onNav`.
 * Dispatches `world:modal` so the core freezes walking while it's open.
 */
import { emit } from "../../events";
import "./fields.css";

export interface FieldPanel {
  readonly layer: HTMLElement;
  readonly title: HTMLElement;
  readonly kicker: HTMLElement;
  readonly body: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

let seq = 0;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createFieldPanel(
  hudRoot: HTMLElement,
  o: { name: string; closeLabel: string; onNav?: (dir: -1 | 1) => void; onClose?: () => void },
): FieldPanel {
  const id = `qnf-${o.name}-${++seq}`;
  const layer = el("div", `qnf-layer qnf-${o.name}`);
  const panel = el("section", "qnf-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", `${id}-title`);
  panel.hidden = true;
  const head = el("header", "qnf-head");
  const kicker = el("p", "qnf-kicker");
  const title = el("h2", "qnf-title");
  title.id = `${id}-title`;
  title.tabIndex = -1;
  head.append(kicker, title);
  const close = el("button", "qnf-close");
  close.type = "button";
  close.setAttribute("aria-label", o.closeLabel);
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const body = el("div", "qnf-body");
  panel.append(head, close, body);
  layer.appendChild(panel);
  hudRoot.appendChild(layer);

  let open = false;
  let returnFocus: Element | null = null;

  const api: FieldPanel = {
    layer,
    title,
    kicker,
    body,
    open() {
      if (open) return;
      open = true;
      returnFocus = document.activeElement;
      panel.hidden = false;
      panel.classList.remove("is-open");
      void panel.offsetWidth;
      panel.classList.add("is-open");
      title.focus({ preventScroll: true });
      emit("world:modal", { open: true });
    },
    close() {
      if (!open) return;
      open = false;
      panel.hidden = true;
      panel.classList.remove("is-open");
      const back = returnFocus as HTMLElement | null;
      returnFocus = null;
      if (panel.contains(document.activeElement)) {
        if (back && back !== document.body && back.isConnected && typeof back.focus === "function")
          back.focus({ preventScroll: true });
        else (document.querySelector("canvas") as HTMLElement | null)?.focus?.({ preventScroll: true });
      }
      emit("world:modal", { open: false });
      o.onClose?.();
    },
    isOpen: () => open,
    dispose() {
      if (open) api.close();
      panel.removeEventListener("keydown", onKey);
      close.removeEventListener("click", onCloseClick);
      layer.remove();
    },
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      api.close();
      return;
    }
    if (!o.onNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // Keep the arrows away from the avatar's movement input while the panel has focus.
      e.stopPropagation();
      o.onNav(e.key === "ArrowLeft" ? -1 : 1);
    }
  };
  const onCloseClick = () => api.close();
  panel.addEventListener("keydown", onKey);
  close.addEventListener("click", onCloseClick);
  return api;
}

/** A link that opens external URLs in a new tab (rel=noopener) and site paths in place. */
export function linkButton(href: string, label: string, external: boolean, primary = false): HTMLAnchorElement {
  const a = el("a", primary ? "qnf-btn qnf-btn-primary" : "qnf-btn", label);
  a.href = href;
  if (external) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const arrow = el("span", "qnf-ext", "↗");
    arrow.setAttribute("aria-hidden", "true");
    a.append(arrow);
  }
  return a;
}
