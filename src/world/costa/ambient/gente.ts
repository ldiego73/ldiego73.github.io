/**
 * People of the coast, on the shared characters (../../characters: continuous skinned bodies in one crowd,
 * ./gente/crowd.ts) dressed for the coast from ./gente/dress.ts (cotton shirts and straw hats, blouses with
 * bib aprons, tees and shorts, board shorts):
 *  - walkers on the road, each going to and fro along a stretch between two stations (keeping to the right of
 *    the road), stepping round the traveler and each other through the shared creatures registry;
 *  - travellers of the whole road, in both directions, some with a cloth bundle (q'ipi) on the back or a basket
 *    in hand: whoever falls far behind the traveler is moved, out of sight, to the road some way ahead or behind
 *    them (./gente/logic.ts `strayed` / `respawns`), so wherever the traveler is people come and go;
 *  - families (two parents and a child, or a parent and two children) strolling between the last huaca, the
 *    Huanchaco market and the north beach, the others keeping beside the one in front;
 *  - the market woman behind the middle stall of the Huanchaco market, hands clasped, looking round at
 *    passers-by;
 *  - on the Huanchaco beach: children chasing the waves, fishermen by their drying caballitos (one mending a
 *    net, one more on the north beach), surfers carrying their boards along the sand and two more sitting astride
 *    their boards beyond the surf, rising and falling with the swell, and a vendor walking the sand with a cool
 *    box, stopping now and then to call out with a raised arm.
 * By day only: at dusk they go home and at dawn they come back, both only while unseen (or at once on the first
 * frame), so nobody vanishes in view. Anyone far from the camera is not drawn (nor animated).
 * Motion is the human animation controller's (walk and run from the real speed; actions "carry-back",
 * "carry-hand", "hands-clasp", "knit", "ride", "wave"; a glance at the traveler close by). Tools and loads are
 * held props (q'ipi, basket, surfboard, cool box, net). Draw calls: the coast's crowd (2, shared with the
 * gathering and the caballito fishermen), one per prop kind in use, and the boards of the surfers at sea (1).
 */
import * as THREE from "three";
import { Npc, type NpcFrame } from "../../ambient/people/npc";
import type { PropKind } from "../../characters/props";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { Geo, rng } from "../kit";
import type { CostaLayout } from "../layout";
import { BEACHES, COSTA_STATIONS, STATION } from "../plan";
import { seaHeight } from "../scenery/waves";
import { coastCrowd } from "./gente/crowd";
import { adult, COAST_PEOPLE, type CoastWho, coastDress } from "./gente/dress";
import { isDay, laneTarget, respawns, SEA_SEAT, shoreRun, strayed } from "./gente/logic";
import { toWorld } from "./huacas/logic";
import { STALLS } from "./huacas/market";

type Role = "walker" | "traveller" | "follow" | "vendor" | "kid" | "fisher" | "surfer" | "surfer-sea" | "beach-vendor";
interface Who {
  p: Npc;
  role: Role;
  /** Walker: road stretch [t0, t1] and direction. Beach walkers: along-shore stretch [t0, t1]. */
  t0: number;
  t1: number;
  dir: 1 | -1;
  t: number;
  speed: number;
  pause: number;
  home: { x: number; z: number; yaw: number };
  u: number;
  /** A fisherman mending a net (head down, hands working). */
  mend?: boolean;
  /** How they hold what they carry. */
  carry: "none" | "carry-back" | "carry-hand";
  /** Drawn this frame (near the camera). */
  drawn: boolean;
  /** Surfer at sea: their board's instance. */
  board?: number;
  /** Family member: who they keep beside, and where (metres to the leader's right, behind). */
  lead?: Who;
  side?: number;
  back?: number;
}

