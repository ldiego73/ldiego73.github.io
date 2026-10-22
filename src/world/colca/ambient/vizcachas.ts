/**
 * Vizcachas: the long-tailed, rabbit-eared rodents of Andean rock, sunning on boulders at the foot of the
 * colcas cliff and on the rocks beside the Cruz del Cóndor. They sit up, twitch and look about; when the
 * traveler comes within SPOOK_R one hops off its rock and hides, and comes back a while later. Out by day.
 *
 * Passport: within 12 u of a vizcacha in view stamps `colca:fauna:vizcacha`. One instanced mesh (the shared
 * fauna vizcacha, ../../fauna-models.ts vizcachaParts, merged) and one mesh for their boulders.
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { vizcachaParts } from "../../fauna-models";
import { mergeColored, vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CRAG, CRAG_LINE_Z } from "../plan";
import { seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

const SPOOK_R = 5.5;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lineZ = CRAG_LINE_Z;
  const C = layout.cruz;
  const cs = Math.cos(C.yaw);
  const sn = Math.sin(C.yaw);
  const spots: Array<{ x: number; z: number; r: number }> = [
    ...[-19, -14.5, -8.5, 9.5, 15, 20].map((dx, i) => ({
      x: CRAG.x + dx,
      z: lineZ + 1.6 + (i % 2) * 0.6,
      r: 0.7 + (i % 3) * 0.2,
    })),
    // Beside the Cruz del Cóndor platform, on the rim rocks (platform frame: x across, +z to the canyon).
    ...(
      [
        [-11.5, 1],
        [11.8, -1.5],
        [-13, -6],
      ] as const
    ).map(([lx, lz]) => ({ x: C.x + lx * cs + lz * sn, z: C.z - lx * sn + lz * cs, r: 0.85 })),
  ];
  let seed = 0x7ca;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rk = new VKit();
  const tops = spots.map((s) => {
    const y = env.heightAt(s.x, s.z);
    rk.rock(s.r * 1.4, s.x, y - 0.25, s.z, "#958271", rand, 0.75);
    return y - 0.25 + s.r * 1.4 * 0.35 + s.r * 1.4 * 0.62;
  });
  const rockGeo = rk.build();
  const rockMat = vertexToon();
  const rocks = new THREE.Mesh(rockGeo, rockMat);
  rocks.name = "colca-vizcachas:rocks";
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  env.scene.add(rocks);

  const P = vizcachaParts();
  const head = P.head.clone().translate(P.headPivot.x, P.headPivot.y, P.headPivot.z);
  const eyes = P.eyes.clone().translate(P.headPivot.x, P.headPivot.y, P.headPivot.z);
  const tail = P.tail.clone().translate(P.tailPivot.x, P.tailPivot.y, P.tailPivot.z);
  const geo = mergeColored([
    { geometry: P.body, color: new THREE.Color("#a59d93") },
    { geometry: head, color: new THREE.Color("#b1a99f") },
    { geometry: eyes, color: new THREE.Color("#1f1a17") },
    { geometry: tail, color: new THREE.Color("#4a3f37") },
  ]) as THREE.BufferGeometry;
  for (const g of [P.body, P.head, P.eyes, P.tail, head, eyes, tail]) g.dispose();
  // Moving bodies take no painted blotches (they would slide over them).
  const mat = paintStrength(vertexToon(), 0);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.name = "colca-vizcachas";
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  env.scene.add(mesh);
  const stamp = faunaStamp("vizcacha");
  const state = spots.map((_, i) => ({ away: 0, yaw: rand() * Math.PI * 2, look: rand() * 9, hop: 0, seed: i * 1.7 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let t = 0;
  return {
    update(dt, avatar) {
      t += dt;
      const time = env.sky.time();
      const out = time > 0.28 && time < 0.74;
      spots.forEach((sp, i) => {
        const st = state[i] as (typeof state)[number];
        const near = seenWithin(sp, avatar, SPOOK_R);
        if (near && st.away <= 0) {
          st.away = 12 + rand() * 8;
          st.hop = 0.5;
        }
        if (st.away > 0 && !near) st.away -= dt;
        if (st.hop > 0) st.hop -= dt;
        const visible = out && (st.away <= 0 || st.hop > 0);
        if (!visible) {
          mesh.setMatrixAt(i, HIDE);
          return;
        }
        if (seenWithin(sp, avatar, 12)) stamp();
        // Look about in quick turns; hop off (up and away) when spooked.
        if (!env.reducedMotion && t > st.look) {
          st.look = t + 1.5 + rand() * 4;
          st.yaw += (rand() - 0.5) * 1.6;
        }
        const k = st.hop > 0 ? 1 - st.hop / 0.5 : 0;
        const dx = sp.x - avatar.x;
        const dz = sp.z - avatar.z;
        const dd = Math.hypot(dx, dz) || 1;
        v.set(
          sp.x + (dx / dd) * k * 2.5,
          (tops[i] as number) + Math.sin(k * Math.PI) * 0.8,
          sp.z + (dz / dd) * k * 2.5,
        );
        q.setFromEuler(e.set(0, st.hop > 0 ? Math.atan2(dx, dz) : st.yaw, 0));
        s.setScalar(1.25 * (1 - k * 0.6));
        mesh.setMatrixAt(i, m.compose(v, q, s));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geo.dispose();
      mat.dispose();
      rocks.removeFromParent();
      rockGeo.dispose();
      rockMat.dispose();
    },
  };
};
