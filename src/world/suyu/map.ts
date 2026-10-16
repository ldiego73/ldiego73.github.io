/**
 * Big paper map + fast travel of a suyu world (the jungle's ../selva/map.ts made generic; same `.kw-map*`
 * classes and ink-on-paper look). M / `world:map` / gamepad Y open it from ./index.ts.
 *
 * What is drawn: the ground baked once from the layout on first open (paper hypsometric tints, contour lines,
 * water from `waterDist` with an inked shore, plaza clearings), then vectors on top every draw: the road
 * (unless the world turns it off), the world's paved areas, extra roads and marks (SuyuMapDef.areas / roads /
 * marks), numbered
 * station markers and the traveler with their heading. The sheet is the road's bounding box fitted
 * ("contain") into the canvas, at most `maxAspect` wide (a long strip for road worlds, square for the hub).
 *
 * Visited and fast travel come only from the passport (./map-logic.ts):
 *   visited      `<world>:station:<id>` stamps
 *   fast travel  opens once SuyuMapDef.unlockStamp is stamped (null: always open); a station then emits
 *                `world:teleport {to: id}`.
 * Next to the canvas, a keyboard list of stations is the accessible version of the map.
 */
import "../map.css";
import { PASSPORT_KEY } from "../../lib/passport";
import type { Lang } from "../contract";
import { emit, on } from "../events";
import { fonts } from "../palette";
import { createOverlay, esc } from "../textmode";
import type { SuyuDef, SuyuLayout } from "./contract";
import { labelRows, MAP_DYES, parsePassport, projectRect, rectBounds, stampToStop } from "./map-logic";

const COPY = {
  es: {
    close: "Cerrar mapa",
    list: "Lugares",
    hint: "Elige un lugar para viajar allí.",
    travel: "Viajar",
    seen: "Visitado",
    locked: "Por descubrir",
    here: "Estás aquí",
    near: "Estás cerca de",
  },
  en: {
    close: "Close map",
    list: "Places",
    hint: "Pick a place to travel there.",
    travel: "Travel",
    seen: "Visited",
    locked: "Not yet found",
    here: "You are here",
    near: "You are near",
  },
} as const;

export interface SuyuMap {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Mark a station as visited (its stamp just arrived). */
  visit(id: string): void;
  visited(): ReadonlySet<string>;
  /** Dialog panel (gamepad focus stepping). */
  panel: HTMLElement;
  dispose(): void;
}

const INK = "#1f1a17";
const PAPER = "#efe6d6";
const HALO = "rgba(243, 234, 216, 0.92)";
const ROAD = "#dcc08a";

