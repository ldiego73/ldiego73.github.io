/**
 * People of the Colca valley: villagers in the plaza of the Collagua village, children playing there, and a
 * farmer walking a train of pack llamas along the rim road between the village and the colcas.
 *  - Villagers: women in the valley's embroidered dress (./gente/garments.ts: the bordado skirt, and the
 *    white embroidered Cabana hat or the tall white Collagua hat) and men in felt hats, walking between the
 *    church door, the fountain, the house doors and the plaza's mouth (./pueblo/logic.ts STOPS), pausing at
 *    each. Out by day; they go home at dusk (switched while unseen, or at once on a clock jump).
 *  - Children: a few play tag in the plaza by day; when the traveler comes very close they scamper off a few
 *    steps and look back.
 *  - Farmer and caravan: he leads three pack llamas in file along the road between the village and the
 *    colcas and back, waiting while the traveler stands in his way; at night they rest by the village, the
 *    llamas lying down and the farmer sitting beside them.
 * People are the mountain's instanced bipeds (../../ambient/people: one InstancedMesh per part) plus the Colca
 * garments; llamas are ./wild/camelids.ts. About 16 draw calls in all. Everyone steers round every body in the
 * creatures registry (the traveler included).
 */
import * as THREE from "three";
import { DARKS, MAN, PONCHOS, partSpecs, SHADOW_PARTS, SKINS, WEAVES, WOMAN } from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, type Palette, paletteMaterial } from "../../ambient/people/rig";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { LLAMA } from "../../fauna-models";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { STATION_T } from "../plan";
import { BORDADOS, type ColcaPart, colcaPartSpecs, RIBBONS, wear } from "./gente/garments";
import { STOPS, toWorld } from "./pueblo/logic";
import { CamelidHerd } from "./wild/camelids";

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

