/**
 * The lake's birds (field guide: ../wildlife.ts), on the shared animal core (../../characters/animals: one
 * continuous skinned body per bird, a flock = one instanced draw per LOD, the flight state machine reading the
 * motion this ambient gives it):
 *  - Titicaca grebes (zambullidor, Rollandia microptera): flightless, they float in the reed beds along the
 *    shore and round the Uros islands, paddling about their patch; every so often, or when the traveler comes
 *    within a few metres, one dives and comes up a few metres off some seconds later.
 *  - Andean flamingos (parihuana, Phoenicoparrus andinus): a flock wading in the shallow bay between Taquile and
 *    the Isla del Sol, heads down sweeping the water for food, walking on slowly; now and then one lifts its
 *    head and spreads its wings (black flight feathers); they walk away from a traveler who comes close.
 *  - Andean gulls (Chroicocephalus serranus): circling over the Uros bay, Taquile and the shore, and a few
 *    resting on the water by the islands.
 * By day. At night the grebes sleep on the water among the reeds, the flamingos stand still asleep and the
 * gulls rest on the water. A good look (close and on screen for a moment) earns the bonus stamps
 * `titicaca:fauna:zambullidor`, `…:flamenco`, `…:gaviota`. Draw calls: one per flock per LOD in use (three
 * flocks). Pure logic: ./fauna/logic.ts; the flocks load off the main thread (./fauna/herds.ts).
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import { bpal } from "../../characters/animals/species/birds";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { emit } from "../../events";
import type { SuyuEnv } from "../../suyu/contract";
import type { TiticacaLayout } from "../layout";
import { FLAMINGO_BAY, ISLANDS, LEVEL } from "../plan";
import { reedFree } from "../scenery/placement";
import { lazyHerds } from "./fauna/herds";
import {
  type DivePhase,
  damp,
  daylight,
  diveDepth,
  LookTimer,
  rng,
  type Soar,
  soarPose,
  stepDive,
  TAU,
  turnToward,
  wanderTarget,
  wrapAngle,
} from "./fauna/logic";

/**
 * The Andean gull in breeding plumage: white with grey wings and black tips, and the dark brown hood (the
 * core's gull is the coast's Belcher's gull: its colours, our bird).
 */
const ANDEAN_GULL = bpal({
  back: "#f4f2ee",
  head: "#4a3628",
  face: "#4a3628",
  bill: "#8f2a24",
  legs: "#8f2a24",
  belly: "#f4f2ee",
  coverts: "#a3abb4",
  flight: "#a3abb4",
  tail: "#f4f2ee",
  accent: "#6a1e1a",
  x2: "#1f1a17",
});

