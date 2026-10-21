/**
 * Andean condors of the Colca canyon, kept where the traveler sees them (./condores/logic.ts):
 *  - Thermals: big, slow circles over the canyon, drifting from below the rim to well above it. The first
 *    thermals sit close to the rim road (by the village, the colcas, where the road leaves the rim, before
 *    the Cruz), so birds keep crossing the view as one walks or rides along the canyon. In the early
 *    morning the last two birds come to the thermal right in front of the Cruz del Cóndor and pass close by
 *    the viewpoint, as they do there. They go down to roost at dusk and are not in the air at night.
 *  - Low pass: about every 70 s while the traveler is on the rim (never on the pampa), the bird nearest to
 *    them leaves its thermal, glides down and passes ~9 u over their head, then rejoins its circle where it
 *    would have been (no jump). Not with reduced motion.
 *  - Perched pairs: two condors sit on a rock on the rim's shoulder by the colcas and two on a rock just
 *    east of the Cruz del Cóndor, wings folded, heads turning; in the early morning one of each pair opens
 *    its wings to the sun. They stay there day and night (condors roost on the canyon's rocks).
 *
 * Updrafts: each flying bird rides the shared wind's gust fronts (../../wind.ts liveWind, the same fronts that
 * wave the ichu and the flags): a front passing under its circle lifts it a couple of units, smoothly, and it
 * sinks back as the front goes by.
 *
 * Passport: a good look (a condor within 45 u of the traveler, by day) stamps `colca:fauna:condor`.
 * Rendering: ./condores/model.ts, three instanced draw calls for every bird (flying and perched), plus one
 * merged mesh for the two perch rocks. Flying bodies are registered in creatures (never solid).
 */

import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { liveWind } from "../../wind";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CANYON, rimZ } from "../plan";
import {
  type CPoint,
  type FlightPose,
  flying,
  onRim,
  onThermal,
  PASS,
  PERCHES,
  passAt,
  passDuration,
  perchPose,
  type Thermal,
  thermalFor,
} from "./condores/logic";
import { CondorFlock } from "./condores/model";