/** By day (sky time; 0.25 sunrise, 0.75 sunset). */
const isDay = (t: number) => t > 0.27 && t < 0.73;
const COATS = ["#fbf6ee", "#a8724a", "#5a463a", "#e0bf92"];
const PACKS = ["#c4383f", "#2a9d8f", "#dda63c"];
/** Spacing of the llamas behind the farmer (world units along the road). */
const FILE_GAP = 2.3;

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

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const specs = [...partSpecs([...MAN, ...WOMAN, "sombrero", "chullo"]), ...colcaPartSpecs()];
  const shadows = new Set([...SHADOW_PARTS, "colca:bordado"]);
  const crowd = new Crowd(specs, nVillagers + nKids + 1, mat, shadows);
  env.scene.add(crowd.group);

  const person = (o: { man: boolean; seed: number; hat: ColcaPart; kid?: boolean }): Person => {
    const parts: ColcaPart[] = o.man ? [...MAN, o.hat] : [...WOMAN, "colca:bordado", o.hat];
    const palette: Palette = o.man
      ? [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)]
      : [pick(R, SKINS), pick(R, BORDADOS), pick(R, RIBBONS), pick(R, BORDADOS)];
    return new Person({
      kind: o.kid ? "child" : "colca-person",
      crowd,
      idx: crowd.alloc(),
      wear: wear(parts),
      palette,
      scale: o.kid ? 0.62 + R() * 0.06 : o.man ? 0.98 + R() * 0.06 : 0.92 + R() * 0.06,
      headScale: o.kid ? 1.3 : 1,
      radius: o.kid ? 0.26 : 0.34,
      seed: o.seed,
    });
  };

  // ------------------------------------------------------------------ village frame
  const pl = layout.plaza("pueblo");
  const road = layout.trail.pointAt(layout.trail.nearestT(pl.x, pl.z));
  const frame = { x: pl.x, z: pl.z, yaw: Math.atan2(road.x - pl.x, road.z - pl.z) };
  const stops = STOPS.map(([x, z]) => toWorld(frame, x, z));

  interface Walker {
    p: Person;
    to: number;
    pause: number;
    speed: number;
  }
  const walkers: Walker[] = [];
  for (let i = 0; i < nVillagers; i++) {
    const man = i % 3 === 2;
    const hat: ColcaPart = man ? "sombrero" : i % 2 ? "colca:collagua" : "colca:cabana";
    const p = person({ man, seed: 3 + i * 11.7, hat });
    const s = stops[(i * 3) % stops.length] as { x: number; z: number };
    p.place(s.x, s.z, R() * Math.PI * 2);
    walkers.push({ p, to: (i * 3 + 1) % stops.length, pause: R() * 5, speed: 0.95 + R() * 0.3 });
  }

  // ------------------------------------------------------------------ children
  const kids: Person[] = [];
  for (let i = 0; i < nKids; i++) {
    const boy = i % 2 === 1;
    const p = person({ man: boy, seed: 40 + i * 7.3, hat: boy ? "chullo" : "colca:cabana", kid: true });
    const a = (i / nKids) * Math.PI * 2;
    const c = toWorld(frame, Math.cos(a) * 5, 6 + Math.sin(a) * 3);
    p.place(c.x, c.z);
    kids.push(p);
  }
  const kidCenter = toWorld(frame, 0, 6.5);
  let it = 0;
  let tagClock = 0;

  // ------------------------------------------------------------------ farmer + caravan
  const farmer = person({ man: true, seed: 77, hat: "sombrero" });
  const herd = new CamelidHerd("colca-caravan", LLAMA, nLlamas, COATS, PACKS);
  env.scene.add(herd.group);
  const llamaBodies = Array.from({ length: nLlamas }, () => creatures.add("llama", 0.55, { x: 1e5, z: 1e5 }));
  const L = layout.trail.length;
  const tA = STATION_T.pueblo + 18 / L;
  const tB = STATION_T.colcas - 22 / L;
  let ft = tA + (tB - tA) * 0.3;
  let fdir = 1;
  let phase = 0;
  let walkAmt = 0;
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
  let clock = 0;
  const near = (x: number, z: number) => Math.hypot(x - camPos.x, z - camPos.z) < 170;

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(camPos);
      const dayNow = isDay(env.sky.time());
      const flipped = day !== dayNow;
      day = dayNow;
      const villageNear = near(pl.x, pl.z);

      for (const w of walkers) {
        const p = w.p;
        if (p.active !== dayNow && (flipped || !seen(p.x, p.z))) p.setActive(dayNow);
        if (!p.active) continue;
        if (!villageNear) {
          p.hide();
          continue;
        }
        if (w.pause > 0) {
          w.pause -= dt;
          p.speed *= 0.9;
          p.resolve(0.5);
        } else {
          const s = stops[w.to] as { x: number; z: number };
          if (p.seek(s.x, s.z, w.speed, dt, 3) < 0.6) {
            w.pause = 3 + R() * 6;
            w.to = (w.to + 1 + Math.floor(R() * (stops.length - 1))) % stops.length;
          }
        }
        p.y = ground(p.x, p.z);
        p.rest(clock, rm);
        p.gait(dt, rm);
        p.commit();
      }

      // Children: tag round the plaza's south half.
      tagClock += dt;
      if (tagClock > 7) {
        tagClock = 0;
        it = (it + 1) % kids.length;
      }
      kids.forEach((k, i) => {
        if (k.active !== dayNow && (flipped || !seen(k.x, k.z))) k.setActive(dayNow);
        if (!k.active) return;
        if (!villageNear) {
          k.hide();
          return;
        }
        const da = Math.hypot(k.x - avatar.x, k.z - avatar.z);
        let tx: number;
        let tz: number;
        let sp: number;
        if (da < 3) {
          // Scamper away from the traveler, staying in the plaza.
          tx = k.x + ((k.x - avatar.x) / (da || 1)) * 3;
          tz = k.z + ((k.z - avatar.z) / (da || 1)) * 3;
          sp = 2.8;
        } else if (i === it) {
          const o = kids[(i + 1) % kids.length] as Person;
          tx = o.x;
          tz = o.z;
          sp = 2.3;
        } else {
          const a = clock * 0.6 + i * 2.1;
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
        k.rest(clock, rm);
        k.gait(dt, rm, 1.3);
        k.commit();
      });

      // Caravan along the road (on the right of the way it walks), resting by the village at night.
      const caravanNear = near(farmer.x, farmer.z);
      if (dayNow) {
        const head = side(ft, fdir * 1.3);
        const blocked =
          Math.hypot(
            head.x + Math.sin(head.yaw) * fdir * 1.6 - avatar.x,
            head.z + Math.cos(head.yaw) * fdir * 1.6 - avatar.z,
          ) < 2;
        wait = blocked ? 0.6 : Math.max(0, wait - dt);
        const v = wait > 0 ? 0 : 0.85;
        ft += (fdir * v * dt) / L;
        if (ft > tB) {
          ft = tB;
          fdir = -1;
        } else if (ft < tA) {
          ft = tA;
          fdir = 1;
        }
        walkAmt += ((v > 0 ? 1 : 0) - walkAmt) * (1 - Math.exp(-dt * 4));
        if (!rm) phase += dt * v * 4.2;
        const h = side(ft, fdir * 1.3);
        farmer.setActive(true);
        farmer.place(h.x, h.z, fdir > 0 ? h.yaw : h.yaw + Math.PI);
        farmer.speed = v;
        farmer.y = ground(h.x, h.z);
        farmer.rest(clock, rm);
        farmer.gait(dt, rm, 0.6);
        if (caravanNear) farmer.commit();
        else farmer.hide();
        for (let i = 0; i < nLlamas; i++) {
          const q = side(ft - (fdir * FILE_GAP * (i + 1)) / L, fdir * 1.3);
          const b = llamaBodies[i];
          if (b) {
            b.x = q.x;
            b.z = q.z;
          }
          if (!caravanNear) {
            herd.hide(i);
            continue;
          }
          herd.set(i, {
            x: q.x,
            y: ground(q.x, q.z),
            z: q.z,
            yaw: fdir > 0 ? q.yaw : q.yaw + Math.PI,
            phase: phase + i * 1.3,
            walk: walkAmt,
            graze: wait > 0 && !rm ? 0.2 + 0.15 * Math.sin(clock * 0.8 + i) : 0,
            lying: false,
          });
        }
      } else {
        farmer.setActive(true);
        farmer.place(camp.x, camp.z - 1.4, frame.yaw);
        farmer.y = ground(camp.x, camp.z - 1.4) + 0.02;
        farmer.rest(clock, rm);
        farmer.sit(clock, rm);
        if (caravanNear) farmer.commit();
        else farmer.hide();
        for (let i = 0; i < nLlamas; i++) {
          const x = camp.x + (i - 1) * 1.6;
          const z = camp.z + 0.8;
          const b = llamaBodies[i];
          if (b) {
            b.x = x;
            b.z = z;
          }
          if (!caravanNear) herd.hide(i);
          else
            herd.set(i, {
              x,
              y: ground(x, z),
              z,
              yaw: frame.yaw + (i % 2 ? 0.3 : -0.2),
              phase: 0,
              walk: 0,
              graze: 0,
              lying: true,
            });
        }
      }
      herd.commit();
      crowd.flush();
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      for (const k of kids) k.dispose();
      farmer.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      crowd.dispose();
      mat.dispose();
      herd.dispose();
    },
  };
};
