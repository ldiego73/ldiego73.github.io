/**
 * People who come and go along the whole Kuntisuyu road, and the people gathered at its end.
 *  - On the road (./viajeros/logic.ts TRAVELLERS): each walks a stretch there and back, on their own side of
 *    the road, pausing and turning at its ends and waiting while the traveler stands in their way. Along the
 *    canyon rim: women of the valley in embroidered dress (the white Cabanaconde or Collagua hat, one with a
 *    basket), a farmer with his bundle, walkers with packs and caps, and a farmer leading two pack llamas; on
 *    the descent and the climb back to the rim, walkers and a Cabanaconde woman; on the Nazca pampa,
 *    archaeologists in canvas sun hats, visitors with packs, and people from Nasca in felt hats.
 *  - At the Cruz del Cóndor (GATHER): visitors along the parapet watching the condors (one taking photos,
 *    one resting on a bench), a vendor spinning yarn by her textiles laid out on a cloth, a woman of
 *    Cabanaconde, and two children playing near the sign. The way from the road's end to the cross stays clear.
 * Everyone is out by day and goes home at dusk (switched while unseen, or at once on a clock jump). People
 * far from the camera are taken out of the world (not drawn, bodies parked), so only the near ones cost.
 *
 * Rendering: the shared characters (../../characters): everyone is a member of ONE crowd (skinned on the GPU,
 * LOD by distance, two draw calls for all bodies and cloth) driven by the human animation controller
 * (../../ambient/people/npc.ts: the walk cycle from the real speed, carrying, herding, spinning, sitting on a
 * bench, a glance at the traveler); loads and tools (q'ipi, baskets, staff, drop spindle) are held props (one
 * instanced draw per kind); the two llamas are a herd (./wild/herds.ts, one instanced draw per LOD); the
 * vendor's cloth is one merged mesh and the mantas she hangs behind her one cloth mesh on the shared wind
 * (../cloth.ts). Everyone is a creatures body (solid).
 */
import * as THREE from "three";
import { Npc } from "../../ambient/people/npc";
import { prefetchAnimals } from "../../characters/animals/assets";
import type { HumanSpec } from "../../characters/archetype";
import { HumanCrowd } from "../../characters/crowd";
import { prefetchHumans } from "../../characters/pipeline";
import type { Action } from "../../characters/poses";
import { HeldProps, type PropKind } from "../../characters/props";
import type { Dress } from "../../characters/slots";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { ClothKit, clothMesh } from "../cloth";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { COLCA, outdoor, rng, valleyMan, valleyWoman } from "./gente/dress";
import {
  BLOCK_R,
  GATHER,
  type GatherSpot,
  isDay,
  LANE,
  laneSide,
  PLAY,
  type Role,
  STALL,
  startWalk,
  stepWalk,
  TRAVELLERS,
  type TravellerSpec,
  type Walk,
} from "./viajeros/logic";
import { packLlamas } from "./wild/herds";

/** Road people are drawn within this camera distance (taken out beyond, with a little hysteresis). */
const VIEW = 160;
/** The gathering is drawn within this distance of the Cruz. */
const GATHER_VIEW = 130;
const FILE_GAP = 2.3;
/** Height of the Cruz's stone benches (../cruz.ts) for the visitor resting on one. */
const BENCH_SEAT = 0.42;

/** One person's look: archetype, palette, height jitter, what they carry and how they carry it. */
interface Outfit {
  spec: HumanSpec;
  palette: Dress;
  scale: number;
  kid?: boolean;
  prop?: { kind: PropKind; tint?: string; act: Action };
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const ground = env.suyu.groundAt;
  const R = rng(0x7a1e);
  const roadSpecs = TRAVELLERS.filter((s) => high || !s.high);
  const gatherSpecs = GATHER.filter((g) => high || !g.high);

