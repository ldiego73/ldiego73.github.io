/**
 * People of the Colca valley: villagers in the plaza of the Collagua village, children playing there, and a
 * farmer walking a train of pack llamas along the rim road between the village and the colcas.
 *  - Villagers: women in the valley's embroidered dress (./gente/dress.ts: the bordado pollera, and the white
 *    embroidered Cabana hat or the tall white Collagua hat) and men in felt hats and ponchos, walking between
 *    the church door, the fountain, the house doors and the plaza's mouth (./pueblo/logic.ts STOPS), pausing at
 *    each (hands clasped or behind the back, or a few words). Out by day; they go home at dusk (switched while
 *    unseen, or at once on a clock jump).
 *  - Children: a few play tag in the plaza by day; when the traveler comes very close they scamper off a few
 *    steps, giggling, and look back.
 *  - Farmer and caravan: he leads three pack llamas in file along the road between the village and the
 *    colcas and back, staff in hand, waiting while the traveler stands in his way; at night they rest by the
 *    village, the llamas lying down (kush) and the farmer sitting on the ground beside them.
 *
 * Rendering: the shared characters (../../characters): everyone is a member of ONE crowd (skinned on the GPU,
 * LOD by distance, two draw calls for all bodies and cloth) driven by the human animation controller
 * (../../ambient/people/npc.ts: the walk cycle from the real speed, actions, a glance at the traveler); the
 * farmer's staff is a held prop (one instanced draw); the llamas are one herd (../../characters/animals/crowd.ts,
 * one instanced draw per LOD) driven by the caravan's own walk. About 5 draw calls in all. Everyone steers
 * round every body in the creatures registry (the traveler included).
 */
import * as THREE from "three";
import { Npc } from "../../ambient/people/npc";
import { prefetchAnimals } from "../../characters/animals/assets";
import { HumanCrowd } from "../../characters/crowd";
import { prefetchHumans } from "../../characters/pipeline";
import type { Action } from "../../characters/poses";
import { HeldProps } from "../../characters/props";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { STATION_T } from "../plan";
import { COLCA, rng, valleyMan, valleyWoman } from "./gente/dress";
import { STOPS, toWorld } from "./pueblo/logic";
import { packLlamas } from "./wild/herds";

