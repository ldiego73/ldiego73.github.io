/**
 * The two rivers that cross the coast to the sea: a ribbon of water down each channel (layout.rivers: points
 * from just past the mouth up into the foothills, the water level falling toward the sea), in the toon style
 * with slow foam streaks drifting downstream (west). One mesh for both rivers; the ribbon runs a little under
 * the banks so no dry trench shows, and its mouth slips under the sea. Reduced motion: the streaks hold still.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { type CostaLayout, smooth } from "../layout";

export function buildRivers(L: CostaLayout, toon: ToonCache) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const r of L.rivers) {
    const base = pos.length / 3;
    let along = 0;
    const n = r.pts.length;
    for (let i = 0; i < n; i++) {
      const [x, z] = r.pts[i] as [number, number];
      const [ax, az] = r.pts[Math.max(0, i - 1)] as [number, number];
      const [bx, bz] = r.pts[Math.min(n - 1, i + 1)] as [number, number];
      if (i > 0) along += Math.hypot(x - ax, z - az);
      const dx = bx - ax;
      const dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l;
      const nz = dx / l;
      const d = x - L.shoreX(r.z);
      const half = (2.6 + 2.2 * smooth(60, 0, d)) * (1 - smooth(250, 340, x)) + 0.9;
      const y = (r.level[i] as number) + 0.02;
      for (const k of [-1, 0, 1]) {
        pos.push(x + nx * half * k, y, z + nz * half * k);
        uv.push((k + 1) / 2, along / 6);
      }
      if (i > 0) {
        const a = base + (i - 1) * 3;
        const b = base + i * 3;
        // Counter-clockwise from above (front faces up).
        for (let k = 0; k < 2; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshToonMaterial({
    color: "#86bdb0",
    gradientMap: toon.toon("#fff").gradientMap,
  });
  material.defines = { ...(material.defines ?? {}), USE_UV: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        float kwRh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float kwRn(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(kwRh(i), kwRh(i + vec2(1.0, 0.0)), f.x), mix(kwRh(i + vec2(0.0, 1.0)), kwRh(i + 1.0), f.x), f.y);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // vUv.y runs upstream (metres / 6); the water flows toward the sea (decreasing v).
        float flow = vUv.y + uTime * 0.12;
        float mid = 1.0 - abs(vUv.x - 0.5) * 2.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.45, 0.43), step(0.55, mid) * 0.4);
        float lane = kwRn(vec2(vUv.x * 14.0, flow * 1.4));
        float streak = step(0.8, lane) * step(0.5, kwRn(vec2(vUv.x * 5.0 + 2.0, flow * 3.0)));
        float edge = step(0.82, 1.0 - mid) * step(0.4, kwRn(vec2(flow * 6.0, vUv.x * 30.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.9, 0.84), clamp(streak * 0.7 + edge * 0.6, 0.0, 1.0));`,
      );
  };
  material.customProgramCacheKey = () => "costa-river";
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "costa-rivers";
  mesh.receiveShadow = true;
  return {
    mesh,
    update(time: number) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
