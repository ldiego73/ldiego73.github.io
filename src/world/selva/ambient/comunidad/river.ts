/**
 * People on the river, kept off the canoe ride's water (../canoe.ts, layout.canoe: its route and landings hug
 * the road's bank between the embarcadero and the palafitos):
 *  - a fisherman standing in a moored dugout off the regatón's landing casts his tarrafa (cast net): coil, swing,
 *    the net opens into a disc in flight, lands with a ring on the water, sinks, is hauled back hand over
 *    hand; a second villager sits at the stern holding the canoe with the paddle;
 *  - a peque-peque (long-tail motor canoe) with a driver and a passenger under its palm shade runs the lower
 *    river (below the embarcadero to short of the collpa) on its far half, swinging round the sandbars, now and
 *    then, leaving a wake and throttling down near the swimming place; it waits at each end for a while.
 * Both boats are solid creatures bodies (two circles along the hull, kind "boat"), so the traveler's canoe
 * bumps off them; the peque-peque also slows and stops when the traveler's canoe is near. By day only.
 */
import * as THREE from "three";
import type { Person } from "../../../ambient/people/person";
import type { Crowd } from "../../../ambient/people/rig";
import { type Body, creatures } from "../../../creatures";
import { buildRoute, type Route, routeAt, yawOf } from "../canoe/logic";
import { barF, type Ripples, sandbars } from "../wild/kit";
import { castAt, isOut, netShape, riverLane } from "./logic";
import { CUSHMAS, fishingCanoe, MAN, netMesh, pequePeque, RIBBONS, SKINS, SKIRTS, STRIPES, WOMAN } from "./models";
import type { Ctx, Group } from "./types";
import { villager } from "./villager";

/**
 * The far-half lane, cut to the road's t range [t0, t1] (the river extends past both trailheads), clear of
 * sandbars and of the `avoid` circles (the children's swimming place).
 */
export function boatLane(
  env: Ctx["env"],
  avoid: ReadonlyArray<{ x: number; z: number; r: number }> = [],
  t0 = 0.04,
  t1 = 0.93,
): Route | null {
  const L = env.selva.layout;
  const bars = sandbars(env);
  const ok = (x: number, z: number) => {
    if (!L.isWater(x, z) || L.riverDist(x, z) > -3) return false;
    for (const b of bars) if (barF(b, x, z) < 1.35) return false;
    for (const a of avoid) if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) return false;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (!L.isWater(x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8)) return false;
    }
    return true;
  };
  const lane = riverLane(L.river.pts, L.river.halfWidth, (x, z) => L.trailQuery(x, z).d, ok, 0.5);
  const cut = lane.filter((p) => {
    const t = L.trailQuery(p[0], p[1]).t;
    return t >= t0 && t <= t1;
  });
  if (cut.length < 2) return null;
  try {
    return buildRoute(cut);
  } catch {
    return null;
  }
}

/** Arc length on the route nearest to road t. */
function sAtT(env: Ctx["env"], r: Route, t: number) {
  const L = env.selva.layout;
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < r.pts.length; i++) {
    const p = r.pts[i] as readonly [number, number];
    const d = Math.abs(L.trailQuery(p[0], p[1]).t - t);
    if (d < bd) {
      bd = d;
      best = r.cum[i] as number;
    }
  }
  return best;
}

/** Road t of the fisherman (just downstream of the regatón's landing). */
const FISHER_T = 0.172;

/**
 * The fisherman's mooring: the river centerline at road t, moved toward the road by a quarter of the half
 * width when that is open water clear of sandbars and the bank, else the boats' lane at that t.
 */
