/**
 * Native plants and rocks of the coast, instanced (one InstancedMesh per kind, vertex-coloured toon):
 *  - huarango (Prosopis): twisted trunks with wide flat crowns, in the valleys and along the river banks;
 *  - columnar cacti on the desert hills and cliff tops;
 *  - totora reeds along the river channels near their mouths (the reed the caballitos are made of);
 *  - field crops (maize, cane) in tufts on the valley floors;
 *  - lomas shrubs, grey-green, on the fog-fed seaward hills;
 *  - boulders at the foot of the cliffs and on the rocky points.
 * Placement is seeded (stable between visits) and keeps off the road, plazas, water and steep slopes; the
 * station footprints are left clear by distance to the plazas. About six draw calls.
 */
import * as THREE from "three";
import type { Quality } from "../../engine";
import { vertexToon } from "../../merge-colors";
import { noOutline } from "../../toon";
import { Geo, rng } from "../kit";
import { type CostaLayout, noise } from "../layout";

export interface Flora {
  group: THREE.Group;
  dispose(): void;
}

function huarango(): THREE.BufferGeometry {
  const g = new Geo();
  const bark = "#6b4a33";
  g.stick({ x: 0, y: 0, z: 0 }, { x: 0.35, y: 1.6, z: 0.1 }, 0.2, bark, 6);
  g.stick({ x: 0.35, y: 1.6, z: 0.1 }, { x: -0.6, y: 2.7, z: 0.3 }, 0.14, bark, 5);
  g.stick({ x: 0.35, y: 1.6, z: 0.1 }, { x: 1.3, y: 2.6, z: -0.4 }, 0.13, bark, 5);
  g.stick({ x: 0.2, y: 1.2, z: 0 }, { x: 0.2, y: 2.4, z: 1.1 }, 0.11, bark, 5);
  for (const [x, y, z, r, c] of [
    [-0.7, 2.9, 0.3, 1.5, "#58743a"],
    [1.3, 2.8, -0.4, 1.4, "#64813f"],
    [0.3, 3.1, 0.6, 1.6, "#4f6c35"],
    [0.4, 2.6, 1.3, 1.1, "#64813f"],
  ] as Array<[number, number, number, number, string]>)
    g.blob(r, r * 0.42, r * 0.95, x, y, z, c, 0);
  return g.build();
}

function cactus(): THREE.BufferGeometry {
  const g = new Geo();
  const a = "#6f8f5a";
  const b = "#587a4a";
  g.cyl(0.2, 0.24, 2.6, 0, 0, 0, a, 7);
  g.blob(0.2, 0.14, 0.2, 0, 2.6, 0, b, 0);
  g.cyl(0.13, 0.13, 0.5, 0.32, 0.95, 0, b, 7, 0, Math.PI / 2);
  g.cyl(0.13, 0.15, 1.1, 0.55, 0.95, 0, a, 7);
  g.blob(0.13, 0.1, 0.13, 0.55, 2.05, 0, b, 0);
  g.cyl(0.12, 0.12, 0.42, -0.28, 1.45, 0, b, 7, 0, -Math.PI / 2);
  g.cyl(0.12, 0.14, 0.75, -0.48, 1.45, 0, a, 7);
  return g.build();
}

function totora(): THREE.BufferGeometry {
  const g = new Geo();
  const r = rng(77);
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.5;
    const h = 1.6 + r() * 1.1;
    const lean = (r() - 0.5) * 0.3;
    g.cyl(0.0, 0.05, h, Math.cos(a) * d, 0, Math.sin(a) * d, i % 3 ? "#8fa04a" : "#a9a95a", 4, lean, lean * 0.6);
    if (i % 3 === 0)
      g.cyl(0.035, 0.035, 0.22, Math.cos(a) * d + lean * h * 0.5, h * 0.82, Math.sin(a) * d, "#7a5a38", 4);
  }
  return g.build();
}

function crop(): THREE.BufferGeometry {
  const g = new Geo();
  const r = rng(91);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const h = 1.1 + r() * 0.5;
    g.cyl(
      0.0,
      0.06,
      h,
      Math.cos(a) * 0.18,
      0,
      Math.sin(a) * 0.18,
      i % 2 ? "#6f9d45" : "#86b052",
      4,
      Math.cos(a) * 0.25,
      Math.sin(a) * 0.25,
    );
  }
  g.cyl(0.03, 0.03, 1.5, 0, 0, 0, "#9bb85a", 4);
  g.blob(0.06, 0.16, 0.06, 0, 1.55, 0, "#d8c26a", 0);
  return g.build();
}

function shrub(): THREE.BufferGeometry {
  const g = new Geo();
  g.blob(0.75, 0.5, 0.7, 0, 0.3, 0, "#8a9a66", 0);
  g.blob(0.5, 0.38, 0.55, 0.45, 0.32, 0.2, "#9aa875", 0);
  g.blob(0.45, 0.32, 0.5, -0.35, 0.25, -0.3, "#7a8a5a", 0);
  // A few yellow amancae flowers (the lomas bloom).
  g.blob(0.09, 0.09, 0.09, 0.2, 0.75, 0.15, "#f2c84b", 0);
  g.blob(0.08, 0.08, 0.08, -0.3, 0.6, -0.1, "#f2c84b", 0);
  return g.build();
}

function boulder(): THREE.BufferGeometry {
  const g = new Geo();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const p = ico.getAttribute("position");
  const r = rng(5);
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + r() * 0.35;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.add(ico, "#8d7560", 0, 0.35, 0);
  ico.dispose();
  return g.build();
}

