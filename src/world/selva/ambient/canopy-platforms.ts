/**
 * Canopy walkway platforms: makes the plank rings around the three walkway ceibas (built by the scenery,
 * scenery/canopy.ts) walkable. Each ring is one deck (../../decks.ts): a circle around the trunk whose height
 * is the walkway's own at the nearest road t (scenery/platforms.ts `platformY`), so where the ring overlaps the
 * bridge it agrees with it exactly and the traveler steps off the bridge onto the planks on either side of the
 * trunk, where the walkway railing is cut. The trunk stays a collider (scenery); the ring's outer rim, where it
 * clears the bridge, gets a chain of rail colliders so the body stops at the rope instead of hanging over it
 * (the deck edge is a wall anyway: nothing below is walkable).
 *
 * No visuals and no draw calls of its own. Registers at create time and removes its decks on dispose (the
 * colliders live in the layout, which is rebuilt with the runtime).
 */
import type { CreateAmbient } from "../../contract";
import { decks } from "../../decks";
import type { SelvaEnv } from "../contract";
import { canopyPlatforms, platformY, rimOutside } from "../scenery/platforms";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const L = env.selva.layout;
  const removers: Array<() => void> = [];
  for (const [i, pf] of canopyPlatforms(L).entries()) {
    removers.push(
      decks.add({
        id: `canopy-platform-${i}`,
        shape: { kind: "circle", x: pf.x, z: pf.z, r: pf.outer },
        y: (x, z) => platformY(L, x, z),
      }),
    );
    // Rail colliders on the rim (radius 0.25 at the rope line), spaced well under the body's diameter.
    const n = Math.ceil((Math.PI * 2 * pf.outer) / 0.45);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (!rimOutside(L, pf, a)) continue;
      env.addCollider({ kind: "circle", x: pf.x + Math.cos(a) * pf.outer, z: pf.z + Math.sin(a) * pf.outer, r: 0.25 });
    }
  }
  return {
    update() {},
    dispose() {
      for (const r of removers.splice(0)) r();
    },
  };
};
