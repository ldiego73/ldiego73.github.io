/**
 * Canopy walkway field stamp: when the traveler crosses the whole canopy walkway (CANOPY_T, the hanging
 * bridges between ceibas built by the scenery) in one continuous stay, in either direction, emit
 * `selva:field:dosel`. No visuals of its own; the tracker is pure (dosel/logic.ts).
 * "On the deck" means on the road band inside CANOPY_T, or on one of the plank rings around the walkway
 * ceibas (scenery/platforms.ts; stepping onto a platform does not break the stay), and not riding the canoe
 * (`world:mount`).
 */

import { CATALOG } from "../../../lib/passport";
import type { CreateAmbient } from "../../contract";
import { emit, on } from "../../events";
import { CANOPY_T, type SelvaEnv } from "../contract";
import { canopyPlatforms, onCanopyPlatform } from "../scenery/platforms";
import { feed, newTrack } from "./dosel/logic";

const STAMP = "selva:field:dosel";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const entry = CATALOG.find((s) => s.id === STAMP);
  const track = newTrack();
  let riding = false;
  const off = on("world:mount", (d) => {
    riding = !!d?.riding;
  });
  const band = env.trail.halfWidth + 0.4;
  const platforms = canopyPlatforms(env.selva.layout);
  return {
    update(_dt, avatar) {
      if (track.done) return;
      const q = env.selva.trailDistance(avatar.x, avatar.z);
      // Cheap early out far from the walkway (most of the road).
      if (q.t < CANOPY_T[0] - 0.02 || q.t > CANOPY_T[1] + 0.02) {
        if (track.last >= 0) feed(track, q.t, false, CANOPY_T);
        return;
      }
      const onDeck = !riding && (q.d <= band || onCanopyPlatform(platforms, avatar.x, avatar.z));
      if (feed(track, q.t, onDeck, CANOPY_T) && entry) {
        emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
      }
    },
    dispose() {
      off();
    },
  };
};
