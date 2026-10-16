/**
 * Women at work on the maloca plaza and an elder sitting with them, on palm mats beside the maloca (left of
 * its door as seen from the road, away from the station board and from the maloca's "E" spots inside):
 *  - a weaver at a backstrap loom tied to a stake, leaning back to tension the warp and beating the weft
 *    down with the wooden sword;
 *  - a potter painting kené on her pots;
 *  - an elder in a natural-cotton cushma and a feather crown on a low stool, watching the road.
 * By night the women have gone home; the elder stays on, by a small fire. "E · Saludar" near any of them
 * shows a short bilingual line (generic facts about the craft and the place).
 * One merged vertex-colored mesh for the props (mats, loom, pots, stool, hearth) + the flames at night.
 */
import * as THREE from "three";
import { hearth, rng, Static } from "../../../ambient/people/models";
import { damp, type Person } from "../../../ambient/people/person";
import type { Crowd, Palette } from "../../../ambient/people/rig";
import { creatures, type KeepOut } from "../../../creatures";
import { glowSprite } from "../../../props";
import { greeting, isOut, type Role } from "./logic";
import { type AmazonPart, frameMatrix, loom, MAN, mat, pots, SKINS, SKIRTS, stool, WOMAN } from "./models";
import type { Ctx, Greeter, Group } from "./types";
import { villager, wavePose } from "./villager";

export interface CraftSpot {
  /** Weaver (hips), potter and elder positions (world) and the direction they face (yaw). */
  weaver: { x: number; z: number; yaw: number };
  potter: { x: number; z: number; yaw: number };
  elder: { x: number; z: number; yaw: number };
}

interface Worker {
  p: Person;
  role: Role;
  home: { x: number; z: number; yaw: number };
  greetN: number;
  wave: number;
  /** Stays out at night (the elder). */
  night: boolean;
}

const REACH = 2.1;

