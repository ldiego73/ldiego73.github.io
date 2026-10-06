/**
 * Travellers' rest camp at the summit (normal days): in the grass pocket west of the ushnu plaza — between
 * the plaza, the path to the chasqui post and the walkway down to the "En construcción" plot — a small camp
 * the traveler sees from the plaza and from the last switchbacks:
 *  - a campfire with travellers sitting on stones and a manta (one sips api from a clay cup, one gets up to
 *    stretch, one warms their hands), their q'ipi bundles beside them;
 *  - an apacheta (stone cairn) beside the path; by day a traveller walks over and adds a stone;
 *  - a tiny stall selling hot api: a clay pot on a three-stone q'uncha with a small fire, cups set out,
 *    the vendor stirring and serving;
 *  - children flying a kite that sways in the summit wind (static with reduced motion).
 * Firelight (glow sprites, flickering flames) rises at dusk; the travellers stay by the fire all night,
 * the vendor and the children walk home over the grass at the south end of the pocket (never on the trail).
 *
 * The traveler can walk into the camp from the plaza edge (env.addWalkable discs over the flat grass,
 * plan.ts WALK); the fire, the stall, the stove and the apacheta are colliders (and creature bodies), the
 * people are bodies. The camp keeps clear of everything interactive: it lies outside the summit plaza
 * (r 6.2), the summit E spot, the chasqui post and the build-3 plot (see summit-camp/plan.ts).
 * Animals keep out of the camp (creatures.keepOut zones, plan.ts KEEP_OUT): herds pick no ground there
 * and bend around it.
 * During Inti Raymi (calendar festivalOf(), re-checked live by festival/datewatch.ts) the whole camp is
 * taken out of the world so the festival layout (dancers' ring, bonfires, banners) is clear: colliders
 * shrink to nothing and the keep-out zones switch off; the walkable grass stays (it's outside the plaza).
 *
 * Rendering: own instanced crowd on the people rig (one InstancedMesh per body part), one merged static
 * mesh, one instanced mesh each for flames / added cairn stones / steam, two glow sprites and the kite
 * (mesh + line): ≈ 20 draw calls when in view, none beyond the view distance. Low quality: two travellers,
 * two children, no steam, shorter view distance.
 */
import * as THREE from "three";
import { festivalOf } from "../calendar";
import type { Ambient, CreateAmbient } from "../contract";
import { type Body, creatures, type KeepOut, park } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { glowSprite } from "../props";
import { dateWatch } from "./festival/datewatch";
import { jumped } from "./people/logic";
import { MAN, type PartName, partSpecs, SHADOW_PARTS, Static, WOMAN } from "./people/models";
import { Crowd, paletteMaterial } from "./people/rig";
import { createFolk, type FolkCtx, type FolkSpots } from "./summit-camp/folk";
import { createKite } from "./summit-camp/kite";
import { campPartSpecs } from "./summit-camp/parts";
import {
  APACHETA,
  CAMP,
  CAMP_R,
  campCount,
  FIRE,
  firelight,
  HOME,
  KEEP_OUT,
  KIDS,
  KIDS_R,
  KITE_HEIGHT,
  KITE_REACH,
  type P2,
  ROUTE,
  routeClear,
  SEATS,
  SOLIDS,
  STALL,
  STOVE,
  toWorld,
  VENDOR_AT,
  WALK,
  WIND,
} from "./summit-camp/plan";
import { buildCampProps } from "./summit-camp/props";

const FLAMES = [
  // [x, z, scale xz, height, color] — campfire (3) then the q'uncha (2), local to their fire.
  [0.08, 0, 0.15, 0.48, "#ff9a3d"],
  [-0.09, 0.06, 0.14, 0.4, "#ff7a2e"],
  [0, -0.02, 0.09, 0.32, "#ffe08a"],
  [0.05, 0, 0.08, 0.2, "#ff9a3d"],
  [-0.05, 0.02, 0.06, 0.16, "#ffd36b"],
] as const;

