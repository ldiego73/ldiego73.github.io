/**
 * Sachavaca (lowland tapir, Tapirus terrestris): the biggest animal of the Antisuyu, out from dusk to dawn
 * on the quiet sandbars no other animal uses: the one along the canoe route between the embarcadero and the
 * palafitos and, on high quality, the one across the river from the regatón.
 * At dusk (≈ 17 h) a tapir walks out of the bank vegetation onto the bar. It ambles over the sand, nose to
 * the ground, the short trunk working; drinks at the water's edge; now and then wades out belly-deep and
 * stands soaking before it climbs back onto the sand. When the traveler comes close (≈ 9 u, ≈ 13 u running
 * or paddling) it trots into the river and swims off with only its back and head above the water, as tapirs
 * do when startled, and comes back once the traveler has been well away for a while. At dawn it walks back
 * into the forest. By day there is no tapir (it rests deep in the forest).
 *
 * Rendering: one rig InstancedMesh (wild/rig.ts, moonlit rim at night) and a ripple pool → 2 draw calls near
 * a bar, 0 by day. Body ("sachavaca"): solid on the sand (give 0.3: it barely budges), not solid in the water,
 * parked while away.
 * Stamp `selva:fauna:sachavaca` after a ~1.5 s good look within 34 u (from the canoe or a landing).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, park } from "../../creatures";
import { on } from "../../events";
import { tapirModel } from "./wild/critters";
import { duskToDawn, SpeedMeter } from "./wild/crossing";
import {
  type Bar,
  barF,
  barNear,
  barPoint,
  barY,
  devHook,
  FAUNA_FAR,
  faunaDt,
  idle,
  Ripples,
  ramp,
  rootMatrix,
  Spotter,
  selvaOf,
} from "./wild/kit";
import { damp, nightAmount, rng, turnToward, wrapAngle } from "./wild/logic";
import { RigSet } from "./wild/rig";

type State = "away" | "browse" | "pause" | "wade" | "flee" | "swim" | "return" | "leave";

interface Tapir {
  bar: Bar;
  state: State;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  timer: number;
  speed: number;
  phase: number;
  headYaw: number;
  headPitch: number;
  wet: number;
  calm: number;
  /** Which end of the bar meets the bank vegetation (where it comes and goes), as barPoint u. */
  endU: number;
  body: Body;
}

