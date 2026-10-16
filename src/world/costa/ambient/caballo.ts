/**
 * The coast's mount: a Peruvian Paso horse (../../ambient/mount/horse.ts) saddled in a chalán's tack, waiting
 * a few steps past the spawn on the open ground seaward of the road (./caballo/logic.ts), in view on arrival.
 * The ride is the shared road mount (../../ambient/mount/ride.ts): "E · Montar el caballo", the horse follows
 * the traveler in the paso llano at the mount's speed, "E · Bajar" or Esc dismounts, and it stops where mounts
 * stop (decks such as the finale platform, station grounds).
 * Coast-specific: it also stops at every station plaza (./caballo/logic.ts rideStops: the station prompts come
 * after this module in the ambient order), and it hides its prompt while the caballito de totora owns the
 * traveler (../../suyu/ride.ts). No `vehicle` on its world:mount, so the runtime keeps the traveler walking.
 * No passport stamp of its own.
 */
import { buildPasoHorse } from "../../ambient/mount/horse";
import { mountHome } from "../../ambient/mount/logic";
import { createRideMount } from "../../ambient/mount/ride";
import type { CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import { ride } from "../../suyu/ride";
import { START_T } from "../def";
import { PUNKU_PROMPT_R, PUNKU_T } from "../plan";
import { HOME_T, homePatch, inside, rideStops } from "./caballo/logic";

/** Mount prompt radius (../../ambient/mount/ride.ts), kept clear of the punku's own prompt. */
const RANGE = 2.4;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const S = env.suyu;
  const tr = S.layout.trail;
  const punku = tr.pointAt(PUNKU_T);
  const spawn = tr.pointAt(START_T);
  const at = tr.pointAt(HOME_T);
  const dir = tr.tangentAt(HOME_T);
  const stops = rideStops(S.layout.plazas);
  return createRideMount(env, {
    name: "ride-horse",
    model: buildPasoHorse(env),
    home: mountHome({
      plaza: homePatch(at, dir),
      station: { x: at.x, z: at.z },
      walkable: env.walkable,
      heightAt: S.groundAt,
      trailDistance: S.trailDistance,
      halfWidth: env.trail.halfWidth,
      avoid: [
        [punku.x, punku.z, PUNKU_PROMPT_R + RANGE + 0.5],
        [spawn.x, spawn.z, 2],
      ],
      roadDir: dir,
    }),
    prompts: { mount: { es: "E · Montar el caballo", en: "E · Ride the horse" } },
    groundAt: S.groundAt,
    layoutGroundAt: S.layout.groundAt,
    isWater: S.isWater,
    trailDistance: S.trailDistance,
    stopAt: (_q, x, z) => inside(stops, x, z),
    busy: () => ride.active,
  });
};
