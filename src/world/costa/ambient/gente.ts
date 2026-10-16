/**
 * People of the coast, on the mountain's instanced bipeds (../../ambient/people: one InstancedMesh per body part
 * for all of them) dressed for the coast with ./gente/clothes.ts (cotton shirts, blouses with aprons, straw
 * hats, surfboards, a vendor's cool box), so the mountain's people keep their highland dress:
 *  - walkers on the road, each going to and fro along a stretch between two stations (keeping to the right of
 *    the road), stepping round the traveler and each other through the shared creatures registry;
 *  - travellers of the whole road, in both directions, some with a cloth bundle on the back or a basket in
 *    hand: whoever falls far behind the traveler is moved, out of sight, to the road some way ahead or behind
 *    them (./gente/logic.ts `strayed` / `respawns`), so wherever the traveler is people come and go;
 *  - families (two parents and a child, or a parent and two children) strolling between the last huaca, the
 *    Huanchaco market and the north beach, the others keeping beside the one in front;
 *  - the market woman behind the middle stall of the Huanchaco market, looking round at passers-by;
 *  - on the Huanchaco beach: children chasing the waves, fishermen by their drying caballitos (one mending a
 *    net, one more on the north beach), surfers carrying their boards along the sand and two more sitting on
 *    their boards beyond the surf, rising and falling with the swell, and a vendor walking the sand with a cool
 *    box, stopping now and then to call out with a raised arm.
 * By day only: at dusk they go home and at dawn they come back, both only while unseen (or at once on the first
 * frame), so nobody vanishes in view. Anyone far from the camera is not drawn. About a dozen draw calls (the
 * crowd's parts; only the parts someone in view wears).
 */
