/**
 * Window events shared by the world's modules (core, content, ambients, passport).
 * Every module talks through these instead of importing each other, so they can be built in parallel.
 */
import type { L } from "./contract";

export type StampKind = "station" | "summit" | "constellation" | "egg" | "npc" | "weather" | "field" | "ride" | "fauna";

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
}

export function emit<K extends keyof WorldEvents>(name: K, detail: WorldEvents[K]): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<K extends keyof WorldEvents>(name: K, cb: (detail: WorldEvents[K]) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<WorldEvents[K]>).detail);
  window.addEventListener(name, h);
  return () => window.removeEventListener(name, h);
}
