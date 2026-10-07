/**
 * Caimanes negros (black caimans, Melanosuchus niger) in the calm water along the banks and on the quieter
 * sandbars (the ones without a capybara family).
 *  - Floating: only the eye bumps, the nostrils and a line of back scutes break the surface; the animal
 *    drifts and turns very slowly, the tail sweeping under the water. At night the eyes catch the light and
 *    shine orange-red, the classic sight from a canoe or a landing.
 *  - Basking (by day, on a sandbar): lying flat on the sand, jaws a little open to cool off.
 * When the traveler comes close (≈ 8 u, ≈ 11 u running or paddling straight at it) a basking caiman slides
 * into the water and a floating one slips under with a ring; it comes back up near its spot once the
 * traveler has moved on. They never approach the traveler.
 *
 * Rendering: one rig InstancedMesh (wild/rig.ts: legs paddle, the tail sweeps), the eyeshine dots and a
 * ripple pool → 3 draw calls. Bodies ("caiman"): solid only while basking on the sand (give 0.2: it does not
 * budge), not solid in the water, parked while under.
 * Stamp `selva:fauna:caiman` after a ~1.5 s good look within 20 u.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, park } from "../../creatures";
import { on } from "../../events";
import {
  type Bar,
  barF,
  barNear,
  barPoint,
  barY,
  devHook,
  Eyes,
  FAUNA_FAR,
  idle,
  Ripples,
  ramp,
  rootMatrix,
  Spotter,
  selvaOf,
} from "./wild/kit";
import { damp, nightAmount, rng, roadFrame, TAU, turnToward } from "./wild/logic";
import { caimanModel } from "./wild/mammals";
import { headPoint, RigSet } from "./wild/rig";

type State = "float" | "bask" | "slide" | "sink" | "under" | "rise";

interface Caiman {
  state: State;
  /** Home (where it floats or basks) and the water spot it slides to from the sand. */
  hx: number;
  hz: number;
  hyaw: number;
  bar: Bar | null;
  wx: number;
  wz: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  yawT: number;
  timer: number;
  scale: number;
  phase: number;
  speed: number;
  sink: number;
  body: Body;
}

