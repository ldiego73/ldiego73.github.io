/**
 * Pure rules of the Uros floating islands (../uros.ts): the boardwalk as oriented deck boxes (its first span a
 * ramp down from the landing to the water), which island the traveler stands on, and each island's panel copy
 * from src/data/career.ts SKILLS (only what is there). No DOM, no three.js (tested in logic.test.ts).
 */
import type { L, Lang } from "../../../contract";
import {
  boardwalks,
  HUB_ISLAND,
  ISLAND_Y,
  ISLANDS,
  type Island,
  islandGroup,
  type P2,
  UROS_LANDING,
  WALK_HALF,
  WALK_Y,
} from "../../plan";

export interface Span {
  /** Centre, yaw (local +z along the span), half width and half length: an oriented deck box. */
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfD: number;
  a: P2;
  b: P2;
}

/** The boardwalk spans (shore → hub first), each a little longer than its segment so the joints overlap. */
export function spans(): Span[] {
  return boardwalks().map(([a, b]) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    return {
      x: (a[0] + b[0]) / 2,
      z: (a[1] + b[1]) / 2,
      yaw: Math.atan2(dx, dz),
      halfW: WALK_HALF,
      halfD: len / 2 + 0.6,
      a,
      b,
    };
  });
}

/** Height of the first span: from the landing's ground `landY` at its shore end down to the walk level. */
export function rampY(span: Span, landY: number, x: number, z: number): number {
  const dx = span.b[0] - span.a[0];
  const dz = span.b[1] - span.a[1];
  const l2 = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((x - span.a[0]) * dx + (z - span.a[1]) * dz) / l2));
  // The ramp takes the first 7 u (or the whole span when shorter).
  const k = Math.min(1, (u * Math.sqrt(l2)) / 7);
  return landY + (WALK_Y - landY) * (k * k * (3 - 2 * k));
}

/** Local frame of an island: +z toward where the boardwalk arrives (the shore for the hub, the hub for the rest). */
export function islandYaw(isl: Island): number {
  const hub = ISLANDS[HUB_ISLAND] as Island;
  if (isl === hub) return Math.atan2(UROS_LANDING.x - hub.x, UROS_LANDING.z - hub.z);
  return Math.atan2(hub.x - isl.x, hub.z - isl.z);
}

/** Island-local (x across, z toward the arrival) → world. */
export function islandPoint(isl: Island, lx: number, lz: number): { x: number; z: number } {
  const yaw = islandYaw(isl);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: isl.x + lx * c + lz * s, z: isl.z - lx * s + lz * c };
}

/** The island whose floor the traveler at (x, y, z) stands on (inside its rim, at deck height), else null. */
export function islandAt(x: number, y: number, z: number, pad = 0.3): Island | null {
  if (Math.abs(y - ISLAND_Y) > 0.6) return null;
  for (const i of ISLANDS) if (Math.hypot(x - i.x, z - i.z) <= i.r - pad) return i;
  return null;
}

export const ISLAND_COPY = {
  kicker: { es: "Isla uro · habilidades", en: "Uros island · skills" },
  lede: {
    es: "Cada isla flotante guarda un grupo de las herramientas y prácticas con las que trabajo.",
    en: "Each floating island holds one group of the tools and practices I work with.",
  },
  count: { es: "{n} en este grupo", en: "{n} in this group" },
  of: { es: "Isla {i} de {n}", en: "Island {i} of {n}" },
  prev: { es: "← Isla anterior", en: "← Previous island" },
  next: { es: "Isla siguiente →", en: "Next island →" },
  note: {
    es: "Los uros construyen sus islas con capas de totora, la caña del lago, y las renuevan desde arriba mientras las de abajo se pudren en el agua.",
    en: "The Uros build their islands from layers of totora, the lake's reed, renewing them from the top as the lower layers rot away in the water.",
  },
  prompt: { es: "E · Ver habilidades · {g}", en: "E · See skills · {g}" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
} satisfies Record<string, L>;

export interface IslandPanel {
  title: string;
  kicker: string;
  lede: string;
  items: string[];
  count: string;
  position: string;
}

/** Panel content of island `index` (in ISLANDS order). */
export function islandPanel(index: number, lang: Lang): IslandPanel {
  const n = ISLANDS.length;
  const i = ((index % n) + n) % n;
  const isl = ISLANDS[i] as Island;
  const g = islandGroup(isl);
  return {
    title: g.group[lang],
    kicker: ISLAND_COPY.kicker[lang],
    lede: ISLAND_COPY.lede[lang],
    items: [...g.items],
    count: ISLAND_COPY.count[lang].replace("{n}", String(g.items.length)),
    position: ISLAND_COPY.of[lang].replace("{i}", String(i + 1)).replace("{n}", String(n)),
  };
}

export const islandPrompt = (isl: Island, lang: Lang) =>
  ISLAND_COPY.prompt[lang].replace("{g}", islandGroup(isl).group[lang]);
