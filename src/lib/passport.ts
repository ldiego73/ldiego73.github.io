import { type ArcadeState, load as loadArcade } from "../games/core/store";
import { ACHIEVEMENTS } from "../games/registry";
import { type L, STATIONS } from "../world/contract";
import type { StampKind, WorldId } from "../world/events";
import { SELVA_STATIONS } from "../world/selva/contract";

export const PASSPORT_KEY = "ldiego73-passport-v1";
export interface PassportState {
  stamps: Record<string, number>;
}
export interface PassportStamp {
  id: string;
  kind: StampKind;
  label: L;
  /** Passport page: one per world. Absent means the mountain ("qhapaq"). */
  world?: WorldId;
}

/** Passport pages in reading order. */
export const WORLD_PAGES: ReadonlyArray<{ id: WorldId; label: L }> = [
  { id: "qhapaq", label: { es: "Qhapaq Ñan", en: "Qhapaq Ñan" } },
  { id: "wasi", label: { es: "Wasi · la casa", en: "Wasi · the house" } },
  { id: "selva", label: { es: "Antisuyu · la selva", en: "Antisuyu · the jungle" } },
];
export const worldOf = (stamp: Pick<PassportStamp, "world">): WorldId => stamp.world ?? "qhapaq";

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
  { id: "mission:1", kind: "npc", label: { es: "Encargo del chasqui I", en: "Chasqui errand I" } },
  { id: "mission:2", kind: "npc", label: { es: "Encargo del chasqui II", en: "Chasqui errand II" } },
  { id: "mission:3", kind: "npc", label: { es: "Encargo del chasqui III", en: "Chasqui errand III" } },
  { id: "record:climb", kind: "record", label: { es: "Contrarreloj a la cumbre", en: "Summit time trial" } },
  { id: "festival:inti-raymi", kind: "festival", label: { es: "Inti Raymi", en: "Inti Raymi" } },
  { id: "festival:snow", kind: "festival", label: { es: "Nieve en la cumbre", en: "Snow on the summit" } },
  { id: "egg:golden-condor", kind: "egg", label: { es: "Cóndor dorado", en: "Golden condor" } },
  { id: "egg:waterfall-cave", kind: "egg", label: { es: "Cueva tras la cascada", en: "Cave behind the waterfall" } },
  { id: "egg:atoq", kind: "egg", label: { es: "Atoq · el zorro del cielo", en: "Atoq · the sky fox" } },
  { id: "fauna:oso", kind: "fauna", label: { es: "Oso de anteojos", en: "Spectacled bear" } },
  { id: "fauna:pato", kind: "fauna", label: { es: "Pato de los torrentes", en: "Torrent duck" } },
  { id: "fauna:perdiz", kind: "fauna", label: { es: "Perdiz andina", en: "Andean tinamou" } },
  { id: "fauna:zorro", kind: "fauna", label: { es: "Zorro andino", en: "Andean fox" } },
  { id: "fauna:puma", kind: "fauna", label: { es: "Puma", en: "Puma" } },
  // Wasi: the house at the trailhead, one stamp per room.
  { id: "wasi:sala", kind: "room", world: "wasi", label: { es: "Sala · trayectoria", en: "Living room · career" } },
  {
    id: "wasi:estudio",
    kind: "room",
    world: "wasi",
    label: { es: "Estudio · formación y CV", en: "Study · education and CV" },
  },
  {
    id: "wasi:buzon",
    kind: "room",
    world: "wasi",
    label: { es: "Rincón del chasqui · contacto", en: "Chasqui corner · contact" },
  },
  {
    id: "wasi:mesa",
    kind: "room",
    world: "wasi",
    label: { es: "Mesa del viajero · pasaporte", en: "Traveler's table · passport" },
  },
  // Antisuyu: the jungle road.
  ...SELVA_STATIONS.map((station) => ({
    id: `selva:station:${station.id}`,
    kind: "station" as const,
    world: "selva" as const,
    label: station.label,
  })),
  { id: "selva:ride:canoe", kind: "ride", world: "selva", label: { es: "Viaje en canoa", en: "Canoe trip" } },
  { id: "selva:field:dosel", kind: "field", world: "selva", label: { es: "Puentes del dosel", en: "Canopy walkway" } },
  ...(
    [
      ["guacamayo", "Guacamayo escarlata", "Scarlet macaw"],
      ["mono", "Mono fraile", "Squirrel monkey"],
      ["perezoso", "Perezoso", "Sloth"],
      ["bufeo", "Bufeo colorado", "Pink river dolphin"],
      ["caiman", "Caimán negro", "Black caiman"],
      ["ronsoco", "Ronsoco", "Capybara"],
      ["tucan", "Tucán", "Toucan"],
      ["jaguar", "Otorongo · jaguar", "Otorongo · jaguar"],
    ] as const
  ).map(([id, es, en]) => ({
    id: `selva:fauna:${id}`,
    kind: "fauna" as const,
    world: "selva" as const,
    label: { es, en },
  })),
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

const REQUIRED = new Set<PassportStamp["kind"]>([
  "station",
  "summit",
  "constellation",
  "weather",
  "ride",
  "field",
  "room",
]);

/** Stamps that gate completion (optionally one page only). */
export const requiredStamps = (world?: WorldId) =>
  CATALOG.filter((stamp) => REQUIRED.has(stamp.kind) && (!world || worldOf(stamp) === world));

/** Every page done. Optionally one world's page only. */
export function passportComplete(state: PassportState, world?: WorldId): boolean {
  // Only the walks themselves gate completion. Eggs, wildlife, errands, the time trial and date-dependent
  // stamps (Inti Raymi, winter snow) are bonus finds.
  return requiredStamps(world).every((stamp) => validTime(state.stamps[stamp.id]));
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
