/**
 * Pure helpers of the suyu paper map (./map.ts): stamps → visited stations, the fast-travel unlock, the
 * sheet's bounds and projection, and label rows. No DOM, no three.js (tested in map-logic.test.ts).
 * Same rules as the jungle map (../selva/map.ts), parameterised by world: visited and fast travel come only
 * from the passport (stamps are the single record of the walk).
 */

/** Stamp id → station id for this world ("cusco:station:usnu" → "usnu"), else null. */
export function stampToStop(world: string, stations: ReadonlySet<string>, id: string): string | null {
  const prefix = `${world}:station:`;
  if (!id.startsWith(prefix)) return null;
  const s = id.slice(prefix.length);
  return stations.has(s) ? s : null;
}

/**
 * Visited station ids and the fast-travel unlock from the passport's JSON. Tolerates garbage. With a null
 * unlock stamp fast travel is open from the start.
 */
export function parsePassport(
  raw: string | null | undefined,
  world: string,
  stations: ReadonlySet<string>,
  unlock: string | null,
): { visited: string[]; canTravel: boolean } {
  const none = { visited: [] as string[], canTravel: unlock === null };
  if (!raw) return none;
  try {
    const v = JSON.parse(raw) as { stamps?: unknown };
    if (!v || typeof v !== "object" || !v.stamps || typeof v.stamps !== "object" || Array.isArray(v.stamps))
      return none;
    const keys = Object.keys(v.stamps as Record<string, unknown>);
    const visited: string[] = [];
    for (const k of keys) {
      const s = stampToStop(world, stations, k);
      if (s) visited.push(s);
    }
    return { visited, canTravel: unlock === null || keys.includes(unlock) };
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

/**
 * Bounds of the points, padded, then grown (around the centre) on the short side so the sheet is no wider than
 * `maxAspect` × its height and no taller than its width × `maxAspect` (1 gives a square sheet).
 */
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
  let w = maxX - minX + pad * 2;
  let h = maxZ - minZ + pad * 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  h = Math.max(h, w / maxAspect);
  w = Math.max(w, h / maxAspect);
  return { minX: cx - w / 2, minZ: cz - h / 2, w, h };
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
 * Label rows: labels on the same side share row 0 unless they would overlap horizontally, then move out one
 * row. Input order is kept; returns a row index per label.
 */
export function labelRows(items: ReadonlyArray<{ x0: number; x1: number; side: -1 | 1 }>, gap = 6): number[] {
  const rows = new Map<number, number[]>();
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

/** Khipu dyes for station dots, cycled by index (red, ochre, indigo, turquoise, alpaca). */
export const MAP_DYES = ["#c4383f", "#dda63c", "#3446a6", "#2a9d8f", "#a8825f"] as const;
