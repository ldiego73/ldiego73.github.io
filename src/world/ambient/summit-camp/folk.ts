/**
 * The people of the summit camp, on the shared characters (people/npc.ts on the camp's own HumanCrowd; the cup,
 * the ladle, the stone and the kite spool are shared held props):
 *  - travellers resting by the fire (day and night): one sips api from a clay cup, one gets up now and then
 *    to stretch, one warms their hands and, by day, walks over to leave a stone on the apacheta;
 *  - the api vendor (stall hours): stirs the pot on the q'uncha, serves a cup, looks out over the plaza;
 *  - children (play hours) flying a kite: one holds the string and tugs it, one runs circles under it,
 *    one cheers and sits watching.
 * The vendor and the children come up over the grass at the south end of the pocket in the morning and go
 * home that way at dusk (plan.ts ROUTE, never on the trail band); they appear / vanish only out of sight
 * (behind the brow or off screen), or after a short fallback wait. Every person is a creatures Body
 * ("traveler-npc", "vendor", "child"). Gestures the action catalogue lacks (sipping while seated, warming the
 * hands, a stretch, setting the stone, tugging the kite string) use the actions and the arms layer.
 */
import * as THREE from "three";
import type { HumanSpec } from "../../characters/archetype";
import type { HumanCrowd } from "../../characters/crowd";
import { PEOPLE, wardrobe } from "../../characters/presets";
import type { HeldProps, PropHandle } from "../../characters/props";
import type { Dress } from "../../characters/slots";
import { play, playArms } from "../gente/overlay";
import { rng } from "../people/models";
import { Npc, type NpcFrame } from "../people/npc";
import { angleDamp, damp } from "../people/person";
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
  /** The traveler (people glance at them when close). */
  avatar: THREE.Vector3;
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

type Person = Npc;

