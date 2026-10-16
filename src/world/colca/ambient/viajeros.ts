/**
 * People who come and go along the whole Kuntisuyu road, and the people gathered at its end.
 *  - On the road (./viajeros/logic.ts TRAVELLERS): each walks a stretch there and back, on their own side of
 *    the road, pausing and turning at its ends and waiting while the traveler stands in their way. Along the
 *    canyon rim: women of the valley in embroidered dress (the white Cabanaconde or Collagua hat, one with a
 *    basket), a farmer with his bundle, walkers with packs and caps, and a farmer leading two pack llamas; on
 *    the descent and the climb back to the rim, walkers and a Cabanaconde woman; on the Nazca pampa,
 *    archaeologists in canvas sun hats, visitors with packs, and people from Nasca in felt hats.
 *  - At the Cruz del Cóndor (GATHER): visitors along the parapet watching the condors (one taking photos,
 *    one resting on a bench), a vendor with textiles laid out on a cloth, a woman of Cabanaconde, and two
 *    children playing near the sign. The way from the road's end to the cross stays clear.
 * Everyone is out by day and goes home at dusk (switched while unseen, or at once on a clock jump). People
 * far from the camera are taken out of the world (not drawn, bodies parked), so only the near ones cost.
 *
 * Rendering: one instanced crowd on the shared people rig (../../ambient/people: one InstancedMesh per part,
 * only parts someone near wears are drawn) with the Colca garments (./gente/garments.ts), the two llamas
 * (./wild/camelids.ts) and the vendor's cloth (one merged mesh). Everyone is a creatures body (solid).
 */
