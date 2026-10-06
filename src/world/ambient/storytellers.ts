/**
 * Storytelling circle at the Khipu de escritos (station "build-2").
 *
 * By day an elder amauta (poncho, chullo, walking staff) stands beside the khipu frame telling a story:
 * he talks to the children, then turns and points along the cords, and answers when a child raises a hand.
 * Three or four children sit on flat stones around a small stone hearth, their heads following him (and the
 * cords when he points). Behind the frame, one or two adults read the cords, a hand tracing a cord down from
 * the knots by the primary cord, now and then stepping to another cord. At dusk the hearth is lit; the
 * children and one reader walk home toward the Qhapaq Ñan, and the elder and the other reader sit by the
 * fire through the night (back to the story after sunrise).
 *
 * Nobody stands in the board's E prompt rectangle or on the path to the trail; readers stand behind the frame
 * just outside the cord column, so the cords stay readable from the front. No prompt of its own.
 * Rendering: one Crowd (people/rig.ts, one InstancedMesh per part, ~11 draws) + hearth/seats (1) +
 * flames (2) + glow (1, night). Low quality: 2 children, 1 reader.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { creatures } from "../creatures";
import { worldData } from "../data";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { DYE } from "../palette";
import { glowSprite } from "../props";
import { lxOf, lzOf, stationFrame, wx, wz } from "./fields/geo";
import { jumped, within } from "./people/logic";
import {
  DARKS,
  MAN,
  type PartName,
  POLLERAS,
  PONCHOS,
  partSpecs,
  rng,
  SHADOW_PARTS,
  SKINS,
  WEAVES,
  WOMAN,
} from "./people/models";
import { angleDamp, damp, Person } from "./people/person";
import { Crowd, type Palette, paletteMaterial } from "./people/rig";
import {
  boardDims,
  CORD_Y,
  circleLayout,
  cordX,
  FIRE_LIT,
  FZ,
  headYaw,
  type Mode,
  modeAt,
  type P2,
  pointWeight,
  readerCords,
} from "./storytellers/logic";
import { circleProps, staffSpec } from "./storytellers/props";
import { staffInHand } from "./storytellers/staff";

const STATION = "build-2";
/** Readers stand this far beside their cord (their bodies stay clear of the cord column seen from the front). */
const READER_OFF = 0.42;
const PARTS: PartName[] = [
  "leg",
  "m:torso",
  "m:arm",
  "m:head",
  "w:skirt",
  "w:torso",
  "w:arm",
  "w:head",
  "chullo",
  "montera",
  "sombrero",
];

type Role = "elder" | "reader" | "kid";
type State = "off" | "walk" | "story" | "fire";

interface Actor {
  p: Person;
  role: Role;
  /** Reader 0/1, kid index. */
  who: number;
  /** Only on high quality. */
  hi: boolean;
  /** Stays by the fire at night. */
  sitter: boolean;
  mode: Mode;
  /** World spots. */
  seat: THREE.Vector3;
  fireSeat: THREE.Vector3;
  route: THREE.Vector3[];
  wp: number;
  /** State reached at the end of the route. */
  goal: State;
  wait: number;
  /** Kids: seconds until the next raised hand / seconds the hand stays up (negative). Readers: next cord. */
  timer: number;
  cord: number;
  /** Smoothed head yaw / torso twist. */
  gaze: number;
  twist: number;
}

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

