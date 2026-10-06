/**
 * The people of the summit camp, on the shared people rig (people/person.ts, own crowd):
 *  - travellers resting by the fire (day and night): one sips api from a clay cup, one gets up now and then
 *    to stretch, one warms their hands and, by day, walks over to leave a stone on the apacheta;
 *  - the api vendor (stall hours): stirs the pot on the q'uncha, serves a cup, looks out over the plaza;
 *  - children (play hours) flying a kite: one holds the string and tugs it, one runs circles under it,
 *    one cheers and sits watching.
 * The vendor and the children come up over the grass at the south end of the pocket in the morning and go
 * home that way at dusk (plan.ts ROUTE, never on the trail band); they appear / vanish only out of sight
 * (behind the brow or off screen), or after a short fallback wait. Every person is a creatures Body
 * ("traveler-npc", "vendor", "child").
 */
import * as THREE from "three";
import { DARKS, MAN, type PartName, POLLERAS, PONCHOS, rng, SKINS, WEAVES, WOMAN } from "../people/models";
import { angleDamp, damp, Person } from "../people/person";
import type { Crowd, Palette } from "../people/rig";
import type { CampPart } from "./parts";
import { type P2, PLAY_HOURS, routeStart, STALL_HOURS, within } from "./plan";

export interface FolkCtx {
  dt: number;
  clock: number;
  time: number;
  rm: boolean;
  /** Clock jumped (T key / dev hook): snap everyone to where they belong. */
  jump: boolean;
  seen(x: number, y: number, z: number, max?: number): boolean;
  groundAt(x: number, z: number): number;
}

/** World-frame anchors (precomputed from plan.ts by the module). */
export interface FolkSpots {
  fire: P2;
  seats: Array<P2 & { top: number; stone: boolean }>;
  /** Where a traveller stands to stretch (behind each seat). */
  stands: P2[];
  /** Front of the apacheta (where the stone-bringer stands) and the cairn itself. */
  cairnFront: P2;
  cairn: P2;
  vendorAt: P2;
  stove: P2;
  stall: P2;
  /** Yaw the vendor faces when idle (toward the plaza). */
  vendorYaw: number;
  kids: P2;
  kidsR: number;
  wind: P2;
  home: P2;
  /** Waypoints over the grass from home (index 0) up to the camp. */
  route: P2[];
}

/** Arrival / departure fallbacks (s): appear or vanish anyway when the spot never leaves the view. */
const ARRIVE_WAIT = 20;
const LEAVE_WAIT = 12;
/** Walking home for this long (s) and still not there (blocked): vanish anyway. */
const LEAVE_GIVE_UP = 60;

type Wear = Array<PartName | CampPart>;
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

function makePerson(
  crowd: Crowd,
  kind: string,
  wear: Wear,
  palette: Palette,
  scale: number,
  seed: number,
  radius: number,
  headScale = 1,
) {
  const p = new Person({
    kind,
    crowd,
    idx: crowd.alloc(),
    wear: wear as PartName[],
    palette,
    scale,
    headScale,
    radius,
    seed,
  });
  return p;
}

// ------------------------------------------------------------------------------------------ travellers

type TRole = "sip" | "stretch" | "warm";

interface Traveller {
  p: Person;
  role: TRole;
  seat: number;
  /** Next stretch / apacheta trip (s). */
  nextStretch: number;
  nextTrip: number;
  carrying: boolean;
  wear: Wear;
  wearStone: Wear;
  palette: Palette;
}

export interface Folk {
  /** People in the world now. */
  count(): number;
  update(c: FolkCtx, visible: boolean): void;
  /** Festival / far: take everyone out (`false`) or let the schedule put them back (`true`). */
  enable(on: boolean): void;
  /** String end + kite holder state (for the kite). */
  kite: { hand: THREE.Vector3; x: number; z: number; flying: boolean };
  /** The vendor is at the stall (stove lit, steam). */
  vendorWorking(): boolean;
  points(): Array<{ kind: string; x: number; z: number; state: string }>;
  dispose(): void;
}

