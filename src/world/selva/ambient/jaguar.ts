/**
 * Otorongo (jaguar, Panthera onca): night only and rare, never a threat.
 *  - Crossing: well ahead of the traveler (≈ 26–34 u, away from the station plazas and the canopy walkway),
 *    a jaguar walks out of the forest and across the road. In the middle of the road it stops, turns its
 *    head to look back at the traveler (eyes shining green-gold in the light), holds the look for a couple
 *    of seconds, then goes on at an easy trot into the forest on the other side and is gone.
 *  - Sandbar: seen from a landing or the canoe, one walks the length of a sandbar along the water, stops to
 *    look across at the traveler, and slips away into the river shadows at the end of the bar.
 * If the traveler closes in (≈ 10 u, more when running) it turns away at once and trots off; it never comes
 * toward the traveler. The first sighting comes within a minute or so of walking at night; after that, every
 * minute or two until the passport has its stamp, then only every few minutes.
 *
 * Rendering: the shared animal core (species "jaguar", one skinned animal, wild/beasts.ts solo: painted
 * rosettes, a calm round-pupil eye; walk and trot from the speed, the head turned by `look`) + the eyeshine
 * dots at the head bone, drawn only while the eyes catch the light → 2 draw calls, both hidden while no
 * jaguar is out. Body ("jaguar"): solid while on show (give 0.25: it
 * holds its line; the traveler slides around it), parked otherwise.
 * Stamp `selva:fauna:jaguar` after a ~1.5 s good look within 34 u.
 */
import * as THREE from "three";
import { loadPassport } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures, park } from "../../creatures";
import { on } from "../../events";
import { CANOPY_T, SELVA_STATIONS } from "../contract";
import { createBeasts } from "./wild/beasts";
import { type Bar, barF, barPoint, barY, devHook, Eyes, idle, Spotter, sandbars, selvaOf } from "./wild/kit";
import { damp, jaguarHours, nightAmount, quietT, rng, roadFrame, turnToward, wrapAngle } from "./wild/logic";

/** The eyes in the head bone's frame (bind frame: +Z forward, +Y up), and the eyeshine dot radius. */
const EYES = [new THREE.Vector3(0.075, 0.035, 0.13), new THREE.Vector3(-0.075, 0.035, 0.13)];
const EYE_R = 0.022;

type State = "away" | "walk" | "look" | "leave";

