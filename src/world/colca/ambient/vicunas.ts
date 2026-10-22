/**
 * Vicuñas on the puna: two small herds grazing the rim plateau, one between the village and the colcas north
 * of the road, one on the slope the road climbs back to the Cruz del Cóndor. Each animal wanders round its
 * herd's ground and grazes when it stops; if the traveler comes within FLEE_R the whole herd trots off
 * together (./wild/logic.ts fleeFrom), staying on its ground, and settles again. They lie down at night.
 *
 * Passport: within 26 u of a vicuña stamps `colca:fauna:vicuna`. Rendering: the shared animals' vicuña
 * (cinnamon back, white belly and chest bib) as one herd, one instanced draw per LOD; their gait follows the
 * real speed (walk, then the trot and gallop of a flight). Bodies in creatures (solid).
 */
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import type { SuyuEnv } from "../../suyu/contract";
import { roadSide, STATION_T } from "../plan";
import { fleeFrom, seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const FLEE_R = 11;
const RANGE = 26;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const high = env.quality === "high";
  const per = high ? 6 : 4;
  const homes = [roadSide(STATION_T.pueblo + 0.07, 1, 52), roadSide(0.9, -1, 46)];
  const n = per * homes.length;
  prefetchAnimals(["vicuna"]);
  const herd = createHerd("vicuna", { max: n });
  herd.group.name = "colca-vicunas";
  env.scene.add(herd.group);
  const stamp = faunaStamp("vicuna");
  let seed = 0x71c;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const ground = env.suyu.groundAt;
  const animals = Array.from({ length: n }, (_, i) => {
    const home = homes[Math.floor(i / per)] as { x: number; z: number };
    const a = rand() * Math.PI * 2;
    const r = rand() * 10;
    const x = home.x + Math.cos(a) * r;
    const z = home.z + Math.sin(a) * r;
    return {
      home,
      x,
      z,
      yaw: rand() * Math.PI * 2,
      tx: x,
      tz: z,
      wait: rand() * 6,
      speed: 0,
      body: creatures.add("vicuna", 0.5, { x, z }),
      id: herd.add({ seed: 3 + i * 7 }),
    };
  });
  const flee = homes.map(() => 0);
  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      const night = env.sky.isNight();
      homes.forEach((h, k) => {
        if ((flee[k] as number) > 0) flee[k] = (flee[k] as number) - dt;
        const close = animals.some((a) => a.home === h && seenWithin(a, avatar, FLEE_R));
        if (close && (flee[k] as number) <= 0) {
          flee[k] = 4;
          for (const a of animals)
            if (a.home === h) {
              const to = fleeFrom(a, avatar, h, RANGE, 18);
              a.tx = to.x + (rand() - 0.5) * 3;
              a.tz = to.z + (rand() - 0.5) * 3;
              a.wait = 0;
            }
        }
      });
      for (let i = 0; i < n; i++) {
        const a = animals[i] as (typeof animals)[number];
        const k = homes.indexOf(a.home);
        const running = (flee[k] as number) > 0;
        if (seenWithin(a, avatar, 26)) stamp();
        const dx = a.tx - a.x;
        const dz = a.tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          a.wait -= dt;
          if (a.wait <= 0 && !night) {
            const ang = rand() * Math.PI * 2;
            const r = rand() * RANGE * 0.6;
            a.tx = a.home.x + Math.cos(ang) * r;
            a.tz = a.home.z + Math.sin(ang) * r;
            a.wait = 4 + rand() * 9;
          }
        }
        const want = d < 0.4 ? 0 : running ? 5.5 : 1.1;
        a.speed += (want - a.speed) * Math.min(1, dt * 3);
        if (d > 0.05 && a.speed > 0.02) {
          const step = Math.min(d, a.speed * dt);
          a.x += (dx / d) * step;
          a.z += (dz / d) * step;
          let dy = Math.atan2(dx, dz) - a.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          a.yaw += dy * Math.min(1, dt * 5);
        }
        a.body.x = a.x;
        a.body.z = a.z;
        // Lying down (kush) at night once settled; sleep allowed then, nobody near.
        const lying = night && a.speed < 0.2;
        herd.set(a.id, a.x, ground(a.x, a.z), a.z, a.yaw, {
          speed: a.speed,
          rm: env.reducedMotion,
          mode: lying ? "sit" : "auto",
          quiet: lying && !seenWithin(a, avatar, FLEE_R),
        });
      }
      herd.update(dt, t, env.camera);
    },
    dispose() {
      for (const a of animals) creatures.remove(a.body);
      herd.dispose();
    },
  };
};
