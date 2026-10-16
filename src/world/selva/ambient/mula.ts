/**
 * Mountable mule at the start of the Antisuyu road (the jungle's counterpart of the mountain llama, which
 * stays on the mountain). It waits saddled on the rim of the "puerto" plaza; "E · Montar la mula" mounts the
 * traveler: we emit `world:mount {riding, speedMul, seatHeight}` (the runtime applies the speed and lifts the
 * avatar; avatar.ts switches to the riding pose) and the mule follows the traveler's feet every frame, facing
 * the movement direction, walking in proportion to speed and idling when stopped.
 * "E · Bajar" or Esc dismounts and leaves the mule where you got off (it steps aside).
 *
 * The mule is for the road. Auto-dismount, leaving the mule at the roadside (or the last spot it was allowed on):
 *  - reaching the canopy walkway, stepping onto a raised deck (piers, jetties, boardwalks, the arcade raft),
 *    or leaving the road into a station's grounds (mula/logic.ts muleMustStop): the stops are visited on foot;
 *  - entering an interior (`world:interior {inside: true}`; none in the jungle today, kept for parity);
 *  - boarding the canoe (`world:mount` with vehicle "canoe"; normally unreachable, since the jetty is a deck):
 *    dropped silently, without emitting `{riding: false}`, which would cancel the canoe's mount in the runtime.
 * On `world:teleport` the mule is simply back home at the start of the road.
 * No passport stamp of its own (the passport catalog and its totals stay as they are).
 * Body ("ride-mule", creatures.ts): solid while waiting, not while ridden (the runtime widens the traveler).
 */
import * as THREE from "three";
import { angleLerp, rideAction } from "../../ambient/mount/logic";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { PUNKU_PROMPT_R, PUNKU_T, SPAWN_T } from "../arrival";
import type { SelvaEnv } from "../contract";
import { ride } from "../ride";
import { muleHome, muleMustStop, ROAD_VERGE } from "./mula/logic";
import { buildSaddledMule, SEAT_HEIGHT } from "./mula/model";

