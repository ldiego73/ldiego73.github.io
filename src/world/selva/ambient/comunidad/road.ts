/**
 * Villagers walking the road between stations: couples carrying a green banana bunch on the shoulder and a
 * woven palm basket on the back, strolling a leg of the road (station to station, ROAD_LEGS) back and forth
 * on their right-hand side, with a pause at each end. When the traveler comes toward them they step aside to
 * the edge of the road, turn and nod (a wave when greeted), and carry on once the traveler has passed
 * (logic.ts shouldGiveWay). They steer around every body on the way (the mule, animals crossing) through the
 * shared creatures registry. By night they are home (switched off while unseen).
 */
import * as THREE from "three";
import { rng } from "../../../ambient/people/models";
import { damp, type Person } from "../../../ambient/people/person";
import type { Crowd, Palette } from "../../../ambient/people/rig";
import { asideOf, greeting, isOut, laneOf, ROAD_LEGS, shouldGiveWay } from "./logic";
import { type AmazonPart, CUSHMAS, MAN, RIBBONS, SKINS, SKIRTS, STRIPES, WOMAN } from "./models";
import type { Ctx, Greeter, Group } from "./types";
import { shoulderPose, strapPose, villager, wavePose } from "./villager";

interface Walker {
  p: Person;
  leg: readonly [number, number];
  /** Road t, walking direction, lane slot (0 inside, 1 beside the partner). */
  t: number;
  dir: 1 | -1;
  k: number;
  load: "bananas" | "basket" | "none";
  pause: number;
  yielding: boolean;
  wave: number;
  greetN: number;
}

const REACH = 2.2;
const SPEED = 1.15;
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

