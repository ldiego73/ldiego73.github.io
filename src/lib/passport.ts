import { type ArcadeState, load as loadArcade } from "../games/core/store";
import { ACHIEVEMENTS } from "../games/registry";
import { type L, STATIONS } from "../world/contract";
import type { StampKind } from "../world/events";

export const PASSPORT_KEY = "ldiego73-passport-v1";
export interface PassportState {
  stamps: Record<string, number>;
}
export interface PassportStamp {
  id: string;
  kind: StampKind;
  label: L;
}

export const CATALOG: readonly PassportStamp[] = [
  ...STATIONS.filter((station) => station.kind !== "build").map((station) => ({
    id: `station:${station.id}`,
    kind: "station" as const,
    label: station.label,
  })),
  { id: "summit", kind: "summit", label: { es: "Cumbre del Qhapaq Ñan", en: "Qhapaq Ñan summit" } },
  { id: "constellation:yacana", kind: "constellation", label: { es: "Yacana · la llama", en: "Yacana · the llama" } },
  {
    id: "constellation:machacuay",
    kind: "constellation",
    label: { es: "Machacuay · la serpiente", en: "Machacuay · the serpent" },
  },
  { id: "constellation:hanpatu", kind: "constellation", label: { es: "Hanpatu · el sapo", en: "Hanpatu · the toad" } },
  { id: "weather:garua", kind: "weather", label: { es: "Garúa", en: "Garúa drizzle" } },
  { id: "weather:fog", kind: "weather", label: { es: "Niebla", en: "Fog" } },
  { id: "ride:llama", kind: "ride", label: { es: "Paseo en llama", en: "Llama ride" } },
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `egg:vizcacha-${i + 1}`,
    kind: "egg" as const,
    label: { es: `Vizcacha ${i + 1}`, en: `Vizcacha ${i + 1}` },
  })),
  { id: "egg:golden-khipu", kind: "egg", label: { es: "Khipu dorado", en: "Golden khipu" } },
  { id: "field:huerto", kind: "field", label: { es: "Huerto de código", en: "Code garden" } },
  { id: "field:khipu-board", kind: "field", label: { es: "Khipu de escritos", en: "Writing khipu" } },
  { id: "fauna:oso", kind: "fauna", label: { es: "Oso de anteojos", en: "Spectacled bear" } },
  { id: "fauna:pato", kind: "fauna", label: { es: "Pato de los torrentes", en: "Torrent duck" } },
  { id: "fauna:perdiz", kind: "fauna", label: { es: "Perdiz andina", en: "Andean tinamou" } },
  { id: "fauna:zorro", kind: "fauna", label: { es: "Zorro andino", en: "Andean fox" } },
  { id: "fauna:puma", kind: "fauna", label: { es: "Puma", en: "Puma" } },
];

const ids = new Set(CATALOG.map((stamp) => stamp.id));
const validTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;

export const emptyPassport = (): PassportState => ({ stamps: {} });

function sanitize(value: unknown): PassportState {
  const state = emptyPassport();
  if (!value || typeof value !== "object" || !("stamps" in value)) return state;
  const stamps = value.stamps;
  if (!stamps || typeof stamps !== "object" || Array.isArray(stamps)) return state;
  for (const [id, time] of Object.entries(stamps)) {
    if (ids.has(id) && validTime(time)) state.stamps[id] = time;
  }
  return state;
}

/** Missing, corrupt or blocked storage never interrupts the journey. */
export function loadPassport(): PassportState {
  try {
    const raw = localStorage.getItem(PASSPORT_KEY);
    return raw ? sanitize(JSON.parse(raw)) : emptyPassport();
  } catch {
    return emptyPassport();
  }
}

export function savePassport(state: PassportState): void {
  try {
    localStorage.setItem(PASSPORT_KEY, JSON.stringify(sanitize(state)));
  } catch {
    // The ambient retains progress in memory for this visit.
  }
}

/** Preserves the first discovery date; unknown ids cannot inflate progress. */
export function recordStamp(state: PassportState, id: string, time = Date.now()): boolean {
  if (!ids.has(id) || validTime(state.stamps[id]) || !validTime(time)) return false;
  state.stamps[id] = time;
  savePassport(state);
  return true;
}

export function passportComplete(state: PassportState): boolean {
  // Eggs and wildlife are bonus finds (the puma and the bear are rare): they never gate completion.
  return CATALOG.every((stamp) => stamp.kind === "egg" || stamp.kind === "fauna" || validTime(state.stamps[stamp.id]));
}

/** Read-only merged progress: arcade remains owned by its existing store. */
export function mergedPassport(state = loadPassport(), arcade: ArcadeState = loadArcade()) {
  const world = CATALOG.map((stamp) => {
    const collectedAt = validTime(state.stamps[stamp.id]) ? state.stamps[stamp.id] : null;
    return {
      ...stamp,
      label:
        (stamp.kind === "egg" || stamp.kind === "fauna") && collectedAt === null
          ? { es: "???", en: "???" }
          : stamp.label,
      collectedAt,
    };
  });
  const achievements = ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    collectedAt: validTime(arcade.unlocked?.[achievement.id]) ? arcade.unlocked[achievement.id] : null,
  }));
  const worldCollected = world.filter((stamp) => stamp.collectedAt !== null).length;
  const arcadeCollected = achievements.filter((achievement) => achievement.collectedAt !== null).length;
  const total = world.length + achievements.length;
  const collected = worldCollected + arcadeCollected;
  return {
    world,
    arcade: achievements,
    worldTotal: world.length,
    worldCollected,
    arcadeTotal: achievements.length,
    arcadeCollected,
    total,
    collected,
    percentage: total ? Math.round((collected / total) * 100) : 0,
  };
}
