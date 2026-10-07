/**
 * Bufeos colorados (Amazon river dolphins, Inia geoffrensis): small pods patrolling stretches of the river,
 * mostly unseen under the brown water. Every few seconds one surfaces in a slow low arc (the pink back and
 * the low dorsal ridge roll out of the water, a puff and a ring), then dives again with a flick of the
 * flukes. Pods live along the canoe route between the embarcadero and the palafitos, off the regatón and
 * (high quality) below the collpa. While the traveler paddles the canoe (world:mount, vehicle "canoe"), the
 * nearest pod comes over and surfaces around the canoe more often, the way curious bufeos follow boats.
 * Day and night alike.
 *
 * Rendering: one rig InstancedMesh (wild/rig.ts: the rear third and flukes bend for the swimming beat; an
 * animal is drawn only while it is near the surface) + a ripple pool → 2 draw calls.
 * Bodies ("bufeo"): never solid (in the water), parked while submerged; listed for queries.
 * Stamp `selva:fauna:bufeo` after a ~1.5 s good look within 30 u (they surface out on the river).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, PARKED, park } from "../../creatures";
import { on } from "../../events";
import { barF, devHook, FAUNA_FAR, idle, Ripples, ramp, rootMatrix, Spotter, sandbars, selvaOf } from "./wild/kit";
import { clamp01, damp, rng, surfaceArc } from "./wild/logic";
import { dolphinModel } from "./wild/mammals";
import { RigSet } from "./wild/rig";

interface Pod {
  /** River index range (along layout.river.pts) the pod patrols, and where it is heading. */
  s0: number;
  s1: number;
  members: Dolphin[];
}

interface Dolphin {
  pod: Pod;
  /** River index (float) and lateral offset (fraction of the half width, + = left of the flow). */
  s: number;
  lat: number;
  dir: 1 | -1;
  speed: number;
  /** Surfacing: progress (−1 = under), and the wait until the next one. */
  arc: number;
  wait: number;
  scale: number;
  latT: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  body: Body;
}