export function createWalkers(env: Ctx["env"], crowd: Crowd, n: number): Group {
  const R = rng(2626);
  const L = env.selva.layout;
  const trail = L.trail;
  const ground = env.selva.groundAt;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const walkers: Walker[] = [];
  for (let i = 0; i < n; i++) {
    const pair = Math.floor(i / 2);
    const leg = ROAD_LEGS[pair % ROAD_LEGS.length] as readonly [number, number];
    const man = i % 2 === 0;
    const load: Walker["load"] = man ? (pair % 2 ? "none" : "bananas") : "basket";
    const wear: AmazonPart[] = man ? [...MAN] : [...WOMAN];
    if (load === "bananas") wear.push("a:bananas");
    if (load === "basket") wear.push("a:basket");
    if (man && load === "none") wear.push("a:crown");
    const cushma = pick(R, CUSHMAS);
    const sk = pick(R, SKIRTS);
    const palette: Palette = man
      ? [pick(R, SKINS), cushma, cushma === "#d8cbb0" ? (STRIPES[0] as string) : (STRIPES[2] as string), cushma]
      : [
          pick(R, SKINS),
          sk[0],
          sk[1],
          pick(R, RIBBONS) === sk[1] ? "#c2456b" : pick(R, ["#c2456b", "#2a9d8f", "#e07a3a", "#7a3d8f"]),
        ];
    const p = villager({
      kind: "walker",
      crowd,
      idx: crowd.alloc(),
      wear,
      palette,
      scale: man ? 0.98 + R() * 0.05 : 0.92 + R() * 0.05,
      radius: 0.34,
      seed: 41 + i * 7.9,
    });
    const dir: 1 | -1 = pair % 2 ? -1 : 1;
    const t = leg[0] + (leg[1] - leg[0]) * (0.2 + 0.25 * pair);
    walkers.push({ p, leg, t, dir, k: man ? 1 : 0, load, pause: 0, yielding: false, wave: 0, greetN: i });
  }

  const lateral = (t: number, off: number, out: { x: number; z: number }) => {
    trail.pointAt(t, P);
    trail.tangentAt(t, T);
    const l = Math.hypot(T.x, T.z) || 1;
    // Side +1 normal of the road (-tangent.z, tangent.x).
    out.x = P.x + (-T.z / l) * off;
    out.z = P.z + (T.x / l) * off;
    return out;
  };
  const spot = { x: 0, z: 0 };
  for (const w of walkers) {
    lateral(w.t, laneOf(w.dir, w.k), spot);
    w.p.place(spot.x, spot.z, 0);
  }

  let isDay: boolean | null = null;
  let frame = 0;
  let near: Walker | null = null;
  const head = new THREE.Vector3();
  const len = trail.length;

  const step = (w: Walker, c: Ctx) => {
    const p = w.p;
    const dt = c.dt;
    trail.tangentAt(w.t, T);
    const tl = Math.hypot(T.x, T.z) || 1;
    const fx = (T.x / tl) * w.dir;
    const fz = (T.z / tl) * w.dir;
    w.yielding = shouldGiveWay(p.x, p.z, fx, fz, c.avatar.x, c.avatar.z, w.yielding);
    if (w.yielding) {
      // Step to the edge on the right and let the traveler pass, facing them.
      lateral(w.t, asideOf(w.dir), spot);
      const d = p.seek(spot.x, spot.z, 1.0, dt, 6);
      if (d < 0.35) p.face(c.avatar.x, c.avatar.z, dt, 5);
    } else if (w.pause > 0) {
      w.pause -= dt;
      p.speed = damp(p.speed, 0, 6, dt);
      p.resolve(0.5);
      if (w.pause <= 0) w.dir = w.dir === 1 ? -1 : 1;
    } else {
      // Follow the lane a couple of units ahead (steering bends round anything in the way).
      const q = L.trailQuery(p.x, p.z);
      w.t = q.t;
      const ahead = w.t + (w.dir * 2) / len;
      lateral(ahead, laneOf(w.dir, w.k), spot);
      p.seek(spot.x, spot.z, SPEED, dt, 3);
      if ((w.dir === 1 && w.t >= w.leg[1]) || (w.dir === -1 && w.t <= w.leg[0])) w.pause = 3 + (p.seed % 3);
    }
    p.y = ground(p.x, p.z);
    p.body.x = p.x;
    p.body.z = p.z;
    // Pose.
    p.rest(c.clock, c.rm);
    p.gait(dt, c.rm, w.load === "none" ? 1 : 0.5);
    if (w.load === "bananas") shoulderPose(p);
    if (w.load === "basket") {
      strapPose(p);
      p.bones.torso.rotation.x += 0.12;
    }
    if (w.wave > 0) {
      w.wave -= dt;
      wavePose(p, c.clock, c.rm);
    } else if (w.yielding && p.speed < 0.3 && !c.rm) {
      // A small nod while waiting.
      p.bones.head.rotation.x = Math.max(0, Math.sin(c.clock * 2 + p.seed)) * 0.25;
    }
    p.commit();
  };

  return {
    name: "walkers",
    center: new THREE.Vector3(),
    radius: 1e6,
    update(c) {
      const day = isOut("road", c.time);
      if (isDay === null || c.jump) for (const w of walkers) w.p.setActive(day);
      isDay = day;
      if (frame++ % 15 === 0)
        for (const w of walkers) if (w.p.active !== day && !c.seen(w.p.x, w.p.y + 0.8, w.p.z, 90)) w.p.setActive(day);
      near = null;
      let best = REACH;
      for (const w of walkers) {
        if (!w.p.active) continue;
        const dCam = Math.hypot(w.p.x - c.camera.x, w.p.z - c.camera.z);
        if (dCam > c.view + 30) {
          // Far: keep walking on a cheap schedule (no steering, no pose), hidden.
          w.p.hide();
          if (w.pause > 0) {
            w.pause -= c.dt;
            if (w.pause <= 0) w.dir = w.dir === 1 ? -1 : 1;
          } else {
            w.t += (w.dir * SPEED * c.dt) / len;
            if ((w.dir === 1 && w.t >= w.leg[1]) || (w.dir === -1 && w.t <= w.leg[0])) w.pause = 4;
          }
          lateral(w.t, laneOf(w.dir, w.k), spot);
          w.p.place(spot.x, spot.z);
          continue;
        }
        step(w, c);
        const d = Math.hypot(w.p.x - c.avatar.x, w.p.z - c.avatar.z);
        if (d < best) {
          best = d;
          near = w;
        }
      }
    },
    greeter(): Greeter | null {
      if (!near) return null;
      const w = near;
      head.set(w.p.x, w.p.y + 1.85, w.p.z);
      return {
        head,
        text: greeting("walker", w.greetN),
        greet() {
          w.wave = 2.2;
          w.greetN++;
        },
      };
    },
    people: () => walkers.filter((w) => w.p.active).length,
    points: () => walkers.map((w) => ({ x: w.p.x, z: w.p.z })),
    dispose() {
      for (const w of walkers) w.p.dispose();
    },
  };
}
