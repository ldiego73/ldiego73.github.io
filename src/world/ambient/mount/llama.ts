/**
 * The saddled llama as a road mount (./ride.ts `MountModel`): the mountain's trailhead llama
 * (./model.ts `buildSaddledLlama`: the shared animal llama with an aguayo blanket, saddle pad, tassels and
 * t'ikas) driven by its own gait (the lateral walk, then the pace), so a suyu world can lend the traveler the
 * same animal the mountain does (the Collasuyu's lake road). The mountain keeps its own ambient
 * (../llama-mount.ts); this only adapts the model.
 *
 * The blanket's tassels swing with the gait here (the mountain ambient swings them in the wind itself).
 * Collision radius 0.6, like the mountain llama's waiting body.
 */
import type { WorldEnv } from "../../contract";
import { buildSaddledLlama, SEAT_HEIGHT } from "./model";
import type { MountModel } from "./ride";

export function saddledLlamaMount(env: WorldEnv): MountModel {
  const m = buildSaddledLlama(env);
  let swing = 0;
  return {
    group: m.group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.6,
    animate(f) {
      m.animate(f);
      swing += f.dt * (2 + f.speed * 2);
      const k = Math.min(1, f.speed / 1.2) * (f.rm ? 0.45 : 1);
      m.tassels.forEach((t, i) => {
        t.rotation.x = (-0.2 + Math.sin(swing + i) * 0.3) * k;
        t.rotation.z = Math.cos(swing * 0.5 + i * 0.7) * 0.15 * k;
      });
    },
    dispose: m.dispose,
  };
}
