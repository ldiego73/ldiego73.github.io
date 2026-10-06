/**
 * Zorro andino (culpeo, Lycalopex culpaeus) — mostly at dusk and through the night, now and then by day.
 * A rufous-grey fox with a white throat and a bushy, black-tipped tail trots along the slopes a little
 * ahead of the traveler and crosses the path; on the way it stops to look back over its shoulder, sniffs
 * the ground or sits for a moment. Closer than ~5 u it flees in a quick trot. Foxes left far behind are
 * moved ahead along the trail while unseen.
 *
 * Draw calls: 6 for the whole pool (2 foxes on high quality, 1 on low). Stamp `fauna:zorro` within 12 u.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { emit, on } from "../events";
import { foxParts } from "./nightfauna/models";
import { makeQuadState, QuadSet, type QuadState, rimToon, rng, TrailTracker, View } from "./nightfauna/rig";
import { addGait, blendInto, ease, foxPresence, makePose, nightAmount, P, TROT, wrapAngle } from "./nightfauna/sim";
import { ground, settle, walkToward } from "./nightfauna/walk";

const SCALE = 1.05;
const FLEE_R = 5;
const STAMP_R = 12;
const HALF = 0.32;

//                         drop  pitch  FLu   FLl   FRu   FRl   HLu    HLl   HRu    HRl  hLift hPitch tPitch tCurl
const STAND = makePose([0, 0, 0.02, -0.02, 0.02, -0.02, -0.2, 0.36, -0.2, 0.36, 0, 0.12, -0.72, 0.1]);
const SIT = makePose([0.09, -0.45, 0.45, 0, 0.45, 0, -0.75, 2.7, -0.75, 2.7, 0.03, 0.38, -0.55, 0.12]);
const SNIFF = makePose([0.03, 0.12, -0.1, 0.1, -0.1, 0.1, -0.25, 0.4, -0.25, 0.4, -0.06, 0.85, -0.55, 0.15]);

type State = "away" | "trot" | "pause" | "flee";
type Act = "look" | "sniff" | "sit";
interface Fox {
  st: QuadState;
  state: State;
  act: Act;
  tx: number;
  tz: number;
  /** Route legs left before it wanders off. */
  legs: number;
  timer: number;
  /** Seconds of trotting until the next pause. */
  nextPause: number;
  cool: number;
  sit: number;
  sniff: number;
  amp: number;
  phase: number;
  speed: number;
  unseen: number;
  /** Which side of the trail it is on (+1 / -1). */
  side: number;
}

