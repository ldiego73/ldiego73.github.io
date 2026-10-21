/**
 * Everything beyond the walkable square, never walked on:
 *  - the skirt: the same terrain functions (../layout.ts terrainY) continued out to ±SKIRT as a coarse,
 *    vertex-coloured square ring, rising into far ridges, so the plateau, the pampa and the canyon's lips
 *    run on into the haze (the canyon itself is ./canyon.ts, which spans the same width);
 *  - the volcanoes: Sabancaya (an active cone with a faint fumarole plume), Hualca Hualca and Ampato across
 *    the canyon to the south, and Mismi behind the village to the north-east (the real Mismi stands on the
 *    canyon's north side). Faceted cones with ravines and snow above SNOW_Y. Real distances are compressed.
 *  - the plume: soft puffs rising from Sabancaya's crater and carried off by the shared wind (../../wind.ts
 *    liveWind: the same drifting direction, gust fronts and updraft `lift` the grass and the condors feel), so
 *    the column leans and stretches downwind in a gust (one Points draw, no outline; still with
 *    prefers-reduced-motion). Hazed like the terrain (styleUniforms + fog chunks).
 */
import * as THREE from "three";
import { styleUniforms } from "../../style-gl";
import type { ToonCache } from "../../toon";
import { liveWind } from "../../wind";
import { noise, smooth, terrainY } from "../layout";
import { CANYON, canyonS, HALF } from "../plan";
import { groundColor } from "./colors";

/** Outer half size of the skirt and its cell (25 u: the walkable square's edge ±600 falls on cell lines). */
const SKIRT = 1300;
const CELL = 25;

export interface Volcano {
  name: string;
  x: number;
  z: number;
  /** Base radius and peak height above y 0. */
  r: number;
  h: number;
  /** Snow line (world y) and crater radius at the top (0 = pointed). */
  snow: number;
  crater: number;
  seed: number;
}

export const VOLCANOES: ReadonlyArray<Volcano> = [
  { name: "sabancaya", x: 260, z: 760, r: 300, h: 330, snow: 250, crater: 14, seed: 3 },
  { name: "hualca-hualca", x: -150, z: 800, r: 330, h: 360, snow: 255, crater: 0, seed: 7 },
  { name: "ampato", x: 600, z: 860, r: 340, h: 390, snow: 260, crater: 0, seed: 11 },
  { name: "mismi", x: 700, z: -560, r: 280, h: 300, snow: 240, crater: 0, seed: 17 },
];