function fisherSpot(env: Ctx["env"], route: Route, t: number, out: { x: number; z: number; tx: number; tz: number }) {
  const L = env.selva.layout;
  const pts = L.river.pts;
  let bi = 1;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as [number, number];
    const d = Math.abs(L.trailQuery(p[0], p[1]).t - t);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  const a = pts[bi - 1] as [number, number];
  const b = pts[bi + 1] as [number, number];
  const c = pts[bi] as [number, number];
  const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / tl;
  const tz = (b[1] - a[1]) / tl;
  let nx = -tz;
  let nz = tx;
  if (L.trailQuery(c[0] + nx, c[1] + nz).d > L.trailQuery(c[0] - nx, c[1] - nz).d) {
    nx = -nx;
    nz = -nz;
  }
  const w = L.river.halfWidth[bi] ?? 10;
  const bars = sandbars(env);
  for (const k of [0.25, 0.12, 0]) {
    const x = c[0] + nx * w * k;
    const z = c[1] + nz * w * k;
    if (L.isWater(x, z) && L.riverDist(x, z) < -3 && bars.every((bar) => barF(bar, x, z) > 1.4)) {
      out.x = x;
      out.z = z;
      out.tx = tx;
      out.tz = tz;
      return out;
    }
  }
  return routeAt(route, sAtT(env, route, t), out);
}

/** A boat mesh with its two hull bodies. */
class Boat {
  readonly mesh: THREE.Mesh;
  readonly bodies: Body[];
  x = 0;
  z = 0;
  yaw = 0;
  constructor(
    env: Ctx["env"],
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    name: string,
    private half: number,
    r: number,
  ) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    env.scene.add(this.mesh);
    this.bodies = [0, 1].map(() => creatures.add("boat", r, { give: 0.05, x: 1e5, z: 1e5 }));
  }
  set(x: number, y: number, z: number, yaw: number, roll = 0) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, yaw, roll, "YXZ");
    const sx = Math.sin(yaw) * this.half;
    const sz = Math.cos(yaw) * this.half;
    (this.bodies[0] as Body).x = x + sx;
    (this.bodies[0] as Body).z = z + sz;
    (this.bodies[1] as Body).x = x - sx;
    (this.bodies[1] as Body).z = z - sz;
  }
  /** World point of a local boat point (bow +Z). */
  local(lx: number, lz: number, out: { x: number; z: number }) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    out.x = this.x + lx * c + lz * s;
    out.z = this.z - lx * s + lz * c;
    return out;
  }
  show(on: boolean) {
    this.mesh.visible = on;
    for (const b of this.bodies) b.solid = on;
  }
  dispose() {
    for (const b of this.bodies) creatures.remove(b);
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
  }
}

const P2 = { x: 0, z: 0 };

/** Seat a person in a boat at local (lx, lz), facing `face` relative to the bow. */
function seat(p: Person, boat: Boat, lx: number, lz: number, y: number, face: number) {
  boat.local(lx, lz, P2);
  p.place(P2.x, P2.z, boat.yaw + face);
  p.y = y;
  // In the boat: not a separate obstacle (the hull bodies are).
  p.body.solid = false;
}

