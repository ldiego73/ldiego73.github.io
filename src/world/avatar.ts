import * as THREE from "three";
import { createHuman } from "./characters/hero";
import { type Outfit, TRAVELER, TRAVELER_DRESS } from "./characters/presets";
import { dress } from "./characters/slots";
import type { Avatar, CreateAvatar, WorldEnv } from "./contract";
import { on, type SitPose } from "./events";
import { SIT_HIP } from "./seat";
import { liveWind } from "./wind";

export type { Outfit };

/**
 * Generic traveler (not a real person), dressed per world (`outfit`), built with the new characters
 * (./characters: one continuous skinned body, cloth on the wind, springs, a painted face):
 *  - "andean" (mountain, Qusqu; default): chullo with ear flaps, tassels and pompom, poncho with khipu dye
 *    bands over a sweater, long trousers, hiking boots.
 *  - "explorer" (Antisuyu jungle): wide-brim explorer hat, short-sleeved polo, bandana, belted shorts, socks.
 *  - "beach" (Chinchaysuyu coast): woven straw hat, sunglasses, open flower-print shirt over a white tee, board
 *    shorts, sandals.
 *  - "altiplano" (Collasuyu lake): felt hat with a band, knitted alpaca chompa with a patterned yoke, chalina,
 *    long trousers.
 *  - "trek" (Kuntisuyu canyon): cap with a neck flap, two-tone zipped windbreaker, cargo trousers, hiking boots.
 * All carry the backpack with a laptop edge peeking out (and a bedroll). Specs and colours: characters/presets.ts
 * (`TRAVELER`, `TRAVELER_DRESS`).
 * Origin at the feet, facing +Z (core sets group.rotation.y = yaw). About 1.63 units tall.
 * The first frame shows the far LOD (built on the spot in a few ms); the near LOD comes from the build worker.
 * All motion is procedural (characters/anim-human.ts): idle breathing + look-around + blinks, walk and run with
 * the feet following the slope, a tuck in the air, a landing squash and dust.
 * Riding (`world:mount`): astride a saddle with hands on the reins (llama, mule, horse, quad: no `vehicle`),
 * seated paddling in the canoe and on the caballito de totora, standing with the pole on the balsa.
 * Seated (`world:sit`, ./seat.ts): thighs on the seat, hands on the knees ("bench") or typing ("desk"); the
 * backpack folds away so it never sinks into a backrest.
 */

/** Height of a rider's seat above the feet origin (the pelvis rests here; mounts set `seatHeight` from it). */
export const RIDER_SEAT = 0.56;

/**
 * `outfit` is an optional extra argument (still assignable to CreateAvatar): the mountain loader calls
 * `createAvatar(env)` and gets the Andean traveler; the jungle page passes "explorer".
 */
