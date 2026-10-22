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
 * Rendering: the shared characters (people/npc.ts on one HumanCrowd: two draws for every body and cloth, the
 * staff a held prop) + hearth/seats (1) + flames (2) + glow (1, night). Low quality: 2 children, 1 reader.
 */
import * as THREE from "three";
import { HumanCrowd } from "../characters/crowd";
import { prefetchHumans } from "../characters/pipeline";
import { PEOPLE, wardrobe } from "../characters/presets";
import { HeldProps, type PropHandle } from "../characters/props";
import type { Ambient, CreateAmbient } from "../contract";
import { creatures } from "../creatures";
import { worldData } from "../data";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { DYE } from "../palette";
import { glowSprite } from "../props";
import { lxOf, lzOf, stationFrame, wx, wz } from "./fields/geo";
import { commitLooking, overlay, play, raiseHand, traceCord } from "./gente/overlay";
import { jumped, within } from "./people/logic";
import { rng } from "./people/models";
import { Npc, type NpcFrame } from "./people/npc";
import { angleDamp, damp } from "./people/person";
import {
  boardDims,
  CORD_Y,
  circleLayout,
  cordX,
  FIRE_LIT,
  FZ,
  type Mode,
  modeAt,
  type P2,
  pointWeight,
  readerCords,
} from "./storytellers/logic";
import { circleProps } from "./storytellers/props";

const STATION = "build-2";
/** Readers stand this far beside their cord (their bodies stay clear of the cord column seen from the front). */
const READER_OFF = 0.42;
/** The flat seat stones' top above the ground (storytellers/props.ts). */
const STONE_TOP = 0.09;

type Role = "elder" | "reader" | "kid";
type State = "off" | "walk" | "story" | "fire";

