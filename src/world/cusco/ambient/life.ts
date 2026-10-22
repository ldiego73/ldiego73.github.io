/**
 * Life on Haukaypata: a few people crossing the plaza, the chasqui on the bench of their post, and a herder
 * walking a small train of pack llamas round the plaza.
 *  - Walkers go between the street mouths and the halls' doorways (./life/logic.ts destinations), round the
 *    usnu rather than over it (routeAround), pausing at each stop; they steer round every body through the
 *    shared creatures registry (the traveler included), so they step out of the way. Out by day only: at
 *    dusk they go home (switched off while unseen), at dawn they come back. One woman carries a q'ipi.
 *  - The chasqui sits on the bench of the post (./chasqui.ts builds it) day and night.
 *  - The caravan follows a loop inside the plaza (LOOP), the llamas in file behind the herder (staff in hand),
 *    and waits while the traveler stands in the herder's way: the llamas graze while they wait. At night it
 *    rests at NIGHT_CAMP: the llamas lie down, the herder sits by them.
 * People are the shared characters (../../characters, ../../ambient/people/npc.ts `Npc`): highland campesinos
 * and campesinas (ponchos and chullos or felt hats; jobonas, polleras, llicllas and monteras) with the
 * Andean wardrobes, all in ONE HumanCrowd (two draw calls per pass) with their held props (staff, q'ipi: one
 * instanced draw per kind). The llamas are ONE herd of the shared llama (../../characters/animals: one instanced
 * draw per LOD) wearing their pack saddlebags. Builds are prefetched at load (worker, far LODs first).
 */
import * as THREE from "three";
import { Npc } from "../../ambient/people/npc";
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import type { HumanSpec } from "../../characters/archetype";
import { HumanCrowd } from "../../characters/crowd";
import { prefetchHumans } from "../../characters/pipeline";
import { PEOPLE, wardrobe } from "../../characters/presets";
import { HeldProps } from "../../characters/props";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import type { SuyuEnv } from "../../suyu/contract";
import { liveWind } from "../../wind";
import { CHASQUI } from "../plan";
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
  p: Npc;
  route: P[];
  at: number;
  pause: number;
  speed: number;
}

