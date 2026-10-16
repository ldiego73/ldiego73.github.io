/**
 * Tinkuy: the crossroads at the trailhead, where the mountain road meets the other worlds.
 *  - A wooden signpost (on the trail's west edge where the Wasi walk joins, just south of the gate arch)
 *    with four carved arrows: Qhapaq Ñan up the trail, Wasi to the house, Antisuyu across the plaza and
 *    Qusqu down the trail to the south.
 *  - The Antisuyu branch (trailhead.ts SELVA_BRANCH): a dirt and flagstone path from the gate plaza down to
 *    a trapezoidal Inca punku (doorway). Its opening shimmers with a glimpse of green jungle, and big jungle
 *    leaves already grow around the stones.
 *  - The Qusqu branch (trailhead.ts QUSQU_BRANCH): the road runs on south from the trail's start to a second
 *    punku of clean masonry with a carved "QUSQU · HAUKAYPATA" board and a glimpse of the plaza of Qusqu.
 * Within PREFETCH_R of a punku its world's page is prefetched once; within TRAVEL_R, in front of it,
 * "E · Viajar al Antisuyu" / "E · Viajar a Qusqu" travels there (travel.ts `travelTo`, which emits
 * `world:travel` and fades out). Coming back (?from=selva / ?from=cusco) core spawns the traveler at
 * trailhead.ts ARRIVALS, inside the matching band.
 *
 * Collisions: the bands are walkable (discs along the polylines: they run diagonally, so boxes would leave a
 * staircase edge), up to each punku's doorstep; the jambs and the signpost are colliders; animals keep out
 * of the punkus. Draw calls: signpost 2, branches 2 each, punkus 3 (Antisuyu: stones, plants, glimpse;
 * Qusqu: stones, sign, glimpse).
 */
import type * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { creatures } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { vertexToon } from "../merge-colors";
import { offFontsReady, onFontsReady } from "../props";
import { PUNKU, QUSQU_PUNKU } from "../trailhead";
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
  QUSQU_BAND,
  QUSQU_BAND_R,
  QUSQU_FRONT,
  SIGN,
} from "./tinkuy/logic";
import { buildBranch, buildPunku, buildSignpost, type Owned } from "./tinkuy/models";
import { clearGround } from "./wasi/clear-ground";

const PROMPT = { es: "E · Viajar al Antisuyu", en: "E · Travel to the Antisuyu" } as const;
const PROMPT_QUSQU = { es: "E · Viajar a Qusqu", en: "E · Travel to Qusqu" } as const;
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
  const qBranch = buildBranch(env, ground, mat, own, {
    band: QUSQU_BAND,
    r: QUSQU_BAND_R,
    name: "tinkuy-qusqu-branch",
    seed: 73,
  });
  const qPunku = buildPunku(env, ground, mat, own, { at: QUSQU_PUNKU, style: "qusqu", lang });
  env.scene.add(sign, branch, punku.group, qBranch, qPunku.group);
  for (const r of own.redraws) onFontsReady(r);

  for (const c of pathCircles(BAND, BAND_R)) env.addWalkable(c);
  env.addWalkable({ kind: "circle", x: PUNKU_FRONT[0], z: PUNKU_FRONT[1], r: 1.8 });
  for (const c of jambColliders()) env.addCollider(c);
  for (const c of pathCircles(QUSQU_BAND, QUSQU_BAND_R)) env.addWalkable(c);
  env.addWalkable({ kind: "circle", x: QUSQU_FRONT[0], z: QUSQU_FRONT[1], r: 1.8 });
  for (const c of jambColliders(QUSQU_PUNKU)) env.addCollider(c);
  env.addCollider({ kind: "circle", x: SIGN.x, z: SIGN.z, r: SIGN.r });
  const keep = creatures.keepOut(PUNKU.x, PUNKU.z, PUNKU_KEEP_OUT_R);
  const keepQ = creatures.keepOut(QUSQU_PUNKU.x, QUSQU_PUNKU.z, PUNKU_KEEP_OUT_R);
  // The valley's camelids graze by the trail's start: keep the doorstep clear so their "say hi" never takes E.
  const keepQF = creatures.keepOut(QUSQU_FRONT[0], QUSQU_FRONT[1], PUNKU_KEEP_OUT_R + 1.5);
  clearGround(env.scene, clearsGround);

  let near: "selva" | "cusco" | null = null;
  let prefetched = false;
  let prefetchedQ = false;
  let busy = false;

  return {
    update(_dt, avatar, t) {
      const d = Math.hypot(avatar.x - PUNKU.x, avatar.z - PUNKU.z);
      const dq = Math.hypot(avatar.x - QUSQU_PUNKU.x, avatar.z - QUSQU_PUNKU.z);
      if (!prefetched && d < PREFETCH_R) {
        prefetched = true;
        prefetchWorld(lang, "selva");
      }
      if (!prefetchedQ && dq < PREFETCH_R) {
        prefetchedQ = true;
        prefetchWorld(lang, "cusco");
      }
      near = null;
      if (!busy && d < 4 && inTravelRange(avatar.x, avatar.z)) near = "selva";
      else if (!busy && dq < 4 && inTravelRange(avatar.x, avatar.z, QUSQU_PUNKU)) near = "cusco";
      if (d < NEAR) punku.update(t);
      if (dq < NEAR) qPunku.update(t);
    },
    prompt: () => (near === "selva" ? PROMPT[lang] : near === "cusco" ? PROMPT_QUSQU[lang] : null),
    interact() {
      if (!near) return false;
      const to = near;
      busy = true;
      near = null;
      travelTo(lang, "qhapaq", to);
      return true;
    },
    dispose() {
      for (const r of own.redraws) offFontsReady(r);
      for (const root of [sign, branch, punku.group, qBranch, qPunku.group])
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
      qBranch.removeFromParent();
      qPunku.group.removeFromParent();
      creatures.removeKeepOut(keep);
      creatures.removeKeepOut(keepQ);
      creatures.removeKeepOut(keepQF);
    },
  };
};
