/**
 * Big paper map + fast travel for the Antisuyu jungle (the counterpart of the mountain's ../map.ts, same
 * `.kw-map*` classes and ink-on-paper look). M / `world:map` / gamepad Y open it from ./index.ts.
 *
 * What is drawn: the forest baked once from the layout on first open (green hypsometric tints, contour lines,
 * crown speckle, plaza clearings, the river in blue-brown at its real width with an inked bank), then vectors
 * on top every draw: the road (solid), the canopy walkway (CANOPY_T, dashed: hanging bridges), the canoe route
 * between the two docks (dotted), the docks, numbered station markers and the traveler with their heading.
 *
 * The jungle is a long west → east strip, not a mountain: instead of the mountain's square map it uses a wide
 * rectangle around the road and river that is fitted ("contain") into the canvas, and station labels go above
 * or below the road on the station's own side, stacked in rows so neighbors never overlap.
 *
 * Visited and fast travel come only from the passport (stamps are the single record of the walk):
 *   visited      `selva:station:<id>` stamps (plus "puerto", where every visit starts)
 *   fast travel  opens once `selva:station:collpa` is stamped, i.e. the traveler reached the end of the road
 *                once (mirrors the mountain's summit rule); then a station emits `world:teleport {to: id}`.
 * Next to the canvas, a keyboard list of stations is the accessible version of the map.
 */
import "../map.css";
import { PASSPORT_KEY } from "../../lib/passport";
import type { Lang } from "../contract";
import { emit, on } from "../events";
import { selvaStationDye } from "../journey-card";
import { fonts } from "../palette";
import { createOverlay, esc } from "../textmode";
import { CANOPY_T, SELVA_STATIONS, type SelvaLayout } from "./contract";

/** The stamp that earns fast travel: the collpa at the east end of the road. */
export const UNLOCK_STAMP = "selva:station:collpa";
/** Stations that count as visited from the start (the arrival). */
export const SELVA_ALWAYS_OPEN = new Set(["puerto"]);
const STATION_IDS = new Set(SELVA_STATIONS.map((s) => s.id));

/** Stamp id → jungle station id ("selva:station:maloca" → "maloca"), else null. */
export function selvaStampToStop(id: string): string | null {
  if (!id.startsWith("selva:station:")) return null;
  const s = id.slice(14);
  return STATION_IDS.has(s) ? s : null;
}

/** Visited station ids and the fast-travel unlock from the passport's JSON. Tolerates garbage. */
export function parseSelvaPassport(raw: string | null | undefined): { visited: string[]; canTravel: boolean } {
  const none = { visited: [], canTravel: false };
  if (!raw) return none;
  try {
    const v = JSON.parse(raw) as { stamps?: unknown };
    if (!v || typeof v !== "object" || !v.stamps || typeof v.stamps !== "object") return none;
    const keys = Object.keys(v.stamps as Record<string, unknown>);
    const visited: string[] = [];
    for (const k of keys) {
      const s = selvaStampToStop(k);
      if (s) visited.push(s);
    }
    return { visited, canTravel: keys.includes(UNLOCK_STAMP) };
  } catch {
    return none;
  }
}

export interface RectBounds {
  minX: number;
  minZ: number;
  w: number;
  h: number;
}

/** Bounds of the points, padded, then grown on z (around its centre) to at least `w / maxAspect` tall. */
export function rectBounds(pts: ReadonlyArray<{ x: number; z: number }>, pad: number, maxAspect: number): RectBounds {
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
  if (!Number.isFinite(minX)) return { minX: -pad, minZ: -pad, w: pad * 2, h: pad * 2 };
  const w = maxX - minX + pad * 2;
  const h = Math.max(maxZ - minZ + pad * 2, w / maxAspect);
  return { minX: minX - pad, minZ: (minZ + maxZ) / 2 - h / 2, w, h };
}