function skirt(toon: ToonCache): { mesh: THREE.Mesh; dispose(): void } {
  const n = Math.ceil((SKIRT * 2) / CELL);
  const N = n + 1;
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  const yAt = (x: number, z: number) => {
    const cheb = Math.max(Math.abs(x), Math.abs(z));
    const ridge = (noise(x / 110, z / 110, 0x5a) * 0.7 + noise(x / 40, z / 40, 0x5b) * 0.3) * 140;
    // Inside the canyon band keep its own lips (the canyon mesh draws the rest).
    const s = canyonS(x, z);
    const open = s > -30 && s < CANYON.south + 30 ? 0.15 : 1;
    return terrainY(x, z) + ridge * smooth(HALF + 60, SKIRT - 80, cheb) * open;
  };
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * N + i;
      const x = -SKIRT + i * CELL;
      const z = -SKIRT + j * CELL;
      const y = yAt(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const slope = Math.abs(yAt(x + CELL, z) - y) / CELL;
      groundColor(x, z, y, slope, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x0 = -SKIRT + i * CELL;
      const z0 = -SKIRT + j * CELL;
      // Skip cells under the walkable square (its own finer mesh) and inside the canyon.
      if (x0 >= -HALF && x0 + CELL <= HALF && z0 >= -HALF && z0 + CELL <= HALF) continue;
      const s = canyonS(x0 + CELL / 2, z0 + CELL / 2);
      if (s > CELL && s < CANYON.south - CELL) continue;
      const a = j * N + i;
      const b = (j + 1) * N + i;
      const cc = (j + 1) * N + i + 1;
      const d = j * N + i + 1;
      idx.push(a, b, d, b, cc, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  // The walkable mesh sits a hair above where they overlap at the square's edge.
  geo.translate(0, -0.15, 0);
  geo.computeVertexNormals();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-skirt";
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function volcanoes(toon: ToonCache): { mesh: THREE.Mesh; dispose(): void } {
  const pos: number[] = [];
  const col: number[] = [];
  const rock = new THREE.Color("#8a7563");
  const rock2 = new THREE.Color("#a08468");
  const ash = new THREE.Color("#6f6460");
  const snow = new THREE.Color("#f4f1ea");
  const c = new THREE.Color();
  const SEG = 56;
  const RINGS = 14;
  for (const v of VOLCANOES) {
    const base = terrainY(v.x, v.z) - 20;
    const P = (ring: number, seg: number): [number, number, number] => {
      const k = ring / RINGS;
      const a = (seg / SEG) * Math.PI * 2;
      // Concave cone (steeper toward the top), ravines by angle, a crater rim at the top.
      const ravine = 1 - 0.07 * Math.max(0, Math.sin(a * 9 + v.seed) * noise(seg / 3, ring / 2, v.seed));
      const r = (v.crater + (v.r - v.crater) * (1 - k) ** 1.6) * ravine * (0.94 + 0.12 * noise(a * 2, v.seed, 0x13));
      const y = base + (v.h - base) * k - (ring === RINGS && v.crater > 0 ? 12 : 0);
      return [v.x + Math.cos(a) * r, y, v.z + Math.sin(a) * r];
    };
    for (let ring = 0; ring < RINGS; ring++)
      for (let seg = 0; seg < SEG; seg++) {
        const a = P(ring, seg);
        const b = P(ring, seg + 1);
        const cc = P(ring + 1, seg + 1);
        const d = P(ring + 1, seg);
        const yMid = (a[1] + cc[1]) / 2;
        const streak = noise(seg / 2.3, v.seed, 0x14);
        if (yMid > v.snow - streak * 40) c.copy(snow);
        else
          c.copy(rock)
            .lerp(rock2, noise(seg / 4, ring / 3, v.seed + 1))
            .lerp(ash, v.name === "sabancaya" ? 0.35 : 0);
        for (const p of [a, d, b, b, d, cc]) {
          pos.push(p[0], p[1], p[2]);
          col.push(c.r, c.g, c.b);
        }
      }
    // Cap (pointed peaks) or crater floor.
    const top = v.h - (v.crater > 0 ? 12 : 0);
    for (let seg = 0; seg < SEG; seg++) {
      const a = P(RINGS, seg);
      const b = P(RINGS, seg + 1);
      c.copy(v.crater > 0 ? ash : snow);
      for (const p of [a, [v.x, top - (v.crater > 0 ? 6 : -4), v.z] as [number, number, number], b]) {
        pos.push(p[0], p[1], p[2]);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-volcanoes";
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

const PUFFS = 26;

/** Sabancaya's plume: soft puffs rising from the crater, drifting downwind and fading. */
function plume(reducedMotion: boolean) {
  const v = VOLCANOES[0] as Volcano;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PUFFS * 3);
  const size = new Float32Array(PUFFS);
  const alpha = new Float32Array(PUFFS);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      ...styleUniforms(),
      uColor: { value: new THREE.Color("#e9e4dc") },
      uScale: { value: 600 },
    },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
      #include <fog_pars_vertex>
      void main() {
        vA = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      #include <fog_pars_fragment>
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        float a = smoothstep(1.0, 0.25, r) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = "colca-plume";
  pts.frustumCulled = false;
  const top = v.h - 6;
  /** Puff life (s), how far the wind carries a puff per unit of wind speed, buoyant rise (u/s, fading). */
  const LIFE = 70;
  const CARRY = 2.6;
  const RISE = 3.4;
  const age = new Float32Array(PUFFS);
  const born = (i: number) => {
    pos[i * 3] = v.x + Math.sin(i * 7.1) * 3;
    pos[i * 3 + 1] = top;
    pos[i * 3 + 2] = v.z + Math.cos(i * 5.3) * 3;
  };
  for (let i = 0; i < PUFFS; i++) {
    age[i] = (i / PUFFS) * LIFE;
    born(i);
  }
  const look = (i: number) => {
    const k = (age[i] as number) / LIFE;
    size[i] = 26 + k * 70;
    alpha[i] = 0.5 * smooth(0, 0.08, k) * (1 - smooth(0.55, 1, k));
  };
  /** Advances every puff by dt: carried by the wind sampled where it is, rising less as it ages. */
  const step = (dt: number) => {
    for (let i = 0; i < PUFFS; i++) {
      let a = (age[i] as number) + dt;
      if (a >= LIFE) {
        a -= LIFE;
        born(i);
      }
      age[i] = a;
      const k = a / LIFE;
      const o = i * 3;
      const w = liveWind.sample(pos[o] as number, pos[o + 2] as number);
      const wob = Math.sin(i * 12.9 + k * 6) * 0.08;
      pos[o] = (pos[o] as number) + (w.x * CARRY + wob) * dt;
      pos[o + 1] = (pos[o + 1] as number) + (RISE * (1 - k) ** 1.5 + 0.3 + w.y * CARRY) * dt;
      pos[o + 2] = (pos[o + 2] as number) + (w.z * CARRY - wob * 0.5) * dt;
      look(i);
    }
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.aSize!.needsUpdate = true;
    geo.attributes.aAlpha!.needsUpdate = true;
  };
  // Warm start: the whole column is already standing when it first shows (one life in 1 s steps).
  const warm = () => {
    for (let s = 0; s < LIFE; s += 1) step(1);
  };
  // Hidden (alpha 0) until the warm start on the second frame, when the style runtime has published the wind.
  let frames = 0;
  return {
    points: pts,
    update(dt: number) {
      if (frames < 2) {
        if (++frames === 2) warm();
        return;
      }
      if (!reducedMotion) step(Math.min(dt, 0.1));
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function buildBackdrop(toon: ToonCache, reducedMotion: boolean) {
  const group = new THREE.Group();
  group.name = "colca-backdrop";
  const sk = skirt(toon);
  const vo = volcanoes(toon);
  const pl = plume(reducedMotion);
  group.add(sk.mesh, vo.mesh, pl.points);
  return {
    group,
    plume: pl.points,
    update: (dt: number) => pl.update(dt),
    dispose() {
      sk.dispose();
      vo.dispose();
      pl.dispose();
    },
  };
}
