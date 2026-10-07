/**
 * Ronsocos (capybaras, Hydrochoerus hydrochaeris) and garzas blancas (great egrets, Ardea alba) on the
 * sandbars (playas) of the river near the landings: the embarcadero and the palafitos, plus the regatón on
 * high quality. A family (a big male, females and pups) grazes the open sand, now and then lying down to
 * rest; they rest more at night. When the traveler comes close (≈ 9 u walking or paddling, ≈ 13 u running)
 * the family freezes, heads up, then walks into the river and swims out a few units on the far side of the
 * bar with only backs and heads above the water; once the traveler has been well away for a few seconds
 * they swim back and climb out. Pups keep to their mothers.
 * Egrets stalk the wet rim of the same bars by day: slow steps, a freeze, a stab at a fish (a ring on the
 * water). Disturbed (or when the family plunges in) they fly off low over the river to another bar; they
 * roost away at night.
 *
 * Bars come from the scenery's placement plan (wild/kit.ts `sandbars`), so the animals stand on the sand the
 * scenery draws. Rendering: one rig InstancedMesh for the capybaras (wild/rig.ts), one bird-rig mesh for the
 * egrets and a ripple pool → 3 draw calls. Bodies ("ronsoco", "garza"): capybaras solid on the sand (moderate
 * give), not solid while swimming; egrets never solid.
 * Stamp `selva:fauna:ronsoco` after a ~1.5 s good look within 36 u (the bars lie across the water from the
 * landings; from the canoe they are much closer).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, PARKED, park } from "../../creatures";
import { on } from "../../events";
import { egretModel, FOLDED, WingSet } from "./wild/birds";
import {
  type Bar,
  barF,
  barNear,
  barPoint,
  barY,
  devHook,
  FAUNA_FAR,
  idle,
  Ripples,
  ramp,
  rootMatrix,
  Spotter,
  sandbars,
  selvaOf,
} from "./wild/kit";
import { clamp01, damp, diurnal, nightAmount, rng, TAU, turnToward, wrapAngle } from "./wild/logic";
import { capybaraModel } from "./wild/mammals";
import { RigSet } from "./wild/rig";

type CapyState = "graze" | "rest" | "alert" | "flee" | "swim" | "return";
type EgretState = "stand" | "step" | "strike" | "fly" | "away";

interface Group {
  bar: Bar;
  alarm: number;
  calm: number;
  /** Swim-out direction (unit, away from the traveler when the alarm went off). */
  ax: number;
  az: number;
  members: Capy[];
}

interface Capy {
  g: Group;
  mother: Capy | null;
  scale: number;
  state: CapyState;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  timer: number;
  speed: number;
  phase: number;
  headPitch: number;
  headYaw: number;
  rest: number;
  wet: number;
  body: Body;
}

interface Egret {
  bar: Bar;
  state: EgretState;
  x: number;
  y: number;
  z: number;
  yaw: number;
  timer: number;
  headPitch: number;
  headYaw: number;
  wing: number;
  fold: number;
  flap: number;
  fx: number;
  fy: number;
  fz: number;
  ex: number;
  ey: number;
  ez: number;
  u: number;
  dur: number;
  /** Bar to land on at the end of the flight (null: off over the forest). */
  dest: Bar | null;
  body: Body;
}

