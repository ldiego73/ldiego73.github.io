/**
 * Quad bike (cuatrimoto) for the Nazca pampa: it waits parked just off the road where the descent from the
 * canyon reaches the pampa, a few steps past where the mule's stretch ends (./mula.ts), and carries the
 * traveler across the pampa past the Nazca mirador and Cahuachi and up the climb back to the rim, to the Cruz
 * del Cóndor. The ride is the shared road mount (../../ambient/mount/ride.ts) with the procedural ATV
 * (../../ambient/mount/quad.ts): "E · Subir a la cuatrimoto", "E · Bajar" or Esc gets off, and it stops where
 * mounts stop (the mirador tower's stairs and deck, station grounds such as the Cruz platform).
 * Colca-specific: it never goes back up the descent toward the canyon (./mounts/logic.ts QUAD.startT): the
 * rider gets off there.
 *
 * No engine sound: the Kuntisuyu has no soundscape helper to hang one on (the world plays only its music
 * tracks), and the shared sfx module is not meant for looping sources.
 */
import { mountHome } from "../../ambient/mount/logic";
import { buildQuad } from "../../ambient/mount/quad";
import { createRideMount } from "../../ambient/mount/ride";
import type { CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import { parkingDisc, parkingWalk, QUAD, quadStops } from "./mounts/logic";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const S = env.suyu;
  const disc = parkingDisc(QUAD.homeT, QUAD.side, QUAD.off);
  env.addWalkable(parkingWalk(disc, QUAD.off));
  const tg = env.trail.tangentAt(QUAD.homeT);
  return createRideMount(env, {
    name: "ride-quad",
    model: buildQuad(env),
    home: mountHome({
      plaza: disc,
      station: { x: disc.x, z: disc.z },
      walkable: env.walkable,
      heightAt: S.groundAt,
      trailDistance: S.trailDistance,
      halfWidth: env.trail.halfWidth,
      avoid: [],
      roadDir: { x: tg.x, z: tg.z },
    }),
    prompts: { mount: { es: "E · Subir a la cuatrimoto", en: "E · Ride the quad bike" } },
    speedMul: 2,
    look: 0,
    groundAt: S.groundAt,
    layoutGroundAt: S.layout.groundAt,
    isWater: S.isWater,
    trailDistance: S.trailDistance,
    stopAt: (q) => quadStops(q),
  });
};
