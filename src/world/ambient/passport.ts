/**
 * Passport ambient: records `world:stamp` discoveries (src/lib/passport.ts is the store) and shows the
 * passport as a paper booklet with one page per world (WORLD_PAGES: Qhapaq Ñan, Wasi, Antisuyu) plus an
 * Arcade page. Each page shows its own progress and a "page complete" seal; the header shows the totals.
 * Pages are an ARIA tabs widget (roving tabindex, ←/→/Home/End); the booklet traps focus and Esc closes it.
 *
 * Reusable from other world pages (the jungle): the book opens on the page of the world it runs in, read at
 * open time from `document.documentElement.dataset.world` (set it with `setPassportWorld`). While the
 * traveler is inside the Wasi house (`world:interior` with an id starting with "wasi") it opens on Wasi.
 * Mountain-only parts are guarded: walk-up stamping of stations/summit runs only on the mountain, and the
 * best-climb/errand block (journey.ts, errand/state.ts: pure storage readers) is shown on the Qhapaq page.
 */
import {
  CATALOG,
  loadPassport,
  mergedPassport,
  passportComplete,
  recordStamp,
  WORLD_PAGES,
  worldOf,
} from "../../lib/passport";
import type { CreateAmbient, L } from "../contract";
import { emit, on, type StampKind, type WorldId } from "../events";
import { formatDuration, loadJourney } from "../journey";
import { errandRows, loadErrands } from "./errand/state";
import "./passport/passport.css";

const WORLD_IDS = new Set<string>(WORLD_PAGES.map((page) => page.id));

/** Declares which world this page runs in, so the passport opens on its page (the jungle runtime calls it). */
export function setPassportWorld(id: WorldId): void {
  document.documentElement.dataset.world = id;
}

function currentWorld(): WorldId {
  const id = document.documentElement.dataset.world;
  return id && WORLD_IDS.has(id) ? (id as WorldId) : "qhapaq";
}

const COPY = {
  title: { es: "Pasaporte del Tawantinsuyu", en: "Tawantinsuyu passport" },
  button: { es: "Pasaporte", en: "Passport" },
  close: { es: "Cerrar pasaporte", en: "Close passport" },
  postcard: { es: "Mi postal", en: "My postcard" },
  pages: { es: "Páginas del pasaporte", en: "Passport pages" },
  pageDone: { es: "Página completa", en: "Page complete" },
  fresh: { es: "Nuevo sello", en: "New stamp" },
  missing: { es: "Por descubrir", en: "Undiscovered" },
  locked: { es: "Bloqueado", en: "Locked" },
  unlocked: { es: "Desbloqueado", en: "Unlocked" },
  camino: { es: "Camino", en: "Trail" },
  cielo: { es: "Cielo", en: "Sky" },
  secretos: { es: "Secretos", en: "Secrets" },
  campos: { es: "Campos", en: "Fields" },
  fauna: { es: "Fauna", en: "Wildlife" },
  extras: { es: "Encargos, récords y fiestas", en: "Errands, records and festivals" },
  rooms: { es: "Habitaciones", en: "Rooms" },
  rio: { es: "Río y dosel", en: "River and canopy" },
  arcade: { es: "Arcade", en: "Arcade" },
  stamps: { es: "sellos", en: "stamps" },
  achievements: { es: "logros", en: "achievements" },
  total: { es: "Total", en: "Total" },
  best: { es: "Mejor subida", en: "Best climb" },
  noBest: {
    es: "sin tiempo aún: sal de la puerta del camino y llega a la cumbre sin viaje rápido",
    en: "no time yet: leave the trailhead and reach the summit without fast travel",
  },
  climbs: { es: "subidas", en: "climbs" },
  errand: { es: "Encargo", en: "Errand" },
  errandTo: { es: "khipu {place}", en: "khipu {place}" },
  done: { es: "entregado", en: "delivered" },
  carrying: { es: "en curso", en: "in progress" },
  todo: { es: "pendiente: habla con un chasqui", en: "pending: talk to a chasqui" },
  later: { es: "pendiente", en: "pending" },
} satisfies Record<string, L>;

interface Section {
  label: L;
  kinds: StampKind[];
  /** The best-climb + errands block goes under this section. */
  extras?: boolean;
}

/** Sections of each world page, in reading order. */
const SECTIONS: Record<WorldId, Section[]> = {
  qhapaq: [
    { label: COPY.camino, kinds: ["station", "summit", "ride"] },
    { label: COPY.cielo, kinds: ["constellation", "weather"] },
    { label: COPY.secretos, kinds: ["egg"] },
    { label: COPY.campos, kinds: ["field"] },
    { label: COPY.fauna, kinds: ["fauna"] },
    { label: COPY.extras, kinds: ["npc", "record", "festival"], extras: true },
  ],
  wasi: [{ label: COPY.rooms, kinds: ["room"] }],
  selva: [
    { label: COPY.camino, kinds: ["station"] },
    { label: COPY.rio, kinds: ["ride", "field"] },
    { label: COPY.fauna, kinds: ["fauna"] },
  ],
};