const RANGE = 2.4;
const SPEED_MUL = 1.7;
/** Within this distance of the last road spot, an auto-dismount sends the mule back there (the roadside). */
const ROADSIDE_REACH = 16;
const T_MOUNT: L = { es: "E · Montar la mula", en: "E · Ride the mule" };
const T_DISMOUNT: L = { es: "E · Bajar", en: "E · Dismount" };

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const S = env.selva;
  const rm = env.reducedMotion;
  const promptMount = T_MOUNT[env.lang];
  const promptDismount = T_DISMOUNT[env.lang];
  const hw = env.trail.halfWidth;

  const model = buildSaddledMule(env);
  const g = model.group;
  env.scene.add(g);
  const station = env.stationPose("puerto").position;
  const punku = env.trail.pointAt(PUNKU_T);
  const spawn = env.trail.pointAt(SPAWN_T);
  const home = muleHome({
    plaza: S.layout.plazas.find((p) => p.id === "puerto"),
    station,
    walkable: env.walkable,
    heightAt: S.groundAt,
    trailDistance: S.trailDistance,
    halfWidth: hw,
    avoid: [
      [punku.x, punku.z, PUNKU_PROMPT_R + RANGE + 0.5],
      [spawn.x, spawn.z, 2],
    ],
    roadDir: env.trail.tangentAt(SPAWN_T),
  });
  g.position.set(home.x, S.groundAt(home.x, home.z), home.z);
  g.rotation.y = home.yaw;

  const body = creatures.add("ride-mule", 0.65, { x: home.x, z: home.z, give: 0.5 });
  let riding = false;
  let rider: THREE.Object3D | null = null;
  let modal = false;
  let game = false;
  let inside = false;
  let yaw = home.yaw;
  let phase = 0;
  let trotW = 0;
  let speedS = 0;
  let idleT = 0;
  let headLook = 0;
  let headTarget = 0;
  let lookTimer = 2;
  let earT = 0;
  let dist = Infinity;
  /** Where the mule walks to on its own (after a dismount: one step aside). */
  let walking = false;
  const walkTo = new THREE.Vector3();
  const last = new THREE.Vector3();
  let hasLast = false;
  /** Last position where the mule was allowed, and the last one on the road itself. */
  const lastOk = new THREE.Vector3();
  const lastRoad = new THREE.Vector3();

  const setMount = (mounted: boolean) => {
    riding = mounted;
    emit(
      "world:mount",
      mounted
        ? { riding: true, speedMul: SPEED_MUL, seatHeight: SEAT_HEIGHT }
        : { riding: false, speedMul: 1, seatHeight: 0 },
    );
    if (mounted) {
      // The avatar group (avatar.ts names it "traveler"); its yaw is the movement direction.
      rider = env.scene.getObjectByName("traveler") ?? null;
      walking = false;
      hasLast = false;
      lastOk.copy(g.position);
      lastRoad.copy(g.position);
    }
  };

  /** Dismount in place; the mule takes one step to the rider's left so they are not inside it. */
  const dismount = () => {
    if (!riding) return;
    setMount(false);
    const x = g.position.x + Math.cos(yaw) * 1.2;
    const z = g.position.z - Math.sin(yaw) * 1.2;
    if (!S.isWater(x, z) && Math.abs(S.groundAt(x, z) - g.position.y) < 0.8) {
      walkTo.set(x, S.groundAt(x, z), z);
      walking = true;
    }
  };

  /**
   * Leave the mule by the road when the rider just came off it (out of reach of the station's own E prompts,
   * which come first in the ambient order), otherwise at the last allowed spot.
   */
  const leaveBehind = () => {
    const p = Math.hypot(lastRoad.x - g.position.x, lastRoad.z - g.position.z) < ROADSIDE_REACH ? lastRoad : lastOk;
    g.position.set(p.x, S.groundAt(p.x, p.z), p.z);
    walking = false;
  };

  const offs = [
    on("world:modal", (d) => {
      modal = !!d?.open;
    }),
    on("world:game", (d) => {
      game = !!d?.open;
    }),
    on("world:interior", (d) => {
      inside = !!d?.inside;
      if (inside && riding) {
        setMount(false);
        leaveBehind();
      }
    }),
    on("world:mount", (d) => {
      // The canoe took over: drop the rider without emitting (that would cancel the canoe's mount).
      if (riding && d?.riding && d.vehicle === "canoe") {
        riding = false;
        leaveBehind();
      }
    }),
    on("world:teleport", () => {
      if (riding) setMount(false);
      g.position.set(home.x, S.groundAt(home.x, home.z), home.z);
      yaw = home.yaw;
      walking = false;
    }),
  ];

  /** A content/passport panel is open (they may not emit world:modal): checked on demand, not per frame. */
  const panelOpen = () => {
    if (modal || game) return true;
    for (const el of document.querySelectorAll<HTMLElement>('.qn-panel.is-open, [role="dialog"][aria-modal="true"]'))
      if (!el.hidden && (el.checkVisibility?.() ?? el.offsetParent !== null)) return true;
    return false;
  };

  const ambient: Ambient = {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      let speed = 0;
      if (riding) {
        const x = avatar.x;
        const z = avatar.z;
        if (hasLast && dt > 0) {
          const dx = x - last.x;
          const dz = z - last.z;
          speed = Math.hypot(dx, dz) / dt;
          // Teleport-like jumps (dev hooks) don't count as running.
          if (speed > 30) speed = 0;
          else if (!rider && speed > 0.3) yaw = angleLerp(yaw, Math.atan2(dx, dz), Math.min(1, dt * 11));
        }
        // Face exactly where the rider faces (the runtime's yaw), so the saddle never twists under them.
        if (rider) yaw = rider.rotation.y;
        last.set(x, 0, z);
        hasLast = true;
        const ground = S.groundAt(x, z);
        g.position.set(x, ground, z);
        dist = 0;
        const q = S.trailDistance(x, z);
        const stop = muleMustStop({
          q,
          halfWidth: hw,
          onDeck: ground > S.layout.groundAt(x, z) + 0.05,
          zones: creatures.keepOuts(),
          x,
          z,
        });
        if (stop) {
          setMount(false);
          leaveBehind();
          speed = 0;
        } else {
          lastOk.copy(g.position);
          if (q.d <= hw + ROAD_VERGE) lastRoad.copy(g.position);
        }
      } else {
        if (walking) {
          const dx = walkTo.x - g.position.x;
          const dz = walkTo.z - g.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.05) walking = false;
          else {
            const step = Math.min(d, 1.6 * dt);
            g.position.x += (dx / d) * step;
            g.position.z += (dz / d) * step;
            g.position.y = S.groundAt(g.position.x, g.position.z);
            speed = 1.6;
            yaw = angleLerp(yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
          }
        }
        dist = Math.hypot(avatar.x - g.position.x, avatar.z - g.position.z);
      }
      g.rotation.y = yaw;
      body.solid = !riding;
      body.x = g.position.x;
      body.z = g.position.z;

      // ---- animation: walk/trot scaled by speed, idle sway when stopped
      speedS += (speed - speedS) * (1 - Math.exp(-dt * 8));
      trotW += ((speedS > 0.4 ? 1 : 0) - trotW) * (1 - Math.exp(-dt * 8));
      const amp = rm ? 0.45 : 1;
      phase += dt * (1.2 + speedS * 0.9) * Math.PI;
      const sw = Math.sin(phase);
      const legA = Math.min(0.5, 0.12 + speedS * 0.05) * trotW * amp;
      // Trot: diagonal pairs (front-left + back-right, front-right + back-left) swing together.
      model.legs[0]!.rotation.x = sw * legA;
      model.legs[3]!.rotation.x = sw * legA;
      model.legs[1]!.rotation.x = -sw * legA;
      model.legs[2]!.rotation.x = -sw * legA;
      model.body.position.y = Math.abs(Math.cos(phase)) * 0.045 * trotW * amp;
      model.body.rotation.z = Math.cos(phase) * 0.018 * trotW * amp;
      idleT += dt;
      if (!rm) {
        lookTimer -= dt;
        if (lookTimer <= 0) {
          headTarget = trotW < 0.3 ? (Math.random() - 0.5) * 0.9 : 0;
          lookTimer = 2 + Math.random() * 3;
        }
      }
      // When the traveler is close and on foot, the mule looks at them.
      if (!riding && dist < 5) {
        let rel = Math.atan2(avatar.x - g.position.x, avatar.z - g.position.z) - yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        headTarget = THREE.MathUtils.clamp(rel, -0.8, 0.8);
      }
      headLook += (headTarget - headLook) * (1 - Math.exp(-dt * 3));
      model.neck.rotation.y = headLook * 0.5;
      model.head.rotation.y = headLook * 0.4;
      // Neck base lean 0.6 (model.ts); it nods with the gait and breathes when idle.
      model.neck.rotation.x =
        0.6 + Math.sin(phase * 2) * 0.06 * trotW * amp + (rm ? 0 : Math.sin(idleT * 1.3) * 0.03 * (1 - trotW));
      model.tail.rotation.x = 0.25 + Math.sin(phase * 2) * 0.2 * trotW * amp;
      model.tail.rotation.z = rm ? 0 : Math.sin(t * 1.9) * 0.25 * (1 - trotW);
      // Stirrups and saddlebags swing a little with the gait.
      for (let i = 0; i < model.danglers.length; i++) {
        const d = model.danglers[i]!;
        d.rotation.x = Math.sin(phase * 2 + i) * 0.12 * trotW * amp;
        d.rotation.z = Math.cos(phase + i) * 0.06 * trotW * amp;
      }
      // An occasional ear flick when idle (flies in the jungle).
      if (!rm) {
        earT -= dt;
        if (earT < -0.25) earT = 3 + Math.random() * 4;
        model.head.rotation.z = earT < 0 ? Math.sin(earT * 40) * 0.04 : 0;
      }
    },
    prompt() {
      if (modal || game || inside || ride.active) return null;
      if (riding) return promptDismount;
      return dist <= RANGE ? promptMount : null;
    },
    interact() {
      if (inside || ride.active) return false;
      const a = rideAction({ state: riding ? "riding" : "idle", dist, range: RANGE, blocked: modal || game });
      if (a === "mount") setMount(true);
      else if (a === "dismount") dismount();
      return a !== "none";
    },
    escape() {
      // Never swallow Esc meant for an open panel (ambients get Esc before content).
      if (!riding || panelOpen()) return false;
      dismount();
      return true;
    },
    dispose() {
      creatures.remove(body);
      for (const off of offs) off();
      if (riding) {
        riding = false;
        emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
      }
      model.dispose();
    },
  };
  return ambient;
};
