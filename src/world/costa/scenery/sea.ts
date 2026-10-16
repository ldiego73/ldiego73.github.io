/**
 * The Pacific: ONE opaque mesh from under the beach out to the horizon, displaced in the vertex shader by
 * ./waves.ts (the same function the boats float on) and shaded in the toon style:
 *  - colour in hard bands by the seabed depth under each point (turquoise shallows, a green-blue middle, deep
 *    ultramarine), softly broken by noise so the contours never look ruled;
 *  - foam: the breakers' crests in the surf zone, the swash edge that runs up the sand and back (where the
 *    water column over the beach is thinnest), and lace rings round rocks and islets;
 *  - the sky at grazing angles (fog colour, two steps), the toon light ramp on the wave slopes, and a sun path:
 *    a glittering band toward the sun, wide and golden when the sun is low (sunset over the sea), and a silver
 *    one under the moon at night.
 *
 * Geometry: a coast-following grid. Each row is a line of constant z; its columns are offshore distances s
 * (x = shoreX(z) − s), fine across the surf zone and growing geometrically to ~3 km, and the rows extend past
 * the map north and south the same way, so the sea reaches the fogged horizon in every direction from one draw.
 * Per vertex: `aS` (offshore distance) and `aGround` (the terrain/seabed height there, from the layout).
 *
 * Ink: the outline prepass renders this mesh flat (it uses an override material), which is what we want: no ink
 * across the swell, the seabed hidden from the ink, and a crisp waterline drawn on the rocks and cliffs that rise
 * out of it. The whole sea is also an ink mask (../../toon.ts inkMask): a vast flat plane seen at grazing angles
 * makes the outline's relative-depth test fire row after row just below the horizon (a black band), and no line
 * ever belongs ON the open water, while the lines of everything standing in front of it stay.
 * Reduced motion: the waves freeze (time held at 0); the sea still reads as water.
 */
import * as THREE from "three";
import { arcDir } from "../../ambient/sky/moon";
import { inkMask, type ToonCache } from "../../toon";
import type { CostaLayout } from "../layout";
import { BOUNDS } from "../layout";
import { wavesGlsl } from "./waves";

export interface Sea {
  mesh: THREE.Mesh;
  update(time: number, skyTime: number, scene: THREE.Scene, camera: THREE.Camera): void;
  setNight(n: number): void;
  dispose(): void;
}

/** Offshore columns: fine across the surf zone, coarser beyond, geometric to the horizon. */
export function seaColumns(): number[] {
  const out: number[] = [];
  for (let s = -14; s < 44; s += 1.2) out.push(s);
  for (let s = 44; s < 150; s += 3.5) out.push(s);
  let s = 150;
  while (s < 3400) {
    out.push(s);
    s *= 1.2;
  }
  out.push(3400);
  return out;
}

/** Rows (z): every 2.5 u over the map, geometric beyond it to ~3 km north and south. */
export function seaRows(): number[] {
  const inner: number[] = [];
  for (let z = BOUNDS.z1 + 40; z >= BOUNDS.z0 - 40; z -= 2.5) inner.push(z);
  const north: number[] = [];
  const south: number[] = [];
  let d = 12;
  let zn = BOUNDS.z0 - 40;
  let zsth = BOUNDS.z1 + 40;
  while (d < 3000) {
    zn -= d;
    zsth += d;
    north.push(zn);
    south.unshift(zsth);
    d *= 1.25;
  }
  return [...south, ...inner, ...north];
}

