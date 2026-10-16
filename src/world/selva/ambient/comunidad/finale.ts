/**
 * People at the end of the road, in the kené totem's clearing (../kene.ts, ../kene/spot.ts): the jungle's
 * counterpart of the mountain's summit camp, so the traveler arrives among people.
 *  - two Shipibo-Konibo women sitting by a long cotton cloth laid on a palm mat, painting kené on it (half
 *    of it painted, the rest still plain), with bowls of huito black and red earth;
 *  - two travellers resting on a log with their baskets and a banana bunch on the ground, by a small hearth;
 *  - (high tier) two children playing a clapping game, watched by an elder on a carved stool.
 * By day all of them; at night the women, the children and the elder have gone home and the travellers stay
 * on by the lit hearth (they will walk on in the morning). "E · Saludar" near the women, the elder or the
 * travellers shows a short bilingual line (generic, about the craft and the road), but never close to the
 * totem, where "E" opens the reward panel.
 *
 * Plaza frame (../kene/spot.ts): origin at the clearing's centre, +Z back toward the road; angles from +Z
 * growing toward +X. Everyone sits between the jars round the dais and the ring of banner poles, out of the
 * entrance wedge (±0.6 rad round +Z) and away from the entrance sign. One merged vertex-colored mesh for the
 * props (mat, cloth, bowls, log, baskets, stool, hearth) + the flames at night.
 */
import * as THREE from "three";
import { hearth, rng, Static } from "../../../ambient/people/models";
import { damp, type Person } from "../../../ambient/people/person";
import type { Crowd, Palette } from "../../../ambient/people/rig";
import { creatures } from "../../../creatures";
import { glowSprite } from "../../../props";
import { keneFloorY, keneSpot, PROMPT_R } from "../kene/spot";
import { greeting, isOut, type Role } from "./logic";
import {
  type AmazonPart,
  BOY,
  CUSHMAS,
  frameMatrix,
  GIRL,
  MAN,
  mat,
  SHORTS,
  SKINS,
  SKIRTS,
  stool,
  TEES,
  WOMAN,
} from "./models";
import type { Ctx, Greeter, Group } from "./types";
import { villager, wavePose } from "./villager";

type Kind = "painter" | "traveller" | "kid" | "elder";

interface Who {
  p: Person;
  kind: Kind;
  /** Index within its kind (left/right painter, first/second traveller…). */
  k: number;
  x: number;
  z: number;
  yaw: number;
  greetN: number;
  wave: number;
}

const REACH = 2.1;
/** Who comes first as the headcount grows: the low tier gets the women and the travellers. */
const ORDER: ReadonlyArray<readonly [Kind, number]> = [
  ["painter", 0],
  ["traveller", 0],
  ["traveller", 1],
  ["painter", 1],
  ["kid", 0],
  ["kid", 1],
  ["elder", 0],
];
/** Polar spots (angle from +Z, radius from the clearing centre) of the three groups. */
const CLOTH = { a: 1.0, r: 4.3 } as const;
const LOG = { a: 2.0, r: 5.3 } as const;
const FIRE = { a: 2.0, r: 4.05 } as const;
const KIDS = { a: -1.15, r: 3.9 } as const;
const ELDER = { a: -1.62, r: 4.65 } as const;
const INK = "#231a16";
const CREAM = "#efe3c8";