import * as THREE from "three";
import { type PartName, partSpecs, SHADOW_PARTS } from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, type Palette, paletteMaterial } from "../../ambient/people/rig";
import type { Ambient, CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import { rng } from "../kit";
import type { CostaLayout } from "../layout";
import { BEACHES, COSTA_STATIONS, STATION } from "../plan";
import { seaHeight } from "../scenery/waves";
import { APRONS, BLOUSES, COAST_SKINS, type CoastPart, coastSpecs, SHIRTS, SKIRTS, TROUSERS } from "./gente/clothes";
import { isDay, laneTarget, respawns, shoreRun, strayed } from "./gente/logic";
import { toWorld } from "./huacas/logic";
import { STALLS } from "./huacas/market";

type Wear = PartName | CoastPart;
const MAN: Wear[] = ["leg", "c:shirt", "c:arm", "m:head"];
const WOMAN: Wear[] = ["leg", "w:skirt", "c:blouse", "c:arm", "w:head"];

type Role = "walker" | "traveller" | "follow" | "vendor" | "kid" | "fisher" | "surfer" | "surfer-sea" | "beach-vendor";
interface Who {
  p: Person;
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
  /** A fisherman mending a net (bent over, hands working). */
  mend?: boolean;
  /** Family member: who they keep beside, and where (metres to the leader's right, behind). */
  lead?: Who;
  side?: number;
  back?: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const R = rng(0x9e7e);
  const pick = <T>(a: readonly T[]) => a[Math.floor(R() * a.length) % a.length] as T;
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
  const cap =
    nWalkers +
    nTravellers +
    nKids +
    1 +
    3 +
    surfers +
    seaSurfers +
    1 +
    families.reduce((a, [, , m]) => a + 1 + m.length, 0);

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const specs = [...partSpecs(["leg", "m:head", "w:head", "w:skirt", "bundle", "basket"]), ...coastSpecs()];
  const crowd = new Crowd(specs, cap, mat, new Set([...SHADOW_PARTS, "c:shirt", "c:blouse"]));
  env.scene.add(crowd.group);

  const make = (man: boolean, kid: boolean, seed: number, hat: boolean, extra: Wear[] = []): Person => {
    const wear = [...(man ? MAN : WOMAN), ...(hat ? (["c:hat"] as const) : []), ...extra];
    const palette: Palette = man
      ? [pick(COAST_SKINS), pick(SHIRTS), pick(APRONS), pick(TROUSERS)]
      : [pick(COAST_SKINS), pick(BLOUSES), pick(APRONS), pick(SKIRTS)];
    // The rig's types list the mountain's parts; the coast's crowd also has its own (same Crowd API).
    return new Person({
      kind: kid ? "costa-kid" : "costa-person",
      crowd,
      idx: crowd.alloc(),
      wear: wear as unknown as PartName[],
      palette,
      scale: kid ? 0.6 + R() * 0.08 : man ? 0.98 + R() * 0.06 : 0.93 + R() * 0.05,
      headScale: kid ? 1.3 : 1,
      radius: kid ? 0.26 : 0.34,
      seed,
    });
  };
  const who = (p: Person, role: Role, o: Partial<Who> = {}): Who => ({
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
    ...o,
  });

  const people: Who[] = [];
  // ------------------------------------------------------------------ walkers (stretches between stations)
  const stops = [...COSTA_STATIONS].sort((a, b) => a.t - b.t);
  for (let i = 0; i < nWalkers; i++) {
    const k = Math.floor(R() * (stops.length - 1));
    const a = (stops[k] as (typeof stops)[number]).t + 0.012;
    const b = (stops[k + 1] as (typeof stops)[number]).t - 0.012;
    const p = make(i % 3 !== 1, false, 11 + i * 7.3, R() < 0.6);
    const t = a + R() * Math.max(0.001, b - a);
    people.push(who(p, "walker", { t0: a, t1: b, dir: R() < 0.5 ? 1 : -1, t, speed: 1 + R() * 0.3, pause: R() * 3 }));
  }
  // ------------------------------------------------------------------ travellers of the whole road
  for (let i = 0; i < nTravellers; i++) {
    const man = i % 2 === 0;
    const load: Wear[] = R() < 0.55 ? ["bundle"] : !man && R() < 0.6 ? ["basket"] : [];
    const p = make(man, false, 23 + i * 4.1, R() < 0.7, load);
    // Placed round the player on the first frame (u < 0 marks "not placed yet").
    people.push(who(p, "traveller", { dir: R() < 0.5 ? 1 : -1, speed: 1.15 + R() * 0.3, u: -1 }));
  }
  // ------------------------------------------------------------------ families
  for (const [t0, t1, members] of families) {
    const t = t0 + R() * (t1 - t0);
    const lead = who(make(true, false, 61 + t0 * 10, true), "walker", {
      t0,
      t1,
      dir: R() < 0.5 ? 1 : -1,
      t,
      speed: 0.85,
      pause: 0,
    });
    people.push(lead);
    members.forEach((kid, j) => {
      const p = make(kid ? R() < 0.5 : false, kid, 67 + t0 * 10 + j, false);
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
    const p = make(false, false, 91, true);
    p.body.solid = false;
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
    const p = make(i % 2 === 0, true, 51 + i * 3.1, false);
    // Along the shore, a few metres apart, south of the boats.
    const at = onBeach(south, -3, -10 - i * 4);
    people.push(who(p, "kid", { speed: 2.3 + R() * 0.5, pause: R() * 2, home: { ...at, yaw: 0 }, u: R() * 6 }));
  }
  for (const [bch, off, back, mend] of [
    [south, 3.5, 3.5, true],
    [south, 10.5, 4.6, false],
    [north, -3, 4, false],
  ] as const) {
    const p = make(true, false, 71 + off, true);
    const at = onBeach(bch, -back, off);
    people.push(who(p, "fisher", { home: { ...at, yaw: Math.atan2(bch.nx, bch.nz) }, mend }));
  }
  // Surfers carrying their boards along the sand (north of the boats), and out on the water beyond the surf.
  for (let i = 0; i < surfers; i++) {
    const p = make(i === 0, false, 81 + i * 2.3, false, ["c:board"]);
    people.push(who(p, "surfer", { t0: 15 + i * 3, t1: 34 - i * 2, dir: i ? -1 : 1, t: 20 + i * 8, speed: 1.05 }));
  }
  for (let i = 0; i < seaSurfers; i++) {
    const p = make(i === 0, false, 85 + i * 1.7, false, ["c:board"]);
    const at = onBeach(south, 52 + i * 7, 20 + i * 9);
    people.push(who(p, "surfer-sea", { home: { ...at, yaw: Math.atan2(south.nx, south.nz) }, u: i * 2.1 }));
  }
  // The beach vendor with his cool box, walking the sand above the waterline.
  {
    const p = make(true, false, 97, true, ["c:cooler"]);
    people.push(who(p, "beach-vendor", { t0: -26, t1: 30, dir: 1, t: 0, speed: 0.9, pause: 2 }));
  }

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  let clock = 0;
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

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
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
        const far = Math.hypot(p.x - cam.x, p.z - cam.z) > 140;
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
            // Sitting on the board beyond the surf, riding the swell, turning a little.
            const tt = rm ? 0 : clock;
            const yaw = w.home.yaw + Math.sin(tt * 0.2 + w.u) * 0.5;
            p.place(w.home.x, w.home.z, yaw);
            p.speed = 0;
            floatY = seaHeight(w.home.x, w.home.z, L.shoreX(w.home.z) - w.home.x, tt);
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
        if (far) {
          p.hide();
          continue;
        }
        p.rest(clock, rm);
        const b = p.bones;
        if (w.role === "vendor" || w.role === "fisher") {
          if (!rm) b.head.rotation.y = Math.sin(clock * 0.4 + p.seed) * 0.5;
          if (w.mend) {
            // Mending a net: bent forward, hands working.
            b.torso.rotation.x = 0.35;
            b.armL.rotation.x = -0.9 + (rm ? 0 : Math.sin(clock * 3) * 0.15);
            b.armR.rotation.x = -0.9 + (rm ? 0 : Math.sin(clock * 3 + 1) * 0.15);
          }
        } else if (w.role === "surfer-sea") {
          // Straddling the board: legs down in the water, hands on the deck, looking out to sea.
          b.hips.position.y = -0.47;
          b.legL.rotation.set(-0.35, 0, 0.55);
          b.legR.rotation.set(-0.35, 0, -0.55);
          b.armL.rotation.set(-0.25, 0, 0.45);
          b.armR.rotation.set(-0.25, 0, -0.45);
          b.tool.position.set(0, 0.54 / p.scale - 0.065, -0.12);
          if (!rm) b.torso.rotation.z = Math.sin(clock * 0.9 + w.u) * 0.04;
        } else {
          p.gait(dt, rm, w.role === "surfer" ? 0.5 : 1);
          if (w.role === "surfer") {
            // The board under the right arm, on its edge, nose forward.
            b.armR.rotation.set(-0.1, 0, -0.32);
            b.tool.position.set(-0.36, 0.6, 0.05);
            b.tool.rotation.set(0, 0, Math.PI / 2);
          } else if (w.role === "beach-vendor" && w.pause > 0 && p.speed < 0.2) {
            // Calling out with a raised arm.
            b.armL.rotation.set(-2.6 + (rm ? 0 : Math.sin(clock * 4) * 0.15), 0, 0.2);
          }
        }
        p.commit();
      }
      crowd.flush();
    },
    dispose() {
      for (const w of people) w.p.dispose();
      crowd.dispose();
      mat.dispose();
    },
  };
};
