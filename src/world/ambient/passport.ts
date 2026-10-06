import { CATALOG, loadPassport, mergedPassport, passportComplete, recordStamp } from "../../lib/passport";
import type { CreateAmbient, L } from "../contract";
import { emit, on } from "../events";
import { formatDuration, loadJourney } from "../journey";
import { errandRows, loadErrands } from "./errand/state";
import "./passport/passport.css";

const COPY = {
  title: { es: "Pasaporte del Qhapaq Ñan", en: "Qhapaq Ñan passport" },
  button: { es: "Pasaporte", en: "Passport" },
  close: { es: "Cerrar pasaporte", en: "Close passport" },
  postcard: { es: "Mi postal", en: "My postcard" },
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
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "qn-passport-close";
  closeButton.textContent = text(COPY.close);
  const postcardButton = document.createElement("button");
  postcardButton.type = "button";
  postcardButton.className = "qn-passport-close qn-passport-postcard";
  postcardButton.textContent = text(COPY.postcard);
  postcardButton.addEventListener("click", () => {
    close();
    emit("world:postcard", undefined);
  });
  const body = document.createElement("div");
  panel.append(heading, closeButton, postcardButton, body);
  overlay.append(panel);
  layer.append(button, toast, overlay);
  hudRoot.append(layer);

  let opened = false;
  let previousFocus: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let completionSent = false;
  let disposed = false;
  let otherModal = false;
  let gameOpen = false;
  const nearby = CATALOG.filter((stamp) => stamp.kind === "station" || stamp.kind === "summit").map((stamp) => ({
    stamp,
    position: stamp.kind === "summit" ? env.trail.pointAt(1) : env.stationPose(stamp.id.slice(8)).position,
    radiusSquared: stamp.kind === "summit" ? 100 : 49,
    visited: Boolean(state.stamps[stamp.id]),
  }));

  function checkComplete() {
    if (completionSent || !passportComplete(state)) return;
    completionSent = true;
    emit("world:passport-complete", { total: CATALOG.length });
  }

  function render() {
    const view = mergedPassport(state);
    const summary = document.createElement("p");
    summary.className = "qn-passport-totals";
    summary.textContent = `${view.worldCollected}/${view.worldTotal} ${text(COPY.stamps)} · ${view.arcadeCollected}/${view.arcadeTotal} ${text(COPY.achievements)} · ${text(COPY.total)}: ${view.collected}/${view.total} (${view.percentage}%)`;
    body.replaceChildren(summary);
    const sections = [
      { label: COPY.camino, kinds: ["station", "summit", "ride"] },
      { label: COPY.cielo, kinds: ["constellation", "weather"] },
      { label: COPY.secretos, kinds: ["egg"] },
      { label: COPY.campos, kinds: ["field"] },
      { label: COPY.fauna, kinds: ["fauna"] },
      { label: COPY.extras, kinds: ["npc", "record", "festival"] },
    ];
    for (const section of sections) {
      const title = document.createElement("h3");
      title.textContent = text(section.label);
      const grid = document.createElement("ul");
      grid.className = "qn-passport-grid";
      for (const stamp of view.world) {
        if (!section.kinds.includes(stamp.kind)) continue;
        const seal = document.createElement("li");
        seal.className = `qn-passport-seal${stamp.collectedAt !== null ? " is-collected" : ""}`;
        const label = document.createElement("strong");
        label.textContent = text(stamp.label);
        const date = document.createElement("span");
        date.textContent = stamp.collectedAt !== null ? dates.format(stamp.collectedAt) : text(COPY.missing);
        seal.append(label, date);
        grid.append(seal);
      }
      body.append(title, grid);
      if (section.label === COPY.extras) body.append(extrasDetail());
    }
    const arcadeTitle = document.createElement("h3");
    arcadeTitle.textContent = text(COPY.arcade);
    const achievements = document.createElement("ul");
    achievements.className = "qn-passport-arcade";
    for (const achievement of view.arcade) {
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
      achievements.append(row);
    }
    body.append(arcadeTitle, achievements);
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
    opened = true;
    overlay.hidden = false;
    button.setAttribute("aria-expanded", "true");
    emit("world:modal", { open: true });
    panel.focus();
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
    }
    if (opened && event.key === "Tab") {
      // The booklet contains one interactive control; keep focus inside the dialog.
      event.preventDefault();
      closeButton.focus();
    }
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
  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  window.addEventListener("keydown", onKey);
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
      button.removeEventListener("click", open);
      closeButton.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      layer.remove();
    },
  };
};