/** Grebes float this far below the surface line (their feet origin sits under the water). */
const GREBE_SINK = 0.06;
const GULL_SINK = 0.05;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as TiticacaLayout;
  const R = rng(0xa7e5);
  const high = env.quality === "high";
  const group = new THREE.Group();
  group.name = "titicaca-aves";
  env.scene.add(group);
  const herds = lazyHerds(group);
  const depthAt = (x: number, z: number) => LEVEL - L.heightAt(x, z);
  const cam = env.camera;
  const ndc = new THREE.Vector3();
  const onScreen = (x: number, y: number, z: number, max: number) => {
    if (Math.hypot(x - cam.position.x, z - cam.position.z) > max + 12) return false;
    ndc.set(x, y, z).project(cam);
    return ndc.z < 1 && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9;
  };
  const stamp = (id: string) => {
    const entry = CATALOG.find((c) => c.id === id);
    if (entry) emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
  };

  // ------------------------------------------------------------------ grebes
  const reedWater = (x: number, z: number) => {
    const d = depthAt(x, z);
    return d > 0.3 && d < 1.6 && L.landField(x, z) < -2 && reedFree(x, z);
  };
  const nGrebes = high ? 12 : 8;
  const grebes: Array<{
    home: { x: number; z: number; r: number };
    x: number;
    z: number;
    yaw: number;
    tx: number;
    tz: number;
    phase: DivePhase;
    timer: number;
    speed: number;
    id: number;
  }> = [];
  for (let k = 0; k < 4000 && grebes.length < nGrebes; k++) {
    // Half by the Uros islands, half along the shore's reed shelf.
    let x: number;
    let z: number;
    if (grebes.length % 2 === 0) {
      const isl = ISLANDS[Math.floor(R() * ISLANDS.length)];
      if (!isl) break;
      const a = R() * TAU;
      x = isl.x + Math.cos(a) * (isl.r + 3 + R() * 8);
      z = isl.z + Math.sin(a) * (isl.r + 3 + R() * 8);
      if (L.landField(x, z) > -3 || !reedFree(x, z)) continue;
    } else {
      x = -280 + R() * 340;
      z = -40 + R() * 60;
      if (!reedWater(x, z)) continue;
    }
    grebes.push({
      home: { x, z, r: 5 },
      x,
      z,
      yaw: R() * TAU,
      tx: x,
      tz: z,
      phase: "float",
      timer: 3 + R() * 10,
      speed: 0,
      id: -1,
    });
  }
  const grebeOk = (x: number, z: number) => L.landField(x, z) < -1.5 && reedFree(x, z);
  herds.herd("grebe", { max: Math.max(1, grebes.length) }, (h) => {
    grebes.forEach((g, i) => {
      g.id = h.add({ seed: 11 + i * 7 });
    });
  });

  // ------------------------------------------------------------------ flamingos
  const wade = (x: number, z: number) => {
    const d = depthAt(x, z);
    return d > 0.12 && d < 0.75 && Math.hypot(x - FLAMINGO_BAY.x, z - FLAMINGO_BAY.z) < FLAMINGO_BAY.r + 10;
  };
  const nFlam = high ? 9 : 6;
  const flamingos: Array<{
    x: number;
    z: number;
    yaw: number;
    tx: number;
    tz: number;
    pause: number;
    /** Seconds to the next feeding bout / shake. */
    feed: number;
    shakeT: number;
    scale: number;
    speed: number;
    body: Body;
    id: number;
  }> = [];
  for (let k = 0; k < 3000 && flamingos.length < nFlam; k++) {
    const x = FLAMINGO_BAY.x + (R() - 0.5) * 2 * (FLAMINGO_BAY.r + 8);
    const z = FLAMINGO_BAY.z + (R() - 0.5) * 2 * (FLAMINGO_BAY.r + 8);
    if (!wade(x, z)) continue;
    flamingos.push({
      x,
      z,
      yaw: R() * TAU,
      tx: x,
      tz: z,
      pause: R() * 4,
      feed: R() * 2,
      shakeT: 8 + R() * 20,
      scale: 0.92 + R() * 0.14,
      speed: 0,
      body: creatures.add("flamingo", 0.35, { x, z, give: 0.5 }),
      id: -1,
    });
  }
  herds.herd("flamingo", { max: Math.max(1, flamingos.length) }, (h) => {
    flamingos.forEach((f, i) => {
      f.id = h.add({ seed: 31 + i * 5 });
    });
  });

  // ------------------------------------------------------------------ gulls
  const soars: Soar[] = [
    { x: -122, z: -40, r: 34, y: 13, w: 0.22, ph: 0 },
    { x: -122, z: -40, r: 22, y: 17, w: -0.28, ph: 2 },
    { x: 96, z: -24, r: 28, y: 22, w: 0.2, ph: 1 },
    { x: -10, z: -10, r: 46, y: 15, w: -0.16, ph: 4 },
    { x: 220, z: -30, r: 30, y: 16, w: 0.24, ph: 3 },
  ].slice(0, high ? 5 : 3);
  const resting = ISLANDS.slice(0, 3).map((isl, k) => ({
    x: isl.x + Math.cos(k * 2.1) * (isl.r + 4),
    z: isl.z + Math.sin(k * 2.1) * (isl.r + 4),
    yaw: k * 1.3,
  }));
  const gullIds: number[] = [];
  herds.herd("gull", { max: soars.length + resting.length, variants: [ANDEAN_GULL] }, (h) => {
    for (let k = 0; k < soars.length + resting.length; k++) gullIds.push(h.add({ seed: 51 + k * 3 }));
  });

  const looks = { grebe: new LookTimer(1.4), flamingo: new LookTimer(1.4), gull: new LookTimer(1.6) };
  let clock = 0;
  const rm = env.reducedMotion;
  if (import.meta.env?.DEV)
    (window as unknown as { __aves?: unknown }).__aves = {
      grebes: () => grebes.map((g) => [+g.x.toFixed(1), +g.z.toFixed(1)]),
      flamingos: () => flamingos.map((f) => [+f.x.toFixed(1), +f.z.toFixed(1)]),
      drawCalls: () => herds.drawCalls(),
    };
  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const day = daylight(env.sky.time()) > 0.3;

      // ----- grebes
      const gh = herds.get("grebe");
      let grebeSeen = false;
      grebes.forEach((g, i) => {
        const dAv = Math.hypot(avatar.x - g.x, avatar.z - g.z);
        const before = g.phase;
        // Asleep on the water at night: no dives.
        const st =
          day || g.phase !== "float"
            ? stepDive(g.phase, g.timer, dt, day && g.phase === "float" && dAv < 5.5 && !rm, R)
            : { phase: g.phase, timer: g.timer, surfaced: false };
        g.phase = st.phase;
        g.timer = st.timer;
        if (before === "under" && st.surfaced) {
          // Comes up a few metres off, away from the traveler.
          const a = Math.atan2(g.z - avatar.z, g.x - avatar.x) + (R() - 0.5) * 1.2;
          const nx = g.x + Math.cos(a) * (3 + R() * 3);
          const nz = g.z + Math.sin(a) * (3 + R() * 3);
          if (grebeOk(nx, nz)) {
            g.x = nx;
            g.z = nz;
            g.tx = nx;
            g.tz = nz;
          }
        }
        let want = 0;
        if (g.phase === "float" && day) {
          if (Math.hypot(g.tx - g.x, g.tz - g.z) < 0.4) {
            const t = wanderTarget(g.home, R, grebeOk);
            g.tx = t.x;
            g.tz = t.z;
          }
          g.yaw = turnToward(g.yaw, Math.atan2(g.tx - g.x, g.tz - g.z), dt * 1.6);
          want = 0.35;
          g.x += Math.sin(g.yaw) * want * dt;
          g.z += Math.cos(g.yaw) * want * dt;
        }
        g.speed = damp(g.speed, want, 3, dt);
        if (gh && g.id >= 0) {
          if (g.phase === "under") gh.hide(g.id);
          else {
            const depth = diveDepth(g.phase, g.timer);
            const bob = rm ? 0 : Math.sin(clock * 2 + i) * 0.015;
            gh.set(g.id, g.x, LEVEL - GREBE_SINK - depth + bob, g.z, g.yaw, {
              speed: g.speed,
              rm,
              grounded: false,
              water: true,
              under: g.phase !== "float",
              vy: g.phase === "down" ? -1 : g.phase === "up" ? 1 : 0,
              height: 0,
              quiet: !day,
            });
          }
        }
        if (g.phase === "float" && dAv < 16 && onScreen(g.x, LEVEL + 0.2, g.z, 16)) grebeSeen = true;
      });
      if (looks.grebe.update(dt, grebeSeen)) stamp("titicaca:fauna:zambullidor");

      // ----- flamingos
      const fh = herds.get("flamingo");
      let flamSeen = false;
      flamingos.forEach((f) => {
        const dAv = Math.hypot(avatar.x - f.x, avatar.z - f.z);
        let want = 0;
        let look: number | undefined;
        if (day) {
          // Keep away from the traveler: a new spot on the far side.
          if (dAv < 9 && Math.hypot(f.tx - f.x, f.tz - f.z) < 0.5) {
            const a = Math.atan2(f.z - avatar.z, f.x - avatar.x);
            const nx = f.x + Math.cos(a) * 6;
            const nz = f.z + Math.sin(a) * 6;
            if (wade(nx, nz)) {
              f.tx = nx;
              f.tz = nz;
              f.pause = 0;
            }
          }
          f.pause -= dt;
          if (f.pause <= 0 && Math.hypot(f.tx - f.x, f.tz - f.z) < 0.4) {
            const t = wanderTarget({ x: f.x, z: f.z, r: 5 }, R, wade);
            f.tx = t.x;
            f.tz = t.z;
            f.pause = 2 + R() * 5;
          }
          const dist = Math.hypot(f.tx - f.x, f.tz - f.z);
          if (dist > 0.3) {
            f.yaw = turnToward(f.yaw, Math.atan2(f.tx - f.x, f.tz - f.z), dt * 1.2);
            want = dAv < 9 ? 0.9 : 0.35;
            f.x += Math.sin(f.yaw) * want * dt;
            f.z += Math.cos(f.yaw) * want * dt;
          }
          // Heads up toward a traveler who comes close; otherwise feeding bouts, a shake now and then.
          if (dAv < 12)
            look = THREE.MathUtils.clamp(wrapAngle(Math.atan2(avatar.x - f.x, avatar.z - f.z) - f.yaw), -1.2, 1.2);
          else if (fh && f.id >= 0) {
            f.shakeT -= dt;
            f.feed -= dt;
            if (f.shakeT <= 0) {
              // The wing stretch: wings opened wide for a moment, black flight feathers showing.
              if (!rm) fh.play(f.id, "stretch", 2.2);
              f.shakeT = 14 + R() * 25;
              f.feed = 2;
            } else if (f.feed <= 0) {
              fh.play(f.id, "graze", 5 + R() * 4);
              f.feed = 6 + R() * 5;
            }
          }
        } else if (fh && f.id >= 0) {
          // Asleep standing in the shallows.
          f.feed -= dt;
          if (f.feed <= 0) {
            fh.play(f.id, "sleep", 30);
            f.feed = 28;
          }
        }
        f.speed = damp(f.speed, want, 4, dt);
        f.body.x = f.x;
        f.body.z = f.z;
        const y = Math.max(L.heightAt(f.x, f.z), LEVEL - 0.8);
        if (fh && f.id >= 0)
          fh.set(
            f.id,
            f.x,
            y,
            f.z,
            f.yaw,
            { speed: f.speed, rm, grounded: true, vy: 0, height: 0, look, quiet: !day },
            { scale: f.scale },
          );
        if (dAv < 30 && onScreen(f.x, y + 1.2, f.z, 30)) flamSeen = true;
      });
      if (looks.flamingo.update(dt, flamSeen)) stamp("titicaca:fauna:flamenco");

      // ----- gulls
      const uh = herds.get("gull");
      let gullSeen = false;
      let k = 0;
      for (const s of soars) {
        // At night the soaring gulls come down to rest on the water under their circle.
        const tt = rm ? clock * 0.5 : clock;
        const p = soarPose(s, tt);
        const y = day ? p.y : LEVEL - GULL_SINK;
        const id = gullIds[k];
        if (uh && id !== undefined) {
          // Linear speed along the circle and the climb rate of the gentle swell in height.
          const speed = day ? Math.abs(s.w * s.r) * (rm ? 0.5 : 1) : 0;
          const vy = day ? Math.cos((s.ph + s.w * tt) * 2 + s.ph) * 2 * s.w * 1.2 * (rm ? 0.5 : 1) : 0;
          uh.set(id, p.x, y, p.z, p.yaw, {
            speed,
            rm,
            grounded: false,
            water: !day,
            vy,
            height: day ? p.y - LEVEL : 0,
            turn: day ? s.w : 0,
            quiet: !day,
          });
        }
        if (day && Math.hypot(avatar.x - p.x, avatar.z - p.z) < 30 && onScreen(p.x, y, p.z, 40)) gullSeen = true;
        k++;
      }
      for (const r of resting) {
        const bob = rm ? 0 : Math.sin(clock * 1.5 + k) * 0.02;
        const id = gullIds[k];
        if (uh && id !== undefined)
          uh.set(id, r.x, LEVEL - GULL_SINK + bob, r.z, r.yaw + Math.sin(clock * 0.2 + k) * 0.3, {
            speed: 0,
            rm,
            grounded: false,
            water: true,
            vy: 0,
            height: 0,
            quiet: !day,
          });
        if (Math.hypot(avatar.x - r.x, avatar.z - r.z) < 18 && onScreen(r.x, LEVEL, r.z, 18)) gullSeen = true;
        k++;
      }
      if (looks.gull.update(dt, gullSeen)) stamp("titicaca:fauna:gaviota");
      herds.update(dt, clock, env.camera);
    },
    dispose() {
      for (const f of flamingos) creatures.remove(f.body);
      herds.dispose();
      group.removeFromParent();
    },
  };
};