export function createCrafts(
  env: Ctx["env"],
  crowd: Crowd,
  staticMat: THREE.Material,
  spot: CraftSpot,
  n: number,
): Group {
  const R = rng(7331);
  const ground = env.selva.groundAt;
  const sk = SKIRTS[1] as readonly [string, string];
  const sk2 = SKIRTS[0] as readonly [string, string];
  const defs: Array<{
    role: Role;
    wear: readonly AmazonPart[];
    pal: Palette;
    home: CraftSpot["weaver"];
    scale: number;
  }> = [
    { role: "weaver", wear: WOMAN, pal: [SKINS[1] as string, sk[0], sk[1], "#c2456b"], home: spot.weaver, scale: 0.94 },
    {
      role: "elder",
      wear: [...MAN, "a:crown"],
      pal: [SKINS[2] as string, "#d8cbb0", "#3b2a20", "#d8cbb0"],
      home: spot.elder,
      scale: 0.93,
    },
    {
      role: "potter",
      wear: WOMAN,
      pal: [SKINS[4] as string, sk2[0], sk2[1], "#2a9d8f"],
      home: spot.potter,
      scale: 0.92,
    },
  ];
  const workers: Worker[] = defs.slice(0, Math.max(1, n)).map((d, i) => {
    const p = villager({
      kind: "villager",
      crowd,
      idx: crowd.alloc(),
      wear: d.wear,
      palette: d.pal,
      scale: d.scale,
      radius: 0.42,
      seed: 31 + i * 17.7,
    });
    p.place(d.home.x, d.home.z, d.home.yaw);
    p.y = ground(d.home.x, d.home.z);
    return { p, role: d.role, home: d.home, greetN: Math.floor(R() * 4), wave: 0, night: d.role === "elder" };
  });

  // Props: mats under the women, the loom, the pots, the elder's stool and (lit at night) a hearth.
  const s = new Static();
  const m = new THREE.Matrix4();
  const w = spot.weaver;
  s.p.post = frameMatrix(w.x, ground(w.x, w.z), w.z, w.yaw, m);
  mat(s.p, s.P, 1.1, 1.3);
  loom(s.p, s.P, SKIRTS[0]?.[0] ?? "#efe3c8", "#2b2320");
  const po = spot.potter;
  s.p.post = frameMatrix(po.x, ground(po.x, po.z), po.z, po.yaw, m);
  mat(s.p, s.P, 1.5, 1.2);
  pots(s.p, s.P, R);
  const el = spot.elder;
  s.p.post = frameMatrix(el.x, ground(el.x, el.z), el.z, el.yaw, m);
  stool(s.p, s.P);
  s.p.post = null;
  // The hearth at the elder's front left, so from the plaza he is seen beside it, lit by it.
  const fa = el.yaw + 0.9;
  const fire = new THREE.Vector3(el.x + Math.sin(fa) * 1.2, 0, el.z + Math.cos(fa) * 1.2);
  fire.y = ground(fire.x, fire.z);
  hearth(s, new THREE.Matrix4().makeTranslation(fire.x, fire.y, fire.z));
  const propGeo = s.build();
  const props = new THREE.Mesh(propGeo, staticMat);
  props.name = "comunidad:crafts";
  props.castShadow = true;
  props.receiveShadow = true;
  env.scene.add(props);

  // Flames (night).
  const fl = new THREE.Group();
  fl.name = "comunidad:flames";
  fl.position.copy(fire);
  const cone = new THREE.ConeGeometry(1, 1, 6);
  const fm = env.toon("#ffb35c", { emissive: "#ff8a3d", emissiveIntensity: 1.6 });
  const fm2 = env.toon("#ffe08a", { emissive: "#ffd36b", emissiveIntensity: 1.8 });
  const flames = [0, 1].map((i) => {
    const f = new THREE.Mesh(cone, i ? fm2 : fm);
    f.position.set(0, 0.25, 0);
    f.scale.set(i ? 0.09 : 0.15, i ? 0.3 : 0.44, i ? 0.09 : 0.15);
    fl.add(f);
    return f;
  });
  const glow = glowSprite(env, "#ffb35c", 2.6);
  glow.position.y = 0.45;
  fl.add(glow);
  env.noOutline(fl);
  fl.visible = false;
  env.scene.add(fl);

  // Solid props for the traveler and the animals: the loom stake and the warp, the pots.
  const stake = creatures.add("prop", 0.3, {
    x: w.x + Math.sin(w.yaw) * 1.6,
    z: w.z + Math.cos(w.yaw) * 1.6,
    give: 0,
  });
  const warp = creatures.add("prop", 0.32, {
    x: w.x + Math.sin(w.yaw) * 0.95,
    z: w.z + Math.cos(w.yaw) * 0.95,
    give: 0,
  });
  const potsBody = creatures.add("prop", 0.55, {
    x: po.x + Math.sin(po.yaw) * 0.5,
    z: po.z + Math.cos(po.yaw) * 0.5,
    give: 0,
  });
  const cx0 = (w.x + po.x + el.x) / 3;
  const cz0 = (w.z + po.z + el.z) / 3;
  const zone: KeepOut = creatures.keepOut(cx0, cz0, 3.2);

  let isDay: boolean | null = null;
  let frame = 0;
  let shown = true;
  const head = new THREE.Vector3();
  let near: Worker | null = null;

  const pose = (k: Worker, c: Ctx) => {
    const p = k.p;
    const b = p.bones;
    const night = !isOut("craft", c.time);
    p.rest(c.clock, c.rm);
    p.speed = 0;
    const t = c.rm ? 0 : c.clock;
    if (k.role === "weaver") {
      p.sit(c.clock, true, -0.18);
      // Arms forward to the breast bar; every few seconds the sword beats the weft down.
      const beat = c.rm ? 0 : Math.max(0, Math.sin(t * 1.6 + p.seed)) ** 6;
      b.armL.rotation.set(-1.15 + beat * 0.35, 0, 0.18);
      b.armR.rotation.set(-1.15 + beat * 0.35, 0, -0.18);
      b.head.rotation.x = 0.28;
    } else if (k.role === "potter") {
      p.sit(c.clock, true, -0.35);
      b.armL.rotation.set(-0.95, 0, 0.35);
      b.armR.rotation.set(-1.05 + Math.sin(t * 3.1) * 0.06, Math.sin(t * 2.3) * 0.15, -0.2);
      b.head.rotation.x = 0.42;
    } else {
      // On the stool: hips at its height, shins down to the ground; hands on the knees.
      b.hips.position.y = -0.24;
      b.legL.rotation.set(-1.15, 0, 0.1);
      b.legR.rotation.set(-1.15, 0, -0.1);
      b.armL.rotation.set(-0.75, 0, 0.15);
      b.armR.rotation.set(-0.75, 0, -0.15);
      b.torso.rotation.x = night ? 0.12 : -0.04;
      if (!c.rm) b.head.rotation.y = Math.sin(c.clock * 0.25 + p.seed) * 0.4;
    }
    if (k.wave > 0) {
      k.wave -= c.dt;
      // Wave back with the free hand, looking at the traveler.
      wavePose(p, c.clock, c.rm);
      const target = Math.atan2(c.avatar.x - p.x, c.avatar.z - p.z) - p.yaw;
      b.head.rotation.y = damp(b.head.rotation.y, Math.atan2(Math.sin(target), Math.cos(target)) * 0.6, 8, c.dt);
    }
    p.commit();
  };

  return {
    name: "crafts",
    center: new THREE.Vector3(cx0, ground(cx0, cz0), cz0),
    radius: 4,
    update(c, visible) {
      const day = isOut("craft", c.time);
      const fireOn = isOut("fire", c.time);
      if (isDay === null || c.jump) for (const k of workers) k.p.setActive(day || k.night);
      isDay = day;
      if (frame++ % 15 === 0)
        for (const k of workers) {
          const want = day || k.night;
          if (k.p.active !== want && !c.seen(k.p.x, k.p.y + 0.6, k.p.z, 80)) k.p.setActive(want);
        }
      zone.on = day || fireOn;
      if (visible !== shown) {
        shown = visible;
        props.visible = visible;
        if (!visible) for (const k of workers) k.p.hide();
      }
      fl.visible = visible && fireOn;
      if (fl.visible && !c.rm)
        flames.forEach((f, i) => {
          const k = 1 + Math.sin(c.clock * (9 + i * 3.1) + i) * 0.14 + Math.sin(c.clock * 23 + i * 2) * 0.06;
          f.scale.y = (i ? 0.3 : 0.44) * k;
        });
      near = null;
      let best = REACH;
      for (const k of workers) {
        if (!k.p.active) continue;
        k.p.y = ground(k.p.x, k.p.z);
        // Seated people don't move; keep their bodies where they sit.
        k.p.body.x = k.p.x;
        k.p.body.z = k.p.z;
        const d = Math.hypot(k.p.x - c.avatar.x, k.p.z - c.avatar.z);
        if (d < best) {
          best = d;
          near = k;
        }
        if (visible) pose(k, c);
      }
    },
    greeter(c): Greeter | null {
      if (!near) return null;
      const k = near;
      head.set(k.p.x, k.p.y + 1.6, k.p.z);
      const role: Role = k.role === "elder" && !isOut("craft", c.time) ? "fire" : k.role;
      return {
        head,
        text: greeting(role, k.greetN),
        greet() {
          k.wave = 2.2;
          k.greetN++;
        },
      };
    },
    people: () => workers.filter((k) => k.p.active).length,
    points: () => workers.map((k) => ({ x: k.p.x, z: k.p.z })),
    dispose() {
      for (const k of workers) k.p.dispose();
      creatures.remove(stake);
      creatures.remove(warp);
      creatures.remove(potsBody);
      creatures.removeKeepOut(zone);
      propGeo.dispose();
      props.removeFromParent();
      cone.dispose();
      (glow.material as THREE.Material).dispose();
      fl.removeFromParent();
    },
  };
}