export function buildSea(L: CostaLayout, _toon: ToonCache, quality: "low" | "high"): Sea {
  const cols = seaColumns();
  const rows = seaRows();
  const nc = cols.length;
  const nr = rows.length;
  const pos = new Float32Array(nc * nr * 3);
  const aS = new Float32Array(nc * nr);
  const aGround = new Float32Array(nc * nr);
  const zIn = (z: number) => Math.max(BOUNDS.z0 + 1, Math.min(BOUNDS.z1 - 1, z));
  for (let r = 0; r < nr; r++) {
    const z = rows[r] as number;
    const sx = L.shoreX(zIn(z));
    for (let c = 0; c < nc; c++) {
      const s = cols[c] as number;
      const k = r * nc + c;
      const x = sx - s;
      pos[k * 3] = x;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = z;
      aS[k] = s;
      const inside = x > BOUNDS.x0 && z > BOUNDS.z0 && z < BOUNDS.z1;
      aGround[k] = inside ? Math.max(-14, Math.min(4, L.heightAt(x, z))) : -14;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < nr - 1; r++)
    for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c;
      const b = a + 1;
      const d = a + nc;
      const e = d + 1;
      // Front faces up (rows run toward −z, columns toward −x).
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
  geo.setAttribute("aGround", new THREE.BufferAttribute(aGround, 1));
  const nrm = new Float32Array(nc * nr * 3);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(nc * nr > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  // Generous bounds: the waves move the surface ±1 u; the mesh is never culled in practice.
  geo.computeBoundingSphere();

  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uDeep: { value: new THREE.Color("#1f5f8f") },
    uMid: { value: new THREE.Color("#2f8fa6") },
    uShallow: { value: new THREE.Color("#5fc3bd") },
    uFoam: { value: new THREE.Color("#f4f1e6") },
    uSky: { value: new THREE.Color("#d8ece4") },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color("#fff3c4") },
    uSunAmt: { value: 1 },
    uMoon: { value: new THREE.Vector3(0, 1, 0) },
    uMoonAmt: { value: 0 },
    uDetail: { value: quality === "high" ? 1 : 0.6 },
  };
  const material = new THREE.MeshToonMaterial({ color: "#ffffff" });
  material.gradientMap = _toon.toon("#fff").gradientMap;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aS;
        attribute float aGround;
        uniform float uTime;
        varying float vS;
        varying float vGround;
        varying float vSeaY;
        varying vec3 vWp;
        varying vec3 vWn;
        ${wavesGlsl()}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 kwP = (modelMatrix * vec4(position, 1.0)).xyz;
        float kwY = kwSea(kwP.xz, aS, uTime);
        float kwE = 0.7;
        float kwHx = kwSea(kwP.xz + vec2(kwE, 0.0), aS - kwE, uTime);
        float kwHz = kwSea(kwP.xz + vec2(0.0, kwE), aS, uTime);
        vec3 objectNormal = normalize(vec3(-(kwHx - kwY) / kwE, 1.0, -(kwHz - kwY) / kwE));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        transformed.y += kwY;
        vS = aS;
        vGround = aGround;
        vSeaY = kwY;
        vWp = kwP + vec3(0.0, kwY, 0.0);
        vWn = objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime, uNight, uSunAmt, uMoonAmt, uDetail;
        uniform vec3 uDeep, uMid, uShallow, uFoam, uSky, uSun, uSunCol, uMoon;
        varying float vS;
        varying float vGround;
        varying float vSeaY;
        varying vec3 vWp;
        varying vec3 vWn;
        float kwH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float kwN(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(kwH(i), kwH(i + vec2(1.0, 0.0)), f.x), mix(kwH(i + vec2(0.0, 1.0)), kwH(i + 1.0), f.x), f.y);
        }
        ${wavesGlsl()}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 w = vWp.xz;
        float t = uTime;
        // Water column over the seabed (wobbled so the bands are never ruled lines).
        float wob = (kwN(w * 0.045) - 0.5) * 1.6 + (kwN(w * 0.21 + t * 0.05) - 0.5) * 0.35;
        float depth = vSeaY - vGround + wob;
        vec3 col = uDeep;
        col = mix(col, uMid, step(depth, 6.5));
        col = mix(col, uShallow, step(depth, 2.2));
        // A lighter band right before the sand: the water thins over the beach face.
        col = mix(col, mix(uShallow, uFoam, 0.35), step(depth, 0.55) * step(0.0, vS - 2.0 + wob));
        // Far out: a slow, darker cobalt so the horizon line holds.
        col = mix(col, mix(uDeep, uSky, 0.3), kwSm(400.0, 1800.0, vS) * 0.6);
        // Breakers: foam on the crests across the surf zone, broken up by noise.
        float crest = kwCrest(w.y, vS, t);
        float lace = kwN(vec2(w.y * 0.6, vS * 1.7 + t * 0.4));
        float foam = step(0.42, crest * (0.7 + 0.6 * lace));
        // The trailing lace just seaward of each crest (thin, patchy).
        float trail = step(0.93, kwBreakPhase(w.y, vS - 2.2, t)) * step(0.55, lace) * kwSurfEnv(vS + 3.0);
        foam = max(foam, trail * 0.85);
        // Swash edge: where the water runs thin over the sand (and round rocks and islets).
        float thin = vSeaY - vGround;
        float edge = 1.0 - step(0.13 + 0.07 * kwN(w * 0.8 + t * 0.3), thin);
        float wash = step(thin, 0.36) * step(0.7, kwN(w * 0.55 - vec2(t * 0.2, 0.0)));
        foam = max(foam, max(edge, wash * 0.8));
        // Sky at grazing angles (two hard steps), the toon way.
        vec3 V = normalize(cameraPosition - vWp);
        vec3 N = normalize(vWn);
        float fres = 1.0 - clamp(dot(V, N), 0.0, 1.0);
        float sky = step(0.82, fres) * 0.35 + step(0.93, fres) * 0.25;
        col = mix(col, uSky, sky * (1.0 - foam));
        col = mix(col, uFoam * (1.0 - uNight * 0.5), foam);
        // Sun path: glitter toward the sun, a narrow golden road when it is low; a silver path under the moon.
        vec3 Ng = normalize(N + vec3(kwN(w * 1.6 + t * 0.7) - 0.5, 0.0, kwN(w.yx * 1.4 - t * 0.6) - 0.5) * 0.28 * uDetail);
        vec3 R = reflect(-V, Ng);
        float sd = dot(R, uSun);
        float low = 1.0 - kwSm(0.05, 0.5, uSun.y);
        // Glints: short horizontal dashes (cells long across the view), flickering.
        float cell = kwH(floor(w * vec2(0.9, 2.6)) + floor(t * 5.0));
        float spark = step(1.0 - (0.004 + 0.016 * low), sd) * step(0.45, cell);
        float sheen = step(1.0 - (0.0012 + 0.006 * low), dot(reflect(-V, N), uSun)) * 0.55;
        float sunGl = max(spark, sheen) * uSunAmt * (1.0 - foam * 0.7);
        col = mix(col, uSunCol, sunGl);
        float md = dot(reflect(-V, Ng), uMoon);
        float mspark = step(0.988, md) * step(0.55, kwH(floor(w * vec2(0.9, 2.6)) + floor(t * 4.0)));
        col = mix(col, vec3(0.86, 0.9, 1.0), mspark * uMoonAmt * 0.8);
        diffuseColor.rgb = col;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Glitter and foam stay bright through the toon ramp.
        totalEmissiveRadiance += uSunCol * sunGl * 0.9 + vec3(0.86, 0.9, 1.0) * mspark * uMoonAmt * 0.6;`,
      );
  };
  material.customProgramCacheKey = () => "costa-sea";

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "costa-sea";
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  inkMask(mesh);

  const sun = new THREE.Vector3();
  const moon = new THREE.Vector3();
  let keyLight: THREE.DirectionalLight | null = null;
  return {
    mesh,
    update(time, skyTime, scene, _camera) {
      uniforms.uTime.value = time;
      arcDir(skyTime, 0, sun);
      uniforms.uSun.value.copy(sun);
      // Strongest with the sun low over the sea; gone below the horizon.
      uniforms.uSunAmt.value = THREE.MathUtils.smoothstep(sun.y, -0.06, 0.04);
      const low = 1 - THREE.MathUtils.smoothstep(sun.y, 0.05, 0.45);
      uniforms.uSunCol.value.set("#fff6d8").lerp(new THREE.Color("#ffb347"), low);
      const fog = scene.fog as THREE.Fog | null;
      if (fog) uniforms.uSky.value.copy(fog.color);
      // The moon path follows the key light at night (sky.ts points it at the moon when the moon is up).
      if (!keyLight)
        scene.traverse((o) => {
          if (!keyLight && (o as THREE.DirectionalLight).isDirectionalLight) keyLight = o as THREE.DirectionalLight;
        });
      if (keyLight) {
        moon.subVectors(keyLight.position, keyLight.target.position).normalize();
        uniforms.uMoon.value.copy(moon);
      }
    },
    setNight(n) {
      uniforms.uNight.value = n;
      uniforms.uMoonAmt.value = n;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
