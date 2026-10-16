/**
 * The lake's people, all on one instanced crowd (the mountain's people rig, ../../ambient/people, with three
 * additive parts of our own: the bowler hat, the pushka and the knitting, ./gente/parts.ts):
 *  - Uros families on the islands: a woman in a pollera and bowler hat greeting visitors at the hub island's
 *    arrival (she waves when the traveler comes close), another by the hearth, two children running round the
 *    hub island, and on the other islands people weaving and mending reed bundles.
 *  - Taquile: men knitting chullos, seated at the edge of the plaza, and women spinning wool with the pushka by
 *    the loom (Taquile's dress: black vests and red chullos, red skirts and black shawls).
 *  - Fishermen standing in small reed boats that go round their loops on open water.
 *  - A herder sitting by her alpacas, a shepherdess spinning by her sheep, and two walkers going up and down
 *    the road between the Uros landing and Taquile.
 *  - Travellers coming and going along the whole road, both ways (8, 5 on low quality): women in polleras and
 *    bowler hats carrying their q'ipi in an aguayo on their backs, men in chullos or felt hats, some loaded too.
 *    At either end of the road they turn back; when out of sight there they reappear elsewhere on the road,
 *    also out of sight (./gente/logic.ts stepTraveller), so nobody pops in or out on screen.
 *  - At Titikala, the end of the road, an offering to the Pachamama (8 people, 5 on low): a paqo kneeling at
 *    the cloth laying out coca leaves and lifting a k'intu to his lips, pilgrims seated round it, a woman with
 *    raised hands toward the rock, and a mother with her bundle watching her children play (two, one on low). The cloth and its
 *    brazier are part of ../titikala.ts.
 * By day only, except the woman at the hearth, the herder, and the paqo with one pilgrim by the brazier, who stay
 * at night (the boats rest on the water then, their fishermen home). People are solid bodies in the creatures
 * registry, so the traveler walks round them.
 * Placement and timing: ./gente/logic.ts. Draw calls: one per worn part (about 17) plus the boats (one).
 */
