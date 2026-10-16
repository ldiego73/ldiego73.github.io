/**
 * Life on Haukaypata: a few people crossing the plaza, the chasqui on the bench of their post, and a herder
 * walking a small train of pack llamas round the plaza.
 *  - Walkers go between the street mouths and the halls' doorways (./life/logic.ts destinations), round the
 *    usnu rather than over it (routeAround), pausing at each stop; they steer round every body through the
 *    shared creatures registry (the traveler included), so they step out of the way. Out by day only: at
 *    dusk they go home (switched off while unseen), at dawn they come back.
 *  - The chasqui sits on the bench of the post (./chasqui.ts builds it) day and night.
 *  - The caravan follows a loop inside the plaza (LOOP), the llamas in file behind the herder, and waits
 *    while the traveler stands in the herder's way. At night it rests at NIGHT_CAMP: the llamas lie down, the
 *    herder sits by them.
 * People are the mountain's instanced bipeds (../../ambient/people: one InstancedMesh per body part for all of
 * them) with Andean palettes; llamas are ./life/llamas.ts. About 15 draw calls in all.
 */
import * as THREE from "three";
import {
  DARKS,
  MAN,
  POLLERAS,
  PONCHOS,
  partSpecs,
  SHADOW_PARTS,
  SKINS,
  WEAVES,
  WOMAN,
} from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, type Palette, paletteMaterial } from "../../ambient/people/rig";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import type { SuyuEnv } from "../../suyu/contract";
import { CHASQUI } from "../plan";
import { LlamaHerd } from "./life/llamas";
import {
  blocked,
  destinations,
  FILE_GAP,
  isDay,
  loopAt,
  loopLength,
  NIGHT_CAMP,
  type P,
  routeAround,
} from "./life/logic";

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Walker {
  p: Person;
  route: P[];
  at: number;
  pause: number;
  speed: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const R = rng(0x11fe);
  const high = env.quality === "high";
  const nWalkers = high ? 8 : 5;
  const nLlamas = high ? 4 : 3;
  const ground = env.suyu.groundAt;

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  // Only the parts these people wear: every part is one InstancedMesh (one draw call per pass).
  const crowd = new Crowd(partSpecs([...MAN, ...WOMAN, "chullo"]), nWalkers + 2, mat, SHADOW_PARTS);
  env.scene.add(crowd.group);

  const person = (man: boolean, seed: number, hat?: "chullo"): Person => {
    const wear = [...(man ? MAN : WOMAN), ...(hat ? [hat] : [])];
    const palette: Palette = man
      ? [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)]
      : [pick(R, SKINS), pick(R, POLLERAS), pick(R, WEAVES), pick(R, PONCHOS)];
    return new Person({
      kind: "cusco-person",
      crowd,
      idx: crowd.alloc(),
      wear,
      palette,
      scale: man ? 0.98 + R() * 0.06 : 0.92 + R() * 0.06,
      radius: 0.34,
      seed,
    });
  };

  // ------------------------------------------------------------------ walkers
  const dests = destinations();
  const walkers: Walker[] = [];
  for (let i = 0; i < nWalkers; i++) {
    const man = i % 2 === 0;
    const p = person(man, 7 + i * 13.7, man && i % 4 === 0 ? "chullo" : undefined);
    const start = dests[(i * 5) % dests.length] as P;
    p.place(start.x, start.z, R() * Math.PI * 2);
    walkers.push({ p, route: [], at: 0, pause: R() * 4, speed: 1.0 + R() * 0.3 });
  }
  const nextRoute = (w: Walker) => {
    let d = pick(R, dests);
    for (let k = 0; k < 4 && Math.hypot(d.x - w.p.x, d.z - w.p.z) < 8; k++) d = pick(R, dests);
    w.route = routeAround({ x: w.p.x, z: w.p.z }, d);
    w.at = 0;
  };

  // ------------------------------------------------------------------ chasqui (seated at the post)
  const chasqui = person(true, 99, "chullo");
  // The bench is at the back of the shelter (local z −d/2 + 0.85; the shelter faces north, so world +z).
  const benchZ = CHASQUI.z + CHASQUI.d / 2 - 0.85;
  chasqui.place(CHASQUI.x + 0.2, benchZ, CHASQUI.yaw);
  chasqui.setActive(true);
  // Its body would push the traveler off the post's front: the bench is inside the shelter's collider.
  chasqui.body.solid = false;

  // ------------------------------------------------------------------ caravan
  const herder = person(true, 51, "chullo");
  const llamas = new LlamaHerd(env, nLlamas);
  env.scene.add(llamas.group);
  const llamaBodies = Array.from({ length: nLlamas }, () => creatures.add("llama", 0.55, { x: 1e5, z: 1e5 }));
  let s = 0;
  let phase = 0;
  let walkAmt = 0;

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - camPos.x, z - camPos.z) > 90) return false;
    seenV.set(x, 0.9, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  let clock = 0;
  const rm = env.reducedMotion;

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(camPos);
      const isDayNow = isDay(env.sky.time());
      const flipped = day !== isDayNow;
      day = isDayNow;

      // Walkers: home at night (switched while unseen, or at once on a clock jump/first frame).
      for (const w of walkers) {
        const p = w.p;
        if (p.active !== isDayNow && (flipped || !seen(p.x, p.z))) {
          p.setActive(isDayNow);
          if (isDayNow) nextRoute(w);
        }
        if (!p.active) continue;
        if (w.pause > 0) {
          w.pause -= dt;
          p.speed *= 0.9;
          p.resolve(0.5);
          if (w.pause <= 0) nextRoute(w);
        } else {
          const t = w.route[w.at];
          if (!t) {
            nextRoute(w);
          } else {
            const d = p.seek(t.x, t.z, w.speed, dt, 3);
            if (d < 0.6) {
              w.at++;
              if (w.at >= w.route.length) w.pause = 2 + R() * 5;
            }
          }
        }
        p.y = ground(p.x, p.z);
        p.rest(clock, rm);
        p.gait(dt, rm);
        p.commit();
      }

      // Chasqui: seated, looking about.
      chasqui.y = 0.45;
      chasqui.rest(clock, rm);
      chasqui.sit(clock, rm, 0.05);
      chasqui.commit();

      // Caravan.
      const L = loopLength();
      if (isDayNow) {
        const head = loopAt(s);
        const wait = blocked(head, avatar);
        const v = wait ? 0 : 0.85;
        s = (s + v * dt) % L;
        walkAmt += ((wait ? 0 : 1) - walkAmt) * (1 - Math.exp(-dt * 4));
        if (!rm) phase += dt * v * 4.2;
        const h = loopAt(s);
        herder.setActive(true);
        herder.place(h.x, h.z, h.yaw);
        herder.speed = v;
        herder.y = ground(h.x, h.z);
        herder.rest(clock, rm);
        herder.gait(dt, rm, 0.6);
        herder.commit();
        for (let i = 0; i < nLlamas; i++) {
          const q = loopAt(s - FILE_GAP * (i + 1));
          llamas.set(i, {
            x: q.x,
            y: ground(q.x, q.z),
            z: q.z,
            yaw: q.yaw,
            phase: phase + i * 1.3,
            walk: walkAmt,
            graze: wait && !rm ? 0.25 + 0.2 * Math.sin(clock * 0.8 + i) : 0,
            lying: false,
          });
          const b = llamaBodies[i];
          if (b) {
            b.x = q.x;
            b.z = q.z;
          }
        }
      } else {
        // Night camp: the herder sits, the llamas lie in a row beside him.
        herder.setActive(true);
        herder.place(NIGHT_CAMP.x, NIGHT_CAMP.z - 1.4, NIGHT_CAMP.yaw);
        herder.y = 0;
        herder.rest(clock, rm);
        herder.sit(clock, rm);
        herder.commit();
        for (let i = 0; i < nLlamas; i++) {
          const x = NIGHT_CAMP.x + (i % 2) * 1.2;
          const z = NIGHT_CAMP.z + i * 1.6;
          llamas.set(i, {
            x,
            y: 0,
            z,
            yaw: NIGHT_CAMP.yaw + (i % 2 ? 0.3 : -0.2),
            phase: 0,
            walk: 0,
            graze: 0,
            lying: true,
          });
          const b = llamaBodies[i];
          if (b) {
            b.x = x;
            b.z = z;
          }
        }
      }
      llamas.commit();
      crowd.flush();
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      chasqui.dispose();
      herder.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      crowd.dispose();
      mat.dispose();
      llamas.dispose();
    },
  };
};
