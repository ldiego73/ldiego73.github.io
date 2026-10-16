/**
 * Cahuachi: a small stepped adobe pyramid beside the road on the pampa's western edge, after the great
 * ceremonial centre of the Nazca culture near the lines (a compressed tribute: the real Cahuachi is a field of
 * adobe mounds by the Nazca river). Five mud-brick tiers with a central ramp, weathered to the pampa's
 * colours, a few broken adobe walls round its foot and a carved sign. Reaching its little plaza is a bonus
 * stamp (`colca:station:cahuachi`, kind "egg").
 *
 * One vertex-coloured mesh and one sign; the pyramid is a collider (not climbable).
 */
import * as THREE from "three";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { signBoard, VKit } from "../kit";
import type { ColcaLayout } from "../layout";

const S = {
  sign: { es: "CAHUACHI", en: "CAHUACHI" },
  sub: { es: "Pirámide de adobe · cultura Nasca", en: "Adobe pyramid · Nazca culture" },
} satisfies Record<string, L>;

const TIERS = 5;
const BASE = 19;
const STEP_IN = 1.7;
const TIER_H = 2.3;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const pl = layout.plaza("cahuachi");
  const road = layout.trail.pointAt(layout.trail.nearestT(pl.x, pl.z));
  const dx = pl.x - road.x;
  const dz = pl.z - road.z;
  const d = Math.hypot(dx, dz) || 1;
  // The pyramid stands beyond the plaza, facing it (and the road).
  const cx = pl.x + (dx / d) * (pl.r + BASE / 2 + 1.5);
  const cz = pl.z + (dz / d) * (pl.r + BASE / 2 + 1.5);
  const yaw = Math.atan2(-dx, -dz);
  const y0 = Math.min(env.heightAt(cx, cz), pl.y) - 0.6;
  let seed = 0xca4;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const k = new VKit().at(cx, y0, cz, yaw);
  for (let i = 0; i < TIERS; i++) {
    const w = BASE - i * STEP_IN * 2;
    const c = i % 2 ? "#b78a63" : "#a97c57";
    k.box(w, TIER_H + 0.6, w, 0, i * TIER_H, 0, c);
    // Eroded edges: lumps along the rim of each tier.
    for (let j = 0; j < 6; j++) {
      const a = rand() * Math.PI * 2;
      k.rock(
        0.6 + rand() * 0.5,
        Math.cos(a) * w * 0.48,
        i * TIER_H + TIER_H + 0.3,
        Math.sin(a) * w * 0.48,
        "#9f7752",
        rand,
        0.5,
      );
    }
  }
  // Central ramp up the front (toward the plaza, +z).
  const top = TIERS * TIER_H;
  const rampLen = BASE / 2 + 2;
  const slope = Math.atan2(top, rampLen);
  k.box(3.2, 0.6, Math.hypot(top, rampLen), 0, top / 2 - 0.3, BASE / 2 - rampLen / 2 + 1, "#c29a72", 0, slope);
  // Broken adobe walls round the foot.
  for (const [x, z, w, r] of [
    [-13, 4, 6, 0.3],
    [13, -2, 5, -0.2],
    [-10, -12, 7, 1.2],
    [9, 12, 4, -0.9],
  ] as const) {
    for (let i = 0; i < 4; i++)
      k.box(
        w / 4 - 0.1,
        0.6 + rand() * 1.4,
        0.7,
        x + Math.cos(r) * (i - 1.5) * (w / 4),
        0,
        z - Math.sin(r) * (i - 1.5) * (w / 4),
        "#ae8560",
        r,
      );
  }
  const geo = k.build();
  const mat = vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-cahuachi";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  env.scene.add(mesh);
  const sign = signBoard(env.toon as (c: string) => THREE.Material, {
    w: 2.4,
    title: S.sign[env.lang],
    sub: S.sub[env.lang],
  });
  const sx = pl.x - (dx / d) * 1.5 + (dz / d) * 3.5;
  const sz = pl.z - (dz / d) * 1.5 - (dx / d) * 3.5;
  sign.mesh.position.set(sx, env.heightAt(sx, sz) + 1.1, sz);
  sign.mesh.rotation.y = Math.atan2(-dx, -dz);
  env.scene.add(sign.mesh);
  env.addCollider({ kind: "circle", x: sx, z: sz, r: 0.35 });
  env.addCollider({ kind: "circle", x: cx, z: cz, r: BASE / 2 + 1 });
  const keep = creatures.keepOut(cx, cz, BASE / 2 + 3);
  return {
    update() {},
    dispose() {
      creatures.removeKeepOut(keep);
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      sign.mesh.removeFromParent();
      sign.dispose();
    },
  };
};