const STAMP = "colca:fauna:condor";
const LOOK_R = 45;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const n = env.quality === "high" ? 6 : 4;
  const nPerched = PERCHES.length * 2;
  const flock = new CondorFlock("colca-condors", n + nPerched, 0.95);
  env.scene.add(flock.group);
  const bodies = Array.from({ length: n }, () => creatures.add("condor", 1.2, { solid: false, x: 1e5, z: 1e5 }));
  // Each bird blends toward its current thermal (smoothly, when the morning moves two of them).
  const cur: Thermal[] = Array.from({ length: n }, (_, i) => ({ ...thermalFor(i, 0.4, layout.cruz.x, n) }));
  const rimY = CANYON.rimY;
  /** Each bird's current updraft lift (u), eased toward the gust under it; UPDRAFT u at a full front. */
  const lift = new Float32Array(n);
  const UPDRAFT = 2.6;
  let clock = Math.random() * 500;
  let stamped = false;

  // ------------------------------------------------------------------ perch rocks (one merged mesh)
  const kit = new VKit();
  const perchTop: number[] = [];
  const perchAt = PERCHES.map((p, k) => {
    const z = rimZ(p.x) + p.s;
    const y = env.heightAt(p.x, z);
    const h = 1.1 + k * 0.15;
    const rock = new THREE.DodecahedronGeometry(1, 0);
    kit.add(rock, "#8a7e6b", p.x, y + h * 0.35, z, 0.3, k * 1.7, 0.1, p.r, h, p.r * 0.85);
    kit.add(rock, "#9c8f7b", p.x + p.r * 0.7, y + 0.25, z + 0.3, 0.5, 0.4, 0, p.r * 0.5, 0.55, p.r * 0.5);
    // Whitewash streaks under the ledge (a perch in use).
    kit.add(rock, "#e4ddd0", p.x - 0.2, y + h * 0.75, z + p.r * 0.55, 0, 0, 0, 0.35, 0.12, 0.1);
    rock.dispose();
    perchTop.push(y + h * 1.32);
    return { x: p.x, z };
  });
  const rockGeo = kit.build();
  const rockMat = vertexToon();
  const rocks = new THREE.Mesh(rockGeo, rockMat);
  rocks.name = "colca-condor-perches";
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  env.scene.add(rocks);

  // ------------------------------------------------------------------ low pass state
  let nextPass = clock + 25;
  let pass: { i: number; start: number; dur: number; a: CPoint; over: CPoint; b: CPoint } | null = null;
  const pose = (i: number): FlightPose => onThermal(cur[i] as Thermal, clock, i);

  const stamp = () => {
    stamped = true;
    const entry = CATALOG.find((s) => s.id === STAMP);
    if (entry) emit("world:stamp", { id: STAMP, kind: "fauna", label: entry.label });
  };

  return {
    update(dt, avatar) {
      clock += env.reducedMotion ? dt * 0.5 : dt;
      const time = env.sky.time();
      const out = !flying(time);
      const avS = avatar.z - rimZ(avatar.x);

      // Start a low pass with the nearest flying bird (rim only, by day, not with reduced motion).
      if (!pass && !out && !env.reducedMotion && clock > nextPass) {
        if (onRim(avS)) {
          let best = -1;
          let bd: number = PASS.reach;
          for (let i = 0; i < n; i++) {
            const p = pose(i);
            const d = Math.hypot(p.x - avatar.x, rimZ(p.x) + p.s - avatar.z);
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          if (best >= 0) {
            const p = pose(best);
            const a = { x: p.x, s: p.s, y: p.y };
            const over = { x: avatar.x, s: avS, y: avatar.y - rimY + PASS.above };
            // Rejoin where the circle will be when the pass ends (estimated with a first duration).
            let dur = passDuration(a, over, a);
            const e = onThermal(cur[best] as Thermal, clock + dur, best);
            const b = { x: e.x, s: e.s, y: e.y };
            dur = passDuration(a, over, b);
            const e2 = onThermal(cur[best] as Thermal, clock + dur, best);
            pass = { i: best, start: clock, dur, a, over, b: { x: e2.x, s: e2.s, y: e2.y } };
            nextPass = clock + PASS.every;
          } else nextPass = clock + PASS.retry;
        } else nextPass = clock + PASS.retry;
      }
      if (pass && (out || clock - pass.start >= pass.dur)) pass = null;

      for (let i = 0; i < n; i++) {
        const body = bodies[i];
        if (out) {
          flock.hide(i);
          if (body) {
            body.x = 1e5;
            body.z = 1e5;
          }
          continue;
        }
        const want = thermalFor(i, time, layout.cruz.x, n);
        const c = cur[i] as Thermal;
        // The passing bird keeps its thermal fixed so it rejoins exactly where the pass ends.
        if (pass?.i !== i) {
          const k = Math.min(1, dt * 0.08);
          c.x += (want.x - c.x) * k;
          c.s += (want.s - c.s) * k;
          c.r += (want.r - c.r) * k;
          c.y0 += (want.y0 - c.y0) * k;
          c.y1 += (want.y1 - c.y1) * k;
          c.w = want.w;
        }
        const p = pass?.i === i ? passAt(pass.a, pass.over, pass.b, (clock - pass.start) / pass.dur) : pose(i);
        const z = rimZ(p.x) + p.s;
        const g = liveWind.sample(p.x, z).gust;
        lift[i] = (lift[i] as number) + (g * UPDRAFT - (lift[i] as number)) * Math.min(1, dt * 0.7);
        const y = rimY + p.y + (lift[i] as number);
        flock.set(i, { x: p.x, y, z, yaw: p.yaw, bank: p.bank, pitch: 0, wing: p.wing });
        if (body) {
          body.x = p.x;
          body.z = z;
        }
        if (!stamped && Math.hypot(p.x - avatar.x, y - avatar.y, z - avatar.z) < LOOK_R) stamp();
      }

      // Perched pairs (always there; the stamp only by day).
      for (let k = 0; k < nPerched; k++) {
        const r = k >> 1;
        const at = perchAt[r] as { x: number; z: number };
        const pp = perchPose(k & 1, time, clock);
        // In profile to the road: one faces along the rim each way, glancing over the canyon now and then.
        const yaw = pp.yaw;
        const y = (perchTop[r] as number) + 0.2;
        flock.set(n + k, {
          x: at.x + pp.dx,
          y,
          z: at.z,
          yaw,
          bank: 0,
          pitch: pp.pitch,
          wing: pp.wing,
          fold: pp.fold,
        });
        if (!stamped && !out && Math.hypot(at.x - avatar.x, y - avatar.y, at.z - avatar.z) < LOOK_R) stamp();
      }
      flock.commit();
    },
    dispose() {
      for (const b of bodies) creatures.remove(b);
      flock.dispose();
      rocks.removeFromParent();
      rockGeo.dispose();
      rockMat.dispose();
    },
  };
};
