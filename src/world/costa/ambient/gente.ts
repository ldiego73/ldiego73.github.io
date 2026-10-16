/**
 * People of the coast, on the mountain's instanced bipeds (../../ambient/people: one InstancedMesh per body part
 * for all of them) dressed for the coast with ./gente/clothes.ts (cotton shirts, blouses with aprons, straw
 * hats), so the mountain's people keep their highland dress:
 *  - walkers on the road, each going to and fro along a stretch between two stations (keeping to the right of
 *    the road), stepping round the traveler and each other through the shared creatures registry;
 *  - the market woman behind the middle stall of the Huanchaco market, looking round at passers-by;
 *  - children chasing the waves at the edge of the south beach, running down after the backwash and back up;
 *  - fishermen by their drying caballitos on both beaches, one mending a net.
 * By day only: at dusk they go home (switched off while unseen, or at once on the first frame), at dawn they
 * come back. Anyone far from the camera is not drawn. About ten draw calls (the crowd's parts).
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
import { APRONS, BLOUSES, COAST_SKINS, type CoastPart, coastSpecs, SHIRTS, SKIRTS, TROUSERS } from "./gente/clothes";
import { isDay, laneTarget, shoreRun } from "./gente/logic";
import { toWorld } from "./huacas/logic";
import { STALLS } from "./huacas/market";

const MAN: Array<PartName | CoastPart> = ["leg", "c:shirt", "c:arm", "m:head"];
const WOMAN: Array<PartName | CoastPart> = ["leg", "w:skirt", "c:blouse", "c:arm", "w:head"];

type Role = "walker" | "vendor" | "kid" | "fisher";
interface Who {
  p: Person;
  role: Role;
  /** Walker: road stretch [t0, t1] and direction. Kid / fisher / vendor: their spot. */
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
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const R = rng(0x9e7e);
  const pick = <T>(a: readonly T[]) => a[Math.floor(R() * a.length) % a.length] as T;
  const high = env.quality === "high";
  const ground = env.suyu.groundAt;
  const nWalkers = high ? 7 : 4;
  const nKids = 3;

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const specs = [...partSpecs(["leg", "m:head", "w:head", "w:skirt"]), ...coastSpecs()];
  const crowd = new Crowd(specs, nWalkers + nKids + 4, mat, new Set([...SHADOW_PARTS, "c:shirt", "c:blouse"]));
  env.scene.add(crowd.group);

  const make = (man: boolean, kid: boolean, seed: number, hat: boolean): Person => {
    const wear = [...(man ? MAN : WOMAN), ...(hat ? (["c:hat"] as const) : [])];
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

  const people: Who[] = [];
  // ------------------------------------------------------------------ walkers (stretches between stations)
  const stops = [...COSTA_STATIONS].sort((a, b) => a.t - b.t);
  for (let i = 0; i < nWalkers; i++) {
    const k = Math.floor(R() * (stops.length - 1));
    const a = (stops[k] as (typeof stops)[number]).t + 0.012;
    const b = (stops[k + 1] as (typeof stops)[number]).t - 0.012;
    const man = i % 3 !== 1;
    const p = make(man, false, 11 + i * 7.3, R() < 0.6);
    const t = a + R() * Math.max(0.001, b - a);
    people.push({
      p,
      role: "walker",
      t0: a,
      t1: b,
      dir: R() < 0.5 ? 1 : -1,
      t,
      speed: 1 + R() * 0.3,
      pause: R() * 3,
      home: { x: 0, z: 0, yaw: 0 },
      u: 0,
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
    people.push({
      p,
      role: "vendor",
      t0: 0,
      t1: 0,
      dir: 1,
      t: 0,
      speed: 0,
      pause: 0,
      home: { x: at.x, z: at.z, yaw: sf.yaw },
      u: 0,
    });
  }
  // ------------------------------------------------------------------ beaches: kids and fishermen
  const beach = (t: number) => {
    const bp = L.beachPoint(t);
    const dsx = L.shoreX(bp.z + 2) - L.shoreX(bp.z - 2);
    const l = Math.hypot(4, dsx) || 1;
    return { x: bp.x, z: bp.z, nx: -4 / l, nz: dsx / l };
  };
  const south = beach(BEACHES.south);
  const north = beach(BEACHES.north);
  for (let i = 0; i < nKids; i++) {
    const p = make(i % 2 === 0, true, 51 + i * 3.1, false);
    // Along the shore, a few metres apart, south of the boats.
    const off = -10 - i * 4;
    const x = south.x - south.nx * 3 + -south.nz * off;
    const z = south.z - south.nz * 3 + south.nx * off;
    people.push({
      p,
      role: "kid",
      t0: 0,
      t1: 0,
      dir: 1,
      t: 0,
      speed: 2.3 + R() * 0.5,
      pause: R() * 2,
      home: { x, z, yaw: 0 },
      u: R() * 6,
    });
  }
  for (const [bch, off, back, mend] of [
    [south, 3.5, 3.5, true],
    [south, 10.5, 4.6, false],
    [north, -3, 4, false],
  ] as const) {
    const p = make(true, false, 71 + off, true);
    const x = bch.x - bch.nx * back + -bch.nz * off;
    const z = bch.z - bch.nz * back + bch.nx * off;
    const yaw = Math.atan2(bch.nx, bch.nz);
    people.push({ p, role: "fisher", t0: 0, t1: 0, dir: 1, t: 0, speed: 0, pause: 0, home: { x, z, yaw }, u: 0, mend });
  }

  // ------------------------------------------------------------------ frame
  let day: boolean | null = null;
  let clock = 0;
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

  return {
    update(dtIn) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(cam);
      const isDayNow = isDay(env.sky.time());
      const flipped = day !== isDayNow;
      day = isDayNow;
      for (const w of people) {
        const p = w.p;
        if (p.active !== isDayNow && (flipped || !seen(p.x, p.z))) {
          p.setActive(isDayNow);
          if (isDayNow) {
            if (w.role === "walker") {
              const pt = L.trail.pointAt(w.t);
              p.place(pt.x, pt.z, 0);
            } else p.place(w.home.x, w.home.z, w.home.yaw);
          }
        }
        if (!p.active) continue;
        const far = Math.hypot(p.x - cam.x, p.z - cam.z) > 140;
        if (w.role === "walker") {
          if (w.pause > 0) {
            w.pause -= dt;
            p.speed *= 0.9;
            p.resolve(0.5);
          } else {
            const ahead = Math.max(0, Math.min(1, w.t + w.dir * 0.004));
            L.trail.pointAt(ahead, vp);
            L.trail.tangentAt(ahead, vg);
            laneTarget(vp.x, vp.z, vg.x, vg.z, w.dir, tgt);
            const d = p.seek(tgt.x, tgt.z, w.speed, dt, 3);
            if (d < 1.2) {
              w.t += w.dir * 0.004;
              if (w.t > w.t1 || w.t < w.t0) {
                w.dir = w.dir === 1 ? -1 : 1;
                w.t = Math.max(w.t0, Math.min(w.t1, w.t));
                w.pause = 2 + R() * 4;
              }
            }
          }
        } else if (w.role === "kid") {
          // Down to the water after the backwash, back up when the wave comes in.
          w.u += dt;
          const r = shoreRun(w.u, rm);
          const x = w.home.x + south.nx * r.out + -south.nz * r.along;
          const z = w.home.z + south.nz * r.out + south.nx * r.along;
          p.seek(x, z, w.speed, dt, 5);
        } else {
          p.place(w.home.x, w.home.z, w.home.yaw);
          p.speed = 0;
          p.resolve(0);
          p.x = w.home.x;
          p.z = w.home.z;
        }
        p.y = ground(p.x, p.z);
        if (far) {
          p.hide();
          continue;
        }
        p.rest(clock, rm);
        if (w.role === "vendor" || w.role === "fisher") {
          const b = p.bones;
          if (!rm) b.head.rotation.y = Math.sin(clock * 0.4 + p.seed) * 0.5;
          if (w.mend) {
            // Mending a net: bent forward, hands working.
            b.torso.rotation.x = 0.35;
            b.armL.rotation.x = -0.9 + (rm ? 0 : Math.sin(clock * 3) * 0.15);
            b.armR.rotation.x = -0.9 + (rm ? 0 : Math.sin(clock * 3 + 1) * 0.15);
          }
        } else p.gait(dt, rm);
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