const STATION_T = SELVA_STATIONS.map((s) => s.t);

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const rm = env.reducedMotion;
  const R = rng(1709);
  const set = createBeasts(env, "jaguar", 1, { solo: true });
  const eyes = new Eyes(env, "selva-fauna-jaguar-eyes", 2, "#3a2a12", "#d8f27a");
  const root = set.group;
  root.add(eyes.mesh);
  env.scene.add(root);
  const body = creatures.add("jaguar", 0.6, { solid: false, give: 0.25 });
  park(body);

  const stamped = (() => {
    try {
      return !!loadPassport().stamps["selva:fauna:jaguar"];
    } catch {
      return false;
    }
  })();
  const spot = new Spotter(env, "jaguar", 34);
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  const cat = {
    state: "away" as State,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    /** Walk from (ax, az) to (bx, bz); the look happens at (lx, lz). */
    bx: 0,
    bz: 0,
    lx: 0,
    lz: 0,
    looked: false,
    bar: null as Bar | null,
    timer: 0,
    walked: 0,
    unseen: 0,
    speed: 0,
    headYaw: 0,
  };
  // Cool-down before the next sighting (s of night walking), shorter until the stamp is in the passport.
  let cool = 25 + R() * 20;
  let trackT = 0;
  let trackLast = -1;
  let trackDir = 1;
  let trackClock = 1;
  let clock = 0;
  let stampedNow = stamped;
  const offStamp = on("world:stamp", (d) => {
    if (d?.id === "selva:fauna:jaguar") stampedNow = true;
  });
  const offDev = devHook("jaguar", () => ({ state: cat.state, x: cat.x, z: cat.z, cool, bar: !!cat.bar }));
  // Dev: `__selvaFauna.jaguarSoon()` brings the next sighting forward (screenshots).
  const offDevSoon = devHook("jaguarSoon", () => {
    cool = 0;
    return true;
  });
  const m4 = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const headDir = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  const groundY = (x: number, z: number) => {
    if (cat.bar) {
      const f = barF(cat.bar, x, z);
      if (f < 1) return Math.max(L.heightAt(x, z), barY(lv, f));
    }
    return L.heightAt(x, z);
  };

  /** A crossing well ahead on a quiet stretch of road; false if none fits right now. */
  const startCrossing = () => {
    for (let k = 0; k < 6; k++) {
      const ahead = 26 + R() * 8;
      const t = trackT + (trackDir * ahead) / L.trail.length;
      if (!quietT(t, STATION_T, CANOPY_T, 0.04)) continue;
      const f = roadFrame(L, t);
      const side = R() < 0.5 ? -1 : 1;
      // It starts deep in the undergrowth (16 u off the road: the forest hides it appearing there).
      const ax = f.x + f.rx * side * 16;
      const az = f.z + f.rz * side * 16;
      const bx = f.x - f.rx * side * 16;
      const bz = f.z - f.rz * side * 16;
      if (L.isWater(ax, az) || L.isWater(bx, bz) || creatures.inKeepOut(f.x, f.z, 2)) continue;
      cat.bar = null;
      Object.assign(cat, { x: ax, z: az, bx, bz, lx: f.x, lz: f.z, looked: false });
      cat.y = L.heightAt(ax, az);
      cat.yaw = Math.atan2(bx - ax, bz - az);
      return true;
    }
    return false;
  };

  /** A sandbar walk within sight of the traveler (from a landing or the canoe), if one is near. */
  const startBar = (av: THREE.Vector3) => {
    for (const b of sandbars(env)) {
      const d = Math.hypot(b.x - av.x, b.z - av.z);
      if (d < 18 || d > 48) continue;
      const s = R() < 0.5 ? -1 : 1;
      const a = barPoint(b, s * 0.85, 0);
      const e = barPoint(b, -s * 0.85, 0);
      if (spot.view.sees(a.x, lv + 0.6, a.z, 1.2) && Math.hypot(a.x - av.x, a.z - av.z) < 30) continue;
      cat.bar = b;
      Object.assign(cat, { x: a.x, z: a.z, bx: e.x, bz: e.z, lx: b.x, lz: b.z, looked: false });
      cat.y = groundY(a.x, a.z);
      cat.yaw = Math.atan2(e.x - a.x, e.z - a.z);
      return true;
    }
    return false;
  };

  const leave = (av: THREE.Vector3) => {
    // Off the way it was going (never toward the traveler), into the forest or the river shadows.
    const ax = cat.x - av.x;
    const az = cat.z - av.z;
    const al = Math.hypot(ax, az) || 1;
    let dx = cat.bx - cat.x;
    let dz = cat.bz - cat.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx = dx / dl + (ax / al) * 0.6;
    dz = dz / dl + (az / al) * 0.6;
    const l = Math.hypot(dx, dz) || 1;
    cat.bx = cat.x + (dx / l) * 25;
    cat.bz = cat.z + (dz / l) * 25;
    cat.state = "leave";
    cat.walked = 0;
  };

  const goAway = () => {
    cat.state = "away";
    cat.bar = null;
    park(body);
    cool = (stampedNow ? 120 : 45) + R() * (stampedNow ? 120 : 40);
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const nightK = nightAmount(time);
      trackClock += dt;
      if (trackClock > 0.4) {
        const t = L.trail.nearestT(avatar.x, avatar.z);
        if (trackLast >= 0 && Math.abs(t - trackLast) > 0.0004) trackDir = t > trackLast ? 1 : -1;
        trackLast = t;
        trackT = t;
        trackClock = 0;
      }
      spot.begin();
      const mot = rm ? 0.7 : 1;
      const d = Math.hypot(cat.x - avatar.x, cat.z - avatar.z);
      const toAv = Math.atan2(avatar.x - cat.x, avatar.z - cat.z);
      let speed = 0;
      let lookAt = false;

      if (cat.state === "away") {
        if (jaguarHours(time) && !inside) cool -= dt;
        if (cool <= 0) {
          // At a landing or in the canoe a sandbar walk fits better; on the road, a crossing.
          const onRoad = L.trailQuery(avatar.x, avatar.z).d < 4;
          // (From the road the river bars are hidden behind the forest: only crossings there.)
          const ok = onRoad ? startCrossing() : startBar(avatar) || startCrossing();
          if (ok) {
            cat.state = "walk";
            cat.walked = 0;
            cat.unseen = 0;
          } else cool = 3;
        }
      } else if (!jaguarHours(time) || inside) {
        if (cat.state !== "leave") leave(avatar);
      }

      if (cat.state !== "away") {
        const seen = spot.view.sees(cat.x, cat.y + 0.6, cat.z, 1.4) && spot.view.dist(cat.x, cat.y, cat.z) < 80;
        cat.unseen = seen ? 0 : cat.unseen + dt;
        const tooClose = d < (cat.state === "look" ? 12 : 10);
        switch (cat.state) {
          case "walk": {
            speed = 1.35 * mot;
            if (tooClose) {
              leave(avatar);
              break;
            }
            // At the middle (road center / bar center), stop and look back if the traveler is in sight range.
            if (!cat.looked && Math.hypot(cat.lx - cat.x, cat.lz - cat.z) < 1 && d < 40) {
              cat.state = "look";
              cat.looked = true;
              cat.timer = 2.4;
            }
            if (Math.hypot(cat.bx - cat.x, cat.bz - cat.z) < 0.6) leave(avatar);
            break;
          }
          case "look": {
            lookAt = true;
            cat.timer -= dt;
            if (cat.timer <= 0 || tooClose) {
              cat.state = "walk";
              if (tooClose) leave(avatar);
            }
            break;
          }
          case "leave": {
            speed = (d < 14 ? 3 : 2.2) * mot;
            cat.walked += speed * dt;
            if ((cat.unseen > 0.8 && cat.walked > 4) || cat.walked > 30) goAway();
            break;
          }
        }
        if ((cat.state as State) !== "away") {
          if (speed > 0) {
            cat.yaw = turnToward(cat.yaw, Math.atan2(cat.bx - cat.x, cat.bz - cat.z), 2.2 * dt);
            let nx = cat.x + Math.sin(cat.yaw) * speed * dt;
            let nz = cat.z + Math.cos(cat.yaw) * speed * dt;
            // On a bar, walking off its end means slipping into the river: let it, but sink from view.
            if (!cat.bar && L.isWater(nx, nz)) {
              cat.yaw += 1.5 * dt;
              nx = cat.x;
              nz = cat.z;
            }
            cat.x = nx;
            cat.z = nz;
          }
          cat.speed = damp(cat.speed, speed, 5, dt);
          const g = groundY(cat.x, cat.z);
          // In the river at the end of a bar: swimming low, gone a moment later.
          cat.y = damp(cat.y, Math.max(g, lv - 0.55), 10, dt);
          body.solid = g > lv;
          body.x = cat.x;
          body.z = cat.z;
          if (body.solid && creatures.resolve(body, (x, z) => !L.isWater(x, z), 0.06)) {
            cat.x = body.x;
            cat.z = body.z;
          }
          // Head: on the traveler during the look (and a glance while close), else forward and low.
          const rel = Math.max(-1.3, Math.min(1.3, wrapAngle(toAv - cat.yaw)));
          cat.headYaw = damp(cat.headYaw, lookAt || d < 18 ? rel : 0, lookAt ? 3 : 2, dt);
          set.begin();
          if (!inside)
            set.put(0, cat.x, cat.y, cat.z, cat.yaw, {
              speed: cat.speed,
              rm,
              look: lookAt || d < 18 ? cat.headYaw : undefined,
              mode: cat.y < g - 0.2 ? "swim" : "auto",
            });
          set.end(dt, clock, env.camera);
          // Eyeshine when the head faces the camera (dots over the painted eyes, only while they glint).
          let ne = 0;
          if (set.boneMatrix(0, "head", m4)) {
            eye.copy(EYES[0] as THREE.Vector3).applyMatrix4(m4);
            toCam.subVectors(spot.view.cam, eye);
            const dc = toCam.length();
            headDir.set(0, 0, 1).transformDirection(m4);
            const facing = dc > 0 ? headDir.dot(toCam) / dc : 0;
            const glint = nightK * THREE.MathUtils.smoothstep(facing, 0.4, 0.9);
            const size = EYE_R * (1 + glint * Math.min(1.6, dc / 16));
            if (glint > 0.05)
              for (const e of EYES) {
                eye.copy(e).applyMatrix4(m4);
                eyes.set(ne++, eye, size, glint);
              }
          }
          eyes.commit(ne);
          // Only a look in the open counts (on the road, on a bar, or the pause to look back): the frustum test
          // cannot tell a cat still hidden in the undergrowth from one in plain sight.
          const open = cat.state === "look" || cat.bar !== null || L.trailQuery(cat.x, cat.z).d < 4;
          if (open) spot.see(cat.x, cat.y + 0.7, cat.z, avatar.x, avatar.z, 1);
        }
      }
      if (cat.state === "away") {
        set.begin();
        set.end(dt, clock, env.camera);
        eyes.commit(0);
      }
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offStamp();
      offDev();
      offDevSoon();
      creatures.remove(body);
      set.dispose();
      eyes.dispose();
      root.removeFromParent();
    },
  };
};
