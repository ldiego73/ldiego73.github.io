/**
 * The saddled llama as a road mount (./ride.ts `MountModel`): the mountain's trailhead llama
 * (./model.ts `buildSaddledLlama`, aguayo blanket, saddle pad, tassels, ear pompoms) driven by the shared
 * quadruped trot (./gait.ts), so a suyu world can lend the traveler the same animal the mountain does (the
 * Collasuyu's lake road). The mountain keeps its own ambient (../llama-mount.ts); this only adapts the model.
 *
 * Gait amplitudes follow the mountain llama: an upright neck (lean 0), the tail held a little up (0.2), the
 * blanket's tassels swinging as danglers. Collision radius 0.6, like the mountain llama's waiting body.
 */
import type { WorldEnv } from "../../contract";
import { quadrupedGait } from "./gait";
import { buildSaddledLlama, SEAT_HEIGHT } from "./model";
import type { MountModel } from "./ride";

export function saddledLlamaMount(env: WorldEnv): MountModel {
  const m = buildSaddledLlama(env);
  return {
    group: m.group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.6,
    // Llamas carry their heads high and step short: a smaller leg swing than the mule's.
    animate: quadrupedGait(
      { body: m.body, legs: m.legs, neck: m.neck, head: m.head, tail: m.tail, danglers: m.tassels },
      { neckLean: 0, tailLean: 0.2, legMax: 0.45, bob: 0.04 },
    ),
    dispose: m.dispose,
  };
}
