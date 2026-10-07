/**
 * Big paper map + fast travel (core). M / `world:map` / the HUD map button / gamepad Y open a full-screen
 * ink-on-paper map: terrain baked once from heightAt (hypsometric tints + contour lines), the Qhapaq Ñan,
 * station markers, the traveler and their heading. Visited stations are marked from the passport's
 * station stamps (the only stored record of the walk). Fast travel is earned: it opens for every station once
 * the traveler has reached the summit (`summit` stamp, kept in storage); then the map emits
 * `world:teleport {to}` and index.ts moves the traveler with a short fade.
 * Next to the canvas, a keyboard list of stations (the accessible version of the map).
 * Landmarks at the trailhead (the Wasi house, the Antisuyu punku; trailhead.ts) are drawn as labelled
 * diamonds only: they are not fast-travel stops.
 */
import "./map.css";
import type { Lang } from "./contract";
import { emit, on } from "./events";
import { fonts } from "./palette";
import { createOverlay, esc } from "./textmode";
import { PUNKU, WASI } from "./trailhead";

export interface MapStop {
  id: string;
  label: string;
  color: string;
  x: number;
  z: number;
}

export interface MapBounds {
  minX: number;
  minZ: number;
  size: number;
}

export const PASSPORT_KEY = "ldiego73-passport-v1";
/** Retired: the map used to keep its own visited list; the passport is now the only record (removed on load). */
const LEGACY_VISITED_KEY = "ldiego73-world-visited-v1";
/** Stops that count as visited from the start (the trailhead). */
export const ALWAYS_OPEN = new Set(["gate"]);

/** Non-teleport landmarks: label-only markers on the paper map. */
export const LANDMARKS: ReadonlyArray<{ id: string; label: { es: string; en: string }; x: number; z: number }> = [
  { id: "wasi", label: { es: "Wasi", en: "Wasi" }, x: WASI.x, z: WASI.z },
  { id: "punku", label: { es: "Punku del Antisuyu", en: "Antisuyu punku" }, x: PUNKU.x, z: PUNKU.z },
];

/** Square bounds around points, padded. */
export function mapBounds(pts: ReadonlyArray<{ x: number; z: number }>, pad: number): MapBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) return { minX: -pad, minZ: -pad, size: pad * 2 };
  const size = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
  return { minX: (minX + maxX) / 2 - size / 2, minZ: (minZ + maxZ) / 2 - size / 2, size };
}

/** World (x, z) → canvas pixels for a square map centered in a w×h box (z grows downward). */
export function project(b: MapBounds, w: number, h: number, x: number, z: number, out: { x: number; y: number }) {
  const s = Math.min(w, h) / b.size;
  out.x = (w - b.size * s) / 2 + (x - b.minX) * s;
  out.y = (h - b.size * s) / 2 + (z - b.minZ) * s;
  return out;
}

/** Stamp id → map stop id ("station:auna" → "auna", "summit" → "summit"), else null. */
export function stampToStop(id: string): string | null {
  if (id === "summit") return "summit";
  if (id.startsWith("station:")) return id.slice(8) || null;
  return null;
}

/** Stop ids visited according to the passport's JSON ({ stamps: Record<id, number> }). Tolerates garbage. */
export function parsePassport(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { stamps?: unknown };
    if (!v || typeof v !== "object" || !v.stamps || typeof v.stamps !== "object") return [];
    const out: string[] = [];
    for (const k of Object.keys(v.stamps as Record<string, unknown>)) {
      const s = stampToStop(k);
      if (s) out.push(s);
    }
    return out;
  } catch {
    return [];
  }
}

const COPY = {
  es: {
    title: "Mapa del Qhapaq Ñan",
    close: "Cerrar mapa",
    list: "Estaciones",
    hint: "Elige una estación para viajar como chasqui.",
    hintLocked: "Llega a la cumbre para viajar como chasqui.",
    travel: "Viajar",
    seen: "Visitada",
    locked: "Por descubrir",
    unlocked: "Ahora conoces el Qhapaq Ñan: abre el mapa (M) y viaja como chasqui.",
    here: "Estás aquí",
    you: "Tú",
    canvas: "Mapa en papel del camino: el valle abajo, la cumbre arriba.",
    near: "Estás cerca de",
  },
  en: {
    title: "Qhapaq Ñan map",
    close: "Close map",
    list: "Stations",
    hint: "Pick a station to travel there like a chasqui.",
    hintLocked: "Reach the summit to travel like a chasqui.",
    travel: "Travel",
    seen: "Visited",
    locked: "Not yet found",
    unlocked: "You know the Qhapaq Ñan now: open the map (M) and travel like a chasqui.",
    here: "You are here",
    you: "You",
    canvas: "Paper map of the trail: the valley below, the summit above.",
    near: "You are near",
  },
} as const;