  const crowd = new HumanCrowd({ capacity: roadSpecs.length + gatherSpecs.length, name: "colca-viajeros:crowd" });
  env.scene.add(crowd.group);
  const props = new HeldProps(8);
  props.rm = env.reducedMotion;
  env.scene.add(props.group);

  const woman = (spec: HumanSpec, prop?: Outfit["prop"]): Outfit => ({
    spec,
    palette: valleyWoman(R),
    scale: 0.95 + R() * 0.06,
    prop,
  });
  const walker = (spec: HumanSpec, khaki = false): Outfit => ({
    spec,
    palette: outdoor(R, khaki),
    scale: 0.96 + R() * 0.08,
  });
  const outfitFor = (role: Role | GatherSpot["role"], i: number): Outfit => {
    switch (role) {
      case "cabana":
        return woman(COLCA.cabana);
      case "collagua":
        return woman(COLCA.collagua);
      case "basket":
        return woman(COLCA.cabana, { kind: "basket-hand", tint: "#b98a4e", act: "carry-hand" });
      case "vendor":
        return woman(COLCA.collagua, { kind: "pushka", act: "spin" });
      case "farmer":
        return {
          spec: COLCA.man,
          palette: valleyMan(R),
          scale: 0.98 + R() * 0.05,
          prop: { kind: "qipi", tint: "#c4383f", act: "carry-back" },
        };
      case "caravan":
        return {
          spec: COLCA.man,
          palette: valleyMan(R),
          scale: 0.98 + R() * 0.05,
          prop: { kind: "staff", act: "herd" },
        };
      case "trekker":
        return walker(i % 2 ? COLCA.trekkerWoman : COLCA.trekker);
      case "archaeologist":
        return walker(i % 2 ? COLCA.archaeologistWoman : COLCA.archaeologist, true);
      case "tourist":
        return i % 3 === 2
          ? walker(i % 2 ? COLCA.touristWoman : COLCA.tourist)
          : walker(i % 2 ? COLCA.trekkerWoman : COLCA.trekker);
      case "local-man":
        return { spec: COLCA.nascaMan, palette: valleyMan(R), scale: 0.97 + R() * 0.05 };
      case "local-woman":
        return {
          spec: COLCA.nascaWoman,
          palette: { ...valleyWoman(R), hat: "#3b2c25", hatBand: "#c4383f" },
          scale: 0.94 + R() * 0.05,
          prop: { kind: "basket-hand", tint: "#b98a4e", act: "carry-hand" },
        };
      case "kid":
        return i % 2
          ? { spec: COLCA.boy, palette: valleyMan(R), scale: 0.92 + R() * 0.1, kid: true }
          : { spec: COLCA.girl, palette: valleyWoman(R), scale: 0.92 + R() * 0.1, kid: true };
    }
  };
  const outfits = new Set<HumanSpec>();
  const person = (o: Outfit, seed: number) => {
    outfits.add(o.spec);
    const p = new Npc({
      kind: o.kid ? "child" : "colca-person",
      crowd,
      spec: o.spec,
      palette: o.palette,
      scale: o.scale,
      radius: o.kid ? 0.26 : 0.34,
      seed,
    });
    if (o.prop) p.hold(props, o.prop.kind, o.prop.tint);
    return { p, act: o.prop?.act ?? ("none" as Action) };
  };

