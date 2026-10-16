/**
 * Plants and stones of the Kuntisuyu, instanced (one draw call per kind), seeded and placed on open ground
 * (layout.isGround):
 *  - ichu: bunch-grass tufts, the puna's straw, thick near the road on the rim plateau, sparse on the pampa;
 *  - tola: low rounded resinous shrubs of the puna;
 *  - cactus: columnar cacti (the Colca's tall, ribbed candelabra cacti) near the rim and on the road's
 *    descent, a few on the pampa's edge;
 *  - stones: angular boulders, more on the rim and the pampa's hills.
 * The pampa's middle stays bare so the geoglyphs read. Thinner on the low tier; never culled by distance (the
 * far ones fade into the haze). Ichu without ink outline (thin blades would be all ink far away).
 */
import * as THREE from "three";
import type { Quality } from "../../engine";
import { mergeColored } from "../../merge-colors";
import { NO_OUTLINE_LAYER, type ToonCache } from "../../toon";
import type { ColcaLayout } from "../layout";
import { CANYON, canyonS, HALF, PAMPA, TOWER } from "../plan";

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Parts = Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }>;
const done = (parts: Parts) => {
  const out = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return out;
};

function ichu(): THREE.BufferGeometry | null {
  const parts: Parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.ConeGeometry(0.07, 0.75 + (i % 3) * 0.18, 3);
    g.translate(0, 0.38, 0);
    g.rotateZ(0.3 + (i % 2) * 0.15);
    g.rotateY((i / 6) * Math.PI * 2 + i * 0.4);
    parts.push({ geometry: g, color: new THREE.Color(i % 3 === 0 ? "#d8c37e" : i % 3 === 1 ? "#c2a862" : "#b39a58") });
  }
  return done(parts);
}

function tola(): THREE.BufferGeometry | null {
  const parts: Parts = [];
  const blobs: Array<[number, number, number, number]> = [
    [0, 0.32, 0, 0.5],
    [0.35, 0.25, 0.15, 0.36],
    [-0.3, 0.26, -0.1, 0.38],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, 0.7, 1);
    g.translate(x, y, z);
    parts.push({ geometry: g, color: new THREE.Color(i ? "#6f7a45" : "#7d8650") });
  });
  return done(parts);
}

function cactus(): THREE.BufferGeometry | null {
  const parts: Parts = [];
  // Grey-green, like the Colca's ribbed columnar cacti (not the saturated green of a cartoon saguaro).
  const green = new THREE.Color("#71886a");
  const green2 = new THREE.Color("#7f9774");
  const trunk = new THREE.CylinderGeometry(0.17, 0.21, 3.2, 8);
  trunk.translate(0, 1.6, 0);
  parts.push({ geometry: trunk, color: green });
  // Two arms: out, then up (candelabra).
  for (const [side, h, len] of [
    [1, 1.3, 1.5],
    [-1, 1.8, 1.1],
  ] as const) {
    const out = new THREE.CylinderGeometry(0.15, 0.15, 0.55, 7);
    out.rotateZ(Math.PI / 2);
    out.translate(side * 0.38, h, 0);
    const up = new THREE.CylinderGeometry(0.15, 0.16, len, 7);
    up.translate(side * 0.62, h + len / 2 - 0.05, 0);
    parts.push({ geometry: out, color: green2 }, { geometry: up, color: green2 });
  }
  const cap = new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 3.2, 0);
  parts.push({ geometry: cap, color: new THREE.Color("#d9c27a") });
  return done(parts);
}

function stone(): THREE.BufferGeometry | null {
  const g = new THREE.IcosahedronGeometry(0.7, 0);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + (((i * 7919) % 13) / 13) * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.65, p.getZ(i) * k);
  }
  g.translate(0, 0.2, 0);
  return done([{ geometry: g, color: new THREE.Color("#8f8170") }]);
}

/** Where a kind grows: a weight 0..1 for (x, z) given the road distance d and the canyon coordinate s. */
type Where = (x: number, z: number, d: number, s: number) => number;

