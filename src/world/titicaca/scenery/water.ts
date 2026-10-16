/**
 * Lake Titicaca's water: one opaque toon surface at the lake level, very blue, with the high-altitude light on
 * it. Two meshes share the material: a grid over the heightfield carrying the depth under each vertex (cells
 * wholly on land are dropped), and a skirt from the heightfield's edge out to the horizon (deep water).
 *
 * The shader only touches the colour before lighting (and adds the sun's glints after it), so the 3-step toon
 * ramp, fog and the day / night lights apply as on every other surface:
 *  - depth: turquoise over the shallow reed shelf → the lake's deep cobalt blue farther out;
 *  - ripples: thin bright bands from two drifting noise fields (calm water, gentle movement);
 *  - shore: a lapping foam line where the depth runs out;
 *  - sky: a grazing-angle sheen in the sky's colour (the reflection hint), and sparkling glints on the line
 *    from the sun to the eye, dimmed at night.
 * With prefers-reduced-motion the water is drawn still (no time). The water stays off the ink pass (see below).
 */
import * as THREE from "three";
import { noOutline, type ToonCache } from "../../toon";
import type { TiticacaLayout } from "../layout";

/** Skirt reach: well past the camera's far plane in every direction. */
const SKIRT = 2200;

export interface Lake {
  objects: THREE.Object3D[];
  update(time: number, sky: THREE.Color, sun: THREE.Vector3, motion: boolean): void;
  setNight(night: number): void;
  dispose(): void;
}