/** Road t of the bars a tapir uses (the first on every quality). */
const SITES = [0.488, 0.127];

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(9203);
  /** Swimming: the root sits so the back and the head stay above the surface. */
  const swimY = lv - 0.78;

  const standY = (b: Bar, x: number, z: number) => {
    const f = barF(b, x, z);
    return f < 1 ? Math.max(L.heightAt(x, z), barY(lv, f)) : L.heightAt(x, z);
  };

  const tapirs: Tapir[] = [];
  for (const t of high ? SITES : SITES.slice(0, 1)) {
    const bar = barNear(env, t, 0.02);
    if (!bar) continue;
    // The end of the bar closer to the bank (dry ground behind it) is where it comes out of the forest.
    const e0 = barPoint(bar, 1, 0);
    const e1 = barPoint(bar, -1, 0);
    const endU = L.riverDist(e0.x, e0.z) > L.riverDist(e1.x, e1.z) ? 0.92 : -0.92;
    tapirs.push({
      bar,
      state: "away",
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      tx: 0,
      tz: 0,
      timer: 0,
      speed: 0,
      phase: R(),
      headYaw: 0,
      headPitch: 0.4,
      wet: 0,
      calm: 0,
      endU,
      body: creatures.add("sachavaca", 0.7, { solid: false, give: 0.3 }),
    });
  }
  for (const tp of tapirs) park(tp.body);

  const model = tapirModel();
  const set = new RigSet("selva-fauna-sachavaca-body", model.geo, model.spec, tapirs.length, ramp(env), {
    shadow: high,
    rimColor: "#a9b8ff",
  });
  const ripples = new Ripples(env, "selva-fauna-sachavaca-ripples", 8, lv, 2.2);
  const root = new THREE.Group();
  root.name = "selva-fauna-sachavaca";
  root.add(set.mesh, ripples.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "sachavaca", 34);
  const meter = new SpeedMeter();
  let inside = false;
  let paddling = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    paddling = !!d?.riding && d.vehicle === "canoe";
  });
  const offDev = devHook("sachavaca", () =>
    tapirs.map((tp) => ({ s: tp.state, x: +tp.x.toFixed(1), z: +tp.z.toFixed(1), bx: tp.bar.x, bz: tp.bar.z })),
  );
  const m4 = new THREE.Matrix4();
  const want = { x: 0, z: 0 };
  let clock = 0;

  /** Next spot on the sand (or, sometimes, a wade out past the rim into the shallows). */
  const pickBrowse = (tp: Tapir) => {
    const b = tp.bar;
    if (R() < 0.3) {
      // Belly-deep in the shallows just off the bar's long side.
      for (let k = 0; k < 8; k++) {
        const v = (R() < 0.5 ? -1 : 1) * (1.3 + R() * 0.5);
        const p = barPoint(b, (R() - 0.5) * 1.2, v);
        const h = L.heightAt(p.x, p.z);
        if (h < lv - 0.25 && h > lv - 0.9) {
          tp.tx = p.x;
          tp.tz = p.z;
          tp.state = "wade";
          tp.timer = -1;
          return;
        }
      }
    }
    const p = barPoint(b, (R() - 0.5) * 1.6, (R() - 0.5) * 1.0);
    tp.tx = p.x;
    tp.tz = p.z;
    tp.state = "browse";
  };

  /** Into the river, away from the traveler, out to swimming depth. */
  const flee = (tp: Tapir, ax: number, az: number) => {
    const b = tp.bar;
    let dx = b.x - ax;
    let dz = b.z - az;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let px = b.x + dx * 8;
    let pz = b.z + dz * 8;
    for (let k = 4; k < 16; k += 0.5) {
      px = tp.x + dx * k;
      pz = tp.z + dz * k;
      if (L.heightAt(px, pz) < lv - 1.6 && L.isWater(px, pz) && barF(b, px, pz) > 1.6) break;
    }
    tp.tx = px + (R() - 0.5) * 2;
    tp.tz = pz + (R() - 0.5) * 2;
    tp.state = "flee";
    tp.calm = 0;
  };

  return {
    update(dt, avatar) {
      dt = faunaDt(dt);
      clock += dt;
      meter.update(avatar.x, avatar.z, dt);
      const time = env.sky.time();
      const out = duskToDawn(time) > 0.5;
      set.rim.value = nightAmount(time) * 0.85;
      spot.begin();
      const mot = rm ? 0.65 : 1;
      const scareR = meter.running || paddling ? 13 : 9;
      let k = 0;
      for (const tp of tapirs) {
        const b = tp.bar;
        const d = Math.hypot(tp.x - avatar.x, tp.z - avatar.z);
        if (tp.state === "away") {
          const end = barPoint(b, tp.endU, 0);
          // Comes out only while nobody watches that end of the bar (it steps out of the vegetation unseen).
          if (
            out &&
            !inside &&
            !spot.view.sees(end.x, lv + 0.8, end.z, 1.5) &&
            Math.hypot(end.x - avatar.x, end.z - avatar.z) > 20
          ) {
            tp.x = end.x;
            tp.z = end.z;
            tp.y = standY(b, end.x, end.z);
            tp.yaw = Math.atan2(b.x - end.x, b.z - end.z);
            tp.wet = 0;
            pickBrowse(tp);
            tp.body.solid = true;
          } else continue;
        }
        if (!out && tp.state !== "leave" && tp.state !== "flee" && tp.state !== "swim") {
          const end = barPoint(b, tp.endU * 1.05, 0);
          tp.tx = end.x;
          tp.tz = end.z;
          tp.state = "leave";
        }
        if (!inside && d < scareR && (tp.state === "browse" || tp.state === "pause" || tp.state === "wade"))
          flee(tp, avatar.x, avatar.z);

        let speed = 0;
        let pitchT = 0.45;
        let look = false;
        let sniff = 0;
        switch (tp.state) {
          case "browse": {
            speed = 0.5 * mot;
            pitchT = 0.55;
            sniff = 1;
            if (Math.hypot(tp.tx - tp.x, tp.tz - tp.z) < 0.4) {
              tp.state = "pause";
              tp.timer = 4 + R() * 6;
            }
            break;
          }
          case "pause": {
            // Nose down working the sand, or drinking at the rim; a look up at a traveler within 20 u.
            tp.timer -= dt;
            pitchT = barF(b, tp.x, tp.z) > 0.75 ? 0.95 : 0.7;
            sniff = 1;
            if (d < 20) {
              pitchT = 0.1;
              look = true;
              sniff = 0;
            }
            if (tp.timer <= 0) pickBrowse(tp);
            break;
          }
          case "wade": {
            if (tp.timer < 0) {
              speed = 0.45 * mot;
              if (Math.hypot(tp.tx - tp.x, tp.tz - tp.z) < 0.4) tp.timer = 8 + R() * 8;
            } else {
              // Standing in the water, soaking; head low over the surface now and then.
              tp.timer -= dt;
              pitchT = Math.sin(clock * 0.3 + tp.phase * 5) > 0.3 ? 0.9 : 0.3;
              if (tp.timer <= 0) {
                const p = barPoint(b, (R() - 0.5) * 1.2, (R() - 0.5) * 0.6);
                tp.tx = p.x;
                tp.tz = p.z;
                tp.state = "browse";
              }
            }
            break;
          }
          case "flee": {
            speed = (tp.wet > 0.5 ? 1.0 : 2.2) * mot;
            pitchT = 0.1;
            if (Math.hypot(tp.tx - tp.x, tp.tz - tp.z) < 0.6) tp.state = "swim";
            break;
          }
          case "swim": {
            // Holding out in the river, head toward the bar, until the traveler has been gone a while.
            tp.yaw = turnToward(tp.yaw, Math.atan2(b.x - tp.x, b.z - tp.z), 0.6 * dt);
            pitchT = -0.15;
            tp.calm = d > 22 ? tp.calm + dt : 0;
            if (tp.calm > 10 && out) {
              const p = barPoint(b, (R() - 0.5) * 1.0, (R() - 0.5) * 0.5);
              tp.tx = p.x;
              tp.tz = p.z;
              tp.state = "return";
            } else if (!out && tp.calm > 4) {
              const end = barPoint(b, tp.endU * 1.05, 0);
              tp.tx = end.x;
              tp.tz = end.z;
              tp.state = "leave";
            }
            break;
          }
          case "return": {
            speed = (tp.wet > 0.5 ? 0.8 : 0.5) * mot;
            if (Math.hypot(tp.tx - tp.x, tp.tz - tp.z) < 0.5) {
              tp.state = "pause";
              tp.timer = 3 + R() * 3;
            }
            break;
          }
          case "leave": {
            speed = 0.6 * mot;
            if (
              Math.hypot(tp.tx - tp.x, tp.tz - tp.z) < 0.6 ||
              (!spot.view.sees(tp.x, tp.y + 0.8, tp.z, 1.5) && barF(b, tp.x, tp.z) > 0.85)
            ) {
              tp.state = "away";
              park(tp.body);
              tp.body.solid = false;
              continue;
            }
            break;
          }
        }

        if (speed > 0) {
          const dx = tp.tx - tp.x;
          const dz = tp.tz - tp.z;
          const l = Math.hypot(dx, dz) || 1;
          if (tp.body.solid) creatures.steer(tp.body, (dx / l) * speed, (dz / l) * speed, 1.2, want);
          else {
            want.x = (dx / l) * speed;
            want.z = (dz / l) * speed;
          }
          const sp = Math.hypot(want.x, want.z);
          if (sp > 1e-3) tp.yaw = turnToward(tp.yaw, Math.atan2(want.x, want.z), 1.6 * dt);
          const step = Math.min(l, sp * dt);
          tp.x += Math.sin(tp.yaw) * step;
          tp.z += Math.cos(tp.yaw) * step;
        }
        tp.speed = damp(tp.speed, speed, 4, dt);
        const ground = standY(b, tp.x, tp.z);
        const swimming = ground < swimY + 0.05;
        if (swimming && tp.wet < 0.5) ripples.spawn(tp.x, tp.z, 2.4);
        tp.wet = damp(tp.wet, swimming ? 1 : 0, 3, dt);
        if (ground < lv - 0.1 && tp.speed > 0.2 && R() < dt * 1.6) ripples.spawn(tp.x, tp.z, 1.6);
        tp.y = damp(tp.y, Math.max(ground, swimY), 6, dt);
        tp.body.solid = !swimming && ground > lv - 0.3;
        tp.body.x = tp.x;
        tp.body.z = tp.z;
        if (tp.body.solid && creatures.resolve(tp.body, (x, z) => barF(b, x, z) < 1.4, 0.05)) {
          tp.x = tp.body.x;
          tp.z = tp.body.z;
        }

        if (spot.view.dist(tp.x, tp.y, tp.z) > FAUNA_FAR * 1.2) continue;
        tp.phase = (tp.phase + (tp.speed * dt) / 1.3) % 1;
        const swing = Math.min(0.5, tp.speed * 0.3) * (tp.wet > 0.5 ? 0.8 : 1);
        const rel = look
          ? Math.max(-0.9, Math.min(0.9, wrapAngle(Math.atan2(avatar.x - tp.x, avatar.z - tp.z) - tp.yaw)))
          : 0;
        // The trunk works the ground: small quick side-to-side sweeps of the head.
        const sweep = sniff ? Math.sin(clock * 2.3 + tp.phase * 7) * 0.18 * mot : 0;
        tp.headYaw = damp(tp.headYaw, rel + sweep, 3, dt);
        tp.headPitch = damp(tp.headPitch, pitchT, 2.5, dt);
        rootMatrix(m4, tp.x, tp.y, tp.z, tp.yaw, tp.wet > 0.5 ? -0.12 : 0, 0, 1);
        set.set(k++, m4, tp.phase, swing, tp.headYaw, tp.headPitch, Math.sin(clock * 1.7) * 0.2, 0);
        spot.see(tp.x, Math.max(tp.y, lv) + 0.7, tp.z, avatar.x, avatar.z, 1.2);
      }
      set.commit(inside ? 0 : k);
      ripples.update(dt);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offMount();
      offDev();
      for (const tp of tapirs) creatures.remove(tp.body);
      set.dispose();
      ripples.dispose();
      root.removeFromParent();
    },
  };
};
