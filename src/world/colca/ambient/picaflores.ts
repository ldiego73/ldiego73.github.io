/**
 * Giant hummingbirds (Patagona gigas, the largest hummingbird, at home on the dry slopes of the Colca) at the
 * flowering kantu bushes round the village plaza: each hovers at a flower for a few seconds, wings a blur,
 * then darts to another bush (./wild/logic.ts hoverPlan). Out by day. Drawn a little larger than life so
 * they read at walking distance.
 *
 * Passport: within 7 u of one stamps `colca:fauna:picaflor`. Rendering: the shared animals' hummingbird in the
 * giant's dull olive and cinnamon, one skinned body per bird (two or three draw calls), each scaled up as a
 * scene object; built off the main thread (prefetchAnimals) and shown once ready. The bird animator's flight
 * machine reads the hover and the dart from the speed.
 */
import * as THREE from "three";
import { type Animal, createAnimal } from "../../characters/animals/animal";
import { prefetchAnimals } from "../../characters/animals/assets";
import { bpal } from "../../characters/animals/species/birds";
import type { CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { FLOWERS, toWorld } from "./pueblo/logic";
import { hoverPlan, seenWithin } from "./wild/logic";
import { faunaStamp } from "./wild/stamp";

/** Larger than life (the giant hummingbird is ≈ 0.2 m; the shared bird is ≈ 0.15 u long). */
const SCALE = 2.6;
/** Patagona gigas: olive-brown back, cinnamon belly, a dark tail and wings, a long black bill. */
const GIANT = bpal({
  back: "#626b40",
  head: "#5a6338",
  bill: "#1a1818",
  legs: "#1a1818",
  belly: "#c4875a",
  coverts: "#5a6238",
  flight: "#3e4530",
  tail: "#4a5232",
  face: "#5a6338",
});

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
  const birds: Array<Animal | null> = Array.from({ length: n }, () => null);
  let disposed = false;
  // Every LOD is built off the main thread first, so the LOD switches never build on a frame.
  void prefetchAnimals(["hummingbird"]).then(() => {
    if (disposed) return;
    for (let i = 0; i < n; i++) {
      const a = createAnimal("hummingbird", { variant: GIANT, seed: 21 + i * 5, lod: 1 });
      a.group.name = "colca-picaflores";
      a.group.scale.setScalar(SCALE);
      a.group.visible = false;
      env.scene.add(a.group);
      birds[i] = a;
    }
  });
  const stamp = faunaStamp("picaflor");
  const prev = Array.from({ length: n }, () => new THREE.Vector3(Number.NaN, 0, 0));
  let t = 0;
  return {
    update(dtIn, avatar, clock) {
      const dt = Math.min(dtIn, 0.05);
      t += dt;
      const time = env.sky.time();
      const day = time > 0.28 && time < 0.72;
      const nearby = Math.hypot(env.camera.position.x - pl.x, env.camera.position.z - pl.z) < 120;
      for (let i = 0; i < n; i++) {
        const bird = birds[i];
        if (!bird) continue;
        if (!day || !nearby) {
          bird.group.visible = false;
          (prev[i] as THREE.Vector3).x = Number.NaN;
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
        const p = prev[i] as THREE.Vector3;
        // Speed and climb in the bird's own size (the animator reads a 0.15 u bird; this one is SCALE × that).
        const speed = Number.isNaN(p.x) ? 0 : Math.hypot(x - p.x, z - p.z) / dt / SCALE;
        const vy = Number.isNaN(p.x) ? 0 : (y - p.y) / dt / SCALE;
        p.set(x, y, z);
        bird.group.visible = true;
        bird.group.position.set(x, y, z);
        bird.group.rotation.y = yaw;
        bird.update(dt, clock, { speed, rm: env.reducedMotion, grounded: false, vy, height: 1 });
        bird.autoLod(env.camera, SCALE);
        if (seenWithin({ x, z }, avatar, 7)) stamp();
      }
    },
    dispose() {
      disposed = true;
      for (const b of birds) {
        b?.group.removeFromParent();
        b?.dispose();
      }
    },
  };
};