export function createSuyuMap(
  host: HTMLElement,
  lang: Lang,
  def: Pick<SuyuDef, "world" | "stations" | "map">,
  o: {
    layout: SuyuLayout;
    player(): { x: number; z: number; yaw: number };
    /** Station id nearest the traveler (or null). */
    near(): string | null;
  },
): SuyuMap {
  const c = COPY[lang];
  const M = def.map;
  const L = o.layout;
  const ids = new Set(def.stations.map((s) => s.id));
  const visited = new Set<string>();
  let canTravel = M.unlockStamp === null;
  try {
    const p = parsePassport(localStorage.getItem(PASSPORT_KEY), def.world, ids, M.unlockStamp);
    for (const id of p.visited) visited.add(id);
    canTravel = p.canTravel;
  } catch {
    /* storage unavailable */
  }
  const dye = (id: string) =>
    M.dye?.(id) ??
    MAP_DYES[
      Math.max(
        0,
        def.stations.findIndex((s) => s.id === id),
      ) % MAP_DYES.length
    ] ??
    INK;

  const stops = def.stations.map((s) => {
    const pos = L.stationPose(s.id).position;
    return {
      id: s.id,
      side: s.side,
      label: s.label[lang],
      short: s.label[lang].split(" · ")[0] ?? "",
      x: pos.x,
      z: pos.z,
    };
  });
  const road: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= 240; i++) {
    const p = L.trail.pointAt(i / 240);
    road.push({ x: p.x, z: p.z });
  }
  const extraRoads = M.roads?.(L) ?? [];
  const marks = M.marks?.(L) ?? [];
  const areas = M.areas?.(L) ?? [];
  const bounds = rectBounds(
    [...road, ...stops, ...extraRoads.flat(), ...marks, ...areas.flat()],
    M.pad ?? 26,
    M.maxAspect ?? 2.2,
  );

  const ov = createOverlay(host, {
    className: `kw-map kw-map-suyu kw-map-${def.world}`,
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
      <h2 id="kw-map-title" class="kw-map-title">${esc(M.title[lang])}</h2>
      <button type="button" class="kw-btn kw-map-close" aria-label="${esc(c.close)}"><kbd>M</kbd> <span>${esc(c.close)}</span></button>
    </header>
    <div class="kw-map-body">
      <div class="kw-map-sheet"><canvas class="kw-map-canvas" role="img"></canvas></div>
      <nav class="kw-map-side" aria-labelledby="kw-map-list-h">
        <h3 id="kw-map-list-h" class="kw-map-list-h">${esc(c.list)}</h3>
        <p class="kw-map-hint" id="kw-map-hint">${esc(canTravel ? c.hint : M.hintLocked[lang])}</p>
        <ol class="kw-map-list" aria-describedby="kw-map-hint"></ol>
        ${M.legend ? `<p class="kw-map-hint">${esc(M.legend[lang])}</p>` : ""}
      </nav>
    </div>`;
  const canvas = ov.panel.querySelector("canvas") as HTMLCanvasElement;
  const list = ov.panel.querySelector(".kw-map-list") as HTMLOListElement;
  const hintEl = ov.panel.querySelector("#kw-map-hint") as HTMLParagraphElement;
  const closeBtn = ov.panel.querySelector(".kw-map-close") as HTMLButtonElement;
  closeBtn.addEventListener("click", () => ov.close());

  let selected: string | null = null;
  let here: string | null = null;

  // ------------------------------------------------------------ list
  const renderList = () => {
    list.replaceChildren();
    stops.forEach((s, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kw-map-item";
      b.dataset.id = s.id;
      if (!canTravel) b.setAttribute("aria-disabled", "true");
      if (s.id === here) b.setAttribute("aria-current", "location");
      const state = s.id === here ? c.here : canTravel ? c.travel : visited.has(s.id) ? c.seen : c.locked;
      b.innerHTML = `<span class="kw-map-dot" style="--dye:${esc(dye(s.id))}" aria-hidden="true"></span><span class="kw-map-n" aria-hidden="true">${i + 1}</span><span class="kw-map-name">${esc(s.label)}</span><span class="kw-map-state">${esc(state)}</span>`;
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

  // ------------------------------------------------------------ ground bake (once, on first open)
  let bake: HTMLCanvasElement | null = null;
  const bakeGround = () => {
    const NX = 440;
    const NZ = Math.max(8, Math.round((NX * bounds.h) / bounds.w));
    const cv = document.createElement("canvas");
    cv.width = NX;
    cv.height = NZ;
    const ctx = cv.getContext("2d");
    if (!ctx) return cv;
    const px = bounds.w / NX;
    const h = new Float32Array(NX * NZ);
    const wd = new Float32Array(NX * NZ);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = bounds.minX + (i + 0.5) * px;
        const z = bounds.minZ + (j + 0.5) * px;
        const k = j * NX + i;
        const v = L.heightAt(x, z);
        h[k] = v;
        wd[k] = L.waterDist(x, z);
        if (wd[k] > 0) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    // Paper-toned land, low → high: pale straw to warm ochre.
    const bands: Array<[number, number, number]> = [
      [226, 214, 176],
      [216, 202, 158],
      [204, 188, 142],
      [190, 172, 128],
      [176, 156, 116],
    ];
    const clearing: [number, number, number] = [236, 226, 204];
    const step = Math.max(0.3, (hi - lo) / 14);
    const img = ctx.createImageData(NX, NZ);
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const v = h[k] ?? 0;
        const d = wd[k] ?? 1;
        const x = bounds.minX + (i + 0.5) * px;
        const z = bounds.minZ + (j + 0.5) * px;
        let r: number;
        let g: number;
        let b: number;
        if (d < 0) {
          const deep = Math.min(1, -d / 12);
          r = 150 - 60 * deep;
          g = 184 - 40 * deep;
          b = 196 - 10 * deep;
        } else {
          const u = Math.min(0.999, Math.max(0, (v - lo) / (hi - lo || 1)));
          [r, g, b] = bands[Math.floor(u * bands.length)] ?? [210, 196, 150];
          if (L.plazas.some((pl) => Math.hypot(x - pl.x, z - pl.z) < pl.r + 1)) [r, g, b] = clearing;
          const band = Math.floor(v / step);
          const left = i > 0 && (wd[k - 1] ?? 1) > 0 ? Math.floor((h[k - 1] ?? v) / step) : band;
          const up = j > 0 && (wd[k - NX] ?? 1) > 0 ? Math.floor((h[k - NX] ?? v) / step) : band;
          if (band !== left || band !== up) {
            const a = band % 4 === 0 ? 0.32 : 0.16;
            r = r * (1 - a) + 31 * a;
            g = g * (1 - a) + 26 * a;
            b = b * (1 - a) + 23 * a;
          }
          if (d < px * 1.1) {
            r = r * 0.45 + 31 * 0.55;
            g = g * 0.45 + 26 * 0.55;
            b = b * 0.45 + 23 * 0.55;
          }
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
  const line = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; z: number }>, W: number, H: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      projectRect(bounds, W, H, p.x, p.z, P);
      if (i) ctx.lineTo(P.x, P.y);
      else ctx.moveTo(P.x, P.y);
    });
  };
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
    bake ??= bakeGround();
    const s = Math.min(cssW / bounds.w, cssH / bounds.h);
    const mw = bounds.w * s;
    const mh = bounds.h * s;
    const ox = (cssW - mw) / 2;
    const oy = (cssH - mh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bake, ox, oy, mw, mh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 1, oy + 1, mw - 2, mh - 2);
    const side = Math.min(mw, mh * 1.6);

    // Paved areas: packed earth with an inked edge.
    for (const poly of areas) {
      line(ctx, poly, cssW, cssH);
      ctx.closePath();
      ctx.fillStyle = ROAD;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // Roads: ink under, packed earth over.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const wRoad = Math.max(3.2, side / 140);
    for (const seg of [...(M.trail === false ? [] : [road]), ...extraRoads]) {
      line(ctx, seg, cssW, cssH);
      ctx.strokeStyle = INK;
      ctx.lineWidth = wRoad + 2;
      ctx.stroke();
      ctx.strokeStyle = ROAD;
      ctx.lineWidth = wRoad - 0.6;
      ctx.stroke();
    }

    const f = fonts();
    // Marks: small inked diamonds with an optional caption (punku signs, landmarks).
    for (const m of marks) {
      projectRect(bounds, cssW, cssH, m.x, m.z, P);
      const r = Math.max(5, side / 90);
      ctx.beginPath();
      ctx.moveTo(P.x, P.y - r);
      ctx.lineTo(P.x + r, P.y);
      ctx.lineTo(P.x, P.y + r);
      ctx.lineTo(P.x - r, P.y);
      ctx.closePath();
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (m.label && cssW >= 440) {
        ctx.font = `400 9px ${f.arcade}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 3;
        ctx.strokeStyle = HALO;
        ctx.strokeText(m.label, P.x, P.y + r + 3);
        ctx.fillStyle = INK;
        ctx.fillText(m.label, P.x, P.y + r + 3);
      }
    }

    // Stations: numbered discs, coloured once visited; labels above (side −1) or below (side 1).
    const showAll = cssW >= 440;
    const r0 = Math.max(5, side / 80);
    const fontPx = 10;
    ctx.font = `400 ${fontPx}px ${f.arcade}`;
    const pins = stops.map((st) => {
      projectRect(bounds, cssW, cssH, st.x, st.z, P);
      const text = st.short.toUpperCase();
      const tw = ctx.measureText(text).width;
      const x0 = Math.min(cssW - 6 - tw, Math.max(6, P.x - tw / 2));
      return { st, x: P.x, y: P.y, text, x0, x1: x0 + tw, side: st.side };
    });
    const rows = labelRows(pins);
    pins.forEach((m, i) => {
      const open = visited.has(m.st.id);
      const sel = m.st.id === selected;
      const r = sel ? r0 * 1.5 : r0;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fillStyle = open ? dye(m.st.id) : PAPER;
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = open ? "#fbf4e6" : INK;
      ctx.font = `400 ${Math.round(r * 1.1)}px ${f.arcade}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), m.x, m.y + 0.5);
      if (!showAll && !sel) return;
      ctx.font = `400 ${sel ? 12 : fontPx}px ${f.arcade}`;
      ctx.textAlign = "left";
      const lift = r0 + 9 + (rows[i] ?? 0) * (fontPx + 5);
      const y = m.side < 0 ? m.y - lift : m.y + lift;
      ctx.lineWidth = 3;
      ctx.strokeStyle = HALO;
      ctx.strokeText(m.text, m.x0, y);
      ctx.fillStyle = INK;
      ctx.fillText(m.text, m.x0, y);
    });

    // Traveler: ochre arrow pointing along their heading.
    const pl = o.player();
    projectRect(bounds, cssW, cssH, pl.x, pl.z, P);
    const dx = Math.sin(pl.yaw);
    const dy = Math.cos(pl.yaw);
    const a = Math.max(9, side / 45);
    ctx.beginPath();
    ctx.moveTo(P.x + dx * a, P.y + dy * a);
    ctx.lineTo(P.x - dx * a * 0.6 - dy * a * 0.65, P.y - dy * a * 0.6 + dx * a * 0.65);
    ctx.lineTo(P.x - dx * a * 0.25, P.y - dy * a * 0.25);
    ctx.lineTo(P.x - dx * a * 0.6 + dy * a * 0.65, P.y - dy * a * 0.6 - dx * a * 0.65);
    ctx.closePath();
    ctx.fillStyle = "#dda63c";
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  };

  // Click / tap a marker: select it, travel on a second tap (or right away if already selected).
  const onCanvas = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: string | null = null;
    let bd = 22;
    for (const s of stops) {
      projectRect(bounds, r.width, r.height, s.x, s.z, P);
      const d = Math.hypot(P.x - mx, P.y - my);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    if (!best) return;
    if (selected === best) travel(best);
    else {
      selected = best;
      list.querySelector<HTMLElement>(`[data-id="${CSS.escape(best)}"]`)?.focus({ preventScroll: false });
      draw();
    }
  };
  canvas.addEventListener("click", onCanvas);
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);

  // ------------------------------------------------------------ visited + unlock
  const refresh = () => {
    if (!ov.isOpen()) return;
    renderList();
    draw();
  };
  const visit = (id: string) => {
    if (visited.has(id) || !ids.has(id)) return;
    visited.add(id);
    refresh();
  };
  const unlock = (announce: boolean) => {
    if (canTravel) return;
    canTravel = true;
    hintEl.textContent = c.hint;
    refresh();
    if (!announce) return;
    const toast = document.createElement("p");
    toast.className = "kw-map-toast";
    toast.setAttribute("role", "status");
    toast.textContent = M.unlocked[lang];
    host.append(toast);
    setTimeout(() => toast.classList.add("is-out"), 5200);
    setTimeout(() => toast.remove(), 5800);
  };
  const offStamp = on("world:stamp", (d) => {
    if (!d?.id) return;
    const id = stampToStop(def.world, ids, d.id);
    if (id) visit(id);
    if (M.unlockStamp && d.id === M.unlockStamp) unlock(true);
  });
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PASSPORT_KEY) return;
    const p = parsePassport(e.newValue, def.world, ids, M.unlockStamp);
    for (const id of p.visited) visit(id);
    if (p.canTravel) unlock(false);
  };
  window.addEventListener("storage", onStorage);

  const openMap = () => {
    here = o.near();
    selected = here;
    renderList();
    const label = here ? stops.find((s) => s.id === here)?.label : null;
    const desc = M.canvas[lang];
    canvas.setAttribute("aria-label", label ? `${desc} ${c.near}: ${label}.` : desc);
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