import * as THREE from "three";
import {
  DARKS,
  MAN,
  type PartName,
  POLLERAS,
  PONCHOS,
  partSpecs,
  SHADOW_PARTS,
  SKINS,
  WEAVES,
  WOMAN,
} from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, type Palette, paletteMaterial } from "../../ambient/people/rig";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { LEVEL } from "../plan";
import {
  gathering,
  isDay,
  LOOPS,
  loopPose,
  loopRate,
  type Role,
  type Spot,
  spots,
  stepTraveller,
  TRAVEL_HIDE,
  type Traveller,
  travellers,
  WALK_T,
} from "./gente/logic";
import { lakePartSpecs } from "./gente/parts";
import { Build } from "./kit/build";
import { balsaBoat } from "./kit/totora";

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Actor {
  p: Person;
  role: Role;
  home: Spot | null;
  /** Kids: angle round their circle; walkers: road t and direction; fishermen: loop index and arc. */
  u: number;
  dir: number;
  loop: number;
  /** Travellers: their road state and pace (u/s). */
  trip?: Traveller;
  pace?: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const R = rng(0x6e7e);
  const ground = env.suyu.groundAt;
  const high = env.quality === "high";
  const list = [...spots(), ...gathering(high)];
  const trips = travellers(high ? 8 : 5);
  const n = list.length + LOOPS.length + 2 + trips.length;
  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const crowd = new Crowd(
    [...partSpecs([...MAN, ...WOMAN, "chullo", "sombrero", "bundle", "pouch"]), ...lakePartSpecs()],
    n,
    mat,
    SHADOW_PARTS,
  );
  env.scene.add(crowd.group);

  const make = (role: Role, seed: number): Person => {
    const kid = role === "kid";
    const man =
      role === "knit" ||
      role === "work" ||
      role === "fisher" ||
      role === "paqo" ||
      ((role === "walk" || role === "travel" || role === "pilgrim") && seed % 2 === 0) ||
      (kid && seed % 2 === 1);
    // Only Taquile's own weavers wear Taquile's dress (the shepherdess spins too, in a pollera).
    const taquile = role === "knit" || (role === "spin" && seed < 100);
    const wear: string[] = man ? [...MAN] : [...WOMAN];
    if (role === "knit") wear.push("chullo", "knitting");
    else if (role === "spin") wear.push("pushka", ...(taquile ? [] : ["bombin"]));
    else if (role === "paqo") wear.push("chullo", "pouch");
    else if (role === "travel" && man)
      wear.push(seed % 3 === 0 ? "sombrero" : "chullo", ...(seed % 4 === 0 ? ["bundle"] : []));
    else if (role === "travel" || role === "mother") wear.push("bombin", "bundle");
    else if (man) wear.push("chullo");
    else if (!kid) wear.push("bombin");
    let palette: Palette;
    if (taquile && man) palette = [pick(R, SKINS), "#2a2420", "#b8282f", "#1f1a17"];
    else if (taquile) palette = [pick(R, SKINS), "#b8282f", "#2f7a46", "#1f1a17"];
    else if (man) palette = [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)];
    else palette = [pick(R, SKINS), pick(R, POLLERAS), pick(R, WEAVES), pick(R, PONCHOS)];
    return new Person({
      kind: "titicaca-person",
      crowd,
      idx: crowd.alloc(),
      // The lake parts (./gente/parts.ts) live in the same crowd; the rig wears parts by name.
      wear: wear as unknown as PartName[],
      palette,
      scale: kid ? 0.62 : man ? 0.97 + R() * 0.06 : 0.9 + R() * 0.06,
      headScale: kid ? 1.3 : 1,
      radius: kid ? 0.26 : 0.34,
      seed,
    });
  };

  const actors: Actor[] = list.map((s, i) => {
    // Seeds below 100 for the fixed spots, except the ones after Taquile's (the shepherdess and the offering).
    const p = make(s.role, i < 14 ? 3 + i * 7 : 300 + i * 7);
    p.place(s.x, s.z, s.yaw);
    return { p, role: s.role, home: s, u: (i * 1.7) % (Math.PI * 2), dir: i % 2 ? 1 : -1, loop: -1 };
  });
  LOOPS.forEach((_, k) => {
    const p = make("fisher", 101 + k * 2);
    actors.push({ p, role: "fisher", home: null, u: 0, dir: 1, loop: k });
  });
  for (let k = 0; k < 2; k++) {
    const p = make("walk", 200 + k);
    const u = WALK_T[0] + (k + 0.3) * 0.08;
    const w0 = env.trail.pointAt(u);
    p.place(w0.x, w0.z);
    actors.push({ p, role: "walk", home: null, u, dir: k ? -1 : 1, loop: -1 });
  }
  trips.forEach((trip, k) => {
    const p = make("travel", 500 + k * 3);
    const tp0 = env.trail.pointAt(trip.u);
    const tg0 = env.trail.tangentAt(trip.u);
    p.place(
      tp0.x - tg0.z * 1.1 * trip.dir,
      tp0.z + tg0.x * 1.1 * trip.dir,
      Math.atan2(tg0.x * trip.dir, tg0.z * trip.dir),
    );
    actors.push({ p, role: "travel", home: null, u: 0, dir: 1, loop: -1, trip, pace: 0.95 + R() * 0.3 });
  });

  // Fishermen's boats: one instanced small balsa.
  const bb = new Build();
  balsaBoat(bb, 0.55, false);
  const boatGeo = bb.build() ?? new THREE.BufferGeometry();
  const boatMat = vertexToon();
  const boats = new THREE.InstancedMesh(boatGeo, boatMat, LOOPS.length);
  boats.name = "titicaca-gente:boats";
  boats.castShadow = true;
  boats.frustumCulled = false;
  env.scene.add(boats);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const bp = new THREE.Vector3();

  LOOPS.forEach((l, k) => {
    const b = loopPose(l, 0);
    q.setFromAxisAngle(up, b.yaw);
    boats.setMatrixAt(k, m4.compose(bp.set(b.x, LEVEL - 0.06, b.z), q, one));
  });

  const camPos = new THREE.Vector3();
  const hp = new THREE.Vector3();
  /** A road point is out of sight: beyond the people's draw distance from the camera. */
  const hidden = (t: number) => {
    env.trail.pointAt(t, hp);
    return Math.hypot(hp.x - camPos.x, hp.z - camPos.z) > TRAVEL_HIDE;
  };
  const tp = new THREE.Vector3();
  const tg = new THREE.Vector3();
  let clock = 0;
  const rm = env.reducedMotion;

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(camPos);
      const day = isDay(env.sky.time());
      for (const a of actors) {
        const p = a.p;
        const out = day || (a.home?.night ?? false);
        if (p.active !== out) p.setActive(out);
        if (!p.active) continue;
        // Far from the camera: in the world (solid) but not drawn, no posing.
        const far = Math.hypot(p.x - camPos.x, p.z - camPos.z) > 170;
        if (a.role === "fisher") {
          const l = LOOPS[a.loop] as (typeof LOOPS)[number];
          a.u += loopRate(l) * dt;
          const b = loopPose(l, a.u);
          const bob = rm ? 0 : Math.sin(clock * 1.3 + a.loop) * 0.04;
          bp.set(b.x, LEVEL - 0.06 + bob, b.z);
          q.setFromAxisAngle(up, b.yaw);
          m4.compose(bp, q, one);
          boats.setMatrixAt(a.loop, m4);
          p.place(b.x - Math.sin(b.yaw) * 0.5, b.z - Math.cos(b.yaw) * 0.5, b.yaw + 0.6);
          p.y = LEVEL + 0.42 + bob;
          if (far) {
            p.hide();
            continue;
          }
          p.rest(clock, rm);
          // Hauling a line now and then.
          const pull = rm ? 0 : Math.max(0, Math.sin(clock * 0.7 + a.loop * 2)) * 0.9;
          p.bones.armR.rotation.x = -0.6 - pull;
          p.bones.armL.rotation.x = -0.4 - pull * 0.6;
          p.commit();
          continue;
        }
        if (a.role === "travel" && a.trip) {
          // The whole road, on its right-hand side; turning or reappearing at the ends (./gente/logic.ts).
          const tr = a.trip;
          const prevU = tr.u;
          stepTraveller(tr, dt, a.pace ?? 1, env.trail.length, hidden, Math.random);
          env.trail.pointAt(tr.u + tr.dir * 0.004, tp);
          env.trail.tangentAt(tr.u, tg);
          const ox = tp.x - tg.z * 1.1 * tr.dir;
          const oz = tp.z + tg.x * 1.1 * tr.dir;
          // Reappeared elsewhere (out of sight): jump there instead of walking.
          if (Math.abs(tr.u - prevU) > 0.01) p.place(ox, oz, Math.atan2(tg.x * tr.dir, tg.z * tr.dir));
          p.seek(ox, oz, a.pace ?? 1, dt, 3);
          p.y = ground(p.x, p.z);
          if (far) {
            p.hide();
            continue;
          }
          p.rest(clock, rm);
          p.gait(dt, rm);
          p.commit();
          continue;
        }
        if (a.role === "walk") {
          // Up and down the road on its right-hand side.
          const L = env.trail.length;
          a.u += (a.dir * 1.05 * dt) / L;
          if (a.u > WALK_T[1] || a.u < WALK_T[0]) a.dir = -a.dir;
          a.u = Math.max(WALK_T[0], Math.min(WALK_T[1], a.u));
          env.trail.pointAt(a.u + a.dir * 0.004, tp);
          env.trail.tangentAt(a.u, tg);
          const side = a.dir;
          p.seek(tp.x - tg.z * 1.1 * side, tp.z + tg.x * 1.1 * side, 1.05, dt, 3);
          p.y = ground(p.x, p.z);
          if (far) {
            p.hide();
            continue;
          }
          p.rest(clock, rm);
          p.gait(dt, rm);
          p.commit();
          continue;
        }
        const h = a.home as Spot;
        if (far) {
          p.resolve(0.5);
          p.hide();
          continue;
        }
        p.rest(clock, rm);
        const b = p.bones;
        switch (a.role) {
          case "kid": {
            // Round and round a little circle on the hub island, each child its own way.
            a.u += dt * (rm ? 0.25 : 0.62) * a.dir;
            p.seek(h.x + Math.cos(a.u) * 1.4, h.z + Math.sin(a.u) * 1.4, rm ? 0.8 : 2.2, dt, 6);
            p.y = h.y ?? ground(p.x, p.z);
            p.gait(dt, rm);
            break;
          }
          case "wave": {
            p.place(h.x, h.z);
            p.y = h.y ?? ground(h.x, h.z);
            const d = Math.hypot(avatar.x - h.x, avatar.z - h.z);
            if (d < 10) {
              p.face(avatar.x, avatar.z, dt, 3);
              b.armR.rotation.z = -2.4 + (rm ? 0 : Math.sin(clock * 7) * 0.35);
            } else p.yaw += (h.yaw - p.yaw) * Math.min(1, dt * 2);
            p.resolve(0.3);
            break;
          }
          case "hearth":
          case "sitWeave":
          case "herd":
          case "knit": {
            p.place(h.x, h.z, h.yaw);
            p.y = (h.y ?? ground(h.x, h.z)) + 0.02;
            p.sit(clock, rm, a.role === "knit" ? 0.2 : 0.12);
            if (a.role === "knit" || a.role === "sitWeave") {
              // Hands forward and together, needles (or a small loom) moving.
              const k = rm ? 0 : Math.sin(clock * 6 + p.seed) * 0.08;
              b.armL.rotation.set(-1.05 + k, 0, -0.35);
              b.armR.rotation.set(-1.05 - k, 0, 0.35);
              b.head.rotation.x = 0.35;
            } else if (a.role === "hearth") {
              b.armL.rotation.set(-0.9, 0, 0.1);
              b.armR.rotation.set(-0.9, 0, -0.1);
            }
            p.resolve(0.2);
            break;
          }
          case "work": {
            // Kneeling over a bundle, binding it: bent over, arms working.
            p.place(h.x, h.z, h.yaw);
            p.y = (h.y ?? ground(h.x, h.z)) - 0.3;
            b.legL.rotation.x = -1.2;
            b.legR.rotation.x = -0.2;
            b.torso.rotation.x = 0.55;
            const k = rm ? 0 : Math.sin(clock * 3 + p.seed);
            b.armL.rotation.set(-0.9 + k * 0.25, 0, 0.2);
            b.armR.rotation.set(-0.9 - k * 0.25, 0, -0.2);
            p.resolve(0.2);
            break;
          }
          case "paqo": {
            // Kneeling at the cloth: lays out coca leaves, then lifts a k'intu to his lips and blows on it.
            p.place(h.x, h.z, h.yaw);
            p.y = ground(h.x, h.z) - 0.3;
            b.legL.rotation.x = -1.25;
            b.legR.rotation.x = -1.25;
            const cyc = rm ? 0 : (clock * 0.25 + p.seed * 0.1) % 1;
            if (cyc < 0.6) {
              // Bent over the cloth, placing leaves one by one.
              const k = rm ? 0 : Math.sin(clock * 2.2);
              b.torso.rotation.x = 0.45;
              b.armR.rotation.set(-1.1 + k * 0.2, 0, -0.15);
              b.armL.rotation.set(-0.8, 0, 0.25);
              b.head.rotation.x = 0.3;
            } else {
              // Upright, the k'intu held before his mouth.
              b.torso.rotation.x = 0.05;
              b.armR.rotation.set(-2.1, 0, 0.35);
              b.armL.rotation.set(-0.6, 0, 0.2);
              b.head.rotation.x = -0.1;
            }
            p.resolve(0.2);
            break;
          }
          case "pilgrim": {
            // Seated round the cloth, hands in the lap, head a little bowed.
            p.place(h.x, h.z, h.yaw);
            p.y = ground(h.x, h.z) + 0.02;
            p.sit(clock, rm, -0.05);
            b.armL.rotation.set(-0.7, 0, 0.35);
            b.armR.rotation.set(-0.7, 0, -0.35);
            b.head.rotation.x = 0.25;
            p.resolve(0.2);
            break;
          }
          case "pray": {
            // Standing toward the rock; now and then both hands rise, palms up.
            p.place(h.x, h.z, h.yaw);
            p.y = ground(h.x, h.z);
            const up = rm ? 0.5 : Math.max(0, Math.sin(clock * 0.5 + p.seed));
            b.armL.rotation.set(-0.4 - up * 1.9, 0, 0.3);
            b.armR.rotation.set(-0.4 - up * 1.9, 0, -0.3);
            b.head.rotation.x = -0.2 * up;
            p.resolve(0.2);
            break;
          }
          case "mother": {
            // Standing with her bundle, keeping an eye on the children.
            p.place(h.x, h.z);
            p.y = ground(h.x, h.z);
            p.face(h.x + 0.2, h.z + 2.7, dt, 1.5);
            b.armL.rotation.set(-0.5, 0, 0.1);
            b.armR.rotation.set(-0.5, 0, -0.1);
            p.resolve(0.2);
            break;
          }
          case "spin": {
            // Standing, the left hand high with the wool, the right low spinning the pushka.
            p.place(h.x, h.z, h.yaw);
            p.y = ground(h.x, h.z);
            b.armL.rotation.set(-1.5, 0, 0.25);
            b.armR.rotation.set(-0.3, 0, -0.15);
            b.handR.rotation.y = rm ? 0 : clock * 9;
            if (!rm) p.y += Math.sin(clock * 1.2 + p.seed) * 0.005;
            p.resolve(0.2);
            break;
          }
        }
        p.commit();
      }
      // At night the boats rest where they were, their fishermen home.
      boats.instanceMatrix.needsUpdate = true;
      crowd.flush();
    },
    dispose() {
      for (const a of actors) a.p.dispose();
      crowd.dispose();
      mat.dispose();
      boats.dispose();
      boatGeo.dispose();
      boatMat.dispose();
      crowd.group.removeFromParent();
      boats.removeFromParent();
    },
  };
};