/** The caravan's pace (u/s) and the bench of the chasqui post (seat height, body units). */
const CARAVAN_V = 0.85;
const BENCH = 0.45;
/** Llama coats of the caravan (../../characters/animals/species: llama variants). */
const COATS = ["white", "brown", "cafe", "black"] as const;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const R = rng(0x11fe);
  const high = env.quality === "high";
  const nWalkers = high ? 8 : 5;
  const nLlamas = high ? 4 : 3;
  const ground = env.suyu.groundAt;

  // Walkers alternate men and women; every fourth man and every other woman wears a felt hat.
  const walkerSpecs: HumanSpec[] = Array.from({ length: nWalkers }, (_, i) =>
    i % 2 === 0
      ? i % 4 === 0
        ? PEOPLE.campesino
        : PEOPLE.campesinoFelt
      : i % 4 === 1
        ? PEOPLE.campesinaFelt
        : PEOPLE.campesina,
  );
  // Start the builds now (worker, far LODs first) so the plaza is peopled by the time the traveler looks.
  prefetchHumans([PEOPLE.campesino, PEOPLE.campesinoFelt, PEOPLE.campesina, PEOPLE.campesinaFelt]);
  prefetchAnimals(["llama"], [2, 1, 0]);

  const crowd = new HumanCrowd({ capacity: nWalkers + 2, name: "cusco-people", lodDist: high ? [9, 26] : [7, 20] });
  env.scene.add(crowd.group);
  const props = new HeldProps(4);
  env.scene.add(props.group);

  const person = (spec: HumanSpec, seed: number): Npc => {
    const man = spec.sex === "m";
    const felt = spec.hat === "felt";
    return new Npc({
      kind: "cusco-person",
      crowd,
      spec,
      palette: man ? wardrobe.andeanMan(R, false, felt) : wardrobe.andeanWoman(R, false, felt),
      scale: man ? 0.97 + R() * 0.06 : 0.96 + R() * 0.06,
      radius: 0.34,
      seed,
    });
  };

  // ------------------------------------------------------------------ walkers
  const dests = destinations();
  const walkers: Walker[] = [];
  for (let i = 0; i < nWalkers; i++) {
    const p = person(walkerSpecs[i] as HumanSpec, 7 + i * 13.7);
    const start = dests[(i * 5) % dests.length] as P;
    p.place(start.x, start.z, R() * Math.PI * 2);
    // One woman takes a q'ipi (a bundle in a woven cloth) across the plaza on her back.
    if (i === 1) {
      p.hold(props, "qipi", pick(R, ["#c4383f", "#3446a6", "#2a9d8f"]));
      p.anim.act("carry-back");
    }
    walkers.push({ p, route: [], at: 0, pause: R() * 4, speed: 1.0 + R() * 0.3 });
  }
  const nextRoute = (w: Walker) => {
    let d = pick(R, dests);
    for (let k = 0; k < 4 && Math.hypot(d.x - w.p.x, d.z - w.p.z) < 8; k++) d = pick(R, dests);
    w.route = routeAround({ x: w.p.x, z: w.p.z }, d);
    w.at = 0;
  };

  // ------------------------------------------------------------------ chasqui (seated at the post)
  const chasqui = person(PEOPLE.campesino, 99);
  // The bench is at the back of the shelter (local z −d/2 + 0.85; the shelter faces north, so world +z).
  const benchZ = CHASQUI.z + CHASQUI.d / 2 - 0.85;
  chasqui.place(CHASQUI.x + 0.2, benchZ, CHASQUI.yaw);
  chasqui.setActive(true);
  chasqui.anim.act("sit-bench", { seat: BENCH, fade: 0 });
  // Its body would push the traveler off the post's front: the bench is inside the shelter's collider.
  chasqui.body.solid = false;

  // ------------------------------------------------------------------ caravan
  const herder = person(PEOPLE.campesinoFelt, 51);
  herder.hold(props, "staff");
  herder.anim.act("herd");
  const llamas = createHerd("llama", {
    max: nLlamas,
    variants: [...COATS],
    features: { pack: true },
    lodScale: high ? 1 : 0.8,
  });
  env.scene.add(llamas.group);
  const llamaIds = Array.from({ length: nLlamas }, (_, i) =>
    llamas.add({ seed: 31 + i * 7, variant: i % COATS.length }),
  );
  const llamaBodies = Array.from({ length: nLlamas }, () => creatures.add("llama", 0.55, { x: 1e5, z: 1e5 }));
  const llamaYaw = new Array<number>(nLlamas).fill(0);
  let s = 0;
  let v = 0;
  let camped: boolean | null = null;

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - camPos.x, z - camPos.z) > 90) return false;
    seenV.set(x, 0.9, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  const rm = env.reducedMotion;
  const frame = { dt: 0, clock: 0, rm, avatar: new THREE.Vector3() };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      frame.dt = dt;
      frame.clock += dt;
      frame.avatar.copy(avatar);
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
        p.commit(frame);
      }

      // Chasqui: seated on the bench, glancing at the traveler when near.
      chasqui.y = 0;
      chasqui.speed = 0;
      chasqui.commit(frame);

      // Caravan.
      const L = loopLength();
      if (camped !== !isDayNow) {
        camped = !isDayNow;
        // Day: the herder walks with the staff; night: sits cross-legged by the resting llamas.
        herder.anim.act(camped ? "sit-cross" : "herd", { fade: flipped ? 0 : 0.6 });
      }
      herder.setActive(true);
      if (isDayNow) {
        const head = loopAt(s);
        const wait = blocked(head, avatar);
        v += ((wait ? 0 : CARAVAN_V) - v) * (1 - Math.exp(-dt * 4));
        s = (s + v * dt) % L;
        const h = loopAt(s);
        herder.place(h.x, h.z, h.yaw);
        herder.speed = v;
        herder.y = ground(h.x, h.z);
        for (let i = 0; i < nLlamas; i++) {
          const q = loopAt(s - FILE_GAP * (i + 1));
          const id = llamaIds[i] as number;
          // Turn rate for the lean into the loop's corners.
          let dy = q.yaw - (llamaYaw[i] as number);
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          llamaYaw[i] = q.yaw;
          const w = liveWind.sample(q.x, q.z);
          llamas.set(id, q.x, ground(q.x, q.z), q.z, q.yaw, {
            speed: v,
            rm,
            turn: dt > 0 ? dy / dt : 0,
            windX: Math.cos(q.yaw) * w.x - Math.sin(q.yaw) * w.z,
          });
          // Waiting: now and then one lowers its head to graze between the flagstones.
          if (wait && !rm && R() < dt * 0.15) llamas.play(id, "graze", 2.5);
          const b = llamaBodies[i];
          if (b) {
            b.x = q.x;
            b.z = q.z;
          }
        }
      } else {
        // Night camp: the herder sits, the llamas lie in a row beside him.
        v = 0;
        herder.place(NIGHT_CAMP.x, NIGHT_CAMP.z - 1.4, NIGHT_CAMP.yaw);
        herder.speed = 0;
        herder.y = 0;
        for (let i = 0; i < nLlamas; i++) {
          const x = NIGHT_CAMP.x + (i % 2) * 1.2;
          const z = NIGHT_CAMP.z + i * 1.6;
          const yaw = NIGHT_CAMP.yaw + (i % 2 ? 0.3 : -0.2);
          llamaYaw[i] = yaw;
          llamas.set(llamaIds[i] as number, x, 0, z, yaw, { speed: 0, mode: "sleep", quiet: true, rm });
          const b = llamaBodies[i];
          if (b) {
            b.x = x;
            b.z = z;
          }
        }
      }
      herder.commit(frame);
      llamas.update(dt, frame.clock, env.camera);
      crowd.update(env.camera);
      props.update();
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      chasqui.dispose();
      herder.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      crowd.dispose();
      props.dispose();
      llamas.group.removeFromParent();
      llamas.dispose();
    },
  };
};