export function createAvatar(env: WorldEnv, outfit: Outfit = "andean"): Avatar {
  const group = new THREE.Group();
  group.name = "traveler";
  // squash → the character (the runtime moves and turns `group`; the landing squash scales `squashG`).
  const squashG = new THREE.Group();
  group.add(squashG);
  const human = createHuman(TRAVELER[outfit], dress(TRAVELER_DRESS[outfit]), { lod: 0, clothAmp: 0.3 });
  squashG.add(human.group);
  human.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
  });
  const anim = human.anim;
  const pack = human.inst.bones.pack;
  const rm = env.reducedMotion;

  // ---- Dust puffs (world space, pooled)
  const dustGeo = new THREE.IcosahedronGeometry(0.12, 0);
  const dustMat = new THREE.MeshBasicMaterial({
    color: "#e9dcc4",
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const dust: Array<{ m: THREE.Mesh; life: number; v: THREE.Vector3 }> = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat);
    m.visible = false;
    env.noOutline(m);
    env.scene.add(m);
    dust.push({ m, life: 0, v: new THREE.Vector3() });
  }
  let dustIdx = 0;
  const wp = new THREE.Vector3();
  const puff = (n: number, spread: number) => {
    if (rm) return;
    group.getWorldPosition(wp);
    for (let i = 0; i < n; i++) {
      const p = dust[dustIdx++ % dust.length] as (typeof dust)[number];
      const a = Math.random() * Math.PI * 2;
      p.m.position.set(wp.x + Math.cos(a) * 0.15, wp.y + 0.05, wp.z + Math.sin(a) * 0.15);
      p.v.set(Math.cos(a) * spread, 0.5 + Math.random() * 0.4, Math.sin(a) * spread);
      p.life = 1;
      p.m.visible = true;
      p.m.scale.setScalar(0.5);
    }
  };

  // ---- Riding (`world:mount`) and sitting (`world:sit`).
  let riding = false;
  let vehicle: string | undefined;
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
    vehicle = riding ? d.vehicle : undefined;
  });
  let seated = false;
  let sitPose: SitPose = "bench";
  const offSit = on("world:sit", (d) => {
    seated = !!d?.seated;
    if (seated) sitPose = d.pose === "desk" ? "desk" : "bench";
  });

  // ---- State
  const damp = (cur: number, target: number, rate: number, dt: number) =>
    cur + (target - cur) * (1 - Math.exp(-rate * dt));
  let squash = 0;
  let wasGrounded = true;
  let lastPhase = 0;
  let packK = 1;
  const feet: [number, number] = [0, 0];
  const footW = new THREE.Vector3();
  const cosSin = { c: 1, s: 0 };

  const avatar: Avatar = {
    group,
    update(dt, s) {
      dt = Math.min(dt, 0.05);
      const sp = Math.max(0, s.speed);
      // ---- what the body is doing
      const ride = riding && rideAction(vehicle);
      if (ride) anim.act(ride, { fade: 0.25 });
      else if (seated) anim.act(sitPose === "desk" ? "type" : "sit-bench", { fade: 0.25, seat: SIT_HIP });
      else anim.act("none", { fade: 0.2 });
      const free = !ride && !seated;
      // ---- feet on the slope: terrain under each foot relative to the feet origin (only on bare ground)
      const yaw = group.rotation.y;
      cosSin.c = Math.cos(yaw);
      cosSin.s = Math.sin(yaw);
      const gx = group.position.x;
      const gz = group.position.z;
      const onGround = free && s.grounded && Math.abs(env.heightAt(gx, gz) - group.position.y) < 0.08;
      for (let i = 0; i < 2; i++) {
        const lx = (i === 0 ? 1 : -1) * 0.1;
        footW.set(gx + lx * cosSin.c, 0, gz - lx * cosSin.s);
        const want = onGround ? Math.max(-0.3, Math.min(0.3, env.heightAt(footW.x, footW.z) - group.position.y)) : 0;
        feet[i] = damp(feet[i] as number, want, 14, dt);
      }
      const w = liveWind.sample(gx, gz);
      anim.update(dt, s.t, {
        speed: free ? sp : 0,
        running: free && s.running,
        grounded: free ? s.grounded : true,
        rm,
        expression: "auto",
        windX: cosSin.c * w.x - cosSin.s * w.z,
        windZ: cosSin.s * w.x + cosSin.c * w.z,
        feetY: feet,
      });
      // Riding a road mount: a light bob with the gait (the boats move the traveler themselves).
      squashG.position.y = 0;
      if (ride === "ride" && !rm) squashG.position.y = Math.abs(Math.sin(s.t * (5 + sp))) * Math.min(1, sp / 4) * 0.035;
      // The pack folds away while seated (it would sink into a backrest).
      packK = damp(packK, seated ? 0.001 : 1, 10, dt);
      if (pack) pack.scale.setScalar(packK);
      // ---- landing squash, dust
      squash = damp(squash, 0, 9, dt);
      const sq = rm ? 0 : squash;
      squashG.scale.set(1 + sq * 0.1, 1 - sq * 0.12, 1 + sq * 0.1);
      if (free && s.grounded && s.running && sp > 1 && Math.floor(anim.phase * 2) !== Math.floor(lastPhase * 2))
        puff(2, 0.6);
      lastPhase = anim.phase;
      if (free && s.grounded && !wasGrounded) {
        squash = 1;
        puff(6, 1.2);
      }
      if (!s.grounded && wasGrounded) squash = -0.4;
      wasGrounded = s.grounded;
      for (const p of dust) {
        if (p.life <= 0) continue;
        p.life -= dt * 1.6;
        p.m.position.addScaledVector(p.v, dt);
        p.v.multiplyScalar(1 - dt * 2.5);
        p.m.scale.setScalar(0.5 + (1 - p.life) * 1.1);
        if (p.life <= 0) p.m.visible = false;
      }
    },
    dispose() {
      offMount();
      offSit();
      for (const p of dust) p.m.removeFromParent();
      dustGeo.dispose();
      dustMat.dispose();
      human.dispose();
      group.removeFromParent();
    },
  };
  return avatar;
}

/** The pose for what is ridden: a saddle (no vehicle, llama), a paddled boat, or the poled balsa. */
function rideAction(vehicle: string | undefined) {
  if (vehicle === "canoe" || vehicle === "caballito") return "paddle" as const;
  if (vehicle === "balsa") return "pole" as const;
  return "ride" as const;
}

// Still a CreateAvatar (the mountain loader calls it with env only).
createAvatar satisfies CreateAvatar;