  // ------------------------------------------------------------------ road walkers
  interface Walker {
    spec: TravellerSpec;
    w: Walk;
    p: Npc;
    /** What they do while walking (carry a load, herd with the staff) — "none" for plain walking. */
    act: Action;
    v: number;
  }
  const walkers: Walker[] = roadSpecs.map((spec, i) => {
    const { p, act } = person(outfitFor(spec.role, i), 11 + i * 7.7);
    return { spec, w: startWalk(spec), p, act, v: 0 };
  });
  const caravan = walkers.find((w) => w.spec.role === "caravan");
  const nLlamas = caravan ? 2 : 0;
  if (nLlamas) prefetchAnimals(["llama"]);
  const herd = packLlamas("colca-viajeros:llamas", Math.max(1, nLlamas));
  env.scene.add(herd.group);
  const llamaIds = Array.from({ length: nLlamas }, (_, k) => herd.add({ seed: 31 + k * 7, variant: k + 1 }));
  const llamaBodies = Array.from({ length: nLlamas }, () => creatures.add("llama", 0.55, { x: 1e5, z: 1e5 }));
  const L = layout.trail.length;
  const tP = new THREE.Vector3();
  const tG = new THREE.Vector3();
  /** Lane point at t for a walker heading dir: right of the walking direction, facing it. */
  const lane = (t: number, dir: 1 | -1, off = LANE) => {
    layout.trail.pointAt(t, tP);
    layout.trail.tangentAt(t, tG);
    const side = laneSide(dir);
    const yaw = Math.atan2(tG.x, tG.z) + (dir > 0 ? 0 : Math.PI);
    return { x: tP.x - tG.z * side * off, z: tP.z + tG.x * side * off, yaw };
  };