export const create: CreateAmbient = (envIn): Ambient => {
  const env = envIn as WorldEnvExtra;
  const n = campCount(env.quality);
  let low = env.quality === "low";
  const offQ = on("world:quality", (d) => {
    low = d.quality === "low";
  });

  // Summit frame, exactly as content.ts places the summit group (origin at the ushnu, +Z toward the trail).
  const p1 = env.trail.pointAt(1, new THREE.Vector3());
  const tg = env.trail.tangentAt(1, new THREE.Vector3());
  const dir = new THREE.Vector3(tg.x, 0, tg.z).normalize();
  const center = p1.clone().addScaledVector(dir, 3.5);
  center.y = env.heightAt(center.x, center.z);
  const yaw = Math.atan2(p1.x - center.x, p1.z - center.z);
  const W = (l: P2): P2 => toWorld(center.x, center.z, yaw, l.x, l.z, { x: 0, z: 0 });
  const tmp2: P2 = { x: 0, z: 0 };
  const gy = (lx: number, lz: number) => {
    toWorld(center.x, center.z, yaw, lx, lz, tmp2);
    return env.heightAt(tmp2.x, tmp2.z) - center.y;
  };

  // ------------------------------------------------------------ static camp
  const ramp = env.toon("#ffffff").gradientMap;
  const staticMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const props = buildCampProps(gy, n.travellers);
  const camp = new THREE.Group();
  camp.name = "summit-camp";
  camp.position.copy(center);
  camp.rotation.y = yaw;
  const propMesh = new THREE.Mesh(props.geo, staticMat);
  propMesh.name = "summit-camp:props";
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  camp.add(propMesh);

  // Stones travellers leave on the apacheta (cycles through the slots once full).
  const st = new Static();
  st.p.add(st.P.lowSph, "#a59a88", 0, 0, 0, 0.3, 0.8, 0, 0.085, 0.065, 0.075);
  const stoneGeo = st.build();
  const stones = new THREE.InstancedMesh(stoneGeo, staticMat, props.cairnSlots.length);
  stones.name = "summit-camp:cairn-stones";
  stones.count = 0;
  stones.castShadow = true;
  camp.add(stones);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sv = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let placed = 0;
  const addStone = () => {
    const i = placed % props.cairnSlots.length;
    placed++;
    q.setFromEuler(e.set(i * 1.3, i * 2.1, 0));
    stones.setMatrixAt(i, m4.compose(props.cairnSlots[i] as THREE.Vector3, q, one));
    stones.count = Math.min(placed, props.cairnSlots.length);
    stones.instanceMatrix.needsUpdate = true;
    stones.computeBoundingSphere();
  };
  // Some were left by earlier travellers.
  addStone();
  addStone();

  // Flames: one instanced cone mesh for the campfire and the q'uncha (unlit, no ink).
  const coneGeo = new THREE.ConeGeometry(1, 1, 6);
  coneGeo.translate(0, 0.5, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const flames = new THREE.InstancedMesh(coneGeo, flameMat, FLAMES.length);
  flames.name = "summit-camp:flames";
  // Instances move every frame: skip the (stale) instance bounding sphere; the camp group is culled by distance.
  flames.frustumCulled = false;
  const col = new THREE.Color();
  FLAMES.forEach((f, i) => {
    flames.setColorAt(i, col.set(f[4]));
  });
  if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
  env.noOutline(flames);
  camp.add(flames);
  const fireLY = props.fireY + 0.06;
  const stoveLY = props.stoveY + 0.04;

  const glowFire = glowSprite(env, "#ffb35c", 3.4);
  glowFire.position.set(FIRE.x, props.fireY + 0.5, FIRE.z);
  const glowStove = glowSprite(env, "#ff9a4a", 1.5);
  glowStove.position.set(STOVE.x, props.stoveY + 0.18, STOVE.z);
  camp.add(glowFire, glowStove);

  // Steam over the pot of api.
  const steamGeo = new THREE.IcosahedronGeometry(1, 0);
  const steamMat = new THREE.MeshBasicMaterial({
    color: "#f4efe6",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const steam = new THREE.InstancedMesh(steamGeo, steamMat, Math.max(1, n.steam));
  steam.name = "summit-camp:steam";
  steam.frustumCulled = false;
  steam.count = n.steam;
  env.noOutline(steam);
  camp.add(steam);
  env.scene.add(camp);

  // ------------------------------------------------------------ people
  const parts: PartName[] = [...MAN, ...WOMAN, "chullo", "montera", "sombrero"];
  const total = n.travellers + 1 + n.kids;
  const mat = paletteMaterial(ramp);
  const crowd = new Crowd([...partSpecs(parts), ...campPartSpecs()], total, mat, SHADOW_PARTS);
  crowd.group.name = "summit-camp:crowd";
  env.scene.add(crowd.group);

  // Keep the home point off the trail band (people wait there a moment before leaving / after arriving).
  const offTrail = (h: P2): P2 => {
    const tp = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const q = env.extra.trailDistance(h.x, h.z);
      if (q.d > env.trail.halfWidth + 0.8) break;
      env.trail.pointAt(q.t, tp);
      const dx = h.x - tp.x;
      const dz = h.z - tp.z;
      const l = Math.hypot(dx, dz) || 1;
      h.x += (dx / l) * 0.25;
      h.z += (dz / l) * 0.25;
    }
    return h;
  };
  const fireW = W(FIRE);
  // Clear the flora ground cover (ichu, flowers) under the camp so tufts don't poke through the
  // people, the stall and the fire: zero-scale those instances once (flora is built before ambients).
  {
    const clear: Array<[P2, number]> = [
      [fireW, 2.6],
      [W(STALL), 2.2],
      [W(APACHETA), 1.3],
      [W(KIDS), KIDS_R + 0.8],
    ];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    env.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !/^(ichu|flora-)/.test(im.name)) return;
      let hit = false;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        p.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);
        for (const [c, r] of clear)
          if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < r * r) {
            im.setMatrixAt(i, zero);
            hit = true;
            break;
          }
      }
      if (hit) im.instanceMatrix.needsUpdate = true;
    });
  }
  const seats = SEATS.slice(0, n.travellers).map((s, i) => {
    const l = { x: FIRE.x + Math.cos(s.a) * s.r, z: FIRE.z + Math.sin(s.a) * s.r };
    return { ...W(l), top: center.y + (props.seatY[i] as number), stone: s.seat === "stone" };
  });
  const stands = SEATS.slice(0, n.travellers).map((s) =>
    W({ x: FIRE.x + Math.cos(s.a) * (s.r + 0.5), z: FIRE.z + Math.sin(s.a) * (s.r + 0.5) }),
  );
  // Stand on the camp side of the cairn (toward the fire).
  const toFire = Math.atan2(FIRE.z - APACHETA.z, FIRE.x - APACHETA.x);
  const cairnFront = W({ x: APACHETA.x + Math.cos(toFire) * 1.05, z: APACHETA.z + Math.sin(toFire) * 1.05 });
  const windW = {
    x: WIND.x * Math.cos(yaw) + WIND.z * Math.sin(yaw),
    z: -WIND.x * Math.sin(yaw) + WIND.z * Math.cos(yaw),
  };
  const spots: FolkSpots = {
    fire: fireW,
    seats,
    stands,
    cairnFront,
    cairn: W(APACHETA),
    vendorAt: W(VENDOR_AT),
    stove: W(STOVE),
    stall: W(STALL),
    vendorYaw: yaw + Math.PI / 2, // local +x (toward the plaza)
    kids: W(KIDS),
    kidsR: KIDS_R,
    wind: windW,
    home: offTrail(W(HOME)),
    route: ROUTE.map((p, i) => (i === 0 ? { x: 0, z: 0 } : W(p))),
  };
  spots.route[0] = spots.home;
  if (import.meta.env?.DEV) {
    const clearOfTrail = (x: number, z: number) => env.extra.trailDistance(x, z).d > env.trail.halfWidth + 1;
    if (
      !routeClear([...spots.route, spots.kids], clearOfTrail) ||
      !routeClear([...spots.route, spots.vendorAt], clearOfTrail)
    )
      console.warn("[summit-camp] the home route touches the trail band");
  }
  const folk = createFolk(crowd, spots, n, addStone);
  const kite = createKite(env.noOutline, ramp);
  env.scene.add(kite.group);

  // Static props are solid for the creatures (people steer around them; animals too) and colliders for the
  // traveler. Layout colliders can't be removed: off (festival, dispose) they shrink to r = 0.
  const propBodies: Array<{
    b: Body;
    x: number;
    z: number;
    col: { kind: "circle"; x: number; z: number; r: number };
    r: number;
  }> = SOLIDS.map((o) => {
    const w = W(o.at);
    const col = { kind: "circle" as const, x: w.x, z: w.z, r: o.r };
    env.addCollider(col);
    return { b: creatures.add("camp-prop", o.body, { x: w.x, z: w.z }), x: w.x, z: w.z, col, r: o.r };
  });
  // Animals keep out of the camp (fauna ground rules + herd steering read these live).
  const zones: KeepOut[] = KEEP_OUT.map((k) => {
    const w = W(k);
    return creatures.keepOut(w.x, w.z, k.r);
  });
  const setProps = (onNow: boolean) => {
    for (const p of propBodies) {
      p.col.r = onNow ? p.r : 0;
      if (onNow) {
        p.b.x = p.x;
        p.b.z = p.z;
        p.b.solid = true;
      } else park(p.b);
    }
    for (const z of zones) z.on = onNow;
  };

  // The traveler walks in from the plaza edge: walkable discs over the flat grass of the pocket, each kept
  // only where the ground is gentle and well clear of the trail band (the camp is no shortcut off the path).
  const walkAreas = WALK.flatMap((c) => {
    const w = W(c);
    const steep = (x: number, z: number) =>
      Math.hypot(
        env.heightAt(x + 0.5, z) - env.heightAt(x - 0.5, z),
        env.heightAt(x, z + 0.5) - env.heightAt(x, z - 0.5),
      ) > 0.55;
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k === 8 ? 0 : c.r;
      const x = w.x + Math.cos(a) * rr;
      const z = w.z + Math.sin(a) * rr;
      if (steep(x, z) || env.extra.trailDistance(x, z).d < env.trail.halfWidth + 1.4) return [];
    }
    const area = { kind: "circle" as const, x: w.x, z: w.z, r: c.r };
    env.addWalkable(area);
    return [area];
  });

  // ------------------------------------------------------------ festival
  const festival = dateWatch(() => festivalOf() === "inti-raymi");
  const applyFestival = () => {
    const off = festival.on;
    folk.enable(!off);
    setProps(!off);
    if (off) {
      camp.visible = false;
      kite.hide();
    }
  };
  applyFestival();

  // ------------------------------------------------------------ frame
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const campW = W(CAMP);
  const kidsW = spots.kids;
  const c: FolkCtx = {
    dt: 0,
    clock: 0,
    time: env.sky.time(),
    rm: env.reducedMotion,
    jump: false,
    seen(x, y, z, max = 70) {
      if (Math.hypot(x - camPos.x, z - camPos.z) > max) return false;
      seenV.set(x, y, z).project(env.camera);
      if (!(seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15)) return false;
      // Behind the brow: the terrain rises above the line of sight somewhere between camera and point.
      for (let k = 1; k < 10; k++) {
        const u = k / 10;
        const lx = camPos.x + (x - camPos.x) * u;
        const lz = camPos.z + (z - camPos.z) * u;
        if (env.heightAt(lx, lz) > camPos.y + (y - camPos.y) * u + 0.15) return false;
      }
      return true;
    },
    groundAt: env.extra.groundAt,
  };
  let lastTime = env.sky.time();
  let lift = 0;
  let kiteInit = false;
  let inView = true;

  const animateFire = (light: number, stoveOn: boolean) => {
    const rm = env.reducedMotion;
    for (let i = 0; i < FLAMES.length; i++) {
      const f = FLAMES[i] as (typeof FLAMES)[number];
      const stove = i >= 3;
      const fl = rm ? 1 : 1 + Math.sin(c.clock * (9 + i * 3.1) + i) * 0.14 + Math.sin(c.clock * 23 + i * 2) * 0.07;
      // By day the flames are smaller (a fire kept low for the pot / for warmth).
      const size = stove ? (stoveOn ? 1 : 0) : 0.75 + light * 0.35;
      const bx = stove ? STOVE.x : FIRE.x;
      const bz = stove ? STOVE.z : FIRE.z;
      sv.set(f[2] * size, f[3] * fl * size, f[2] * size);
      q.setFromEuler(e.set(0, i * 1.7, rm ? 0 : Math.sin(c.clock * 3 + i) * 0.06));
      m4.compose(seenV.set(bx + f[0], stove ? stoveLY : fireLY, bz + f[1]), q, size > 0 ? sv : sv.set(0, 0, 0));
      flames.setMatrixAt(i, m4);
    }
    flames.instanceMatrix.needsUpdate = true;
    const flick = rm ? 0 : Math.sin(c.clock * 11) * 0.06 + Math.sin(c.clock * 17.3) * 0.04;
    glowFire.material.opacity = light * (0.55 + flick);
    glowFire.visible = light > 0.02;
    glowStove.material.opacity = light * (0.6 + flick);
    glowStove.visible = stoveOn && light > 0.02;
  };

  const animateSteam = (on: boolean) => {
    steam.visible = on && n.steam > 0 && !env.reducedMotion && !low;
    if (!steam.visible) return;
    for (let i = 0; i < n.steam; i++) {
      const k = (c.clock * 0.35 + i / n.steam) % 1;
      const s = 0.06 + k * 0.13;
      sv.set(s, s, s);
      q.identity();
      m4.compose(
        seenV.set(
          STOVE.x + Math.sin(k * 5 + i) * 0.08 + k * 0.15,
          props.potTop + 0.05 + k * 0.9,
          STOVE.z + Math.cos(k * 4 + i) * 0.06,
        ),
        q,
        sv,
      );
      steam.setMatrixAt(i, m4);
    }
    steam.instanceMatrix.needsUpdate = true;
    steamMat.opacity = 0.3;
  };

  const ambient: Ambient = {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      c.dt = dt;
      c.clock += dt;
      const time = env.sky.time();
      c.jump = jumped(lastTime, time, dt);
      lastTime = time;
      c.time = time;
      if (festival.step(dt)) applyFestival();
      if (festival.on) {
        crowd.flush();
        return;
      }
      env.camera.getWorldPosition(camPos);
      const view = low ? 70 : 105;
      const d = Math.min(
        Math.hypot(campW.x - camPos.x, campW.z - camPos.z),
        Math.hypot(campW.x - avatar.x, campW.z - avatar.z),
      );
      const visible = d - CAMP_R < view;
      if (visible !== inView) {
        inView = visible;
        if (!visible) kite.hide();
      }
      camp.visible = visible;
      folk.update(c, visible);
      crowd.flush();
      if (!visible) return;
      const light = firelight(time);
      const stoveOn = folk.vendorWorking();
      animateFire(light, stoveOn);
      animateSteam(stoveOn);
      // Kite: up while the holder plays, reeled in when they leave.
      lift = Math.max(0, Math.min(1, lift + (folk.kite.flying ? 0.2 : -0.3) * dt));
      if (c.jump || !kiteInit) lift = folk.kite.flying ? 1 : 0;
      kiteInit = true;
      const kg = env.heightAt(kidsW.x + windW.x * KITE_REACH, kidsW.z + windW.z * KITE_REACH);
      kite.update(
        folk.kite.hand,
        folk.kite.x,
        folk.kite.z,
        windW.x,
        windW.z,
        kg,
        KITE_REACH,
        KITE_HEIGHT,
        lift,
        c.clock,
        env.reducedMotion,
      );
    },
    dispose() {
      offQ();
      folk.dispose();
      for (const p of propBodies) {
        creatures.remove(p.b);
        p.col.r = 0;
      }
      for (const z of zones) creatures.removeKeepOut(z);
      // Walkable areas can't be removed from the layout either: shrink them (a remount builds new ones).
      for (const a of walkAreas) a.r = 0;
      crowd.dispose();
      mat.dispose();
      kite.dispose();
      props.geo.dispose();
      stoneGeo.dispose();
      stones.dispose();
      coneGeo.dispose();
      flameMat.dispose();
      flames.dispose();
      steamGeo.dispose();
      steamMat.dispose();
      steam.dispose();
      glowFire.material.dispose();
      glowStove.material.dispose();
      staticMat.dispose();
      camp.removeFromParent();
    },
  };

  if (import.meta.env?.DEV) {
    const drawCalls = () => {
      if (festival.on || !camp.visible) return 0;
      let k = crowd.drawCalls() + 3; // props, cairn stones, flames
      if (glowFire.visible) k++;
      if (glowStove.visible) k++;
      if (steam.visible) k++;
      if (kite.group.visible) k += 2;
      return k;
    };
    const debug = {
      info: () => ({
        festival: festival.on,
        visible: camp.visible,
        people: folk.count(),
        drawCalls: drawCalls(),
        stones: stones.count,
        kite: kite.group.visible,
        light: +firelight(env.sky.time()).toFixed(2),
        folk: folk.points(),
        walk: walkAreas.length,
        zones: zones.map((z) => ({ x: +z.x.toFixed(1), z: +z.z.toFixed(1), r: z.r, on: z.on })),
      }),
      route: spots.route,
      center: { x: center.x, z: center.z, yaw },
      /** Toggle the whole camp (draw-call delta measurements). */
      show(v: boolean) {
        camp.visible = v;
        crowd.group.visible = v;
        kite.group.visible = v && kite.group.visible;
      },
    };
    (window as unknown as { __summitCamp?: typeof debug }).__summitCamp = debug;
  }
  return ambient;
};
