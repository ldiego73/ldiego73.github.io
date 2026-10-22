/**
 * An Andean fox (Lycalopex culpaeus, the atoq) out at dusk and at night: it trots a loop on the rim plateau
 * north of the road between the colcas and the descent to the pampa, nose down. When the traveler is within
 * WATCH_R it stops and watches them, ears up; closer than FLEE_R it lopes off along its loop. By day it is
 * not out.
 *
 * Passport: within 20 u of it stamps `colca:fauna:zorro`. Rendering: the shared animals' fox (the culpeo: a
 * grizzled back, rufous head and legs, a bushy black-tipped tail) as a herd of one, one instanced draw; its
 * gait follows the real speed (a trot on its loop, a lope when it flees). Its body is in creatures (solid).
 */
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import type { SuyuEnv } from "../../suyu/contract";
import { roadSide } from "../plan";
import { foxHours, seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const WATCH_R = 22;
const FLEE_R = 8;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  // A loop on the plateau north of the road, west of the colcas.
  const loop = [0.3, 0.33, 0.36, 0.39, 0.36, 0.33].map((t, i) => roadSide(t, 1, i < 3 ? 22 : 38));
  prefetchAnimals(["fox"]);
  const herd = createHerd("fox", { max: 1 });
  herd.group.name = "colca-zorro";
  env.scene.add(herd.group);
  const id = herd.add({ seed: 9 });
  const bodyC = creatures.add("zorro", 0.4, { x: 1e5, z: 1e5 });
  const stamp = faunaStamp("zorro");
  const start = loop[0] as { x: number; z: number };
  let x = start.x;
  let z = start.z;
  let yaw = 0;
  let to = 1;
  let speed = 0;
  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      if (!foxHours(env.sky.time())) {
        herd.hide(id);
        herd.update(dt, t, env.camera);
        bodyC.x = 1e5;
        bodyC.z = 1e5;
        return;
      }
      const da = Math.hypot(avatar.x - x, avatar.z - z);
      if (seenWithin({ x, z }, avatar, 20)) stamp();
      const target = loop[to] as { x: number; z: number };
      const dx = target.x - x;
      const dz = target.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 1) to = (to + 1) % loop.length;
      let want = 1.6;
      let face = Math.atan2(dx, dz);
      if (da < FLEE_R) want = 5.2;
      else if (da < WATCH_R) {
        want = 0;
        face = Math.atan2(avatar.x - x, avatar.z - z);
      }
      speed += (want - speed) * Math.min(1, dt * 3);
      if (speed > 0.05) {
        x += (dx / (d || 1)) * speed * dt;
        z += (dz / (d || 1)) * speed * dt;
      }
      let dy = face - yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * Math.min(1, dt * 4);
      bodyC.x = x;
      bodyC.z = z;
      // Watching: ears up, the head on the traveler (the body has already turned to face them).
      const rel = Math.atan2(avatar.x - x, avatar.z - z) - yaw;
      const look = want === 0 ? Math.atan2(Math.sin(rel), Math.cos(rel)) : undefined;
      herd.set(id, x, env.suyu.groundAt(x, z), z, yaw, { speed, rm: env.reducedMotion, look });
      herd.update(dt, t, env.camera);
    },
    dispose() {
      creatures.remove(bodyC);
      herd.dispose();
    },
  };
};