  // ------------------------------------------------------------------ the gathering at the Cruz
  const C = layout.cruz;
  const cs = Math.cos(C.yaw);
  const sn = Math.sin(C.yaw);
  const W = (lx: number, lz: number) => ({ x: C.x + lx * cs + lz * sn, z: C.z - lx * sn + lz * cs });
  const floorY = env.heightAt(C.x, C.z) + 0.05;
  const gatherers = gatherSpecs.map((g, i) => {
    const o = { g, ...person(outfitFor(g.role, i), 101 + i * 5.3) };
    if (g.pose === "photo") o.p.hold(props, "camera");
    // Watchers follow the condors: a point out over the canyon, above the parapet (platform-local +z).
    if (g.pose === "watch" || g.pose === "photo") {
      const sky = W(g.x * 1.6, 26);
      o.p.lookAt = new THREE.Vector3(sky.x, floorY + 14, sky.z);
    }
    return o;
  });
  prefetchHumans(outfits);
  // The vendor's cloth: a striped manta with folded textiles, a few small wares and a stool.
  const stallPos = W(STALL.x, STALL.z);
  const kit = new VKit().at(stallPos.x, floorY, stallPos.z, C.yaw);
  kit.box(STALL.w, 0.03, STALL.d, 0, 0, 0, "#c4383f");
  for (const [dz, c] of [
    [-0.35, "#dda63c"],
    [0, "#2a9d8f"],
    [0.35, "#dda63c"],
  ] as Array<[number, string]>)
    kit.box(STALL.w + 0.01, 0.035, 0.06, 0, 0, dz, c);
  const piles = ["#8a2f6a", "#3446a6", "#e07a3a", "#f5f1e8", "#3f7f4a", "#c2456b"];
  for (let i = 0; i < 6; i++) {
    const px = -0.55 + (i % 3) * 0.55;
    const pz = i < 3 ? -0.22 : 0.25;
    for (let k = 0; k < 2 + (i % 2); k++)
      kit.box(0.38, 0.07, 0.3, px, 0.03 + k * 0.07, pz, piles[(i + k * 2) % piles.length] as string, k * 0.15);
  }
  kit.box(0.34, 0.32, 0.34, 0.95, 0, -0.5, "#7a5233");
  const stallGeo = kit.build();
  const stallMat = vertexToon();
  const stall = new THREE.Mesh(stallGeo, stallMat);
  stall.name = "colca-viajeros:stall";
  stall.receiveShadow = true;
  env.scene.add(stall);
  env.addCollider({ kind: "circle", x: stallPos.x, z: stallPos.z, r: 0.75 });
  const stallBody = creatures.add("stall", 0.8, { x: stallPos.x, z: stallPos.z });
  // Behind her, three mantas hung on a cord between two poles, rippling on the shared wind (../cloth.ts).
  const rack = new ClothKit();
  const along = { x: sn, y: 0, z: cs };
  const RACK = { x: 5.7, z0: -5.9, z1: -4.1, h: 1.95 } as const;
  for (const lz of [RACK.z0, RACK.z1]) {
    const p = W(RACK.x, lz);
    rack.tube({ x: p.x, y: floorY - 0.1, z: p.z }, { x: p.x, y: floorY + RACK.h + 0.1, z: p.z }, 0.04, "#6b4a2e");
    env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.2 });
  }
  const a0 = W(RACK.x, RACK.z0);
  const a1 = W(RACK.x, RACK.z1);
  rack.tube({ x: a0.x, y: floorY + RACK.h, z: a0.z }, { x: a1.x, y: floorY + RACK.h, z: a1.z }, 0.015, "#e9e1cf");
  const mantas: Array<ReadonlyArray<string>> = [
    ["#c4383f", "#dda63c", "#c4383f", "#2a9d8f", "#c4383f"],
    ["#3446a6", "#f5f1e8", "#e07a3a", "#f5f1e8", "#3446a6"],
    ["#8a2f6a", "#e9b23a", "#3f7f4a", "#e9b23a", "#8a2f6a"],
  ];
  mantas.forEach((bands, i) => {
    const p = W(RACK.x, RACK.z0 + 0.32 + i * 0.58);
    rack.drape({ x: p.x, y: floorY + RACK.h - 0.02, z: p.z }, along, 0.5, 0.95 - (i % 2) * 0.12, bands);
  });
  const rackMesh = clothMesh(rack, "colca-viajeros:mantas");
  env.scene.add(rackMesh.mesh);

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    seenV.set(x, ground(x, z) + 0.9, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  const f = { dt: 0, clock: 0, rm, avatar: new THREE.Vector3() };

  const updateWalker = (
    wk: Walker,
    i: number,
    dt: number,
    avatar: THREE.Vector3,
    dayNow: boolean,
    flipped: boolean,
  ) => {
    const { p, w, spec } = wk;
    // Blocked: the traveler, or someone walking the same way just ahead in the same lane.
    const head = lane(w.t + (w.dir * 1.4) / L, w.dir);
    let blocked = Math.hypot(head.x - avatar.x, head.z - avatar.z) < BLOCK_R;
    if (!blocked)
      for (let j = 0; j < walkers.length; j++) {
        const o = walkers[j] as Walker;
        if (j === i || o.w.dir !== w.dir) continue;
        const ahead = (o.w.t - w.t) * w.dir * L;
        if (ahead > 0 && ahead < 1.8) {
          blocked = true;
          break;
        }
      }
    if (wk === caravan && !blocked) {
      // The llamas behind count too (the traveler standing among them stops the file).
      for (let k = 1; k <= nLlamas && !blocked; k++) {
        const q = lane(w.t - (w.dir * FILE_GAP * k) / L, w.dir);
        if (Math.hypot(q.x - avatar.x, q.z - avatar.z) < 1.2) blocked = true;
      }
    }
    wk.v = stepWalk(w, spec, dt, L, blocked, R);
    const at = lane(w.t, w.dir);
    const d = Math.hypot(at.x - camPos.x, at.z - camPos.z);
    const want = dayNow && d < VIEW;
    if (p.active !== want && (flipped || d > VIEW - 20 || !seen(at.x, at.z))) p.setActive(want);
    if (!p.active) {
      if (wk === caravan) for (const id of llamaIds) herd.hide(id);
      return;
    }
    // The person turns in place at the ends of the stretch (a quick swing, not a snap).
    p.place(at.x, at.z, p.speed > 0.05 || wk.v > 0 ? at.yaw : p.yaw);
    if (wk.v === 0) p.face(at.x + Math.sin(at.yaw), at.z + Math.cos(at.yaw), dt, 4);
    p.speed = wk.v;
    p.y = ground(at.x, at.z);
    p.anim.act(wk.act, { fade: 0.4 });
    p.commit(f);
    if (wk === caravan) {
      for (let k = 0; k < nLlamas; k++) {
        const q = lane(w.t - (w.dir * FILE_GAP * (k + 1)) / L, w.dir);
        const b = llamaBodies[k];
        if (b) {
          b.x = q.x;
          b.z = q.z;
        }
        herd.set(llamaIds[k] as number, q.x, ground(q.x, q.z), q.z, q.yaw, { speed: wk.v, rm });
      }
    }
  };

  const updateGatherer = (
    o: { g: GatherSpot; p: Npc; act: Action },
    i: number,
    dayNow: boolean,
    flipped: boolean,
    near: boolean,
  ) => {
    const { g, p } = o;
    let lx = g.x;
    let lz = g.z;
    let a = g.a;
    let speed = 0;
    if (g.pose === "play") {
      // Children chase round their spot (still, with reduced motion: they stand and chat).
      const ang = rm ? g.a : f.clock * PLAY.w + g.a;
      lx = g.x + Math.sin(ang) * PLAY.r;
      lz = g.z + Math.cos(ang) * PLAY.r;
      a = ang + Math.PI / 2;
      speed = rm ? 0 : PLAY.w * PLAY.r;
    }
    const w = W(lx, lz);
    if (p.active !== dayNow && (flipped || !seen(w.x, w.z))) p.setActive(dayNow);
    if (!p.active || !near) return;
    p.place(w.x, w.z, C.yaw + a);
    p.speed = speed;
    p.y = floorY;
    // Each one keeps their pose; the photographer and a watcher point out the condors now and then.
    const k = rm ? 0 : Math.sin(f.clock * 0.21 + i * 1.3);
    switch (g.pose) {
      case "watch":
        // Head up after the condors; one points them out now and then.
        p.anim.act(i % 2 ? "hands-back" : "arms-crossed", { fade: 0.6 });
        p.anim.actArms(i % 2 === 0 && k > 0.55 ? "point-up" : "none", { fade: 0.5 });
        break;
      case "photo":
        // The camera up to the eye, lowered now and then to look.
        p.anim.act(k > -0.3 ? "photo" : "none", { fade: 0.5 });
        break;
      case "sit":
        p.lookRange = 4;
        p.anim.act("sit-bench", { seat: BENCH_SEAT, fade: 0.4 });
        break;
      case "vend":
        // Spinning yarn on her drop spindle while she minds the cloth; a few words when the traveler stops by.
        p.lookRange = 5;
        p.anim.act(Math.hypot(f.avatar.x - w.x, f.avatar.z - w.z) < 3.5 ? "talk" : "spin", { fade: 0.5 });
        break;
      case "play":
        p.lookRange = 0;
        p.anim.act(rm ? "talk" : "none", { fade: 0.3 });
        break;
    }
    p.commit(f);
  };

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      f.dt = dt;
      f.clock += dt;
      f.avatar.copy(avatar);
      env.camera.getWorldPosition(camPos);
      const dayNow = isDay(env.sky.time());
      const flipped = day !== dayNow;
      day = dayNow;
      for (let i = 0; i < walkers.length; i++) updateWalker(walkers[i] as Walker, i, dt, avatar, dayNow, flipped);
      if (caravan && !caravan.p.active)
        for (const b of llamaBodies) {
          b.x = 1e5;
          b.z = 1e5;
        }
      const near = Math.hypot(C.x - camPos.x, C.z - camPos.z) < GATHER_VIEW;
      stall.visible = near;
      for (let i = 0; i < gatherers.length; i++)
        updateGatherer(gatherers[i] as (typeof gatherers)[number], i, dayNow, flipped, near);
      herd.update(dt, t, env.camera);
      crowd.update(env.camera);
      props.update(t);
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      for (const g of gatherers) g.p.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      creatures.remove(stallBody);
      crowd.dispose();
      props.dispose();
      herd.dispose();
      stall.removeFromParent();
      stallGeo.dispose();
      rackMesh.mesh.removeFromParent();
      rackMesh.dispose();
      stallMat.dispose();
    },
  };
};