export function createFinale(env: Ctx["env"], crowd: Crowd, staticMat: THREE.Material, n: number): Group {
  const R = rng(0x6e4e1);
  const spot = keneSpot(env.selva.layout);
  // The clearing's floor is a raised deck the totem ambient registers after this one is built: sit on it.
  const floorY = keneFloorY(spot, env.heightAt);
  const ground = (x: number, z: number) => Math.max(floorY, env.selva.groundAt(x, z));
  const polar = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];
  const world = (lx: number, lz: number) => spot.world(lx, lz);
  /** World yaw of a local direction (dx, dz). */
  const yawOf = (dx: number, dz: number) => spot.yaw + Math.atan2(dx, dz);

  // ------------------------------------------------------------ places (local)
  const [cx, cz] = polar(CLOTH.a, CLOTH.r);
  const cr = [Math.sin(CLOTH.a), Math.cos(CLOTH.a)] as const;
  const ct = [Math.cos(CLOTH.a), -Math.sin(CLOTH.a)] as const;
  const [lgx, lgz] = polar(LOG.a, LOG.r);
  const lr = [Math.sin(LOG.a), Math.cos(LOG.a)] as const;
  const lt = [Math.cos(LOG.a), -Math.sin(LOG.a)] as const;
  const [kx, kz] = polar(KIDS.a, KIDS.r);
  const kt = [Math.cos(KIDS.a), -Math.sin(KIDS.a)] as const;
  const [ex, ez] = polar(ELDER.a, ELDER.r);
  const [fx, fz] = polar(FIRE.a, FIRE.r);
  const home = (kind: Kind, k: number): { x: number; z: number; yaw: number } => {
    const s = k ? -1 : 1;
    if (kind === "painter") {
      // Side by side on the cloth's outer edge, facing in (toward the plaza and the arriving traveler).
      const x = cx + cr[0] * 0.78 + ct[0] * 0.45 * s;
      const z = cz + cr[1] * 0.78 + ct[1] * 0.45 * s;
      return { x, z, yaw: yawOf(-cr[0], -cr[1]) };
    }
    if (kind === "traveller") {
      const x = lgx + lt[0] * 0.45 * s;
      const z = lgz + lt[1] * 0.45 * s;
      return { x, z, yaw: yawOf(-lr[0], -lr[1]) };
    }
    if (kind === "kid") {
      // Facing each other across the game.
      const x = kx + kt[0] * 0.4 * s;
      const z = kz + kt[1] * 0.4 * s;
      return { x, z, yaw: yawOf(-kt[0] * s, -kt[1] * s) };
    }
    return { x: ex, z: ez, yaw: yawOf(kx - ex, kz - ez) };
  };

  // ------------------------------------------------------------ people
  const people: Who[] = ORDER.slice(0, Math.max(0, n)).map(([kind, k], i) => {
    const sk = SKIRTS[(i * 2 + k) % SKIRTS.length] as readonly [string, string];
    let wear: AmazonPart[];
    let palette: Palette;
    let scale = 0.94;
    let headScale = 1;
    if (kind === "painter") {
      wear = [...WOMAN];
      palette = [SKINS[(2 + k * 3) % SKINS.length] as string, sk[0], sk[1], k ? "#2a9d8f" : "#c2456b"];
      scale = 0.92 + k * 0.03;
    } else if (kind === "traveller") {
      wear = [...MAN];
      if (k === 1) wear.push("a:crown");
      const c = CUSHMAS[(k * 3 + 1) % CUSHMAS.length] as string;
      palette = [SKINS[k ? 6 : 0] as string, c, k ? "#efe3c8" : "#2a1d17", c];
      scale = 0.97;
    } else if (kind === "kid") {
      wear = [...(k ? BOY : GIRL)];
      palette = k
        ? [SKINS[3] as string, SHORTS[1] as string, "#e8b631", TEES[5] as string]
        : [SKINS[1] as string, sk[0], sk[1], TEES[4] as string];
      scale = 0.6 + k * 0.05;
      headScale = 1.3;
    } else {
      wear = [...MAN, "a:crown"];
      palette = [SKINS[2] as string, "#d8cbb0", "#3b2a20", "#d8cbb0"];
      scale = 0.93;
    }
    const p = villager({
      kind: kind === "kid" ? "child" : "villager",
      crowd,
      idx: crowd.alloc(),
      wear,
      palette,
      scale,
      headScale,
      radius: kind === "kid" ? 0.26 : 0.4,
      seed: 61 + i * 11.3,
    });
    const h = home(kind, k);
    const w = world(h.x, h.z);
    p.place(w.x, w.z, h.yaw);
    p.y = ground(w.x, w.z);
    return { p, kind, k, x: w.x, z: w.z, yaw: h.yaw, greetN: Math.floor(R() * 3), wave: 0 };
  });
  const has = (kind: Kind) => people.some((w) => w.kind === kind);

  // ------------------------------------------------------------ props
  const s = new Static();
  const P = s.P;
  const m = new THREE.Matrix4();
  const frame = (lx: number, lz: number, localYaw: number) => {
    const w = world(lx, lz);
    return frameMatrix(w.x, ground(w.x, w.z), w.z, spot.yaw + localYaw, m);
  };
  if (has("painter")) {
    // The cloth along the tangent (local +X of this frame), the painters on its +Z side (outward).
    s.p.post = frame(cx, cz, CLOTH.a);
    mat(s.p, P, 2.3, 1.5);
    s.p.add(P.box, CREAM, 0, 0.032, 0, 0, 0, 0, 1.9, 0.012, 0.85);
    // Kené on the painted two thirds: a border, the central band and stepped maze lines (4 mm proud).
    const y = 0.042;
    const x0 = -0.92;
    const x1 = 0.3;
    for (const z of [-0.39, 0.39]) s.p.add(P.box, INK, (x0 + x1) / 2, y, z, 0, 0, 0, x1 - x0, 0.006, 0.03);
    s.p.add(P.box, INK, x0, y, 0, 0, 0, 0, 0.03, 0.006, 0.8);
    s.p.add(P.box, INK, (x0 + x1) / 2, y, 0, 0, 0, 0, x1 - x0, 0.006, 0.04);
    for (let i = 0; i < 6; i++) {
      const bx = x0 + 0.12 + i * 0.19;
      for (const sz of [-1, 1]) {
        // A step: out from the band, along, and out again (the maze-like kené stair).
        s.p.add(P.box, INK, bx, y, sz * 0.11, 0, 0, 0, 0.02, 0.006, 0.14);
        s.p.add(P.box, INK, bx + 0.05, y, sz * 0.18, 0, 0, 0, 0.12, 0.006, 0.02);
        s.p.add(P.box, INK, bx + 0.1, y, sz * 0.26, 0, 0, 0, 0.02, 0.006, 0.16);
        s.p.add(P.box, INK, bx + 0.02, y, sz * 0.33, 0, 0, 0, 0.06, 0.006, 0.015);
      }
    }
    // Paint bowls (huito black, red earth) and a brush stick by the painters' knees.
    s.p.add(P.cyl, "#8f3f2b", 0.55, 0.05, 0.6, 0, 0, 0, 0.09, 0.07, 0.09);
    s.p.add(P.cyl, INK, 0.55, 0.088, 0.6, 0, 0, 0, 0.075, 0.01, 0.075);
    s.p.add(P.cyl, "#8f3f2b", -0.2, 0.05, 0.62, 0, 0, 0, 0.08, 0.07, 0.08);
    s.p.add(P.cyl, "#a8432f", -0.2, 0.088, 0.62, 0, 0, 0, 0.065, 0.01, 0.065);
    s.p.add(P.cyl6, "#7a4a2b", 0.42, 0.05, 0.42, 0, 0.6, Math.PI / 2, 0.008, 0.24, 0.008);
  }
  if (has("traveller")) {
    // The log along the tangent (this frame's +Z), seat height ~0.31 (the stool pose's hips); this frame's
    // +X points inward (toward the totem), so the baskets go on its −X side, behind the travellers.
    s.p.post = frame(lgx, lgz, LOG.a + Math.PI / 2);
    s.p.add(P.cyl, "#8d7a62", 0, 0.16, 0, Math.PI / 2, 0, 0, 0.17, 1.9, 0.17);
    s.p.add(P.cyl, "#c9b08a", 0, 0.16, 0.95, Math.PI / 2, 0, 0, 0.15, 0.012, 0.15);
    s.p.add(P.cyl, "#c9b08a", 0, 0.16, -0.95, Math.PI / 2, 0, 0, 0.15, 0.012, 0.15);
    // Their palm baskets and a green banana bunch on the ground behind the log.
    for (const [z, sc] of [
      [0.8, 1],
      [-0.75, 0.9],
    ] as const) {
      const bx = -0.5;
      s.p.add(P.flare, "#b48a4c", bx, 0.24 * sc, z, Math.PI, 0, 0, 0.24 * sc, 0.48 * sc, 0.24 * sc);
      for (const k of [0.15, 0.3]) s.p.add(P.cyl, "#8a6633", bx, k * sc, z, 0, 0, 0, 0.23 * sc, 0.025, 0.23 * sc);
    }
    for (let i = 0; i < 7; i++)
      s.p.add(P.cap, "#7f9a3a", -0.55 - (i % 3) * 0.07, 0.08, -0.15 + i * 0.05, 0.3, 0, 1.2, 0.035, 0.14, 0.035);
    s.p.post = null;
    const fw = world(fx, fz);
    hearth(s, new THREE.Matrix4().makeTranslation(fw.x, ground(fw.x, fw.z), fw.z));
  }
  if (has("elder")) {
    s.p.post = frame(ex, ez, Math.atan2(kx - ex, kz - ez));
    stool(s.p, P);
  }
  s.p.post = null;
  const propGeo = s.build();
  const props = new THREE.Mesh(propGeo, staticMat);
  props.name = "comunidad:finale";
  props.castShadow = true;
  props.receiveShadow = true;
  env.scene.add(props);

  // Flames (night), at the travellers' hearth.
  const fire = world(fx, fz);
  const fl = new THREE.Group();
  fl.name = "comunidad:finale-flames";
  fl.position.set(fire.x, ground(fire.x, fire.z), fire.z);
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

  // Solid props: the cloth (people sit on its edge, nobody walks across it), the log, the hearth.
  const bodies = [
    has("painter") ? creatures.add("prop", 0.75, { ...world(cx, cz), give: 0 }) : null,
    has("traveller") ? creatures.add("prop", 0.5, { ...world(lgx + lt[0] * 0.6, lgz + lt[1] * 0.6), give: 0 }) : null,
    has("traveller") ? creatures.add("prop", 0.5, { ...world(lgx - lt[0] * 0.6, lgz - lt[1] * 0.6), give: 0 }) : null,
    has("traveller") ? creatures.add("prop", 0.45, { ...fire, give: 0 }) : null,
  ];

  const isUp = (w: Who, c: Ctx) =>
    w.kind === "traveller" ? true : w.kind === "kid" ? isOut("play", c.time) : isOut("craft", c.time);
  let first = true;
  let tick = 0;
  let shown = true;
  let near: Who | null = null;
  const head = new THREE.Vector3();

  const pose = (w: Who, c: Ctx) => {
    const p = w.p;
    const b = p.bones;
    const t = c.rm ? 0 : c.clock;
    p.rest(c.clock, c.rm);
    p.speed = 0;
    if (w.kind === "painter") {
      // Sitting by the cloth, leaning in; the right hand draws the line, the left steadies the cloth.
      p.sit(c.clock, true, -0.4);
      b.armL.rotation.set(-0.85, 0, 0.3);
      b.armR.rotation.set(-1.0 + Math.sin(t * 1.3 + p.seed) * 0.08, Math.sin(t * 0.9 + p.seed) * 0.25, -0.15);
      b.head.rotation.x = 0.45;
    } else if (w.kind === "traveller") {
      // On the log: hips at its height, shins down; elbows on the knees by day, hands to the fire at night.
      b.hips.position.y = -0.24;
      b.legL.rotation.set(-1.15, 0, 0.1);
      b.legR.rotation.set(-1.15, 0, -0.1);
      const night = isOut("fire", c.time);
      b.torso.rotation.x = night ? 0.3 : 0.12;
      b.armL.rotation.set(night ? -1.1 : -0.8, 0, 0.2);
      b.armR.rotation.set(night ? -1.1 : -0.8, 0, -0.2);
      if (!c.rm) b.head.rotation.y = Math.sin(c.clock * 0.2 + p.seed) * 0.35;
    } else if (w.kind === "kid") {
      // Clapping game: hands meet the partner's, then their own, in a little rhythm.
      const beat = Math.sin(t * 5 + w.k * Math.PI);
      const cross = Math.max(0, beat);
      b.armL.rotation.set(-1.3 - cross * 0.2, 0, 0.1 + (1 - cross) * 0.35);
      b.armR.rotation.set(-1.3 - cross * 0.2, 0, -0.1 - (1 - cross) * 0.35);
      b.hips.position.y = Math.abs(Math.sin(t * 2.5 + w.k)) * 0.03;
      b.head.rotation.x = -0.05;
    } else {
      b.hips.position.y = -0.24;
      b.legL.rotation.set(-1.15, 0, 0.1);
      b.legR.rotation.set(-1.15, 0, -0.1);
      b.armL.rotation.set(-0.75, 0, 0.15);
      b.armR.rotation.set(-0.75, 0, -0.15);
      if (!c.rm) b.head.rotation.y = Math.sin(c.clock * 0.25 + p.seed) * 0.3;
    }
    if (w.wave > 0) {
      w.wave -= c.dt;
      wavePose(p, c.clock, c.rm);
      const target = Math.atan2(c.avatar.x - p.x, c.avatar.z - p.z) - p.yaw;
      b.head.rotation.y = damp(b.head.rotation.y, Math.atan2(Math.sin(target), Math.cos(target)) * 0.6, 8, c.dt);
    }
    p.commit();
  };

  const center = world(0, 0);
  return {
    name: "finale",
    center: new THREE.Vector3(center.x, ground(center.x, center.z), center.z),
    radius: 7,
    update(c, visible) {
      if (first || c.jump) for (const w of people) w.p.setActive(isUp(w, c));
      first = false;
      if (tick++ % 15 === 0)
        for (const w of people) {
          const want = isUp(w, c);
          if (w.p.active !== want && !c.seen(w.p.x, w.p.y + 0.6, w.p.z, 80)) w.p.setActive(want);
        }
      if (visible !== shown) {
        shown = visible;
        props.visible = visible;
        if (!visible) for (const w of people) w.p.hide();
      }
      const fireOn = isOut("fire", c.time);
      fl.visible = visible && fireOn && has("traveller");
      if (fl.visible && !c.rm)
        flames.forEach((f, i) => {
          const k = 1 + Math.sin(c.clock * (9 + i * 3.1) + i) * 0.14 + Math.sin(c.clock * 23 + i * 2) * 0.06;
          f.scale.y = (i ? 0.3 : 0.44) * k;
        });
      near = null;
      // Close to the totem, "E" is the reward panel's.
      const dTotem = Math.hypot(c.avatar.x - spot.totem.x, c.avatar.z - spot.totem.z);
      let best = dTotem < PROMPT_R + 0.15 ? 0 : REACH;
      for (const w of people) {
        if (!w.p.active) continue;
        w.p.y = ground(w.p.x, w.p.z);
        // Seated people don't move; keep their bodies where they sit.
        w.p.x = w.x;
        w.p.z = w.z;
        w.p.yaw = w.yaw;
        w.p.body.x = w.x;
        w.p.body.z = w.z;
        const d = Math.hypot(w.x - c.avatar.x, w.z - c.avatar.z);
        if (w.kind !== "kid" && d < best) {
          best = d;
          near = w;
        }
        if (visible) pose(w, c);
      }
    },
    greeter(c): Greeter | null {
      if (!near) return null;
      const w = near;
      head.set(w.p.x, w.p.y + 1.5, w.p.z);
      const role: Role =
        w.kind === "painter" ? "painter" : w.kind === "elder" ? "elder" : isOut("fire", c.time) ? "camp" : "traveller";
      return {
        head,
        text: greeting(role, w.greetN),
        greet() {
          w.wave = 2.2;
          w.greetN++;
        },
      };
    },
    people: () => people.filter((w) => w.p.active).length,
    points: () => people.map((w) => ({ x: w.x, z: w.z })),
    dispose() {
      for (const w of people) w.p.dispose();
      for (const b of bodies) if (b) creatures.remove(b);
      propGeo.dispose();
      props.removeFromParent();
      cone.dispose();
      (glow.material as THREE.Material).dispose();
      fl.removeFromParent();
    },
  };
}