/** Road t near which caimans float off the bank (river side), and sandbars (road t) where they bask. */
const FLOAT_T = [0.56, 0.47, 0.97, 0.3];
const BASK_T = [0.353, 0.529, 0.741];

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(3313);
  const model = caimanModel();
  /** Floating: the root sits so the eye bumps just clear the surface. */
  const floatY = (s: number) => lv + 0.035 - (model.eyes[0].y + model.eyeR) * s;

  /** Calm water along the river bank near road t: walks out from the road until the bed is ~1.2 deep. */
  const bankWater = (t: number, along: number) => {
    const f = roadFrame(L, t);
    for (let lat = 6; lat < 70; lat += 0.5) {
      const x = f.x + f.rx * lat + f.tx * along;
      const z = f.z + f.rz * lat + f.tz * along;
      if (L.heightAt(x, z) < lv - 1.1 && L.isWater(x, z)) return { x, z, yaw: Math.atan2(f.tx, f.tz) };
    }
    return null;
  };

  const caimans: Caiman[] = [];
  const add = (hx: number, hz: number, hyaw: number, bar: Bar | null) => {
    const scale = 1 + R() * 0.35;
    let wx = hx;
    let wz = hz;
    if (bar) {
      // From the sand straight out past the rim into water deep enough to float.
      const a = R() * TAU;
      for (let k = 1.2; k < 3.5; k += 0.2) {
        const p = barPoint(bar, Math.cos(a) * k, Math.sin(a) * k);
        wx = p.x;
        wz = p.z;
        if (L.heightAt(wx, wz) < lv - 1) break;
      }
    }
    caimans.push({
      state: bar ? "bask" : "float",
      hx,
      hz,
      hyaw,
      bar,
      wx,
      wz,
      x: hx,
      y: 0,
      z: hz,
      yaw: hyaw,
      yawT: hyaw,
      timer: R() * 5,
      scale,
      phase: R(),
      speed: 0,
      sink: 0,
      body: creatures.add("caiman", 0.5 * scale, { solid: false, give: 0.2, x: hx, z: hz }),
    });
  };
  for (const t of high ? FLOAT_T : FLOAT_T.slice(0, 2)) {
    const p = bankWater(t, (R() - 0.5) * 16 + 12);
    if (p) add(p.x, p.z, p.yaw + (R() - 0.5) * 1.5, null);
  }
  for (const t of high ? BASK_T : BASK_T.slice(0, 1)) {
    const bar = barNear(env, t, 0.02);
    if (!bar) continue;
    const p = barPoint(bar, (R() - 0.5) * 0.8, (R() - 0.5) * 0.3);
    add(p.x, p.z, bar.yaw + (R() < 0.5 ? 0 : Math.PI) + Math.PI / 2 + (R() - 0.5) * 0.6, bar);
  }

  const set = new RigSet("selva-fauna-caiman-body", model.geo, model.spec, caimans.length, ramp(env), {
    rimColor: "#9fb4ff",
  });
  const eyes = new Eyes(env, "selva-fauna-caiman-eyes", caimans.length * 2, "#2a2a12", "#ff9a3c");
  const ripples = new Ripples(env, "selva-fauna-caiman-ripples", 8, lv, 1.8);
  const root = new THREE.Group();
  root.name = "selva-fauna-caiman";
  root.add(set.mesh, eyes.mesh, ripples.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "caiman", 20);
  let inside = false;
  let paddling = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    paddling = !!d?.riding && d.vehicle === "canoe";
  });
  const offDev = devHook("caiman", () => caimans.map((c) => [c.state, +c.x.toFixed(1), +c.z.toFixed(1)]));
  const m4 = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  let lastAx = Number.NaN;
  let lastAz = 0;
  let avSpeed = 0;
  let clock = 0;

  const groundY = (c: Caiman, x: number, z: number) => {
    if (c.bar) {
      const f = barF(c.bar, x, z);
      if (f < 1) return Math.max(L.heightAt(x, z), barY(lv, f));
    }
    return L.heightAt(x, z);
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const night = nightAmount(time);
      set.rim.value = night * 0.7;
      if (!Number.isNaN(lastAx) && dt > 0)
        avSpeed = damp(avSpeed, Math.hypot(avatar.x - lastAx, avatar.z - lastAz) / dt, 6, dt);
      lastAx = avatar.x;
      lastAz = avatar.z;
      const scareR = avSpeed > 5.5 || paddling ? 11 : 8;
      spot.begin();
      const view = spot.view;
      const mot = rm ? 0.6 : 1;
      let n = 0;
      for (const c of caimans) {
        const d = Math.hypot(c.x - avatar.x, c.z - avatar.z);
        const scared = d < scareR && !inside;
        let speed = 0;
        let jaw = 0;
        switch (c.state) {
          case "bask": {
            // Lying on the sand by day; at dusk it goes back into the water to float the night.
            jaw = -0.14 + Math.sin(clock * 0.3 + c.phase * 6) * 0.03; // snout raised, basking
            if (scared || night > 0.5) {
              c.state = "slide";
              c.yawT = Math.atan2(c.wx - c.x, c.wz - c.z);
            }
            break;
          }
          case "slide": {
            speed = 1.4 * mot;
            c.yaw = turnToward(c.yaw, Math.atan2(c.wx - c.x, c.wz - c.z), 2 * dt);
            const step = speed * dt;
            c.x += Math.sin(c.yaw) * step;
            c.z += Math.cos(c.yaw) * step;
            if (Math.hypot(c.wx - c.x, c.wz - c.z) < 0.5) {
              ripples.spawn(c.x, c.z, 2 * c.scale);
              c.state = scared ? "sink" : "float";
              c.timer = 6 + R() * 6;
            }
            break;
          }
          case "float": {
            // Drift and turn very slowly; slip under when the traveler comes close.
            c.timer -= dt;
            if (c.timer <= 0) {
              c.timer = 6 + R() * 10;
              c.yawT = c.yaw + (R() - 0.5) * 1.4;
            }
            c.yaw = turnToward(c.yaw, c.yawT, 0.12 * dt);
            const hx = c.bar ? c.wx : c.hx;
            const hz = c.bar ? c.wz : c.hz;
            const back = Math.hypot(hx - c.x, hz - c.z);
            if (back > 2) {
              // Drift back toward the home water.
              c.x += ((hx - c.x) / back) * 0.15 * dt;
              c.z += ((hz - c.z) / back) * 0.15 * dt;
            }
            if (scared) {
              c.state = "sink";
              ripples.spawn(c.x, c.z, 1.6 * c.scale);
            } else if (c.bar && night < 0.3 && R() < dt * 0.02 && d > 30) {
              // By day, back up onto its sandbar to bask (only when nobody is close).
              c.state = "bask";
              const p = barPoint(c.bar, (R() - 0.5) * 0.8, (R() - 0.5) * 0.3);
              c.x = p.x;
              c.z = p.z;
              c.yaw = c.bar.yaw + Math.PI / 2 + (R() < 0.5 ? 0 : Math.PI);
            }
            break;
          }
          case "sink": {
            c.sink = Math.min(1, c.sink + dt / 1.4);
            if (c.sink >= 1) {
              c.state = "under";
              c.timer = 12 + R() * 14;
            }
            break;
          }
          case "under": {
            c.timer -= dt;
            if (c.timer <= 0 && d > 16) {
              // Up again near its spot (a little elsewhere), facing a new way.
              c.state = "rise";
              const hx = c.bar ? c.wx : c.hx;
              const hz = c.bar ? c.wz : c.hz;
              c.x = hx + (R() - 0.5) * 3;
              c.z = hz + (R() - 0.5) * 3;
              if (L.heightAt(c.x, c.z) > lv - 0.8) {
                c.x = hx;
                c.z = hz;
              }
              c.yaw = R() * TAU;
              c.yawT = c.yaw;
              ripples.spawn(c.x, c.z, 1.2 * c.scale);
            } else if (c.timer <= 0) c.timer = 2;
            break;
          }
          case "rise": {
            c.sink = Math.max(0, c.sink - dt / 2.2);
            if (c.sink <= 0) {
              c.state = "float";
              c.timer = 4;
            }
            break;
          }
        }
        if (c.state === "under") {
          park(c.body);
          continue;
        }
        // Height: on the sand while basking / sliding out of the water, else floating (minus the sink).
        const g = groundY(c, c.x, c.z);
        const fy = floatY(c.scale) - c.sink * 0.9 * c.scale;
        const onLand = c.state === "bask" || (c.state === "slide" && g > fy);
        c.y = damp(c.y, onLand ? g : fy, 6, dt);
        c.speed = damp(c.speed, speed, 6, dt);
        c.phase = (c.phase + (c.speed * dt) / (1.1 * c.scale)) % 1;
        // Tail: a slow sweep in the water, still on the sand; legs paddle only while moving.
        const sweep = onLand ? 0.05 : Math.sin(clock * 0.8 * mot + c.phase * 7) * 0.22 * mot;
        const tailYaw = sweep + (c.state === "slide" ? Math.sin(clock * 4) * 0.25 : 0);
        const legs = Math.min(0.5, c.speed * 0.4);
        // Floating, the legs trail back along the flanks.
        const trail = onLand ? 0 : 0.9;
        c.body.solid = onLand && c.state === "bask";
        c.body.x = c.x;
        c.body.z = c.z;
        // Farther than small fauna: a pair of shining eyes still reads across the dark water.
        if (view.dist(c.x, c.y, c.z) > FAUNA_FAR * 1.4) continue;
        rootMatrix(m4, c.x, c.y, c.z, c.yaw, 0, 0, c.scale);
        set.set(n, m4, c.phase, legs, 0, jaw, tailYaw, 0, -trail * 0.6, trail);

        // Eyeshine: a pair of dots on the eye bumps, bright at night when the head faces the camera.
        toCam.subVectors(view.cam, headPoint(eye, m4, model.spec.head, 0, jaw, model.eyes[0]));
        const dc = toCam.length();
        const fwdX = Math.sin(c.yaw);
        const fwdZ = Math.cos(c.yaw);
        const facing = dc > 0 ? (fwdX * toCam.x + fwdZ * toCam.z) / dc : 0;
        // Some moonlight always comes back off the eyes at night; full shine when they face the viewer.
        const glint = night * Math.max(0.55, THREE.MathUtils.smoothstep(facing, -0.6, 0.2)) * (1 - c.sink);
        // A far glint is drawn a little larger so the pair of red dots still reads across the river.
        const size = model.eyeR * c.scale * (1 + glint * Math.min(3, Math.max(0, (dc - 6) / 8)));
        for (let e = 0; e < 2; e++) {
          headPoint(eye, m4, model.spec.head, 0, jaw, model.eyes[e]!);
          eye.y += model.eyeR * c.scale * 0.5;
          eyes.set(n * 2 + e, eye, size, glint);
        }
        n++;
        if (c.sink < 0.5) spot.see(c.x, lv + 0.2, c.z, avatar.x, avatar.z, 1.2);
      }
      set.commit(inside ? 0 : n);
      eyes.commit(inside ? 0 : n * 2);
      ripples.update(dt);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offMount();
      offDev();
      for (const c of caimans) creatures.remove(c.body);
      set.dispose();
      eyes.dispose();
      ripples.dispose();
      root.removeFromParent();
    },
  };
};