function lakeMaterial(toon: ToonCache) {
  const material = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toon.toon("#fff").gradientMap });
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uShallow: { value: new THREE.Color("#3fb0bf") },
    uMid: { value: new THREE.Color("#2577c4") },
    uDeep: { value: new THREE.Color("#1a48a6") },
    uFoam: { value: new THREE.Color("#f2f6f4") },
    uSky: { value: new THREE.Color("#cfe2f4") },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float depth;\nvarying float vDepth;\nvarying vec3 vW;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvDepth = depth;\nvW = (modelMatrix * vec4(position, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime, uNight;
        uniform vec3 uShallow, uMid, uDeep, uFoam, uSky, uSun;
        varying float vDepth;
        varying vec3 vW;
        float kwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float kwNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(kwHash(i), kwHash(i + vec2(1.0, 0.0)), f.x), mix(kwHash(i + vec2(0.0, 1.0)), kwHash(i + 1.0), f.x), f.y);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float d = vDepth;
        vec2 p = vW.xz;
        vec3 water = mix(uShallow, uMid, smoothstep(0.25, 1.6, d));
        water = mix(water, uDeep, smoothstep(1.6, 5.0, d));
        // Large slow patches (wind on the water) so the deep blue is not a flat fill.
        float patchN = kwNoise(p * 0.012 + vec2(uTime * 0.004, 0.0));
        water *= 0.94 + 0.12 * patchN;
        // Ripples: two drifting fields; a thin band where their mix crosses a level.
        float n1 = kwNoise(p * 0.09 + vec2(uTime * 0.05, uTime * 0.02));
        float n2 = kwNoise(p * 0.21 - vec2(uTime * 0.03, -uTime * 0.05));
        float m = n1 * 0.6 + n2 * 0.4;
        float rip = smoothstep(0.6, 0.62, m) * (1.0 - smoothstep(0.63, 0.66, m));
        water = mix(water, mix(uSky, vec3(1.0), 0.4), rip * 0.22 * (1.0 - uNight * 0.7));
        // Lapping foam where the water meets the shore (depth → 0), breaking up with noise.
        float lap = 0.5 + 0.5 * sin(uTime * 1.1 + kwNoise(p * 0.3) * 6.0);
        float edge = 1.0 - smoothstep(0.02, 0.14 + 0.1 * lap, d);
        float foam = edge * step(0.35, kwNoise(p * 0.8 + uTime * 0.1));
        // Grazing-angle sheen: the sky on the water (a reflection hint).
        vec3 eye = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(eye.y, 0.0, 1.0), 4.0);
        water = mix(water, uSky * (1.0 - uNight * 0.75), fres * 0.4);
        water = mix(water, uFoam * (1.0 - uNight * 0.5), clamp(foam, 0.0, 1.0) * 0.85);
        diffuseColor.rgb = water;
        // Sun glints on the path from the sun to the eye (added after lighting below).
        vec3 rv = reflect(-eye, vec3(0.0, 1.0, 0.0));
        float sunPath = pow(max(dot(rv, normalize(uSun)), 0.0), 60.0);
        float sparkle = step(0.82, kwNoise(p * 1.7 + vec2(uTime * 0.6, -uTime * 0.4)));
        float kwGlint = sunPath * sparkle * (1.0 - uNight) * step(0.0, uSun.y);`,
      )
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight += vec3(1.0, 0.96, 0.86) * kwGlint * 0.9;\n#include <opaque_fragment>",
      );
  };
  material.customProgramCacheKey = () => "titicaca-lake";
  return { material, uniforms };
}

export function buildLake(L: TiticacaLayout, toon: ToonCache): Lake {
  const { n } = L.grid;
  // Half the terrain's resolution is plenty for a flat surface; the depth (and the foam line) interpolates.
  const m = Math.max(40, Math.round(n / 2));
  const { x0, z0, x1, z1 } = L.bounds;
  const sx = (x1 - x0) / m;
  const sz = (z1 - z0) / m;
  const depthAt = (x: number, z: number) => L.level - L.heightAt(x, z);
  const pos: number[] = [];
  const dep: number[] = [];
  const idx: number[] = [];
  const vid = new Int32Array((m + 1) * (m + 1)).fill(-1);
  const D = new Float32Array((m + 1) * (m + 1));
  for (let j = 0; j <= m; j++) for (let i = 0; i <= m; i++) D[j * (m + 1) + i] = depthAt(x0 + i * sx, z0 + j * sz);
  const vert = (i: number, j: number) => {
    const k = j * (m + 1) + i;
    if ((vid[k] as number) < 0) {
      vid[k] = pos.length / 3;
      pos.push(x0 + i * sx, L.level, z0 + j * sz);
      // The skirt's edge vertices read as deep, so the seam with the skirt is invisible far out.
      const edge = i === 0 || j === 0 || i === m || j === m;
      dep.push(edge ? Math.max(D[k] as number, 8) : (D[k] as number));
    }
    return vid[k] as number;
  };
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const a = D[j * (m + 1) + i] as number;
      const b = D[(j + 1) * (m + 1) + i] as number;
      const c = D[(j + 1) * (m + 1) + i + 1] as number;
      const d = D[j * (m + 1) + i + 1] as number;
      // Wholly on land (the ground is well above the water): never seen.
      if (Math.max(a, b, c, d) < -1.2) continue;
      const va = vert(i, j);
      const vb = vert(i, j + 1);
      const vc = vert(i + 1, j + 1);
      const vd = vert(i + 1, j);
      idx.push(va, vb, vd, vb, vc, vd);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("depth", new THREE.Float32BufferAttribute(dep, 1));
  geo.setIndex(idx);
  const up = new Float32Array(pos.length);
  for (let i = 1; i < up.length; i += 3) up[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(up, 3));
  geo.computeBoundingSphere();

  // Skirt: four trapezoids from the heightfield's square out to SKIRT (deep water to the horizon).
  const sk = new THREE.BufferGeometry();
  const inner = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const outer = [
    [-SKIRT, -SKIRT],
    [SKIRT, -SKIRT],
    [SKIRT, SKIRT],
    [-SKIRT, SKIRT],
  ];
  const sp: number[] = [];
  const si: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = inner[k] as number[];
    const b = inner[(k + 1) % 4] as number[];
    const c = outer[(k + 1) % 4] as number[];
    const d = outer[k] as number[];
    const o = sp.length / 3;
    sp.push(a[0] as number, L.level, a[1] as number, b[0] as number, L.level, b[1] as number);
    sp.push(c[0] as number, L.level, c[1] as number, d[0] as number, L.level, d[1] as number);
    // Counter-clockwise from above.
    si.push(o, o + 3, o + 1, o + 1, o + 3, o + 2);
  }
  sk.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  sk.setAttribute("depth", new THREE.Float32BufferAttribute(new Array(sp.length / 3).fill(9), 1));
  const skUp = new Float32Array(sp.length);
  for (let i = 1; i < skUp.length; i += 3) skUp[i] = 1;
  sk.setAttribute("normal", new THREE.BufferAttribute(skUp, 3));
  sk.setIndex(si);
  sk.computeBoundingSphere();

  const { material, uniforms } = lakeMaterial(toon);
  material.side = THREE.DoubleSide;
  const lake = new THREE.Mesh(geo, material);
  lake.name = "titicaca-lake";
  // No shadows on the water: the shadow camera's edge would draw a straight line across the lake.
  lake.receiveShadow = false;
  const skirt = new THREE.Mesh(sk, material);
  skirt.name = "titicaca-lake-far";
  skirt.frustumCulled = false;
  // The water is off the ink pass. A flat surface seen at a grazing angle jumps in depth from one pixel row to
  // the next far out, which the edge detect reads as an edge on every row: a black band along the horizon.
  // Off the pass, the shore and everything afloat (islands, boats, birds) still ink against the empty buffer.
  noOutline(lake);
  noOutline(skirt);
  return {
    objects: [lake, skirt],
    update(time, sky, sun, motion) {
      uniforms.uTime.value = motion ? time : 0;
      uniforms.uSky.value.copy(sky);
      uniforms.uSun.value.copy(sun);
    },
    setNight(night) {
      uniforms.uNight.value = night;
    },
    dispose() {
      geo.dispose();
      sk.dispose();
      material.dispose();
    },
  };
}
