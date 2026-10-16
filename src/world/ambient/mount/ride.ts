/**
 * A road mount any world can saddle (the jungle mule, the coast's Paso horse, the lake's llama, the Colca mule
 * and the Nazca quad bike): the mount waits at its home spot; "E · <mount>" emits
 * `world:mount {riding, speedMul, seatHeight}` (no `vehicle`: the runtime keeps walking the traveler, applies
 * the speed and lifts the avatar; avatar.ts switches to the riding pose) and the mount follows the traveler's
 * feet every frame, facing where the rider faces. "E · Bajar" or Esc dismounts; it steps aside.
 *
 * Mounts are for the road. Auto-dismount, leaving the mount at the roadside (or the last spot it was allowed
 * on): stepping onto a raised deck, leaving the road into a station's grounds (./logic.ts mountMustStop), or
 * the world's own `stopAt` (the jungle's canopy walkway, the end of the Colca mule's stretch...). Also on
 * entering an interior. A boat or raft taking over (`world:mount` with a vehicle other than "llama") drops the
 * rider silently: emitting `{riding: false}` would cancel the boat's mount in the runtime.
 * On `world:teleport` the mount is back home. No passport stamp of its own.
 * Body (creatures.ts): solid while waiting, not while ridden (the runtime widens the traveler).
 *
 * The model owns its look and its gait (`animate`, e.g. ./gait.ts); this module owns the ride.
 */
import * as THREE from "three";
import type { Ambient, L, WorldEnv } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { angleLerp, mountMustStop, ROAD_VERGE, rideAction } from "./logic";

export interface MountModel {
  group: THREE.Group;
  /** Saddle (seat) height above the feet: the rider's feet sit this high. */
  seatHeight: number;
  /** Collision radius while waiting. */
  bodyR: number;
  /** Per-frame pose: ground speed, head-look target (radians, relative to the body). */
  animate(f: { speed: number; look: number; t: number; dt: number; rm: boolean }): void;
  dispose(): void;
}

export interface RideMountOpts {
  /** Creature body name ("ride-mule"); also the group's name (the jungle's detail cull skips it). */
  name: string;
  model: MountModel;
  home: { x: number; z: number; yaw: number };
  prompts: { mount: L; dismount?: L };
  speedMul?: number;
  /** Ground with decks (what the traveler stands on) and without them (to tell a deck). */
  groundAt(x: number, z: number): number;
  layoutGroundAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  trailDistance(x: number, z: number): { d: number; t: number };
  /** Extra places the mount stops (on top of decks and station grounds). */
  stopAt?(q: { d: number; t: number }, x: number, z: number): boolean;
  /** A ride hook owns the traveler (a boat): no prompts, no E. */
  busy?(): boolean;
  /** Widest head turn when looking around, radians (default 0.9). */
  look?: number;
}

const RANGE = 2.4;
/** Within this distance of the last road spot, an auto-dismount sends the mount back there (the roadside). */
const ROADSIDE_REACH = 16;
const T_DISMOUNT: L = { es: "E · Bajar", en: "E · Dismount" };

export function createRideMount(env: WorldEnv, o: RideMountOpts): Ambient {
  const rm = env.reducedMotion;
  const promptMount = o.prompts.mount[env.lang];
  const promptDismount = (o.prompts.dismount ?? T_DISMOUNT)[env.lang];
  const hw = env.trail.halfWidth;
  const speedMul = o.speedMul ?? 1.7;
  const lookMax = o.look ?? 0.9;
  const busy = o.busy ?? (() => false);
  const { model, home } = o;
  const g = model.group;
  g.name = o.name;
  env.scene.add(g);
  g.position.set(home.x, o.groundAt(home.x, home.z), home.z);
  g.rotation.y = home.yaw;

  const body = creatures.add(o.name, model.bodyR, { x: home.x, z: home.z, give: 0.5 });
  let riding = false;
  let rider: THREE.Object3D | null = null;
  let modal = false;
  let game = false;
  let inside = false;
  let yaw = home.yaw;
  let headTarget = 0;
  let lookTimer = 2;
  let dist = Infinity;
  /** Where the mount walks to on its own (after a dismount: one step aside). */
  let walking = false;
  const walkTo = new THREE.Vector3();
  const last = new THREE.Vector3();
  let hasLast = false;
  /** Last position where the mount was allowed, and the last one on the road itself. */
  const lastOk = new THREE.Vector3();
  const lastRoad = new THREE.Vector3();

  const setMount = (mounted: boolean) => {
    riding = mounted;
    emit(
      "world:mount",
      mounted
        ? { riding: true, speedMul, seatHeight: model.seatHeight }
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

  /** Dismount in place; the mount takes one step to the rider's left so they are not inside it. */
  const dismount = () => {
    if (!riding) return;
    setMount(false);
    const x = g.position.x + Math.cos(yaw) * 1.2;
    const z = g.position.z - Math.sin(yaw) * 1.2;
    if (!o.isWater(x, z) && Math.abs(o.groundAt(x, z) - g.position.y) < 0.8) {
      walkTo.set(x, o.groundAt(x, z), z);
      walking = true;
    }
  };

  /**
   * Leave the mount by the road when the rider just came off it (out of reach of the station's own E prompts,
   * which come first in the ambient order), otherwise at the last allowed spot.
   */
  const leaveBehind = () => {
    const p = Math.hypot(lastRoad.x - g.position.x, lastRoad.z - g.position.z) < ROADSIDE_REACH ? lastRoad : lastOk;
    g.position.set(p.x, o.groundAt(p.x, p.z), p.z);
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
      // A boat took over: drop the rider without emitting (that would cancel the boat's mount).
      if (riding && d?.riding && d.vehicle !== undefined && d.vehicle !== "llama") {
        riding = false;
        leaveBehind();
      }
    }),
    on("world:teleport", () => {
      if (riding) setMount(false);
      g.position.set(home.x, o.groundAt(home.x, home.z), home.z);
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

  return {
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
        const ground = o.groundAt(x, z);
        g.position.set(x, ground, z);
        dist = 0;
        const q = o.trailDistance(x, z);
        const stop =
          o.stopAt?.(q, x, z) ||
          mountMustStop({
            q,
            halfWidth: hw,
            onDeck: ground > o.layoutGroundAt(x, z) + 0.05,
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
            g.position.y = o.groundAt(g.position.x, g.position.z);
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

      // Head: looks around when idle, at the traveler when they are close and on foot.
      if (!rm) {
        lookTimer -= dt;
        if (lookTimer <= 0) {
          headTarget = speed < 0.4 ? (Math.random() - 0.5) * lookMax : 0;
          lookTimer = 2 + Math.random() * 3;
        }
      }
      if (!riding && dist < 5) {
        let rel = Math.atan2(avatar.x - g.position.x, avatar.z - g.position.z) - yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        headTarget = THREE.MathUtils.clamp(rel, -lookMax, lookMax);
      }
      model.animate({ speed, look: headTarget, t, dt, rm });
    },
    prompt() {
      if (modal || game || inside || busy()) return null;
      if (riding) return promptDismount;
      return dist <= RANGE ? promptMount : null;
    },
    interact() {
      if (inside || busy()) return false;
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
}