const onPampa = (z: number) => z < PAMPA.z1 + 10;
const nearTower = (x: number, z: number) => Math.hypot(x - TOWER.x, z - TOWER.z) < 175;

export function buildFlora(layout: ColcaLayout, toon: ToonCache, quality: Quality) {
  const rand = rng(0xc01ca);
  const mat = toon.vertexToon();
  const group = new THREE.Group();
  group.name = "colca-flora";
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const high = quality === "high";
  const kinds: Array<{
    name: string;
    make: () => THREE.BufferGeometry | null;
    n: number;
    where: Where;
    scale: [number, number];
    ink: boolean;
    shadow: boolean;
  }> = [
    {
      name: "ichu",
      make: ichu,
      n: high ? 3200 : 1700,
      where: (x, z, d) => (onPampa(z) ? (nearTower(x, z) ? 0.02 : 0.12) : d < 40 ? 1 : d < 120 ? 0.45 : 0.18),
      scale: [0.7, 1.5],
      ink: false,
      shadow: false,
    },
    {
      name: "tola",
      make: tola,
      n: high ? 520 : 280,
      where: (x, z, d) => (onPampa(z) ? (nearTower(x, z) ? 0 : 0.08) : d < 70 ? 0.8 : 0.3),
      scale: [0.7, 1.4],
      ink: true,
      shadow: true,
    },
    {
      name: "cactus",
      make: cactus,
      n: high ? 120 : 70,
      // Along the rim (between the road and the edge) and on the slopes of the descent and the climb.
      where: (x, z, d, s) =>
        s > -30 && s < -4 ? 0.5 : onPampa(z) ? (nearTower(x, z) ? 0 : 0.05) : d < 30 ? 0.2 : 0.06,
      scale: [0.7, 1.35],
      ink: true,
      shadow: true,
    },
    {
      name: "stone",
      make: stone,
      n: high ? 420 : 240,
      where: (x, z, d, s) =>
        s > -25 && s < 0 ? 0.9 : onPampa(z) ? (nearTower(x, z) ? 0.03 : 0.35) : d < 60 ? 0.5 : 0.3,
      scale: [0.5, 2.2],
      ink: true,
      shadow: true,
    },
  ];
  for (const k of kinds) {
    const geo = k.make();
    if (!geo) continue;
    geos.push(geo);
    const mesh = new THREE.InstancedMesh(geo, mat, k.n);
    let count = 0;
    for (let tries = 0; tries < k.n * 30 && count < k.n; tries++) {
      // Half the tries near the road (where the traveler looks), half anywhere.
      let x: number;
      let z: number;
      if (rand() < 0.6) {
        const t = rand();
        const a = layout.trail.pointAt(t);
        const ang = rand() * Math.PI * 2;
        const r = 4 + rand() ** 1.6 * 110;
        x = a.x + Math.cos(ang) * r;
        z = a.z + Math.sin(ang) * r;
      } else {
        x = (rand() * 2 - 1) * (HALF - 10);
        z = (rand() * 2 - 1) * (HALF - 10);
      }
      if (!layout.isGround(x, z)) continue;
      const s = canyonS(x, z);
      if (s > -2 && s < CANYON.south + 2) continue;
      const d = layout.trailQuery(x, z).d;
      if (rand() > k.where(x, z, d, s)) continue;
      const y = layout.heightAt(x, z);
      const f = k.scale[0] + rand() * (k.scale[1] - k.scale[0]);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      sc.set(f, f * (0.85 + rand() * 0.3), f);
      p.set(x, y - 0.05, z);
      m.compose(p, q, sc);
      mesh.setMatrixAt(count++, m);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `colca-flora:${k.name}`;
    mesh.castShadow = k.shadow;
    mesh.receiveShadow = true;
    if (!k.ink) mesh.layers.set(NO_OUTLINE_LAYER);
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      mat.dispose();
      for (const c of group.children) (c as THREE.InstancedMesh).dispose?.();
    },
  };
}
