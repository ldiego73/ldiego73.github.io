/**
 * Pure rules of the «Viajar» panel (travel-panel.ts): which worlds it lists, where each sits on the small map of
 * the Tawantinsuyu, which ones the traveler has visited, and how the arrow keys move between them. DOM-free and
 * Three-free so it is unit tested.
 *
 * - Places come from the hub's road table (cusco/plan.ts `GATES`): every gate's world sits on a 3 × 3 grid in
 *   the direction its street leaves Haukaypata (x east, z south, so north is up on the map), with Qusqu in the
 *   centre. That puts the Chinchaysuyu north-west, the Antisuyu north-east, the Collasuyu south-east, the
 *   Kuntisuyu south-west and the Qhapaq Ñan mountain south, as the punkus stand in the hub.
 * - Names are the gate signs (and the hub's own name); the one-line descriptions follow each page's title and the
 *   gate's `holds` copy, so nothing new is claimed.
 * - "Visited" has one source: the passport. A world counts as visited once any of its stamps is collected (the
 *   Wasi's stamps count for the mountain page, where the house stands).
 */

import { CATALOG, type PassportState, worldOf } from "../lib/passport";
import type { L, Lang } from "./contract";
import { GATES } from "./cusco/plan";
import type { WorldId } from "./events";

/** Worlds with their own page: the ones the panel can travel to (the Wasi lives inside the mountain page). */
export type TripWorld = Exclude<WorldId, "wasi">;

export interface TripPlace {
  world: TripWorld;
  name: L;
  line: L;
  /** Grid cell on the map: col 0 west → 2 east, row 0 north → 2 south. */
  col: 0 | 1 | 2;
  row: 0 | 1 | 2;
  /** Dye of the suyu's cord (the hub's khipu), for the road and the card's edge. */
  dye: string;
}

/** One-line descriptions (page titles; the mountain's and the jungle's from their gate's `holds`). */
const LINES: Record<TripWorld, L> = {
  cusco: { es: "El centro del Tawantinsuyu", en: "The centre of the Tawantinsuyu" },
  qhapaq: { es: "La subida de la montaña y la Wasi", en: "The mountain climb and the Wasi" },
  selva: { es: "El camino de la selva junto a un gran río", en: "The jungle road beside a great river" },
  costa: { es: "El camino de la costa", en: "The coast road" },
  titicaca: { es: "El camino del lago Titicaca", en: "The Lake Titicaca road" },
  colca: { es: "El cañón del Colca y Nasca", en: "The Colca canyon and Nazca" },
};

const cell = (v: number): 0 | 1 | 2 => (v > 0.3 ? 2 : v < -0.3 ? 0 : 1);

/** The hub in the centre, then every open gate's world, in reading order (top row first, west to east). */
export const TRIP_PLACES: readonly TripPlace[] = [
  {
    world: "cusco" as const,
    name: { es: "Qusqu", en: "Qusqu" },
    line: LINES.cusco,
    col: 1 as const,
    row: 1 as const,
    dye: "#dda63c",
  },
  ...GATES.filter((g) => g.available && g.world !== "cusco" && g.world !== "wasi").map((g) => ({
    world: g.world as TripWorld,
    name: g.name,
    line: LINES[g.world as TripWorld],
    col: cell(g.dir[0]),
    row: cell(g.dir[1]),
    dye: g.dye,
  })),
].sort((a, b) => a.row - b.row || a.col - b.col);

/** Worlds with at least one collected passport stamp. */
export function visitedWorlds(state: PassportState): Set<TripWorld> {
  const out = new Set<TripWorld>();
  for (const s of CATALOG) {
    const t = state.stamps[s.id];
    if (typeof t !== "number" || !(t > 0)) continue;
    const w = worldOf(s);
    out.add(w === "wasi" ? "qhapaq" : w);
  }
  return out;
}

export type TripDir = "up" | "down" | "left" | "right";

/**
 * The place an arrow key moves to from `from`: the nearest one in that direction, sideways offset weighing
 * double (so ↑ from the mountain lands on Qusqu, not on a corner). Ties keep reading order. Null at the edge.
 */
export function tripNeighbor(places: readonly TripPlace[], from: TripWorld, dir: TripDir): TripWorld | null {
  const a = places.find((p) => p.world === from);
  if (!a) return places[0]?.world ?? null;
  let best: TripPlace | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const p of places) {
    if (p === a) continue;
    const dx = p.col - a.col;
    const dy = p.row - a.row;
    const [along, side] = dir === "left" ? [-dx, dy] : dir === "right" ? [dx, dy] : dir === "up" ? [-dy, dx] : [dy, dx];
    if (along <= 0) continue;
    const score = along + 2 * Math.abs(side);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best?.world ?? null;
}

/** Arrow key → direction (null for any other key). */
export function arrowDir(key: string): TripDir | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

export const TRIP_COPY = {
  es: {
    title: "Viajar por el Tawantinsuyu",
    lede: "Elige un mundo para ir directo allí. Los que ya visitaste (con algún sello en tu pasaporte) llevan ✓.",
    here: "Estás aquí",
    visited: "Visitado",
    close: "Cerrar",
    hint: "Flechas: moverte · Enter: viajar · Esc: cerrar",
    north: "N",
  },
  en: {
    title: "Travel the Tawantinsuyu",
    lede: "Pick a world to go straight there. The ones you've visited (any stamp in your passport) carry a ✓.",
    here: "You are here",
    visited: "Visited",
    close: "Close",
    hint: "Arrows: move · Enter: travel · Esc: close",
    north: "N",
  },
} as const satisfies Record<Lang, Record<string, string>>;

/** How every world's text mode describes the panel (one place, so the six text modes stay truthful together). */
export const TRIP_TEXT: Record<Lang, string> = {
  es: "Desde cualquier mundo, el botón «Viajar» de arriba (tecla V, o el gatillo LT del mando) abre un pequeño mapa del Tawantinsuyu con todos los mundos: Qusqu en el centro y cada camino en su rumbo. Elige uno y, tras confirmar que quieres salir, viajas directo allí; los que ya visitaste (con algún sello en el pasaporte) llevan ✓ y el mundo donde estás aparece como «Estás aquí».",
  en: "From any world, the “Travel” button at the top (the V key, or the gamepad's LT trigger) opens a small map of the Tawantinsuyu with every world: Qusqu in the centre and each road in its direction. Pick one and, once you confirm you want to leave, you travel straight there; the ones you've visited (any stamp in your passport) carry a ✓ and the world you are in shows as “You are here”.",
};
