/**
 * The lake's people, on the shared characters (../../characters): every person is a member of ONE crowd
 * (skinned on the GPU, LOD by distance: two draw calls for all bodies and cloth) driven by the human animation
 * controller through ../../ambient/people/npc.ts (walk cycle from the real ground speed, actions, a glance at
 * the traveler). Their tools and loads (knitting, pushka, q'ipi, net, ch'uspa) are held props, one instanced
 * draw per kind.
 *  - Uros families on the islands: a woman in a pollera and bowler hat greeting visitors at the hub island's
 *    arrival (she waves when the traveler comes close), another crouched by the hearth, two children running
 *    round the hub island, and on the other islands women weaving at a backstrap loom and men kneeling to
 *    bind their reed bundles.
 *  - Taquile: men knitting chullos seated at the edge of the plaza, and women spinning wool with the pushka by
 *    the loom (Taquile's dress: white shirts, black vests, woven belts and red chullos for the men; red
 *    polleras, belts and black head shawls for the women).
 *  - Fishermen standing in small reed boats that go round their loops on open water, casting a net now and then.
 *  - A herder sitting by her alpacas, a shepherdess spinning by her sheep, and two walkers going up and down
 *    the road between the Uros landing and Taquile.
 *  - Travellers coming and going along the whole road, both ways (8, 5 on low quality): women in polleras and
 *    bowler hats carrying their q'ipi in an aguayo on their backs, men in chullos or felt hats, some loaded too.
 *    At either end of the road they turn back; when out of sight there they reappear elsewhere on the road,
 *    also out of sight (./gente/logic.ts stepTraveller), so nobody pops in or out on screen.
 *  - At Titikala, the end of the road, an offering to the Pachamama (8 people, 5 on low): a paqo kneeling at
 *    the cloth, bending to lay out coca leaves and lifting a k'intu to his lips, pilgrims seated cross-legged
 *    round it, a woman standing with raised hands toward the rock, and a mother with her bundle watching her
 *    children play (two, one on low). The cloth and its brazier are part of ../titikala.ts.
 * By day only, except the woman at the hearth, the herder, and the paqo with one pilgrim by the brazier, who stay
 * at night (the boats rest on the water then, their fishermen home). People are solid bodies in the creatures
 * registry, so the traveler walks round them.
 * Placement and timing: ./gente/logic.ts (roles → specs, palettes, actions and props: ./gente/dress.ts).
 * Draw calls: the crowd (2), the props in use (one per kind: about 5) and the boats (1).
 */
import * as THREE from "three";
import { Npc, type NpcFrame } from "../../ambient/people/npc";
import { setAnimalNight as setNightRim } from "../../characters/animals/night";
import { HumanCrowd } from "../../characters/crowd";
import { prefetchHumans } from "../../characters/pipeline";
import { HeldProps } from "../../characters/props";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { LEVEL } from "../plan";
import { daylight } from "./fauna/logic";
import { LAKE_SPECS, lookOf, propOf, specOf } from "./gente/dress";
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
import { Build } from "./kit/build";
import { balsaBoat } from "./kit/totora";

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
  p: Npc;
  role: Role;
  home: Spot | null;
  /** Kids: angle round their circle; walkers: road t and direction; fishermen: loop index and arc. */
  u: number;
  dir: number;
  loop: number;
  /** Travellers: their road state and pace (u/s). */
  trip?: Traveller;
  pace?: number;
  /** Seconds to the next change of a cycling action (the paqo, the woman at the rock). */
  next: number;
}

