/**
 * Puma (Puma concolor) — night only. One or two big cats take up lookouts on ledges and andén edges above
 * the trail, a little ahead of the traveler, and lie or sit there watching, eyes catching the light. When
 * the traveler comes within ~14 u the cat rises, holds a look, and slinks away out of sight. Now and then
 * one crosses the path ahead at a distance. They arrive at dusk (walking in to their lookout, never popping
 * in view) and leave at dawn the same way; a lookout left far behind is moved ahead while unseen.
 *
 * Night read: rim-lit toon (moonlight fresnel, see nightfauna/rig.ts), eyeshine when facing the camera.
 * Draw calls: 6 (body, head, upper legs, lower legs, tail segments, eyes) for the whole pool.
 * Stamp `fauna:puma` when one is in view within ~18 u (the cat leaves at 14 u, so the stamp radius is
 * a little wider than the 12 u used by the other animals).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { emit, on } from "../events";
import { pumaParts } from "./nightfauna/models";
import { makeQuadState, QuadSet, type QuadState, rimToon, rng, TrailTracker, View } from "./nightfauna/rig";
import {
  addGait,
  blendInto,
  ease,
  lookoutScore,
  makePose,
  nightAmount,
  P,
  TAU,
  turnToward,
  WALK,
  wrapAngle,
} from "./nightfauna/sim";
import { ground, settle, walkToward } from "./nightfauna/walk";

const SCALE = 1.1;
const ALERT_R = 14;
const STAMP_R = 18;
/** Half body length in world units (slope sampling, water look-ahead). */
const HALF = 0.85;

//                         drop  pitch  FLu   FLl   FRu   FRl   HLu    HLl   HRu    HRl  hLift hPitch tPitch tCurl
const STAND = makePose([0, 0, 0.02, -0.02, 0.02, -0.02, -0.25, 0.45, -0.25, 0.45, 0, 0.12, -1.15, 0.3]);
const SIT = makePose([0.14, -0.38, 0.38, 0, 0.38, 0, -0.82, 2.7, -0.82, 2.7, 0.05, 0.3, -0.75, 0.18]);
const LIE = makePose([0.28, 0, -1.0, -0.45, -1.0, -0.45, -1.25, 2.75, -1.25, 2.75, 0.13, -0.05, -1.3, 0.12]);
const CROUCH = makePose([0.1, 0.04, -0.22, 0.42, -0.22, 0.42, -0.45, 0.78, -0.45, 0.78, -0.07, 0.28, -0.85, 0.12]);

type State = "away" | "arrive" | "watch" | "alert" | "slink" | "cross";
interface Cat {
  st: QuadState;
  state: State;
  /** Lookout (watch spot) or crossing end. */
  sx: number;
  sz: number;
  /** Where to face while watching (a point on the trail). */
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  timer: number;
  cool: number;
  rest: "sit" | "lie";
  /** Posture weights (eased). */
  sit: number;
  lie: number;
  crouch: number;
  amp: number;
  phase: number;
  speed: number;
  look: number;
  lookT: number;
  flick: number;
  unseen: number;
  walked: number;
}

