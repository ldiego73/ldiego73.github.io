/**
 * Blown sand: the steady sea breeze lifts grains off the desert and skims them inland round the traveler, thin
 * between gust fronts and in streams when a front crosses (the same fronts that roll over the totora and snap
 * the banners: the shared wind, ../../wind.ts `liveWind`). Rules in ./arena/logic.ts (pure, tested).
 * One point cloud of short streaks lying along the wind (one draw call, no ink, no shadow), drawn only round
 * the traveler; its colour follows the fog's brightness so the grains never glow at night. Hidden with
 * prefers-reduced-motion (no gusts then).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import type { SuyuEnv } from "../../suyu/contract";
import { liveWind } from "../../wind";
import type { CostaLayout } from "../layout";
import { SEA } from "../layout";
import { createGrains, stepGrains } from "./arena/logic";

const SAND = new THREE.Color("#e8c98e");

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  if (env.reducedMotion) return { update() {}, dispose() {} };
  const L = env.suyu.layout as CostaLayout;
  const n = env.quality === "high" ? 1400 : 700;
  const grains = createGrains(n);
  let seed = 0x5a4d;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const sample = { x: 0, z: 0, gust: 0 };
  const ctx = {
    fx: 0,
    fz: 0,
    wind(x: number, z: number) {
      const w = liveWind.sample(x, z);
      sample.x = w.x;
      sample.z = w.z;
      sample.gust = w.gust;
      return sample;
    },
    gustAmp: 0,
    ground: (x: number, z: number) => L.heightAt(x, z),
    // Dry sand only: not the sea or the rivers, not the green valley floors.
    isSand: (x: number, z: number) => !L.isWater(x, z) && L.heightAt(x, z) > SEA + 0.25 && L.green(x, z) < 0.3,
    rand,
  };

  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = 0.85 + ((i * 0.6180339) % 1) * 0.15;
    col[i * 4] = v;
    col[i * 4 + 1] = v;
    col[i * 4 + 2] = v;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", colAttr);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.PointsMaterial({
    size: 0.34,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.02,
  });
  // Each grain is drawn as a short, hard-edged streak (3:1) lying along the wind as seen on screen: the
  // shared wind's direction (cpaWindDir, from the style uniforms every built-in material has) is projected
  // next to the grain, and the fragment keeps a thin ellipse along it. No texture.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vStreak;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
        vec2 wd = cpaWindDir();
        vec4 tip = projectionMatrix * modelViewMatrix * vec4(transformed + vec3(wd.x, 0.0, wd.y), 1.0);
        vec2 sd = tip.xy / tip.w - gl_Position.xy / gl_Position.w;
        vStreak = length(sd) > 1e-5 ? normalize(sd) : vec2(1.0, 0.0);`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vStreak;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 pc = gl_PointCoord * 2.0 - 1.0;
        pc.y = -pc.y;
        float al = dot(pc, vStreak);
        float ac = dot(pc, vec2(-vStreak.y, vStreak.x)) * 3.2;
        float e = al * al + ac * ac;
        diffuseColor.a *= 1.0 - smoothstep(0.75, 1.0, e);`,
      );
  };
  mat.customProgramCacheKey = () => "costa-arena";
  const points = new THREE.Points(geo, mat);
  points.name = "costa-arena";
  points.frustumCulled = false;
  points.renderOrder = 2;
  env.noOutline(points);
  env.scene.add(points);

  const fogCol = new THREE.Color();
  return {
    update(dt, avatar) {
      ctx.fx = avatar.x;
      ctx.fz = avatar.z;
      ctx.gustAmp = liveWind.state.gustAmp;
      stepGrains(grains, Math.min(dt, 0.1), ctx);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = grains.x[i] as number;
        pos[i * 3 + 1] = grains.y[i] as number;
        pos[i * 3 + 2] = grains.z[i] as number;
        col[i * 4 + 3] = (grains.alpha[i] as number) * 0.8;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      // Lit like the air: full sand colour by day, dim with the fog at dusk and night.
      const fog = env.scene.fog as THREE.Fog | null;
      if (fog) fogCol.copy(fog.color);
      else fogCol.setRGB(1, 1, 1);
      const day = Math.min(1, 0.2 + (fogCol.r * 0.2126 + fogCol.g * 0.7152 + fogCol.b * 0.0722) * 1.25);
      mat.color.copy(SAND).lerp(fogCol, 0.12).multiplyScalar(day);
    },
    dispose() {
      points.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
};