/** People farther than this from the camera are not drawn nor posed (they keep moving). */
const FAR = 170;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const R = rng(0x6e7e);
  const ground = env.suyu.groundAt;
  const high = env.quality === "high";
  const list = [...spots(), ...gathering(high)];
  const trips = travellers(high ? 8 : 5);
  const n = list.length + LOOPS.length + 2 + trips.length;
  // Start the builds now (worker, far LODs first) so the people are ready by the time the traveler arrives.
  prefetchHumans(LAKE_SPECS);
  const crowd = new HumanCrowd({ capacity: n, name: "titicaca-gente:crowd", lodDist: high ? [9, 26] : [7, 20] });
  env.scene.add(crowd.group);
  const props = new HeldProps(n);
  env.scene.add(props.group);

  const make = (role: Role, seed: number): Npc => {
    const who = specOf(role, seed);
    const p = new Npc({
      kind: "titicaca-person",
      crowd,
      spec: who.spec,
      palette: who.palette(R),
      scale: who.kid ? 0.92 + R() * 0.12 : 0.96 + R() * 0.07,
      radius: who.kid ? 0.26 : 0.34,
      seed,
    });
    const prop = propOf(role, seed);
    if (prop) p.hold(props, prop.kind, prop.tint);
    p.lookRange = lookOf(role);
    return p;
  };

  const actors: Actor[] = list.map((s, i) => {
    // Seeds below 100 for the fixed spots, except the ones after Taquile's (the shepherdess and the offering).
    const p = make(s.role, i < 14 ? 3 + i * 7 : 300 + i * 7);
    p.place(s.x, s.z, s.yaw);
    return { p, role: s.role, home: s, u: (i * 1.7) % (Math.PI * 2), dir: i % 2 ? 1 : -1, loop: -1, next: 0 };
  });
  LOOPS.forEach((_, k) => {
    const p = make("fisher", 101 + k * 2);
    actors.push({ p, role: "fisher", home: null, u: 0, dir: 1, loop: k, next: 0 });
  });
  for (let k = 0; k < 2; k++) {
    const p = make("walk", 200 + k);
    const u = WALK_T[0] + (k + 0.3) * 0.08;
    const w0 = env.trail.pointAt(u);
    p.place(w0.x, w0.z);
    actors.push({ p, role: "walk", home: null, u, dir: k ? -1 : 1, loop: -1, next: 0 });
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
    actors.push({ p, role: "travel", home: null, u: 0, dir: 1, loop: -1, trip, pace: 0.95 + R() * 0.3, next: 0 });
  });
  // The actions that do not change: sitting, working, carrying (the cycling ones are set in the frame loop).
  for (const a of actors) {
    const act = STEADY[a.role];
    if (act === "carry") {
      if (propOf(a.role, a.p.seed)) a.p.anim.act("carry-back", { fade: 0 });
    } else if (act) a.p.anim.act(act, { fade: 0 });
    // Taquile's knitters sit on the ground at the plaza's edge, the needles going in their hands.
    if (a.role === "knit") a.p.anim.actArms("knit", { fade: 0 });
  }

  // Fishermen's boats: one instanced small balsa.
  const bb = new Build();
  balsaBoat(bb, 0.55, false);
  const boatGeo = bb.build() ?? new THREE.BufferGeometry();
  // The boats move: no world-space painted blotches sliding over them.
  const boatMat = paintStrength(vertexToon(), 0);
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
  const frame: NpcFrame = { dt: 0, clock: 0, rm: env.reducedMotion, avatar: new THREE.Vector3() };
  const rm = env.reducedMotion;

  const ambient: Ambient = {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      frame.dt = dt;
      frame.clock += dt;
      frame.avatar.copy(avatar);
      const clock = frame.clock;
      env.camera.getWorldPosition(camPos);
      const time = env.sky.time();
      const day = isDay(time);
      // The moon-blue rim people and animals share (the same uniform the fauna ambients set).
      setNightRim(1 - daylight(time));
      for (const a of actors) {
        const p = a.p;
        const out = day || (a.home?.night ?? false);
        // Far from the camera: still moving along (travellers, walkers, boats) but not drawn nor posed.
        const far = Math.hypot(p.x - camPos.x, p.z - camPos.z) > FAR;
        if (p.active !== (out && !far)) p.setActive(out && !far);
        if (!out) continue;
        if (a.role === "fisher") {
          const l = LOOPS[a.loop] as (typeof LOOPS)[number];
          a.u += loopRate(l) * dt;
          const b = loopPose(l, a.u);
          const bob = rm ? 0 : Math.sin(clock * 1.3 + a.loop) * 0.04;
          bp.set(b.x, LEVEL - 0.06 + bob, b.z);
          q.setFromAxisAngle(up, b.yaw);
          m4.compose(bp, q, one);
          boats.setMatrixAt(a.loop, m4);
          // Standing on the deck behind the bow, turned a little to the side the net goes out.
          p.place(b.x - Math.sin(b.yaw) * 0.5, b.z - Math.cos(b.yaw) * 0.5, b.yaw + 0.6);
          p.y = LEVEL + 0.18 + bob;
          p.speed = 0;
          if (!far) p.commit(frame);
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
          if (!far) p.commit(frame);
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
          if (!far) p.commit(frame);
          continue;
        }
        const h = a.home as Spot;
        if (far) {
          p.resolve(0.5);
          continue;
        }
        const floor = h.y ?? ground(h.x, h.z);
        switch (a.role) {
          case "kid": {
            // Round and round a little circle, each child its own way.
            a.u += dt * (rm ? 0.25 : 0.62) * a.dir;
            p.seek(h.x + Math.cos(a.u) * 1.4, h.z + Math.sin(a.u) * 1.4, rm ? 0.8 : 2.2, dt, 6);
            p.y = h.y ?? ground(p.x, p.z);
            break;
          }
          case "wave": {
            // Greets whoever comes to the island: turns to the traveler and waves; otherwise hands joined.
            p.place(h.x, h.z);
            p.y = floor;
            const d = Math.hypot(avatar.x - h.x, avatar.z - h.z);
            if (d < 10) {
              p.face(avatar.x, avatar.z, dt, 3);
              p.anim.act("wave", { side: 1 });
            } else {
              p.yaw += (h.yaw - p.yaw) * Math.min(1, dt * 2);
              p.anim.act("hands-clasp", { fade: 0.6 });
            }
            p.resolve(0.3);
            break;
          }
          case "mother": {
            // Standing with her bundle on her back, keeping an eye on the children.
            p.place(h.x, h.z);
            p.y = floor;
            p.face(h.x + 0.2, h.z + 2.7, dt, 1.5);
            p.resolve(0.2);
            break;
          }
          case "paqo": {
            // Kneeling at the cloth: bends over it to lay out the coca leaves, then lifts a k'intu to his lips.
            p.place(h.x, h.z, h.yaw);
            p.y = floor;
            a.next -= dt;
            if (a.next <= 0) {
              const bend = p.anim.action !== "crouch";
              p.anim.act(bend ? "crouch" : "kneel-offer", { fade: 0.8 });
              a.next = rm ? 30 : bend ? 4 + R() * 3 : 3 + R() * 2;
            }
            p.resolve(0.2);
            break;
          }
          case "pray": {
            // Standing toward the rock, both hands raised, palms up (the action set once above).
            p.place(h.x, h.z, h.yaw);
            p.y = floor;
            p.resolve(0.2);
            break;
          }
          default: {
            // Seated, crouched, kneeling or standing at their work (the action set once above).
            p.place(h.x, h.z, h.yaw);
            p.y = floor;
            p.resolve(0.2);
          }
        }
        p.commit(frame);
      }
      // At night the boats rest where they were, their fishermen home.
      boats.instanceMatrix.needsUpdate = true;
      crowd.update(env.camera);
      props.update();
    },
    dispose() {
      for (const a of actors) a.p.dispose();
      crowd.dispose();
      props.dispose();
      boats.dispose();
      boatGeo.dispose();
      boatMat.dispose();
      crowd.group.removeFromParent();
      props.group.removeFromParent();
      boats.removeFromParent();
    },
  };

  if (import.meta.env?.DEV) {
    const debug = {
      people: () =>
        actors.map((a) => ({
          role: a.role,
          x: +a.p.x.toFixed(1),
          z: +a.p.z.toFixed(1),
          y: +a.p.y.toFixed(2),
          active: a.p.active,
          action: a.p.anim.action,
        })),
      drawCalls: () => crowd.drawCalls() + props.drawCalls() + 1,
      crowd: () => crowd.stats(),
    };
    (window as unknown as { __gente?: typeof debug }).__gente = debug;
  }
  return ambient;
};

/** The action each role keeps (null: set in the frame loop; "carry": carry-back when holding a load). */
const STEADY: Record<Role, Parameters<Npc["anim"]["act"]>[0] | "carry" | null> = {
  wave: null,
  hearth: "tend-fire",
  sitWeave: "weave",
  work: "bind",
  kid: null,
  knit: "sit-ground",
  spin: "spin",
  herd: "sit-ground",
  fisher: "fish-cast",
  walk: null,
  travel: "carry",
  paqo: null,
  pilgrim: "sit-cross",
  pray: "pray",
  mother: "carry-back",
};
