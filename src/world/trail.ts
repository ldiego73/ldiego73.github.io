/** Qhapaq Ñan meshes: the flagstone ribbon conformed to the terrain, curb stones, and low walls on drops. */
import * as THREE from "three";
import { HALF_WIDTH, type Layout } from "./layout";
import { WORLD } from "./palette";
import { canvasTex, rng } from "./tex";
import type { ToonCache } from "./toon";

/** Irregular andesite flagstones with dark grout, tiled along the path. */
function flagstones() {
  return canvasTex(
    "qhapaq-flagstones",
    256,
    512,
    (ctx, w, h) => {
      const R = rng(19);
      ctx.fillStyle = "#6f675c";
      ctx.fillRect(0, 0, w, h);
      const tones = ["#c4bcae", "#b9b1a3", "#aaa293", "#cfc7b8", "#a59d8f"];
      // Rows of stones of varying length; each stone a slightly irregular polygon.
      let y = 0;
      while (y < h) {
        const rh = 40 + R() * 34;
        let x = -R() * 40;
        while (x < w) {
          const sw = 46 + R() * 60;
          const g = 5;
          const pts: Array<[number, number]> = [
            [x + g + R() * 6, y + g + R() * 5],
            [x + sw - g - R() * 6, y + g + R() * 5],
            [x + sw - g + R() * 3, y + rh * 0.5],
            [x + sw - g - R() * 6, y + rh - g - R() * 5],
            [x + g + R() * 6, y + rh - g - R() * 5],
            [x + g - R() * 3, y + rh * 0.5],
          ];
          ctx.fillStyle = tones[Math.floor(R() * tones.length)] as string;
          ctx.beginPath();
          for (const [i, [px, py]] of pts.entries()) {
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          // A lighter facet suggests a worn top.
          ctx.fillStyle = "rgb(255 255 255 / 0.08)";
          ctx.fillRect(x + 10, y + 8, sw * 0.4, 5);
          x += sw;
        }
        y += rh;
      }
    },
    { repeat: true },
  );
}

export interface WallStone {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Half of the stone's thickness across the path. */
  halfWidth: number;
  height: number;
  length: number;
  /** Low dry-stone wall on a drop (else a curb stone). */
  wall: boolean;
}

/**
 * Curb stones and low walls: always fully OUTSIDE the paved band, only on the outer edge of their own
 * leg (never where another leg, a plaza spur, the gorge or the stream crossing is), so they can't cut the path.
 */
export function trailWallPlacements(L: Layout, quality: "low" | "high" = "high"): WallStone[] {
  const { trail, gorge, stream } = L;
  const len = trail.length;
  const every = quality === "high" ? 1.15 : 2.3;
  const R = rng(91);
  const out: WallStone[] = [];
  const n = Math.floor(len / every);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    if (t > gorge.t0 - 0.006 && t < gorge.t1 + 0.006) continue;
    const p = trail.pointAt(t);
    const tg = trail.tangentAt(t);
    const rx = -tg.z;
    const rz = tg.x;
    const yaw = Math.atan2(tg.x, tg.z);
    for (const side of [-1, 1]) {
      const r1 = R();
      const r2 = R();
      const r3 = R();
      const hw = 0.22 + r1 * 0.08;
      const off = HALF_WIDTH + hw + 0.08;
      const ex = p.x + rx * side * off;
      const ez = p.z + rz * side * off;
      if (Math.hypot(ex - stream.cross.x, ez - stream.cross.z) < 4.2) continue;
      let blocked = false;
      for (const pl of L.plazas)
        if (Math.hypot(ex - pl.tx, ez - pl.tz) < pl.spur + 1.4 || Math.hypot(ex - pl.x, ez - pl.z) < pl.r + 0.6)
          blocked = true;
      // Stones belong to this leg only: skip if any other part of the path is near.
      const q = L.trailQuery(ex, ez);
      if (q.d < off - 0.05 || Math.abs(q.t - t) > 0.01) blocked = true;
      if (blocked) continue;
      const ox = p.x + rx * side * (HALF_WIDTH + 4);
      const oz = p.z + rz * side * (HALF_WIDTH + 4);
      const drop = p.y - L.heightAt(ox, oz);
      if (drop > 1.6) {
        const h = 0.75 + r2 * 0.2;
        out.push({
          x: ex,
          y: p.y + h / 2 - 0.12,
          z: ez,
          yaw,
          halfWidth: hw,
          height: h,
          length: every * 0.98,
          wall: true,
        });
      } else if (r3 < 0.75) {
        const h = 0.28 + r2 * 0.12;
        out.push({
          x: ex,
          y: p.y + 0.06,
          z: ez,
          yaw: yaw + (r1 - 0.5) * 0.15,
          halfWidth: hw,
          height: h,
          length: every * (0.55 + r3 * 0.3),
          wall: false,
        });
      }
    }
  }
  return out;
}

