/**
 * Eared doves (tórtolas, native to the Andes) on Haukaypata's flagstones: a small flock pecking and hopping
 * by day; when the traveler comes within FLEE_R a dove (and its neighbours) takes off in a flapping arc and
 * lands on open flagstones away from them (./doves/logic.ts). At night they are gone (roosting). With
 * prefers-reduced-motion they still move away, gliding without wing beats.
 *
 * Two instanced meshes for the whole flock (bodies; wings, two per dove), no outline on the small wings.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { mergeColored, vertexToon } from "../../merge-colors";
import { FLEE_R, flightAt, flightTime, pickLanding, type Spot, shouldFlee } from "./doves/logic";
import { isDay } from "./life/logic";

interface Dove {
  x: number;
  z: number;
  yaw: number;
  state: "ground" | "fly";
  from: Spot;
  to: Spot;
  t: number;
  dur: number;
  peck: number;
  hop: number;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bodyGeometry(): THREE.BufferGeometry | null {
  const body = new THREE.SphereGeometry(0.11, 8, 6);
  body.scale(0.85, 0.8, 1.35);
  body.translate(0, 0.13, 0);
  const head = new THREE.SphereGeometry(0.06, 7, 5);
  head.translate(0, 0.22, 0.13);
  const beak = new THREE.ConeGeometry(0.015, 0.05, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.21, 0.2);
  const tail = new THREE.BoxGeometry(0.07, 0.015, 0.14);
  tail.translate(0, 0.14, -0.18);
  const parts = [
    { geometry: body, color: new THREE.Color("#b39b86") },
    { geometry: head, color: new THREE.Color("#a68c78") },
    { geometry: beak, color: new THREE.Color("#2b2420") },
    { geometry: tail, color: new THREE.Color("#7f6a59") },
  ];
  const g = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return g;
}

function wingGeometry(): THREE.BufferGeometry {
  // One wing along +X from the shoulder (a flat tapered quad pair).
  const g = new THREE.BufferGeometry();
  const v = [0, 0, 0.06, 0.2, 0, 0.04, 0.2, 0, -0.06, 0, 0, -0.08];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export const create: CreateAmbient = (env): Ambient => {
  const R = rng(0xd0e);
  const n = env.quality === "high" ? 14 : 9;
  const mat = vertexToon();
  const geo = bodyGeometry() ?? new THREE.BoxGeometry(0.2, 0.2, 0.3);
  const bodies = new THREE.InstancedMesh(geo, mat, n);
  bodies.name = "cusco-doves";
  bodies.frustumCulled = false;
  const wingGeo = wingGeometry();
  const wingMat = env.toon("#8e7a68").clone();
  wingMat.side = THREE.DoubleSide;
  const wings = new THREE.InstancedMesh(wingGeo, wingMat, n * 2);
  wings.name = "cusco-doves:wings";
  wings.frustumCulled = false;
  env.noOutline(wings);
  env.scene.add(bodies, wings);

  // Two groups pecking near the usnu's south and north-west.
  const doves: Dove[] = Array.from({ length: n }, (_, i) => {
    const c = i % 2 ? { x: -12, z: -9 } : { x: 9, z: 12 };
    const x = c.x + (R() - 0.5) * 6;
    const z = c.z + (R() - 0.5) * 5;
    return {
      x,
      z,
      yaw: R() * 6.28,
      state: "ground",
      from: { x, z },
      to: { x, z },
      t: 0,
      dur: 1,
      peck: R() * 3,
      hop: 0,
    };
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const wingM = new THREE.Matrix4();
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const shoulder = new THREE.Matrix4();
  const rm = env.reducedMotion;
  let clock = 0;
  let shown = true;

  const takeOff = (d: Dove, avatar: Spot) => {
    d.state = "fly";
    d.from = { x: d.x, z: d.z };
    d.to = pickLanding(R, avatar, { x: d.x, z: d.z });
    d.t = 0;
    d.dur = flightTime(Math.hypot(d.to.x - d.x, d.to.z - d.z));
  };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const day = isDay(env.sky.time());
      if (!day) {
        if (shown) {
          bodies.visible = false;
          wings.visible = false;
          shown = false;
        }
        return;
      }
      if (!shown) {
        bodies.visible = true;
        wings.visible = true;
        shown = true;
      }
      const near = Math.hypot(env.camera.position.x - 0, env.camera.position.z - 0) < 140;
      doves.forEach((d, i) => {
        let y = 0;
        let flap = 0;
        let pitch = 0;
        if (d.state === "ground") {
          if (shouldFlee(d, avatar)) {
            takeOff(d, avatar);
            // Neighbours startle too.
            for (const o of doves)
              if (o !== d && o.state === "ground" && Math.hypot(o.x - d.x, o.z - d.z) < FLEE_R) takeOff(o, avatar);
          } else {
            d.peck -= dt;
            if (d.peck < 0) {
              d.peck = 0.6 + R() * 2.4;
              // A small hop now and then, turning.
              if (R() < 0.35) {
                d.hop = 0.25;
                d.yaw += (R() - 0.5) * 1.6;
              }
            }
            if (d.hop > 0) {
              d.hop -= dt;
              const k = Math.max(0, d.hop) / 0.25;
              y = Math.sin(k * Math.PI) * 0.06;
              d.x += Math.sin(d.yaw) * dt * 0.8;
              d.z += Math.cos(d.yaw) * dt * 0.8;
            }
            pitch = !rm && d.peck < 0.35 ? 0.5 : 0;
          }
        }
        if (d.state === "fly") {
          d.t += dt / d.dur;
          const f = flightAt(d.from, d.to, d.t, 2.2 + (i % 3) * 0.5);
          d.x = f.x;
          d.z = f.z;
          d.yaw = f.yaw;
          y = f.y;
          flap = rm ? 0.2 : Math.sin(clock * 26 + i) * 0.9;
          if (d.t >= 1) {
            d.state = "ground";
            d.peck = 1 + R();
          }
        }
        if (!near) {
          bodies.setMatrixAt(i, zero);
          wings.setMatrixAt(i * 2, zero);
          wings.setMatrixAt(i * 2 + 1, zero);
          return;
        }
        q.setFromEuler(e.set(pitch, d.yaw, 0, "YXZ"));
        p.set(d.x, y, d.z);
        m.compose(p, q, s);
        bodies.setMatrixAt(i, m);
        // Wings only show in flight (on the ground they are folded into the body's shape).
        for (const side of [-1, 1]) {
          const slot = i * 2 + (side < 0 ? 0 : 1);
          if (d.state !== "fly") {
            wings.setMatrixAt(slot, zero);
            continue;
          }
          wingM.makeRotationZ(0.35 + flap);
          if (side < 0) wingM.premultiply(mirror);
          wingM.premultiply(shoulder.makeTranslation(side * 0.05, 0.17, 0.02));
          wingM.premultiply(m);
          wings.setMatrixAt(slot, wingM);
        }
      });
      bodies.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      bodies.removeFromParent();
      wings.removeFromParent();
      bodies.dispose();
      wings.dispose();
      geo.dispose();
      wingGeo.dispose();
      mat.dispose();
      wingMat.dispose();
    },
  };
};
