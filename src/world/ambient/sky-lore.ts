/**
 * Sky lore: at night, on the trail by the AI Intihuatana and just below the summit plaza, "E · Mirar el
 * cielo" opens a paper panel about the Andean dark constellations of the Milky Way (Yacana, Mach'acuay,
 * Hanp'atu) with a drawn silhouette each. Each tab viewed emits its `constellation:<id>` stamp.
 * Trigger points sit on the path a few meters from the station/summit spots so this never steals E from
 * content's own panels there.
 */
import * as THREE from "three";
import type { CreateAmbient, L } from "../contract";
import { emit } from "../events";
import { CONSTELLATIONS, type Constellation } from "./sky/constellations";
import "./sky/sky-lore.css";

const R = 3.4;
/** Keep clear of content's interact spots (station focus / summit plaza). */
const CLEAR = 6.5;

const T = {
  prompt: { es: "E · Mirar el cielo", en: "E · Look at the sky" },
  title: { es: "Constelaciones oscuras", en: "Dark constellations" },
  lede: {
    es: "En los Andes también se leen las sombras del cielo: siluetas de animales que forman las nubes de polvo de Mayu, el río celeste que llamamos Vía Láctea.",
    en: "In the Andes the sky's shadows are read too: animal shapes formed by the dust clouds of Mayu, the sky river we call the Milky Way.",
  },
  source: {
    es: "Fuentes: manuscrito de Huarochirí (c. 1608); G. Urton, «At the Crossroads of the Earth and the Sky» (1981).",
    en: 'Sources: Huarochirí manuscript (c. 1608); G. Urton, "At the Crossroads of the Earth and the Sky" (1981).',
  },
  close: { es: "Cerrar", en: "Close" },
  tabs: { es: "Constelaciones", en: "Constellations" },
} satisfies Record<string, L>;

const SVG = "http://www.w3.org/2000/svg";