/** World (x, z) → canvas pixels for the rectangle fitted ("contain") and centered in a W×H box (z down). */
export function projectRect(
  b: RectBounds,
  W: number,
  H: number,
  x: number,
  z: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const s = Math.min(W / b.w, H / b.h);
  out.x = (W - b.w * s) / 2 + (x - b.minX) * s;
  out.y = (H - b.h * s) / 2 + (z - b.minZ) * s;
  return out;
}

/**
 * Label rows: labels on the same side of the road share row 0 unless they would overlap horizontally, then
 * move out one row (away from the road). Input order is kept; returns a row index per label.
 */
export function labelRows(items: ReadonlyArray<{ x0: number; x1: number; side: -1 | 1 }>, gap = 6): number[] {
  const rows = new Map<number, number[]>(); // side → right edge per row
  const order = items.map((_, i) => i).sort((a, b) => (items[a]?.x0 ?? 0) - (items[b]?.x0 ?? 0));
  const out = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const it = items[i];
    if (!it) continue;
    const ends = rows.get(it.side) ?? [];
    let r = ends.findIndex((end) => it.x0 >= end + gap);
    if (r < 0) r = ends.length;
    ends[r] = it.x1;
    rows.set(it.side, ends);
    out[i] = r;
  }
  return out;
}

const COPY = {
  es: {
    title: "Mapa del Antisuyu",
    close: "Cerrar mapa",
    list: "Estaciones",
    hint: "Elige una estación para viajar por el camino.",
    hintLocked: "Llega a la collpa de guacamayos, al final del camino, para viajar entre estaciones.",
    legend: "Punteado: ruta en canoa. Discontinuo: puentes del dosel.",
    travel: "Viajar",
    seen: "Visitada",
    locked: "Por descubrir",
    unlocked: "Ya conoces el camino del Antisuyu: abre el mapa (M) y viaja entre estaciones.",
    here: "Estás aquí",
    canvas:
      "Mapa en papel del camino del Antisuyu: el río arriba, el punku al oeste (izquierda) y la collpa al este (derecha).",
    near: "Estás cerca de",
  },
  en: {
    title: "Antisuyu map",
    close: "Close map",
    list: "Stations",
    hint: "Pick a station to travel there along the road.",
    hintLocked: "Reach the macaw clay lick at the end of the road to travel between stations.",
    legend: "Dotted: canoe route. Dashed: canopy walkway.",
    travel: "Travel",
    seen: "Visited",
    locked: "Not yet found",
    unlocked: "You know the Antisuyu road now: open the map (M) and travel between stations.",
    here: "You are here",
    canvas: "Paper map of the Antisuyu road: the river at the top, the punku west (left), the clay lick east (right).",
    near: "You are near",
  },
} as const;

