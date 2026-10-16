/**
 * Saddled mule at the start of the Kuntisuyu road: it waits beside the road a few steps past the arrival spot
 * (on the north side, away from the drop, clear of the punku's prompt and sign), and carries the traveler
 * along the canyon's rim, past the village and the colcas, and down the descent to the pampa. The ride is the
 * shared road mount (../../ambient/mount/ride.ts): "E · Montar la mula", the mule follows the traveler,
 * "E · Bajar" or Esc dismounts, and it stops where mounts stop (decks, station grounds).
 * Colca-specific: its stretch ends where the descent reaches the pampa (./mounts/logic.ts MULE.endT): the
 * rider gets off there, beside the quad bike that serves the pampa (./cuatrimoto.ts).
 */
import { mountHome } from "../../ambient/mount/logic";
import { buildSaddledMule } from "../../ambient/mount/mule";
import { createRideMount } from "../../ambient/mount/ride";
import type { CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import { ARRIVE_T, roadAt } from "../plan";
import { MULE, muleStops, parkingDisc, parkingWalk } from "./mounts/logic";

/** Mount prompt radius (../../ambient/mount/ride.ts) and the punku's own prompt radius (./punku.ts). */
const RANGE = 2.4;
const PUNKU_PROMPT_R = 3.6;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const S = env.suyu;
  const hw = env.trail.halfWidth;
  const punku = roadAt(0);
  const spawn = roadAt(ARRIVE_T);
  // The punku's sign stands 3.2 u in and ~4.2 u to the right of the road (./punku.ts).
  const sign = { x: punku.x + punku.dx * 3.2 - punku.dz * 4.2, z: punku.z + punku.dz * 3.2 + punku.dx * 4.2 };
  const disc = parkingDisc(MULE.homeT, MULE.side, MULE.off);
  // The waiting spot is off the road band: make it (and the verge up to it) walkable.
  env.addWalkable(parkingWalk(disc, MULE.off));
  const tg = env.trail.tangentAt(MULE.homeT);
  return createRideMount(env, {
    name: "ride-mule",
    model: buildSaddledMule(env),
    home: mountHome({
      plaza: disc,
      station: { x: disc.x, z: disc.z },
      walkable: env.walkable,
      heightAt: S.groundAt,
      trailDistance: S.trailDistance,
      halfWidth: hw,
      avoid: [
        [punku.x, punku.z, PUNKU_PROMPT_R + RANGE + 0.5],
        [spawn.x, spawn.z, 2],
        [sign.x, sign.z, 2.5],
      ],
      roadDir: { x: tg.x, z: tg.z },
    }),
    prompts: { mount: { es: "E · Montar la mula", en: "E · Ride the mule" } },
    groundAt: S.groundAt,
    layoutGroundAt: S.layout.groundAt,
    isWater: S.isWater,
    trailDistance: S.trailDistance,
    stopAt: (q) => muleStops(q),
  });
};