function silhouette(c: Constellation, idx: number): SVGSVGElement {
  const pad = 3;
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", `${-pad} ${-pad} ${c.w + pad * 2} ${c.h + pad * 2}`);
  s.setAttribute("aria-hidden", "true");
  s.classList.add("qn-sky-art");
  const gid = `qn-sky-glow-${idx}`;
  s.innerHTML = `<defs><radialGradient id="${gid}" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#5b6aa8"/><stop offset="1" stop-color="#161a3d"/></radialGradient></defs><rect x="${-pad}" y="${-pad}" width="${c.w + pad * 2}" height="${c.h + pad * 2}" fill="url(#${gid})"/><path d="${c.path}" fill="#0b0d22" stroke="#efe6d6" stroke-width="0.35" stroke-linejoin="round"/>`;
  for (const [x, y] of c.eyes ?? []) {
    const e = document.createElementNS(SVG, "circle");
    e.setAttribute("cx", String(x));
    e.setAttribute("cy", String(y));
    e.setAttribute("r", "0.8");
    e.setAttribute("fill", "#ffe7b8");
    s.appendChild(e);
  }
  return s;
}

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const t = (l: L) => l[lang];

  // Trigger points: on the path by the AI station, and on the path a little below the summit plaza.
  const aiPose = env.stationPose("ai").position;
  const ai = env.trail.pointAt(0.86, new THREE.Vector3());
  const top = env.trail.pointAt(1, new THREE.Vector3());
  const back = Math.min(0.05, 11 / Math.max(1, env.trail.length));
  const nearTop = env.trail.pointAt(1 - back, new THREE.Vector3());
  // Avoid every station pose (content spots) and the summit finale itself.
  const avoid: THREE.Vector3[] = [aiPose, top];
  for (const id of ["contact", "build-3", "arcade"]) {
    try {
      avoid.push(env.stationPose(id).position.clone());
    } catch {
      /* station not placed */
    }
  }
  // Slide each trigger along the path (downhill first) until it clears every content spot,
  // so the prompt can actually show (the AI pose sits ~5 units from the path at t 0.86).
  const clearOf = (v: THREE.Vector3) => avoid.every((q) => (v.x - q.x) ** 2 + (v.z - q.z) ** 2 > (CLEAR + R) ** 2);
  const settle = (v: THREE.Vector3, t0: number) => {
    for (let i = 1; i <= 40 && !clearOf(v); i++) {
      const dt = Math.ceil(i / 2) * 0.004 * (i % 2 ? -1 : 1);
      env.trail.pointAt(Math.min(1, Math.max(0, t0 + dt)), v);
    }
    return v;
  };
  const triggers = [settle(ai, 0.86), settle(nearTop, 1 - back)];

  // ---------------------------------------------------------------- DOM
  const layer = document.createElement("div");
  layer.className = "qn-hud qn-sky-layer";
  const panel = document.createElement("section");
  panel.className = "qn-sky-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "qn-sky-title");
  panel.tabIndex = -1;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "qn-btn qn-icon qn-sky-close";
  close.setAttribute("aria-label", t(T.close));
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const head = document.createElement("header");
  head.className = "qn-sky-head";
  const h = document.createElement("h2");
  h.id = "qn-sky-title";
  h.textContent = t(T.title);
  const lede = document.createElement("p");
  lede.className = "qn-sky-lede";
  lede.textContent = t(T.lede);
  head.append(h, lede);
  const tabs = document.createElement("div");
  tabs.className = "qn-sky-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t(T.tabs));
  const body = document.createElement("div");
  body.className = "qn-sky-body";
  const src = document.createElement("p");
  src.className = "qn-sky-src";
  src.textContent = t(T.source);
  panel.append(close, head, tabs, body, src);
  layer.appendChild(panel);
  hudRoot.appendChild(layer);

  const tabBtns: HTMLButtonElement[] = [];
  const views: HTMLElement[] = [];
  CONSTELLATIONS.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qn-sky-tab";
    b.id = `qn-sky-tab-${c.id}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", `qn-sky-view-${c.id}`);
    b.textContent = c.name;
    b.addEventListener("click", () => select(i, true));
    tabBtns.push(b);
    tabs.appendChild(b);
    const v = document.createElement("article");
    v.className = "qn-sky-view";
    v.id = `qn-sky-view-${c.id}`;
    v.setAttribute("role", "tabpanel");
    v.setAttribute("aria-labelledby", b.id);
    v.tabIndex = 0;
    const cap = document.createElement("h3");
    cap.textContent = t(c.label);
    const p = document.createElement("p");
    p.textContent = t(c.text);
    v.append(silhouette(c, i), cap, p);
    views.push(v);
    body.appendChild(v);
  });

  let open = false;
  let current = 0;
  const select = (i: number, focus: boolean) => {
    current = (i + CONSTELLATIONS.length) % CONSTELLATIONS.length;
    tabBtns.forEach((b, j) => {
      const on = j === current;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      views[j]!.hidden = !on;
    });
    if (focus) tabBtns[current]!.focus();
    const c = CONSTELLATIONS[current]!;
    emit("world:stamp", { id: `constellation:${c.id}`, kind: "constellation", label: c.label });
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") select(current + 1, true);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") select(current - 1, true);
    else if (e.key === "Home") select(0, true);
    else if (e.key === "End") select(CONSTELLATIONS.length - 1, true);
    else return;
    e.preventDefault();
  };
  tabs.addEventListener("keydown", onTabKey);
  // Keep keys typed inside the panel from moving the traveler.
  const stopKeys = (e: KeyboardEvent) => {
    if (e.key === "Escape") return;
    e.stopPropagation();
    if (e.key !== "Tab") return;
    // Focus trap: close button ↔ selected tab ↔ visible text.
    const ring: HTMLElement[] = [close, tabBtns[current]!, views[current]!];
    const i = ring.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? ring.length - 1 : i - 1) : i < 0 || i >= ring.length - 1 ? 0 : i + 1;
    ring[next]!.focus();
    e.preventDefault();
  };
  panel.addEventListener("keydown", stopKeys);

  let returnFocus: HTMLElement | null = null;
  const setOpen = (v: boolean) => {
    if (open === v) return;
    open = v;
    panel.hidden = !v;
    if (v) {
      returnFocus = document.activeElement as HTMLElement | null;
      layer.classList.toggle("is-night", env.sky.isNight());
      panel.classList.remove("is-open");
      void panel.offsetWidth;
      panel.classList.add("is-open");
      select(current, true);
    } else {
      returnFocus?.focus?.({ preventScroll: true });
      returnFocus = null;
    }
    emit("world:modal", { open: v });
  };
  close.addEventListener("click", () => setOpen(false));

  let inRange = false;
  return {
    update(_dt, avatar) {
      inRange = false;
      if (open) return;
      for (const p of triggers) {
        const dx = avatar.x - p.x;
        const dz = avatar.z - p.z;
        if (dx * dx + dz * dz < R * R) inRange = true;
      }
      if (!inRange) return;
      for (const p of avoid) {
        const dx = avatar.x - p.x;
        const dz = avatar.z - p.z;
        if (dx * dx + dz * dz < CLEAR * CLEAR) inRange = false;
      }
    },
    prompt() {
      return !open && inRange && env.sky.isNight() ? t(T.prompt) : null;
    },
    interact() {
      if (open || !inRange || !env.sky.isNight()) return false;
      setOpen(true);
      return true;
    },
    escape() {
      if (!open) return false;
      setOpen(false);
      return true;
    },
    dispose() {
      if (open) emit("world:modal", { open: false });
      tabs.removeEventListener("keydown", onTabKey);
      panel.removeEventListener("keydown", stopKeys);
      layer.remove();
    },
  };
};
