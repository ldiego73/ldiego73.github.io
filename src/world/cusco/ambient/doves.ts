/**
 * Eared doves (tórtolas, native to the Andes) on Haukaypata's flagstones: a small flock pecking and hopping
 * by day; when the traveler comes within FLEE_R a dove (and its neighbours) takes off in a flapping arc and
 * lands on open flagstones away from them (./doves/logic.ts). At night they are gone (roosting). With
 * prefers-reduced-motion they still move away (the bird animator calms its wing beats).
 *
 * The doves are ONE flock of the shared eared dove (../../characters/animals, species "dove": one instanced
 * draw per LOD, far ones not drawn): this module runs the flock's sim and hands each bird its state (on the
 * ground or in the air, speed, climb and height), and the bird animator does the rest: head-bobbing walk and
 * pecks while grounded, take-off, flapping, gliding and landing (../../characters/animals/flight.ts).
 */
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import type { Ambient, CreateAmbient } from "../../contract";
import { FLEE_R, flightAt, flightTime, pickLanding, type Spot, shouldFlee } from "./doves/logic";
import { isDay } from "./life/logic";

interface Dove {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  state: "ground" | "fly";
  from: Spot;
  to: Spot;
  t: number;
  dur: number;
  /** Seconds to the next hop decision, and the hop in progress (seconds left). */
  next: number;
  hop: number;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hop on the ground: how long, and how fast it carries the dove. */
const HOP_SECS = 0.25;
const HOP_V = 0.8;

export const create: CreateAmbient = (env): Ambient => {
  const R = rng(0xd0e);
  const n = env.quality === "high" ? 14 : 9;
  prefetchAnimals(["dove"], [2, 1, 0]);
  const flock = createHerd("dove", { max: n, lodScale: env.quality === "low" ? 0.8 : 1 });
  flock.group.name = "cusco-doves";
  env.scene.add(flock.group);
  const rm = env.reducedMotion;

  // Two groups pecking near the usnu's south and north-west.
  const doves: Dove[] = Array.from({ length: n }, (_, i) => {
    const c = i % 2 ? { x: -12, z: -9 } : { x: 9, z: 12 };
    const x = c.x + (R() - 0.5) * 6;
    const z = c.z + (R() - 0.5) * 5;
    return {
      id: flock.add({ seed: 5 + i * 11 }),
      x,
      z,
      y: 0,
      yaw: R() * 6.28,
      state: "ground",
      from: { x, z },
      to: { x, z },
      t: 0,
      dur: 1,
      next: R() * 3,
      hop: 0,
    };
  });

  const takeOff = (d: Dove, avatar: Spot) => {
    d.state = "fly";
    d.from = { x: d.x, z: d.z };
    d.to = pickLanding(R, avatar, { x: d.x, z: d.z });
    d.t = 0;
    d.dur = flightTime(Math.hypot(d.to.x - d.x, d.to.z - d.z));
  };

  let clock = 0;
  let shown = true;
  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      if (!isDay(env.sky.time())) {
        if (shown) {
          for (const d of doves) flock.hide(d.id);
          flock.update(dt, clock, env.camera);
          flock.group.visible = false;
          shown = false;
        }
        return;
      }
      if (!shown) {
        flock.group.visible = true;
        shown = true;
      }
      doves.forEach((d, i) => {
        const x0 = d.x;
        const z0 = d.z;
        const y0 = d.y;
        if (d.state === "ground") {
          if (shouldFlee(d, avatar)) {
            takeOff(d, avatar);
            // Neighbours startle too.
            for (const o of doves)
              if (o !== d && o.state === "ground" && Math.hypot(o.x - d.x, o.z - d.z) < FLEE_R) takeOff(o, avatar);
          } else {
            // Now and then a small hop, turning (the animator pecks and bobs in between).
            d.next -= dt;
            if (d.next < 0) {
              d.next = 0.6 + R() * 2.4;
              if (R() < 0.35) {
                d.hop = HOP_SECS;
                d.yaw += (R() - 0.5) * 1.6;
              }
            }
            if (d.hop > 0) {
              d.hop -= dt;
              d.x += Math.sin(d.yaw) * dt * HOP_V;
              d.z += Math.cos(d.yaw) * dt * HOP_V;
            }
            d.y = 0;
          }
        }
        if (d.state === "fly") {
          d.t += dt / d.dur;
          const f = flightAt(d.from, d.to, d.t, 2.2 + (i % 3) * 0.5);
          d.x = f.x;
          d.z = f.z;
          d.yaw = f.yaw;
          d.y = f.y;
          if (d.t >= 1) {
            d.state = "ground";
            d.y = 0;
            d.next = 1 + R();
          }
        }
        const air = d.state === "fly";
        const speed = dt > 0 ? Math.hypot(d.x - x0, d.z - z0) / dt : 0;
        flock.set(d.id, d.x, d.y, d.z, d.yaw, {
          speed,
          rm,
          grounded: !air,
          vy: dt > 0 ? (d.y - y0) / dt : 0,
          height: d.y,
        });
      });
      flock.update(dt, clock, env.camera);
    },
    dispose() {
      flock.group.removeFromParent();
      flock.dispose();
    },
  };
};
