/**
 * The gathering at the road's end (the coast's counterpart of the mountain's summit camp): people of the coast
 * come out to the Mamacocha headland round the finale's platform (./finale.ts) to see the sun go down:
 *  - two fishermen at the seaward flank make an offering to the Mamacocha, the mother sea: one stands with his
 *    arms raised to the sea, one sits by a cloth laid with shells, yellow amancae flowers and a gourd;
 *  - a family (father, mother and their child) stands on the land side watching the sunset;
 *  - a woman sells chicha and ceviche from a stall under a reed-mat awning (clay jars, bowls, gourds), serving
 *    and looking out at whoever comes up the road;
 *  - two children chase each other round and round.
 * Layout, hours and counts: ./reunion/plan.ts (8 people at high quality, 5 at low). They are out from the
 * morning until the dusk after the sunset (the finale's celebration sweeps the sky to the sunset: they stay for
 * it) and go home at night; arriving and leaving only happen out of sight (or on the first frame).
 * The traveler can walk among them (walkable discs over the flat cliff-top); the stall and the offering cloth are
 * colliders, the people are creature bodies (they step round the traveler).
 * Rendering: its own instanced crowd on the shared people rig (one InstancedMesh per body part, drawn only
 * within VIEW of the camera) and one merged vertex-coloured mesh for the props.
 */
import * as THREE from "three";
import { type PartName, partSpecs, SHADOW_PARTS } from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, type Palette, paletteMaterial } from "../../ambient/people/rig";
import { arcDir } from "../../ambient/sky/moon";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { Geo, rng } from "../kit";
import { FINALE_T } from "../plan";
import { finaleFrame, SUNSET } from "./finale/logic";
import { APRONS, BLOUSES, COAST_SKINS, type CoastPart, coastSpecs, SHIRTS, SKIRTS, TROUSERS } from "./gente/clothes";
import { type Frame, toWorld } from "./huacas/logic";
import { HOURS, KIDS, OFFERING, reunionSpots, SOLIDS, type Spot, STALL, WALK, within } from "./reunion/plan";