/** Beyond this distance from the camera nobody is drawn or animated. */
const VIEW = 140;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const R = rng(0x9e7e);
  const high = env.quality === "high";
  const ground = env.suyu.groundAt;
  const len = L.trail.length;
  const nWalkers = high ? 7 : 4;
  const nTravellers = high ? 8 : 4;
  const nKids = 3;
  /** Families: [leader stretch t0, t1, members after the leader (kid?)]. */
  const families: Array<[number, number, boolean[]]> = high
    ? [
        [0.7, 0.775, [false, true]],
        [0.795, 0.89, [true, true]],
      ]
    : [[0.7, 0.775, [false, true]]];
  const surfers = high ? 2 : 1;
  const seaSurfers = high ? 2 : 1;

  const shared = coastCrowd(env.scene, env.quality === "low");
  const { crowd, props } = shared;

  const make = (who: CoastWho, seed: number, scale: number): Npc =>
    new Npc({
      kind: who === "boy" || who === "girl" ? "costa-kid" : "costa-person",
      crowd,
      spec: COAST_PEOPLE[who],
      palette: coastDress(who, R),
      scale,
      radius: who === "boy" || who === "girl" ? 0.26 : 0.34,
      seed,
    });
  const adultScale = (man: boolean) => (man ? 0.98 + R() * 0.06 : 0.97 + R() * 0.05);
  const who = (p: Npc, role: Role, o: Partial<Who> = {}): Who => ({
    p,
    role,
    t0: 0,
    t1: 0,
    dir: 1,
    t: 0,
    speed: 0,
    pause: 0,
    home: { x: 0, z: 0, yaw: 0 },
    u: 0,
    carry: "none",
    drawn: true,
    ...o,
  });
  const hold = (w: Who, kind: PropKind, tint?: string) => {
    w.p.hold(props, kind, tint);
    return w;
  };

  const people: Who[] = [];
  // ------------------------------------------------------------------ walkers (stretches between stations)
  const stops = [...COSTA_STATIONS].sort((a, b) => a.t - b.t);
  for (let i = 0; i < nWalkers; i++) {
    const k = Math.floor(R() * (stops.length - 1));
    const a = (stops[k] as (typeof stops)[number]).t + 0.012;
    const b = (stops[k + 1] as (typeof stops)[number]).t - 0.012;
    const man = i % 3 !== 1;
    const p = make(adult(man, R() < 0.6), 11 + i * 7.3, adultScale(man));
    const t = a + R() * Math.max(0.001, b - a);
    people.push(who(p, "walker", { t0: a, t1: b, dir: R() < 0.5 ? 1 : -1, t, speed: 1 + R() * 0.3, pause: R() * 3 }));
  }
  // ------------------------------------------------------------------ travellers of the whole road
  const LOADS = ["#c4383f", "#2a9d8f", "#3446a6", "#dda63c"];
  for (let i = 0; i < nTravellers; i++) {
    const man = i % 2 === 0;
    const r = R();
    const load = r < 0.55 ? "qipi" : !man && R() < 0.6 ? "basket-hand" : null;
    const p = make(adult(man, R() < 0.7), 23 + i * 4.1, adultScale(man));
    // Placed round the player on the first frame (u < 0 marks "not placed yet").
    const w = who(p, "traveller", { dir: R() < 0.5 ? 1 : -1, speed: 1.15 + R() * 0.3, u: -1 });
    if (load === "qipi") {
      hold(w, "qipi", LOADS[i % LOADS.length]);
      w.carry = "carry-back";
    } else if (load === "basket-hand") {
      hold(w, "basket-hand", LOADS[(i + 1) % LOADS.length]);
      w.carry = "carry-hand";
    }
    people.push(w);
  }
  // ------------------------------------------------------------------ families
  for (const [t0, t1, members] of families) {
    const t = t0 + R() * (t1 - t0);
    const lead = who(make("manHat", 61 + t0 * 10, adultScale(true)), "walker", {
      t0,
      t1,
      dir: R() < 0.5 ? 1 : -1,
      t,
      speed: 0.85,
      pause: 0,
    });
    people.push(lead);
    members.forEach((kid, j) => {
      const p = kid
        ? make(R() < 0.5 ? "boy" : "girl", 67 + t0 * 10 + j, 0.94 + R() * 0.1)
        : make("woman", 67 + t0 * 10 + j, adultScale(false));
      people.push(who(p, "follow", { lead, side: j === 0 ? -1.1 : 1.0, back: j === 0 ? 0.3 : 0.9, t }));
    });
  }
  // ------------------------------------------------------------------ the market woman
  {
    const pose = env.stationPose(STATION.market);
    const f = { x: pose.position.x, z: pose.position.z, y: 0, yaw: pose.yaw };
    const st = STALLS[2] as (typeof STALLS)[number];
    // Behind the middle stall's counter (stall-local z −0.4), facing the plaza.
    const sf = { ...toWorld(f, st.x, st.z), y: 0, yaw: f.yaw + st.yaw };
    const at = toWorld(sf, 0, -0.35);
    const p = make("womanHat", 91, 0.99);
    p.body.solid = false;
    p.lookRange = 8;
    people.push(who(p, "vendor", { home: { x: at.x, z: at.z, yaw: sf.yaw } }));
  }
  // ------------------------------------------------------------------ beaches
  /** A beach at road t: its waterline point, the seaward normal (nx, nz) and the along-shore axis (−nz, nx). */
  const beach = (t: number) => {
    const bp = L.beachPoint(t);
    const dsx = L.shoreX(bp.z + 2) - L.shoreX(bp.z - 2);
    const l = Math.hypot(4, dsx) || 1;
    return { x: bp.x, z: bp.z, nx: -4 / l, nz: dsx / l };
  };
  type Beach = ReturnType<typeof beach>;
  /** A point `out` metres seaward of the waterline (negative: up the sand) and `along` the shore. */
  const onBeach = (b: Beach, out: number, along: number) => ({
    x: b.x + b.nx * out - b.nz * along,
    z: b.z + b.nz * out + b.nx * along,
  });
  const south = beach(BEACHES.south);
  const north = beach(BEACHES.north);
  for (let i = 0; i < nKids; i++) {
    const p = make(i % 2 === 0 ? "boy" : "girl", 51 + i * 3.1, 0.92 + R() * 0.12);
    p.lookRange = 0;
    // Along the shore, a few metres apart, south of the boats.
    const at = onBeach(south, -3, -10 - i * 4);
    people.push(who(p, "kid", { speed: 2.3 + R() * 0.5, pause: R() * 2, home: { ...at, yaw: 0 }, u: R() * 6 }));
  }
  for (const [bch, off, back, mend] of [
    [south, 3.5, 3.5, true],
    [south, 10.5, 4.6, false],
    [north, -3, 4, false],
  ] as const) {
    const p = make("fisher", 71 + off, adultScale(true));
    const at = onBeach(bch, -back, off);
    const w = who(p, "fisher", { home: { ...at, yaw: Math.atan2(bch.nx, bch.nz) }, mend });
    if (mend) hold(w, "net");
    people.push(w);
  }
  // Surfers carrying their boards along the sand (north of the boats), and out on the water beyond the surf.
  const BOARDS = ["#2a9d8f", "#c4383f", "#dda63c", "#3446a6"];
  for (let i = 0; i < surfers; i++) {
    const p = make(i === 0 ? "surfer" : "surferWoman", 81 + i * 2.3, adultScale(i === 0));
    const w = who(p, "surfer", { t0: 15 + i * 3, t1: 34 - i * 2, dir: i ? -1 : 1, t: 20 + i * 8, speed: 1.05 });
    hold(w, "board", BOARDS[i % BOARDS.length]);
    w.carry = "carry-hand";
    people.push(w);
  }
  const seaAt: Array<{ x: number; z: number; yaw: number; y: number }> = [];
  for (let i = 0; i < seaSurfers; i++) {
    const p = make(i === 0 ? "surfer" : "surferWoman", 85 + i * 1.7, adultScale(i === 0));
    p.lookRange = 0;
    const at = onBeach(south, 52 + i * 7, 20 + i * 9);
    const home = { ...at, yaw: Math.atan2(south.nx, south.nz) };
    people.push(who(p, "surfer-sea", { home, u: i * 2.1, board: i }));
    seaAt.push({ ...home, y: 0 });
  }
  // The beach vendor with his cool box, walking the sand above the waterline.
  {
    const p = make("manHat", 97, 1);
    const w = who(p, "beach-vendor", { t0: -26, t1: 30, dir: 1, t: 0, speed: 0.9, pause: 2 });
    hold(w, "cooler", "#e8eef2");
    people.push(w);
  }

  // ------------------------------------------------------------------ the boards out at sea (not held: floating)
  const boardGeo = (() => {
    // A surfboard along +Z, deck up (y 0 at its bottom).
    const g = new Geo();
    g.blob(0.25, 0.035, 0.95, 0, 0.03, 0, "#f2efe6", 1);
    g.blob(0.06, 0.034, 0.9, 0, 0.036, 0, "#2a9d8f", 1);
    g.blob(0.13, 0.033, 0.2, 0, 0.032, 0.62, "#2a9d8f", 1);
    return g.build();
  })();
  const boardMat = paintStrength(vertexToon(), 0);
  const boards = new THREE.InstancedMesh(boardGeo, boardMat, Math.max(1, seaSurfers));
  boards.name = "costa-gente:boards";
  boards.frustumCulled = false;
  boards.castShadow = true;
  env.scene.add(boards);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = "YXZ";

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  let playerT = -1;
  let tClock = 1;
  const rm = env.reducedMotion;
  const cam = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number) => {
    if (Math.hypot(x - cam.x, z - cam.z) > 110) return false;
    seenV.set(x, 1, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.2 && Math.abs(seenV.y) < 1.2;
  };
  const tgt = { x: 0, z: 0 };
  const vp = new THREE.Vector3();
  const vg = new THREE.Vector3();
  const frame: NpcFrame = { dt: 0, clock: 0, rm, avatar: new THREE.Vector3() };
  /** Drawn or not (far from the camera): the body and its props. */
  const draw = (w: Who, on: boolean) => {
    if (w.drawn === on) return;
    w.drawn = on;
    if (on) w.p.show();
    else w.p.hide();
  };
  /** Puts a road walker at road t in their lane. */
  const toLane = (w: Who) => {
    L.trail.pointAt(w.t, vp);
    L.trail.tangentAt(w.t, vg);
    laneTarget(vp.x, vp.z, vg.x, vg.z, w.dir, tgt);
    w.p.place(tgt.x, tgt.z, Math.atan2(vg.x * w.dir, vg.z * w.dir));
  };
  /** Moves a traveller round the player, out of sight; false if no hidden spot was found this frame. */
  const recycle = (w: Who, anywhere: boolean) => {
    for (const c of respawns(playerT, len, R(), R())) {
      L.trail.pointAt(c.t, vp);
      if (!anywhere && seen(vp.x, vp.z)) continue;
      w.t = c.t;
      w.dir = c.dir;
      toLane(w);
      return true;
    }
    return false;
  };
  /** One step of a road walker along t (lane, pauses); `bounded` turns them at t0 / t1, else at the road's ends. */
  const walkRoad = (w: Who, dt: number, bounded: boolean) => {
    const p = w.p;
    if (w.pause > 0) {
      w.pause -= dt;
      p.speed *= 0.9;
      p.resolve(0.5);
      return;
    }
    const step = 0.004;
    const ahead = Math.max(0, Math.min(1, w.t + w.dir * step));
    L.trail.pointAt(ahead, vp);
    L.trail.tangentAt(ahead, vg);
    laneTarget(vp.x, vp.z, vg.x, vg.z, w.dir, tgt);
    const d = p.seek(tgt.x, tgt.z, w.speed, dt, 3);
    if (d < 1.2) {
      w.t += w.dir * step;
      const lo = bounded ? w.t0 : 0.02;
      const hi = bounded ? w.t1 : 0.99;
      if (w.t > hi || w.t < lo) {
        w.dir = w.dir === 1 ? -1 : 1;
        w.t = Math.max(lo, Math.min(hi, w.t));
        w.pause = 2 + R() * 4;
      }
    }
  };

  // Dev hook (screenshots): where everyone is and what they are doing.
  if (import.meta.env?.DEV)
    (window as Window & { __costaPeople?: unknown }).__costaPeople = () =>
      people.map((w) => ({
        role: w.role,
        x: w.p.x,
        z: w.p.z,
        yaw: w.p.yaw,
        active: w.p.active,
        drawn: w.drawn,
        lod: w.p.member.lod,
        action: w.p.anim.action,
      }));

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      frame.dt = dt;
      frame.clock += dt;
      frame.avatar.copy(avatar);
      const clock = frame.clock;
      env.camera.getWorldPosition(cam);
      const isDayNow = isDay(env.sky.time());
      const first = day === null;
      day = isDayNow;
      // Where the player is along the road (a query twice a second is plenty).
      tClock += dt;
      if (tClock > 0.5 || playerT < 0) {
        tClock = 0;
        playerT = env.suyu.trailDistance(avatar.x, avatar.z).t;
      }
      for (const w of people) {
        const p = w.p;
        if (w.role === "traveller" && w.u < 0) {
          // First frame: spread round the player along the road, half of them in view.
          w.u = 0;
          const k = people.indexOf(w) % nTravellers;
          const off = ((k + 0.5) / nTravellers - 0.5) * 2 * 110;
          // Mirrored past the road's ends (arriving at the punku, they all start ahead).
          let t = playerT + off / len;
          if (t < 0.03 || t > 0.985) t = playerT - off / len;
          w.t = Math.max(0.03, Math.min(0.985, t));
          toLane(w);
        }
        if (p.active !== isDayNow && (first || !seen(p.x, p.z))) {
          p.setActive(isDayNow);
          w.drawn = isDayNow;
          if (isDayNow) {
            if (w.role === "walker" || w.role === "traveller") toLane(w);
            else if (w.role === "follow" && w.lead) p.place(w.lead.p.x, w.lead.p.z, w.lead.p.yaw);
            else if (w.role === "surfer" || w.role === "beach-vendor") {
              const at = onBeach(south, w.role === "surfer" ? -4.5 : -6.5, w.t);
              p.place(at.x, at.z, 0);
            } else p.place(w.home.x, w.home.z, w.home.yaw);
            // Out on the water nobody steps round them.
            if (w.role === "surfer-sea") p.body.solid = false;
          }
        }
        if (!p.active) continue;
        let floatY: number | null = null;
        switch (w.role) {
          case "walker":
            walkRoad(w, dt, true);
            break;
          case "traveller":
            if (strayed(w.t, playerT, len) && !seen(p.x, p.z)) recycle(w, false);
            walkRoad(w, dt, false);
            break;
          case "follow": {
            const l = w.lead?.p;
            if (!l) break;
            const fx = Math.sin(l.yaw);
            const fz = Math.cos(l.yaw);
            const sd = w.side ?? 1;
            const bk = w.back ?? 0.5;
            // Right of a facing f is (−fz, fx).
            const x = l.x - fx * bk - fz * sd;
            const z = l.z - fz * bk + fx * sd;
            const d = Math.hypot(x - p.x, z - p.z);
            p.seek(x, z, Math.min(2.4, (w.lead?.speed ?? 1) * (d > 1.2 ? 1.6 : 1)), dt, 5);
            if (d < 0.3 && l.speed < 0.2)
              p.yaw += Math.atan2(Math.sin(l.yaw - p.yaw), Math.cos(l.yaw - p.yaw)) * dt * 2;
            break;
          }
          case "kid": {
            // Down to the water after the backwash, back up when the wave comes in.
            w.u += dt;
            const r = shoreRun(w.u, rm);
            p.seek(
              w.home.x + south.nx * r.out - south.nz * r.along,
              w.home.z + south.nz * r.out + south.nx * r.along,
              w.speed,
              dt,
              5,
            );
            break;
          }
          case "surfer":
          case "beach-vendor": {
            // To and fro along the sand; the vendor stops now and then to call out.
            if (w.pause > 0) {
              w.pause -= dt;
              p.speed *= 0.9;
              p.resolve(0.5);
              if (w.role === "beach-vendor") p.face(cam.x, cam.z, dt, 2);
              break;
            }
            const at = onBeach(south, w.role === "surfer" ? -4.5 : -6.5, w.t + w.dir * 1.5);
            if (p.seek(at.x, at.z, w.speed, dt, 3) < 1.2) {
              w.t += w.dir * 1.5;
              if (w.t > w.t1 || w.t < w.t0) {
                w.dir = w.dir === 1 ? -1 : 1;
                w.pause = 2 + R() * 3;
              } else if (w.role === "beach-vendor" && R() < 0.12) w.pause = 3 + R() * 2;
            }
            break;
          }
          case "surfer-sea": {
            // Sitting astride the board beyond the surf, riding the swell, turning a little.
            const tt = rm ? 0 : clock;
            const yaw = w.home.yaw + Math.sin(tt * 0.2 + w.u) * 0.5;
            p.place(w.home.x, w.home.z, yaw);
            p.speed = 0;
            floatY = seaHeight(w.home.x, w.home.z, L.shoreX(w.home.z) - w.home.x, tt);
            const s = seaAt[w.board ?? 0];
            if (s) {
              s.yaw = yaw;
              s.y = floatY;
            }
            break;
          }
          default:
            p.place(w.home.x, w.home.z, w.home.yaw);
            p.speed = 0;
            p.resolve(0);
            p.x = w.home.x;
            p.z = w.home.z;
        }
        p.y = floatY ?? ground(p.x, p.z);
        const near = Math.hypot(p.x - cam.x, p.z - cam.z) < VIEW;
        draw(w, near);
        if (!near) continue;
        // ------------------------------------------------------------ what they do (the walk cycle follows the speed)
        switch (w.role) {
          case "vendor":
            p.anim.act("hands-clasp", { fade: 0.4 });
            break;
          case "fisher":
            // One mends a net (head down, hands working), the others stand with arms crossed looking about.
            p.anim.act(w.mend ? "knit" : "arms-crossed", { fade: 0.4 });
            break;
          case "surfer-sea":
            // Astride the board, legs down in the water: the seat sits on the deck.
            p.lift = SEA_SEAT;
            p.anim.act("ride", { fade: 0 });
            break;
          case "beach-vendor":
            // Calling out with a raised arm (the left: the cool box hangs at the right hip).
            p.anim.act(w.pause > 0 && p.speed < 0.2 ? "wave" : "none", { side: -1, fade: 0.35 });
            break;
          default:
            p.anim.act(w.carry, { side: 1 });
        }
        p.commit(frame);
      }
      // The boards under the surfers at sea.
      for (const w of people) {
        if (w.board === undefined) continue;
        const s = seaAt[w.board] as (typeof seaAt)[number];
        const on = w.p.active && w.drawn;
        dummy.position.set(s.x, s.y - 0.02, s.z);
        dummy.rotation.set(rm ? 0 : Math.sin(clock * 0.9 + w.u) * 0.04, s.yaw, 0);
        dummy.scale.setScalar(on ? 1 : 0);
        dummy.updateMatrix();
        boards.setMatrixAt(w.board, dummy.matrix);
      }
      boards.instanceMatrix.needsUpdate = true;
      shared.frame(env.camera);
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __costaPeople?: unknown }).__costaPeople;
      for (const w of people) w.p.dispose();
      shared.release();
      boards.removeFromParent();
      boardGeo.dispose();
      boardMat.dispose();
    },
  };
};
