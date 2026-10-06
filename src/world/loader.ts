/**
 * Khipu loading screen: pendant cords fill and knot themselves as the world loads.
 * `loaderHtml` is pure (world.astro renders it at build time); `createLoader` adopts that markup
 * (or builds it) and index.ts reports real steps: modules → terrain → content → ambients → first frame.
 * Styles live in world.css (.kw-loader).
 */
import type { Lang } from "./contract";

export type LoadStep = "modules" | "terrain" | "content" | "ambients" | "ready";

const COPY = {
  es: {
    title: "Tejiendo la montaña…",
    label: "Cargando el mundo",
    modules: "Reuniendo los hilos",
    terrain: "Levantando la montaña",
    content: "Construyendo los tambos",
    ambients: "Despertando el camino",
    ready: "Listo",
    fail: "No se pudo cargar el mundo.",
    text: "Leer el recorrido en modo texto",
  },
  en: {
    title: "Weaving the mountain…",
    label: "Loading the world",
    modules: "Gathering the threads",
    terrain: "Raising the mountain",
    content: "Building the tambos",
    ambients: "Waking the trail",
    ready: "Ready",
    fail: "The world could not load.",
    text: "Read the walk in text mode",
  },
} as const;

const CORDS = ["#c4383f", "#3446a6", "#dda63c", "#2a9d8f", "#a8825f", "#c4383f", "#2a9d8f", "#dda63c"];
/** Knot offsets (px from the top cord) per pendant, like a real khipu's decimal positions. */
const KNOTS = [
  [14, 30, 52],
  [20, 44],
  [12, 26, 40, 58],
  [34, 50],
  [18, 38, 56],
  [24, 48],
  [14, 32, 44, 60],
  [28, 54],
];

/** Static loader markup (inner HTML of the `[data-loading]` element). */
export function loaderHtml(lang: Lang): string {
  const c = COPY[lang];
  const cords = CORDS.map(
    (dye, i) =>
      `<span class="kw-loader-cord" style="--i:${i};--dye:${dye}"><span class="kw-loader-fill">${(KNOTS[i] ?? [])
        .map((y) => `<i style="top:${y}px"></i>`)
        .join("")}</span></span>`,
  ).join("");
  return `<div class="kw-loader-art" aria-hidden="true"><span class="kw-loader-top"></span><span class="kw-loader-cords">${cords}</span></div>
<p class="kw-loader-text" role="progressbar" aria-label="${c.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="kw-loader-title">${c.title}</span> <span class="kw-loader-pct" data-loading-pct>0 %</span></p>
<p class="kw-loader-step" data-loading-step aria-live="polite"></p>`;
}

export interface Loader {
  /** p in 0..100 (never goes back); step text is announced once per step. */
  progress(p: number, step?: LoadStep): void;
  done(): void;
  fail(onText?: () => void): void;
  remove(): void;
}

export function createLoader(host: HTMLElement, lang: Lang, reducedMotion: boolean): Loader {
  const c = COPY[lang];
  let el = host.querySelector<HTMLElement>("[data-loading]");
  if (!el?.querySelector("[data-loading-pct]")) {
    el?.remove();
    el = document.createElement("div");
    el.setAttribute("data-loading", "");
    el.innerHTML = loaderHtml(lang);
    host.append(el);
  }
  el.classList.add("kw-loader");
  el.hidden = false;
  const root = el;
  const bar = root.querySelector<HTMLElement>('[role="progressbar"]');
  const pct = root.querySelector<HTMLElement>("[data-loading-pct]");
  const stepEl = root.querySelector<HTMLElement>("[data-loading-step]");
  let cur = 0;
  let last: LoadStep | null = null;
  let timer = 0;
  return {
    progress(p, step) {
      cur = Math.max(cur, Math.min(100, p));
      const r = Math.round(cur);
      root.style.setProperty("--p", String(cur / 100));
      bar?.setAttribute("aria-valuenow", String(r));
      if (pct) pct.textContent = `${r} %`;
      if (step && step !== last) {
        last = step;
        if (stepEl) stepEl.textContent = c[step];
      }
    },
    done() {
      this.progress(100, "ready");
      root.classList.add("is-done");
      clearTimeout(timer);
      timer = window.setTimeout(() => root.remove(), reducedMotion ? 0 : 700);
    },
    fail(onText) {
      root.classList.add("is-failed");
      if (stepEl) stepEl.textContent = c.fail;
      if (onText && !root.querySelector(".kw-loader-alt")) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "kw-btn kw-loader-alt";
        b.textContent = c.text;
        b.addEventListener("click", onText);
        root.append(b);
      }
    },
    remove() {
      clearTimeout(timer);
      root.remove();
    },
  };
}