export function buildFlora(L: CostaLayout, quality: Quality): Flora {
  const group = new THREE.Group();
  group.name = "costa-flora";
  const mat = vertexToon();
  const high = quality === "high";
  const R = rng(0xc057);
  const b = L.bounds;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const geos: THREE.BufferGeometry[] = [];
  /** Clear of the stations' monuments (they reach ~26 u from their plaza, toward the monument). */
  const clearOfStations = (x: number, z: number, r: number) =>
    L.plazas.every((pl) => Math.hypot(x - pl.x, z - pl.z) > r);

  const scatter = (
    name: string,
    geo: THREE.BufferGeometry,
    count: number,
    pick: () => { x: number; z: number } | null,
    scale: [number, number],
    shadow = true,
    ink = true,
  ) => {
    const pts: Array<{ x: number; y: number; z: number; s: number; a: number }> = [];
    for (let tries = 0; pts.length < count && tries < count * 60; tries++) {
      const p = pick();
      if (!p) continue;
      pts.push({
        x: p.x,
        y: L.heightAt(p.x, p.z),
        z: p.z,
        s: scale[0] + R() * (scale[1] - scale[0]),
        a: R() * Math.PI * 2,
      });
    }
    geos.push(geo);
    if (!pts.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    mesh.name = `costa-flora:${name}`;
    pts.forEach((p, i) => {
      q.setFromAxisAngle(up, p.a);
      m4.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    // Thin blades (reeds, crops) would only add ink noise: they stay unoutlined.
    if (!ink) noOutline(mesh);
    group.add(mesh);
  };
  const rnd = (x0: number, x1: number) => x0 + R() * (x1 - x0);

  // Huarangos: valley margins and banks, and a few lone trees on the terrace.
  scatter(
    "huarango",
    huarango(),
    high ? 120 : 70,
    () => {
      const x = rnd(b.x0 + 150, 330);
      const z = rnd(b.z0 + 20, b.z1 - 20);
      const g = L.green(x, z);
      const lone = g < 0.1 && R() < 0.05;
      if (!lone && (g < 0.15 || g > 0.85)) return null;
      if (!L.isGround(x, z) || L.riverDist(x, z) < 2 || !clearOfStations(x, z, 28)) return null;
      if (L.trailQuery(x, z).d < 6) return null;
      return { x, z };
    },
    [0.85, 1.35],
  );
  // Cacti: desert hills inland and the cliff tops.
  scatter(
    "cactus",
    cactus(),
    high ? 170 : 100,
    () => {
      const x = rnd(-120, 300);
      const z = rnd(b.z0 + 20, b.z1 - 20);
      if (!L.isGround(x, z) || L.green(x, z) > 0.1 || !clearOfStations(x, z, 30)) return null;
      const y = L.heightAt(x, z);
      if (y < 3.5 || L.trailQuery(x, z).d < 5) return null;
      if (noise(x / 30, z / 30) < 0.45) return null;
      return { x, z };
    },
    [0.7, 1.4],
  );
  // Totora along the channels near the mouths.
  scatter(
    "totora",
    totora(),
    high ? 190 : 110,
    () => {
      const r = L.rivers[Math.floor(R() * L.rivers.length)];
      if (!r) return null;
      const pt = r.pts[Math.floor(R() * Math.min(r.pts.length, 40))];
      if (!pt) return null;
      const x = pt[0] + rnd(-3, 3);
      const z = pt[1] + rnd(-8, 8);
      const rd = L.riverDist(x, z);
      if (rd < -0.6 || rd > 3.2 || L.trailQuery(x, z).d < 9) return null;
      return { x, z };
    },
    [0.8, 1.2],
    false,
    false,
  );
  // Crops on the valley floors (in their plots: a jittered grid).
  scatter(
    "crops",
    crop(),
    high ? 480 : 300,
    () => {
      const r = L.rivers[Math.floor(R() * L.rivers.length)];
      if (!r) return null;
      const x = rnd(L.shoreX(r.z) + 12, L.shoreX(r.z) + 220);
      const z = r.z + rnd(-40, 40);
      if (L.green(x, z) < 0.7 || L.riverDist(x, z) < 4.5 || !L.isGround(x, z)) return null;
      if (L.trailQuery(x, z).d < 6 || !clearOfStations(x, z, 18)) return null;
      // Fallow plots stay bare (the ground's plot pattern: 9 × 7 cells).
      const h = Math.imul(Math.floor(x / 9), 73856093) ^ Math.imul(Math.floor(z / 7), 19349663);
      const hh = (Math.imul(h ^ (h >>> 13), 1274126177) ^ (Math.imul(h ^ (h >>> 13), 1274126177) >>> 16)) >>> 0;
      if (hh / 4294967295 > 0.85) return null;
      return { x, z };
    },
    [0.75, 1.1],
    false,
    false,
  );
  // Lomas shrubs on the seaward hills.
  scatter(
    "shrub",
    shrub(),
    high ? 280 : 160,
    () => {
      const x = rnd(-60, 200);
      const z = rnd(b.z0 + 20, b.z1 - 20);
      if (!L.isGround(x, z) || !clearOfStations(x, z, 26)) return null;
      const y = L.heightAt(x, z);
      if (y < 5 || L.trailQuery(x, z).d < 4) return null;
      if (noise(x / 38 + 4, z / 38) < 0.55) return null;
      return { x, z };
    },
    [0.7, 1.3],
  );
  // Boulders at the cliff feet and the rocky points.
  scatter(
    "boulder",
    boulder(),
    high ? 150 : 90,
    () => {
      const z = rnd(b.z0 + 30, b.z1 - 30);
      if (L.cliff(z) < 0.45) return null;
      const x = L.shoreX(z) + rnd(-6, 4);
      if (L.trailQuery(x, z).d < 5) return null;
      return { x, z };
    },
    [0.6, 2.2],
  );

  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      mat.dispose();
      group.removeFromParent();
    },
  };
}
