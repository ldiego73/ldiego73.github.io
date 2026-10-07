/**
 * Tinkuy: the crossroads at the trailhead, where the mountain road meets the other worlds.
 *  - A wooden signpost (on the trail's west edge where the Wasi walk joins, just south of the gate arch)
 *    with three carved arrows: Qhapaq Ñan up the trail, Wasi to the house, Antisuyu across the plaza.
 *  - The Antisuyu branch (trailhead.ts SELVA_BRANCH): a dirt and flagstone path from the gate plaza down to
 *    a trapezoidal Inca punku (doorway). Its opening shimmers with a glimpse of green jungle, and big jungle
 *    leaves already grow around the stones.
 * Within PREFETCH_R of the punku the jungle page is prefetched once; within TRAVEL_R, in front of it,
 * "E · Viajar al Antisuyu" travels there (travel.ts `travelTo`, which emits `world:travel` and fades out).
 * Coming back (?from=selva) core spawns the traveler at trailhead.ts ARRIVALS.selva, inside the band.
 *
 * Collisions: the band is walkable (discs along the polyline: it runs diagonally, so boxes would leave a
 * staircase edge), from inside the plaza to the punku's doorstep; the jambs and the signpost are colliders;
 * animals keep out of the punku. Draw calls: signpost 2, branch 2, punku 3 (stones, plants, glimpse).
 */
import type * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { creatures } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { vertexToon } from "../merge-colors";
import { offFontsReady, onFontsReady } from "../props";
import { PUNKU } from "../trailhead";
import { prefetchWorld, travelTo } from "../travel";
import {
  BAND,
  BAND_R,
  clearsGround,
  inTravelRange,
  jambColliders,
  PREFETCH_R,
  PUNKU_FRONT,
  PUNKU_KEEP_OUT_R,
  pathCircles,
  SIGN,
} from "./tinkuy/logic";
import { buildBranch, buildPunku, buildSignpost, type Owned } from "./tinkuy/models";
import { clearGround } from "./wasi/clear-ground";

const PROMPT = { es: "E · Viajar al Antisuyu", en: "E · Travel to the Antisuyu" } as const;
/** Models are only updated (glimpse shimmer) within this distance. */
const NEAR = 60;

export const create: CreateAmbient = (envIn): Ambient => {
  const env = envIn as WorldEnvExtra;
  const lang = env.lang;
  const ground = (x: number, z: number) => env.extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const own: Owned = { geos: [], mats: [], texs: [], redraws: [] };
  const mat = vertexToon();
  own.mats.push(mat);

  const sign = buildSignpost(env, lang, ground, mat, own);
  const branch = buildBranch(env, ground, mat, own);
  const punku = buildPunku(env, ground, mat, own);
  env.scene.add(sign, branch, punku.group);
  for (const r of own.redraws) onFontsReady(r);

  for (const c of pathCircles(BAND, BAND_R)) env.addWalkable(c);
  env.addWalkable({ kind: "circle", x: PUNKU_FRONT[0], z: PUNKU_FRONT[1], r: 1.8 });
  for (const c of jambColliders()) env.addCollider(c);
  env.addCollider({ kind: "circle", x: SIGN.x, z: SIGN.z, r: SIGN.r });
  const keep = creatures.keepOut(PUNKU.x, PUNKU.z, PUNKU_KEEP_OUT_R);
  clearGround(env.scene, clearsGround);

  let near = false;
  let prefetched = false;
  let busy = false;

  return {
    update(_dt, avatar, t) {
      const d = Math.hypot(avatar.x - PUNKU.x, avatar.z - PUNKU.z);
      if (!prefetched && d < PREFETCH_R) {
        prefetched = true;
        prefetchWorld(lang, "selva");
      }
      near = !busy && d < 4 && inTravelRange(avatar.x, avatar.z);
      if (d < NEAR) punku.update(t);
    },
    prompt: () => (near ? PROMPT[lang] : null),
    interact() {
      if (!near) return false;
      busy = true;
      near = false;
      travelTo(lang, "qhapaq", "selva");
      return true;
    },
    dispose() {
      for (const r of own.redraws) offFontsReady(r);
      for (const root of [sign, branch, punku.group])
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
        });
      for (const g of own.geos) g.dispose();
      for (const t of own.texs) t.dispose();
      for (const m of own.mats) m.dispose();
      sign.removeFromParent();
      branch.removeFromParent();
      punku.group.removeFromParent();
      creatures.removeKeepOut(keep);
    },
  };
};