/** Road t of the pods' home stretches (the last only on high quality). */
const HOMES = [0.5, 0.17, 0.95];
const ARC_DUR = 1.9;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const river = L.river;
  const lv = river.level;
  const pts = river.pts;
  const nPts = pts.length;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(9203);

  /** River sample at float index s: center, unit tangent (downstream) and half width. */
  const at = (s: number) => {
    const k = Math.max(0, Math.min(nPts - 1.001, s));
    const i = Math.floor(k);
    const u = k - i;
    const a = pts[i] as [number, number];
    const b = pts[i + 1] as [number, number];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const w =
      (river.halfWidth[i] as number) + ((river.halfWidth[i + 1] as number) - (river.halfWidth[i] as number)) * u;
    return { x: a[0] + dx * u, z: a[1] + dz * u, tx: dx / l, tz: dz / l, w, seg: l };
  };
  /** River index nearest to (x, z) (coarse scan, then the segment projection). */
  const sNear = (x: number, z: number) => {
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nPts - 1; i++) {
      const a = pts[i] as [number, number];
      const d = (a[0] - x) ** 2 + (a[1] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  // Deep, open water: not over a sandbar (the bars are scenery domes above the river bed).
  const bars = sandbars(env);
  const deep = (x: number, z: number) => L.heightAt(x, z) < lv - 1.4 && bars.every((b) => barF(b, x, z) > 1.6);

  const pods: Pod[] = [];
  const dolphins: Dolphin[] = [];
  for (const t of high ? HOMES : HOMES.slice(0, 2)) {
    const p = L.trail.pointAt(t);
    // The river point abreast of this road t, and a stretch of ±25 points (≈ ±90 u) around it.
    const sc = sNear(p.x, p.z);
    const pod: Pod = { s0: Math.max(2, sc - 22), s1: Math.min(nPts - 3, sc + 22), members: [] };
    pods.push(pod);
    const n = high ? (t === 0.5 ? 3 : 2) : 2;
    for (let i = 0; i < n; i++) {
      const d: Dolphin = {
        pod,
        s: sc + (R() - 0.5) * 6,
        lat: (R() - 0.5) * 0.8,
        dir: R() < 0.5 ? 1 : -1,
        speed: 1.8 + R() * 0.8,
        arc: -1,
        wait: 1 + R() * 6,
        scale: i === 2 ? 0.85 : 1.1 + R() * 0.12,
        latT: (R() - 0.5) * 0.8,
        x: PARKED,
        y: 0,
        z: PARKED,
        yaw: 0,
        body: creatures.add("bufeo", 0.6, { solid: false, x: PARKED, z: PARKED }),
      };
      pod.members.push(d);
      dolphins.push(d);
    }
  }

  const model = dolphinModel();
  const set = new RigSet("selva-fauna-bufeo-body", model.geo, model.spec, dolphins.length, ramp(env));
  const ripples = new Ripples(env, "selva-fauna-bufeo-ripples", 10, lv, 2.2);
  const root = new THREE.Group();
  root.name = "selva-fauna-bufeo";
  root.add(set.mesh, ripples.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "bufeo", 30);
  let canoe = false;
  let inside = false;
  const offMount = on("world:mount", (d) => {
    canoe = !!d?.riding && d.vehicle === "canoe";
  });
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offDev = devHook("bufeo", () =>
    dolphins.map((d) => [d.arc >= 0 ? "up" : "under", +d.x.toFixed(1), +d.z.toFixed(1), +d.s.toFixed(1)]),
  );
  const m4 = new THREE.Matrix4();
  let clock = 0;

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      spot.begin();
      // The canoe draws the nearest pod (only while paddling on the river).
      let lure: Pod | null = null;
      let lureS = 0;
      if (canoe) {
        lureS = sNear(avatar.x, avatar.z);
        let bd = 40;
        for (const p of pods) {
          const mid = (p.s0 + p.s1) / 2;
          const d = Math.abs(mid - lureS);
          if (d < bd + (p.s1 - p.s0) / 2) {
            bd = d;
            lure = p;
          }
        }
      }
      let n = 0;
      for (const d of dolphins) {
        // Swim along the stretch, turning back at its ends; a lured pod heads for the canoe.
        if (lure === d.pod) {
          const goal = lureS + (d.dir > 0 ? -2 : 2);
          const want = goal > d.s ? 1 : -1;
          if (Math.abs(goal - d.s) > 3) d.dir = want;
        } else if (d.s < d.pod.s0) d.dir = 1;
        else if (d.s > d.pod.s1) d.dir = -1;
        const a = at(d.s);
        d.s += (d.dir * d.speed * dt) / Math.max(1, a.seg);
        if (R() < dt * 0.15) d.latT = (R() - 0.5) * (lure === d.pod ? 1.1 : 0.8);
        d.lat = damp(d.lat, d.latT, 0.4, dt);
        // Keep to deep water: pull toward the center when the bed shoals.
        const px = a.x - a.tz * d.lat * a.w;
        const pz = a.z + a.tx * d.lat * a.w;
        if (!deep(px, pz)) d.latT *= 0.5;
        const yawSwim = Math.atan2(a.tx * d.dir, a.tz * d.dir);

        // Surfacing cycle.
        if (d.arc < 0) {
          d.wait -= dt;
          const nearCanoe = lure === d.pod && Math.hypot(px - avatar.x, pz - avatar.z) < 14;
          if (d.wait <= 0 && deep(px, pz) && !inside) {
            d.arc = 0;
            ripples.spawn(px, pz, 1.4 * d.scale);
          } else if (d.wait <= 0) d.wait = 0.5;
          if (d.arc < 0) {
            if (nearCanoe && d.wait > 4) d.wait = 1 + R() * 2;
            park(d.body);
            d.x = PARKED;
            continue;
          }
        }
        d.arc += dt / ARC_DUR;
        const u = clamp01(d.arc);
        // The crest keeps the body center just under the surface: the back and the low hump roll out, not the belly.
        const arc = surfaceArc(u, d.speed * ARC_DUR, -0.1 * d.scale, 0.95 * d.scale);
        d.x = px;
        d.z = pz;
        d.y = lv + arc.y;
        d.yaw = yawSwim + Math.sin(clock * 0.7 + d.s) * 0.06;
        if (u > 0.45 && u < 0.5 && R() < 0.4)
          ripples.spawn(px - Math.sin(d.yaw) * 0.6, pz - Math.cos(d.yaw) * 0.6, 1.8);
        if (d.arc >= 1) {
          // Dive: a ring where the flukes went under, then a while out of sight.
          ripples.spawn(px - Math.sin(d.yaw) * 1, pz - Math.cos(d.yaw) * 1, 1.1 * d.scale);
          d.arc = -1;
          d.wait = lure === d.pod ? 2 + R() * 3 : 4 + R() * 8;
          park(d.body);
          d.x = PARKED;
          continue;
        }
        // Pose: pitch follows the arc; the flukes beat, a last flick as they go under.
        const beat = Math.sin(clock * (rm ? 3 : 5) + d.s) * 0.25 + (u > 0.75 ? (u - 0.75) * 2.4 : 0);
        const headYaw = Math.sin(clock * 1.3 + d.s * 2) * 0.12;
        d.body.x = d.x;
        d.body.z = d.z;
        if (spot.view.dist(d.x, d.y, d.z) > FAUNA_FAR * 1.4) continue;
        rootMatrix(m4, d.x, d.y, d.z, d.yaw, -arc.pitch, 0, d.scale);
        set.set(n, m4, 0, 0, headYaw, 0, 0, beat, 0, 0);
        n++;
        if (u > 0.2 && u < 0.8) spot.see(d.x, lv + 0.2, d.z, avatar.x, avatar.z, 1.2);
      }
      set.commit(n);
      ripples.update(dt);
      spot.end(dt);
    },
    dispose() {
      offMount();
      offInterior();
      offDev();
      for (const d of dolphins) creatures.remove(d.body);
      set.dispose();
      ripples.dispose();
      root.removeFromParent();
    },
  };
};