export interface BigMap {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Mark a stop as visited (walking up to it). */
  visit(id: string): void;
  visited(): ReadonlySet<string>;
  /** Dialog panel (gamepad focus stepping). */
  panel: HTMLElement;
  dispose(): void;
}

export function createBigMap(
  host: HTMLElement,
  lang: Lang,
  o: {
    heightAt(x: number, z: number): number;
    isWater?(x: number, z: number): boolean;
    trail: ReadonlyArray<{ x: number; z: number }>;
    stops: MapStop[];
    player(): { x: number; z: number; yaw: number };
    /** Stop id nearest the traveler (or null). */
    near(): string | null;
  },
): BigMap {
  const c = COPY[lang];
  // The passport is the single record of the walk: its station stamps mark "visited" stations and its
  // `summit` stamp earns fast travel (it stays open on later visits). Walking up to a stop between
  // stamps only marks it for this page view.
  const visited = new Set<string>(ALWAYS_OPEN);
  let canTravel = false;
  try {
    localStorage.removeItem(LEGACY_VISITED_KEY);
    const stamped = parsePassport(localStorage.getItem(PASSPORT_KEY));
    for (const id of stamped) visited.add(id);
    canTravel = stamped.includes("summit");
  } catch {
    /* storage unavailable */
  }

  const ov = createOverlay(host, {
    className: "kw-map",
    labelledBy: "kw-map-title",
    onKey(e) {
      if (e.code === "KeyM" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        ov.close();
        return true;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const btns = [...list.querySelectorAll<HTMLButtonElement>("button")];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = btns[i < 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length];
        if (next) {
          e.preventDefault();
          next.focus();
        }
        return true;
      }
      return false;
    },
  });
  ov.panel.lang = lang;
  ov.panel.innerHTML = `
    <header class="kw-map-head">
      <h2 id="kw-map-title" class="kw-map-title">${esc(c.title)}</h2>
      <button type="button" class="kw-btn kw-map-close" aria-label="${esc(c.close)}"><kbd>M</kbd> <span>${esc(c.close)}</span></button>
    </header>
    <div class="kw-map-body">
      <div class="kw-map-sheet"><canvas class="kw-map-canvas" role="img"></canvas></div>
      <nav class="kw-map-side" aria-labelledby="kw-map-list-h">
        <h3 id="kw-map-list-h" class="kw-map-list-h">${esc(c.list)}</h3>
        <p class="kw-map-hint" id="kw-map-hint">${esc(canTravel ? c.hint : c.hintLocked)}</p>
        <ol class="kw-map-list" aria-describedby="kw-map-hint"></ol>
      </nav>
    </div>`;
  const canvas = ov.panel.querySelector("canvas") as HTMLCanvasElement;
  const list = ov.panel.querySelector(".kw-map-list") as HTMLOListElement;
  const closeBtn = ov.panel.querySelector(".kw-map-close") as HTMLButtonElement;
  closeBtn.addEventListener("click", () => ov.close());

  const bounds = mapBounds([...o.trail, ...o.stops], 26);
  let selected: string | null = null;
  let here: string | null = null;

  // ------------------------------------------------------------ list
  const renderList = () => {
    list.replaceChildren();
    o.stops.forEach((s, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kw-map-item";
      b.dataset.id = s.id;
      const seen = visited.has(s.id);
      const open = canTravel;
      if (!open) b.setAttribute("aria-disabled", "true");
      if (s.id === here) b.setAttribute("aria-current", "location");
      const state = s.id === here ? c.here : open ? c.travel : seen ? c.seen : c.locked;
      b.innerHTML = `<span class="kw-map-dot" style="--dye:${esc(s.color)}" aria-hidden="true"></span><span class="kw-map-n" aria-hidden="true">${i + 1}</span><span class="kw-map-name">${esc(open ? s.label : `${s.label}`)}</span><span class="kw-map-state">${esc(state)}</span>`;
      li.append(b);
      list.append(li);
    });
  };
  const travel = (id: string) => {
    if (!canTravel || id === here) return;
    ov.close();
    emit("world:teleport", { to: id });
  };
  list.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id;
    if (id) travel(id);
  });
  const onSel = (e: Event) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-id]")?.dataset.id ?? null;
    if (id !== selected) {
      selected = id;
      draw();
    }
  };
  list.addEventListener("focusin", onSel);
  list.addEventListener("pointerover", onSel);

  // ------------------------------------------------------------ terrain bake (once, on first open)
  let bake: HTMLCanvasElement | null = null;
  const bakeTerrain = () => {
    const N = 200;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    if (!ctx) return cv;
    const h = new Float32Array(N * N);
    const water = new Uint8Array(N * N);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = bounds.minX + ((i + 0.5) / N) * bounds.size;
        const z = bounds.minZ + ((j + 0.5) / N) * bounds.size;
        const v = o.heightAt(x, z);
        h[j * N + i] = v;
        water[j * N + i] = o.isWater?.(x, z) ? 1 : 0;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    // Paper-toned hypsometric bands: valley grass → terraces → ichu → stone → snow.
    const bands: Array<[number, number, number]> = [
      [196, 214, 170],
      [182, 205, 156],
      [214, 205, 160],
      [222, 200, 150],
      [201, 190, 170],
      [184, 176, 162],
      [236, 231, 220],
    ];
    const step = Math.max(2, (hi - lo) / 22);
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const v = h[k] ?? 0;
        const u = Math.min(0.999, Math.max(0, (v - lo) / (hi - lo || 1)));
        let [r, g, b] = bands[Math.floor(u * bands.length)] ?? [200, 200, 200];
        if (water[k]) [r, g, b] = [150, 196, 196];
        // Contours: ink where the band index changes against the left / upper neighbor.
        const band = Math.floor(v / step);
        const left = i > 0 ? Math.floor((h[k - 1] ?? v) / step) : band;
        const up = j > 0 ? Math.floor((h[k - N] ?? v) / step) : band;
        if (band !== left || band !== up) {
          const major = band % 5 === 0;
          const a = major ? 0.42 : 0.2;
          r = r * (1 - a) + 31 * a;
          g = g * (1 - a) + 26 * a;
          b = b * (1 - a) + 23 * a;
        }
        img.data[k * 4] = r;
        img.data[k * 4 + 1] = g;
        img.data[k * 4 + 2] = b;
        img.data[k * 4 + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  // ------------------------------------------------------------ drawing
  const P = { x: 0, y: 0 };
  const draw = () => {
    if (!ov.isOpen()) return;
    const cssW = canvas.clientWidth || 300;
    const cssH = canvas.clientHeight || 300;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cssW * dpr);
    const H = Math.round(cssH * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    bake ??= bakeTerrain();
    const side = Math.min(cssW, cssH);
    const ox = (cssW - side) / 2;
    const oy = (cssH - side) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bake, ox, oy, side, side);
    const ink = "#1f1a17";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 1, oy + 1, side - 2, side - 2);

    // Trail: ink under, stone over, dashed like a drawn route.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    o.trail.forEach((p, i) => {
      project(bounds, cssW, cssH, p.x, p.z, P);
      if (i) ctx.lineTo(P.x, P.y);
      else ctx.moveTo(P.x, P.y);
    });
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(3, side / 110);
    ctx.stroke();
    ctx.strokeStyle = "#efe6d6";
    ctx.lineWidth = Math.max(1.2, side / 260);
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Stations.
    const f = fonts();
    const showAll = side >= 440;
    const r0 = Math.max(5, side / 80);
    o.stops.forEach((s, i) => {
      project(bounds, cssW, cssH, s.x, s.z, P);
      const open = visited.has(s.id);
      const sel = s.id === selected;
      const r = sel ? r0 * 1.5 : r0;
      ctx.beginPath();
      ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
      ctx.fillStyle = open ? s.color : "#efe6d6";
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.fillStyle = open ? "#fbf4e6" : ink;
      ctx.font = `400 ${Math.round(r * 1.1)}px ${f.arcade}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), P.x, P.y + 0.5);
      if (showAll || sel) {
        ctx.font = `400 ${sel ? 12 : 10}px ${f.arcade}`;
        const text = s.label.toUpperCase();
        const tw = ctx.measureText(text).width;
        let lx = P.x + r + 5;
        if (lx + tw > cssW - 6) lx = P.x - r - 5 - tw;
        ctx.textAlign = "left";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(243, 234, 216, 0.92)";
        ctx.strokeText(text, lx, P.y);
        ctx.fillStyle = ink;
        ctx.fillText(text, lx, P.y);
      }
    });

    // Landmarks: small ink diamonds with a label (no number, no travel).
    const d0 = Math.max(4, side / 110);
    for (const m of LANDMARKS) {
      project(bounds, cssW, cssH, m.x, m.z, P);
      ctx.beginPath();
      ctx.moveTo(P.x, P.y - d0);
      ctx.lineTo(P.x + d0, P.y);
      ctx.lineTo(P.x, P.y + d0);
      ctx.lineTo(P.x - d0, P.y);
      ctx.closePath();
      ctx.fillStyle = "#c4383f";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ink;
      ctx.stroke();
      if (!showAll) continue;
      ctx.font = `400 9px ${f.arcade}`;
      const text = m.label[lang].toUpperCase();
      const tw = ctx.measureText(text).width;
      let lx = P.x - d0 - 4 - tw;
      if (lx < 6) lx = P.x + d0 + 4;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(243, 234, 216, 0.92)";
      ctx.strokeText(text, lx, P.y);
      ctx.fillStyle = ink;
      ctx.fillText(text, lx, P.y);
    }

    // Traveler: ochre arrow pointing along their heading.
    const pl = o.player();
    project(bounds, cssW, cssH, pl.x, pl.z, P);
    const dx = Math.sin(pl.yaw);
    const dy = Math.cos(pl.yaw);
    const s = Math.max(9, side / 45);
    ctx.beginPath();
    ctx.moveTo(P.x + dx * s, P.y + dy * s);
    ctx.lineTo(P.x - dx * s * 0.6 - dy * s * 0.65, P.y - dy * s * 0.6 + dx * s * 0.65);
    ctx.lineTo(P.x - dx * s * 0.25, P.y - dy * s * 0.25);
    ctx.lineTo(P.x - dx * s * 0.6 + dy * s * 0.65, P.y - dy * s * 0.6 - dx * s * 0.65);
    ctx.closePath();
    ctx.fillStyle = "#dda63c";
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ink;
    ctx.stroke();
  };

  // Click / tap a marker: select it, travel on a second tap (or right away if already selected).
  const onCanvas = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: MapStop | null = null;
    let bd = 22;
    for (const s of o.stops) {
      project(bounds, r.width, r.height, s.x, s.z, P);
      const d = Math.hypot(P.x - mx, P.y - my);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    if (selected === best.id) travel(best.id);
    else {
      selected = best.id;
      list.querySelector<HTMLElement>(`[data-id="${CSS.escape(best.id)}"]`)?.focus({ preventScroll: false });
      draw();
    }
  };
  canvas.addEventListener("click", onCanvas);
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);

  // ------------------------------------------------------------ visited
  const visit = (id: string) => {
    // Walking onto the summit plaza earns fast travel (even if the summit was "visited" before).
    if (id === "summit") unlock(true);
    if (visited.has(id) || !o.stops.some((s) => s.id === id)) return;
    visited.add(id);
    if (ov.isOpen()) {
      renderList();
      draw();
    }
  };
  const hintEl = ov.panel.querySelector(".kw-map-hint") as HTMLParagraphElement;
  const unlock = (announce: boolean) => {
    if (canTravel) return;
    canTravel = true;
    hintEl.textContent = c.hint;
    if (ov.isOpen()) {
      renderList();
      draw();
    }
    if (!announce) return;
    const toast = document.createElement("p");
    toast.className = "kw-map-toast";
    toast.setAttribute("role", "status");
    toast.textContent = c.unlocked;
    host.append(toast);
    setTimeout(() => toast.classList.add("is-out"), 5200);
    setTimeout(() => toast.remove(), 5800);
  };
  const offStamp = on("world:stamp", (d) => {
    if (d?.kind !== "station" && d?.kind !== "summit") return;
    const id = stampToStop(d.id);
    if (id) visit(id);
    if (d.kind === "summit") unlock(true);
  });
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PASSPORT_KEY) return;
    const ids = parsePassport(e.newValue);
    for (const id of ids) visit(id);
    if (ids.includes("summit")) unlock(false);
  };
  window.addEventListener("storage", onStorage);

  const openMap = () => {
    here = o.near();
    selected = here;
    renderList();
    const label = here ? o.stops.find((s) => s.id === here)?.label : null;
    canvas.setAttribute("aria-label", label ? `${c.canvas} ${c.near}: ${label}.` : c.canvas);
    const focus =
      list.querySelector<HTMLElement>('[aria-current="location"]') ??
      list.querySelector<HTMLElement>(".kw-map-item:not([aria-disabled])") ??
      closeBtn;
    ov.open(focus);
    requestAnimationFrame(draw);
  };

  return {
    panel: ov.panel,
    open: openMap,
    close: () => ov.close(),
    toggle() {
      if (ov.isOpen()) ov.close();
      else openMap();
    },
    isOpen: () => ov.isOpen(),
    visit,
    visited: () => visited,
    dispose() {
      offStamp();
      window.removeEventListener("storage", onStorage);
      canvas.removeEventListener("click", onCanvas);
      ro.disconnect();
      ov.dispose();
    },
  };
}
