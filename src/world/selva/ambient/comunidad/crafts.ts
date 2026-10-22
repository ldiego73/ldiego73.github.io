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
import type { Npc } from "../../../ambient/people/npc";
import type { HumanCrowd } from "../../../characters/crowd";
import type { HeldProps } from "../../../characters/props";
import { creatures, type KeepOut } from "../../../creatures";
import { glowSprite } from "../../../props";
import { NATURAL, SKINS, SKIRTS, type Who } from "./dress";
import { greeting, isOut, type Role } from "./logic";
import { frameMatrix, loom, mat, pots, stool } from "./models";
import type { Ctx, Greeter, Group } from "./types";
import { villager } from "./villager";

export interface CraftSpot {
  /** Weaver (hips), potter and elder positions (world) and the direction they face (yaw). */
  weaver: { x: number; z: number; yaw: number };
  potter: { x: number; z: number; yaw: number };
  elder: { x: number; z: number; yaw: number };
}

interface Worker {
  p: Npc;
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
  crowd: HumanCrowd,
  held: HeldProps,
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
    who: Who;
    skin: string;
    skirt?: readonly [string, string];
    top?: string;
    cushma?: string;
    home: CraftSpot["weaver"];
  }> = [
    { role: "weaver", who: "woman", skin: SKINS[1] as string, skirt: sk, top: "#c2456b", home: spot.weaver },
    // The elder in natural cotton and a feather crown.
    { role: "elder", who: "elder", skin: SKINS[2] as string, cushma: NATURAL, home: spot.elder },
    { role: "potter", who: "woman", skin: SKINS[4] as string, skirt: sk2, top: "#2a9d8f", home: spot.potter },
  ];
  const workers: Worker[] = defs.slice(0, Math.max(1, n)).map((d, i) => {
    const p = villager(crowd, {
      kind: "villager",
      who: d.who,
      r: R,
      skin: d.skin,
      ...(d.skirt ? { skirt: d.skirt } : {}),
      ...(d.top ? { top: d.top } : {}),
      ...(d.cushma ? { cushma: d.cushma } : {}),
      radius: 0.42,
      seed: 31 + i * 17.7,
    });
    p.place(d.home.x, d.home.z, d.home.yaw);
    p.y = ground(d.home.x, d.home.z);
    // The potter paints a pot held in her lap.
    if (d.role === "potter") {
      p.hold(held, "pot", "#b5653b");
      p.hold(held, "brush");
    }
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

  /** Stool seat height (./models.ts stool: the seat top), for the elder's "sit-stool". */
  const STOOL_SEAT = 0.31;
  const pose = (k: Worker, c: Ctx) => {
    const p = k.p;
    const a = p.anim;
    p.speed = 0;
    // The weaver at the backstrap loom (leaning back on the strap, passing and beating the weft), the potter
    // cross-legged painting a pot in her lap, the elder on his stool.
    if (k.role === "weaver") a.act("weave", { fade: 0.5 });
    else if (k.role === "potter") a.act("sit-cross", { fade: 0.5 });
    else a.act("sit-stool", { fade: 0.5, seat: STOOL_SEAT });
    if (k.wave > 0) {
      // Greeted: the elder and the potter wave back from where they sit, looking at the traveler; the weaver,
      // her hands on the loom, answers with a look.
      k.wave -= c.dt;
      if (k.role !== "weaver") a.actArms("wave", { fade: 0.3, side: -1 });
      p.lookRange = 6;
    } else {
      a.actArms(k.role === "potter" ? "paint" : "none", { fade: 0.4 });
      p.lookRange = k.role === "elder" ? 4 : 0;
    }
    p.commit(c);
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
    dev: {
      /** Each worker's role, action and arms action (screenshots). */
      actions: () => workers.map((k) => [k.role, k.p.active, k.p.anim.action, k.p.anim.armsAction]),
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
