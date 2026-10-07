/**
 * The river: a flat "café con leche" ribbon along `layout.river` with toon light, drifting foam streaks,
 * slow ripple bands and foam where the water meets the banks, plus leaves and twigs drifting downstream.
 *
 * The ribbon is wider than `halfWidth`: the terrain only rises above the river level some way past the bank
 * line (0–5 u, different on each shore), so a ribbon of exactly halfWidth would leave a dry trench. Each side
 * is measured with `shoreDistance` (heightAt, what the terrain mesh renders) and the ribbon runs EXTRA past
 * it, under the bank, hidden by the terrain's depth. Shore foam sits on that measured waterline.
 * Opaque and on the ink layer (no inkMask: masks are for readable labels only). The shader only touches
 * `diffuseColor`, so the 3-step toon ramp, fog and the day/night lights apply as on every other surface.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import type { SelvaLayout } from "../contract";
import { floatModel } from "./models";
import { rng } from "./placement";

/** Ribbon margin past the measured waterline on each side (runs under the bank). */
const EXTRA = 1.2;

/**
 * Where the water meets the ground on one side of river point (x, z): the distance from the centerline at
 * which `heightAt` first rises above the river level (the bank profile differs between the shores and
 * along the river), marching outward from the bank line.
 */
export function shoreDistance(L: SelvaLayout, x: number, z: number, nx: number, nz: number, half: number) {
  for (let o = -2; o < 16; o += 0.2) {
    const w = half + o;
    if (L.heightAt(x + nx * w, z + nz * w) >= L.river.level) return Math.max(half * 0.5, w);
  }
  return half + 16;
}

export interface Water {
  objects: THREE.Object3D[];
  update(dt: number, time: number, motion: boolean): void;
  setNight(night: number): void;
  dispose(): void;
}

