/**
 * Perdiz andina / pisaca (Nothoprocta ornata, Nothura darwinii): plump, almost tailless tinamous hiding in
 * the ichu beside the Qhapaq Ñan. Small coveys (2–4) walk and peck slowly at the foot of the tufts, freeze
 * when the traveler comes near, then burst out in the classic explosive flush (within ~3 u walking, ~5 u
 * running or riding): a near-vertical rise on whirring wings, a short low glide 15–25 u across the slope,
 * and a drop back into the grass, leaving a puff of feathers behind.
 *
 * A small pool of coveys is re-seeded unseen ahead of the traveler along the trail (on the trail-side edge
 * of real ichu tufts read from the flora tiles), so an encounter comes regularly at every altitude up to
 * the puna. Day and dusk only; they sleep at night. First flush stamps `fauna:perdiz`.
 *
 * Draw calls: body, head, right wing, left wing, legs, feather puffs (6 InstancedMeshes, zero per-frame
 * allocations).
 */
import * as THREE from "three";
import { sfx } from "../../audio/sfx";
import type { Ambient, CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { gradientMap } from "../toon";
import { mirrorX, PLUMAGE, tinamouParts } from "./tinamou/model";
import {
  flightHeight,
  flightProgress,
  flightTime,
  flushRadius,
  freezeRadius,
  isAwake,
  meterSpeed,
  NERVE,
  NERVE_RADIUS,
  newSpeedMeter,
  RUN_SPEED,
  whirr,
} from "./tinamou/sim";

const TAU = Math.PI * 2;
/** Stylised a touch larger than life (≈0.38 u beak to rump) so the covey reads from the follow camera. */
const S = 1.25;
const PER_GROUP = 4;

type St = "away" | "ground" | "freeze" | "fly";
interface Bird {
  st: St;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Current ground action: 0 idle/look, 1 walk, 2 peck; and its remaining time. */
  act: number;
  actT: number;
  leg: number;
  crouch: number;
  /** Flush: delay before take-off, time in flight, duration, from/to, peak height above ground. */
  delay: number;
  s: number;
  T: number;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  peak: number;
  flap: number;
  tint: number;
}
interface Group {
  on: boolean;
  t: number;
  ax: number;
  az: number;
  nerve: number;
}

export const create: CreateAmbient = (env): Ambient => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const isWater = (x: number, z: number) => extra?.isWater?.(x, z) ?? false;
  const trail = env.trail;
  const hw = trail.halfWidth;
  const low = env.quality === "low";
  const rm = env.reducedMotion;
  const G = low ? 3 : 4;
  const N = G * PER_GROUP;
  const NF = rm ? 12 : low ? 28 : 56;

  // ---------------------------------------------------------------- meshes
  const parts = tinamouParts();
  const wingL = mirrorX(parts.wing);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
  const featherMat = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide });
  const mk = (geo: THREE.BufferGeometry, name: string, count: number, m: THREE.Material = mat) => {
    const mesh = new THREE.InstancedMesh(geo, m, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    env.scene.add(mesh);
    return mesh;
  };
  const body = mk(parts.body, "tinamou-body", N);
  const head = mk(parts.head, "tinamou-head", N);
  const wingsR = mk(parts.wing, "tinamou-wing-r", N);
  const wingsL = mk(wingL, "tinamou-wing-l", N);
  const legs = mk(parts.leg, "tinamou-legs", N * 2);
  const feathers = mk(parts.feather, "tinamou-feathers", NF, featherMat);
  env.noOutline(feathers);
  const meshes = [body, head, wingsR, wingsL, legs, feathers];
  const geos = [parts.body, parts.head, parts.wing, wingL, parts.leg, parts.feather];

  let seed = 1931;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Per-bird plumage tint (subtle: some greyer, some warmer).
  const tints = ["#ffffff", "#f4ece0", "#fff3e2", "#e9e6e0"];
  const col = new THREE.Color();
  const birds: Bird[] = Array.from({ length: N }, (_, i) => ({
    st: "away" as St,
    x: 0,
    y: -999,
    z: 0,
    yaw: 0,
    act: 0,
    actT: 0,
    leg: 0,
    crouch: 0,
    delay: 0,
    s: 0,
    T: 1,
    fx: 0,
    fz: 0,
    tx: 0,
    tz: 0,
    peak: 1.6,
    flap: R() * TAU,
    tint: i % tints.length,
  }));
  for (let i = 0; i < N; i++) {
    col.set(tints[birds[i]!.tint]!);
    for (const m of [body, head, wingsR, wingsL]) m.setColorAt(i, col);
    legs.setColorAt(i * 2, col);
    legs.setColorAt(i * 2 + 1, col);
  }
  const featherCols = [PLUMAGE.buff, PLUMAGE.streak, PLUMAGE.base, PLUMAGE.mottle, PLUMAGE.breast];
  for (let i = 0; i < NF; i++) feathers.setColorAt(i, col.set(featherCols[i % featherCols.length]!));
  for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const groups: Group[] = Array.from({ length: G }, () => ({ on: false, t: 0, ax: 0, az: 0, nerve: 0 }));

  // ---------------------------------------------------------------- feather puffs
  const fp = new Float32Array(NF * 3);
  const fv = new Float32Array(NF * 3);
  const fl = new Float32Array(NF); // life left
  const fr = new Float32Array(NF); // spin phase
  let fNext = 0;
  const puff = (x: number, y: number, z: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const i = fNext;
      fNext = (fNext + 1) % NF;
      fp[i * 3] = x + (R() - 0.5) * 0.2;
      fp[i * 3 + 1] = y + R() * 0.2;
      fp[i * 3 + 2] = z + (R() - 0.5) * 0.2;
      const a = R() * TAU;
      const sp = 0.6 + R() * 1.4;
      fv[i * 3] = Math.cos(a) * sp;
      fv[i * 3 + 1] = 0.8 + R() * 1.6;
      fv[i * 3 + 2] = Math.sin(a) * sp;
      fl[i] = 1.3 + R() * 1.2;
      fr[i] = R() * TAU;
    }
  };

  // ---------------------------------------------------------------- ichu tufts beside the trail
  /** Trail-edge ichu tufts as (t, x, z) triples sorted by t; empty until flora is in the scene. */
  let tufts = new Float32Array(0);
  let tuftScan = 0;
  let tuftTries = 0;
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const scanTufts = () => {
    const found: Array<[number, number, number]> = [];
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    env.scene.updateMatrixWorld();
    env.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !o.name.startsWith("ichu")) return;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        v.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);
        const t = trail.nearestT(v.x, v.z);
        trail.pointAt(t, tmp);
        const d = Math.hypot(v.x - tmp.x, v.z - tmp.z);
        if (d > hw + 0.5 && d < hw + 3 && !isWater(v.x, v.z)) found.push([t, v.x, v.z]);
      }
    });
    found.sort((a, b) => a[0] - b[0]);
    tufts = new Float32Array(found.length * 3);
    for (let k = 0; k < found.length; k++) tufts.set(found[k]!, k * 3);
  };
  const lowerBound = (t: number) => {
    let lo = 0;
    let hi = tufts.length / 3;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tufts[mid * 3]! < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // ---------------------------------------------------------------- traveler tracking
  let avT = 0;
  let lastT = 0;
  let dirSign = 1;
  let tClock = 1;
  let riding = false;
  let inside = false;
  let stamped = false;
  const meter = newSpeedMeter();
  const offs = [
    on("world:mount", (d) => (riding = !!d?.riding)),
    on("world:interior", (d) => (inside = !!d?.inside)),
    on("world:teleport", () => {
      // Fresh stretch of trail: drop every covey not in flight, re-seed around the new spot.
      for (let g = 0; g < G; g++) if (!groupFlying(g)) recycle(g);
      tClock = 1;
    }),
  ];

  const groupFlying = (g: number) => {
    for (let k = 0; k < PER_GROUP; k++) if (birds[g * PER_GROUP + k]!.st === "fly") return true;
    return false;
  };
  const recycle = (g: number) => {
    groups[g]!.on = false;
    for (let k = 0; k < PER_GROUP; k++) birds[g * PER_GROUP + k]!.st = "away";
  };

  /** Keep a ground position off the paving (≥ hw + 0.35 from the centerline). */
  const offPath = (b: Bird) => {
    const t = trail.nearestT(b.x, b.z);
    trail.pointAt(t, tmp);
    const dx = b.x - tmp.x;
    const dz = b.z - tmp.z;
    const d = Math.hypot(dx, dz);
    if (d < hw + 0.35 && d > 1e-3) {
      b.x = tmp.x + (dx / d) * (hw + 0.4);
      b.z = tmp.z + (dz / d) * (hw + 0.4);
    }
  };

  const seed1 = (g: number, av: THREE.Vector3) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ahead = 26 + R() * 44;
      const t = Math.min(0.995, Math.max(0.005, avT + (dirSign * ahead) / trail.length));
      let ax = 0;
      let az = 0;
      let ok = false;
      const nT = tufts.length / 3;
      if (nT > 0) {
        const lo = lowerBound(t - 6 / trail.length);
        const hi = lowerBound(t + 6 / trail.length);
        if (hi > lo) {
          const k = lo + Math.floor(R() * (hi - lo));
          const tx = tufts[k * 3 + 1]!;
          const tz = tufts[k * 3 + 2]!;
          trail.pointAt(tufts[k * 3]!, tmp);
          // Trail-facing foot of the tuft, so the bird peeks out of the grass instead of sinking into it.
          const dx = tmp.x - tx;
          const dz = tmp.z - tz;
          const d = Math.hypot(dx, dz) || 1;
          ax = tx + (dx / d) * 0.5;
          az = tz + (dz / d) * 0.5;
          ok = true;
        }
      }
      if (!ok) {
        trail.pointAt(t, tmp);
        trail.tangentAt(t, tan);
        const side = R() < 0.5 ? -1 : 1;
        const lat = hw + 0.7 + R() * 1.6;
        ax = tmp.x - tan.z * side * lat;
        az = tmp.z + tan.x * side * lat;
        ok = (extra?.isGrass?.(ax, az) ?? true) && !isWater(ax, az);
      }
      if (!ok) continue;
      if (Math.hypot(ax - av.x, az - av.z) < 20) continue;
      let clash = false;
      for (let o = 0; o < G; o++) {
        const og = groups[o]!;
        if (o !== g && og.on && Math.hypot(og.ax - ax, og.az - az) < 18) clash = true;
      }
      if (clash) continue;
      const grp = groups[g]!;
      grp.on = true;
      grp.t = t;
      grp.ax = ax;
      grp.az = az;
      grp.nerve = 0;
      const size = 2 + Math.floor(R() * (low ? 2 : 3));
      for (let k = 0; k < PER_GROUP; k++) {
        const b = birds[g * PER_GROUP + k]!;
        if (k >= size) {
          b.st = "away";
          continue;
        }
        const a = R() * TAU;
        const r = k === 0 ? 0 : 0.45 + R() * 0.9;
        b.x = ax + Math.cos(a) * r;
        b.z = az + Math.sin(a) * r;
        offPath(b);
        b.y = groundAt(b.x, b.z);
        b.yaw = R() * TAU;
        b.st = "ground";
        b.act = 2;
        b.actT = R() * 1.5;
        b.crouch = 0;
      }
      return;
    }
  };

  // ---------------------------------------------------------------- flush
  const camRight = new THREE.Vector3();
  const flush = (g: number, trigger: number, av: THREE.Vector3) => {
    const grp = groups[g]!;
    // Away from the traveler, biased across the slope (away from the trail on the covey's side).
    trail.pointAt(grp.t, tmp);
    trail.tangentAt(grp.t, tan);
    let ox = grp.ax - tmp.x;
    let oz = grp.az - tmp.z;
    const od = Math.hypot(ox, oz) || 1;
    ox /= od;
    oz /= od;
    let first = true;
    for (let k = 0; k < PER_GROUP; k++) {
      const i = g * PER_GROUP + k;
      const b = birds[i]!;
      if (b.st !== "ground" && b.st !== "freeze") continue;
      let ax = b.x - av.x;
      let az = b.z - av.z;
      const ad = Math.hypot(ax, az) || 1;
      ax /= ad;
      az /= ad;
      let dx = ax * 0.55 + ox + (R() - 0.5) * 0.5;
      let dz = az * 0.55 + oz + (R() - 0.5) * 0.5;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      let dist = 15 + R() * 10;
      let tx = b.x + dx * dist;
      let tz = b.z + dz * dist;
      for (let a = 0; a < 5; a++) {
        if ((extra?.isGrass?.(tx, tz) ?? true) && !isWater(tx, tz)) break;
        // Swing the heading and shorten until it lands on open grass.
        const ang = (a % 2 ? -1 : 1) * 0.35 * (a + 1);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        dist *= 0.9;
        tx = b.x + (dx * c - dz * s) * dist;
        tz = b.z + (dx * s + dz * c) * dist;
      }
      b.st = "fly";
      b.delay = i === trigger ? 0 : 0.04 + R() * 0.32;
      b.s = 0;
      b.T = flightTime(dist);
      b.fx = b.x;
      b.fz = b.z;
      b.tx = tx;
      b.tz = tz;
      b.peak = (rm ? 1.1 : 1.5) + R() * 0.8;
      b.yaw = Math.atan2(tx - b.x, tz - b.z);
      if (first) {
        first = false;
        // One whistle + wing rattle per covey, panned to where it bursts.
        camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
        const px = b.x - env.camera.position.x;
        const pz = b.z - env.camera.position.z;
        const pl = Math.hypot(px, pz) || 1;
        const pan = Math.max(-1, Math.min(1, (px * camRight.x + pz * camRight.z) / pl));
        sfx.play("squeak", { pan, gain: 0.45 });
        sfx.play("tick", { pan, gain: 0.7 });
        if (!stamped && Math.hypot(b.x - av.x, b.z - av.z) < 12) {
          stamped = true;
          emit("world:stamp", {
            id: "fauna:perdiz",
            kind: "fauna",
            label: { es: "Perdiz andina", en: "Andean tinamou" },
          });
        }
      }
    }
    grp.nerve = 0;
  };

  // ---------------------------------------------------------------- matrices
  const mRoot = new THREE.Matrix4();
  const mPart = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1);
  const SC = new THREE.Vector3(S, S, S);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const setRoot = (x: number, y: number, z: number, yaw: number, pitch: number, roll: number) => {
    e.set(pitch, yaw, roll, "YXZ");
    q.setFromEuler(e);
    mRoot.compose(v.set(x, y, z), q, SC);
  };
  const setPart = (
    mesh: THREE.InstancedMesh,
    i: number,
    px: number,
    py: number,
    pz: number,
    rx: number,
    ry: number,
    rz: number,
  ) => {
    e.set(rx, ry, rz, "XYZ");
    q.setFromEuler(e);
    mPart.compose(v.set(px, py, pz), q, ONE);
    mesh.setMatrixAt(i, mOut.multiplyMatrices(mRoot, mPart));
  };
  const hide = (i: number) => {
    body.setMatrixAt(i, hidden);
    head.setMatrixAt(i, hidden);
    wingsR.setMatrixAt(i, hidden);
    wingsL.setMatrixAt(i, hidden);
    legs.setMatrixAt(i * 2, hidden);
    legs.setMatrixAt(i * 2 + 1, hidden);
  };
  for (let i = 0; i < N; i++) hide(i);
  for (let i = 0; i < NF; i++) feathers.setMatrixAt(i, hidden);
  const hp = parts.headPivot;
  const sh = parts.shoulder;
  const hip = parts.hip;

  // ---------------------------------------------------------------- frame
  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      const speed = meterSpeed(meter, avatar.x, avatar.z, dt);
      const fast = riding || speed > RUN_SPEED;
      const awake = isAwake(env.sky.time()) && !inside;
      const rFlush = flushRadius(fast);
      const rFreeze = freezeRadius(fast);

      if (tufts.length === 0 && tuftTries < 8) {
        tuftScan -= dt;
        if (tuftScan <= 0) {
          tuftScan = 2;
          tuftTries++;
          scanTufts();
        }
      }

      tClock += dt;
      if (tClock > 0.4) {
        tClock = 0;
        avT = trail.nearestT(avatar.x, avatar.z);
        if (Math.abs(avT - lastT) > 0.0005) dirSign = avT > lastT ? 1 : -1;
        lastT = avT;
        // Recycle coveys left behind / far away / asleep, then seed one free covey ahead (one per tick).
        let seeded = false;
        for (let g = 0; g < G; g++) {
          const grp = groups[g]!;
          if (grp.on) {
            if (groupFlying(g)) continue;
            const dA = Math.hypot(grp.ax - avatar.x, grp.az - avatar.z);
            const behind = (grp.t - avT) * dirSign * trail.length;
            if (dA > 75 || (behind < -25 && dA > 25) || (!awake && dA > 22)) recycle(g);
          } else if (awake && !seeded) {
            seed1(g, avatar);
            seeded = grp.on;
          }
        }
      }

      for (let g = 0; g < G; g++) {
        const grp = groups[g]!;
        if (!grp.on) continue;
        // Nerve: frozen birds bolt if the traveler lingers close.
        let near = 1e9;
        let nearest = -1;
        for (let k = 0; k < PER_GROUP; k++) {
          const i = g * PER_GROUP + k;
          const b = birds[i]!;
          if (b.st !== "ground" && b.st !== "freeze") continue;
          const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
          if (d < near) {
            near = d;
            nearest = i;
          }
        }
        if (nearest < 0) continue;
        if (near < NERVE_RADIUS) grp.nerve += dt;
        else grp.nerve = Math.max(0, grp.nerve - dt);
        if (awake && (near < rFlush || grp.nerve > NERVE)) flush(g, nearest, avatar);
      }

      for (let i = 0; i < N; i++) {
        const b = birds[i]!;
        if (b.st === "away") {
          hide(i);
          continue;
        }
        const grp = groups[Math.floor(i / PER_GROUP)]!;
        const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
        let pitch = 0;
        let roll = 0;
        let headPitch = 0;
        let flapAmp = 0;
        let fold = 1;
        let legSwing = 0;
        let lift = 0;

        if (b.st === "ground" || b.st === "freeze") {
          if (b.st === "ground" && d < rFreeze && awake) b.st = "freeze";
          else if (b.st === "freeze" && d > rFreeze + 2) b.st = "ground";
          b.crouch += ((b.st === "freeze" ? 1 : 0) - b.crouch) * Math.min(1, dt * 8);
          if (b.st === "ground") {
            b.actT -= dt;
            if (b.actT <= 0) {
              const r = R();
              if (r < 0.45) {
                b.act = 1;
                b.actT = 0.8 + R() * 1.6;
                // Wander, but drift back toward the covey's tuft.
                const toA = Math.atan2(grp.ax - b.x, grp.az - b.z);
                const far = Math.hypot(grp.ax - b.x, grp.az - b.z) > 1.6;
                b.yaw = far ? toA + (R() - 0.5) * 0.6 : b.yaw + (R() - 0.5) * 2;
                // Never stroll onto the paving: if the walk would end there, head back to the tuft.
                const ex = b.x + Math.sin(b.yaw) * 0.28 * b.actT;
                const ez = b.z + Math.cos(b.yaw) * 0.28 * b.actT;
                trail.pointAt(trail.nearestT(ex, ez), tmp);
                if (Math.hypot(ex - tmp.x, ez - tmp.z) < hw + 0.35) b.yaw = toA;
              } else if (r < 0.82) {
                b.act = 2;
                b.actT = 0.9 + R() * 1.8;
              } else {
                b.act = 0;
                b.actT = 0.6 + R() * 1.2;
              }
            }
            if (b.act === 1) {
              const step = 0.28 * dt;
              b.x += Math.sin(b.yaw) * step;
              b.z += Math.cos(b.yaw) * step;
              if (isWater(b.x, b.z)) {
                b.x -= Math.sin(b.yaw) * step;
                b.z -= Math.cos(b.yaw) * step;
                b.actT = 0;
              }
              b.leg += dt * 9;
              legSwing = Math.sin(b.leg) * 0.55;
              lift = Math.abs(Math.sin(b.leg)) * 0.008;
              // Pigeon-like head bob while walking.
              headPitch = 0.15 + Math.sin(b.leg * 2) * 0.12;
            } else if (b.act === 2) {
              // Peck: quick dips toward the ground.
              const ph = (b.actT * 2.6) % 1;
              headPitch = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) * 1.25 : 0.1;
              pitch = headPitch * 0.12;
            } else {
              headPitch = -0.15;
            }
          } else {
            // Frozen: flattened against the ground, neck drawn in, motionless.
            headPitch = 0.25;
          }
          if (b.act === 1 || b.st === "freeze") {
            // Re-ground cheaply only when the bird moves or settles.
            b.y = groundAt(b.x, b.z);
          }
          pitch += b.crouch * 0.08;
          lift -= b.crouch * 0.035;
        } else {
          // fly
          if (b.delay > 0) {
            b.delay -= dt;
            b.crouch += (1 - b.crouch) * Math.min(1, dt * 8);
            lift = -0.035 * b.crouch;
            pitch = 0.08;
            headPitch = 0.25;
            if (b.delay <= 0) puff(b.x, b.y + 0.2, b.z, rm ? 1 : low ? 3 : 5);
          } else {
            b.s += dt;
            b.crouch = 0;
            const f = flightProgress(b.s, b.T);
            b.x = b.fx + (b.tx - b.fx) * f;
            b.z = b.fz + (b.tz - b.fz) * f;
            const base = groundAt(b.x, b.z);
            b.y = base + flightHeight(b.s, b.T, b.peak);
            const w = whirr(b.s, b.T);
            b.flap += dt * (rm ? 24 : 72) * (w > 0 ? 1 : 0.2);
            flapAmp = w;
            fold = 0;
            const burst = b.s < 0.4;
            pitch = burst ? -0.65 * (1 - b.s / 0.4) : b.s > b.T - 0.35 ? -0.4 : 0.05;
            roll = Math.sin(b.s * 3 + i) * 0.08;
            headPitch = -0.2;
            legSwing = -1.25;
            if (b.s >= b.T) {
              // Drop into the grass and stay put a while, crouched.
              b.st = "ground";
              b.y = base;
              b.act = 0;
              b.actT = 2 + R() * 2;
              b.crouch = 1;
              grp.ax = b.tx;
              grp.az = b.tz;
              grp.t = trail.nearestT(b.tx, b.tz);
              if (!rm && R() < 0.5) puff(b.x, b.y + 0.1, b.z, 2);
            }
          }
        }

        setRoot(b.x, b.y + lift * S, b.z, b.yaw, pitch, roll);
        body.setMatrixAt(i, mRoot);
        setPart(head, i, hp.x, hp.y - 0.03 * b.crouch, hp.z - 0.02 * b.crouch, headPitch, 0, 0);
        if (fold > 0.5) {
          wingsR.setMatrixAt(i, hidden);
          wingsL.setMatrixAt(i, hidden);
        } else {
          // Very fast whirr in the burst; stiff, slightly drooped wings in the glide.
          const beat = flapAmp > 0 ? Math.sin(b.flap) * 1.05 * flapAmp : 0;
          const z = 0.12 - beat;
          setPart(wingsR, i, sh.x, sh.y, sh.z, 0, 0, -z);
          setPart(wingsL, i, -sh.x, sh.y, sh.z, 0, 0, z);
        }
        setPart(legs, i * 2, hip.x, hip.y, hip.z, legSwing, 0, 0);
        setPart(legs, i * 2 + 1, -hip.x, hip.y, hip.z, b.st === "fly" ? legSwing : -legSwing, 0, 0);
      }

      // Feather puffs: drift down with drag and a flutter, spinning; shrink out at the end of life.
      for (let i = 0; i < NF; i++) {
        if (fl[i]! <= 0) continue;
        fl[i] = fl[i]! - dt;
        if (fl[i]! <= 0) {
          feathers.setMatrixAt(i, hidden);
          continue;
        }
        const drag = Math.max(0, 1 - dt * 2.4);
        fv[i * 3] = fv[i * 3]! * drag;
        fv[i * 3 + 2] = fv[i * 3 + 2]! * drag;
        fv[i * 3 + 1] = Math.max(-0.45, fv[i * 3 + 1]! * drag - 2.2 * dt);
        fr[i] = fr[i]! + dt * 5;
        fp[i * 3] = fp[i * 3]! + (fv[i * 3]! + Math.sin(fr[i]! * 1.7) * 0.35) * dt;
        fp[i * 3 + 1] = fp[i * 3 + 1]! + fv[i * 3 + 1]! * dt;
        fp[i * 3 + 2] = fp[i * 3 + 2]! + fv[i * 3 + 2]! * dt;
        const gy = groundAt(fp[i * 3]!, fp[i * 3 + 2]!) + 0.02;
        if (fp[i * 3 + 1]! < gy) fp[i * 3 + 1] = gy;
        const sc = Math.min(1, fl[i]! / 0.35);
        e.set(fr[i]!, fr[i]! * 0.7, fr[i]! * 1.3);
        q.setFromEuler(e);
        feathers.setMatrixAt(i, mOut.compose(v.set(fp[i * 3]!, fp[i * 3 + 1]!, fp[i * 3 + 2]!), q, SC.set(sc, sc, sc)));
        SC.set(S, S, S);
      }

      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const off of offs) off();
      for (const m of meshes) {
        env.scene.remove(m);
        m.dispose();
      }
      for (const g of geos) g.dispose();
      mat.dispose();
      featherMat.dispose();
    },
  };
};