interface Actor {
  p: Npc;
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
  /** Head target (world). */
  gaze: THREE.Vector3;
}

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
  const staticMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const total = 1 + 2 + kidSeats.length;
  const crowd = new HumanCrowd({ capacity: total, name: "storytellers:crowd" });
  env.scene.add(crowd.group);
  const held = new HeldProps(2);
  env.scene.add(held.group);
  const readerSpec = [PEOPLE.campesina, PEOPLE.campesinoFelt] as const;
  prefetchHumans([PEOPLE.amauta, ...readerSpec, PEOPLE.wawaBoy, PEOPLE.wawaGirl]);

  const actors: Actor[] = [];
  const add = (
    role: Role,
    who: number,
    body: Npc,
    o: { hi?: boolean; sitter?: boolean; seat: THREE.Vector3; fireSeat?: THREE.Vector3 },
  ) => {
    body.lookRange = 0;
    const a: Actor = {
      p: body,
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
      gaze: new THREE.Vector3(),
    };
    actors.push(a);
    return a;
  };
  const npc = (
    kind: string,
    spec: Npc["member"]["spec"],
    palette: ReturnType<typeof wardrobe.andeanMan>,
    scale: number,
    radius: number,
  ) => new Npc({ kind, crowd, spec, palette, scale, radius, seed: 3 + actors.length * 9.7 });

  const elderPal = wardrobe.andeanMan(R);
  elderPal.hair = "#8a8178";
  elderPal.wrap = DYE.red;
  const elder = add("elder", 0, npc("elder", PEOPLE.amauta, elderPal, 0.98, 0.36), {
    sitter: true,
    seat: elderW,
    fireSeat: fireW[0],
  });
  // The walking staff in his right hand (laid down beside him by the fire); he points with the left.
  const staff: PropHandle = elder.p.hold(held, "staff", "#6e4a2e");
  const readerSpot = (who: 0 | 1, cord: number, out?: THREE.Vector3) =>
    W({ x: cordX(dims, cord) + (who === 0 ? -READER_OFF : READER_OFF), z: L.readerZ }, out);
  const readers = [
    add("reader", 0, npc("reader", readerSpec[0], wardrobe.andeanWoman(R), 0.95, 0.36), {
      sitter: true,
      seat: readerSpot(0, readerCords(dims, 0)[1]),
      fireSeat: fireW[1],
    }),
    add("reader", 1, npc("reader", readerSpec[1], wardrobe.andeanMan(R, false, true), 1.02, 0.36), {
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
      npc(
        "child",
        boy ? PEOPLE.wawaBoy : PEOPLE.wawaGirl,
        boy ? wardrobe.andeanMan(R) : wardrobe.andeanWoman(R),
        0.94 + R() * 0.1,
        0.26,
      ),
      { hi: i % 2 === 1 && kidSeats.length > 2, seat: W(s) },
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

  const nf: NpcFrame = { dt: 0, clock: 0, rm: false, avatar: new THREE.Vector3() };
  const lookV = new THREE.Vector3();
  const headAt = (p: Npc, out: THREE.Vector3) => out.set(p.x, p.y + 1.2 * p.scale, p.z);

  const pose = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const st = p.state;
    nf.dt = dt;
    nf.clock = clock;
    nf.rm = rm;
    if (st === "walk") {
      play(p, "none");
      if (a.role === "elder") staff.show(true);
      commitLooking(p, nf, null);
      return;
    }
    p.speed = damp(p.speed, 0, 6, dt);
    if (st === "fire") {
      // On a flat stone by the hearth, looking into the fire now and then (the staff laid down beside him).
      play(p, "sit-stool", { seat: STONE_TOP, fade: 0.6 });
      if (a.role === "elder") staff.show(false);
      a.gaze.copy(hearthW);
      a.gaze.y += 0.3;
      if (!rm) a.gaze.x += Math.sin(clock * 0.25 + p.seed) * 1.5;
      commitLooking(p, nf, a.gaze);
      return;
    }
    if (a.role === "elder") poseElder(a, dt, rm);
    else if (a.role === "kid") poseKid(a, dt, rm);
    else poseReader(a, dt, rm);
  };

  const poseElder = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    staff.show(true);
    const w = rm ? 0 : pointWeight(clock + p.seed);
    const ask = asker && asker.timer < 0 ? asker.p : null;
    // Facing between the children and the cords; turning a little toward the cords while pointing.
    const cordYaw = Math.atan2(cordsW.x - p.x, cordsW.z - p.z);
    p.yaw = angleDamp(p.yaw, ask || w < 0.5 ? elderYaw : elderYaw + (cordYaw - elderYaw) * 0.35, 3, dt);
    // Telling (the hands explain) or pointing along the cords with the free left hand.
    if (ask || w < 0.5) play(p, "talk", { fade: 0.5 });
    else play(p, "point", { side: -1, fade: 0.5 });
    // Head: the children (center, or the one asking), or the cords when pointing.
    if (ask) headAt(ask, a.gaze);
    else if (w >= 0.5) a.gaze.copy(cordsW);
    else a.gaze.set(center.x, center.y + 0.6, center.z);
    commitLooking(p, nf, a.gaze);
  };

  const poseKid = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    play(p, "sit-stool", { seat: STONE_TOP, fade: 0.6 });
    p.face(elderW.x, elderW.z, dt, 3);
    const w = rm ? 0 : pointWeight(clock + elder.p.seed);
    // Eyes on the amauta, or on the cords he points at.
    if (w > 0.5) lookV.copy(cordsW);
    else headAt(elder.p, lookV);
    a.gaze.lerp(lookV, 1 - Math.exp(-(2.2 + a.who * 0.4) * dt));
    commitLooking(p, nf, a.gaze);
    // One child at a time raises a hand to ask.
    if (a.timer < 0) {
      const k = rm ? 0 : Math.sin(clock * 7 + a.who);
      overlay(p.member, (b) => raiseHand(b, "R", k));
    }
  };

  const poseReader = (a: Actor, dt: number, rm: boolean) => {
    const p = a.p;
    const spot = a.seat;
    if (Math.hypot(spot.x - p.x, spot.z - p.z) > 0.12) {
      // Stepping to another cord.
      p.seek(spot.x, spot.z, 0.7, dt);
      play(p, "none");
      commitLooking(p, nf, null);
      return;
    }
    p.speed = 0;
    p.yaw = angleDamp(p.yaw, f.yaw, 4, dt);
    play(p, "none");
    commitLooking(p, nf, null);
    // A hand traces down the cord from the year knots to the month knots and back up.
    const k = rm ? 0.4 : 0.5 + 0.5 * Math.cos(clock * 0.32 + p.seed);
    overlay(p.member, (b) => traceCord(b, a.who === 0 ? "L" : "R", k));
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
      action: a.p.anim.action,
      mix: JSON.stringify((a.p.anim as unknown as { mixer: unknown }).mixer),
      hipsY: +(a.p.member.bones.hips?.position.y ?? 0).toFixed(2),
      lod: a.p.member.lod,
      shown: a.p.member.shown,
      mode: a.mode,
      lx: +lxOf(f, a.p.x, a.p.z).toFixed(2),
      lz: +lzOf(f, a.p.x, a.p.z).toFixed(2),
    })),
    drawCalls: crowd.drawCalls() + held.drawCalls() + 1 + (flames.visible ? 5 : 0),
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
        // Out of view: not drawn (their props follow the holder); back in view: shown again if they are out.
        for (const a of actors) a.p.member.show(visible && a.p.active);
      }
      flames.visible = visible && lit;
      if (!visible) {
        // Far away: keep the schedule (cheap) every ~0.5 s.
        if (frame++ % 30 === 0)
          for (const a of actors) {
            const m = modeAt(time, a.sitter);
            if (m !== a.mode || a.p.state === "walk" || (a.p.state === "off" && m !== "home" && enabled(a))) snap(a, m);
          }
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
      crowd.update(env.camera);
      held.update();
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
      held.dispose();
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
