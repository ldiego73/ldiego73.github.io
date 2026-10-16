/**
 * Mountable mule at the start of the Antisuyu road (the jungle's counterpart of the mountain llama, which
 * stays on the mountain). It waits saddled on the rim of the "puerto" plaza; the ride itself is the shared
 * road mount (../../ambient/mount/ride.ts): "E · Montar la mula", the mule follows the traveler, "E · Bajar"
 * or Esc dismounts, and it stops where mounts stop (decks, station grounds).
 * Jungle-specific: it also stops at the canopy walkway (no hanging bridges, ./mula/logic.ts), and it hides
 * its prompt while the canoe owns the traveler (../ride.ts).
 */
import { mountHome } from "../../ambient/mount/logic";
import { buildSaddledMule } from "../../ambient/mount/mule";
import { createRideMount } from "../../ambient/mount/ride";
import type { CreateAmbient } from "../../contract";
import { PUNKU_PROMPT_R, PUNKU_T, SPAWN_T } from "../arrival";
import type { SelvaEnv } from "../contract";
import { ride } from "../ride";
import { nearCanopy } from "./mula/logic";

/** Mount prompt radius (../../ambient/mount/ride.ts), kept clear of the punku's own prompt. */
const RANGE = 2.4;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const S = env.selva;
  const hw = env.trail.halfWidth;
  const punku = env.trail.pointAt(PUNKU_T);
  const spawn = env.trail.pointAt(SPAWN_T);
  return createRideMount(env, {
    name: "ride-mule",
    model: buildSaddledMule(env),
    home: mountHome({
      plaza: S.layout.plazas.find((p) => p.id === "puerto"),
      station: env.stationPose("puerto").position,
      walkable: env.walkable,
      heightAt: S.groundAt,
      trailDistance: S.trailDistance,
      halfWidth: hw,
      avoid: [
        [punku.x, punku.z, PUNKU_PROMPT_R + RANGE + 0.5],
        [spawn.x, spawn.z, 2],
      ],
      roadDir: env.trail.tangentAt(SPAWN_T),
    }),
    prompts: { mount: { es: "E · Montar la mula", en: "E · Ride the mule" } },
    groundAt: S.groundAt,
    layoutGroundAt: S.layout.groundAt,
    isWater: S.isWater,
    trailDistance: S.trailDistance,
    stopAt: (q) => nearCanopy(q, hw),
    busy: () => ride.active,
  });
};