/** Brown river material: foam streaks advected along v (flow), shore foam from the per-vertex `shore`. */
function riverMaterial(toon: ToonCache) {
  const material = new THREE.MeshToonMaterial({ color: "#b08657", gradientMap: toon.toon("#fff").gradientMap });
  material.defines = { ...(material.defines ?? {}), USE_UV: "" };
  const uniforms = {
    uTime: { value: 0 },
    uFoam: { value: new THREE.Color("#e9dcc2") },
    uDeep: { value: new THREE.Color("#8a6440") },
    uNight: { value: 0 },
    uSheen: { value: new THREE.Color("#d3d8c8") },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float shore;\nvarying float vShore;\nvarying vec2 vW;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvShore = shore;\nvW = (modelMatrix * vec4(position, 1.0)).xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime, uNight;
        uniform vec3 uFoam, uDeep, uSheen;
        varying float vShore;
        varying vec2 vW;
        float kwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float kwNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(kwHash(i), kwHash(i + vec2(1.0, 0.0)), f.x), mix(kwHash(i + vec2(0.0, 1.0)), kwHash(i + 1.0), f.x), f.y);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // vUv.x: 0..1 across the ribbon; vUv.y: metres downstream / 8. Flow ≈ 0.35 m/s.
        float flow = vUv.y * 8.0 - uTime * 0.35;
        float across = vUv.x;
        // Darker deep channel in the middle, lighter silty shallows toward the banks.
        float mid = 1.0 - abs(across - 0.5) * 2.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDeep, smoothstep(0.35, 0.9, mid) * 0.45);
        // Foam streaks: long thin lanes, broken up by noise and drifting downstream.
        float lane = kwNoise(vec2(across * 30.0, flow * 0.05));
        float brk = kwNoise(vec2(across * 7.0 + 3.1, flow * 0.18));
        float streak = step(0.84, lane) * step(0.62, brk);
        // Sparse slow swirl lines, stretched along the flow.
        float rip = kwNoise(vec2(across * 6.0, flow * 0.12) + vec2(0.0, uTime * 0.02));
        float ripple = step(0.53, rip) * step(rip, 0.545) * step(0.45, kwNoise(vW * 0.08));
        // Foam where the water meets the bank (vShore: 0 center … 1 the bank line).
        float edge = smoothstep(0.9, 0.98, vShore) * (0.55 + 0.45 * kwNoise(vec2(flow * 0.5, across * 40.0)));
        float foam = clamp(streak * 0.7 + ripple * 0.3 + edge * 0.8, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uFoam * (1.0 - uNight * 0.45), foam);
        // Grazing-angle sheen (the sky on the water) so the flat brown reads as a surface, not a mud flat.
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), upV), 0.0, 1.0), 3.0);
        float glint = step(0.6, kwNoise(vec2(across * 60.0, flow * 1.4))) * 0.5 + 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, uSheen * (1.0 - uNight * 0.6), fres * 0.3 * glint);`,
      );
  };
  material.customProgramCacheKey = () => "selva-river";
  return { material, uniforms };
}

export function buildWater(L: SelvaLayout, toon: ToonCache, quality: "low" | "high"): Water {
  const { pts, halfWidth, level } = L.river;
  const pos: number[] = [];
  const uv: number[] = [];
  const shore: number[] = [];
  const idx: number[] = [];
  const ACROSS = 8;
  let dist = 0;
  const cum: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i] as [number, number];
    const [ax, az] = pts[Math.max(0, i - 1)] as [number, number];
    const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
    if (i > 0) dist += Math.hypot(x - ax, z - az);
    cum.push(dist);
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const half = halfWidth[i] as number;
    // Waterline on each side (-1: −n, 1: +n); the ribbon reaches EXTRA past it.
    const sL = shoreDistance(L, x, z, -nx, -nz, half);
    const sR = shoreDistance(L, x, z, nx, nz, half);
    for (let k = 0; k <= ACROSS; k++) {
      const f = k / ACROSS - 0.5;
      const sh = f < 0 ? sL : sR;
      const d = Math.abs(f) * 2 * (sh + EXTRA) * Math.sign(f);
      pos.push(x + nx * d, level, z + nz * d);
      uv.push(k / ACROSS, dist / 8);
      // 1 at the waterline, above 1 under the bank.
      shore.push(Math.abs(d) / sh);
    }
    if (i > 0) {
      const r0 = (i - 1) * (ACROSS + 1);
      const r1 = i * (ACROSS + 1);
      // Wound counter-clockwise seen from above (front face up).
      for (let k = 0; k < ACROSS; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("shore", new THREE.Float32BufferAttribute(shore, 1));
  geo.setIndex(idx);
  const nrm = new Float32Array((pos.length / 3) * 3);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.computeBoundingSphere();
  const { material, uniforms } = riverMaterial(toon);
  const river = new THREE.Mesh(geo, material);
  river.name = "selva-river";
  river.receiveShadow = true;

  // ---------------------------------------------------------------- drifting leaves and twigs
  const total = dist;
  const sample = (s: number, off: number, out: THREE.Vector3, dir: THREE.Vector3) => {
    let i = 1;
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if ((cum[m] as number) < s) lo = m + 1;
      else hi = m;
    }
    i = lo;
    const a = pts[i - 1] as [number, number];
    const b = pts[i] as [number, number];
    const seg = (cum[i] as number) - (cum[i - 1] as number) || 1;
    const f = (s - (cum[i - 1] as number)) / seg;
    dir.set(b[0] - a[0], 0, b[1] - a[1]).normalize();
    const w = (halfWidth[i] as number) * off;
    out.set(a[0] + (b[0] - a[0]) * f - dir.z * w, level + 0.03, a[1] + (b[1] - a[1]) * f + dir.x * w);
  };
  const count = quality === "high" ? 90 : 45;
  const R = rng(91);
  const drift = Array.from({ length: count }, () => ({
    s: R() * total,
    off: (R() - 0.5) * 1.6,
    speed: 0.25 + R() * 0.2,
    spin: (R() - 0.5) * 0.6,
    yaw: R() * 6.28,
    scale: 0.6 + R() * 0.9,
  }));
  const floatGeo = floatModel();
  const floatMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon.toon("#fff").gradientMap });
  const floats = new THREE.InstancedMesh(floatGeo, floatMat, count);
  floats.name = "selva-river-drift";
  // Instances move every frame: a cached bounding sphere would pop them out, so no frustum culling (one draw).
  floats.frustumCulled = false;
  const tints = ["#6f9a3a", "#c9a23c", "#8a5a2e", "#4f7a2e"];
  const c = new THREE.Color();
  for (let k = 0; k < count; k++) floats.setColorAt(k, c.set(tints[k % tints.length] as string));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const place = () => {
    drift.forEach((d, k) => {
      sample(d.s, d.off, p, dir);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.yaw);
      m.compose(p, q, sc.setScalar(d.scale));
      floats.setMatrixAt(k, m);
    });
    floats.instanceMatrix.needsUpdate = true;
  };
  place();
  if (floats.instanceColor) floats.instanceColor.needsUpdate = true;

  return {
    objects: [river, floats],
    update(dt, time, motion) {
      uniforms.uTime.value = motion ? time : 0;
      if (!motion) return;
      for (const d of drift) {
        d.s = (d.s + d.speed * dt) % total;
        d.yaw += d.spin * dt;
      }
      place();
    },
    setNight(night) {
      uniforms.uNight.value = night;
    },
    dispose() {
      geo.dispose();
      material.dispose();
      floatGeo.dispose();
      floatMat.dispose();
    },
  };
}