export function createFolk(
  crowd: Crowd,
  spots: FolkSpots,
  n: { travellers: number; kids: number },
  onStone: () => void,
): Folk {
  const R = rng(7331);
  const all: Person[] = [];

  // ---------------------------------------------------------------- travellers
  const roles: TRole[] = n.travellers >= 3 ? ["sip", "stretch", "warm"] : ["sip", "stretch"];
  const tripper = roles.length - 1;
  const travellers: Traveller[] = roles.map((role, i) => {
    const man = i !== 1;
    const hat: PartName = man ? (i === 0 ? "chullo" : "sombrero") : "montera";
    const base: Wear = [...(man ? MAN : WOMAN), hat];
    const wear: Wear = role === "sip" ? [...base, "cup"] : base;
    const palette: Palette = [
      pick(R, SKINS),
      man ? pick(R, PONCHOS) : pick(R, POLLERAS),
      pick(R, WEAVES),
      pick(R, DARKS),
    ];
    const p = makePerson(crowd, "traveler-npc", wear, palette, man ? 1.02 : 0.95, 31 + i * 17.3, 0.32);
    all.push(p);
    return {
      p,
      role,
      seat: i,
      nextStretch: 14 + R() * 20 + i * 9,
      nextTrip: 30 + R() * 25,
      carrying: false,
      wear,
      wearStone: [...wear, "stone"],
      palette,
    };
  });

  const seatTraveller = (t: Traveller) => {
    const s = spots.seats[t.seat] as FolkSpots["seats"][number];
    t.p.setActive(true);
    t.p.place(s.x, s.z, Math.atan2(spots.fire.x - s.x, spots.fire.z - s.z));
    t.p.state = "sit";
    t.p.timer = 0;
    if (t.carrying) {
      t.carrying = false;
      crowd.wear(t.p.idx, t.wear, t.palette);
    }
  };
  for (const t of travellers) seatTraveller(t);

  const sitPose = (t: Traveller, c: FolkCtx) => {
    const p = t.p;
    const b = p.bones;
    const s = spots.seats[t.seat] as FolkSpots["seats"][number];
    p.rest(c.clock, c.rm);
    const seatH = Math.max(0.03, s.top - p.y);
    const pelvis = 0.55 * p.scale;
    b.hips.position.y = seatH - pelvis + 0.02;
    if (s.stone) {
      // On a stone: thighs angle down to the feet on the grass.
      const drop = Math.min(0.95, Math.max(0, (seatH + 0.02) / pelvis));
      const ang = -(Math.PI / 2 - Math.asin(drop));
      b.legL.rotation.set(ang, 0, 0.1);
      b.legR.rotation.set(ang - 0.08, 0, -0.1);
    } else {
      b.legL.rotation.set(-1.42, 0, 0.16);
      b.legR.rotation.set(-1.42, 0, -0.16);
    }
    const night = !within(c.time, 0.27, 0.73);
    if (!c.rm) b.head.rotation.y = Math.sin(c.clock * 0.27 + p.seed) * 0.3;
    if (t.role === "sip") {
      // Hold the cup at the chest; every few seconds lift it to drink.
      const k = (c.clock + p.seed * 3) % 7.5;
      const lift = c.rm ? 0 : k < 0.6 ? k / 0.6 : k < 2.6 ? 1 : k < 3.2 ? 1 - (k - 2.6) / 0.6 : 0;
      const e = lift * lift * (3 - 2 * lift);
      b.armR.rotation.set(-1.1 - e * 1.2, 0, 0.35 + e * 0.15);
      b.armL.rotation.set(-0.55, 0, 0.3);
      b.head.rotation.x = -0.25 * e;
      b.torso.rotation.x = 0.06 - 0.08 * e;
    } else if (t.role === "warm" || night) {
      // Hands out to the fire.
      const w = c.rm ? 0 : Math.sin(c.clock * 0.9 + p.seed) * 0.06;
      b.torso.rotation.x = 0.16;
      b.armL.rotation.set(-1.25 + w, 0, -0.18);
      b.armR.rotation.set(-1.25 - w, 0, 0.18);
      b.head.rotation.x = 0.08;
    } else {
      // Leaning back on the hands.
      b.torso.rotation.x = -0.2;
      b.armL.rotation.set(0.5, 0, 0.35);
      b.armR.rotation.set(0.5, 0, -0.35);
    }
    p.commit();
  };

  const stepTraveller = (t: Traveller, c: FolkCtx, i: number) => {
    const p = t.p;
    const dt = c.dt;
    const b = p.bones;
    const s = spots.seats[t.seat] as FolkSpots["seats"][number];
    const day = within(c.time, 0.28, 0.72);
    p.timer -= dt;
    switch (p.state) {
      case "sit": {
        p.x = s.x;
        p.z = s.z;
        p.y = c.groundAt(p.x, p.z);
        p.body.x = p.x;
        p.body.z = p.z;
        if (t.role !== "sip") t.nextStretch -= dt;
        if (i === tripper && day) t.nextTrip -= dt;
        if (i === tripper && t.nextTrip <= 0) {
          t.nextTrip = 55 + R() * 45;
          t.carrying = true;
          crowd.wear(p.idx, t.wearStone, t.palette);
          p.state = "toCairn";
        } else if (t.nextStretch <= 0 && t.role === "stretch") {
          t.nextStretch = 26 + R() * 22;
          p.state = "rise";
        } else if (t.nextStretch <= 0) {
          t.nextStretch = 40 + R() * 30;
        }
        sitPose(t, c);
        return;
      }
      case "rise": {
        const st = spots.stands[t.seat] as P2;
        if (p.seek(st.x, st.z, 0.6, dt) < 0.3) {
          p.state = "stretch";
          p.timer = 5.5;
        }
        break;
      }
      case "stretch": {
        p.speed = 0;
        p.face(spots.fire.x, spots.fire.z, dt, 4);
        if (p.timer <= 0) p.state = "sitDown";
        break;
      }
      case "sitDown": {
        if (p.seek(s.x, s.z, 0.6, dt) < 0.3) seatTraveller(t);
        break;
      }
      case "toCairn": {
        if (p.seek(spots.cairnFront.x, spots.cairnFront.z, 1.0, dt) < 0.3) {
          p.state = "place";
          p.timer = 2.6;
        }
        break;
      }
      case "place": {
        p.speed = 0;
        p.face(spots.cairn.x, spots.cairn.z, dt, 6);
        if (t.carrying && p.timer < 1.2) {
          t.carrying = false;
          crowd.wear(p.idx, t.wear, t.palette);
          onStone();
        }
        if (p.timer <= 0) p.state = "back";
        break;
      }
      case "back": {
        if (p.seek(s.x, s.z, 1.0, dt) < 0.3) seatTraveller(t);
        break;
      }
    }
    p.y = c.groundAt(p.x, p.z);
    p.rest(c.clock, c.rm);
    p.gait(dt, c.rm);
    if (p.state === "stretch") {
      // Rise onto the toes, arms overhead, a slow lean back and a twist.
      const k = 1 - Math.max(0, p.timer) / 5.5;
      const up = Math.sin(Math.min(1, k * 1.25) * Math.PI);
      b.armL.rotation.set(-2.95 * up, 0, 0.25 * up + 0.08);
      b.armR.rotation.set(-2.95 * up, 0, -0.25 * up - 0.08);
      b.torso.rotation.x = -0.18 * up;
      b.head.rotation.x = -0.3 * up;
      if (!c.rm) b.torso.rotation.y = Math.sin(k * Math.PI * 2) * 0.25 * up;
      b.hips.position.y = 0.03 * up;
    } else if (p.state === "place") {
      // Stoop and set the stone on the cairn.
      const k = 1 - Math.max(0, p.timer) / 2.6;
      const bend = Math.sin(Math.min(1, k * 1.4) * Math.PI);
      b.torso.rotation.x = 0.55 * bend;
      b.armR.rotation.set(-0.6 - 0.7 * bend, 0, 0.1);
      b.armL.rotation.set(-0.3 * bend, 0, 0.12);
      b.head.rotation.x = 0.25 * bend;
    } else if (t.carrying) {
      b.armR.rotation.set(-0.9, 0, 0.15);
    }
    if (t.role === "sip" && p.state !== "sit") b.armR.rotation.set(-1.0, 0, 0.3);
    p.commit();
  };

  // ---------------------------------------------------------------- route (vendor and children)
  /**
   * Walk along the route: toward the camp (p.v = next waypoint, then `end`) or home (p.v counts down to 0,
   * then `end` near home). Returns the distance left to `end` (a large number while on the waypoints).
   */
  const route = spots.route;
  const followRoute = (p: Person, toCamp: boolean, endX: number, endZ: number, speed: number, dt: number) => {
    const n = route.length;
    const onWps = toCamp ? p.v < n : p.v >= 0;
    if (!onWps) return p.seek(endX, endZ, speed, dt);
    const w = route[Math.min(n - 1, Math.max(0, p.v))] as P2;
    // Generous radius: someone (an animal, a child) may be standing right on a waypoint.
    if (p.seek(w.x, w.z, speed, dt) < 1.2) p.v += toCamp ? 1 : -1;
    return 99;
  };
  const startRoute = (p: Person, toCamp: boolean) => {
    p.v = routeStart(route, p.x, p.z, toCamp);
    p.timer = 0;
  };
  const seenAt = (c: FolkCtx, x: number, z: number) => c.seen(x, c.groundAt(x, z) + 0.9, z, 60);
  /**
   * Where to come out of nowhere: -1 = in place (the work / play spot is out of view), else the first route
   * point out of view (home first, then up toward the camp), else null (everything in view: wait; after
   * ARRIVE_WAIT the caller uses home anyway).
   */
  const entry = (c: FolkCtx, atX: number, atZ: number): number | null => {
    if (!seenAt(c, atX, atZ)) return -1;
    for (let i = 0; i < route.length; i++) {
      const w = route[i] as P2;
      if (!seenAt(c, w.x, w.z)) return i;
    }
    return null;
  };
  /** Leaving: vanish as soon as nobody sees it once it's on its way (past the camp end of the route). */
  const canVanish = (c: FolkCtx, p: Person, waited: number) =>
    (p.v < route.length - 1 && !seenAt(c, p.x, p.z)) || waited > LEAVE_WAIT || -p.timer > LEAVE_GIVE_UP;

  // ---------------------------------------------------------------- vendor
  const vPal: Palette = [pick(R, SKINS), pick(R, POLLERAS), pick(R, WEAVES), pick(R, DARKS)];
  const vWear: Wear = [...WOMAN, "montera", "ladle"];
  const vendor = makePerson(crowd, "vendor", vWear, vPal, 0.94, 77.7, 0.34);
  all.push(vendor);
  vendor.state = "home";
  let vendorWait = 0;

  const snapVendor = (open: boolean) => {
    if (open) {
      vendor.setActive(true);
      vendor.place(spots.vendorAt.x, spots.vendorAt.z, spots.vendorYaw);
      vendor.state = "work";
      vendor.timer = 3;
      vendor.u = 0;
    } else {
      vendor.setActive(false);
      vendor.state = "home";
    }
  };

  const stepVendor = (c: FolkCtx) => {
    const p = vendor;
    const dt = c.dt;
    const b = p.bones;
    const open = within(c.time, STALL_HOURS[0], STALL_HOURS[1]);
    p.timer -= dt;
    switch (p.state) {
      case "home": {
        vendorWait = open ? vendorWait + dt : 0;
        if (!open) return;
        const at = entry(c, spots.vendorAt.x, spots.vendorAt.z) ?? (vendorWait > ARRIVE_WAIT ? 0 : null);
        if (at === -1) snapVendor(true);
        else if (at !== null) {
          const w = route[at] as P2;
          const nx = route[Math.min(route.length - 1, at + 1)] as P2;
          p.setActive(true);
          p.place(w.x, w.z, Math.atan2(nx.x - w.x, nx.z - w.z));
          p.state = "toStall";
          p.v = at + 1;
        }
        if (at !== null) vendorWait = 0;
        return;
      }
      case "toStall": {
        if (followRoute(p, true, spots.vendorAt.x, spots.vendorAt.z, 1.1, dt) < 0.3) {
          p.state = "work";
          p.timer = 4;
          p.u = 0;
        }
        if (!open) {
          p.state = "toHome";
          startRoute(p, false);
        }
        break;
      }
      case "toHome": {
        const d = followRoute(p, false, spots.home.x, spots.home.z, 1.1, dt);
        vendorWait = d < 1.2 ? vendorWait + dt : 0;
        if (open) {
          p.state = "toStall";
          startRoute(p, true);
        } else if (canVanish(c, p, vendorWait)) {
          p.setActive(false);
          p.state = "home";
          vendorWait = 0;
          return;
        }
        break;
      }
      default: {
        // work: u cycles 0 stir → 1 serve → 2 look out.
        p.speed = damp(p.speed, 0, 6, dt);
        p.resolve(0.3);
        if (!open) {
          p.state = "toHome";
          startRoute(p, false);
          break;
        }
        if (p.timer <= 0) {
          p.u = (p.u + 1) % 3;
          p.timer = p.u === 0 ? 6 + R() * 3 : p.u === 1 ? 2.4 : 4 + R() * 4;
        }
        if (p.u === 0) p.face(spots.stove.x, spots.stove.z, dt, 4);
        else if (p.u === 1) p.face(spots.stall.x, spots.stall.z, dt, 5);
        else p.yaw = angleDamp(p.yaw, spots.vendorYaw, 3, dt);
      }
    }
    p.y = c.groundAt(p.x, p.z);
    p.rest(c.clock, c.rm);
    p.gait(dt, c.rm);
    if (p.state === "work") {
      if (p.u === 0) {
        // Stir the api with the long ladle: small circles over the pot.
        const a = c.rm ? 0 : c.clock * 2.4;
        b.torso.rotation.x = 0.22;
        b.armR.rotation.set(-0.95 + Math.sin(a) * 0.12, Math.cos(a) * 0.15, 0.12);
        b.armL.rotation.set(-0.35, 0, 0.12);
        b.head.rotation.x = 0.3;
      } else if (p.u === 1) {
        // Ladle a cup.
        const k = 1 - Math.max(0, p.timer) / 2.4;
        b.torso.rotation.x = 0.18;
        b.armR.rotation.set(-1.05 + Math.sin(k * Math.PI) * 0.3, 0, 0.2);
        b.armL.rotation.set(-0.95, 0, -0.15);
        b.head.rotation.x = 0.25;
      } else {
        b.armL.rotation.set(-0.5, 0, -0.2);
        b.armR.rotation.set(-0.45, 0, 0.25);
      }
    } else b.armR.rotation.set(-0.2, 0, -0.1);
    p.commit();
  };

  // ---------------------------------------------------------------- children
  const kids: Person[] = Array.from({ length: n.kids }, (_, i) => {
    const boy = i % 2 === 0;
    const wear: Wear = boy ? [...MAN, "chullo"] : [...WOMAN];
    if (i === 0) wear.push("spool");
    const palette: Palette = [
      pick(R, SKINS),
      boy ? pick(R, PONCHOS) : pick(R, POLLERAS),
      pick(R, WEAVES),
      pick(R, DARKS),
    ];
    const p = makePerson(crowd, "child", wear, palette, 0.6 + R() * 0.07, 91 + i * 13.1, 0.26, 1.3);
    p.state = "home";
    p.u = i * 2.1; // runner's angle
    all.push(p);
    return p;
  });
  let kidsWait = 0;
  const kidSpot = (i: number, out: P2) => {
    const w = spots.wind;
    if (i === 0) {
      out.x = spots.kids.x;
      out.z = spots.kids.z;
    } else {
      // Beside the holder, a little downwind.
      const s = i === 1 ? 1 : -1;
      out.x = spots.kids.x + w.x * 0.9 - w.z * s * 1.1;
      out.z = spots.kids.z + w.z * 0.9 + w.x * s * 1.1;
    }
    return out;
  };
  const tgt: P2 = { x: 0, z: 0 };
  const snapKids = (play: boolean) => {
    for (const [i, k] of kids.entries()) {
      if (play) {
        k.setActive(true);
        kidSpot(i, tgt);
        k.place(tgt.x, tgt.z, Math.atan2(spots.wind.x, spots.wind.z));
        k.state = "play";
        k.timer = 3 + i * 2;
      } else {
        k.setActive(false);
        k.state = "home";
      }
    }
  };

  const stepKid = (k: Person, i: number, c: FolkCtx) => {
    const dt = c.dt;
    const b = k.bones;
    const play = within(c.time, PLAY_HOURS[0], PLAY_HOURS[1]);
    const w = spots.wind;
    k.timer -= dt;
    switch (k.state) {
      case "home":
        return;
      case "toPlay": {
        kidSpot(i, tgt);
        if (followRoute(k, true, tgt.x, tgt.z, 1.6, dt) < 0.3) {
          k.state = "play";
          k.timer = 4 + i * 2;
        }
        if (!play) {
          k.state = "toHome";
          startRoute(k, false);
        }
        break;
      }
      case "toHome": {
        const d = followRoute(k, false, spots.home.x + i * 0.6, spots.home.z, 1.6, dt);
        if (play) {
          k.state = "toPlay";
          startRoute(k, true);
        } else if (canVanish(c, k, 0)) {
          k.setActive(false);
          k.state = "home";
          return;
        } else if (d < 1.2) {
          k.state = "gone";
          k.timer = 0;
        }
        break;
      }
      case "gone": {
        // Waiting at home, out of the way, until nobody looks (or a short while).
        k.speed = damp(k.speed, 0, 6, dt);
        k.resolve(0.3);
        if (play) {
          k.state = "toPlay";
          startRoute(k, true);
        } else if (canVanish(c, k, -k.timer)) {
          k.setActive(false);
          k.state = "home";
          return;
        }
        break;
      }
      default: {
        // play
        if (!play) {
          k.state = "toHome";
          startRoute(k, false);
          break;
        }
        if (i === 0) {
          // Holder: plants the feet, tugs the string, takes a step back now and then.
          const back = c.rm ? 0 : Math.sin(c.clock * 0.21 + 1) * 0.45;
          k.seek(spots.kids.x - w.x * back, spots.kids.z - w.z * back, 0.5, dt, 3);
          k.yaw = angleDamp(k.yaw, Math.atan2(w.x, w.z), 3, dt);
        } else if (i === 1) {
          // Runner: circles under the kite, stops to point at it.
          if (k.timer > 0 || c.rm) {
            k.u += (dt * 1.9) / spots.kidsR;
            const cx = spots.kids.x + w.x * 1.6;
            const cz = spots.kids.z + w.z * 1.6;
            k.seek(cx + Math.cos(k.u) * spots.kidsR, cz + Math.sin(k.u) * spots.kidsR, 2.0, dt);
            if (k.timer < -0.5) k.timer = 6 + R() * 5;
          } else {
            k.speed = damp(k.speed, 0, 6, dt);
            k.face(k.x + w.x, k.z + w.z, dt, 5);
            if (k.timer < -2.6) k.timer = 6 + R() * 5;
          }
        } else {
          // Watcher: sits on the grass, then jumps up to cheer.
          kidSpot(i, tgt);
          k.seek(tgt.x, tgt.z, 0.8, dt);
          k.face(k.x + w.x, k.z + w.z, dt, 3);
          if (k.timer < -4) k.timer = 8 + R() * 6;
        }
      }
    }
    k.y = c.groundAt(k.x, k.z);
    k.rest(c.clock, c.rm);
    k.gait(dt, c.rm);
    if (k.state === "play") {
      if (i === 0) {
        const tug = c.rm ? 0 : Math.max(0, Math.sin(c.clock * 1.7)) * 0.25;
        b.armR.rotation.set(-1.95 + tug, 0, 0.2);
        b.armL.rotation.set(-1.75 + tug * 0.6, 0, -0.25);
        b.torso.rotation.x = -0.1 - tug * 0.2;
        b.head.rotation.x = -0.45;
      } else if (i === 1 && k.timer <= 0 && !c.rm) {
        // Point up at the kite with a little hop.
        b.armR.rotation.set(-2.7, 0, -0.1);
        b.head.rotation.x = -0.5;
        b.hips.position.y = Math.abs(Math.sin(c.clock * 7)) * 0.07;
      } else if (i === 1) {
        b.head.rotation.x = -0.2;
      } else if (k.timer > 0) {
        k.sit(c.clock, c.rm, 0.05);
        b.armL.rotation.set(0.45, 0, 0.3);
        b.armR.rotation.set(0.45, 0, -0.3);
        b.head.rotation.x = -0.4;
      } else {
        const hop = c.rm ? 0 : Math.abs(Math.sin(c.clock * 6.5));
        b.hips.position.y = hop * 0.1;
        b.armL.rotation.set(-2.8, 0, 0.3);
        b.armR.rotation.set(-2.8, 0, -0.3);
        b.head.rotation.x = -0.45;
      }
    }
    k.commit();
  };

  // ---------------------------------------------------------------- group driver
  let enabled = true;
  let first = true;
  let shownNow = true;
  let frame = 0;
  const hand = new THREE.Vector3();
  const kite = { hand, x: 0, z: 0, flying: false };

  const snapAll = (c: FolkCtx) => {
    for (const t of travellers) seatTraveller(t);
    snapVendor(within(c.time, STALL_HOURS[0], STALL_HOURS[1]));
    snapKids(within(c.time, PLAY_HOURS[0], PLAY_HOURS[1]));
  };

  const kidsStep = (c: FolkCtx) => {
    const play = within(c.time, PLAY_HOURS[0], PLAY_HOURS[1]);
    let anyHome = false;
    for (const k of kids) if (k.state === "home") anyHome = true;
    // Come out together: in place when the kite field is out of view, else from the first route point out
    // of view, else (after a while) from home anyway.
    kidsWait = play && anyHome ? kidsWait + c.dt : 0;
    if (!anyHome || !play) return;
    const at = entry(c, spots.kids.x, spots.kids.z) ?? (kidsWait > ARRIVE_WAIT ? 0 : null);
    if (at === null) return;
    kidsWait = 0;
    if (at === -1) {
      snapKids(true);
      return;
    }
    const w = route[at] as P2;
    const nx = route[Math.min(route.length - 1, at + 1)] as P2;
    for (const k of kids)
      if (k.state === "home") {
        k.setActive(true);
        k.place(w.x + (R() - 0.5), w.z + (R() - 0.5), Math.atan2(nx.x - w.x, nx.z - w.z));
        k.state = "toPlay";
        k.v = at + 1;
      }
  };

  return {
    kite,
    count: () => all.filter((p) => p.active).length,
    vendorWorking: () => enabled && vendor.active && vendor.state === "work",
    enable(on) {
      if (enabled === on) return;
      enabled = on;
      if (!on) for (const p of all) p.setActive(false);
      else first = true;
    },
    update(c, visible) {
      if (!enabled) {
        kite.flying = false;
        return;
      }
      if (first || c.jump) {
        first = false;
        snapAll(c);
      }
      if (visible !== shownNow) {
        shownNow = visible;
        if (!visible) for (const p of all) p.hide();
      }
      if (!visible) {
        // Far away: keep the schedule (cheap) about twice a second, by snapping.
        if (frame++ % 30 === 0) {
          const open = within(c.time, STALL_HOURS[0], STALL_HOURS[1]);
          if (open !== vendor.active) snapVendor(open);
          const play = within(c.time, PLAY_HOURS[0], PLAY_HOURS[1]);
          if (kids[0] && play !== kids[0].active) snapKids(play);
        }
        kite.flying = false;
        return;
      }
      for (let i = 0; i < travellers.length; i++) stepTraveller(travellers[i] as Traveller, c, i);
      if (vendor.active || vendor.state === "home") stepVendor(c);
      kidsStep(c);
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i] as Person;
        if (k.active) stepKid(k, i, c);
      }
      const h = kids[0];
      kite.flying = !!h && h.active && h.state === "play";
      if (h?.active) {
        h.bones.handR.getWorldPosition(hand);
        kite.x = h.x;
        kite.z = h.z;
      }
    },
    points: () => all.map((p) => ({ kind: p.body.kind, x: +p.x.toFixed(1), z: +p.z.toFixed(1), state: p.state })),
    dispose() {
      for (const p of all) p.dispose();
    },
  };
}
