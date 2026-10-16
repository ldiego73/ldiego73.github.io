/**
 * «¿Salir del mundo?»: the one confirmation every exit from a world page goes through, so the traveler never
 * leaves by accident (the owner asked for it: a stray click on "Sitio" or a punku used to drop the climb).
 *
 * - `confirmLeave(lang, to)` shows the paper dialog (dialogs.ts `createModal`: role=dialog, aria-modal, focus
 *   trap, Esc / backdrop = stay) and resolves true only on "Salir". Focus starts on "Quedarme", the safe
 *   choice. It emits `world:modal` while open, so every runtime freezes movement, hides the touch pads and
 *   routes the gamepad to the dialog (A clicks the focused button, B is Esc, the d-pad moves focus).
 * - `travelTo` (travel.ts) awaits it before fading out: that covers every punku, finale and "back" button.
 * - `guardLeaving(lang)` is one capture-phase click listener per world page for same-tab links that leave it
 *   (the HUD "Sitio" button, the title screen's back link, panel `linkButton`s, content links, the summit
 *   card). It skips new tabs, downloads, mailto:, in-page anchors and modifier clicks (the browser opens
 *   those elsewhere, the world stays), and links inside the text mode: that is the accessible reading of the
 *   world, a plain document where a link should behave like any link on the site.
 *
 * The dialog lives on <body> above everything (the jungle's arcade overlay is a body-level layer at z 1000),
 * so it carries its own copy of the paper/ink tokens (world.css `.kw-leave`).
 */

import type { Lang } from "./contract";
import { createModal } from "./dialogs";
import { emit } from "./events";
import { type Destination, destinationOf, leaveCopy, leavingUrl } from "./leave-logic";

let open = false;

/** True while the confirmation is on screen. */
export const leaveOpen = () => open;

/**
 * Asks before leaving the world. Resolves true on "Leave", false on "Stay", Esc, B or a backdrop click. While
 * a confirmation is already open, a second request resolves false at once: the open dialog owns the decision.
 */
export function confirmLeave(lang: Lang, to: Destination): Promise<boolean> {
  if (open) return Promise.resolve(false);
  open = true;
  const c = leaveCopy(lang, to);
  return new Promise<boolean>((resolve) => {
    let ok = false;
    const modal = createModal(document.body, "kw-leave-h", () => {
      open = false;
      emit("world:modal", { open: false });
      resolve(ok);
      // Let close() restore focus first, then drop the dialog and its key listener.
      queueMicrotask(() => modal.dispose());
    });
    modal.el.classList.add("kw-leave");
    modal.panel.lang = lang;
    modal.panel.setAttribute("aria-describedby", "kw-leave-d");
    const h = document.createElement("h2");
    h.id = "kw-leave-h";
    h.className = "kw-modal-title";
    h.textContent = c.title;
    const p = document.createElement("p");
    p.id = "kw-leave-d";
    p.className = "kw-leave-body";
    p.textContent = c.body;
    const row = document.createElement("div");
    row.className = "kw-modal-actions";
    const stay = document.createElement("button");
    stay.type = "button";
    stay.className = "kw-btn kw-btn-primary";
    stay.textContent = c.stay;
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "kw-btn";
    leave.textContent = c.leave;
    row.append(stay, leave);
    modal.panel.append(h, p, row);
    stay.addEventListener("click", () => modal.close());
    leave.addEventListener("click", () => {
      ok = true;
      modal.close();
    });
    emit("world:modal", { open: true });
    modal.open(stay);
  });
}

/** Installs the link guard for this world page; returns its remover. */
export function guardLeaving(lang: Lang): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;
    // Text mode (overlay and static page) and the screen-reader note keep plain links; the dialog is not a link.
    if (a.closest(".kw-tm, .kw-textpage, .sr-only, .kw-leave")) return;
    const url = leavingUrl({ href: a.href, target: a.target, download: a.hasAttribute("download") }, location.href);
    if (!url) return;
    e.preventDefault();
    void confirmLeave(lang, destinationOf(url, location.origin)).then((go) => {
      if (go) location.assign(url.href);
    });
  };
  window.addEventListener("click", onClick, true);
  return () => window.removeEventListener("click", onClick, true);
}