export const create: CreateAmbient = (envIn): Ambient => {
  const env = envIn as WorldEnvExtra;
  const f = stationFrame(env, STATION);
  const dims = boardDims(worldData().posts.length);
  let low = env.quality === "low";
  const ground = (x: number, z: number) => env.extra.groundAt(x, z);
  const W = (p: P2, out = new THREE.Vector3()) => {
    const x = wx(f, p.x, p.z);
    const z = wz(f, p.x, p.z);
    return out.set(x, ground(x, z), z);
  };
  const flat = (p: P2) => Math.abs(W(p).y - f.y) < 0.3;

  // ------------------------------------------------------------ layout
  const L = circleLayout(dims, 4);
  const kidSeats = L.kids.filter(flat);
  const hearthW = W(L.hearth);
  const elderW = W(L.elder);
  const fireW: [THREE.Vector3, THREE.Vector3] = [W(L.fire[0]), W(L.fire[1])];
  const outW = L.out.map((p) => W(p));
  const trailT = env.trail.nearestT(outW[1]!.x, outW[1]!.z);
  const trailW = env.trail.pointAt(trailT).clone();
  /** Readers walk around the +x post to get behind the frame. */
  const cornerW = W({ x: dims.half + 1.0, z: FZ - 0.6 });
  const cordsW = W({ x: 0, z: FZ });
  cordsW.y += CORD_Y - 0.9;
  const center = W({ x: dims.half * 0.5 + 1.2, z: -0.4 });

  // ------------------------------------------------------------ people
  const R = rng(4242);
  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const staticMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const specs = [...partSpecs(PARTS), staffSpec()];
  const total = 1 + 2 + kidSeats.length;
  const crowd = new Crowd(specs, total, mat, SHADOW_PARTS);
  crowd.group.name = "storytellers:crowd";
  env.scene.add(crowd.group);

  const actors: Actor[] = [];
  const add = (
    role: Role,
    who: number,
    wear: PartName[],
    palette: Palette,
    scale: number,
    o: { hi?: boolean; sitter?: boolean; seat: THREE.Vector3; fireSeat?: THREE.Vector3; head?: number; kind: string },
  ) => {
    const idx = crowd.alloc();
    const p = new Person({
      kind: o.kind,
      crowd,
      idx,
      wear,
      palette,
      scale,
      headScale: o.head ?? 1,
      girth: role === "kid" ? 1 : 1.04,
      radius: role === "kid" ? 0.26 : 0.36,
      seed: 3 + actors.length * 9.7,
    });
    if (role === "elder") crowd.wear(idx, [...wear, "staff"], palette);
    const a: Actor = {
      p,
      role,
      who,
      hi: o.hi ?? false,
      sitter: o.sitter ?? false,
      mode: "home",
      seat: o.seat,
      fireSeat: o.fireSeat ?? o.seat,
      route: [],
      wp: 0,
      goal: "off",
      wait: 0,
      timer: 8 + R() * 20,
      cord: 0,
      gaze: 0,
      twist: 0,
    };
    actors.push(a);
    return a;
  };

  const elder = add("elder", 0, [...MAN, "chullo"], [pick(R, SKINS), "#5b4436", DYE.red, "#2a2420"], 0.98, {
    kind: "elder",
    sitter: true,
    seat: elderW,
    fireSeat: fireW[0],
  });
  // Elder points with the right arm, aimed by yaw after lifting it forward.
  elder.p.bones.armR.rotation.order = "YXZ";
  const readerSpot = (who: 0 | 1, cord: number, out?: THREE.Vector3) =>
    W({ x: cordX(dims, cord) + (who === 0 ? -READER_OFF : READER_OFF), z: L.readerZ }, out);
  const readers = [
    add(
      "reader",
      0,
      [...WOMAN, "montera"],
      [pick(R, SKINS), pick(R, POLLERAS), pick(R, WEAVES), pick(R, DARKS)],
      0.95,
      {
        kind: "reader",
        sitter: true,
        seat: readerSpot(0, readerCords(dims, 0)[1]),
        fireSeat: fireW[1],
      },
    ),
    add("reader", 1, [...MAN, "sombrero"], [pick(R, SKINS), pick(R, PONCHOS), pick(R, WEAVES), pick(R, DARKS)], 1.02, {
      kind: "reader",
      hi: true,
      seat: readerSpot(1, readerCords(dims, 1)[0]),
    }),
  ];
  for (const r of readers) r.cord = readerCords(dims, r.who as 0 | 1)[r.who === 0 ? 1 : 0];
  const kids = kidSeats.map((s, i) => {
    const boy = i % 2 === 1;
    return add(
      "kid",
      i,
      boy ? [...MAN, "chullo"] : [...WOMAN],
      [pick(R, SKINS), boy ? pick(R, PONCHOS) : pick(R, POLLERAS), pick(R, WEAVES), pick(R, DARKS)],
      0.6 + R() * 0.08,
      { kind: "child", hi: i % 2 === 1 && kidSeats.length > 2, seat: W(s), head: 1.3 },
    );
  });

  // ------------------------------------------------------------ hearth, seats, flames
  const propsGeo = circleProps(
    hearthW,
    [...kidSeats, L.fire[0], L.fire[1]].map((p) => {
      const v = W(p);
      return { x: v.x, z: v.z };
    }),
    (() => {
      const v = W({ x: L.hearth.x + 0.9, z: L.hearth.z - 1.15 });
      return { x: v.x, z: v.z };
    })(),
    ground,
  );
  const propsMesh = new THREE.Mesh(propsGeo, staticMat);
  propsMesh.name = "storytellers:hearth";
  propsMesh.castShadow = true;
  propsMesh.receiveShadow = true;
  env.scene.add(propsMesh);
  env.addCollider({ kind: "circle", x: hearthW.x, z: hearthW.z, r: 0.55 });
  const hearthBody = creatures.add("hearth", 0.55, { solid: true, x: hearthW.x, z: hearthW.z });
  // Animals keep out of the circle (hearth, seats): centered on the seat arc, its edge just outside the E rectangle.
  const keepOut = creatures.keepOut(wx(f, dims.half + 2.6, 0.05), wz(f, dims.half + 2.6, 0.05), 1.75);

  const flames = new THREE.Group();
  flames.name = "storytellers:flames";
  flames.position.copy(hearthW);
  const cone = new THREE.ConeGeometry(1, 1, 6);
  const fmOuter = env.toon("#ffb35c", { emissive: "#ff8a3d", emissiveIntensity: 1.6 });
  const fmInner = env.toon("#ffe08a", { emissive: "#ffd36b", emissiveIntensity: 1.8 });
  const flameSpecs: Array<[number, number, number, number, number]> = [
    // x, z, radius, height, material (0 outer / 1 inner)
    [0.08, 0, 0.14, 0.44, 0],
    [-0.08, 0.05, 0.13, 0.38, 0],
    [0, -0.08, 0.12, 0.34, 0],
    [0, 0, 0.09, 0.3, 1],
  ];
  const flameMeshes = flameSpecs.map(([x, z, r, h, m]) => {
    const mesh = new THREE.Mesh(cone, m ? fmInner : fmOuter);
    mesh.position.set(x, 0.1 + h / 2, z);
    mesh.scale.set(r, h, r);
    flames.add(mesh);
    return mesh;
  });
  const glow = glowSprite(env, "#ffb35c", 2.6);
  glow.position.y = 0.5;
  flames.add(glow);
  env.noOutline(flames);
  flames.visible = false;
  env.scene.add(flames);

  // ------------------------------------------------------------ behaviour
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, y: number, z: number, max = 70) => {
    if (Math.hypot(x - camPos.x, z - camPos.z) > max) return false;
    seenV.set(x, y, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  const enabled = (a: Actor) => !(low && a.hi);
  /** Readers' seat follows their current cord (updated in place when they pick another). */
  const storySpot = (a: Actor) => a.seat;
  const setRoute = (a: Actor, goal: State, ...pts: THREE.Vector3[]) => {
    a.route.length = 0;
    a.route.push(...pts);
    a.wp = 0;
    a.goal = goal;
    a.wait = 0;
    a.p.state = "walk";
  };

  const elderYaw = (() => {
    // Facing between the children and the cords, so a turn of the head and shoulders reaches either.
    const ka = Math.atan2(center.x - elderW.x, center.z - elderW.z);
    const kc = Math.atan2(cordsW.x - elderW.x, cordsW.z - elderW.z);
    let d = kc - ka;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return ka + d * 0.42;
  })();

  /** Snap to where the schedule puts them (load, clock jumps, far away). */
  const snap = (a: Actor, mode: Mode) => {
    a.mode = mode;
    const p = a.p;
    if (!enabled(a) || mode === "home") {
      p.setActive(false);
      p.state = "off";
      return;
    }
    p.setActive(true);
    const at = mode === "fire" ? a.fireSeat : storySpot(a);
    const yaw =
      mode === "fire"
        ? Math.atan2(hearthW.x - at.x, hearthW.z - at.z)
        : a.role === "reader"
          ? f.yaw
          : a.role === "kid"
            ? Math.atan2(elderW.x - at.x, elderW.z - at.z)
            : elderYaw;
    p.place(at.x, at.z, yaw);
    p.y = at.y;
    p.state = mode === "fire" ? "fire" : "story";
  };

  /** The schedule changed while in view: walk instead of snapping. */
  const transition = (a: Actor, mode: Mode) => {
    const from = a.mode;
    a.mode = mode;
    if (!enabled(a)) return;
    const p = a.p;
    if (mode === "home") {
      if (!p.active) return;
      const first = a.role === "reader" ? cornerW : outW[0]!;
      setRoute(a, "off", first, outW[0]!, outW[1]!, trailW);
      if (a.role === "reader") a.route.splice(1, 1);
    } else if (mode === "story") {
      if (from === "fire" && p.active) {
        if (a.role === "reader") setRoute(a, "story", cornerW, storySpot(a));
        else setRoute(a, "story", storySpot(a));
      } else {
        p.state = "off";
        a.wait = 0;
      }
    } else if (mode === "fire") {
      if (!p.active) {
        p.state = "off";
        a.wait = 0;
      } else if (a.role === "reader") setRoute(a, "fire", cornerW, a.fireSeat);
      else setRoute(a, "fire", a.fireSeat);
    }
  };

  /** Inactive with somewhere to be: appear on the trail while unseen (or after a while), then walk in. */
  const arrive = (a: Actor, dt: number) => {
    if (a.mode === "home" || !enabled(a)) return;
    a.wait += dt;
    if (seen(trailW.x, trailW.y + 1, trailW.z, 60) && a.wait < 20) return;
    const p = a.p;
    p.setActive(true);
    p.place(trailW.x, trailW.z, Math.atan2(outW[1]!.x - trailW.x, outW[1]!.z - trailW.z));
    p.y = trailW.y;
    if (a.role === "reader")
      setRoute(
        a,
        a.mode === "fire" ? "fire" : "story",
        outW[1]!,
        cornerW,
        a.mode === "fire" ? a.fireSeat : storySpot(a),
      );
    else
      setRoute(
        a,
        a.mode === "fire" ? "fire" : "story",
        outW[1]!,
        outW[0]!,
        a.mode === "fire" ? a.fireSeat : storySpot(a),
      );
  };

  let asker: Actor | null = null;
  let clock = 0;

  const stepWalk = (a: Actor, dt: number) => {
    const p = a.p;
    const t = a.route[a.wp];
    if (!t) return;
    const last = a.wp === a.route.length - 1;
    const d = p.seek(t.x, t.z, a.role === "kid" ? 1.25 : a.role === "elder" ? 0.75 : 1.0, dt);
    if (d < (last ? 0.18 : 0.6)) {
      if (!last) {
        a.wp++;
        return;
      }
      if (a.goal === "off") {
        a.wait += dt;
        if (!seen(p.x, p.y + 1, p.z, 60) || a.wait > 20) {
          p.setActive(false);
          p.state = "off";
        }
        return;
      }
      p.place(t.x, t.z);
      p.state = a.goal;
    }
  };

  const pose = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const b = p.bones;
    p.rest(clock, rm);
    const st = p.state;
    if (st === "walk") {
      p.gait(dt, rm, a.role === "elder" ? 0.4 : 1);
      if (a.role === "elder") holdStaff(a);
      p.commit();
      return;
    }
    p.speed = damp(p.speed, 0, 6, dt);
    if (st === "fire") {
      sitDown(p, 0.04);
      b.armL.rotation.set(-0.95, 0, 0.3);
      b.armR.rotation.set(-0.95, 0, -0.3);
      if (!rm) {
        b.head.rotation.y = Math.sin(clock * 0.25 + p.seed) * 0.3;
        b.armL.rotation.x += Math.sin(clock * 0.7 + p.seed) * 0.05;
      }
      if (a.role === "elder") {
        // Staff laid on the ground beside him.
        b.tool.position.set(0.42, 0.49, 0.05);
        b.tool.rotation.set(Math.PI / 2, 0, 0);
      }
      p.commit();
      return;
    }
    if (a.role === "elder") poseElder(a, dt, rm);
    else if (a.role === "kid") poseKid(a, dt, rm);
    else poseReader(a, dt, rm);
    p.commit();
  };

  const sitDown = (p: Person, lean: number) => {
    const b = p.bones;
    b.hips.position.y = -0.47 * p.scale;
    b.legL.rotation.set(-1.45, 0, 0.12);
    b.legR.rotation.set(-1.45, 0, -0.12);
    b.torso.rotation.x = -lean;
    b.armL.rotation.set(-0.5, 0, 0.25);
    b.armR.rotation.set(-0.5, 0, -0.25);
  };

  // The staff follows the fist through the shoulder turn (storytellers/staff.ts).
  const holdStaff = (a: Actor) => staffInHand(a.p.bones);

  const poseElder = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const b = p.bones;
    p.yaw = angleDamp(p.yaw, elderYaw, 3, dt);
    const w = rm ? 0 : pointWeight(clock + p.seed);
    const ask = asker && asker.timer < 0 ? asker.p : null;
    // Head: the children (center, or the one asking), or the cords when pointing.
    const kidsLook = headYaw(p.yaw, p.x, p.z, ask ? ask.x : center.x, ask ? ask.z : center.z, 1.4);
    const cordLook = headYaw(p.yaw, p.x, p.z, cordsW.x, cordsW.z, 1.6);
    const look = ask ? kidsLook : kidsLook + (cordLook - kidsLook) * w;
    a.twist = angleDamp(a.twist, look * 0.45, 4, dt);
    a.gaze = angleDamp(a.gaze, look - a.twist, 5, dt);
    b.torso.rotation.y = a.twist;
    b.torso.rotation.x = 0.1;
    b.head.rotation.y = Math.max(-1.0, Math.min(1.0, a.gaze));
    b.head.rotation.x = -0.05 + (rm ? 0 : Math.sin(clock * 1.3 + p.seed) * 0.04);
    holdStaff(a);
    if (ask || w < 0.05) {
      // Telling: an open hand that rises and turns with the words.
      const k = rm ? 0 : Math.sin(clock * 1.6 + p.seed);
      b.armR.rotation.set(-0.7 + k * 0.18, (ask ? 0.2 : 0.35) + k * 0.1, -0.15);
    } else {
      // Pointing along the cords: lift forward, then aim toward them (yaw after lift).
      const aim = cordLook - a.twist;
      const up = -0.75 - w * 0.75;
      b.armR.rotation.set(up, Math.max(-1.2, Math.min(0.4, aim)) * w, -0.05);
      if (!rm) b.armR.rotation.x += Math.sin(clock * 2.2) * 0.04 * w;
    }
  };

  const poseKid = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const b = p.bones;
    sitDown(p, 0.1);
    p.face(elderW.x, elderW.z, dt, 3);
    const w = rm ? 0 : pointWeight(clock + elder.p.seed);
    let tx = elder.p.x;
    let tz = elder.p.z;
    if (w > 0.5) {
      tx = cordsW.x;
      tz = cordsW.z;
    }
    a.gaze = angleDamp(a.gaze, headYaw(p.yaw, p.x, p.z, tx, tz, 1.1), 2.2 + a.who * 0.4, dt);
    b.head.rotation.y = a.gaze;
    b.head.rotation.x = -0.12;
    // Hands on the knees; one child at a time raises a hand to ask.
    b.armL.rotation.set(-0.85, 0, 0.18);
    b.armR.rotation.set(-0.85, 0, -0.18);
    if (a.timer < 0) {
      const k = rm ? 0 : Math.sin(clock * 7 + a.who) * 0.12;
      b.armR.rotation.set(-2.85, 0, -0.12 + k);
      b.torso.rotation.x = -0.02;
    } else if (!rm) b.torso.rotation.x = -0.1 + Math.sin(clock * 1.1 + p.seed) * 0.03;
  };

  const poseReader = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const b = p.bones;
    const spot = a.seat;
    if (Math.hypot(spot.x - p.x, spot.z - p.z) > 0.12) {
      // Stepping to another cord.
      p.seek(spot.x, spot.z, 0.7, dt);
      p.gait(dt, rm);
      return;
    }
    p.yaw = angleDamp(p.yaw, f.yaw, 4, dt);
    // A hand traces down the cord from the year knots to the month knots and back up.
    const k = rm ? 0.4 : 0.5 + 0.5 * Math.cos(clock * 0.32 + p.seed);
    const armX = -1.95 + k * 0.7;
    const arm = a.who === 0 ? b.armL : b.armR;
    const other = a.who === 0 ? b.armR : b.armL;
    arm.rotation.set(armX, 0, a.who === 0 ? 0.4 : -0.4);
    other.rotation.set(-0.35, 0, a.who === 0 ? -0.15 : 0.15);
    b.head.rotation.x = -0.28 + k * 0.42;
    b.head.rotation.y = a.who === 0 ? 0.18 : -0.18;
    b.torso.rotation.x = 0.04 + k * 0.08;
  };

  const stepKids = (dt: number) => {
    if (asker && asker.timer >= 0) asker = null;
    for (const a of kids) {
      if (a.p.state !== "story") continue;
      a.timer -= dt;
      if (a.timer < 0 && a !== asker) {
        if (asker) a.timer = 4 + R() * 6;
        else asker = a;
      }
      if (a.timer < -2.6) {
        a.timer = 14 + R() * 22;
        if (asker === a) asker = null;
      }
    }
  };

  const stepReaders = (dt: number) => {
    for (const a of readers) {
      if (a.p.state !== "story") continue;
      a.timer -= dt;
      if (a.timer > 0) continue;
      a.timer = 14 + R() * 12;
      const [lo, hi] = readerCords(dims, a.who as 0 | 1);
      if (hi > lo) {
        let c = lo + Math.floor(R() * (hi - lo + 1));
        if (c === a.cord) c = c === hi ? lo : c + 1;
        a.cord = c;
        readerSpot(a.who as 0 | 1, c, a.seat);
      }
    }
  };

  // ------------------------------------------------------------ frame
  const offQ = on("world:quality", (d) => {
    low = d.quality === "low";
    for (const a of actors) if (a.hi) snap(a, a.mode);
  });
  let lastTime = env.sky.time();
  let first = true;
  let visibleNow = true;
  let frame = 0;
  const debugInfo = () => ({
    dims,
    actors: actors.map((a) => ({
      role: a.role,
      state: a.p.state,
      mode: a.mode,
      lx: +lxOf(f, a.p.x, a.p.z).toFixed(2),
      lz: +lzOf(f, a.p.x, a.p.z).toFixed(2),
    })),
    drawCalls: crowd.drawCalls() + 1 + (flames.visible ? 5 : 0),
  });
  if (import.meta.env?.DEV) (window as unknown as { __story?: unknown }).__story = { info: debugInfo };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const jump = jumped(lastTime, time, dt);
      lastTime = time;
      env.camera.getWorldPosition(camPos);
      const rm = env.reducedMotion;
      if (first || jump) {
        first = false;
        for (const a of actors) snap(a, modeAt(time, a.sitter));
      }
      const lit = within(time, FIRE_LIT[0], FIRE_LIT[1]);
      const view = low ? 70 : 100;
      const d = Math.min(
        Math.hypot(center.x - camPos.x, center.z - camPos.z),
        Math.hypot(center.x - avatar.x, center.z - avatar.z),
      );
      const visible = d < view;
      if (visible !== visibleNow) {
        visibleNow = visible;
        propsMesh.visible = visible;
        if (!visible) for (const a of actors) a.p.hide();
      }
      flames.visible = visible && lit;
      if (!visible) {
        // Far away: keep the schedule (cheap) every ~0.5 s.
        if (frame++ % 30 === 0)
          for (const a of actors) {
            const m = modeAt(time, a.sitter);
            if (m !== a.mode || a.p.state === "walk" || (a.p.state === "off" && m !== "home" && enabled(a))) snap(a, m);
          }
        crowd.flush();
        return;
      }
      for (const a of actors) {
        const m = modeAt(time, a.sitter);
        if (m !== a.mode) transition(a, m);
      }
      stepKids(dt);
      stepReaders(dt);
      for (const a of actors) {
        const p = a.p;
        if (!p.active) {
          if (enabled(a)) arrive(a, dt);
          if (!p.active) continue;
        }
        if (p.state === "walk") stepWalk(a, dt);
        else p.resolve(0.15);
        if (!p.active) continue;
        p.y = ground(p.x, p.z);
        pose(a, dt, rm);
      }
      crowd.flush();
      if (flames.visible && !rm) {
        for (let i = 0; i < flameMeshes.length; i++) {
          const m = flameMeshes[i] as THREE.Mesh;
          const s = flameSpecs[i] as [number, number, number, number, number];
          const k = 1 + Math.sin(clock * (9 + i * 3.1) + i) * 0.14 + Math.sin(clock * 23 + i * 2) * 0.06;
          m.scale.y = s[3] * k;
          m.position.y = 0.1 + (s[3] * k) / 2;
        }
        (glow.material as THREE.SpriteMaterial).opacity = 0.72 + Math.sin(clock * 11) * 0.08;
      }
    },
    dispose() {
      offQ();
      for (const a of actors) a.p.dispose();
      creatures.remove(hearthBody);
      creatures.removeKeepOut(keepOut);
      crowd.dispose();
      mat.dispose();
      staticMat.dispose();
      propsGeo.dispose();
      propsMesh.removeFromParent();
      cone.dispose();
      (glow.material as THREE.Material).dispose();
      flames.removeFromParent();
      if (import.meta.env?.DEV) delete (window as unknown as { __story?: unknown }).__story;
    },
  };
};