type TabId = WorldId | "arcade";

export const create: CreateAmbient = (env, hudRoot) => {
  const state = loadPassport();
  const text = (label: L) => label[env.lang];
  const dates = new Intl.DateTimeFormat(env.lang === "es" ? "es-PE" : "en-US", { dateStyle: "medium" });
  const layer = document.createElement("div");
  layer.className = "qn-passport";
  layer.classList.toggle("is-reduced", env.reducedMotion);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "qn-passport-button";
  button.textContent = `${text(COPY.button)} · P`;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const toast = document.createElement("div");
  toast.className = "qn-passport-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");
  const overlay = document.createElement("div");
  overlay.className = "qn-passport-overlay";
  overlay.hidden = true;
  const panel = document.createElement("div");
  panel.className = "qn-passport-book";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "qn-passport-title");
  panel.tabIndex = -1;
  const heading = document.createElement("h2");
  heading.id = "qn-passport-title";
  heading.textContent = text(COPY.title);
  // Close: an X that stays pinned to the top-right corner while the book scrolls (phones scroll a long way).
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "qn-passport-x";
  closeButton.setAttribute("aria-label", text(COPY.close));
  closeButton.title = text(COPY.close);
  closeButton.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const postcardButton = document.createElement("button");
  postcardButton.type = "button";
  postcardButton.className = "qn-passport-close qn-passport-postcard";
  postcardButton.textContent = text(COPY.postcard);
  postcardButton.addEventListener("click", () => {
    close();
    emit("world:postcard", undefined);
  });
  const summary = document.createElement("p");
  summary.className = "qn-passport-totals";
  const meter = document.createElement("div");
  meter.className = "qn-passport-meter";
  meter.setAttribute("aria-hidden", "true");
  const meterFill = document.createElement("span");
  meter.append(meterFill);

  // ---------------------------------------------------------------- tabs (built once; contents re-rendered)
  const tablist = document.createElement("div");
  tablist.className = "qn-passport-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", text(COPY.pages));
  const pages: Array<{ id: TabId; label: L; tab: HTMLButtonElement; count: HTMLSpanElement; body: HTMLElement }> = [
    ...WORLD_PAGES,
    { id: "arcade" as const, label: COPY.arcade },
  ].map(({ id, label }) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `qn-passport-tab-${id}`;
    tab.className = "qn-passport-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `qn-passport-page-${id}`);
    const name = document.createElement("span");
    name.textContent = text(label);
    const count = document.createElement("span");
    count.className = "qn-passport-tab-count";
    tab.append(name, count);
    tab.addEventListener("click", () => select(id, true));
    tablist.append(tab);
    const body = document.createElement("section");
    body.id = `qn-passport-page-${id}`;
    body.className = "qn-passport-page";
    body.setAttribute("role", "tabpanel");
    body.setAttribute("aria-labelledby", tab.id);
    // The panel itself is focusable (it may hold no controls), per the ARIA tabs pattern.
    body.tabIndex = 0;
    return { id, label, tab, count, body };
  });
  panel.append(closeButton, heading, postcardButton, summary, meter, tablist, ...pages.map((page) => page.body));
  overlay.append(panel);
  layer.append(button, toast, overlay);
  hudRoot.append(layer);

  let opened = false;
  let current: TabId = "qhapaq";
  let insideWasi = false;
  let previousFocus: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let completionSent = false;
  let disposed = false;
  let otherModal = false;
  let gameOpen = false;

  // Walk-up stamps for the mountain's stations and summit. Only on the mountain page: elsewhere the env's
  // trail and stations belong to another world (the jungle's trail end is not the summit).
  const onMountain = currentWorld() !== "selva" && !("selva" in env);
  const nearby = onMountain
    ? CATALOG.filter(
        (stamp) => worldOf(stamp) === "qhapaq" && (stamp.kind === "station" || stamp.kind === "summit"),
      ).flatMap((stamp) => {
        try {
          const position = stamp.kind === "summit" ? env.trail.pointAt(1) : env.stationPose(stamp.id.slice(8)).position;
          return [
            {
              stamp,
              position,
              radiusSquared: stamp.kind === "summit" ? 100 : 49,
              visited: Boolean(state.stamps[stamp.id]),
            },
          ];
        } catch {
          return [];
        }
      })
    : [];

  function checkComplete() {
    // Fires only once every page is complete (the arcade reward listens to it).
    if (completionSent || !passportComplete(state)) return;
    completionSent = true;
    emit("world:passport-complete", { total: CATALOG.length });
  }

  function select(id: TabId, focus = false) {
    current = id;
    for (const page of pages) {
      const active = page.id === id;
      page.tab.setAttribute("aria-selected", String(active));
      page.tab.tabIndex = active ? 0 : -1;
      page.body.hidden = !active;
      if (active && focus) {
        page.tab.focus();
        page.tab.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    }
  }

  function seal(label: string, collectedAt: number | null) {
    const item = document.createElement("li");
    item.className = `qn-passport-seal${collectedAt !== null ? " is-collected" : ""}`;
    const strong = document.createElement("strong");
    strong.textContent = label;
    const date = document.createElement("span");
    date.textContent = collectedAt !== null ? dates.format(collectedAt) : text(COPY.missing);
    item.append(strong, date);
    return item;
  }

  /** Page header: title, collected/total and, once the page's required stamps are in, the seal. */
  function pageHead(title: string, got: number, total: number, unit: L, done: boolean) {
    const head = document.createElement("header");
    head.className = "qn-passport-page-head";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    const progress = document.createElement("p");
    progress.className = "qn-passport-page-progress";
    progress.textContent = `${got}/${total} ${text(unit)}`;
    head.append(h3, progress);
    if (done) {
      const mark = document.createElement("span");
      mark.className = "qn-passport-page-seal";
      mark.textContent = text(COPY.pageDone);
      head.append(mark);
    }
    return head;
  }

  function render() {
    const view = mergedPassport(state);
    summary.textContent = `${view.worldCollected}/${view.worldTotal} ${text(COPY.stamps)} · ${view.arcadeCollected}/${view.arcadeTotal} ${text(COPY.achievements)} · ${text(COPY.total)}: ${view.collected}/${view.total} (${view.percentage}%)`;
    meterFill.style.width = `${view.percentage}%`;
    for (const page of pages) {
      if (page.id === "arcade") {
        page.count.textContent = `${view.arcadeCollected}/${view.arcadeTotal}`;
        page.tab.classList.toggle("is-done", view.arcadeCollected === view.arcadeTotal);
        page.body.replaceChildren(
          pageHead(
            text(page.label),
            view.arcadeCollected,
            view.arcadeTotal,
            COPY.achievements,
            view.arcadeTotal > 0 && view.arcadeCollected === view.arcadeTotal,
          ),
          arcadeList(view.arcade),
        );
        continue;
      }
      const world = page.id;
      const stamps = view.world.filter((stamp) => worldOf(stamp) === world);
      const got = stamps.filter((stamp) => stamp.collectedAt !== null).length;
      const done = passportComplete(state, world);
      page.count.textContent = `${got}/${stamps.length}`;
      page.tab.classList.toggle("is-done", done);
      const children: HTMLElement[] = [pageHead(text(page.label), got, stamps.length, COPY.stamps, done)];
      for (const section of SECTIONS[world]) {
        const list = stamps.filter((stamp) => section.kinds.includes(stamp.kind));
        if (!list.length) continue;
        const title = document.createElement("h4");
        const n = list.filter((stamp) => stamp.collectedAt !== null).length;
        title.textContent = `${text(section.label)} · ${n}/${list.length}`;
        const grid = document.createElement("ul");
        grid.className = "qn-passport-grid";
        for (const stamp of list) grid.append(seal(text(stamp.label), stamp.collectedAt));
        children.push(title, grid);
        if (section.extras) children.push(extrasDetail());
      }
      page.body.replaceChildren(...children);
    }
  }

  function arcadeList(achievements: ReturnType<typeof mergedPassport>["arcade"]) {
    const list = document.createElement("ul");
    list.className = "qn-passport-arcade";
    for (const achievement of achievements) {
      const row = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = text(achievement.title);
      const description = document.createElement("span");
      description.textContent = text(achievement.description);
      const status = document.createElement("span");
      status.textContent =
        achievement.collectedAt !== null
          ? `${text(COPY.unlocked)} · ${dates.format(achievement.collectedAt)}`
          : text(COPY.locked);
      row.classList.toggle("is-collected", achievement.collectedAt !== null);
      row.append(label, description, status);
      list.append(row);
    }
    return list;
  }

  /** Best climb time and each errand's state, under the "errands, records and festivals" seals. */
  function extrasDetail() {
    const list = document.createElement("ul");
    list.className = "qn-passport-extras";
    const row = (label: string, value: string, on: boolean) => {
      const li = document.createElement("li");
      li.classList.toggle("is-on", on);
      const k = document.createElement("strong");
      k.textContent = label;
      const v = document.createElement("span");
      v.textContent = value;
      li.append(k, v);
      list.append(li);
    };
    const journey = loadJourney();
    row(
      text(COPY.best),
      journey.bestMs !== null
        ? `${formatDuration(journey.bestMs, env.lang)} · ${journey.climbs} ${text(COPY.climbs)}`
        : text(COPY.noBest),
      journey.bestMs !== null,
    );
    const errands = loadErrands();
    let offered = false;
    errandRows(errands).forEach(({ mission, status }, i) => {
      const place = text(COPY.errandTo).replace("{place}", text(mission.place));
      let state: string;
      if (status === "done") state = text(COPY.done);
      else if (status === "active") state = text(COPY.carrying);
      else {
        state = text(offered ? COPY.later : COPY.todo);
        offered = true;
      }
      row(`${text(COPY.errand)} ${["I", "II", "III"][i]}`, `${place} · ${state}`, status !== "todo");
    });
    return list;
  }

  function close() {
    if (!opened) return false;
    opened = false;
    overlay.hidden = true;
    button.setAttribute("aria-expanded", "false");
    emit("world:modal", { open: false });
    if (previousFocus?.isConnected) previousFocus.focus();
    else button.focus();
    return true;
  }

  function open() {
    if (opened || otherModal || gameOpen) return;
    if (hudRoot.classList.contains("kw-hud") && !hudRoot.classList.contains("on")) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    render();
    select(insideWasi ? "wasi" : currentWorld());
    opened = true;
    overlay.hidden = false;
    panel.scrollTop = 0;
    button.setAttribute("aria-expanded", "true");
    emit("world:modal", { open: true });
    panel.focus();
  }

  /** Controls reachable with Tab, in order: the two buttons, the active tab, the active page. */
  function focusables(): HTMLElement[] {
    const page = pages.find((entry) => entry.id === current);
    return page ? [closeButton, postcardButton, page.tab, page.body] : [closeButton, postcardButton];
  }

  function onKey(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, select, [role=textbox]"))
    )
      return;
    if (event.key.toLowerCase() === "p" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (opened) close();
      else open();
      return;
    }
    if (!opened) return;
    if (event.key === "Tab") {
      // Focus trap: cycle through the booklet's controls only.
      event.preventDefault();
      const list = focusables();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = at < 0 ? (event.shiftKey ? list.length - 1 : 0) : (at + step + list.length) % list.length;
      list[next]?.focus();
      return;
    }
    // Page turning: on the tabs (ARIA pattern) and also from the book itself or the open page.
    const active = document.activeElement;
    const onTabs = active instanceof HTMLElement && active.getAttribute("role") === "tab";
    if (!onTabs && active !== panel && !(active instanceof HTMLElement && active.getAttribute("role") === "tabpanel"))
      return;
    const index = pages.findIndex((page) => page.id === current);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % pages.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + pages.length) % pages.length;
    else if (onTabs && event.key === "Home") next = 0;
    else if (onTabs && event.key === "End") next = pages.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const page = pages[next];
    if (page) select(page.id, onTabs);
  }

  const offStamp = on("world:stamp", (detail) => {
    if (!recordStamp(state, detail.id)) return;
    const stamp = CATALOG.find((entry) => entry.id === detail.id);
    if (stamp) {
      clearTimeout(toastTimer);
      toast.textContent = `${text(COPY.fresh)} · ${text(stamp.label)}`;
      toast.classList.remove("is-on");
      // Restart the seal animation only on discoveries, never in the frame loop.
      void toast.offsetWidth;
      toast.classList.add("is-on");
      toastTimer = setTimeout(() => {
        toast.classList.remove("is-on");
        toast.textContent = "";
      }, 3500);
    }
    if (opened) render();
    checkComplete();
  });
  const offModal = on("world:modal", ({ open: active }) => {
    if (!opened) otherModal = active;
  });
  const offGame = on("world:game", ({ open: active }) => {
    gameOpen = active;
    if (active) close();
  });
  const offInterior = on("world:interior", ({ inside, id }) => {
    if (id.startsWith("wasi")) insideWasi = inside;
  });
  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  window.addEventListener("keydown", onKey);
  select(currentWorld());
  // Defer the persisted-completion signal until every ambient has installed its listeners.
  queueMicrotask(() => {
    if (!disposed) checkComplete();
  });

  return {
    update(_dt, avatar) {
      for (let i = 0; i < nearby.length; i++) {
        const entry = nearby[i];
        if (!entry || entry.visited || avatar.distanceToSquared(entry.position) > entry.radiusSquared) continue;
        entry.visited = true;
        emit("world:stamp", entry.stamp);
      }
    },
    escape: close,
    dispose() {
      disposed = true;
      close();
      clearTimeout(toastTimer);
      offStamp();
      offModal();
      offGame();
      offInterior();
      button.removeEventListener("click", open);
      closeButton.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      layer.remove();
    },
  };
};
