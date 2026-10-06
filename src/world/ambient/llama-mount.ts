/**
 * Mountable llama at the trailhead plaza. "E · Montar" near it mounts the traveler: we emit
 * `world:mount {riding, speedMul, seatHeight}` (core applies the speed and lifts the avatar; avatar.ts
 * switches to a seated pose) and the llama follows the traveler's feet every frame, facing the movement
 * direction, trotting in proportion to speed and idling when stopped.
 * "E · Bajar" or Esc dismounts and leaves the llama where you got off (it steps aside).
 * Auto-dismount: entering an interior (`world:interior {inside: true}`; the llama is left at the spot you
 * had ~0.4 s earlier, outside the door) and on `world:teleport` (the llama trots home to the trailhead,
 * so it never ends up stranded on a slope you teleported away from).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { angleLerp, llamaHome, rideAction } from "./mount/logic";
import { buildSaddledLlama, SEAT_HEIGHT } from "./mount/model";

const RANGE = 2.4;
const SPEED_MUL = 1.7;
const T_MOUNT: L = { es: "E · Montar", en: "E · Ride" };
const T_DISMOUNT: L = { es: "E · Bajar", en: "E · Dismount" };
const STAMP_LABEL: L = { es: "Paseo en llama", en: "Llama ride" };

export const create: CreateAmbient = (env) => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const rm = env.reducedMotion;
  const lang = env.lang;
  const promptMount = T_MOUNT[lang];
  const promptDismount = T_DISMOUNT[lang];

  const model = buildSaddledLlama(env);
  const g = model.group;
  env.scene.add(g);
  const home = llamaHome(env);
  g.position.set(home.x, groundAt(home.x, home.z), home.z);
  g.rotation.y = home.yaw;

  let riding = false;
  let rider: THREE.Object3D | null = null;
  let stamped = false;
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
  let dist = Infinity;
  /** Where the llama walks to on its own (after dismount: one step aside; after teleport: home). */
  let walking = false;
  const walkTo = new THREE.Vector3();
  const last = new THREE.Vector3();
  let hasLast = false;
  // Lagging snapshots of the rider's position (for the interior auto-dismount).
  const snapNow = new THREE.Vector3();
  const snapPrev = new THREE.Vector3();
  let snapClock = 0;

  const setMount = (on: boolean) => {
    riding = on;
    emit(
      "world:mount",
      on
        ? { riding: true, speedMul: SPEED_MUL, seatHeight: SEAT_HEIGHT }
        : { riding: false, speedMul: 1, seatHeight: 0 },
    );
    if (on && !stamped) {
      stamped = true;
      emit("world:stamp", { id: "ride:llama", kind: "ride", label: STAMP_LABEL });
    }
    if (on) {
      // The avatar group (avatar.ts names it "traveler"); its yaw is the movement direction.
      rider = env.scene.getObjectByName("traveler") ?? null;
      walking = false;
      hasLast = false;
      snapClock = 0;
      snapNow.copy(g.position);
      snapPrev.copy(g.position);
    }
  };

  /** Dismount in place; the llama takes one step to the rider's left so they are not inside it. */
  const dismount = () => {
    if (!riding) return;
    setMount(false);
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const x = g.position.x + lx * 1.15;
    const z = g.position.z + lz * 1.15;
    const dry = !extra?.isWater(x, z);
    if (dry && Math.abs(groundAt(x, z) - g.position.y) < 0.8) {
      walkTo.set(x, groundAt(x, z), z);
      walking = true;
    }
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
        // Leave the llama outside the door, where the rider was a moment ago.
        g.position.set(snapPrev.x, groundAt(snapPrev.x, snapPrev.z), snapPrev.z);
        walking = false;
      }
    }),
    on("world:teleport", () => {
      if (riding) setMount(false);
      walkTo.set(home.x, groundAt(home.x, home.z), home.z);
      // Teleporting away: the llama is simply back home at the trailhead.
      g.position.copy(walkTo);
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
          const d = Math.hypot(dx, dz);
          speed = d / dt;
          // Teleport-like jumps (dev hooks) don't count as running.
          if (speed > 30) speed = 0;
          else if (!rider && speed > 0.3) yaw = angleLerp(yaw, Math.atan2(dx, dz), Math.min(1, dt * 11));
        }
        // Face exactly where the rider faces (core's yaw), so the seat never twists under them.
        if (rider) yaw = rider.rotation.y;
        last.set(x, 0, z);
        hasLast = true;
        g.position.set(x, groundAt(x, z), z);
        snapClock += dt;
        if (snapClock > 0.4) {
          snapClock = 0;
          snapPrev.copy(snapNow);
          snapNow.copy(g.position);
        }
        dist = 0;
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
            g.position.y = groundAt(g.position.x, g.position.z);
            speed = 1.6;
            yaw = angleLerp(yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
          }
        }
        dist = Math.hypot(avatar.x - g.position.x, avatar.z - g.position.z);
      }
      g.rotation.y = yaw;

      // ---- animation: trot scaled by speed, idle sway when stopped
      speedS += (speed - speedS) * (1 - Math.exp(-dt * 8));
      trotW += ((speedS > 0.4 ? 1 : 0) - trotW) * (1 - Math.exp(-dt * 8));
      const amp = rm ? 0.45 : 1;
      phase += dt * (1.2 + speedS * 0.9) * Math.PI;
      const sw = Math.sin(phase);
      const legA = Math.min(0.55, 0.12 + speedS * 0.05) * trotW * amp;
      // Trot: diagonal pairs (front-left + back-right, front-right + back-left) swing together.
      model.legs[0]!.rotation.x = sw * legA;
      model.legs[3]!.rotation.x = sw * legA;
      model.legs[1]!.rotation.x = -sw * legA;
      model.legs[2]!.rotation.x = -sw * legA;
      model.body.position.y = Math.abs(Math.cos(phase)) * 0.05 * trotW * amp;
      model.body.rotation.z = Math.cos(phase) * 0.02 * trotW * amp;
      // Neck bobs with the gait; when idle the head looks around.
      idleT += dt;
      if (!rm) {
        lookTimer -= dt;
        if (lookTimer <= 0) {
          headTarget = trotW < 0.3 ? (Math.random() - 0.5) * 1.0 : 0;
          lookTimer = 2 + Math.random() * 3;
        }
      }
      // When the traveler is close and on foot, the llama looks at them.
      if (!riding && dist < 5) {
        const ax = avatar.x - g.position.x;
        const az = avatar.z - g.position.z;
        let rel = Math.atan2(ax, az) - yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        headTarget = THREE.MathUtils.clamp(rel, -0.9, 0.9);
      }
      headLook += (headTarget - headLook) * (1 - Math.exp(-dt * 3));
      model.neck.rotation.y = headLook * 0.6;
      model.head.rotation.y = headLook * 0.4;
      model.neck.rotation.x =
        Math.sin(phase * 2) * 0.05 * trotW * amp + (rm ? 0 : Math.sin(idleT * 1.3) * 0.03 * (1 - trotW));
      model.tail.rotation.x = 0.2 + Math.sin(phase * 2) * 0.25 * trotW * amp;
      model.tail.rotation.z = rm ? 0 : Math.sin(t * 1.7) * 0.15 * (1 - trotW);
      for (let i = 0; i < model.tassels.length; i++) {
        const tg = model.tassels[i]!;
        tg.rotation.x = (-0.25 * trotW + Math.sin(phase * 2 + i) * 0.3 * trotW) * amp;
        tg.rotation.z = Math.cos(phase + i * 0.7) * 0.15 * trotW * amp;
      }
    },
    prompt() {
      if (modal || game || inside) return null;
      if (riding) return promptDismount;
      return dist <= RANGE ? promptMount : null;
    },
    interact() {
      if (inside) return false;
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
