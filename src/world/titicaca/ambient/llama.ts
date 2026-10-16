/**
 * The traveler's llama on the Collasuyu road: the mountain's saddled llama (../../ambient/mount/llama.ts) on
 * the shared road mount (../../ambient/mount/ride.ts). "E · Montar la llama" rides it (faster along the shore
 * road), "E · Bajar" or Esc dismounts, and it stops where every road mount stops: the raised decks (the Uros
 * boardwalk and islands, both piers, the balsa) and the grounds of the stations off the road (Sillustani,
 * Taquile, Titikala: their keep-out circles), so the stops are visited on foot. It never reaches the lake: the
 * traveler only walks the road, the plazas and the decks, and the decks stop it.
 *
 * Where it waits: a small lay-by on the land side of the road just past the arrival (./llama/logic.ts), a
 * hitching post with a stone trough and a sheaf of ichu, clear of the punku's prompt and of the spawn so the
 * first E after arriving never mixes "ride" with "back to Qusqu". The lay-by is added as a walkable area.
 * Riding back toward the punku, it stops short of the gate's prompt (that prompt would hide behind the llama's).
 * While the balsa owns the traveler (../../suyu/ride.ts) the llama shows no prompt.
 * Draw calls: the llama's own meshes, plus one for the lay-by props.
 */
import * as THREE from "three";
import { saddledLlamaMount } from "../../ambient/mount/llama";
import { mountHome } from "../../ambient/mount/logic";
import { createRideMount } from "../../ambient/mount/ride";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { ride } from "../../suyu/ride";
import { DEFAULT_T } from "../plan";
import { Build } from "./kit/build";
import { LLAMA_COPY, layBy, MOUNT_RANGE } from "./llama/logic";
import { gateFrame, PROMPT_R } from "./punku/logic";

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const S = env.suyu;
  const hw = env.trail.halfWidth;
  const spawn = env.trail.pointAt(DEFAULT_T);
  const gate = gateFrame(S.layout);
  const bay = layBy(env.trail);
  env.addWalkable({ kind: "circle", x: bay.x, z: bay.z, r: bay.r });

  const home = mountHome({
    plaza: bay,
    station: bay,
    walkable: env.walkable,
    heightAt: S.groundAt,
    trailDistance: S.trailDistance,
    halfWidth: hw,
    avoid: [
      [gate.x, gate.z, PROMPT_R + MOUNT_RANGE + 0.5],
      [spawn.x, spawn.z, 2],
      // The hitching post in the middle of the lay-by.
      [bay.x, bay.z, 1.4],
    ],
    roadDir: env.trail.tangentAt(bay.t),
  });

  // ------------------------------------------------------------------ the lay-by: post, trough, ichu
  const y = S.groundAt(bay.x, bay.z);
  const b = new Build();
  const WOOD = "#6b4a2e";
  b.cyl(0.09, 0.11, 1.25, bay.x, y - 0.1, bay.z, WOOD, 6);
  b.cyl(0.13, 0.13, 0.08, bay.x, y + 0.85, bay.z, "#c9b48a", 8);
  // The lead rope, coiled round the post and hanging down its side.
  const rope0 = new THREE.Vector3(bay.x + bay.tx * 0.1, y + 0.82, bay.z + bay.tz * 0.1);
  const rope1 = new THREE.Vector3(bay.x + bay.tx * 0.16, y + 0.35, bay.z + bay.tz * 0.16);
  b.stick(rope0, rope1, 0.018, "#d8c9a3", 4);
  b.cyl(0.115, 0.115, 0.06, bay.x, y + 0.78, bay.z, "#d8c9a3", 8);
  // Stone trough on the far side of the post, and a sheaf of ichu.
  const ax = bay.x - bay.nx * 1.0;
  const az = bay.z - bay.nz * 1.0;
  const ay = S.groundAt(ax, az);
  const yaw = Math.atan2(bay.nx, bay.nz);
  b.box(1.1, 0.34, 0.55, ax, ay - 0.04, az, "#8f877b", yaw);
  b.box(0.9, 0.04, 0.38, ax, ay + 0.27, az, "#5b8fb0", yaw);
  const ix = bay.x + bay.tx * 1.1 - bay.nx * 0.4;
  const iz = bay.z + bay.tz * 1.1 - bay.nz * 0.4;
  const iy = S.groundAt(ix, iz);
  // Stalks leaning out from a tied waist, like a sheaf.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    b.cyl(0.0, 0.05, 0.6 + (k % 3) * 0.08, ix, iy - 0.05, iz, "#cdb06a", 4, Math.cos(a) * 0.25, Math.sin(a) * 0.25);
  }
  b.cyl(0.07, 0.07, 0.05, ix, iy + 0.22, iz, "#8a6a3a", 6);
  const geo = b.build();
  const mat = vertexToon();
  const props = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), mat);
  props.name = "titicaca-llama:post";
  props.castShadow = true;
  env.scene.add(props);
  env.addCollider({ kind: "circle", x: bay.x, z: bay.z, r: 0.3 });
  env.addCollider({ kind: "circle", x: ax, z: az, r: 0.6 });

  const mount = createRideMount(env, {
    name: "ride-llama",
    model: saddledLlamaMount(env),
    home,
    prompts: { mount: LLAMA_COPY.mount },
    groundAt: S.groundAt,
    layoutGroundAt: S.layout.groundAt,
    isWater: S.isWater,
    trailDistance: S.trailDistance,
    // The punku's prompt comes later in the ambient order: stop short of it, far enough that the llama left
    // there never shows its own prompt inside the punku's.
    stopAt: (_q, x, z) => Math.hypot(x - gate.x, z - gate.z) < PROMPT_R + MOUNT_RANGE + 0.5,
    busy: () => ride.active,
  });

  return {
    ...mount,
    dispose() {
      mount.dispose?.();
      props.removeFromParent();
      geo?.dispose();
      mat.dispose();
    },
  };
};