import * as THREE from "three";
import {
  DARKS,
  MAN,
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
import { creatures } from "../../creatures";
import { LLAMA } from "../../fauna-models";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import {
  BORDADOS,
  type ColcaPart,
  colcaPartSpecs,
  KHAKI,
  PACKS,
  RIBBONS,
  SHELLS,
  TROUSERS,
  wear,
} from "./gente/garments";
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
import { CamelidHerd } from "./wild/camelids";

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/** Visitors come from everywhere: the valley's skins plus a few lighter ones. */
const VISITOR_SKINS = [...SKINS, "#e8c4a4", "#d9a882", "#f0cfb0", "#7a4a30"];
const LLAMA_COATS = ["#fbf6ee", "#5a463a"];
const LLAMA_PACKS = ["#c4383f", "#2a9d8f"];
/** Road people are drawn within this camera distance (taken out beyond, with a little hysteresis). */
const VIEW = 160;
/** The gathering is drawn within this distance of the Cruz. */
const GATHER_VIEW = 130;
const FILE_GAP = 2.3;

type Outfit = { parts: ColcaPart[]; palette: Palette; scale: number; kid?: boolean };

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const ground = env.suyu.groundAt;
  const R = rng(0x7a1e);
  const roadSpecs = TRAVELLERS.filter((s) => high || !s.high);
  const gatherSpecs = GATHER.filter((g) => high || !g.high);

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const specs = [
    ...partSpecs([...MAN, ...WOMAN, "sombrero", "chullo", "bundle", "basket"]),
    ...colcaPartSpecs([
      "colca:cabana",
      "colca:collagua",
      "colca:bordado",
      "colca:jacket",
      "colca:cap",
      "colca:sunhat",
      "colca:backpack",
    ]),
  ];
  const shadows = new Set([...SHADOW_PARTS, "colca:bordado", "colca:jacket"]);
  const crowd = new Crowd(specs, roadSpecs.length + gatherSpecs.length, mat, shadows);
  crowd.group.name = "colca-viajeros";
  env.scene.add(crowd.group);

  const valleyWoman = (hat: ColcaPart, extra: ColcaPart[] = []): Outfit => ({
    parts: [...WOMAN, "colca:bordado", hat, ...extra],
    palette: [pick(R, SKINS), pick(R, BORDADOS), pick(R, RIBBONS), pick(R, BORDADOS)],
    scale: 0.92 + R() * 0.06,
  });
  const outdoor = (hat: ColcaPart, pack: boolean, khaki = false): Outfit => ({
    parts: ["leg", "colca:jacket", "m:arm", "m:head", hat, ...(pack ? (["colca:backpack"] as ColcaPart[]) : [])],
    palette: [
      pick(R, VISITOR_SKINS),
      khaki ? pick(R, KHAKI) : pick(R, SHELLS),
      khaki ? "#6b5a3e" : pick(R, PACKS),
      pick(R, TROUSERS),
    ],
    scale: 0.96 + R() * 0.08,
  });
  const outfitFor = (role: Role | GatherSpot["role"], i: number): Outfit => {
    switch (role) {
      case "cabana":
        return valleyWoman("colca:cabana");
      case "collagua":
        return valleyWoman("colca:collagua");
      case "basket":
        return valleyWoman("colca:cabana", ["basket"]);
      case "vendor":
        return valleyWoman("colca:collagua");
      case "farmer":
      case "caravan":
        return {
          parts: [...MAN, "sombrero", ...(role === "farmer" ? (["bundle"] as ColcaPart[]) : [])],
          palette: [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)],
          scale: 0.98 + R() * 0.05,
        };
      case "trekker":
        return outdoor("colca:cap", true);
      case "archaeologist":
        return outdoor("colca:sunhat", false, true);
      case "tourist":
        return outdoor(i % 2 ? "colca:cap" : "colca:sunhat", i % 3 !== 2);
      case "local-man":
        return {
          parts: [...MAN, "sombrero"],
          palette: [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)],
          scale: 0.97 + R() * 0.05,
        };
      case "local-woman":
        return {
          parts: [...WOMAN, "sombrero", "basket"],
          palette: [pick(R, SKINS), pick(R, POLLERAS), pick(R, WEAVES), pick(R, DARKS)],
          scale: 0.92 + R() * 0.05,
        };
      case "kid":
        return {
          parts: i % 2 ? [...MAN, "chullo"] : [...WOMAN, "colca:bordado", "colca:cabana"],
          palette: [pick(R, SKINS), pick(R, BORDADOS), pick(R, RIBBONS), pick(R, DARKS)],
          scale: 0.62 + R() * 0.06,
          kid: true,
        };
    }
  };
  const person = (o: Outfit, seed: number) =>
    new Person({
      kind: o.kid ? "child" : "colca-person",
      crowd,
      idx: crowd.alloc(),
      wear: wear(o.parts),
      palette: o.palette,
      scale: o.scale,
      headScale: o.kid ? 1.3 : 1,
      radius: o.kid ? 0.26 : 0.34,
      seed,
    });

  // ------------------------------------------------------------------ road walkers
  interface Walker {
    spec: TravellerSpec;
    w: Walk;
    p: Person;
    v: number;
    phase: number;
    walkAmt: number;
  }
  const walkers: Walker[] = roadSpecs.map((spec, i) => ({
    spec,
    w: startWalk(spec),
    p: person(outfitFor(spec.role, i), 11 + i * 7.7),
    v: 0,
    phase: 0,
    walkAmt: 0,
  }));
  const caravan = walkers.find((w) => w.spec.role === "caravan");
  const nLlamas = caravan ? 2 : 0;
  const herd = new CamelidHerd("colca-viajeros:llamas", LLAMA, Math.max(1, nLlamas), LLAMA_COATS, LLAMA_PACKS);
  env.scene.add(herd.group);
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
  const gatherers = gatherSpecs.map((g, i) => ({ g, p: person(outfitFor(g.role, i), 101 + i * 5.3) }));
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

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    seenV.set(x, ground(x, z) + 0.9, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  let clock = 0;

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
    wk.walkAmt += ((wk.v > 0 ? 1 : 0) - wk.walkAmt) * (1 - Math.exp(-dt * 4));
    if (!rm) wk.phase += dt * wk.v * 4.2;
    if (!p.active) {
      if (wk === caravan) for (let k = 0; k < nLlamas; k++) herd.hide(k);
      return;
    }
    p.place(at.x, at.z, at.yaw);
    p.speed = wk.v;
    p.y = ground(at.x, at.z);
    p.rest(clock, rm);
    p.gait(dt, rm, spec.role === "caravan" ? 0.6 : 1);
    p.commit();
    if (wk === caravan) {
      for (let k = 0; k < nLlamas; k++) {
        const q = lane(w.t - (w.dir * FILE_GAP * (k + 1)) / L, w.dir);
        const b = llamaBodies[k];
        if (b) {
          b.x = q.x;
          b.z = q.z;
        }
        herd.set(k, {
          x: q.x,
          y: ground(q.x, q.z),
          z: q.z,
          yaw: q.yaw,
          phase: wk.phase + k * 1.3,
          walk: wk.walkAmt,
          graze: wk.v === 0 && !rm ? 0.2 + 0.15 * Math.sin(clock * 0.8 + k) : 0,
          lying: false,
        });
      }
    }
  };

  const updateGatherer = (
    o: { g: GatherSpot; p: Person },
    i: number,
    dt: number,
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
      const ang = rm ? g.a : clock * PLAY.w + g.a;
      lx = g.x + Math.sin(ang) * PLAY.r;
      lz = g.z + Math.cos(ang) * PLAY.r;
      a = ang + Math.PI / 2;
      speed = rm ? 0 : PLAY.w * PLAY.r;
    }
    const w = W(lx, lz);
    if (p.active !== dayNow && (flipped || !seen(w.x, w.z))) p.setActive(dayNow);
    if (!p.active) return;
    p.place(w.x, w.z, C.yaw + a);
    if (!near) {
      p.hide();
      return;
    }
    p.speed = speed;
    p.y = g.pose === "sit" ? floorY + 0.4 : floorY;
    p.rest(clock, rm);
    const b = p.bones;
    const sway = rm ? 0 : Math.sin(clock * 0.4 + i * 1.7);
    switch (g.pose) {
      case "watch":
        // Following the condors: head up, turning slowly.
        b.head.rotation.x = -0.28 - 0.08 * sway;
        b.head.rotation.y = 0.35 * sway;
        if (i % 2 === 0) {
          // Pointing now and then.
          const k = rm ? 0 : Math.max(0, Math.sin(clock * 0.21 + i));
          b.armR.rotation.x = -1.9 * k;
        }
        break;
      case "photo": {
        // Phone or camera up to the face, lowered now and then to look.
        const up = rm ? 1 : Math.sin(clock * 0.35 + i) > -0.3 ? 1 : 0;
        b.armL.rotation.set(-1.45 * up, 0, -0.45 * up);
        b.armR.rotation.set(-1.45 * up, 0, 0.45 * up);
        b.head.rotation.x = -0.15;
        b.head.rotation.y = 0.25 * sway * (1 - up);
        break;
      }
      case "sit":
        p.sit(clock, rm, 0.05);
        b.head.rotation.x = -0.2;
        break;
      case "vend":
        // Folding and offering the textiles: a slow reach toward the cloth.
        b.torso.rotation.x = 0.15 + (rm ? 0 : 0.1 * Math.max(0, Math.sin(clock * 0.5)));
        b.armR.rotation.x = -0.7 - (rm ? 0 : 0.3 * Math.max(0, Math.sin(clock * 0.5)));
        b.armL.rotation.x = -0.5;
        b.head.rotation.y = 0.3 * sway;
        break;
      case "play":
        p.gait(dt, rm, 1.3);
        break;
    }
    p.commit();
  };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
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
      herd.commit();
      const near = Math.hypot(C.x - camPos.x, C.z - camPos.z) < GATHER_VIEW;
      stall.visible = near;
      for (let i = 0; i < gatherers.length; i++)
        updateGatherer(gatherers[i] as { g: GatherSpot; p: Person }, i, dt, dayNow, flipped, near);
      crowd.flush();
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
      for (const g of gatherers) g.p.dispose();
      for (const b of llamaBodies) creatures.remove(b);
      creatures.remove(stallBody);
      crowd.dispose();
      mat.dispose();
      herd.dispose();
      stall.removeFromParent();
      stallGeo.dispose();
      stallMat.dispose();
    },
  };
};
