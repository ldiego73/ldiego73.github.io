/**
 * Pichitankas (rufous-collared sparrows, Zonotrichia capensis): the most common bird of the Andes, hopping
 * along the edges of the trail. A small pool follows the traveler: birds wait on the curb a little ahead,
 * hop and peck, flush when the traveler comes close (sooner when running or riding) and land again further
 * up the path. They sleep at night. Rendering: the shared sparrow (characters/animals, one herd: a skinned
 * instanced draw per LOD for the flock); its flight state machine reads hop, flap and landing from the motion.
 * Bodies ("sparrow", creatures.ts): solid on the ground, not in flight; a hop never lands on another body.
 */
import * as THREE from "three";
import { createHerd } from "../characters/animals/crowd";
import type { Ambient, CreateAmbient } from "../contract";
import { type Body, creatures, PARKED, park } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { noPaint } from "../style-gl";

const TAU = Math.PI * 2;

type State = "ground" | "fly" | "away";
interface Bird {
  state: State;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hopT: number;
  hop: number;
  peck: number;
  /** Flight: start, end, progress. */
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  f: number;
  /** Climb rate in flight (the flight state machine reads it). */
  vy: number;
}

export const create: CreateAmbient = (env): Ambient => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const trail = env.trail;
  const n = env.quality === "high" ? 14 : 7;
  const rm = env.reducedMotion;

  const herd = createHerd("sparrow", { max: n });
  herd.group.name = "sparrows";
  // Birds move: no world-space painted blotches sliding over them (style-gl.ts).
  herd.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) noPaint(o as THREE.Mesh);
  });
  env.scene.add(herd.group);
  for (let i = 0; i < n; i++) herd.add({ seed: 3 + i * 5 });

  let seed = 7;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const birds: Bird[] = Array.from({ length: n }, () => ({
    state: "away" as State,
    x: 0,
    y: -999,
    z: 0,
    yaw: 0,
    hopT: R(),
    hop: 0,
    peck: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    f: 0,
    vy: 0,
  }));

  const bodies = birds.map(() => creatures.add("sparrow", 0.12, { solid: false, x: PARKED, z: PARKED }));
  const crowd: Body[] = [];
  const free = (b: Body, x: number, z: number) => {
    for (const o of creatures.near(x, z, b.r, crowd, b)) if (o.solid) return false;
    return true;
  };
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  let avT = 0;
  let tClock = 1;
  let dirSign = 1;
  let lastT = 0;
  let riding = false;
  let inside = false;
  const offMount = on("world:mount", (d) => (riding = !!d?.riding));
  const offInterior = on("world:interior", (d) => (inside = !!d?.inside));

  /** A spot on the trail edge `ahead` units from the traveler (in the walking direction). */
  const spotAhead = (ahead: number, out: { x: number; z: number; y: number }) => {
    for (let k = 0; k < 6; k++) {
      const t = Math.min(0.995, Math.max(0.005, avT + (dirSign * ahead) / trail.length + (R() - 0.5) * 0.004));
      trail.pointAt(t, tmp);
      trail.tangentAt(t, tan);
      const side = R() < 0.5 ? -1 : 1;
      const lat = trail.halfWidth + 0.25 + R() * 1.4;
      const x = tmp.x - tan.z * side * lat;
      const z = tmp.z + tan.x * side * lat;
      if (extra?.isWater?.(x, z)) continue;
      out.x = x;
      out.z = z;
      out.y = groundAt(x, z);
      return true;
    }
    return false;
  };
  const spot = { x: 0, y: 0, z: 0 };

  const land = (b: Bird, i: number, ahead: number) => {
    if (!spotAhead(ahead, spot) || !free(bodies[i]!, spot.x, spot.z)) return;
    b.state = "ground";
    b.x = spot.x;
    b.y = spot.y;
    b.z = spot.z;
    b.yaw = R() * TAU;
    b.hopT = 0.3 + R();
  };
  const flush = (b: Bird, av: THREE.Vector3) => {
    b.state = "fly";
    b.fx = b.x;
    b.fy = b.y;
    b.fz = b.z;
    // Away from the traveler, up and over.
    const dx = b.x - av.x;
    const dz = b.z - av.z;
    const d = Math.hypot(dx, dz) || 1;
    b.tx = b.x + (dx / d) * 9 + (R() - 0.5) * 4;
    b.tz = b.z + (dz / d) * 9 + (R() - 0.5) * 4;
    b.ty = b.y + 4 + R() * 3;
    b.yaw = Math.atan2(dx, dz);
    b.f = 0;
  };

  let clock = 0;

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      const night = env.sky.isNight();
      // Where the traveler is along the path, and which way they're heading.
      tClock += dt;
      if (tClock > 0.4) {
        tClock = 0;
        avT = trail.nearestT(avatar.x, avatar.z);
        if (Math.abs(avT - lastT) > 0.0005) dirSign = avT > lastT ? 1 : -1;
        lastT = avT;
      }
      const scare = riding ? 4.2 : 2.6;
      for (let i = 0; i < n; i++) {
        const b = birds[i]!;
        const dx = b.x - avatar.x;
        const dz = b.z - avatar.z;
        const d2 = dx * dx + dz * dz;
        if (b.state === "away") {
          if (!night && !inside) land(b, i, 9 + R() * 26);
        } else if (b.state === "ground") {
          if (night || d2 > 48 * 48) b.state = "away";
          else if (d2 < scare * scare) flush(b, avatar);
          else {
            b.hopT -= dt;
            b.peck = Math.max(0, b.peck - dt * 3);
            if (b.hopT <= 0) {
              b.hopT = 0.4 + R() * 1.3;
              if (R() < 0.45) {
                b.peck = 1;
                herd.play(i, "graze", 0.35);
              } else {
                b.yaw += (R() - 0.5) * 2.2;
                const step = 0.12 + R() * 0.14;
                const nx = b.x + Math.sin(b.yaw) * step;
                const nz = b.z + Math.cos(b.yaw) * step;
                // Stay on the curb band, off the paving.
                const tt = trail.nearestT(nx, nz);
                trail.pointAt(tt, tmp);
                if (Math.hypot(nx - tmp.x, nz - tmp.z) > trail.halfWidth + 0.15 && free(bodies[i]!, nx, nz)) {
                  b.x = nx;
                  b.z = nz;
                  b.y = groundAt(nx, nz);
                  b.hop = 1;
                }
              }
            }
            b.hop = Math.max(0, b.hop - dt * 6);
          }
        } else {
          b.f += dt / 1.4;
          const f = Math.min(1, b.f);
          b.x = b.fx + (b.tx - b.fx) * f;
          b.z = b.fz + (b.tz - b.fz) * f;
          const y = b.fy + (b.ty - b.fy) * f + Math.sin(f * Math.PI) * 1.2;
          b.vy = dt > 0 ? (y - b.y) / dt : 0;
          b.y = y;
          if (b.f >= 1) b.state = "away";
        }

        const bd = bodies[i]!;
        if (b.state === "away") park(bd);
        else {
          bd.x = b.x;
          bd.z = b.z;
          bd.solid = b.state === "ground";
        }
        if (b.state === "away") {
          herd.hide(i);
          continue;
        }
        const flying = b.state === "fly";
        // Hops between pecks: a short skip forward (the ground hop reads from the speed).
        const hopping = !flying && b.hop > 0;
        const fl = Math.hypot(b.tx - b.fx, b.tz - b.fz) / 1.4;
        herd.set(i, b.x, b.y, b.z, b.yaw, {
          speed: flying ? fl : hopping ? 0.8 : 0,
          rm,
          grounded: !flying,
          vy: flying ? b.vy : 0,
          height: flying ? b.y - groundAt(b.x, b.z) : 0,
        });
      }
      clock += dt;
      herd.update(dt, clock, env.camera);
    },
    dispose() {
      for (const b of bodies) creatures.remove(b);
      offMount();
      offInterior();
      herd.dispose();
    },
  };
};
