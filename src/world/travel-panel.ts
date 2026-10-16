/**
 * «Viajar»: the fast travel between worlds, like a game's world map. The chrome's Travel button, the V key and the
 * gamepad's LT open it in every runtime (the mountain, the jungle and the suyu runtime pass their own WorldId).
 *
 * A paper dialog on the shared `createModal` (focus trap, Esc / B / backdrop close, focus back to the opener) with
 * a small procedural map of the Tawantinsuyu: an inline SVG of the roads leaving Qusqu, and one card per world
 * placed on a 3 × 3 grid by the direction of its road (travel-panel-logic.ts). Every world is open; the ones with
 * a passport stamp carry ✓, the current one says «Estás aquí» and does nothing. Arrow keys move across the map,
 * the gamepad d-pad steps through the cards in reading order (the runtimes' `focusStep`), Enter / A travels.
 *
 * Choosing a world closes the panel first (so the confirmation owns the keyboard and focus returns to the Travel
 * button on «Quedarme»), then calls `travelTo`, which asks «¿Salir del mundo?» and only then emits `world:travel`
 * and navigates. While open it counts as a `world:modal`, so the world freezes movement and hides the touch pads.
 */

import { loadPassport } from "../lib/passport";
import type { Lang } from "./contract";
import { createModal } from "./dialogs";
import { emit } from "./events";
import { leaveOpen } from "./leave";
import { prefetchWorld, travelTo } from "./travel";
import { arrowDir, TRIP_COPY, TRIP_PLACES, type TripWorld, tripNeighbor, visitedWorlds } from "./travel-panel-logic";

export interface TravelPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

const NS = "http://www.w3.org/2000/svg";
/** Cell centres of the 3 × 3 grid in the SVG's 0..300 box (stretched to the grid, strokes stay thin). */
const cx = (col: number) => 50 + col * 100;

export function createTravelPanel(host: HTMLElement, lang: Lang, current: TripWorld): TravelPanel {
  const c = TRIP_COPY[lang];
  let open = false;

  // Registered before createModal's own capture listener, so the arrows and V reach the panel first.
  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    const dir = arrowDir(e.key);
    if (dir) {
      const from = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-world]");
      const next = tripNeighbor(TRIP_PLACES, (from?.dataset.world as TripWorld | undefined) ?? current, dir);
      if (next) cards.get(next)?.focus();
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.code === "KeyV" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      modal.close();
    }
  };
  window.addEventListener("keydown", onKey, true);

  const modal = createModal(host, "kw-trip-h", () => {
    open = false;
    emit("world:modal", { open: false });
  });
  modal.el.classList.add("kw-trip");
  modal.panel.lang = lang;
  modal.panel.setAttribute("aria-describedby", "kw-trip-d");

  const head = document.createElement("div");
  head.className = "kw-trip-head";
  const h = document.createElement("h2");
  h.id = "kw-trip-h";
  h.className = "kw-modal-title";
  h.textContent = c.title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "kw-btn";
  close.textContent = c.close;
  close.addEventListener("click", () => modal.close());
  head.append(h, close);
  const lede = document.createElement("p");
  lede.id = "kw-trip-d";
  lede.className = "kw-trip-lede";
  lede.textContent = c.lede;

  const map = document.createElement("div");
  map.className = "kw-trip-map";
  // The roads: from Qusqu to every world, in the suyu's dye over an ink casing (decorative; the cards carry it all).
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 300 300");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("kw-trip-roads");
  for (const p of TRIP_PLACES) {
    if (p.world === "cusco") continue;
    for (const [cls, color] of [
      ["kw-trip-road-case", "currentColor"],
      ["kw-trip-road", p.dye],
    ] as const) {
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", "150");
      line.setAttribute("y1", "150");
      line.setAttribute("x2", String(cx(p.col)));
      line.setAttribute("y2", String(cx(p.row)));
      line.setAttribute("stroke", color);
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.classList.add(cls);
      svg.append(line);
    }
  }
  map.append(svg);
  // A compass mark in the empty north cell.
  const north = document.createElement("span");
  north.className = "kw-trip-north";
  north.setAttribute("aria-hidden", "true");
  north.textContent = c.north;
  map.append(north);

  const cards = new Map<TripWorld, HTMLButtonElement>();
  const states = new Map<TripWorld, HTMLElement>();
  for (const p of TRIP_PLACES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kw-trip-card";
    b.dataset.world = p.world;
    b.style.gridColumn = String(p.col + 1);
    b.style.gridRow = String(p.row + 1);
    b.style.setProperty("--kw-trip-dye", p.dye);
    const name = document.createElement("span");
    name.className = "kw-trip-name";
    name.textContent = p.name[lang];
    const line = document.createElement("span");
    line.className = "kw-trip-line";
    line.textContent = p.line[lang];
    const state = document.createElement("span");
    state.className = "kw-trip-state";
    b.append(name, line, state);
    if (p.world === current) {
      b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-current", "location");
    }
    b.addEventListener("click", () => {
      if (p.world === current || !open) return;
      modal.close();
      void travelTo(lang, current, p.world);
    });
    const warm = () => {
      if (p.world !== current) prefetchWorld(lang, p.world);
    };
    b.addEventListener("pointerenter", warm);
    b.addEventListener("focus", warm);
    cards.set(p.world, b);
    states.set(p.world, state);
    map.append(b);
  }

  const hint = document.createElement("p");
  hint.className = "kw-trip-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = c.hint;

  modal.panel.append(head, lede, map, hint);

  /** Visited marks are read from the passport each time the panel opens (it is the only source). */
  const refresh = () => {
    const visited = visitedWorlds(loadPassport());
    for (const p of TRIP_PLACES) {
      const el = states.get(p.world);
      if (!el) continue;
      const here = p.world === current;
      const seen = visited.has(p.world);
      el.textContent = here ? c.here : seen ? `✓ ${c.visited}` : "";
      el.hidden = !here && !seen;
      cards.get(p.world)?.classList.toggle("is-visited", seen);
    }
  };

  return {
    open() {
      // Never over another dialog (the leave confirmation lives outside the runtimes' modal counter).
      if (open || leaveOpen()) return;
      refresh();
      open = true;
      emit("world:modal", { open: true });
      modal.open(cards.get(current) ?? cards.get("cusco"));
    },
    close: () => modal.close(),
    isOpen: () => open,
    dispose() {
      window.removeEventListener("keydown", onKey, true);
      if (open) modal.close();
      modal.dispose();
    },
  };
}
