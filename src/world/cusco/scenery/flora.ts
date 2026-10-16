/**
 * Native plants on the valley slopes, instanced (one draw call per kind): molle trees (Schinus molle, the
 * weeping pepper tree of Andean valleys: a short trunk under a drooping rounded crown), a few queñuas
 * (Polylepis, red papery bark, small dark crowns) higher up, and ichu bunch-grass tufts. Placed on open
 * ground only (layout.isGround), seeded, thinner on the low tier but never removed by distance (the hub is
 * small; the far ones fade into the fog).
 */
import * as THREE from "three";
import type { Quality } from "../../engine";
import { mergeColored } from "../../merge-colors";
import { NO_OUTLINE_LAYER, type ToonCache } from "../../toon";
import type { CuscoLayout } from "../layout";
import { rng } from "./buildings";

function molle(): THREE.BufferGeometry | null {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
  trunk.translate(0, 0.8, 0);
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [
    { geometry: trunk, color: new THREE.Color("#6a4a33") },
  ];
  // Drooping crown: a few flattened icospheres hanging off the top.
  const blobs: Array<[number, number, number, number]> = [
    [0, 2.3, 0, 1.25],
    [0.8, 1.95, 0.3, 0.85],
    [-0.75, 2.0, -0.2, 0.9],
    [0.1, 1.9, -0.85, 0.8],
    [-0.2, 2.0, 0.85, 0.8],
  ];
  const greens = ["#5f8a45", "#6f9a4e", "#577f40"];
  blobs.forEach(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, 0.72, 1);
    g.translate(x, y, z);
    parts.push({ geometry: g, color: new THREE.Color(greens[i % greens.length]) });
  });
  const out = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return out;
}

function quenua(): THREE.BufferGeometry | null {
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.3, 5);
  trunk.rotateZ(0.12);
  trunk.translate(0, 0.65, 0);
  const crown = new THREE.IcosahedronGeometry(0.85, 0);
  crown.scale(1.1, 0.75, 1);
  crown.translate(0.1, 1.65, 0);
  const crown2 = new THREE.IcosahedronGeometry(0.6, 0);
  crown2.translate(-0.45, 1.3, 0.2);
  const parts = [
    { geometry: trunk, color: new THREE.Color("#a0503a") },
    { geometry: crown, color: new THREE.Color("#4d6f3f") },
    { geometry: crown2, color: new THREE.Color("#57784a") },
  ];
  const out = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return out;
}

function ichu(): THREE.BufferGeometry | null {
  // A tuft: a few thin leaning blades (cones) round a centre.
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.ConeGeometry(0.07, 0.7 + (i % 3) * 0.15, 3);
    g.translate(0, 0.35, 0);
    g.rotateZ(0.35);
    g.rotateY((i / 4) * Math.PI * 2 + i * 0.3);
    parts.push({ geometry: g, color: new THREE.Color(i % 2 ? "#c9b46e" : "#b59f5c") });
  }
  const out = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return out;
}

export function buildFlora(layout: CuscoLayout, toon: ToonCache, quality: Quality) {
  const rand = rng(0xf10a);
  const mat = toon.vertexToon();
  const group = new THREE.Group();
  group.name = "cusco-flora";
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const high = quality === "high";
  const kinds: Array<{
    make: () => THREE.BufferGeometry | null;
    n: number;
    rMin: number;
    rMax: number;
    ok: (y: number) => boolean;
    scale: [number, number];
  }> = [
    { make: molle, n: high ? 200 : 120, rMin: 30, rMax: 200, ok: (y) => y < 22, scale: [0.85, 1.5] },
    { make: quenua, n: high ? 90 : 50, rMin: 60, rMax: 225, ok: (y) => y > 14, scale: [0.8, 1.3] },
    { make: ichu, n: high ? 650 : 320, rMin: 20, rMax: 200, ok: () => true, scale: [0.7, 1.4] },
  ];
  for (const k of kinds) {
    const geo = k.make();
    if (!geo) continue;
    geos.push(geo);
    const mesh = new THREE.InstancedMesh(geo, mat, k.n);
    let count = 0;
    for (let tries = 0; tries < k.n * 12 && count < k.n; tries++) {
      const a = rand() * Math.PI * 2;
      const r = k.rMin + Math.sqrt(rand()) * (k.rMax - k.rMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!layout.isGround(x, z)) continue;
      const y = layout.heightAt(x, z);
      if (!k.ok(y)) continue;
      const sc = k.scale[0] + rand() * (k.scale[1] - k.scale[0]);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      s.set(sc, sc * (0.9 + rand() * 0.2), sc);
      p.set(x, y - 0.05, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(count++, m);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = "cusco-flora:instanced";
    mesh.castShadow = k.make !== ichu;
    // Thin blades would be all ink at a distance: the tufts go without outline.
    if (k.make === ichu) mesh.layers.set(NO_OUTLINE_LAYER);
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