function makePerson(
  crowd: HumanCrowd,
  kind: string,
  spec: HumanSpec,
  palette: Dress,
  scale: number,
  seed: number,
  radius: number,
) {
  return new Npc({ kind, crowd, spec, palette, scale, radius, seed });
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
  /** The stone for the apacheta (shown while carried). */
  stone: PropHandle | null;
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
  crowd: HumanCrowd,
  held: HeldProps,
  spots: FolkSpots,
  n: { travellers: number; kids: number },
  onStone: () => void,
): Folk {
  const R = rng(7331);
  const all: Person[] = [];
  const nf: NpcFrame = { dt: 0, clock: 0, rm: false, avatar: new THREE.Vector3() };
  const look = new THREE.Vector3();
  /** Animate and draw (the people glance at the traveler within ~6 u). */
  const commit = (p: Person, c: FolkCtx) => {
    nf.dt = c.dt;
    nf.clock = c.clock;
    nf.rm = c.rm;
    nf.avatar.copy(c.avatar);
    p.commit(nf);
  };

  // ---------------------------------------------------------------- travellers
  const roles: TRole[] = n.travellers >= 3 ? ["sip", "stretch", "warm"] : ["sip", "stretch"];
  const tripper = roles.length - 1;
  const travellers: Traveller[] = roles.map((role, i) => {
    const man = i !== 1;
    const spec = man ? (i === 0 ? PEOPLE.campesino : PEOPLE.campesinoFelt) : PEOPLE.campesina;
    const palette = man ? wardrobe.andeanMan(R, false, i !== 0) : wardrobe.andeanWoman(R);
    const p = makePerson(crowd, "traveler-npc", spec, palette, man ? 1.02 : 1, 31 + i * 17.3, 0.32);
    // Bundles beside them on the ground are static props; the sipper holds a clay cup of api.
    if (role === "sip") p.hold(held, "cup", "#b5653b");
    const stone = i === roles.length - 1 ? p.hold(held, "stone", "#9a9184") : null;
    stone?.show(false);
    all.push(p);
    return {
      p,
      role,
      seat: i,
      nextStretch: 14 + R() * 20 + i * 9,
      nextTrip: 30 + R() * 25,
      carrying: false,
      stone,
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
      t.stone?.show(false);
    }
  };
  for (const t of travellers) seatTraveller(t);

  const sitPose = (t: Traveller, c: FolkCtx) => {
    const p = t.p;
    const s = spots.seats[t.seat] as FolkSpots["seats"][number];
    // On a stone: a low seat, feet on the grass; on the manta: cross-legged.
    if (s.stone) play(p, "sit-stool", { seat: Math.max(0.05, s.top - p.y), fade: 0.5 });
    else play(p, "sit-cross", { fade: 0.5 });
    const night = !within(c.time, 0.27, 0.73);
    // Eyes drift between the fire and the view.
    look.set(spots.fire.x, p.y + 0.4, spots.fire.z);
    if (!c.rm) look.x += Math.sin(c.clock * 0.27 + p.seed) * 2.5;
    // Arms over the seated pose: sipping api from the cup now and then, or hands held out to the fire.
    playArms(p, t.role === "sip" ? "drink" : t.role === "warm" || night ? "hold-front" : "none", { fade: 0.5 });
    p.lookAt = look;
    commit(p, c);
  };

  const stepTraveller = (t: Traveller, c: FolkCtx, i: number) => {
    const p = t.p;
    const dt = c.dt;
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
          t.stone?.show(true);
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
          t.stone?.show(false);
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
    // Standing up to stretch, stooping to set the stone on the cairn, the stone carried in the hand.
    play(p, p.state === "stretch" ? "stretch" : p.state === "place" ? "place" : t.carrying ? "carry-hand" : "none", {
      fade: 0.35,
    });
    playArms(p, t.role === "sip" && p.state !== "sit" ? "carry-hand" : "none");
    p.lookAt = null;
    commit(p, c);
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
  const vendor = makePerson(crowd, "vendor", PEOPLE.campesina, wardrobe.andeanWoman(R), 0.97, 77.7, 0.34);
  // The long wooden ladle (wislla) for stirring and serving the api.
  vendor.hold(held, "ladle", "#7a5233");
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
    // Work: stir the pot with the ladle, ladle a cup at the stall, then stand looking out over the plaza.
    play(p, p.state !== "work" ? "none" : p.u === 2 ? "hands-clasp" : "stir", { fade: 0.4 });
    commit(p, c);
  };

  // ---------------------------------------------------------------- children
  const kids: Person[] = Array.from({ length: n.kids }, (_, i) => {
    const boy = i % 2 === 0;
    const spec = boy ? PEOPLE.wawaBoy : PEOPLE.wawaGirl;
    const palette = boy ? wardrobe.andeanMan(R) : wardrobe.andeanWoman(R);
    const p = makePerson(crowd, "child", spec, palette, 0.95 + R() * 0.1, 91 + i * 13.1, 0.26);
    // The holder winds the kite string on a spool.
    if (i === 0) p.hold(held, "spool", "#c4383f");
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
    const playing = within(c.time, PLAY_HOURS[0], PLAY_HOURS[1]);
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
        if (!playing) {
          k.state = "toHome";
          startRoute(k, false);
        }
        break;
      }
      case "toHome": {
        const d = followRoute(k, false, spots.home.x + i * 0.6, spots.home.z, 1.6, dt);
        if (playing) {
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
        if (playing) {
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
        if (!playing) {
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
    // Holder: string up, tugging. Runner: circling, or stopping to point up with a skip. Watcher: sitting on
    // the grass, then up hopping and cheering.
    const pointing = k.state === "play" && i === 1 && k.timer <= 0 && !c.rm;
    const sitting = k.state === "play" && i >= 2 && k.timer > 0;
    const cheering = k.state === "play" && i >= 2 && k.timer <= 0;
    const holding = k.state === "play" && i === 0;
    play(k, holding ? "tug" : sitting ? "sit-ground" : (pointing || cheering) && !c.rm ? "hop" : "none", { fade: 0.3 });
    playArms(k, pointing ? "point-up" : cheering ? "cheer" : "none", { fade: 0.25 });
    commit(k, c);
  };

  // ---------------------------------------------------------------- group driver
  let enabled = true;
  let first = true;
  let shownNow = true;
  let frame = 0;
  const hand = new THREE.Vector3();
  const handM = new THREE.Matrix4();
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
        // Out of view: not drawn (props follow their holder); back in view: shown again if they are out.
        for (const p of all) p.member.show(visible && p.active);
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
        hand.setFromMatrixPosition(h.member.boneWorld("handR", handM));
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