const MAN: Array<PartName | CoastPart> = ["leg", "c:shirt", "c:arm", "m:head"];
const WOMAN: Array<PartName | CoastPart> = ["leg", "w:skirt", "c:blouse", "c:arm", "w:head"];
/** Beyond this distance from the camera nobody is drawn. */
const VIEW = 130;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const Lay = env.suyu.layout;
  const rm = env.reducedMotion;
  const ground = env.suyu.groundAt;
  const end = Lay.trail.pointAt(FINALE_T);
  const f: Frame = finaleFrame(
    { x: end.x, z: end.z, y: Lay.groundAt(end.x, end.z) },
    arcDir(SUNSET, 0, { x: 0, y: 0, z: 0 }),
  );
  const W = (p: { x: number; z: number }) => toWorld(f, p.x, p.z);
  const R = rng(0x3e0a);
  const pick = <T>(a: readonly T[]) => a[Math.floor(R() * a.length) % a.length] as T;

  // ------------------------------------------------------------------ props: the stall and the offering
  const g = new Geo();
  const local = (lx: number, lz: number, yaw: number) => {
    const w = W({ x: lx, z: lz });
    const y = ground(w.x, w.z);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(w.x, y, w.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw + yaw),
      new THREE.Vector3(1, 1, 1),
    );
  };
  {
    // Stall (local +Z faces the customers): cane posts, a reed-mat awning, a plank table on trestles.
    g.post = local(STALL.x, STALL.z, STALL.yaw);
    const cane = "#b39a62";
    for (const [x, z] of [
      [-1.15, -0.75],
      [1.15, -0.75],
      [-1.15, 0.75],
      [1.15, 0.75],
    ] as Array<[number, number]>)
      g.cyl(0.045, 0.05, 2.15 + (z < 0 ? 0.25 : 0), x, -0.2, z, cane, 6);
    g.box(2.6, 0.06, 1.9, 0, 2.05, 0, "#d2b57a", 0, -0.13);
    for (let k = 0; k < 6; k++) g.box(2.62, 0.065, 0.06, 0, 2.06, -0.8 + k * 0.32, "#bf9f62", 0, -0.13);
    g.box(1.9, 0.07, 0.75, 0, 0.78, 0.15, "#8a6038");
    for (const x of [-0.75, 0.75]) g.box(0.08, 0.8, 0.6, x, 0, 0.15, "#6e4a2c");
    // Clay jars of chicha de jora, big bowls of ceviche (fish, onion, a lime green), stacked gourds and cups.
    for (const [x, z, s] of [
      [-0.65, 0.05, 1],
      [-0.35, -0.1, 0.8],
    ] as Array<[number, number, number]>) {
      g.blob(0.17 * s, 0.2 * s, 0.17 * s, x, 0.85 + 0.2 * s, z, "#a8553a", 1);
      g.cyl(0.07 * s, 0.09 * s, 0.1 * s, x, 0.85 + 0.36 * s, z, "#9a4a32", 8);
    }
    for (const [x, z] of [
      [0.1, 0.28],
      [0.55, 0.22],
    ] as Array<[number, number]>) {
      g.cyl(0.2, 0.12, 0.1, x, 0.82, z, "#b5603e", 10);
      g.cyl(0.18, 0.18, 0.02, x, 0.9, z, "#f1ead8", 10);
      for (let k = 0; k < 4; k++)
        g.blob(
          0.035,
          0.02,
          0.035,
          x + Math.cos(k * 1.7) * 0.09,
          0.925,
          z + Math.sin(k * 1.7) * 0.09,
          k % 2 ? "#a24a8a" : "#8fc04a",
          0,
        );
    }
    for (let k = 0; k < 4; k++) g.blob(0.07, 0.05, 0.07, 0.25 + k * 0.17, 0.86, -0.08, "#c9a24a", 0);
    g.box(0.3, 0.35, 0.3, 1.0, 0, -0.55, "#7a5232");
    g.post = null;
  }
  {
    // The offering: a striped cloth with shells, amancae flowers and a gourd of chicha.
    g.post = local(OFFERING.x, OFFERING.z, 0);
    g.box(1.0, 0.02, 0.7, 0, 0.01, 0, "#c4383f");
    for (const z of [-0.22, 0.22]) g.box(1.0, 0.025, 0.08, 0, 0.012, z, "#dda63c");
    const shells = ["#f4ece0", "#efc9c0", "#e9dcc4"];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = 0.12 + (k % 3) * 0.08;
      g.blob(0.05, 0.025, 0.04, Math.cos(a) * r, 0.04, Math.sin(a) * r * 0.7, shells[k % 3] as string, 0);
    }
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      g.blob(
        0.045,
        0.03,
        0.045,
        -0.35 + Math.cos(a) * 0.08,
        0.05,
        Math.sin(a) * 0.16,
        k % 2 ? "#f2c84b" : "#f0b429",
        0,
      );
    }
    g.blob(0.1, 0.07, 0.1, 0.33, 0.07, 0.05, "#c9a24a", 1);
    g.cyl(0.08, 0.06, 0.03, 0.33, 0.12, 0.05, "#e2c27a", 8);
    g.post = null;
  }
  const propGeo = g.build();
  const propMat = vertexToon();
  const props = new THREE.Mesh(propGeo, propMat);
  props.name = "costa-reunion:props";
  props.castShadow = true;
  props.receiveShadow = true;
  env.scene.add(props);
  for (const s of SOLIDS) {
    const w = W(s);
    env.addCollider({ kind: "circle", x: w.x, z: w.z, r: s.r });
  }
  for (const d of WALK) {
    const w = W(d);
    env.addWalkable({ kind: "circle", x: w.x, z: w.z, r: d.r });
  }

  // ------------------------------------------------------------------ people
  const spots = reunionSpots(env.quality);
  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const specs = [...partSpecs(["leg", "m:head", "w:head", "w:skirt"]), ...coastSpecs()];
  const crowd = new Crowd(specs, spots.length, mat, new Set([...SHADOW_PARTS, "c:shirt", "c:blouse"]));
  env.scene.add(crowd.group);
  interface Who {
    p: Person;
    s: Spot;
    home: { x: number; z: number; yaw: number };
    ph: number;
  }
  const people: Who[] = spots.map((s, i) => {
    const kid = s.role === "kid" || s.role === "family-kid";
    const hat = !kid && (s.role === "offer" || s.role === "sit-offer" || s.role === "vendor" || R() < 0.5);
    const wear = [...(s.man ? MAN : WOMAN), ...(hat ? (["c:hat"] as const) : [])];
    const palette: Palette = s.man
      ? [pick(COAST_SKINS), pick(SHIRTS), pick(APRONS), pick(TROUSERS)]
      : [pick(COAST_SKINS), pick(BLOUSES), pick(APRONS), pick(SKIRTS)];
    const p = new Person({
      kind: kid ? "costa-kid" : "costa-person",
      crowd,
      idx: crowd.alloc(),
      // The rig's types list the mountain's parts; the coast's crowd also has its own (same Crowd API).
      wear: wear as unknown as PartName[],
      palette,
      scale: kid ? 0.6 + R() * 0.08 : s.man ? 0.98 + R() * 0.05 : 0.93 + R() * 0.05,
      headScale: kid ? 1.3 : 1,
      radius: kid ? 0.26 : 0.34,
      seed: 31 + i * 5.7,
    });
    const w = W(s);
    return { p, s, home: { x: w.x, z: w.z, yaw: f.yaw + s.yaw }, ph: i * 1.3 };
  });
  const kidsC = W(KIDS);

  // ------------------------------------------------------------------ frame
  let first = true;
  let clock = 0;
  const cam = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - cam.x, z - cam.z) > VIEW) return false;
    seenV.set(x, 1, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.2 && Math.abs(seenV.y) < 1.2;
  };

  return {
    update(dtIn) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(cam);
      const out = within(env.sky.time(), HOURS);
      const near = Math.hypot(f.x - cam.x, f.z - cam.z) < VIEW + 20;
      props.visible = near;
      for (const w of people) {
        const p = w.p;
        // Come and go only out of sight (or on the first frame).
        if (p.active !== out && (first || !seen(p.x, p.z))) {
          p.setActive(out);
          if (out) p.place(w.home.x, w.home.z, w.home.yaw);
        }
        if (!p.active) continue;
        if (w.s.role === "kid") {
          // Chasing each other round the ring (a gentle stroll with reduced motion).
          const a = w.ph * 2.4 + clock * (rm ? 0.25 : 0.9);
          p.seek(kidsC.x + Math.cos(a) * KIDS.r * 1.3, kidsC.z - Math.sin(a) * KIDS.r * 1.3, rm ? 0.8 : 2.6, dt, 6);
        } else {
          // Hold their spot (stepping back to it after making way for the traveler).
          const d = Math.hypot(w.home.x - p.x, w.home.z - p.z);
          if (d > 0.3) p.seek(w.home.x, w.home.z, 1.1, dt);
          else {
            p.speed *= 0.8;
            p.resolve(0.5);
            p.yaw += Math.atan2(Math.sin(w.home.yaw - p.yaw), Math.cos(w.home.yaw - p.yaw)) * Math.min(1, dt * 3);
          }
        }
        p.y = ground(p.x, p.z);
        if (!near) {
          p.hide();
          continue;
        }
        p.rest(clock, rm);
        const b = p.bones;
        const moving = p.speed > 0.2;
        const sway = rm ? 0 : 1;
        if (moving || w.s.role === "kid") p.gait(dt, rm);
        else if (w.s.role === "offer") {
          // Arms raised to the sea, swaying slowly; face lifted.
          const k = Math.sin(clock * 0.7 + w.ph) * 0.12 * sway;
          b.armL.rotation.set(-2.55 + k, 0, 0.35);
          b.armR.rotation.set(-2.55 - k, 0, -0.35);
          b.head.rotation.x = -0.28;
          b.torso.rotation.x = -0.06;
        } else if (w.s.role === "sit-offer") {
          // Sitting on the sand by the offering, facing the sea, bowing now and then.
          p.sit(clock, rm, 0.05);
          b.armL.rotation.set(-0.9, 0, 0.2);
          b.armR.rotation.set(-0.9, 0, -0.2);
          b.head.rotation.y = 0;
          b.torso.rotation.x = Math.max(0, Math.sin(clock * 0.35 + w.ph)) * 0.4 * sway;
        } else if (w.s.role === "vendor") {
          // Ladling chicha into cups, glancing out at the road.
          const c = (clock * 0.5 + w.ph) % 4;
          b.torso.rotation.x = 0.12;
          b.armR.rotation.x = c < 1.5 ? -0.9 + Math.sin(clock * 3) * 0.25 * sway : -0.2;
          b.armL.rotation.x = -0.5;
          b.head.rotation.y = c < 1.5 ? 0 : Math.sin(clock * 0.4 + w.ph) * 0.6 * sway;
        } else {
          // The family looks out to sea; the child turns about and tugs at a hand.
          b.head.rotation.y = Math.sin(clock * 0.25 + w.ph) * 0.35 * sway;
          b.head.rotation.x = -0.05;
          if (w.s.role === "family-kid") b.armL.rotation.set(-0.3 + Math.sin(clock * 1.3) * 0.15 * sway, 0, 0.5);
          else if (w.s.man) b.armR.rotation.set(-0.15, 0, -0.35);
        }
        p.commit();
      }
      first = false;
      crowd.flush();
    },
    dispose() {
      for (const w of people) w.p.dispose();
      crowd.dispose();
      mat.dispose();
      props.removeFromParent();
      propGeo.dispose();
      propMat.dispose();
    },
  };
};
