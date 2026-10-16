/**
 * Where a suyu world starts the traveler. Pure: the runtime passes `location.search` and the world's spawn
 * table (SuyuDef.spawn), and gets back the spawn point for `?from=<world>` (the portal the traveler came
 * through) or the world's default. Unknown, missing or self-referencing origins fall back to the default.
 */
import { WORLD_PAGES } from "../../lib/passport";
import type { WorldId } from "../events";
import type { SpawnPoint } from "./contract";

/** Every world has a passport page, so the pages are the list of known world ids. */
const WORLDS: ReadonlySet<string> = new Set<string>(WORLD_PAGES.map((p) => p.id));

/** The origin world named by `?from=` (only known world ids), else null. */
export function parseFrom(search: string): WorldId | null {
  let from: string | null = null;
  try {
    from = new URLSearchParams(search).get("from");
  } catch {
    return null;
  }
  return from && WORLDS.has(from) ? (from as WorldId) : null;
}

/** The spawn for this visit: the origin's entry in `spawn.from`, else `spawn.default`. */
export function resolveSpawn(
  spawn: { default: SpawnPoint; from?: Partial<Record<WorldId, SpawnPoint>> },
  search: string,
  self?: WorldId,
): { point: SpawnPoint; from: WorldId | null } {
  const from = parseFrom(search);
  const hit = from && from !== self ? spawn.from?.[from] : undefined;
  return hit ? { point: hit, from } : { point: spawn.default, from: null };
}