export const create: CreateAmbient = (env): Ambient => {
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const n = high ? 2 : 1;
  const R = rng(4411);
  const g = ground(env);
  const trail = env.trail;
  const rim = rimToon("#a9b8ff");
  const set = new QuadSet(env, pumaParts(), n, "puma", rim.material, SCALE, {
    tailTip: "#3a332e",
    tipFrom: 4,
    eyeDark: "#3a2a12",
    eyeGlow: "#e8f7a8",
    shadow: high,
  });
  const tracker = new TrailTracker(trail);
  const view = new View(env.camera);
  let inside = false;
  let stamped = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  const cats: Cat[] = Array.from({ length: n }, (_, i) => ({
    st: makeQuadState(makePose([])),
    state: "away" as State,
    sx: 0,
    sz: 0,
    fx: 0,
    fz: 0,
    tx: 0,
    tz: 0,
    timer: 0,
    cool: 1 + i * 6,
    rest: "lie" as const,
    sit: 0,
    lie: 0,
    crouch: 0,
    amp: 0,
    phase: R(),
    speed: 0,
    look: 0,
    lookT: 0,
    flick: 2,
    unseen: 0,
    walked: 0,
  }));

  const tp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  const farFromOthers = (c: Cat, x: number, z: number) =>
    cats.every((o) => o === c || o.state === "away" || Math.hypot(o.sx - x, o.sz - z) > 18);

  /** Clear sight line over the terrain from (ax, ay, az) to (bx, by, bz). */
  const clearLine = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8);
    for (let k = 1; k < steps; k++) {
      const u = k / steps;
      if (g.at(ax + (bx - ax) * u, az + (bz - az) * u) > ay + (by - ay) * u - 0.1) return false;
    }
    return true;
  };

  /** Best lookout ahead of the traveler: above the trail, flat, on an edge that drops toward the path. */
  const findLookout = (c: Cat) => {
    let best = -Infinity;
    let bx = 0;
    let bz = 0;
    let bfx = 0;
    let bfz = 0;
    for (let k = 0; k < 48; k++) {
      const ahead = 18 + R() * 26;
      const t = tracker.t + (tracker.dir * ahead) / trail.length;
      if (t < 0.01 || t > 0.99) continue;
      trail.pointAt(t, tp);
      trail.tangentAt(t, tan);
      const side = R() < 0.5 ? -1 : 1;
      const lat = 6 + R() * 16;
      const x = tp.x - tan.z * side * lat;
      const z = tp.z + tan.x * side * lat;
      if (Math.hypot(x, z) > 165 || g.water(x, z) || env.walkable(x, z)) continue;
      const h = g.at(x, z);
      const bumpy = Math.max(
        Math.abs(g.at(x + 0.7, z) - h),
        Math.abs(g.at(x - 0.7, z) - h),
        Math.abs(g.at(x, z + 0.7) - h),
        Math.abs(g.at(x, z - 0.7) - h),
      );
      // Unit vector toward the trail (the cat faces it).
      const ux = (tp.x - x) / lat;
      const uz = (tp.z - z) / lat;
      const drop = h - g.at(x + ux * 1.6, z + uz * 1.6);
      const s = lookoutScore({ rise: h - g.at(tp.x, tp.z), bumpy, drop, lateral: lat });
      if (s <= best || !farFromOthers(c, x, z)) continue;
      // The traveler must actually see it: from the trail abreast of it and from ~16 u before.
      const eyeY = 1.5;
      if (!clearLine(tp.x, g.at(tp.x, tp.z) + eyeY, tp.z, x, h + 0.55, z)) continue;
      trail.pointAt(t - (tracker.dir * 16) / trail.length, tan);
      if (!clearLine(tan.x, g.at(tan.x, tan.z) + eyeY, tan.z, x, h + 0.55, z)) continue;
      best = s;
      bx = x;
      bz = z;
      bfx = tp.x;
      bfz = tp.z;
    }
    if (best === -Infinity) return false;
    c.sx = bx;
    c.sz = bz;
    c.fx = bfx;
    c.fz = bfz;
    return true;
  };

  const show = (c: Cat, x: number, z: number, yaw: number) => {
    c.st.x = x;
    c.st.z = z;
    c.st.yaw = yaw;
    c.st.y = -999;
    settle(c.st, g, 0, HALF, true);
    c.walked = 0;
    c.unseen = 0;
  };

  const spawn = (c: Cat) => {
    // Now and then: cross the path ahead at a distance.
    if (R() < 0.2) {
      const ahead = 30 + R() * 10;
      const t = tracker.t + (tracker.dir * ahead) / trail.length;
      if (t > 0.01 && t < 0.99) {
        trail.pointAt(t, tp);
        trail.tangentAt(t, tan);
        const side = R() < 0.5 ? -1 : 1;
        const ax = tp.x - tan.z * side * 15;
        const az = tp.z + tan.x * side * 15;
        const bx = tp.x + tan.z * side * 16;
        const bz = tp.z - tan.x * side * 16;
        if (!g.water(ax, az) && !g.water(bx, bz) && !g.water(tp.x, tp.z)) {
          show(c, ax, az, Math.atan2(bx - ax, bz - az));
          c.state = "cross";
          c.timer = 0;
          c.tx = bx;
          c.tz = bz;
          c.sx = c.fx = tp.x;
          c.sz = c.fz = tp.z;
          c.sit = c.lie = 0;
          c.crouch = 0.3;
          return true;
        }
      }
    }
    if (!findLookout(c)) return false;
    // Walk in from behind the lookout (away from the trail), so it never pops in view.
    const ux = c.sx - c.fx;
    const uz = c.sz - c.fz;
    const ul = Math.hypot(ux, uz) || 1;
    let ax = c.sx + (ux / ul) * 6;
    let az = c.sz + (uz / ul) * 6;
    if (g.water(ax, az)) {
      ax = c.sx;
      az = c.sz;
    }
    show(c, ax, az, Math.atan2(c.sx - ax, c.sz - az));
    c.state = "arrive";
    c.rest = R() < 0.55 ? "lie" : "sit";
    c.sit = c.lie = 0;
    c.crouch = 0;
    return true;
  };

  const leave = (c: Cat, av: THREE.Vector3) => {
    // Off the trail, perpendicular to it (never along it, where the traveler is heading), and away from them.
    const st = c.st;
    const t = trail.nearestT(st.x, st.z);
    trail.pointAt(t, tp);
    trail.tangentAt(t, tan);
    let nx = -tan.z;
    let nz = tan.x;
    const lat = (st.x - tp.x) * nx + (st.z - tp.z) * nz;
    // Which side: the side it is on, or (on the path itself) the way it was already heading.
    const s = Math.abs(lat) > 2 ? Math.sign(lat) : Math.sign(Math.sin(st.yaw) * nx + Math.cos(st.yaw) * nz) || 1;
    nx *= s;
    nz *= s;
    const ax = st.x - av.x;
    const az = st.z - av.z;
    const al = Math.hypot(ax, az) || 1;
    let dx = nx + (ax / al) * 0.4;
    let dz = nz + (az / al) * 0.4;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    c.tx = st.x + dx * 25;
    c.tz = st.z + dz * 25;
    c.state = "slink";
    c.timer = 0;
    c.walked = 0;
  };

  const goAway = (c: Cat, cool: number) => {
    c.state = "away";
    c.cool = cool;
  };

  if (import.meta.env?.DEV)
    (window as unknown as { __pumas?: () => unknown }).__pumas = () =>
      cats.map((c) => ({
        state: c.state,
        x: c.st.x,
        y: c.st.y,
        z: c.st.z,
        yaw: c.st.yaw,
        fx: c.fx,
        fz: c.fz,
      }));

  if (import.meta.env?.DEV)
    (window as unknown as { __pumaPlace?: unknown }).__pumaPlace = (i: number, x: number, z: number, yaw: number) => {
      const c = cats[i]!;
      show(c, x, z, yaw);
      c.state = "watch";
    };
  let clock = 0;
  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const nightK = nightAmount(time);
      rim.rim.value = nightK;
      const night = env.sky.isNight();
      tracker.update(dt, avatar.x, avatar.z);
      view.update();
      camPos.copy(env.camera.position);
      const mot = rm ? 0.6 : 1;

      for (let i = 0; i < n; i++) {
        const c = cats[i]!;
        const st = c.st;
        if (c.state === "away") {
          c.cool -= dt;
          if (c.cool <= 0 && night && !inside) {
            if (!spawn(c)) c.cool = 2.5;
          }
          if (c.state === "away") {
            set.hide(i);
            continue;
          }
        }
        if (inside) {
          goAway(c, 4);
          set.hide(i);
          continue;
        }
        const dx = avatar.x - st.x;
        const dz = avatar.z - st.z;
        const d = Math.hypot(dx, dz);
        const seen = view.sees(st.x, st.y + 0.6, st.z, 1.4) && camPos.distanceTo(tp.set(st.x, st.y, st.z)) < 70;
        c.unseen = seen ? 0 : c.unseen + dt;
        const toAvatar = Math.atan2(dx, dz);

        let speed = 0;
        let wantSit = 0;
        let wantLie = 0;
        let wantCrouch = 0;
        let lookTarget: number | null = null;

        const frozen = import.meta.env?.DEV ? (window as unknown as { __nfFreeze?: string }).__nfFreeze : undefined;
        if (frozen) {
          wantSit = frozen === "sit" ? 1 : 0;
          wantLie = frozen === "lie" ? 1 : 0;
          wantCrouch = frozen === "crouch" ? 1 : 0;
          speed = frozen === "walk" ? 1.3 : 0;
          if (speed) st.yaw += dt * 0.3;
        } else
          switch (c.state) {
            case "arrive": {
              speed = 1.3 * mot;
              const left = walkToward(st, g, c.sx, c.sz, speed, 2.4, dt, HALF);
              if (left < 0.15) {
                c.state = "watch";
                c.timer = 0;
              }
              if (!night) leave(c, avatar);
              break;
            }
            case "watch": {
              // Settle facing the trail, then rest; keep an eye on the traveler.
              st.yaw = turnToward(st.yaw, Math.atan2(c.fx - st.x, c.fz - st.z), 1.4 * dt);
              if (c.rest === "sit") wantSit = 1;
              else wantLie = 1;
              c.timer += dt;
              if (d < 40) lookTarget = toAvatar;
              if (d < ALERT_R) {
                c.state = "alert";
                c.timer = 0;
              } else if (!night) leave(c, avatar);
              else if (d > 55 && c.unseen > 1.5) goAway(c, 1 + R() * 3); // left behind: move ahead
              break;
            }
            case "alert": {
              // Rise, hold a long look at the traveler, then go.
              c.timer += dt;
              lookTarget = toAvatar;
              st.yaw = turnToward(st.yaw, toAvatar, 0.8 * dt);
              if (c.timer > 1.6 || d < 6) leave(c, avatar);
              break;
            }
            case "slink": {
              speed = (d < 9 ? 3.4 : 2.3) * mot;
              wantCrouch = 1;
              const left = walkToward(st, g, c.tx, c.tz, speed, 2.2, dt, HALF);
              c.walked += speed * dt;
              if (c.unseen > 1.2 && (night ? d > 18 : true)) goAway(c, night ? 8 + R() * 10 : 1 + i * 6);
              else if (left < 0.5 || c.walked > 40) {
                // Still in view: keep going the same way.
                const yx = Math.sin(st.yaw);
                const yz = Math.cos(st.yaw);
                c.tx = st.x + yx * 15;
                c.tz = st.z + yz * 15;
                if (c.walked > 60) goAway(c, 10);
              }
              break;
            }
            case "cross": {
              // Crossing the path well ahead; if the traveler closes in, stop and look, then slip away.
              speed = 2.3 * mot;
              wantCrouch = 0.3;
              if (d < ALERT_R) {
                c.state = "alert";
                c.timer = 0.6;
                break;
              }
              const left = walkToward(st, g, c.tx, c.tz, speed, 2, dt, HALF);
              if (left < 0.4) {
                if (c.unseen > 0.5) goAway(c, 10 + R() * 10);
                else {
                  c.tx = st.x + Math.sin(st.yaw) * 12;
                  c.tz = st.z + Math.cos(st.yaw) * 12;
                }
              } else if (c.unseen > 3 && d > 30) goAway(c, 10);
              break;
            }
          }
        if ((c.state as State) === "away") {
          set.hide(i);
          continue;
        }

        // Postures and gait.
        const k = ease(3, dt);
        c.sit += (wantSit - c.sit) * k;
        c.lie += (wantLie - c.lie) * k;
        c.crouch += (wantCrouch - c.crouch) * k;
        c.speed += (speed - c.speed) * ease(6, dt);
        c.amp += ((c.speed > 0.05 ? 1 : 0) - c.amp) * ease(6, dt);
        c.phase = (c.phase + (c.speed * dt) / (1.25 * SCALE)) % 1;
        const pose = st.pose;
        pose.set(STAND);
        blendInto(pose, CROUCH, c.crouch);
        blendInto(pose, SIT, c.sit);
        blendInto(pose, LIE, c.lie);
        addGait(pose, c.phase, WALK, c.amp, 0.42 * (rm ? 0.7 : 1), 0.65);
        // Head: track the traveler (clamped), otherwise scan slowly.
        c.lookT -= dt;
        if (lookTarget === null && c.lookT <= 0) {
          c.lookT = 2 + R() * 4;
          c.look = (R() - 0.5) * 1.6;
        }
        const rel = lookTarget !== null ? Math.max(-1.2, Math.min(1.2, wrapAngle(lookTarget - st.yaw))) : c.look;
        st.headYaw += (rel - st.headYaw) * ease(rm ? 2 : 4, dt);
        // Tail: slow sway, and the occasional flick of the tip while resting.
        c.flick -= dt;
        if (c.flick < 0) c.flick = 3 + R() * 5;
        const flick = c.flick < 0.6 ? Math.sin((c.flick / 0.6) * TAU) * 0.5 : 0;
        const restSway = (c.sit + c.lie) * 0.9;
        st.tailYaw = restSway + Math.sin(clock * 0.9 + i) * 0.12 * mot + flick * mot;
        pose[P.tailCurl] = pose[P.tailCurl]! + Math.abs(flick) * 0.2;
        st.breathe = Math.sin(clock * 1.7 + i * 2) * 0.012 * mot;
        settle(st, g, dt, HALF);
        // Lying down flattens the slope a bit (the cat sits on its tread).
        st.slope *= 1 - (c.sit + c.lie) * 0.5;

        set.draw(i, st);

        // Eyeshine: at night, when the head faces the camera.
        const hp = set.headPos[i]!;
        toCam.subVectors(camPos, hp);
        const dc = toCam.length();
        const facing = dc > 0 ? set.headFwd[i]!.dot(toCam) / dc : 0;
        const blink = Math.sin(clock * 0.7 + i * 3) > 0.985 ? 0 : 1;
        st.glint = nightK * THREE.MathUtils.smoothstep(facing, 0.45, 0.9) * blink * Math.min(1, dc / 6);
        st.eyeBoost = st.glint * Math.min(1, Math.max(0, (dc - 8) / 16));

        if (!stamped && seen && d < STAMP_R) {
          stamped = true;
          emit("world:stamp", { id: "fauna:puma", kind: "fauna", label: { es: "Puma", en: "Puma" } });
        }
      }
      set.flush();
    },
    dispose() {
      offInterior();
      set.dispose(env.scene);
      rim.dispose();
      if (import.meta.env?.DEV) {
        const w = window as unknown as { __pumas?: unknown; __pumaPlace?: unknown };
        delete w.__pumas;
        delete w.__pumaPlace;
      }
    },
  };
};
