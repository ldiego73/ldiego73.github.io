/**
 * Giant hummingbirds (Patagona gigas, the largest hummingbird, at home on the dry slopes of the Colca) at the
 * flowering kantu bushes round the village plaza: each hovers at a flower for a few seconds, wings a blur,
 * then darts to another bush (./wild/logic.ts hoverPlan). Out by day. Drawn a little larger than life so
 * they read at walking distance.
 *
 * Passport: within 7 u of one stamps `colca:fauna:picaflor`. Two instanced draw calls (bodies, wings).
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { mergeColored, vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { FLOWERS, toWorld } from "./pueblo/logic";
import { hoverPlan, seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const SCALE = 1.7;

function bodyGeo(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.07, 8, 6);
  body.scale(0.9, 0.9, 1.6);
  const belly = new THREE.SphereGeometry(0.055, 8, 6);
  belly.scale(0.9, 0.8, 1.3);
  belly.translate(0, -0.02, 0.01);
  const head = new THREE.SphereGeometry(0.05, 8, 6);
  head.translate(0, 0.03, 0.1);
  const beak = new THREE.CylinderGeometry(0.006, 0.01, 0.14, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.03, 0.2);
  const tail = new THREE.BoxGeometry(0.06, 0.01, 0.1);
  tail.translate(0, -0.01, -0.15);
  const out = mergeColored([
    { geometry: body, color: new THREE.Color("#5f6a3f") },
    { geometry: belly, color: new THREE.Color("#c4875a") },
    { geometry: head, color: new THREE.Color("#55613a") },
    { geometry: beak, color: new THREE.Color("#1f1a17") },
    { geometry: tail, color: new THREE.Color("#4a5232") },
  ]) as THREE.BufferGeometry;
  for (const g of [body, belly, head, beak, tail]) g.dispose();
  return out;
}

function wingGeo(): THREE.BufferGeometry {
  // A narrow wing from the shoulder outward (+x), pivot at the origin.
  const g = new THREE.BoxGeometry(0.17, 0.006, 0.05);
  g.translate(0.085, 0, 0);
  const out = mergeColored([{ geometry: g, color: new THREE.Color("#3e4530") }]) as THREE.BufferGeometry;
  g.dispose();
  return out;
}

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const pl = layout.plaza("pueblo");
  const road = layout.trail.pointAt(layout.trail.nearestT(pl.x, pl.z));
  const frame = { x: pl.x, z: pl.z, yaw: Math.atan2(road.x - pl.x, road.z - pl.z) };
  const flowers = FLOWERS.map(([x, z]) => {
    const w = toWorld(frame, x, z);
    return { ...w, y: env.heightAt(w.x, w.z) + 1.1 };
  });
  const n = env.quality === "high" ? 3 : 2;
  const mat = vertexToon();
  const bGeo = bodyGeo();
  const wGeo = wingGeo();
  const bodies = new THREE.InstancedMesh(bGeo, mat, n);
  const wings = new THREE.InstancedMesh(wGeo, mat, n * 2);
  bodies.name = "colca-picaflores";
  wings.name = "colca-picaflores:wings";
  bodies.frustumCulled = false;
  wings.frustumCulled = false;
  env.scene.add(bodies, wings);
  const stamp = faunaStamp("picaflor");
  const root = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, "YXZ");
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3(SCALE, SCALE, SCALE);
  const flipY = new THREE.Matrix4().makeRotationY(Math.PI);
  let t = 0;
  return {
    update(dt, avatar) {
      t += dt;
      const time = env.sky.time();
      const day = time > 0.28 && time < 0.72;
      const nearby = Math.hypot(env.camera.position.x - pl.x, env.camera.position.z - pl.z) < 120;
      for (let i = 0; i < n; i++) {
        if (!day || !nearby) {
          bodies.setMatrixAt(i, HIDE);
          wings.setMatrixAt(i * 2, HIDE);
          wings.setMatrixAt(i * 2 + 1, HIDE);
          continue;
        }
        const plan = hoverPlan(env.reducedMotion ? 0 : t, flowers.length, i + 1);
        const a = flowers[plan.from] as (typeof flowers)[number];
        const b = flowers[plan.to] as (typeof flowers)[number];
        const k = plan.k * plan.k * (3 - 2 * plan.k);
        // Hover just outside the bush, on the side facing the plaza centre.
        const off = (f: { x: number; z: number }) => {
          const dx = pl.x - f.x;
          const dz = pl.z - f.z;
          const d = Math.hypot(dx, dz) || 1;
          return { x: f.x + (dx / d) * 1.15, z: f.z + (dz / d) * 1.15 };
        };
        const pa = off(a);
        const pb = off(b);
        const x = pa.x + (pb.x - pa.x) * k;
        const z = pa.z + (pb.z - pa.z) * k;
        const y =
          a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * 1.2 + (env.reducedMotion ? 0 : Math.sin(t * 3 + i) * 0.05);
        // Facing the flower while hovering, the way it flies while darting.
        const yaw = plan.k > 0 ? Math.atan2(pb.x - pa.x, pb.z - pa.z) : Math.atan2(a.x - pa.x, a.z - pa.z);
        q.setFromEuler(e.set(plan.k > 0 ? 0.1 : -0.35, yaw, 0));
        root.compose(v.set(x, y, z), q, sc);
        bodies.setMatrixAt(i, root);
        const flap = env.reducedMotion ? 0.3 : Math.sin(t * 70 + i) * 0.9;
        for (const side of [1, -1] as const) {
          // The left wing is the right one turned half round (no mirroring: it would flip the faces).
          m.makeRotationZ(flap);
          if (side === -1) m.premultiply(flipY);
          m.setPosition(side * 0.05, 0.03, 0.01);
          m.premultiply(root);
          wings.setMatrixAt(i * 2 + (side === 1 ? 0 : 1), m);
        }
        if (seenWithin({ x, z }, avatar, 7)) stamp();
      }
      bodies.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      bodies.removeFromParent();
      wings.removeFromParent();
      bodies.dispose();
      wings.dispose();
      bGeo.dispose();
      wGeo.dispose();
      mat.dispose();
    },
  };
};
