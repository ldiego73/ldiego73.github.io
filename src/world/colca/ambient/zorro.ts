/**
 * An Andean fox (Lycalopex culpaeus, the atoq) out at dusk and at night: it trots a loop on the rim plateau
 * north of the road between the colcas and the descent to the pampa, nose down. When the traveler is within
 * WATCH_R it stops and watches them, ears up; closer than FLEE_R it lopes off along its loop. By day it is
 * not out.
 *
 * Passport: within 20 u of it stamps `colca:fauna:zorro`. Two instanced draw calls (body with head and tail,
 * legs). Its body is in creatures (solid).
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { mergeColored, vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { roadSide } from "../plan";
import { foxHours, seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const WATCH_R = 22;
const FLEE_R = 8;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function foxGeo(): { body: THREE.BufferGeometry; leg: THREE.BufferGeometry } {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [];
  const add = (g: THREE.BufferGeometry, c: string) => parts.push({ geometry: g, color: new THREE.Color(c) });
  const torso = new THREE.CapsuleGeometry(0.17, 0.5, 4, 8);
  torso.rotateX(Math.PI / 2);
  torso.translate(0, 0.52, 0);
  add(torso, "#a8724a");
  const chest = new THREE.SphereGeometry(0.15, 8, 6);
  chest.translate(0, 0.5, 0.3);
  add(chest, "#e8d9c0");
  const head = new THREE.SphereGeometry(0.13, 8, 6);
  head.scale(1, 0.9, 1.1);
  head.translate(0, 0.72, 0.48);
  add(head, "#b07a4e");
  const snout = new THREE.ConeGeometry(0.07, 0.2, 6);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, 0.69, 0.66);
  add(snout, "#c99a6c");
  const nose = new THREE.SphereGeometry(0.025, 5, 4);
  nose.translate(0, 0.69, 0.76);
  add(nose, "#1f1a17");
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.05, 0.15, 4);
    ear.translate(s * 0.07, 0.86, 0.44);
    add(ear, "#8f5a3a");
  }
  const tail = new THREE.CapsuleGeometry(0.08, 0.42, 4, 6);
  tail.rotateX(-1.1);
  tail.translate(0, 0.45, -0.52);
  add(tail, "#9a6a46");
  const tip = new THREE.SphereGeometry(0.08, 6, 5);
  tip.translate(0, 0.28, -0.72);
  add(tip, "#2a2320");
  const body = mergeColored(parts) as THREE.BufferGeometry;
  for (const p of parts) p.geometry.dispose();
  const l = new THREE.CylinderGeometry(0.04, 0.035, 0.42, 5);
  l.translate(0, -0.21, 0);
  const leg = mergeColored([{ geometry: l, color: new THREE.Color("#6e4a33") }]) as THREE.BufferGeometry;
  l.dispose();
  return { body, leg };
}

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  // A loop on the plateau north of the road, west of the colcas.
  const loop = [0.3, 0.33, 0.36, 0.39, 0.36, 0.33].map((t, i) => roadSide(t, 1, i < 3 ? 22 : 38));
  const g = foxGeo();
  const mat = vertexToon();
  const body = new THREE.InstancedMesh(g.body, mat, 1);
  const legs = new THREE.InstancedMesh(g.leg, mat, 4);
  body.name = "colca-zorro";
  legs.name = "colca-zorro:legs";
  body.frustumCulled = false;
  legs.frustumCulled = false;
  body.castShadow = true;
  env.scene.add(body, legs);
  const bodyC = creatures.add("zorro", 0.4, { x: 1e5, z: 1e5 });
  const stamp = faunaStamp("zorro");
  const start = loop[0] as { x: number; z: number };
  let x = start.x;
  let z = start.z;
  let yaw = 0;
  let to = 1;
  let speed = 0;
  let phase = 0;
  const root = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1.15, 1.15, 1.15);
  const hips: Array<[number, number]> = [
    [0.1, 0.32],
    [-0.1, 0.32],
    [0.1, -0.28],
    [-0.1, -0.28],
  ];
  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      if (!foxHours(env.sky.time())) {
        body.setMatrixAt(0, HIDE);
        for (let k = 0; k < 4; k++) legs.setMatrixAt(k, HIDE);
        body.instanceMatrix.needsUpdate = true;
        legs.instanceMatrix.needsUpdate = true;
        bodyC.x = 1e5;
        bodyC.z = 1e5;
        return;
      }
      const da = Math.hypot(avatar.x - x, avatar.z - z);
      if (seenWithin({ x, z }, avatar, 20)) stamp();
      const target = loop[to] as { x: number; z: number };
      const dx = target.x - x;
      const dz = target.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 1) to = (to + 1) % loop.length;
      let want = 1.6;
      let face = Math.atan2(dx, dz);
      if (da < FLEE_R) want = 5.2;
      else if (da < WATCH_R) {
        want = 0;
        face = Math.atan2(avatar.x - x, avatar.z - z);
      }
      speed += (want - speed) * Math.min(1, dt * 3);
      if (speed > 0.05) {
        x += (dx / (d || 1)) * speed * dt;
        z += (dz / (d || 1)) * speed * dt;
      }
      let dy = face - yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * Math.min(1, dt * 4);
      bodyC.x = x;
      bodyC.z = z;
      if (!env.reducedMotion) phase += dt * speed * 5;
      const y = env.suyu.groundAt(x, z);
      q.setFromEuler(e.set(0, yaw, 0));
      root.compose(v.set(x, y, z), q, one);
      body.setMatrixAt(0, root);
      hips.forEach(([hx, hz], k) => {
        const diag = k === 0 || k === 3 ? 1 : -1;
        m.makeRotationX(Math.sin(phase) * 0.6 * Math.min(1, speed / 1.6) * diag).setPosition(hx, 0.44, hz);
        m.premultiply(root);
        legs.setMatrixAt(k, m);
      });
      body.instanceMatrix.needsUpdate = true;
      legs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      creatures.remove(bodyC);
      body.removeFromParent();
      legs.removeFromParent();
      body.dispose();
      legs.dispose();
      g.body.dispose();
      g.leg.dispose();
      mat.dispose();
    },
  };
};
