/**
 * Scenery meshes for the Andean island: terrain (per-face flat toon colors), the rock underside
 * shown in the title view, the valley plain shown in play, river + waterfall, rocks, the vegetation
 * (./flora: ichu, flowers, queñua, aliso, unca, pisonay, chusquea), distant snowy peaks and drifting clouds.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createFlora } from "./flora";
import {
  HALF_WIDTH,
  type Layout,
  PLAZA_CUT,
  RIVER_LEVEL,
  RIVER_POLY,
  rimRadius,
  TERRACE_STEP,
  terraceMask,
  WORLD_HALF,
} from "./layout";
import { WORLD } from "./palette";
import { detectDevice } from "./quality";
import { canvasTex, fbm, noise2, rng } from "./tex";
import type { ToonCache } from "./toon";

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  grass: C(WORLD.grass),
  grassDark: C(WORLD.grassDark),
  grassLight: C("#97bf78"),
  ichu: C(WORLD.ichu),
  ichuDark: C("#c39a55"),
  stone: C(WORLD.stone),
  stoneDark: C(WORLD.stoneDark),
  snow: C(WORLD.snow),
  soil: C(WORLD.soil),
  plaza: C("#cdb48a"),
  valley: [C("#4f8a4c"), C("#5f8f55"), C("#578a50")],
  slope: [C("#7fae6a"), C("#6fa05e"), C("#88b46c")],
  steep: C("#557f4c"),
  terrace: [C("#7fae6a"), C("#8dbb6f"), C("#6fa45f"), C("#9cc47a"), C("#79a862")],
  puna: [C("#a9b866"), C("#b6b96a"), C("#98ad5f")],
  summit: C("#9db866"),
  bed: C("#c2b089"),
  strata: [C("#9a6b47"), C("#8f877b"), C("#a39a8b"), C("#7d756a"), C("#b9b1a3")],
};

export interface Scenery {
  group: THREE.Group;
  /** Shown only in the floating-island title view. */
  titleOnly: THREE.Object3D[];
  /** Shown only while exploring (valley plain, distant ranges). */
  playOnly: THREE.Object3D[];
  clouds: THREE.Group;
  cloudMaterial: THREE.MeshToonMaterial;
  update(dt: number, t: number): void;
  dispose(): void;
}

interface WaterMat {
  material: THREE.MeshToonMaterial;
  tick(t: number): void;
}

/**
 * Toon water: a flat toon color with scrolling foam stripes (and optional rings for pools),
 * injected into MeshToonMaterial so it keeps the 3-step light, fog and day/night.
 */
