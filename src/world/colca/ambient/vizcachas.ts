/**
 * Vizcachas: the long-tailed, rabbit-eared rodents of Andean rock, sunning on boulders at the foot of the
 * colcas cliff and on the rocks beside the Cruz del Cóndor. They sit up, twitch and look about; when the
 * traveler comes within SPOOK_R one hops off its rock and hides, and comes back a while later. Out by day.
 *
 * Passport: within 12 u of a vizcacha in view stamps `colca:fauna:vizcacha`. Rendering: the shared animals'
 * vizcacha as one herd (one instanced draw per LOD; sitting up, the idles look about, groom and twitch) and
 * one mesh for their boulders.
 */
import * as THREE from "three";
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import type { CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CRAG, CRAG_LINE_Z } from "../plan";
import { seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const SPOOK_R = 5.5;
/** The hop off the rock: seconds, distance and height of the arc. */
const HOP = { t: 0.5, d: 2.5, h: 0.8 } as const;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lineZ = CRAG_LINE_Z;
  const C = layout.cruz;
  const cs = Math.cos(C.yaw);
  const sn = Math.sin(C.yaw);
  const spots: Array<{ x: number; z: number; r: number }> = [
    ...[-19, -14.5, -8.5, 9.5, 15, 20].map((dx, i) => ({
      x: CRAG.x + dx,
      z: lineZ + 1.6 + (i % 2) * 0.6,
      r: 0.7 + (i % 3) * 0.2,
    })),
    // Beside the Cruz del Cóndor platform, on the rim rocks (platform frame: x across, +z to the canyon).
    ...(
      [
        [-11.5, 1],
        [11.8, -1.5],
        [-13, -6],
      ] as const
    ).map(([lx, lz]) => ({ x: C.x + lx * cs + lz * sn, z: C.z - lx * sn + lz * cs, r: 0.85 })),
  ];
  let seed = 0x7ca;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rk = new VKit();
  const tops = spots.map((s) => {
    const y = env.heightAt(s.x, s.z);
    rk.rock(s.r * 1.4, s.x, y - 0.25, s.z, "#958271", rand, 0.75);
    return y - 0.25 + s.r * 1.4 * 0.35 + s.r * 1.4 * 0.62;
  });
  const rockGeo = rk.build();
  const rockMat = vertexToon();
  const rocks = new THREE.Mesh(rockGeo, rockMat);
  rocks.name = "colca-vizcachas:rocks";
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  env.scene.add(rocks);

  prefetchAnimals(["vizcacha"]);
  const herd = createHerd("vizcacha", { max: spots.length });
  herd.group.name = "colca-vizcachas";
  env.scene.add(herd.group);
  const ids = spots.map((_, i) => herd.add({ seed: 5 + i * 3 }));
  const stamp = faunaStamp("vizcacha");
  const state = spots.map((_, i) => ({
    away: 0,
    yaw: rand() * Math.PI * 2,
    look: rand() * 9,
    head: 0,
    hop: 0,
    seed: i * 1.7,
  }));
  let t = 0;
  return {
    update(dt, avatar, clock) {
      t += dt;
      const time = env.sky.time();
      const out = time > 0.28 && time < 0.74;
      spots.forEach((sp, i) => {
        const st = state[i] as (typeof state)[number];
        const near = seenWithin(sp, avatar, SPOOK_R);
        if (near && st.away <= 0) {
          st.away = 12 + rand() * 8;
          st.hop = 0.5;
        }
        if (st.away > 0 && !near) st.away -= dt;
        if (st.hop > 0) st.hop -= dt;
        const visible = out && (st.away <= 0 || st.hop > 0);
        const id = ids[i] as number;
        if (!visible) {
          herd.hide(id);
          return;
        }
        if (seenWithin(sp, avatar, 12)) stamp();
        // Look about in quick turns; hop off (up and away) when spooked.
        if (!env.reducedMotion && t > st.look) {
          st.look = t + 1.5 + rand() * 4;
          // Mostly a turn of the head; now and then the whole animal shifts round on its rock.
          st.head = (rand() - 0.5) * 1.4;
          if (rand() < 0.3) st.yaw += (rand() - 0.5) * 1.2;
        }
        // Hopping off: an arc away from the traveler, down behind the rock (then hidden until it comes back).
        const k = st.hop > 0 ? 1 - st.hop / HOP.t : 0;
        const dx = sp.x - avatar.x;
        const dz = sp.z - avatar.z;
        const dd = Math.hypot(dx, dz) || 1;
        const top = tops[i] as number;
        const x = sp.x + (dx / dd) * k * HOP.d;
        const z = sp.z + (dz / dd) * k * HOP.d;
        const y = top + (env.heightAt(x, z) - top) * k * k + Math.sin(k * Math.PI) * HOP.h;
        herd.set(id, x, y, z, st.hop > 0 ? Math.atan2(dx, dz) : st.yaw, {
          speed: st.hop > 0 ? HOP.d / HOP.t : 0,
          rm: env.reducedMotion,
          mode: st.hop > 0 ? "auto" : "sit",
          look: st.hop > 0 || env.reducedMotion ? undefined : st.head,
        });
      });
      herd.update(dt, clock, env.camera);
    },
    dispose() {
      herd.dispose();
      rocks.removeFromParent();
      rockGeo.dispose();
      rockMat.dispose();
    },
  };
};
