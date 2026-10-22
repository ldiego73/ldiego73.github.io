/**
 * The gathering at the road's end (the coast's counterpart of the mountain's summit camp): people of the coast
 * come out to the Mamacocha headland round the finale's platform (./finale.ts) to see the sun go down:
 *  - two fishermen at the seaward flank make an offering to the Mamacocha, the mother sea: one stands with his
 *    arms raised over his head to the sea, one kneels by a cloth laid with shells, yellow amancae flowers and a
 *    gourd;
 *  - a family (father, mother and their child) stands on the land side watching the sunset;
 *  - a woman sells chicha and ceviche from a stall under a reed-mat awning (clay jars, bowls, gourds), serving
 *    and looking out at whoever comes up the road;
 *  - two children chase each other round and round.
 * Layout, hours and counts: ./reunion/plan.ts (8 people at high quality, 5 at low). They are out from the
 * morning until the dusk after the sunset (the finale's celebration sweeps the sky to the sunset: they stay for
 * it) and go home at night; arriving and leaving only happen out of sight (or on the first frame).
 * The traveler can walk among them (walkable discs over the flat cliff-top); the stall and the offering cloth are
 * colliders, the people are creature bodies (they step round the traveler).
 * Rendering: the coast's crowd of continuous skinned people (./gente/crowd.ts, shared with ./gente.ts; drawn and
 * animated only within VIEW of the camera), dressed from ./gente/dress.ts, posed by actions (./reunion/plan.ts
 * reunionAction: arms raised over the head, kneeling, ladling, hands clasped or behind the back), the vendor's
 * ladle a held prop; one merged vertex-coloured mesh for the stall and the offering.
 */
import * as THREE from "three";
import { Npc, type NpcFrame } from "../../ambient/people/npc";
import { arcDir } from "../../ambient/sky/moon";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { Geo, rng } from "../kit";
import { FINALE_T } from "../plan";
import { finaleFrame, SUNSET } from "./finale/logic";
import { coastCrowd } from "./gente/crowd";
import { adult, COAST_PEOPLE, type CoastWho, coastDress } from "./gente/dress";
import { type Frame, toWorld } from "./huacas/logic";
import {
  HOURS,
  KIDS,
  OFFERING,
  reunionAction as pose,
  reunionSpots,
  SOLIDS,
  type Spot,
  STALL,
  WALK,
  within,
} from "./reunion/plan";

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
  const shared = coastCrowd(env.scene, env.quality === "low");
  interface Who {
    p: Npc;
    s: Spot;
    home: { x: number; z: number; yaw: number };
    ph: number;
    drawn: boolean;
  }
  const people: Who[] = spots.map((s, i) => {
    const kid = s.role === "kid" || s.role === "family-kid";
    const hat = s.role === "offer" || s.role === "sit-offer" || s.role === "vendor" || R() < 0.5;
    const who: CoastWho = kid
      ? s.man
        ? "boy"
        : "girl"
      : s.role === "offer" || s.role === "sit-offer"
        ? "fisher"
        : adult(s.man, hat);
    const p = new Npc({
      kind: kid ? "costa-kid" : "costa-person",
      crowd: shared.crowd,
      spec: COAST_PEOPLE[who],
      palette: coastDress(who, R),
      scale: kid ? 0.94 + R() * 0.1 : s.man ? 0.98 + R() * 0.05 : 0.97 + R() * 0.04,
      radius: kid ? 0.26 : 0.34,
      seed: 31 + i * 5.7,
    });
    // The children are busy with their game; the others glance at the traveler walking among them.
    p.lookRange = s.role === "kid" ? 0 : 5;
    // The vendor's ladle for the chicha.
    if (s.role === "vendor") p.hold(shared.props, "ladle");
    const w = W(s);
    return { p, s, home: { x: w.x, z: w.z, yaw: f.yaw + s.yaw }, ph: i * 1.3, drawn: true };
  });
  const kidsC = W(KIDS);
  const frame: NpcFrame = { dt: 0, clock: 0, rm, avatar: new THREE.Vector3() };
  const draw = (w: Who, on: boolean) => {
    if (w.drawn === on) return;
    w.drawn = on;
    if (on) w.p.show();
    else w.p.hide();
  };

  // ------------------------------------------------------------------ frame
  let first = true;
  const cam = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - cam.x, z - cam.z) > VIEW) return false;
    seenV.set(x, 1, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.2 && Math.abs(seenV.y) < 1.2;
  };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      frame.dt = dt;
      frame.clock += dt;
      frame.avatar.copy(avatar);
      const clock = frame.clock;
      env.camera.getWorldPosition(cam);
      const out = within(env.sky.time(), HOURS);
      const near = Math.hypot(f.x - cam.x, f.z - cam.z) < VIEW + 20;
      props.visible = near;
      for (const w of people) {
        const p = w.p;
        // Come and go only out of sight (or on the first frame).
        if (p.active !== out && (first || !seen(p.x, p.z))) {
          p.setActive(out);
          w.drawn = out;
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
        draw(w, near);
        if (!near) continue;
        p.anim.act(pose(w.s, p.speed > 0.2, (clock * 0.5 + w.ph) % 4), { fade: 0.5 });
        p.commit(frame);
      }
      first = false;
      shared.frame(env.camera);
    },
    dispose() {
      for (const w of people) w.p.dispose();
      shared.release();
      props.removeFromParent();
      propGeo.dispose();
      propMat.dispose();
    },
  };
};
