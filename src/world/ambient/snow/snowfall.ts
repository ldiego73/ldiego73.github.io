/**
 * Light snowfall: soft round flakes in a box that wraps around the camera entirely in the vertex shader
 * (static buffers, one draw call, no CPU work per flake), drifting and swaying as they fall.
 */
import * as THREE from "three";
import { noOutline } from "../../toon";

const BOX = new THREE.Vector3(32, 18, 32);

const VERT = /* glsl */ `
attribute float aSeed;
uniform vec3 uCenter, uOffset, uBox;
uniform float uTime, uSize, uAlpha;
varying float vA;
void main() {
  vec3 hb = uBox * 0.5;
  vec3 p = position + uOffset;
  // Each flake sways on its own little circle.
  p.x += sin(uTime * (0.6 + aSeed * 0.7) + aSeed * 40.0) * 0.6;
  p.z += cos(uTime * (0.5 + aSeed * 0.6) + aSeed * 23.0) * 0.6;
  p = mod(p - uCenter + hb, uBox) + uCenter - hb;
  float r = length(p.xz - uCenter.xz) / hb.x;
  vA = uAlpha * (1.0 - smoothstep(0.6, 1.0, r)) * (1.0 - smoothstep(0.75, 1.0, abs(p.y - uCenter.y) / hb.y));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Flakes right at the lens would be big blurry discs: fade them and cap the size.
  vA *= smoothstep(2.0, 5.0, -mv.z);
  gl_PointSize = min(uSize * 2.2, uSize * (0.6 + aSeed * 0.8) * (14.0 / max(1.0, -mv.z)));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.32, 0.5, d)) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export interface Snowfall {
  object: THREE.Object3D;
  setCount(n: number): void;
  /** amount 0..1; color = current fog color (flakes are a much lighter version of it). */
  update(dt: number, center: THREE.Vector3, amount: number, color: THREE.Color, pixelRatio: number): void;
  dispose(): void;
}

export function createSnowfall(max: number, count: number): Snowfall {
  const pos = new Float32Array(max * 3);
  const seed = new Float32Array(max);
  let s = 11;
  const R = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < max; i++) {
    pos[i * 3] = R() * BOX.x;
    pos[i * 3 + 1] = R() * BOX.y;
    pos[i * 3 + 2] = R() * BOX.z;
    seed[i] = R();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uOffset: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uTime: { value: 0 },
      uSize: { value: 3 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = "snowfall";
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.visible = false;
  noOutline(points);
  const U = mat.uniforms;
  const off = U.uOffset!.value as THREE.Vector3;
  const setCount = (n: number) => geo.setDrawRange(0, Math.max(0, Math.min(max, n)));
  setCount(count);
  const WHITE = new THREE.Color(1, 1, 1);
  let t = 0;
  return {
    object: points,
    setCount,
    update(dt, center, amount, color, pixelRatio) {
      points.visible = amount > 0.02;
      if (!points.visible) return;
      t += dt;
      const wind = 0.5 + Math.sin(t * 0.07) * 0.4;
      off.x = (off.x + wind * dt) % BOX.x;
      off.y = (((off.y - 1.1 * dt) % BOX.y) + BOX.y) % BOX.y;
      off.z = (off.z + 0.25 * dt) % BOX.z;
      U.uTime!.value = t;
      U.uSize!.value = 3.2 * pixelRatio;
      (U.uCenter!.value as THREE.Vector3).copy(center);
      (U.uColor!.value as THREE.Color).copy(color).lerp(WHITE, 0.85);
      U.uAlpha!.value = amount * 0.9;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
