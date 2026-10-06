/**
 * Inti Raymi bonfires: a ring of stones and a tepee of logs (toon + ink, instanced), two-tone flames (glow,
 * no outline, instanced, flickering), one Points glow halo per fire and one Points cloud of rising embers
 * (both animated entirely in the shader). A fixed pool of point lights follows the fires nearest the
 * traveler; the pool size never changes at runtime (that would recompile every lit material).
 * Draw calls: stones, logs, outer flames, inner flames, halos, embers = 6 for all fires.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { C } from "../../props";
import { flicker } from "./spots";

export interface Fire {
  x: number;
  y: number;
  z: number;
}

const HALO_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uSize, uAlpha;
varying float vA;
void main() {
  float f = 0.85 + 0.1 * sin(uTime * 9.0 + aSeed * 7.0) + 0.05 * sin(uTime * 23.0 + aSeed * 3.0);
  vA = uAlpha * f;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(uSize * 4.0, uSize * f * (70.0 / max(1.0, -mv.z)));
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.2) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const EMBER_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uSize, uAlpha;
varying float vLife;
varying float vA;
void main() {
  float life = fract(uTime * (0.32 + aSeed * 0.3) + aSeed * 7.31);
  vec3 p = position;
  p.x += sin(life * 6.0 + aSeed * 20.0) * 0.45 * life;
  p.z += cos(life * 5.0 + aSeed * 13.0) * 0.45 * life;
  p.y += 0.5 + life * (2.4 + aSeed * 1.6);
  vLife = life;
  vA = uAlpha * (1.0 - life) * smoothstep(0.0, 0.08, life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = min(uSize * 1.6, uSize * (0.5 + aSeed) * (9.0 / max(1.0, -mv.z)));
  gl_Position = projectionMatrix * mv;
}`;
const EMBER_FRAG = /* glsl */ `
varying float vLife;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.3, 0.5, d)) * vA;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(1.0, 0.86, 0.45), vec3(0.95, 0.32, 0.12), vLife);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export interface Bonfires {
  group: THREE.Group;
  /** night 0..1 (glow strength); avatar = where the light pool gathers. */
  update(dt: number, avatar: THREE.Vector3, night: number): void;
  dispose(): void;
}

export function createBonfires(
  env: WorldEnv,
  fires: Fire[],
  opts: { lights: number; embersPer: number; animate: boolean },
): Bonfires {
  const group = new THREE.Group();
  group.name = "inti-raymi-fires";
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const seeds = fires.map((_, i) => (i * 0.618 + 0.17) % 1);

  // Stones: 8 per fire, slightly irregular.
  const STONES = 8;
  const stoneGeo = new THREE.DodecahedronGeometry(0.26, 0);
  geos.push(stoneGeo);
  const stones = new THREE.InstancedMesh(stoneGeo, env.toon(C.stoneDark), fires.length * STONES);
  stones.name = "fire-stones";
  fires.forEach((f, i) => {
    for (let k = 0; k < STONES; k++) {
      const a = (k / STONES) * Math.PI * 2 + seeds[i]! * 2;
      const sx = f.x + Math.cos(a) * 0.72;
      const sz = f.z + Math.sin(a) * 0.72;
      e.set(k * 1.3, a, k * 0.7);
      s.set(1 + (k % 3) * 0.12, 0.7 + (k % 2) * 0.15, 1);
      m4.compose(v.set(sx, env.heightAt(sx, sz) + 0.08, sz), q.setFromEuler(e), s);
      stones.setMatrixAt(i * STONES + k, m4);
    }
  });
  stones.instanceMatrix.needsUpdate = true;
  stones.computeBoundingSphere();

  // Logs: a 4-log tepee.
  const LOGS = 4;
  const logGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.15, 6);
  logGeo.translate(0, 0.575, 0);
  geos.push(logGeo);
  const logs = new THREE.InstancedMesh(logGeo, env.toon(C.woodDark), fires.length * LOGS);
  logs.name = "fire-logs";
  fires.forEach((f, i) => {
    for (let k = 0; k < LOGS; k++) {
      const a = (k / LOGS) * Math.PI * 2 + seeds[i]! * 3;
      const bx = f.x + Math.cos(a) * 0.45;
      const bz = f.z + Math.sin(a) * 0.45;
      // Lean the log toward the fire center.
      q.setFromAxisAngle(v.set(-Math.sin(a), 0, Math.cos(a)), 0.5);
      m4.compose(v.set(bx, f.y + 0.02, bz), q, s.set(1, 1, 1));
      logs.setMatrixAt(i * LOGS + k, m4);
    }
  });
  logs.instanceMatrix.needsUpdate = true;
  logs.computeBoundingSphere();

  // Flames: an outer orange cone and an inner yellow one per fire.
  const flameGeo = new THREE.ConeGeometry(0.42, 1.25, 7, 1);
  flameGeo.translate(0, 0.625, 0);
  geos.push(flameGeo);
  const outerMat = new THREE.MeshBasicMaterial({ color: "#ff8a3d", toneMapped: false });
  const innerMat = new THREE.MeshBasicMaterial({ color: "#ffd66b", toneMapped: false });
  mats.push(outerMat, innerMat);
  const outer = new THREE.InstancedMesh(flameGeo, outerMat, fires.length);
  const inner = new THREE.InstancedMesh(flameGeo, innerMat, fires.length);
  outer.name = "fire-flames";
  inner.name = "fire-flames-core";
  for (const m of [outer, inner]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    env.noOutline(m);
  }
  const placeFlames = (t: number) => {
    fires.forEach((f, i) => {
      const k = flicker(t, seeds[i]! * 10);
      e.set(Math.sin(t * 3 + i) * 0.06, t * 0.8 + i, Math.cos(t * 2.6 + i) * 0.06);
      q.setFromEuler(e);
      m4.compose(v.set(f.x, f.y + 0.1, f.z), q, s.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.4));
      outer.setMatrixAt(i, m4);
      const k2 = flicker(t + 0.37, seeds[i]! * 10 + 4);
      m4.compose(v.set(f.x, f.y + 0.12, f.z), q, s.set(0.58, 0.68 * k2, 0.58));
      inner.setMatrixAt(i, m4);
    });
    outer.instanceMatrix.needsUpdate = true;
    inner.instanceMatrix.needsUpdate = true;
  };
  placeFlames(0);
  outer.computeBoundingSphere();
  inner.computeBoundingSphere();

  // Halos: one soft additive point per fire.
  const pr = Math.min(2, window.devicePixelRatio || 1);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      fires.flatMap((f) => [f.x, f.y + 0.8, f.z]),
      3,
    ),
  );
  haloGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geos.push(haloGeo);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 26 * pr },
      uAlpha: { value: 0.5 },
      uColor: { value: new THREE.Color("#ffab55") },
    },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mats.push(haloMat);
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.name = "fire-halos";
  halos.renderOrder = 3;
  env.noOutline(halos);

  // Embers: rising sparks, all in the shader.
  let embers: THREE.Points | null = null;
  let emberMat: THREE.ShaderMaterial | null = null;
  if (opts.embersPer > 0) {
    const n = fires.length * opts.embersPer;
    const pos = new Float32Array(n * 3);
    const sd = new Float32Array(n);
    let r = 5;
    const R = () => {
      r = (r * 16807) % 2147483647;
      return r / 2147483647;
    };
    fires.forEach((f, i) => {
      for (let k = 0; k < opts.embersPer; k++) {
        const j = i * opts.embersPer + k;
        pos[j * 3] = f.x + (R() - 0.5) * 0.5;
        pos[j * 3 + 1] = f.y;
        pos[j * 3 + 2] = f.z + (R() - 0.5) * 0.5;
        sd[j] = R();
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    geos.push(g);
    emberMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 5 * pr }, uAlpha: { value: 1 } },
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.push(emberMat);
    embers = new THREE.Points(g, emberMat);
    embers.name = "fire-embers";
    embers.frustumCulled = false;
    embers.renderOrder = 3;
    env.noOutline(embers);
  }

  group.add(stones, logs, outer, inner, halos);
  if (embers) group.add(embers);

  // Light pool: fixed size, moved to the nearest fires.
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < Math.min(opts.lights, fires.length); i++) {
    const l = new THREE.PointLight("#ff9a4a", 0, 13, 2);
    l.castShadow = false;
    lights.push(l);
    group.add(l);
  }
  const owner = lights.map(() => -1);
  const order = fires.map((_, i) => i);
  const d2 = new Float32Array(fires.length);
  let assignIn = 0;
  let t = 0;

  return {
    group,
    update(dt, avatar, night) {
      if (opts.animate) t += dt;
      assignIn -= dt;
      if (assignIn <= 0 && lights.length) {
        assignIn = 0.5;
        for (let i = 0; i < fires.length; i++) d2[i] = (fires[i]!.x - avatar.x) ** 2 + (fires[i]!.z - avatar.z) ** 2;
        order.sort((a, b) => d2[a]! - d2[b]!);
        for (let k = 0; k < lights.length; k++) {
          const fi = order[k]!;
          owner[k] = d2[fi]! < 70 * 70 ? fi : -1;
          if (owner[k]! >= 0) lights[k]!.position.set(fires[fi]!.x, fires[fi]!.y + 1.3, fires[fi]!.z);
        }
      }
      for (let k = 0; k < lights.length; k++) {
        const fi = owner[k]!;
        lights[k]!.intensity = fi < 0 ? 0 : (6 + 22 * night) * flicker(t, seeds[fi]! * 10);
      }
      if (opts.animate) placeFlames(t);
      haloMat.uniforms.uTime!.value = t;
      haloMat.uniforms.uAlpha!.value = 0.22 + 0.5 * night;
      if (emberMat) {
        emberMat.uniforms.uTime!.value = t;
        emberMat.uniforms.uAlpha!.value = 0.55 + 0.45 * night;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      stones.dispose();
      logs.dispose();
      outer.dispose();
      inner.dispose();
      for (const l of lights) l.dispose();
    },
  };
}