export function createTrailMeshes(L: Layout, toon: ToonCache, quality: "low" | "high") {
  const group = new THREE.Group();
  group.name = "qhapaq-nan";
  const { trail, gorge } = L;
  const len = trail.length;
  const STEP = 0.6;
  const steps = Math.ceil(len / STEP);
  const ACROSS = 6;
  const hw = HALF_WIDTH - 0.1;
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();

  // ---------------------------------------------------------------- paved ribbon (skips the gorge gap)
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let rowStart = -1;
  let vcount = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // No paving over the gorge (rope bridge) or under the stream's slab bridge.
    const inGap = (t > gorge.t0 - 0.004 && t < gorge.t1 + 0.004) || Math.abs(t - L.stream.t) * len < 1.75;
    if (inGap) {
      rowStart = -1;
      continue;
    }
    p.copy(trail.pointAt(t));
    tg.copy(trail.tangentAt(t));
    const rx = -tg.z;
    const rz = tg.x;
    const base = vcount;
    for (let k = 0; k <= ACROSS; k++) {
      const f = k / ACROSS - 0.5;
      const x = p.x + rx * f * hw * 2;
      const z = p.z + rz * f * hw * 2;
      // Level across the width (the terrain under the band is flattened to the centerline height).
      pos.push(x, p.y + 0.07, z);
      uv.push(k / ACROSS, (t * len) / 4.2);
      vcount++;
    }
    if (rowStart >= 0)
      for (let k = 0; k < ACROSS; k++) {
        const a = rowStart + k;
        const b = rowStart + k + 1;
        const c = base + k;
        const d = base + k + 1;
        idx.push(a, b, c, b, d, c);
      }
    rowStart = base;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({
    map: flagstones().tex,
    gradientMap: toon.toon("#fff").gradientMap,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.name = "trail-paving";
  ribbon.receiveShadow = true;
  group.add(ribbon);

  // ---------------------------------------------------------------- curb stones + low walls on the drop side
  const curbs: THREE.Matrix4[] = [];
  const walls: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (const w of trailWallPlacements(L, quality)) {
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.yaw, 0);
    dummy.scale.set(w.halfWidth * 2, w.height, w.length);
    dummy.updateMatrix();
    (w.wall ? walls : curbs).push(dummy.matrix.clone());
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const curbMesh = new THREE.InstancedMesh(box, toon.toon(WORLD.stone), curbs.length);
  curbs.forEach((m, i) => {
    curbMesh.setMatrixAt(i, m);
  });
  curbMesh.name = "trail-curbs";
  const wallMesh = new THREE.InstancedMesh(box, toon.toon("#a39a8b"), walls.length);
  walls.forEach((m, i) => {
    wallMesh.setMatrixAt(i, m);
  });
  wallMesh.name = "trail-walls";
  wallMesh.castShadow = true;
  for (const m of [curbMesh, wallMesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }
  group.add(curbMesh, wallMesh);
  return { group, dispose: () => mat.dispose() };
}