export const create: CreateAmbient = (env): Ambient => {
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const n = high ? 2 : 1;
  const R = rng(9127);
  const g = ground(env);
  const trail = env.trail;
  const rim = rimToon("#a9b8ff");
  const set = new QuadSet(env, foxParts(), n, "zorro", rim.material, SCALE, {
    tailTip: "#262220",
    tipFrom: 3,
    eyeDark: "#2a1d10",
    eyeGlow: "#f3e7a0",
    shadow: high,
  });
  const tracker = new TrailTracker(trail);
  const view = new View(env.camera);
  let inside = false;
  let riding = false;
  let stamped = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
  });

  const foxes: Fox[] = Array.from({ length: n }, (_, i) => ({
    st: makeQuadState(makePose([])),
    state: "away" as State,
    act: "look" as Act,
    tx: 0,
    tz: 0,
    legs: 0,
    timer: 0,
    nextPause: 3,
    cool: 2 + i * 9,
    sit: 0,
    sniff: 0,
    amp: 0,
    phase: R(),
    speed: 0,
    unseen: 0,
    side: 1,
  }));

  const tp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  /** Point `ahead` u along the trail from the traveler, `lat` u to one side (null if off the trail ends / water). */
  const trailSide = (ahead: number, side: number, lat: number, out: { x: number; z: number }) => {
    const t = tracker.t + (tracker.dir * ahead) / trail.length;
    if (t < 0.005 || t > 0.995) return false;
    trail.pointAt(t, tp);
    trail.tangentAt(t, tan);
    out.x = tp.x - tan.z * side * lat;
    out.z = tp.z + tan.x * side * lat;
    return !g.water(out.x, out.z) && Math.hypot(out.x, out.z) < 168;
  };
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };

  /** Next leg: cross the path ahead (most of the time) or trot along the slope on the same side. */
  const nextLeg = (f: Fox, avAhead: number) => {
    const cross = R() < 0.6;
    const side = cross ? -f.side : f.side;
    for (let k = 0; k < 6; k++) {
      if (trailSide(avAhead + 4 + R() * 10, side, 4 + R() * 8, b)) {
        f.tx = b.x;
        f.tz = b.z;
        f.side = side;
        return true;
      }
    }
    return false;
  };

  const spawn = (f: Fox) => {
    f.side = R() < 0.5 ? -1 : 1;
    const ahead = 12 + R() * 10;
    // Enter from well off the path, then trot in.
    if (!trailSide(ahead, f.side, 11 + R() * 5, a)) return false;
    f.st.x = a.x;
    f.st.z = a.z;
    f.st.y = -999;
    f.st.yaw = R() * Math.PI * 2;
    settle(f.st, g, 0, HALF, true);
    f.state = "trot";
    f.legs = 3 + Math.floor(R() * 3);
    f.nextPause = 2 + R() * 4;
    f.sit = f.sniff = 0;
    f.unseen = 0;
    // First leg: across the path, a bit further ahead.
    f.side = -f.side;
    if (!trailSide(ahead + 2 + R() * 5, f.side, 4 + R() * 6, b)) return false;
    f.tx = b.x;
    f.tz = b.z;
    f.st.yaw = Math.atan2(f.tx - f.st.x, f.tz - f.st.z);
    return true;
  };

  const goAway = (f: Fox, cool: number) => {
    f.state = "away";
    f.cool = cool;
  };

  if (import.meta.env?.DEV) {
    const w = window as unknown as { __foxes?: unknown; __foxPlace?: unknown };
    w.__foxes = () =>
      foxes.map((f) => ({ state: f.state, act: f.act, x: f.st.x, y: f.st.y, z: f.st.z, yaw: f.st.yaw }));
    w.__foxPlace = (i: number, x: number, z: number, yaw: number) => {
      const f = foxes[i]!;
      f.st.x = x;
      f.st.z = z;
      f.st.yaw = yaw;
      f.st.y = -999;
      settle(f.st, g, 0, HALF, true);
      f.state = "pause";
      f.timer = 1e9;
    };
  }

  let clock = 0;
  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const nightK = nightAmount(time);
      rim.rim.value = nightK;
      tracker.update(dt, avatar.x, avatar.z);
      view.update();
      camPos.copy(env.camera.position);
      const mot = rm ? 0.6 : 1;
      const presence = foxPresence(time);
      const flee = riding ? FLEE_R * 1.6 : FLEE_R;

      for (let i = 0; i < n; i++) {
        const f = foxes[i]!;
        const st = f.st;
        if (f.state === "away") {
          f.cool -= dt;
          if (f.cool <= 0 && !inside) {
            // By day only the first fox, and only sometimes.
            const ok = (presence > 0.5 || i === 0) && R() < presence;
            if (!ok || !spawn(f)) {
              f.state = "away";
              f.cool = ok ? 2 : 15 + R() * 20;
            }
          }
          if (f.state === "away") {
            set.hide(i);
            continue;
          }
        }
        if (inside) {
          goAway(f, 4);
          set.hide(i);
          continue;
        }
        const dx = avatar.x - st.x;
        const dz = avatar.z - st.z;
        const d = Math.hypot(dx, dz);
        const seen = view.sees(st.x, st.y + 0.3, st.z, 0.7) && camPos.distanceTo(tp.set(st.x, st.y, st.z)) < 60;
        f.unseen = seen ? 0 : f.unseen + dt;
        const toAvatar = Math.atan2(dx, dz);
        // How far ahead of the traveler (along the trail) the fox is.
        const frozen = import.meta.env?.DEV ? (window as unknown as { __nfFreeze?: string }).__nfFreeze : undefined;

        let speed = 0;
        let wantSit = 0;
        let wantSniff = 0;
        let lookTarget: number | null = null;

        if (frozen) {
          wantSit = frozen === "sit" ? 1 : 0;
          wantSniff = frozen === "sniff" ? 1 : 0;
          speed = frozen === "walk" ? 2.4 : frozen === "run" ? 5 : 0;
          if (frozen === "look") lookTarget = st.yaw + 1.4;
        } else if (d < flee && f.state !== "flee") {
          f.state = "flee";
          f.timer = 2.2 + R();
          const ax = st.x - avatar.x;
          const az = st.z - avatar.z;
          const al = Math.hypot(ax, az) || 1;
          f.tx = st.x + (ax / al) * 14;
          f.tz = st.z + (az / al) * 14;
        }
        if (!frozen)
          switch (f.state) {
            case "trot": {
              speed = 2.3 * mot;
              const left = walkToward(st, g, f.tx, f.tz, speed, 3.2, dt, HALF);
              f.nextPause -= dt;
              if (left < 0.3) {
                f.legs--;
                if (f.legs <= 0 && f.unseen > 0.5) goAway(f, 6 + R() * 8);
                else if (
                  !nextLeg(f, Math.max(0, (trail.nearestT(st.x, st.z) - tracker.t) * tracker.dir * trail.length))
                )
                  f.legs = 0;
              } else if (f.nextPause <= 0) {
                f.state = "pause";
                const r = R();
                f.act = r < 0.45 ? "look" : r < 0.8 ? "sniff" : "sit";
                f.timer = f.act === "look" ? 1.4 + R() : f.act === "sniff" ? 1.8 + R() * 1.5 : 3 + R() * 3;
              }
              if (d > 45 && f.unseen > 2) goAway(f, 1 + R() * 3); // left behind: move ahead
              break;
            }
            case "pause": {
              f.timer -= dt;
              if (f.act === "look") lookTarget = d < 40 ? toAvatar : st.yaw + 2;
              else if (f.act === "sniff") wantSniff = 1;
              else {
                wantSit = 1;
                if (d < 30) lookTarget = toAvatar;
              }
              if (f.timer <= 0) {
                f.state = "trot";
                f.nextPause = 3 + R() * 5;
              }
              if (d > 45 && f.unseen > 2) goAway(f, 1 + R() * 3);
              break;
            }
            case "flee": {
              speed = 5.2 * mot;
              walkToward(st, g, f.tx, f.tz, speed, 5, dt, HALF);
              f.timer -= dt;
              if (f.timer <= 0) {
                if (f.unseen > 0.3 || d > 25) goAway(f, 8 + R() * 8);
                else {
                  f.state = "trot";
                  f.legs = 1;
                  f.nextPause = 2;
                  f.tx = st.x + Math.sin(st.yaw) * 10;
                  f.tz = st.z + Math.cos(st.yaw) * 10;
                }
              }
              break;
            }
          }
        if ((f.state as State) === "away") {
          set.hide(i);
          continue;
        }

        const k = ease(5, dt);
        f.sit += (wantSit - f.sit) * k;
        f.sniff += (wantSniff - f.sniff) * k;
        f.speed += (speed - f.speed) * ease(8, dt);
        f.amp += ((f.speed > 0.05 ? 1 : 0) - f.amp) * ease(8, dt);
        f.phase = (f.phase + (f.speed * dt) / (0.62 * SCALE)) % 1;
        const pose = st.pose;
        pose.set(STAND);
        blendInto(pose, SIT, f.sit);
        blendInto(pose, SNIFF, f.sniff);
        const run = Math.min(1, Math.max(0, (f.speed - 2.5) / 2.5));
        addGait(pose, f.phase, TROT, f.amp, (0.5 + run * 0.2) * (rm ? 0.7 : 1), 0.8);
        // Running: the tail streams out level, the head drops a little.
        pose[P.tailPitch] = pose[P.tailPitch]! + run * 0.45;
        pose[P.headPitch] = pose[P.headPitch]! + run * 0.15;
        // Sniffing: the nose works along the ground.
        if (f.sniff > 0.1) pose[P.headPitch] = pose[P.headPitch]! + Math.sin(clock * 7) * 0.06 * f.sniff * mot;
        const rel = lookTarget !== null ? Math.max(-1.5, Math.min(1.5, wrapAngle(lookTarget - st.yaw))) : 0;
        st.headYaw += (rel - st.headYaw) * ease(rm ? 3 : 6, dt);
        st.tailYaw = f.sit * 1.1 + Math.sin(clock * (1.2 + f.amp * 4) + i) * (0.08 + f.amp * 0.06) * mot;
        st.breathe = Math.sin(clock * 2.6 + i * 2) * 0.012 * mot;
        // Trot bob.
        settle(st, g, dt, HALF);
        st.y += Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.02 * f.amp * mot;
        st.slope *= 1 - f.sit * 0.5;

        set.draw(i, st);

        const hp = set.headPos[i]!;
        toCam.subVectors(camPos, hp);
        const dc = toCam.length();
        const facing = dc > 0 ? set.headFwd[i]!.dot(toCam) / dc : 0;
        st.glint = nightK * THREE.MathUtils.smoothstep(facing, 0.5, 0.9) * Math.min(1, dc / 4);
        st.eyeBoost = st.glint * Math.min(1, Math.max(0, (dc - 8) / 16));

        if (!stamped && seen && d < STAMP_R) {
          stamped = true;
          emit("world:stamp", {
            id: "fauna:zorro",
            kind: "fauna",
            label: { es: "Zorro andino", en: "Andean fox" },
          });
        }
      }
      set.flush();
    },
    dispose() {
      offInterior();
      offMount();
      set.dispose(env.scene);
      rim.dispose();
      if (import.meta.env?.DEV) {
        const w = window as unknown as { __foxes?: unknown; __foxPlace?: unknown };
        delete w.__foxes;
        delete w.__foxPlace;
      }
    },
  };
};