export interface SelvaMap {
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
const CANOE = "#1d2f6e";

export function createSelvaMap(
  host: HTMLElement,
  lang: Lang,
  o: {
    layout: SelvaLayout;
    player(): { x: number; z: number; yaw: number };
    /** Station id nearest the traveler (or null). */
    near(): string | null;
  },
): SelvaMap {
  const c = COPY[lang];
  const L = o.layout;
  const visited = new Set<string>(SELVA_ALWAYS_OPEN);
  let canTravel = false;
  try {
    const p = parseSelvaPassport(localStorage.getItem(PASSPORT_KEY));
    for (const id of p.visited) visited.add(id);
    canTravel = p.canTravel;
  } catch {
    /* storage unavailable */
  }

  const stops = SELVA_STATIONS.map((s) => {
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
  const road: Array<{ x: number; z: number; t: number }> = [];
  for (let i = 0; i <= 240; i++) {
    const p = L.trail.pointAt(i / 240);
    road.push({ x: p.x, z: p.z, t: i / 240 });
  }
  // The river and canopy matter only where the road is: crop the river's run-out past both trailheads.
  const roadX0 = Math.min(...road.map((p) => p.x));
  const roadX1 = Math.max(...road.map((p) => p.x));
  const river = L.river.pts.map(([x, z]) => ({ x, z }));
  const bounds = rectBounds([...road, ...stops, ...river.filter((p) => p.x >= roadX0 && p.x <= roadX1)], 26, 2.2);

  const ov = createOverlay(host, {
    className: "kw-map kw-map-selva",
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
        <p class="kw-map-hint">${esc(c.legend)}</p>
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
      b.innerHTML = `<span class="kw-map-dot" style="--dye:${esc(selvaStationDye(s.id))}" aria-hidden="true"></span><span class="kw-map-n" aria-hidden="true">${i + 1}</span><span class="kw-map-name">${esc(s.label)}</span><span class="kw-map-state">${esc(state)}</span>`;
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
    const NX = 440;
    const NZ = Math.round((NX * bounds.h) / bounds.w);
    const cv = document.createElement("canvas");
    cv.width = NX;
    cv.height = NZ;
    const ctx = cv.getContext("2d");
    if (!ctx) return cv;
    const px = bounds.w / NX; // world units per baked pixel
    const h = new Float32Array(NX * NZ);
    const rd = new Float32Array(NX * NZ);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = bounds.minX + (i + 0.5) * px;
        const z = bounds.minZ + (j + 0.5) * px;
        const k = j * NX + i;
        const v = L.heightAt(x, z);
        h[k] = v;
        rd[k] = L.riverDist(x, z);
        if (rd[k] > 0) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    // Paper-toned forest greens, low bottomland → higher terra firme.
    const bands: Array<[number, number, number]> = [
      [182, 204, 150],
      [166, 194, 138],
      [150, 184, 126],
      [136, 174, 116],
      [122, 162, 106],
    ];
    const clearing: [number, number, number] = [222, 206, 162];
    const step = Math.max(0.3, (hi - lo) / 12);
    const img = ctx.createImageData(NX, NZ);
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const v = h[k] ?? 0;
        const d = rd[k] ?? 1;
        const x = bounds.minX + (i + 0.5) * px;
        const z = bounds.minZ + (j + 0.5) * px;
        let r: number;
        let g: number;
        let b: number;
        if (d < 0) {
          // Muddy blue-brown water: silty brown at the banks, bluer toward the middle of the channel.
          const deep = Math.min(1, -d / 7);
          r = 166 - 58 * deep;
          g = 146 - 14 * deep;
          b = 108 + 46 * deep;
        } else {
          const u = Math.min(0.999, Math.max(0, (v - lo) / (hi - lo || 1)));
          [r, g, b] = bands[Math.floor(u * bands.length)] ?? [160, 190, 130];
          if (L.plazas.some((pl) => Math.hypot(x - pl.x, z - pl.z) < pl.r + 1)) [r, g, b] = clearing;
          // Crown speckle: a fixed hash darkens a few pixels so the forest reads as canopy, not grass.
          const hsh = Math.imul(i, 73856093) ^ Math.imul(j, 19349663);
          if ((hsh >>> 0) % 29 < 3) {
            r *= 0.84;
            g *= 0.88;
            b *= 0.84;
          }
          // Contours: ink where the band index changes against the left / upper dry neighbor.
          const band = Math.floor(v / step);
          const left = i > 0 && (rd[k - 1] ?? 1) > 0 ? Math.floor((h[k - 1] ?? v) / step) : band;
          const up = j > 0 && (rd[k - NX] ?? 1) > 0 ? Math.floor((h[k - NX] ?? v) / step) : band;
          if (band !== left || band !== up) {
            const a = band % 4 === 0 ? 0.32 : 0.16;
            r = r * (1 - a) + 31 * a;
            g = g * (1 - a) + 26 * a;
            b = b * (1 - a) + 23 * a;
          }
          // Inked bank line along the water's edge.
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
    bake ??= bakeTerrain();
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

    // Road: ink under, packed earth over; the canopy stretch is dashed (hanging bridges between ceibas).
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ground = [road.filter((p) => p.t <= CANOPY_T[0] + 0.002), road.filter((p) => p.t >= CANOPY_T[1] - 0.002)];
    const canopy = road.filter((p) => p.t >= CANOPY_T[0] && p.t <= CANOPY_T[1]);
    const wRoad = Math.max(3.2, side / 140);
    for (const seg of ground) {
      line(ctx, seg, cssW, cssH);
      ctx.strokeStyle = INK;
      ctx.lineWidth = wRoad + 2;
      ctx.stroke();
      ctx.strokeStyle = ROAD;
      ctx.lineWidth = wRoad - 0.6;
      ctx.stroke();
    }
    line(ctx, canopy, cssW, cssH);
    ctx.lineCap = "butt";
    ctx.strokeStyle = INK;
    ctx.lineWidth = wRoad + 1;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = Math.max(1, wRoad - 2.4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "round";

    // Canoe route: dotted on the water between the two docks.
    line(
      ctx,
      L.canoe.path.map(([x, z]) => ({ x, z })),
      cssW,
      cssH,
    );
    ctx.strokeStyle = CANOE;
    ctx.lineWidth = Math.max(2, side / 300);
    ctx.setLineDash([0.1, Math.max(4, side / 130)]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Docks: a small plank at each end of the canoe route, pointing at its station.
    for (const [dock, id] of [
      [L.canoe.from, "embarcadero"],
      [L.canoe.to, "palafitos"],
    ] as const) {
      const st = stops.find((x) => x.id === id);
      if (!st) continue;
      projectRect(bounds, cssW, cssH, dock.x, dock.z, P);
      const dx = P.x;
      const dy = P.y;
      projectRect(bounds, cssW, cssH, st.x, st.z, P);
      const a = Math.atan2(P.y - dy, P.x - dx);
      const len = Math.max(8, side / 70);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(a);
      ctx.fillStyle = "#a8825f";
      ctx.fillRect(-len * 0.2, -len * 0.18, len, len * 0.36);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.strokeRect(-len * 0.2, -len * 0.18, len, len * 0.36);
      ctx.restore();
    }

    // Stations: numbered discs, coloured once visited; labels above (river side) or below the road.
    const f = fonts();
    const showAll = cssW >= 440;
    const r0 = Math.max(5, side / 80);
    const fontPx = 10;
    ctx.font = `400 ${fontPx}px ${f.arcade}`;
    const marks = stops.map((st) => {
      projectRect(bounds, cssW, cssH, st.x, st.z, P);
      const text = st.short.toUpperCase();
      const tw = ctx.measureText(text).width;
      const x0 = Math.min(cssW - 6 - tw, Math.max(6, P.x - tw / 2));
      return { st, x: P.x, y: P.y, text, x0, x1: x0 + tw, side: st.side };
    });
    const rows = labelRows(marks);
    marks.forEach((m, i) => {
      const open = visited.has(m.st.id);
      const sel = m.st.id === selected;
      const r = sel ? r0 * 1.5 : r0;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fillStyle = open ? selvaStationDye(m.st.id) : PAPER;
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
      // side -1 (river side) is up on the map (−z): label above; side 1 below.
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
    if (visited.has(id) || !STATION_IDS.has(id)) return;
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
    toast.textContent = c.unlocked;
    host.append(toast);
    setTimeout(() => toast.classList.add("is-out"), 5200);
    setTimeout(() => toast.remove(), 5800);
  };
  const offStamp = on("world:stamp", (d) => {
    const id = d?.id ? selvaStampToStop(d.id) : null;
    if (!id) return;
    visit(id);
    if (d.id === UNLOCK_STAMP) unlock(true);
  });
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PASSPORT_KEY) return;
    const p = parseSelvaPassport(e.newValue);
    for (const id of p.visited) visit(id);
    if (p.canTravel) unlock(false);
  };
  window.addEventListener("storage", onStorage);

  const openMap = () => {
    here = o.near();
    selected = here;
    renderList();
    const label = here ? stops.find((s) => s.id === here)?.label : null;
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