export function createRiver(
  env: Ctx["env"],
  crowd: Crowd,
  staticMat: THREE.Material,
  route: Route,
  ripples: Ripples,
  o: { fisher: boolean; boat: boolean; slow?: ReadonlyArray<{ x: number; z: number; r: number }> },
): Group {
  const L = env.selva.layout;
  const level = L.river.level;
  const groupCenter = new THREE.Vector3();
  const pose = { x: 0, z: 0, tx: 1, tz: 0 };

  // ------------------------------------------------------------ fisherman
  let fisher: {
    boat: Boat;
    man: Person;
    mate: Person;
    net: THREE.Mesh;
    castYaw: number;
    landX: number;
    landZ: number;
    clock: number;
    lastStage: string;
  } | null = null;
  if (o.fisher) {
    // Below the regatón, a little off the middle toward the road (the canoe ride never comes this far
    // upstream: CANOE_STRETCH runs from 0.42 to 0.6), where the trader's landing looks straight at him.
    fisherSpot(env, route, FISHER_T, pose);
    const boat = new Boat(env, fishingCanoe(), staticMat, "comunidad:fishing-canoe", 1.3, 0.75);
    boat.set(pose.x, level, pose.z, yawOf(pose.tx, pose.tz));
    // Cast across the river, away from the road (the net opens side-on to the regatón's landing).
    let cx = -pose.tz;
    let cz = pose.tx;
    if (L.trailQuery(pose.x + cx * 4, pose.z + cz * 4).d < L.trailQuery(pose.x - cx * 4, pose.z - cz * 4).d) {
      cx = -cx;
      cz = -cz;
    }
    const man = villager({
      kind: "boatman",
      crowd,
      idx: crowd.alloc(),
      wear: MAN,
      palette: [SKINS[0] as string, CUSHMAS[3] as string, STRIPES[0] as string, CUSHMAS[3] as string],
      scale: 0.97,
      radius: 0.35,
      seed: 61,
    });
    const mate = villager({
      kind: "boatman",
      crowd,
      idx: crowd.alloc(),
      wear: ["a:leg", "a:arm", "a:top", "a:shorts", "a:head-m", "a:paddle"],
      palette: [SKINS[3] as string, "#3b3330", "#e8e2d4", "#2f6fb5"],
      scale: 0.8,
      headScale: 1.1,
      radius: 0.35,
      seed: 67,
    });
    const net = netMesh();
    env.noOutline(net);
    net.visible = false;
    env.scene.add(net);
    fisher = {
      boat,
      man,
      mate,
      net,
      castYaw: Math.atan2(cx, cz),
      landX: pose.x + cx * 4.6,
      landZ: pose.z + cz * 4.6,
      clock: 3,
      lastStage: "",
    };
  }

  // ------------------------------------------------------------ peque-peque
  let motor: {
    boat: Boat;
    driver: Person;
    rider: Person;
    s: number;
    dir: 1 | -1;
    speed: number;
    wait: number;
    wake: number;
  } | null = null;
  if (o.boat) {
    const boat = new Boat(env, pequePeque(), staticMat, "comunidad:peque-peque", 2.4, 1.0);
    const driver = villager({
      kind: "boatman",
      crowd,
      idx: crowd.alloc(),
      wear: [...MAN],
      palette: [SKINS[5] as string, CUSHMAS[4] as string, STRIPES[2] as string, CUSHMAS[4] as string],
      scale: 0.96,
      radius: 0.35,
      seed: 71,
    });
    const sk = SKIRTS[3] as readonly [string, string];
    const rider = villager({
      kind: "boatman",
      crowd,
      idx: crowd.alloc(),
      wear: WOMAN,
      palette: [SKINS[1] as string, sk[0], sk[1], RIBBONS[2] as string],
      scale: 0.92,
      radius: 0.35,
      seed: 73,
    });
    // Starts a short way into its run, heading downstream.
    motor = { boat, driver, rider, s: Math.min(route.length * 0.1, 40), dir: 1, speed: 0, wait: 0, wake: 0 };
  }

  const handPos = new THREE.Vector3();
  let frame = 0;
  let firstFish = true;

  const stepFisher = (c: Ctx, visible: boolean) => {
    if (!fisher) return;
    const f = fisher;
    const want = isOut("fish", c.time);
    // Out on the river / gone home: switched while nobody looks (or at once on a clock jump).
    if (f.man.active !== want && (firstFish || c.jump || !c.seen(f.boat.x, level + 1, f.boat.z, 90))) {
      f.man.setActive(want);
      f.mate.setActive(want);
    }
    firstFish = false;
    const on = f.man.active;
    f.boat.show(on && visible);
    for (const b of f.boat.bodies) b.solid = on;
    if (!on || !visible) {
      f.man.hide();
      f.mate.hide();
      f.net.visible = false;
      return;
    }
    // Bob on the water.
    const bob = c.rm ? 0 : Math.sin(c.clock * 1.3) * 0.025;
    f.boat.set(f.boat.x, level + bob, f.boat.z, f.boat.yaw, c.rm ? 0 : Math.sin(c.clock * 0.9) * 0.02);
    // The traveler's canoe close by: hold the cast (never throw the net onto it).
    const near = c.riding && Math.hypot(c.avatar.x - f.landX, c.avatar.z - f.landZ) < 7;
    const before = castAt(f.clock);
    if (!(near && (before.stage === "coil" || before.stage === "rest"))) f.clock += c.dt;
    const { stage, u } = castAt(f.clock);
    if (stage === "sink" && f.lastStage === "fly") {
      ripples.spawn(f.landX, f.landZ, 1.9);
      ripples.spawn(f.landX, f.landZ, 1.1);
    }
    f.lastStage = stage;
    // Fisherman at the bow, turned to the cast; the mate at the stern.
    seat(f.man, f.boat, 0, 1.1, level + bob + 0.05, 0);
    f.man.yaw = f.castYaw;
    const b = f.man.bones;
    f.man.rest(c.clock, c.rm);
    switch (stage) {
      case "coil":
        b.armL.rotation.set(-0.9, 0, 0.3);
        b.armR.rotation.set(-1.1 + (c.rm ? 0 : Math.sin(u * 18) * 0.15), 0, -0.2);
        b.torso.rotation.y = -0.4 * u;
        b.head.rotation.x = 0.2;
        break;
      case "swing":
        b.torso.rotation.y = -0.6 + 1.2 * u;
        b.armL.rotation.set(-1.0 - 0.8 * u, 0, 0.5);
        b.armR.rotation.set(-1.0 - 0.8 * u, 0, -0.5);
        b.legL.rotation.x = 0.2;
        b.legR.rotation.x = -0.25;
        break;
      case "fly":
        b.armL.rotation.set(-1.9, 0, 0.7);
        b.armR.rotation.set(-1.9, 0, -0.7);
        b.torso.rotation.x = 0.25;
        b.legL.rotation.x = 0.2;
        b.legR.rotation.x = -0.25;
        break;
      case "sink":
        b.armR.rotation.set(-0.7, 0, -0.1);
        b.torso.rotation.x = 0.1;
        break;
      case "haul": {
        const k = c.rm ? 0 : Math.sin(u * Math.PI * 7);
        b.armL.rotation.set(-1.2 + k * 0.5, 0, 0.2);
        b.armR.rotation.set(-1.2 - k * 0.5, 0, -0.2);
        b.torso.rotation.x = 0.18;
        break;
      }
      default:
        b.armR.rotation.set(-0.4, 0, -0.15);
    }
    f.man.commit();
    // The mate holds the canoe steady: small paddle strokes.
    seat(f.mate, f.boat, 0, -1.45, level + bob + 0.1, 0);
    f.mate.yaw = f.boat.yaw + Math.PI / 2;
    const m = f.mate.bones;
    f.mate.rest(c.clock, c.rm);
    f.mate.sit(c.clock, c.rm, 0.15);
    const st = c.rm ? 0 : Math.sin(c.clock * 1.4);
    m.armL.rotation.set(-1.0 + st * 0.3, 0, 0.3);
    m.armR.rotation.set(-1.3 + st * 0.3, 0, -0.1);
    m.tool.position.set(-0.25, 0.85, 0.35);
    m.tool.rotation.set(0.35 + st * 0.35, 0, -0.25);
    f.mate.commit();
    // The net: from the fisherman's hands to the landing spot.
    const sh = netShape(stage, u);
    const hx = f.man.x + Math.sin(f.castYaw) * 0.45;
    const hz = f.man.z + Math.cos(f.castYaw) * 0.45;
    handPos.set(hx, f.man.y + 1.05, hz);
    const x = hx + (f.landX - hx) * sh.out;
    const z = hz + (f.landZ - hz) * sh.out;
    const y = handPos.y + (level - handPos.y) * sh.out + sh.lift - sh.sink * 0.35;
    const r = 0.14 + 1.6 * sh.open;
    const h = 0.95 - 0.75 * sh.open;
    f.net.visible = true;
    f.net.position.set(x, y - (sh.out > 0.5 ? 0 : h * 0.6), z);
    f.net.scale.set(r, h, r);
  };

  const yieldTo = { x: 0, z: 0 };
  const stepMotor = (c: Ctx) => {
    if (!motor) return;
    const m = motor;
    const out = isOut("boat", c.time);
    const atEnd = m.s <= 0 || m.s >= route.length;
    // Waiting at an end of the river (out of the way): turn round when the wait is over.
    if (atEnd) {
      m.wait -= c.dt;
      m.speed = 0;
      if (m.wait <= 0 && out) {
        m.dir = m.s <= 0 ? 1 : -1;
        m.s = Math.max(0.01, Math.min(route.length - 0.01, m.s));
      }
    } else {
      // Slow down and stop for the traveler's canoe; otherwise cruise.
      m.boat.local(0, 4 * m.dir, yieldTo);
      const dTraveler = Math.hypot(c.avatar.x - yieldTo.x, c.avatar.z - yieldTo.z);
      // Throttle down past the swimming children, as boatmen do.
      let nearSwim = false;
      for (const a of o.slow ?? []) if (Math.hypot(m.boat.x - a.x, m.boat.z - a.z) < a.r + 10) nearSwim = true;
      const want = c.riding && dTraveler < 9 ? 0 : (c.riding && dTraveler < 16) || nearSwim ? 1.6 : 4.4;
      m.speed += (want - m.speed) * (1 - Math.exp(-c.dt * 1.2));
      m.s += m.speed * m.dir * c.dt;
      if (m.s <= 0 || m.s >= route.length) {
        m.s = Math.max(0, Math.min(route.length, m.s));
        m.wait = 25 + (frame % 20);
      }
    }
    routeAt(route, m.s, pose);
    const yaw = yawOf(pose.tx * m.dir, pose.tz * m.dir);
    const v = Math.hypot(c.camera.x - pose.x, c.camera.z - pose.z) < c.view + 25;
    const on = out || !atEnd;
    const shown = v && on;
    // Bow lifts a little at speed.
    const bob = c.rm ? 0 : Math.sin(c.clock * 2.1) * 0.03;
    m.boat.set(pose.x, level + bob, pose.z, yaw, c.rm ? 0 : Math.sin(c.clock * 1.7) * 0.015);
    m.boat.mesh.rotation.x = -Math.min(0.04, m.speed * 0.008);
    m.boat.show(shown);
    for (const b of m.boat.bodies) b.solid = on;
    if (!shown) {
      if (m.driver.active) {
        m.driver.setActive(false);
        m.rider.setActive(false);
      }
      return;
    }
    if (!m.driver.active) {
      m.driver.setActive(true);
      m.rider.setActive(true);
    }
    // Driver at the stern, hand on the tiller; passenger under the shade.
    seat(m.driver, m.boat, 0, -2.6, level + bob + 0.12, 0);
    m.driver.rest(c.clock, c.rm);
    m.driver.sit(c.clock, true, 0.1);
    m.driver.bones.armR.rotation.set(-0.9, 0, -0.2);
    m.driver.commit();
    seat(m.rider, m.boat, 0.1, -0.4, level + bob + 0.12, Math.PI / 2);
    m.rider.rest(c.clock, c.rm);
    m.rider.sit(c.clock, c.rm, 0.05);
    m.rider.commit();
    // Wake.
    m.wake -= c.dt;
    if (m.speed > 1 && m.wake <= 0 && !c.rm) {
      m.wake = 0.35;
      m.boat.local(0, -3.6, P2);
      ripples.spawn(P2.x, P2.z, 1.0);
    }
  };

  return {
    name: "river",
    center: groupCenter,
    radius: 1e6,
    update(c) {
      frame++;
      if (fisher) {
        const vis = Math.hypot(c.camera.x - fisher.boat.x, c.camera.z - fisher.boat.z) < c.view + 25;
        stepFisher(c, vis);
      }
      stepMotor(c);
    },
    dev: {
      lane: () => route.pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]),
      /** Cast clock (s into the cast cycle). */
      cast: (t: number) => {
        if (fisher) fisher.clock = t;
      },
      /** Put the peque-peque at road t, heading east (+1) or west (−1). */
      boat: (t: number, dir = 1) => {
        if (!motor) return;
        motor.s = sAtT(env, route, t);
        motor.dir = dir < 0 ? -1 : 1;
        motor.speed = 4.4;
        return [motor.boat.x, motor.boat.z];
      },
    },
    people: () => (fisher?.man.active ? 2 : 0) + (motor?.driver.active ? 2 : 0),
    points: () => {
      const out: Array<{ x: number; z: number }> = [];
      if (fisher) out.push({ x: fisher.boat.x, z: fisher.boat.z });
      if (motor) out.push({ x: motor.boat.x, z: motor.boat.z });
      return out;
    },
    dispose() {
      if (fisher) {
        fisher.boat.dispose();
        fisher.man.dispose();
        fisher.mate.dispose();
        fisher.net.geometry.dispose();
        const m = fisher.net.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.dispose();
        fisher.net.removeFromParent();
      }
      if (motor) {
        motor.boat.dispose();
        motor.driver.dispose();
        motor.rider.dispose();
      }
    },
  };
}
