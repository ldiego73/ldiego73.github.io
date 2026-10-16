/**
 * The lake's birds (field guide: ../wildlife.ts):
 *  - Titicaca grebes (zambullidor, Rollandia microptera): flightless, they float in the reed beds along the
 *    shore and round the Uros islands, paddling about their patch; every so often, or when the traveler comes
 *    within a few metres, one dives and comes up a few metres off some seconds later.
 *  - Andean flamingos (parihuana, Phoenicoparrus andinus): a flock wading in the shallow bay between Taquile and
 *    the Isla del Sol, heads down sweeping the water for food, walking on slowly; now and then one lifts its
 *    head and spreads its wings (black flight feathers); they walk away from a traveler who comes close.
 *  - Andean gulls (Chroicocephalus serranus): circling over the Uros bay, Taquile and the shore, and a few
 *    resting on the water by the islands.
 * By day. At night the grebes sleep on the water among the reeds, the flamingos stand still with their heads
 * tucked in and the gulls rest on the water. A good look (close and on screen for a moment) earns the bonus
 * stamps `titicaca:fauna:zambullidor`, `…:flamenco`, `…:gaviota`. Draw calls: grebes 1, flamingos 3 (body,
 * neck, wings), gulls 2 (bodies, wings). Pure logic: ./fauna/logic.ts; models: ./fauna/models.ts.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import type { TiticacaLayout } from "../layout";
import { FLAMINGO_BAY, ISLANDS, LEVEL } from "../plan";
import { reedFree } from "../scenery/placement";
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
} from "./fauna/logic";
import {
  flamingoBodyGeometry,
  flamingoNeckGeometry,
  flamingoWingsGeometry,
  grebeGeometry,
  gullBodyGeometry,
  gullWingGeometry,
} from "./fauna/models";

const v3 = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s3 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();

function instanced(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, count: number) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.name = name;
  m.frustumCulled = false;
  m.castShadow = true;
  return m;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as TiticacaLayout;
  const R = rng(0xa7e5);
  const high = env.quality === "high";
  const mat = vertexToon();
  const group = new THREE.Group();
  group.name = "titicaca-aves";
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
    grebes.push({ home: { x, z, r: 5 }, x, z, yaw: R() * TAU, tx: x, tz: z, phase: "float", timer: 3 + R() * 10 });
  }
  const grebeOk = (x: number, z: number) => L.landField(x, z) < -1.5 && reedFree(x, z);
  const grebeGeo = grebeGeometry();
  const grebeMesh = instanced("titicaca-aves:grebes", grebeGeo, mat, Math.max(1, grebes.length));
  group.add(grebeMesh);

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
    sweep: number;
    look: number;
    wings: number;
    wingT: number;
    body: Body;
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
      sweep: R() * TAU,
      look: 0,
      wings: 0,
      wingT: 8 + R() * 20,
      body: creatures.add("flamingo", 0.35, { x, z, give: 0.5 }),
    });
  }
  const flamBody = instanced("titicaca-aves:flamingos", flamingoBodyGeometry(), mat, Math.max(1, flamingos.length));
  const flamNeck = instanced(
    "titicaca-aves:flamingo-necks",
    flamingoNeckGeometry(),
    mat,
    Math.max(1, flamingos.length),
  );
  const flamWings = instanced(
    "titicaca-aves:flamingo-wings",
    flamingoWingsGeometry(),
    mat,
    Math.max(1, flamingos.length),
  );
  group.add(flamBody, flamNeck, flamWings);

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
  const nGulls = soars.length + resting.length;
  const gullBodies = instanced("titicaca-aves:gulls", gullBodyGeometry(), mat, nGulls);
  const gullWings = instanced("titicaca-aves:gull-wings", gullWingGeometry(), mat, nGulls * 2);
  group.add(gullBodies, gullWings);
  env.scene.add(group);

  const looks = { grebe: new LookTimer(1.4), flamingo: new LookTimer(1.4), gull: new LookTimer(1.6) };
  let clock = 0;
  const rm = env.reducedMotion;
  const tmp = new THREE.Vector3();
  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const day = daylight(env.sky.time()) > 0.3;

      // ----- grebes
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
        if (g.phase === "float" && day) {
          if (Math.hypot(g.tx - g.x, g.tz - g.z) < 0.4) {
            const t = wanderTarget(g.home, R, grebeOk);
            g.tx = t.x;
            g.tz = t.z;
          }
          const want = Math.atan2(g.tx - g.x, g.tz - g.z);
          g.yaw = turnToward(g.yaw, want, dt * 1.6);
          const sp = 0.35;
          g.x += Math.sin(g.yaw) * sp * dt;
          g.z += Math.cos(g.yaw) * sp * dt;
        }
        const depth = diveDepth(g.phase, g.timer);
        const bob = rm ? 0 : Math.sin(clock * 2 + i) * 0.015;
        // Diving: a forward tip as it goes under.
        const tip = g.phase === "down" ? 0.6 : g.phase === "up" ? -0.3 : 0;
        q.setFromEuler(e.set(tip, g.yaw, 0));
        s3.setScalar(g.phase === "under" ? 0 : 1.15);
        m4.compose(v3.set(g.x, LEVEL - depth + bob, g.z), q, s3);
        grebeMesh.setMatrixAt(i, m4);
        if (g.phase === "float" && dAv < 16 && onScreen(g.x, LEVEL + 0.2, g.z, 16)) grebeSeen = true;
      });
      grebeMesh.instanceMatrix.needsUpdate = true;
      if (looks.grebe.update(dt, grebeSeen)) stamp("titicaca:fauna:zambullidor");

      // ----- flamingos
      let flamSeen = false;
      flamingos.forEach((f, i) => {
        const dAv = Math.hypot(avatar.x - f.x, avatar.z - f.z);
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
            const want = Math.atan2(f.tx - f.x, f.tz - f.z);
            f.yaw = turnToward(f.yaw, want, dt * 1.2);
            const sp = dAv < 9 ? 0.9 : 0.35;
            f.x += Math.sin(f.yaw) * sp * dt;
            f.z += Math.cos(f.yaw) * sp * dt;
          }
          // The wing stretch now and then.
          f.wingT -= dt;
          if (f.wingT <= 0) {
            f.wings = 2.2;
            f.wingT = 14 + R() * 25;
          }
          f.wings = Math.max(0, f.wings - dt);
          f.look = damp(f.look, f.wings > 0 || dAv < 12 ? 1 : 0, 3, dt);
        } else {
          f.look = damp(f.look, 0, 2, dt);
          f.wings = 0;
        }
        f.body.x = f.x;
        f.body.z = f.z;
        const y = Math.max(L.heightAt(f.x, f.z), LEVEL - 0.8);
        const walkBob = rm ? 0 : Math.abs(Math.sin(clock * 3 + i)) * 0.02;
        q.setFromEuler(e.set(0, f.yaw, 0));
        m4.compose(v3.set(f.x, y + walkBob, f.z), q, s3.set(1, 1, 1));
        flamBody.setMatrixAt(i, m4);
        // Neck: feeding (head down, sweeping) or up looking about; at night tucked back on the body.
        f.sweep += dt * (rm ? 0.5 : 1.6);
        const feed = day ? 1 - f.look : 0;
        const pitch = day ? 2.25 * feed + (rm ? 0 : Math.sin(clock * 0.7 + i) * 0.08) : -1.2;
        const turn = day ? Math.sin(f.sweep) * 0.5 * feed : 0.4;
        m5.compose(v3.set(0, 1.3, 0.3), q.setFromEuler(e.set(pitch, turn, 0)), s3.set(1, day ? 1 : 0.6, 1));
        m4.multiply(m5);
        flamNeck.setMatrixAt(i, m4);
        const spread = f.wings > 0 ? Math.min(1, f.wings * 2, (2.2 - f.wings) * 4) : 0;
        q.setFromEuler(e.set(0, f.yaw, 0));
        m4.compose(v3.set(f.x, y + walkBob + 1.25, f.z), q, s3.set(spread, 1, spread > 0 ? 1 : 0));
        flamWings.setMatrixAt(i, m4);
        if (dAv < 30 && onScreen(f.x, y + 1.2, f.z, 30)) flamSeen = true;
      });
      flamBody.instanceMatrix.needsUpdate = true;
      flamNeck.instanceMatrix.needsUpdate = true;
      flamWings.instanceMatrix.needsUpdate = true;
      if (looks.flamingo.update(dt, flamSeen)) stamp("titicaca:fauna:flamenco");

      // ----- gulls
      let gullSeen = false;
      let k = 0;
      for (const s of soars) {
        // At night the soaring gulls come down to rest on the water under their circle.
        const p = soarPose(s, rm ? clock * 0.5 : clock);
        const y = day ? p.y : LEVEL + 0.05;
        q.setFromEuler(e.set(0, p.yaw, day ? p.bank : 0));
        m4.compose(v3.set(p.x, y, p.z), q, s3.set(1.4, 1.4, 1.4));
        gullBodies.setMatrixAt(k, m4);
        const flap = day ? (rm ? 0.1 : Math.sin(clock * 5 + k) * 0.35 * (0.5 + 0.5 * Math.sin(clock * 0.4 + k))) : 1.2;
        for (const side of [-1, 1]) {
          m5.compose(
            tmp.set(side * 0.08, 0.04, 0),
            q.setFromEuler(e.set(0, 0, side * (flap + (day ? 0.05 : 0)))),
            s3.set(side, 1, 1),
          );
          q.setFromEuler(e.set(0, p.yaw, day ? p.bank : 0));
          m4.compose(v3.set(p.x, y, p.z), q, s3.set(1.4, 1.4, 1.4)).multiply(m5);
          gullWings.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), m4);
        }
        if (day && Math.hypot(avatar.x - p.x, avatar.z - p.z) < 30 && onScreen(p.x, y, p.z, 40)) gullSeen = true;
        k++;
      }
      for (const r of resting) {
        const bob = rm ? 0 : Math.sin(clock * 1.5 + k) * 0.02;
        q.setFromEuler(e.set(0, r.yaw + Math.sin(clock * 0.2 + k) * 0.3, 0));
        m4.compose(v3.set(r.x, LEVEL + 0.06 + bob, r.z), q, s3.set(1.4, 1.4, 1.4));
        gullBodies.setMatrixAt(k, m4);
        for (const side of [-1, 1]) {
          m5.compose(
            tmp.set(side * 0.06, 0.05, -0.02),
            q.setFromEuler(e.set(0, side * 2.9, side * 0.1)),
            s3.set(side * 0.55, 1, 1),
          );
          q.setFromEuler(e.set(0, r.yaw + Math.sin(clock * 0.2 + k) * 0.3, 0));
          m4.compose(v3.set(r.x, LEVEL + 0.06 + bob, r.z), q, s3.set(1.4, 1.4, 1.4)).multiply(m5);
          gullWings.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), m4);
        }
        if (Math.hypot(avatar.x - r.x, avatar.z - r.z) < 18 && onScreen(r.x, LEVEL, r.z, 18)) gullSeen = true;
        k++;
      }
      gullBodies.instanceMatrix.needsUpdate = true;
      gullWings.instanceMatrix.needsUpdate = true;
      if (looks.gull.update(dt, gullSeen)) stamp("titicaca:fauna:gaviota");
    },
    dispose() {
      for (const f of flamingos) creatures.remove(f.body);
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of [grebeMesh, flamBody, flamNeck, flamWings, gullBodies, gullWings]) m.dispose();
      mat.dispose();
      group.removeFromParent();
    },
  };
};
