/**
 * Window events shared by the world's modules (core, content, ambients, passport).
 * Every module talks through these instead of importing each other, so they can be built in parallel.
 */
import type { L } from "./contract";

/**
 * The worlds of the Tawantinsuyu. "qhapaq" is the mountain climb (/world/), "wasi" the house at the trailhead
 * (lazy interior inside the mountain page), "selva" the Antisuyu jungle road (its own page, /world/selva/).
 */
export type WorldId = "qhapaq" | "wasi" | "selva";

export type StampKind =
  | "station"
  | "summit"
  | "constellation"
  | "egg"
  | "npc"
  | "weather"
  | "field"
  | "ride"
  | "fauna"
  /** Date-dependent: Inti Raymi, snow at the summit. */
  | "festival"
  /** Climb time trial. */
  | "record"
  /** A room of the Wasi house. */
  | "room";

export interface StampDetail {
  /** Stable id, e.g. "station:auna", "constellation:yacana", "egg:golden-khipu". */
  id: string;
  kind: StampKind;
  /** Display name for the passport and the toast. */
  label: L;
}

export interface MountDetail {
  /** true while the traveler rides a llama. */
  riding: boolean;
  /** Movement speed multiplier while riding (1 when not riding). */
  speedMul: number;
  /** Extra height of the avatar's feet above the ground while seated (0 when not riding). */
  seatHeight: number;
  /** What is ridden; absent means the llama (older emitters). */
  vehicle?: "llama" | "canoe";
}

export interface TeleportDetail {
  /** Station id from STATIONS, or "summit" / "trailhead". */
  to: string;
}

export interface QualityDetail {
  quality: "low" | "high";
  /** true when the auto governor changed it (not the user). */
  auto: boolean;
}

/** Event name → detail type. Existing events from earlier rounds are listed for reference. */
export interface WorldEvents {
  "world:stamp": StampDetail;
  "world:mount": MountDetail;
  "world:teleport": TeleportDetail;
  "world:quality": QualityDetail;
  /** A content panel or the passport wants the world to pause movement (true) or resume (false). */
  "world:modal": { open: boolean };
  "world:game": { open: boolean };
  "world:interior": { inside: boolean; id: string };
  "world:traveler": { name: string };
  "world:map": undefined;
  "world:help": undefined;
  "world:passport-complete": { total: number };
  /** Open the accessible text-mode narration (core). */
  "world:textmode": undefined;
  /** Weather state changed (sky agent, ambient/weather.ts); emitted once at start and when a crossfade begins. */
  "world:weather": { kind: "clear" | "mist" | "garua" };
  /** Open the shareable journey postcard (passport button, summit panel). */
  "world:postcard": undefined;
  /** Chasqui errands (npcs.ts): offered → accepted → done (or dropped). `to` is a STATIONS id. */
  "world:mission": { id: string; state: "offered" | "accepted" | "done" | "dropped"; to?: string };
  /**
   * Climb time trial transitions (journey.ts createClimbTracker): the clock started past the gate, the attempt
   * was voided (fast travel, tour, back to the gate), or the summit was reached (`ms`, best before this climb,
   * whether it is a new best). The ghost ambient records/replays the path from these.
   */
  "world:climb": { phase: "start" | "void" | "done"; ms?: number; prevBestMs?: number | null; isBest?: boolean };
  /**
   * The traveler is leaving for another world (portal / door crossed). Emitted right before the fade and the
   * navigation, so sound and analytics can react; `travelTo()` in ./travel.ts does the rest.
   */
  "world:travel": { from: WorldId; to: WorldId };
}

export function emit<K extends keyof WorldEvents>(name: K, detail: WorldEvents[K]): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof WorldEvents>(name: K, cb: (detail: WorldEvents[K]) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<WorldEvents[K]>).detail);
  window.addEventListener(name, h);
  return () => window.removeEventListener(name, h);
}