function waterMaterial(
  color: string,
  foam: string,
  o: { rep: number; speed: number; stripe: number; ring?: number; side?: THREE.Side },
  toon: ToonCache,
): WaterMat {
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: toon.toon("#fff").gradientMap,
    side: o.side ?? THREE.FrontSide,
  });
  material.defines = { ...(material.defines ?? {}), USE_UV: "" };
  const uniforms = {
    uTime: { value: 0 },
    uFoam: { value: new THREE.Color(foam) },
    uRep: { value: o.rep },
    uSpeed: { value: o.speed },
    uStripe: { value: o.stripe },
    uRing: { value: o.ring ?? 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime, uRep, uSpeed, uStripe, uRing;\nuniform vec3 uFoam;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 wuv = vUv;
        float wob = sin(wuv.x * 9.0 + uTime * 1.3) * 0.08 + sin(wuv.y * 3.0 - uTime) * 0.05;
        float lane = mix(wuv.y, length(wuv - 0.5) * 4.0, uRing);
        float s = fract(lane * uRep - uTime * uSpeed + wob);
        float band = step(0.8, s) * step(s, 0.93);
        float edge = (1.0 - uRing) * (step(wuv.x, 0.07) + step(0.93, wuv.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, clamp(band * uStripe + edge * 0.9, 0.0, 1.0));`,
      );
  };
  material.customProgramCacheKey = () => `kw-water-${o.ring ?? 0}`;
  return { material, tick: (t) => (uniforms.uTime.value = t) };
}

/** Inca ashlar: irregular fitted blocks with dark joints (andén walls). */
function ashlarTexture() {
  return canvasTex(
    "andenes-ashlar",
    256,
    256,
    (ctx, w, h) => {
      const R = rng(29);
      ctx.fillStyle = "#5f584e";
      ctx.fillRect(0, 0, w, h);
      const tones = ["#b9b1a3", "#a99f90", "#c4bcae", "#9d9485", "#b3a998"];
      let y = 0;
      while (y < h) {
        const rh = 26 + R() * 22;
        let x = -R() * 30;
        while (x < w) {
          const bw = 30 + R() * 46;
          ctx.fillStyle = tones[Math.floor(R() * tones.length)] as string;
          const g = 3;
          ctx.beginPath();
          ctx.moveTo(x + g + R() * 3, y + g);
          ctx.lineTo(x + bw - g, y + g + R() * 3);
          ctx.lineTo(x + bw - g - R() * 3, y + rh - g);
          ctx.lineTo(x + g, y + rh - g - R() * 3);
          ctx.closePath();
          ctx.fill();
          x += bw;
        }
        y += rh;
      }
    },
    { repeat: true },
  ).tex;
}

export function createScenery(
  L: Layout,
  toon: ToonCache,
  quality: "low" | "high",
  /** Stills the grass sway; defaults to the OS preference when the caller doesn't pass it. */
  reducedMotion?: boolean,
): Scenery {
  const group = new THREE.Group();
  group.name = "scenery";
  const titleOnly: THREE.Object3D[] = [];
  const playOnly: THREE.Object3D[] = [];
  const { n, size, h: H } = L.grid;
  const step = size / n;
  const foamBits: THREE.Mesh[] = [];
  const extraMats: THREE.Material[] = [];

  // ---------------------------------------------------------------- terrain
  {
    const N1 = n + 1;
    const vx = new Float32Array(N1 * N1);
    const vz = new Float32Array(N1 * N1);
    const vy = new Float32Array(N1 * N1);
    const outside = new Uint8Array(N1 * N1);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const k = j * N1 + i;
        let x = -WORLD_HALF + i * step;
        let z = -WORLD_HALF + j * step;
        let y = H[k] as number;
        const a = Math.atan2(z, x);
        const R = rimRadius(a);
        const r = Math.hypot(x, z);
        if (r > R) {
          // Snap onto the rim so the island outline is a smooth organic curve, not grid stairs.
          outside[k] = 1;
          x = Math.cos(a) * R;
          z = Math.sin(a) * R;
          y = L.heightAt(x, z);
        }
        vx[k] = x;
        vz[k] = z;
        vy[k] = y;
      }
    // Smooth vertex normals from the grid.
    const nrm = new Float32Array(N1 * N1 * 3);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const k = j * N1 + i;
        const hl = H[j * N1 + Math.max(0, i - 1)] as number;
        const hr = H[j * N1 + Math.min(n, i + 1)] as number;
        const hd = H[Math.max(0, j - 1) * N1 + i] as number;
        const hu = H[Math.min(n, j + 1) * N1 + i] as number;
        const v = new THREE.Vector3(hl - hr, 2 * step, hd - hu).normalize();
        nrm.set([v.x, v.y, v.z], k * 3);
      }
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const tmp = new THREE.Color();
    const tri = (a: number, b: number, c: number) => {
      if (outside[a] && outside[b] && outside[c]) return;
      const cx = ((vx[a] as number) + (vx[b] as number) + (vx[c] as number)) / 3;
      const cz = ((vz[a] as number) + (vz[b] as number) + (vz[c] as number)) / 3;
      const cy = ((vy[a] as number) + (vy[b] as number) + (vy[c] as number)) / 3;
      // Face normal for slope classification.
      const e1 = new THREE.Vector3(
        (vx[b] as number) - (vx[a] as number),
        (vy[b] as number) - (vy[a] as number),
        (vz[b] as number) - (vz[a] as number),
      );
      const e2 = new THREE.Vector3(
        (vx[c] as number) - (vx[a] as number),
        (vy[c] as number) - (vy[a] as number),
        (vz[c] as number) - (vz[a] as number),
      );
      const fn = e2.cross(e1).normalize();
      faceColor(cx, cy, cz, Math.abs(fn.y), tmp);
      for (const v of [a, b, c]) {
        pos.push(vx[v] as number, vy[v] as number, vz[v] as number);
        nor.push(nrm[v * 3] as number, nrm[v * 3 + 1] as number, nrm[v * 3 + 2] as number);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    };
    const plazaAt = (x: number, z: number) => {
      for (const p of L.plazas) if (Math.hypot(x - p.x, z - p.z) < p.r - 0.4) return true;
      return false;
    };
    const nearRiver = (x: number, z: number) => {
      for (let i = 0; i < RIVER_POLY.length; i += 2) {
        const [rx, rz] = RIVER_POLY[i] as [number, number];
        if (Math.abs(rx - x) < 12 && Math.abs(rz - z) < 12) return true;
      }
      return false;
    };
    const pick = (arr: THREE.Color[], h: number) => arr[Math.abs(Math.floor(h)) % arr.length] as THREE.Color;
    const summit = L.plazas.find((p) => p.id === "summit");
    const faceColor = (x: number, y: number, z: number, ny: number, out: THREE.Color) => {
      const nz = fbm(x * 0.022, z * 0.022, 3);
      const q = L.trailQuery(x, z);
      if (q.d < HALF_WIDTH + 0.9 && y > q.y - 1.5) return out.copy(PAL.soil);
      if (summit && Math.hypot(x - summit.x, z - summit.z) < summit.r + 2)
        return out.copy(noise2(x * 0.3, z * 0.3) > 0.35 ? (PAL.puna[2] as THREE.Color) : PAL.summit);
      if (plazaAt(x, z)) return out.copy(PAL.plaza);
      if (y < RIVER_LEVEL + 0.5 && nearRiver(x, z)) return out.copy(PAL.bed);
      if (L.streamDist(x, z) < 1.4) return out.copy(PAL.stoneDark);
      // Only real cliffs are bare rock; the rest of the steep ground stays grassy.
      if (ny < 0.5) return out.copy(noise2(x * 0.08, y * 0.35) > 0 ? PAL.stoneDark : PAL.stone);
      const tm = terraceMask(x, z, y);
      if (tm > 0.45) {
        // Andén treads: each level its own crop green; riser faces read as stone.
        if (ny < 0.8) return out.copy(PAL.grassDark);
        const idx = Math.floor(y / TERRACE_STEP + 0.15);
        const h = idx * 7 + Math.floor(noise2(x * 0.05, z * 0.05) * 2 + 2);
        return out.copy(pick(PAL.terrace, h));
      }
      if (ny < 0.72) return out.copy(y > 46 ? (PAL.puna[2] as THREE.Color) : PAL.steep);
      // Altitude bands: deep valley green → slope green → yellow-green puna up high.
      const alt = y + nz * 8;
      if (alt < 9) return out.copy(pick(PAL.valley, (nz + 1) * 2.2));
      if (alt > 44) return out.copy(nz > 0.3 ? PAL.ichu : pick(PAL.puna, (nz + 1) * 2.5));
      if (nz > 0.28) return out.copy(PAL.grassDark);
      if (nz < -0.3) return out.copy(PAL.grassLight);
      return out.copy(pick(PAL.slope, (nz + 1) * 3));
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * N1 + i;
        const b = (j + 1) * N1 + i;
        const c = (j + 1) * N1 + i + 1;
        const d = j * N1 + i + 1;
        tri(a, b, d);
        tri(b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, toon.vertexToon());
    mesh.name = "terrain";
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---------------------------------------------------------------- island underside (title)
  {
    const SEG = 160;
    const RINGS = 9;
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= RINGS; k++) {
      const f = k / RINGS;
      const row: THREE.Vector3[] = [];
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const R = rimRadius(a);
        if (k === 0) {
          row.push(
            new THREE.Vector3(Math.cos(a) * R, L.heightAt(Math.cos(a) * R, Math.sin(a) * R) - 0.05, Math.sin(a) * R),
          );
          continue;
        }
        const jag = 1 + noise2(s * 0.35, k * 1.7) * 0.12 * f;
        const rr = R * (1 - f ** 1.35) * jag;
        const y = -f * 92 - noise2(s * 0.21, k * 0.9) * 6 * f;
        row.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      rows.push(row);
    }
    const tip = new THREE.Vector3(18, -104, -10);
    const pos: number[] = [];
    const col: number[] = [];
    const push = (p: THREE.Vector3, c: THREE.Color) => {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    };
    for (let k = 0; k < RINGS; k++)
      for (let s = 0; s < SEG; s++) {
        const r0 = rows[k] as THREE.Vector3[];
        const r1 = rows[k + 1] as THREE.Vector3[];
        const a = r0[s] as THREE.Vector3;
        const b = r0[(s + 1) % SEG] as THREE.Vector3;
        const c = r1[s] as THREE.Vector3;
        const d = r1[(s + 1) % SEG] as THREE.Vector3;
        const band =
          k === 0
            ? PAL.soil
            : (PAL.strata[(k + Math.floor(noise2(s * 0.12, k) * 2 + 2)) % PAL.strata.length] as THREE.Color);
        push(a, band);
        push(c, band);
        push(b, band);
        push(b, band);
        push(c, band);
        push(d, band);
      }
    const last = rows[RINGS] as THREE.Vector3[];
    for (let s = 0; s < SEG; s++) {
      const c = PAL.stoneDark;
      push(last[s] as THREE.Vector3, c);
      push(tip, c);
      push(last[(s + 1) % SEG] as THREE.Vector3, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const under = new THREE.Mesh(geo, toon.vertexToon({ side: THREE.DoubleSide }));
    under.name = "underside";
    group.add(under);
    titleOnly.push(under);
  }

  // ---------------------------------------------------------------- valley plain (play)
  {
    const SEG = 160;
    const pos: number[] = [];
    const radii = [0, 30, 90, 220, 520, 1100];
    const ring = (k: number, s: number) => {
      const a = (s / SEG) * Math.PI * 2;
      const R = rimRadius(a) + (radii[k] as number);
      const y =
        k === 0
          ? L.heightAt(Math.cos(a) * (R - 0.01), Math.sin(a) * (R - 0.01)) - 0.02
          : 0.3 + k * k * 1.6 + fbm(s * 0.08, k, 2) * 2 * k;
      return [Math.cos(a) * R, y, Math.sin(a) * R];
    };
    for (let k = 0; k < radii.length - 1; k++)
      for (let s = 0; s < SEG; s++) {
        const a = ring(k, s);
        const b = ring(k, s + 1);
        const c = ring(k + 1, s);
        const d = ring(k + 1, s + 1);
        pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const plain = new THREE.Mesh(geo, toon.toon(WORLD.grass));
    plain.name = "valley-plain";
    plain.receiveShadow = true;
    group.add(plain);
    playOnly.push(plain);
  }

  // ---------------------------------------------------------------- water (river, stream, waterfalls)
  const waters: WaterMat[] = [];
  const riverMat = waterMaterial(WORLD.river, "#e6f6f4", { rep: 0.6, speed: 0.35, stripe: 0.85 }, toon);
  const fallMat = waterMaterial(
    "#9fdbe0",
    "#ffffff",
    { rep: 1.4, speed: 1.6, stripe: 1, side: THREE.DoubleSide },
    toon,
  );
  const poolMat = waterMaterial(WORLD.river, "#ffffff", { rep: 2.2, speed: 0.6, stripe: 0.8, ring: 1 }, toon);
  waters.push(riverMat, fallMat, poolMat);
  /** Flat ribbon along a polyline: u across (0..1), v = distance / 4. */
  const ribbon = (pts: Array<[number, number]>, width: number, yAt: (x: number, z: number, i: number) => number) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i] as [number, number];
      const [ax, az] = pts[Math.max(0, i - 1)] as [number, number];
      const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
      const dx = bx - ax;
      const dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      if (i > 0) dist += Math.hypot(x - ax, z - az);
      const nx = (-dz / l) * width;
      const nz = (dx / l) * width;
      const y = yAt(x, z, i);
      pos.push(x - nx, y, z - nz, x + nx, y, z + nz);
      uv.push(0, dist / 4, 1, dist / 4);
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  {
    const inside = RIVER_POLY.filter(([x, z]) => Math.hypot(x, z) < rimRadius(Math.atan2(z, x)) - 1.5);
    const water = new THREE.Mesh(
      ribbon(inside, 3.2, () => RIVER_LEVEL),
      riverMat.material,
    );
    water.name = "river";
    group.add(water);
    // Waterfall off the rim where the river leaves the island (title view).
    const [ex, ez] = inside[inside.length - 1] as [number, number];
    const a = Math.atan2(ez, ex);
    const R = rimRadius(a);
    // A curved sheet (half cylinder) so the fall reads from any orbit angle, not edge-on.
    const fall = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 6, 78, 12, 4, true, -Math.PI / 2, Math.PI),
      fallMat.material,
    );
    fall.position.set(Math.cos(a) * (R - 3.5), RIVER_LEVEL - 39, Math.sin(a) * (R - 3.5));
    fall.rotation.y = Math.PI / 2 - a;
    group.add(fall);
    titleOnly.push(fall);
  }

  // ---------------------------------------------------------------- mountain stream: waterfall → slab bridge → pool
  {
    const st = L.stream;
    const cross = st.cross;
    // Water sits in its channel; under the path it's hidden by the slabs.
    const streamGeo = ribbon(st.pts, 0.95, (x, z) => {
      const q = L.trailQuery(x, z);
      return q.d < HALF_WIDTH + 0.5 ? cross.y - 0.45 : L.heightAt(x, z) + 0.32;
    });
    const stream = new THREE.Mesh(streamGeo, riverMat.material);
    stream.name = "stream";
    group.add(stream);

    // Rock step + falling sheet at the spring.
    const [sx, sz] = st.pts[0] as [number, number];
    const base = L.heightAt(sx, sz);
    const fallH = 5.5;
    const dir = st.fallDir;
    const yaw = Math.atan2(dir.x, dir.y);
    const cliff = new THREE.Group();
    cliff.name = "waterfall-cliff";
    const rockParts: THREE.BufferGeometry[] = [];
    const Rr = rng(17);
    for (const [ox, oy, oz, w, h, d] of [
      [0, fallH / 2 - 0.3, -1.6, 7, fallH + 0.6, 3.2],
      [-3.2, fallH * 0.32, -0.6, 2.6, fallH * 0.7, 2.6],
      [3.1, fallH * 0.38, -0.8, 2.4, fallH * 0.8, 2.4],
      [0, fallH + 0.2, -2.6, 5, 1.2, 2.2],
    ] as const) {
      const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2).toNonIndexed();
      const pa = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        pa.setX(i, pa.getX(i) + (Rr() - 0.5) * 0.35);
        pa.setZ(i, pa.getZ(i) + (Rr() - 0.5) * 0.35);
      }
      g.translate(ox, oy, oz);
      g.deleteAttribute("uv");
      g.computeVertexNormals();
      rockParts.push(g);
    }
    const rocks = new THREE.Mesh(mergeGeometries(rockParts) as THREE.BufferGeometry, toon.toon(WORLD.stoneDark));
    for (const g of rockParts) g.dispose();
    rocks.castShadow = true;
    cliff.add(rocks);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, fallH + 0.2, 1, 4), fallMat.material);
    sheet.position.set(0, fallH / 2, 0.02);
    cliff.add(sheet);
    // Splash pool + bobbing foam.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), poolMat.material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.36, 1.5);
    cliff.add(pool);
    const foamMat = toon.toon("#ffffff");
    const foam: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + Rr() * 0.22, 0), foamMat);
      f.position.set((Rr() - 0.5) * 2, 0.45, 0.5 + Rr() * 1.4);
      f.userData.phase = Rr() * 6;
      cliff.add(f);
      foam.push(f);
    }
    cliff.position.set(sx - dir.x * 0.2, base - 0.15, sz - dir.y * 0.2);
    cliff.rotation.y = yaw;
    group.add(cliff);
    L.addCollider({ kind: "circle", x: sx - dir.x * 1.6, z: sz - dir.y * 1.6, r: 3.2 });
    foamBits.push(...foam);

    // Slab bridge where the stream passes under the path.
    const tg = st.tangent;
    const ryaw = Math.atan2(tg.x, tg.z);
    const slabs = new THREE.Group();
    slabs.name = "slab-bridge";
    for (const [k, c] of [
      [-1.15, "#a39a8b"],
      [0, "#b9b1a3"],
      [1.15, "#968d7f"],
    ] as const) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2 + 1.3, 0.3, 1.12), toon.toon(c));
      slab.position.set(0, -0.04 + (k === 0 ? 0.02 : 0), k);
      slab.rotation.y = k * 0.02;
      slab.castShadow = true;
      slab.receiveShadow = true;
      slabs.add(slab);
    }
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 3.8), toon.toon("#7d756a"));
      post.position.set(side * (HALF_WIDTH + 0.9), -0.62, 0);
      slabs.add(post);
    }
    slabs.position.set(cross.x, cross.y, cross.z);
    // Follow the path's grade so the slabs sit flush with the paving.
    slabs.rotation.order = "YXZ";
    slabs.rotation.set(-Math.asin(THREE.MathUtils.clamp(tg.y, -1, 1)), ryaw, 0);
    group.add(slabs);
  }

  // ---------------------------------------------------------------- andén retaining walls (stone faces)
  {
    // Andén walls + plaza retaining walls on the uphill cut (instead of a raw slope behind each tambo).
    const plazaWalls: number[] = [];
    const wallR = (PLAZA_CUT[0] + PLAZA_CUT[1]) / 2;
    for (const pl of L.plazas) {
      if (pl.id === "summit") continue;
      const R0 = pl.r + wallR;
      const n = Math.max(12, Math.ceil((Math.PI * 2 * R0) / 1.1));
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const mx = pl.x + Math.cos(am) * R0;
        const mz = pl.z + Math.sin(am) * R0;
        if (L.trailQuery(mx, mz).d < HALF_WIDTH + 1.4) continue;
        const ux = pl.x - pl.tx;
        const uz = pl.z - pl.tz;
        const l2 = ux * ux + uz * uz || 1;
        const f = Math.min(1, Math.max(0, ((mx - pl.tx) * ux + (mz - pl.tz) * uz) / l2));
        if (Math.hypot(mx - pl.tx - ux * f, mz - pl.tz - uz * f) < pl.spur + 1.2) continue;
        const top = L.heightAt(pl.x + Math.cos(am) * (R0 + 0.9), pl.z + Math.sin(am) * (R0 + 0.9));
        if (top - pl.y < 0.6) continue;
        plazaWalls.push(
          pl.x + Math.cos(a0) * R0,
          pl.z + Math.sin(a0) * R0,
          pl.x + Math.cos(a1) * R0,
          pl.z + Math.sin(a1) * R0,
          pl.y - 0.4,
          top + 0.22,
        );
      }
    }
    const andenes = L.terraceWalls();
    const segs = new Float32Array(andenes.length + plazaWalls.length);
    segs.set(andenes);
    segs.set(plazaWalls, andenes.length);
    const plazaStart = andenes.length;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    let u = 0;
    for (let i = 0; i < segs.length; i += 6) {
      const x0 = segs[i] as number;
      const z0 = segs[i + 1] as number;
      const x1 = segs[i + 2] as number;
      const z1 = segs[i + 3] as number;
      const yb = segs[i + 4] as number;
      const yt = segs[i + 5] as number;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      let nx = -(z1 - z0) / len;
      let nz = (x1 - x0) / len;
      // Face downhill (terraces) or into the plaza (retaining walls).
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (L.heightAt(mx + nx * 1.5, mz + nz * 1.5) > L.heightAt(mx - nx * 1.5, mz - nz * 1.5)) {
        nx = -nx;
        nz = -nz;
      }
      if (i < plazaStart) {
        // Only where the final ground really steps here (trail/plaza carving can flatten a terrace away).
        const lowG = L.heightAt(mx + nx * 0.9, mz + nz * 0.9);
        const highG = L.heightAt(mx - nx * 0.9, mz - nz * 0.9);
        if (Math.abs(lowG - (yb + 0.4)) > 0.7 || Math.abs(highG - (yt - 0.22)) > 0.7) continue;
      }
      const v0 = yb / 2.3;
      const v1 = yt / 2.3;
      const u1 = u + len / 2.3;
      const quad = [
        [x0, yb, z0, u, v0],
        [x1, yb, z1, u1, v0],
        [x1, yt, z1, u1, v1],
        [x0, yb, z0, u, v0],
        [x1, yt, z1, u1, v1],
        [x0, yt, z0, u, v1],
      ];
      for (const [x, y, z, uu, vv] of quad) {
        pos.push(x as number, y as number, z as number);
        nor.push(nx, 0.15, nz);
        uv.push(uu as number, vv as number);
      }
      u = u1 % 64;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshToonMaterial({
      map: ashlarTexture(),
      gradientMap: toon.toon("#fff").gradientMap,
      side: THREE.DoubleSide,
    });
    extraMats.push(mat);
    const walls = new THREE.Mesh(geo, mat);
    walls.name = "andenes-walls";
    walls.receiveShadow = true;
    group.add(walls);
  }

  // ---------------------------------------------------------------- placement helper
  const R = rng(73);
  const clearOf = (x: number, z: number, pad: number) => {
    const r = Math.hypot(x, z);
    if (r > rimRadius(Math.atan2(z, x)) - 4) return false;
    if (L.trailQuery(x, z).d < HALF_WIDTH + pad) return false;
    for (const p of L.plazas) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return false;
      const dx = p.x - p.tx;
      const dz = p.z - p.tz;
      const l2 = dx * dx + dz * dz || 1;
      const u = Math.min(1, Math.max(0, ((x - p.tx) * dx + (z - p.tz) * dz) / l2));
      if (Math.hypot(x - p.tx - dx * u, z - p.tz - dz * u) < p.spur + pad) return false;
    }
    if (L.streamDist(x, z) < 2.8 + pad) return false;
    const y = L.heightAt(x, z);
    if (y < RIVER_LEVEL + 0.6) return false;
    return true;
  };
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------- rocks
  {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const count = quality === "high" ? 240 : 140;
    const mesh = new THREE.InstancedMesh(geo, toon.toon("#ffffff"), count);
    mesh.name = "rocks";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const c = new THREE.Color();
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 168;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!clearOf(x, z, 1.5)) continue;
      const y = L.heightAt(x, z);
      const s = R() < 0.12 ? 1.6 + R() * 2.4 : 0.35 + R() * 0.8;
      dummy.position.set(x, y + s * 0.15, z);
      dummy.rotation.set(R() * 3, R() * 3, R() * 3);
      dummy.scale.set(s * (0.8 + R() * 0.6), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      c.set(R() < 0.55 ? WORLD.stone : WORLD.stoneDark);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // ---------------------------------------------------------------- vegetation (flora/: ichu, flowers, trees)
  // Ichu in three looks, wild lupine + yellow daisies by the trail, queñua, aliso, unca, pisonay, chusquea.
  // Placed after the rocks so nothing grows through a boulder.
  const flora = (() => {
    const avoid: Array<[number, number, number]> = [];
    const rocks = group.getObjectByName("rocks") as THREE.InstancedMesh | undefined;
    if (rocks) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      for (let i = 0; i < rocks.count; i++) {
        rocks.getMatrixAt(i, m);
        m.decompose(p, q, s);
        avoid.push([p.x, p.z, Math.max(s.x, s.z) * 0.95 + 0.15]);
      }
    }
    // Phones get a lighter flora on top of "low" (quality.ts deviceProfile); desktop is unchanged.
    return createFlora(L, toon.toon("#fff").gradientMap, quality, {
      reducedMotion,
      avoid,
      phone: detectDevice().phone,
    });
  })();
  for (const o of flora.objects) {
    group.add(o);
    // Ground cover only reads as speckle from the title distance; it appears as the camera swoops down.
    if (o.name.startsWith("ichu") || o.name.startsWith("flora-")) playOnly.push(o);
  }

  // ---------------------------------------------------------------- distant ranges (play)
  {
    const parts: THREE.BufferGeometry[] = [];
    const Rr = rng(11);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Rr() * 0.25;
      const dist = 470 + Rr() * 260;
      const hgt = 110 + Rr() * 170;
      const rad = 90 + Rr() * 90;
      const g = new THREE.ConeGeometry(rad, hgt, 7, 5).toNonIndexed();
      const pa = g.attributes.position as THREE.BufferAttribute;
      const cols: number[] = [];
      for (let v = 0; v < pa.count; v++) {
        const y = pa.getY(v);
        const f = (y + hgt / 2) / hgt;
        const jx = noise2(pa.getX(v) * 0.03 + i, y * 0.03) * rad * 0.18 * (1 - f);
        pa.setX(v, pa.getX(v) + jx);
        pa.setY(v, y + hgt / 2);
      }
      for (let v = 0; v < pa.count; v += 3) {
        const fy = (pa.getY(v) + pa.getY(v + 1) + pa.getY(v + 2)) / 3 / hgt;
        const c = fy > 0.62 ? PAL.snow : fy > 0.3 ? PAL.stoneDark : PAL.stone;
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.deleteAttribute("uv");
      g.computeVertexNormals();
      g.translate(Math.cos(a) * dist, -6, Math.sin(a) * dist);
      parts.push(g);
    }
    const geo = mergeGeometries(parts) as THREE.BufferGeometry;
    for (const g of parts) g.dispose();
    const ranges = new THREE.Mesh(geo, toon.vertexToon());
    ranges.name = "distant-peaks";
    group.add(ranges);
    playOnly.push(ranges);
  }

  // ---------------------------------------------------------------- clouds
  const cloudMaterial = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toon.toon("#fff").gradientMap });
  const clouds = new THREE.Group();
  clouds.name = "clouds";
  {
    const Rc = rng(5);
    const specs: Array<[number, number, number]> = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Rc() * 0.4;
      const low = i % 4 === 0;
      specs.push([a, low ? 150 + Rc() * 60 : 120 + Rc() * 170, low ? -30 - Rc() * 25 : 88 + Rc() * 50]);
    }
    for (const [a, r, y] of specs) {
      const parts: THREE.BufferGeometry[] = [];
      const puffs = 4 + Math.floor(Rc() * 3);
      for (let p = 0; p < puffs; p++) {
        const s = 5 + Rc() * 6;
        const g = new THREE.IcosahedronGeometry(s, 1);
        g.scale(1, 0.62, 1);
        g.translate((p - puffs / 2) * 6.5 + Rc() * 3, Rc() * 2.5, (Rc() - 0.5) * 7);
        parts.push(g);
      }
      const geo = mergeGeometries(parts) as THREE.BufferGeometry;
      for (const g of parts) g.dispose();
      const m = new THREE.Mesh(geo, cloudMaterial);
      m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      m.rotation.y = -a;
      m.userData.baseY = y;
      m.userData.phase = Rc() * 6;
      clouds.add(m);
    }
  }
  group.add(clouds);

  return {
    group,
    titleOnly,
    playOnly,
    clouds,
    cloudMaterial,
    dispose() {
      for (const w of waters) w.material.dispose();
      for (const m of extraMats) m.dispose();
      flora.dispose();
    },
    update(dt, t) {
      for (const w of waters) w.tick(t);
      flora.update(t);
      for (const f of foamBits) {
        const ph = f.userData.phase as number;
        f.position.y = 0.42 + Math.abs(Math.sin(t * 3 + ph)) * 0.25;
        f.scale.setScalar(0.8 + Math.sin(t * 5 + ph) * 0.2);
      }
      clouds.rotation.y += dt * 0.006;
      for (const c of clouds.children)
        c.position.y = (c.userData.baseY as number) + Math.sin(t * 0.2 + (c.userData.phase as number)) * 1.2;
    },
  };
}