/** Road t of the landings whose nearest sandbar gets a family (the first one only on high quality). */
const SITES = [0.15, 0.42, 0.6];

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(5021);
  /** Swimming: the root sits this far under the surface (back and head show). */
  const swimY = lv - 0.6;

  /** Standing height: the sand dome on a bar, else the terrain (the river bed under the water). */
  const standY = (b: Bar, x: number, z: number) => {
    const f = barF(b, x, z);
    return f < 1 ? Math.max(L.heightAt(x, z), barY(lv, f)) : L.heightAt(x, z);
  };
  const onSand = (b: Bar, x: number, z: number) => barF(b, x, z) < 0.78 && !creatures.inKeepOut(x, z, 0.4);
  /** Wet rim of a bar (wading egrets). */
  const rim = (b: Bar, x: number, z: number) => {
    const f = barF(b, x, z);
    return f > 0.8 && f < 1.04;
  };

  const groups: Group[] = [];
  const capys: Capy[] = [];
  const egrets: Egret[] = [];
  const used = new Set<Bar>();
  for (const t of high ? SITES : SITES.slice(1)) {
    const bar = barNear(env, t, 0.05);
    if (!bar || used.has(bar)) continue;
    used.add(bar);
    const g: Group = { bar, alarm: 0, calm: 0, ax: 1, az: 0, members: [] };
    groups.push(g);
    const n = high ? 6 : 4;
    const adults: Capy[] = [];
    for (let i = 0; i < n; i++) {
      const pup = i >= (high ? 3 : 2);
      const p = barPoint(bar, (R() - 0.5) * 1.2, (R() - 0.5) * 0.8);
      const c: Capy = {
        g,
        mother: pup ? (adults[(i - 1) % adults.length] ?? null) : null,
        scale: pup ? 0.5 + R() * 0.08 : i === 0 ? 1.12 : 0.95 + R() * 0.08,
        state: "graze",
        x: p.x,
        y: standY(bar, p.x, p.z),
        z: p.z,
        yaw: R() * TAU,
        tx: p.x,
        tz: p.z,
        timer: R() * 4,
        speed: 0,
        phase: R(),
        headPitch: 0.6,
        headYaw: 0,
        rest: 0,
        wet: 0,
        body: creatures.add("ronsoco", pup ? 0.25 : 0.45, { give: 0.6, x: p.x, z: p.z }),
      };
      if (!pup) adults.push(c);
      g.members.push(c);
      capys.push(c);
    }
    for (let k = 0; k < (high ? 2 : 1); k++) {
      const e: Egret = {
        bar,
        state: "stand",
        x: 0,
        y: 0,
        z: 0,
        yaw: R() * TAU,
        timer: 2 + R() * 3,
        headPitch: 0,
        headYaw: 0,
        wing: FOLDED,
        fold: 1,
        flap: R() * TAU,
        fx: 0,
        fy: 0,
        fz: 0,
        ex: 0,
        ey: 0,
        ez: 0,
        u: 0,
        dur: 1,
        dest: null,
        body: creatures.add("garza", 0.2, { solid: false, x: PARKED, z: PARKED }),
      };
      landEgret(e, bar);
      egrets.push(e);
    }
  }

  /** Puts the egret on a random spot of the wet rim of `bar`. */
  function landEgret(e: Egret, bar: Bar) {
    const a = R() * TAU;
    const p = barPoint(bar, Math.cos(a) * 0.9, Math.sin(a) * 0.9);
    e.bar = bar;
    e.x = p.x;
    e.z = p.z;
    e.y = standY(bar, p.x, p.z);
    e.state = "stand";
    e.timer = 1 + R() * 3;
  }

  const capySet = (() => {
    const m = capybaraModel();
    return new RigSet("selva-fauna-ronsoco-body", m.geo, m.spec, capys.length, ramp(env), { shadow: high });
  })();
  const egretSet = new WingSet(env, "selva-fauna-garza", egretModel(), egrets.length);
  const ripples = new Ripples(env, "selva-fauna-ronsoco-ripples", high ? 14 : 8, lv, 1.8);
  const root = new THREE.Group();
  root.name = "selva-fauna-ronsoco";
  root.add(capySet.mesh, egretSet.mesh, ripples.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "ronsoco", 36);
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const m4 = new THREE.Matrix4();
  const want = { x: 0, z: 0 };
  let lastAx = Number.NaN;
  let lastAz = 0;
  let avSpeed = 0;
  let clock = 0;

  const offDev = devHook("ronsoco", () => ({
    capys: capys.map((c) => [c.state, +c.x.toFixed(1), +c.z.toFixed(1)]),
    egrets: egrets.map((e) => [e.state, +e.x.toFixed(1), +e.z.toFixed(1)]),
    bars: groups.map((g) => [+g.bar.x.toFixed(1), +g.bar.z.toFixed(1), g.alarm]),
  }));

  const flyEgret = (e: Egret) => {
    // Low over the river to another bar 15–90 u away, or off over the forest if there is none.
    let dest: Bar | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const b of sandbars(env)) {
      if (b === e.bar) continue;
      const d = Math.hypot(b.x - e.x, b.z - e.z) + R() * 30;
      if (d > 15 && d < 120 && d < bd) {
        bd = d;
        dest = b;
      }
    }
    e.fx = e.x;
    e.fy = e.y;
    e.fz = e.z;
    e.dest = dest;
    if (dest) {
      const a = R() * TAU;
      const p = barPoint(dest, Math.cos(a) * 0.9, Math.sin(a) * 0.9);
      e.ex = p.x;
      e.ez = p.z;
      e.ey = standY(dest, p.x, p.z);
    } else {
      e.ex = e.x + Math.sin(e.yaw) * 40;
      e.ez = e.z + Math.cos(e.yaw) * 40;
      e.ey = lv + 14;
    }
    e.u = 0;
    e.dur = Math.max(2.5, Math.hypot(e.ex - e.x, e.ez - e.z) / 6);
    e.state = "fly";
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const night = nightAmount(time);
      const egretsOut = diurnal(time) > 0.5;
      if (!Number.isNaN(lastAx) && dt > 0) {
        const sp = Math.hypot(avatar.x - lastAx, avatar.z - lastAz) / dt;
        avSpeed = damp(avSpeed, Math.min(sp, 20), 6, dt);
      }
      lastAx = avatar.x;
      lastAz = avatar.z;
      const running = avSpeed > 5.5;
      capySet.rim.value = night * 0.8;
      spot.begin();
      const mot = rm ? 0.6 : 1;

      // ---- family alarm: the closest member decides; the whole family goes.
      for (const g of groups) {
        let near = Number.POSITIVE_INFINITY;
        for (const c of g.members) near = Math.min(near, Math.hypot(c.x - avatar.x, c.z - avatar.z));
        if (!inside && near < (running ? 13 : 9)) {
          if (g.alarm <= 0) {
            // Swim out on the far side of the bar from the traveler.
            const dx = g.bar.x - avatar.x;
            const dz = g.bar.z - avatar.z;
            const l = Math.hypot(dx, dz) || 1;
            g.ax = dx / l;
            g.az = dz / l;
            g.alarm = 1;
          }
          g.calm = 0;
        } else if (g.alarm > 0) {
          g.calm = near > 24 ? g.calm + dt : 0;
          if (g.calm > 6) g.alarm = 0;
        }
      }

      // ---- capybaras
      let n = 0;
      for (const c of capys) {
        const g = c.g;
        const bar = g.bar;
        const d = Math.hypot(c.x - avatar.x, c.z - avatar.z);
        const toAv = Math.atan2(avatar.x - c.x, avatar.z - c.z);
        let speed = 0;
        let pitchT = 0.15;
        let look = false;
        let restT = 0;
        if (g.alarm > 0 && (c.state === "graze" || c.state === "rest" || c.state === "return")) {
          c.state = "alert";
          c.timer = 0.5 + R() * 0.7 + (c.mother ? 0.3 : 0);
          // Out past the rim, where the river is deep enough to swim.
          const side = (R() - 0.5) * 0.6;
          let px = bar.x;
          let pz = bar.z;
          for (let k = 1.5; k < 4; k += 0.25) {
            px = bar.x + (g.ax - g.az * side) * bar.wid * k + (R() - 0.5) * 2;
            pz = bar.z + (g.az + g.ax * side) * bar.wid * k + (R() - 0.5) * 2;
            if (L.heightAt(px, pz) < lv - 0.9 && barF(bar, px, pz) > 1.2) break;
          }
          c.tx = px;
          c.tz = pz;
        }
        switch (c.state) {
          case "graze":
          case "rest": {
            c.timer -= dt;
            if (c.state === "rest") {
              restT = 1;
              pitchT = 0.1;
              if (c.timer <= 0) {
                c.state = night > 0.5 && R() < 0.6 ? "rest" : "graze";
                c.timer = 8 + R() * 14;
              }
            } else if (c.timer <= 0) {
              // Next mouthful: a short walk on the sand (pups stay by their mother).
              for (let k = 0; k < 10; k++) {
                const p = c.mother
                  ? { x: c.mother.x + (R() - 0.5) * 2, z: c.mother.z + (R() - 0.5) * 2 }
                  : barPoint(bar, (R() - 0.5) * 1.3, (R() - 0.5) * 0.9);
                if (onSand(bar, p.x, p.z)) {
                  c.tx = p.x;
                  c.tz = p.z;
                  break;
                }
              }
              c.timer = 3 + R() * 6;
              if (!c.mother && R() < (night > 0.5 ? 0.35 : 0.08)) {
                c.state = "rest";
                c.timer = 10 + R() * 20;
              }
            }
            if (c.state === "graze") {
              if (Math.hypot(c.tx - c.x, c.tz - c.z) > 0.3) speed = 0.45 * mot;
              else pitchT = 0.75; // head down, grazing
            }
            // Watchful: heads up and turned to a traveler within 18 u.
            if (d < 18) {
              pitchT = -0.1;
              look = true;
              if (c.state === "graze") speed = 0;
            }
            break;
          }
          case "alert": {
            // A moment frozen, heads up, then into the water.
            c.timer -= dt;
            pitchT = -0.25;
            look = true;
            if (c.timer <= 0) c.state = "flee";
            break;
          }
          case "flee": {
            speed = (c.wet > 0.5 ? 1.1 : 2.2) * mot;
            if (Math.hypot(c.tx - c.x, c.tz - c.z) < 0.6) c.state = "swim";
            break;
          }
          case "swim": {
            // Hold out in the river, noses toward the bar, a slow paddle against the current.
            c.yaw = turnToward(c.yaw, Math.atan2(bar.x - c.x, bar.z - c.z), 0.8 * dt);
            pitchT = -0.25;
            if (g.alarm <= 0) {
              c.state = "return";
              const p = barPoint(bar, (R() - 0.5) * 1.2, (R() - 0.5) * 0.7);
              c.tx = p.x;
              c.tz = p.z;
            }
            break;
          }
          case "return": {
            speed = (c.wet > 0.5 ? 0.9 : 0.6) * mot;
            if (Math.hypot(c.tx - c.x, c.tz - c.z) < 0.5) {
              c.state = "graze";
              c.timer = 2 + R() * 4;
            }
            break;
          }
        }

        // Move: steer toward the target around other bodies (on land), turn, step.
        if (speed > 0) {
          const dx = c.tx - c.x;
          const dz = c.tz - c.z;
          const l = Math.hypot(dx, dz) || 1;
          if (c.body.solid) creatures.steer(c.body, (dx / l) * speed, (dz / l) * speed, 1, want);
          else {
            want.x = (dx / l) * speed;
            want.z = (dz / l) * speed;
          }
          const sp = Math.hypot(want.x, want.z);
          if (sp > 1e-3) c.yaw = turnToward(c.yaw, Math.atan2(want.x, want.z), 2.4 * dt);
          const step = Math.min(l, sp * dt);
          c.x += Math.sin(c.yaw) * step;
          c.z += Math.cos(c.yaw) * step;
        }
        c.speed = damp(c.speed, speed, 6, dt);
        const ground = standY(bar, c.x, c.z);
        const wet = ground < swimY + 0.05 ? 1 : 0;
        if (wet && c.wet < 0.5 && R() < 0.8) ripples.spawn(c.x, c.z, 1.6 * c.scale);
        c.wet = damp(c.wet, wet, 4, dt);
        if (c.wet > 0.5 && c.speed > 0.2 && R() < dt * 1.5) ripples.spawn(c.x, c.z, 1.1 * c.scale);
        c.y = damp(c.y, Math.max(ground, swimY), 10, dt);
        c.rest = damp(c.rest, restT, 2, dt);

        // Body registry: solid on the sand only.
        c.body.solid = c.wet < 0.5;
        c.body.x = c.x;
        c.body.z = c.z;
        if (c.body.solid && creatures.resolve(c.body, (x, z) => onSand(bar, x, z), 0.06)) {
          c.x = c.body.x;
          c.z = c.body.z;
        }

        if (spot.view.dist(c.x, c.y, c.z) > FAUNA_FAR) continue;
        // Pose.
        c.phase = (c.phase + (c.speed * dt) / (0.9 * c.scale)) % 1;
        const swing = Math.min(0.55, c.speed * 0.35) * (c.wet > 0.5 ? 0.7 : 1);
        const relYaw = look ? Math.max(-1, Math.min(1, wrapAngle(toAv - c.yaw))) : 0;
        c.headYaw = damp(c.headYaw, relYaw, 3, dt);
        c.headPitch = damp(c.headPitch, pitchT, 3, dt);
        const nib = c.headPitch > 0.5 ? Math.sin(clock * 7 + c.phase * 9) * 0.05 * mot : 0;
        const lie = c.rest;
        rootMatrix(m4, c.x, c.y - lie * 0.24 * c.scale, c.z, c.yaw, c.wet > 0.5 ? -0.12 : 0, 0, c.scale);
        capySet.set(n, m4, c.phase, swing, c.headYaw, c.headPitch + nib, 0, 0, -lie * 1.3, lie * 1.35);
        n++;
        spot.see(c.x, c.y + 0.5, c.z, avatar.x, avatar.z, 0.7);
      }
      capySet.commit(inside ? 0 : n);

      // ---- egrets
      let ne = 0;
      for (const e of egrets) {
        if (!egretsOut || inside) {
          if (e.state !== "away") {
            e.state = "away";
            park(e.body);
          }
          continue;
        }
        if (e.state === "away") {
          // Back by day: wading on a bar again, only while the traveler is not close by.
          if (Math.hypot(e.bar.x - avatar.x, e.bar.z - avatar.z) > 40) landEgret(e, e.bar);
          else continue;
        }
        const d = Math.hypot(e.x - avatar.x, e.z - avatar.z);
        const spooked = d < (running ? 13 : 9) || groups.some((g) => g.bar === e.bar && g.alarm > 0);
        if (e.state !== "fly" && spooked && R() < dt * 3) flyEgret(e);
        let pitchT = 0;
        let wingT = FOLDED;
        let foldT = 1;
        switch (e.state) {
          case "stand": {
            e.timer -= dt;
            if (e.timer <= 0) {
              const r = R();
              if (r < 0.35) {
                e.state = "strike";
                e.timer = 0.6;
              } else if (r < 0.75) {
                e.state = "step";
                e.timer = 1.6;
                e.yaw += (R() - 0.5) * 1.6;
              } else e.timer = 1.5 + R() * 3;
            }
            pitchT = 0.35; // peering at the water
            break;
          }
          case "step": {
            e.timer -= dt;
            const nx = e.x + Math.sin(e.yaw) * 0.25 * dt * mot;
            const nz = e.z + Math.cos(e.yaw) * 0.25 * dt * mot;
            if (rim(e.bar, nx, nz)) {
              e.x = nx;
              e.z = nz;
              e.y = standY(e.bar, nx, nz);
            } else e.yaw += dt * 2;
            if (e.timer <= 0) {
              e.state = "stand";
              e.timer = 1 + R() * 3;
            }
            pitchT = 0.3;
            break;
          }
          case "strike": {
            e.timer -= dt;
            const k = 1 - e.timer / 0.6;
            pitchT = k < 0.35 ? 1.25 : 1.25 * (1 - (k - 0.35) / 0.65);
            if (k > 0.3 && k < 0.36 && R() < 0.5)
              ripples.spawn(e.x + Math.sin(e.yaw) * 0.5, e.z + Math.cos(e.yaw) * 0.5, 0.5);
            if (e.timer <= 0) {
              e.state = "stand";
              e.timer = 2 + R() * 4;
            }
            break;
          }
          case "fly": {
            e.u += dt / e.dur;
            const u = clamp01(e.u);
            const ee = u * u * (3 - 2 * u);
            const px = e.fx + (e.ex - e.fx) * ee;
            const pz = e.fz + (e.ez - e.fz) * ee;
            const py = e.fy + (e.ey - e.fy) * ee + Math.sin(Math.PI * u) * 3.2;
            const vx = px - e.x;
            const vz = pz - e.z;
            if (Math.hypot(vx, vz) > 1e-4) e.yaw = turnToward(e.yaw, Math.atan2(vx, vz), 4 * dt);
            e.x = px;
            e.y = py;
            e.z = pz;
            foldT = u > 0.85 ? 0.4 : 0;
            e.flap += dt * (u < 0.15 || u > 0.85 ? 7 : 4.2) * mot;
            wingT = rm ? 0.35 + Math.sin(e.flap) * 0.3 : Math.sin(e.flap) * 0.85 + 0.15;
            pitchT = 0.2;
            if (u >= 1) {
              if (e.dest) landEgret(e, e.dest);
              else {
                e.state = "away";
                park(e.body);
              }
            }
            break;
          }
        }
        if ((e.state as EgretState) === "away") continue;
        e.headPitch = damp(e.headPitch, pitchT, e.state === "strike" ? 18 : 4, dt);
        e.wing = e.state === "fly" ? wingT : damp(e.wing, wingT, 8, dt);
        e.fold = damp(e.fold, foldT, 8, dt);
        const lookE = d < 16 && e.state !== "fly" ? wrapAngle(Math.atan2(avatar.x - e.x, avatar.z - e.z) - e.yaw) : 0;
        e.headYaw = damp(e.headYaw, Math.max(-1, Math.min(1, lookE)), 3, dt);
        const pitch = e.state === "fly" ? 0.75 : 0;
        e.body.x = e.x;
        e.body.z = e.z;
        if (spot.view.dist(e.x, e.y, e.z) > FAUNA_FAR) continue;
        egretSet.set(ne, e.x, e.y, e.z, e.yaw, pitch, 0, 1.05, e.wing, e.headYaw, e.headPitch, e.fold);
        ne++;
      }
      egretSet.commit(ne);
      ripples.update(dt);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const c of capys) creatures.remove(c.body);
      for (const e of egrets) creatures.remove(e.body);
      capySet.dispose();
      egretSet.dispose();
      ripples.dispose();
      root.removeFromParent();
    },
  };
};