/** By day (sky time; 0.25 sunrise, 0.75 sunset). */
const isDay = (t: number) => t > 0.27 && t < 0.73;
/** Spacing of the llamas behind the farmer (world units along the road). */
const FILE_GAP = 2.3;
/** What villagers do while they pause at a stop. */
const PAUSES: Action[] = ["hands-clasp", "hands-back", "talk", "hands-clasp"];

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const R = rng(0xc0ca);
  const high = env.quality === "high";
  const nVillagers = high ? 6 : 4;
  const nKids = high ? 3 : 2;
  const nLlamas = 3;
  const ground = env.suyu.groundAt;
  const rm = env.reducedMotion;

  prefetchHumans([COLCA.cabana, COLCA.collagua, COLCA.man, COLCA.boy, COLCA.girl]);
  prefetchAnimals(["llama"]);
  const crowd = new HumanCrowd({ capacity: nVillagers + nKids + 1, name: "colca-gente:crowd" });
  env.scene.add(crowd.group);
  const props = new HeldProps(2);
  props.rm = env.reducedMotion;
  env.scene.add(props.group);

  // ------------------------------------------------------------------ village frame
  const pl = layout.plaza("pueblo");
  const road = layout.trail.pointAt(layout.trail.nearestT(pl.x, pl.z));
  const frame = { x: pl.x, z: pl.z, yaw: Math.atan2(road.x - pl.x, road.z - pl.z) };
  const stops = STOPS.map(([x, z]) => toWorld(frame, x, z));

  interface Walker {
    p: Npc;
    to: number;
    pause: number;
    speed: number;
    idle: Action;
  }
  const walkers: Walker[] = [];
  for (let i = 0; i < nVillagers; i++) {
    const man = i % 3 === 2;
    const p = new Npc({
      kind: "colca-person",
      crowd,
      spec: man ? COLCA.man : i % 2 ? COLCA.collagua : COLCA.cabana,
      palette: man ? valleyMan(R) : valleyWoman(R),
      scale: man ? 0.98 + R() * 0.06 : 0.95 + R() * 0.06,
      radius: 0.34,
      seed: 3 + i * 11.7,
    });
    const s = stops[(i * 3) % stops.length] as { x: number; z: number };
    p.place(s.x, s.z, R() * Math.PI * 2);
    walkers.push({ p, to: (i * 3 + 1) % stops.length, pause: R() * 5, speed: 0.95 + R() * 0.3, idle: "hands-clasp" });
  }

  // ------------------------------------------------------------------ children
  const kids: Npc[] = [];
  for (let i = 0; i < nKids; i++) {
    const boy = i % 2 === 1;
    const p = new Npc({
      kind: "child",
      crowd,
      spec: boy ? COLCA.boy : COLCA.girl,
      palette: boy ? valleyMan(R) : valleyWoman(R),
      scale: 0.92 + R() * 0.12,
      radius: 0.26,
      seed: 40 + i * 7.3,
    });
    p.lookRange = 0;
    const a = (i / nKids) * Math.PI * 2;
    const c = toWorld(frame, Math.cos(a) * 5, 6 + Math.sin(a) * 3);
    p.place(c.x, c.z);
    kids.push(p);
  }
  const kidCenter = toWorld(frame, 0, 6.5);
  let it = 0;
  let tagClock = 0;

  // ------------------------------------------------------------------ farmer + caravan
  const farmer = new Npc({
    kind: "colca-person",
    crowd,
    spec: COLCA.man,
    palette: valleyMan(R),
    scale: 1,
    radius: 0.34,
    seed: 77,
  });
  farmer.hold(props, "staff");
  const herd = packLlamas("colca-caravan", nLlamas);
  env.scene.add(herd.group);
  const llamaIds = Array.from({ length: nLlamas }, (_, i) => herd.add({ seed: 11 + i * 5, variant: i }));
  const llamaBodies = Array.from({ length: nLlamas }, () => creatures.add("llama", 0.55, { x: 1e5, z: 1e5 }));
  const L = layout.trail.length;
  const tA = STATION_T.pueblo + 18 / L;
  const tB = STATION_T.colcas - 22 / L;
  let ft = tA + (tB - tA) * 0.3;
  let fdir = 1;
  let v = 0;
  let wait = 0;
  const camp = toWorld(frame, -17, 16);
  const side = (t: number, off: number) => {
    const p = layout.trail.pointAt(t);
    const g = layout.trail.tangentAt(t);
    return { x: p.x - g.z * off, z: p.z + g.x * off, yaw: Math.atan2(g.x, g.z) };
  };

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - camPos.x, z - camPos.z) > 90) return false;
    seenV.set(x, 0.9, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  const f = { dt: 0, clock: 0, rm, avatar: new THREE.Vector3() };
  /** Within this distance of the camera people are animated (the crowd stops drawing them at 160 u). */
  const near = (x: number, z: number) => Math.hypot(x - camPos.x, z - camPos.z) < 170;

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      f.dt = dt;
      f.clock += dt;
      f.avatar.copy(avatar);
      env.camera.getWorldPosition(camPos);
      const dayNow = isDay(env.sky.time());
      const flipped = day !== dayNow;
      day = dayNow;
      const villageNear = near(pl.x, pl.z);

      for (const w of walkers) {
        const p = w.p;
        if (p.active !== dayNow && (flipped || !seen(p.x, p.z))) p.setActive(dayNow);
        if (!p.active || !villageNear) continue;
        if (w.pause > 0) {
          w.pause -= dt;
          p.speed *= 0.9;
          p.resolve(0.5);
          p.anim.act(w.idle, { fade: 0.5 });
        } else {
          if (p.anim.action !== "none") p.anim.act("none", { fade: 0.4 });
          const s = stops[w.to] as { x: number; z: number };
          if (p.seek(s.x, s.z, w.speed, dt, 3) < 0.6) {
            w.pause = 3 + R() * 6;
            w.to = (w.to + 1 + Math.floor(R() * (stops.length - 1))) % stops.length;
            w.idle = PAUSES[Math.floor(R() * PAUSES.length)] as Action;
          }
        }
        p.y = ground(p.x, p.z);
        p.commit(f);
      }

      // Children: tag round the plaza's south half.
      tagClock += dt;
      if (tagClock > 7) {
        tagClock = 0;
        it = (it + 1) % kids.length;
      }
      kids.forEach((k, i) => {
        if (k.active !== dayNow && (flipped || !seen(k.x, k.z))) k.setActive(dayNow);
        if (!k.active || !villageNear) return;
        const da = Math.hypot(k.x - avatar.x, k.z - avatar.z);
        let tx: number;
        let tz: number;
        let sp: number;
        const fleeing = da < 3;
        if (fleeing) {
          // Scamper away from the traveler, staying in the plaza.
          tx = k.x + ((k.x - avatar.x) / (da || 1)) * 3;
          tz = k.z + ((k.z - avatar.z) / (da || 1)) * 3;
          sp = 2.8;
        } else if (i === it) {
          const o = kids[(i + 1) % kids.length] as Npc;
          tx = o.x;
          tz = o.z;
          sp = 2.3;
        } else {
          const a = f.clock * 0.6 + i * 2.1;
          tx = kidCenter.x + Math.cos(a) * 4.5;
          tz = kidCenter.z + Math.sin(a * 1.3) * 3.5;
          sp = 1.9;
        }
        const dc = Math.hypot(tx - pl.x, tz - pl.z);
        if (dc > pl.r - 1.5) {
          tx = pl.x + ((tx - pl.x) / dc) * (pl.r - 1.5);
          tz = pl.z + ((tz - pl.z) / dc) * (pl.r - 1.5);
        }
        k.seek(tx, tz, sp, dt, 6);
        k.y = ground(k.x, k.z);
        // A giggle over the shoulder while scampering off, looking back at the traveler.
        k.lookRange = fleeing ? 6 : 0;
        k.anim.act(fleeing ? "giggle" : "none", { fade: 0.25, side: i % 2 ? 1 : -1 });
        k.commit(f);
      });

      // Caravan along the road (on the right of the way it walks), resting by the village at night.
      const caravanNear = near(farmer.x, farmer.z);
      farmer.setActive(true);
      if (dayNow) {
        const head = side(ft, fdir * 1.3);
        const blocked =
          Math.hypot(
            head.x + Math.sin(head.yaw) * fdir * 1.6 - avatar.x,
            head.z + Math.cos(head.yaw) * fdir * 1.6 - avatar.z,
          ) < 2;
        wait = blocked ? 0.6 : Math.max(0, wait - dt);
        v = wait > 0 ? 0 : 0.85;
        ft += (fdir * v * dt) / L;
        if (ft > tB) {
          ft = tB;
          fdir = -1;
        } else if (ft < tA) {
          ft = tA;
          fdir = 1;
        }
        const h = side(ft, fdir * 1.3);
        farmer.place(h.x, h.z, fdir > 0 ? h.yaw : h.yaw + Math.PI);
        farmer.speed = v;
        farmer.y = ground(h.x, h.z);
        farmer.anim.act("herd", { fade: 0.4 });
        for (let i = 0; i < nLlamas; i++) {
          const q = side(ft - (fdir * FILE_GAP * (i + 1)) / L, fdir * 1.3);
          const b = llamaBodies[i];
          if (b) {
            b.x = q.x;
            b.z = q.z;
          }
          const id = llamaIds[i] as number;
          if (!caravanNear) herd.hide(id);
          else herd.set(id, q.x, ground(q.x, q.z), q.z, fdir > 0 ? q.yaw : q.yaw + Math.PI, { speed: v, rm });
        }
      } else {
        farmer.place(camp.x, camp.z - 1.4, frame.yaw);
        farmer.speed = 0;
        farmer.y = ground(camp.x, camp.z - 1.4);
        farmer.anim.act("sit-ground", { fade: 0.6 });
        for (let i = 0; i < nLlamas; i++) {
          const x = camp.x + (i - 1) * 1.6;
          const z = camp.z + 0.8;
          const b = llamaBodies[i];
          if (b) {
            b.x = x;
            b.z = z;
          }
          const id = llamaIds[i] as number;
          if (!caravanNear) herd.hide(id);
          else
            herd.set(id, x, ground(x, z), z, frame.yaw + (i % 2 ? 0.3 : -0.2), {
              speed: 0,
              mode: "sit",
              rm,
              quiet: true,
            });
        }
      }
      if (caravanNear) farmer.commit(f);
      herd.update(dt, t, env.camera);
      crowd.update(env.camera);
      props.update(t);
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      for (const k of kids) k.dispose();
      farmer.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      crowd.dispose();
      props.dispose();
      herd.dispose();
    },
  };
};
