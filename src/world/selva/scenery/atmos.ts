/**
 * Jungle atmosphere: low mist banks over the river (dawn and night) and light shafts (god rays) slanting down
 * through gaps in the canopy by day. Both are cheap: one instanced draw each, color pass only (noOutline),
 * no textures (soft shapes are computed in the fragment shader).
 *
 *  - Mist: camera-facing soft ellipses along the river at 0.6–3 u above the water, drifting downstream and
 *    breathing with value noise. Opacity follows the sky clock: thick around sunrise, a lighter veil at night,
 *    gone by mid morning. Colour comes from the scene fog (so it matches the sky), lifted toward white.
 *  - Shafts: two crossed tall trapezoids per shaft, additive, bright at the top and fading to nothing at the
 *    ground, tilted toward a fixed sun azimuth. On by day (strongest in the morning and afternoon), off at night.
 *    Fog fades their alpha (additive light must not add fog color).
 */
import * as THREE from "three";
import { noOutline } from "../../toon";
import type { SelvaLayout } from "../contract";
import { rng } from "./placement";

export interface Atmos {
  objects: THREE.Object3D[];
  /** `sky` = sky time (0 midnight, 0.25 sunrise), `fog` = scene fog color. */
  update(dt: number, time: number, sky: number, fog: THREE.Color | null, motion: boolean): void;
  setNight(night: number): void;
  dispose(): void;
}

const FOG_PARS_V = "#include <fog_pars_vertex>";
const smooth = THREE.MathUtils.smoothstep;

/** How thick the river mist is at sky time `t`: peak just after sunrise, a veil through the night. */
export function mistAmount(t: number) {
  const dawn = Math.exp(-(((t - 0.27) / 0.045) ** 2));
  const night = 1 - smooth(Math.sin((t - 0.25) * Math.PI * 2), -0.15, 0.12);
  return Math.min(1, dawn + 0.45 * night);
}

/** Light-shaft strength at sky time `t`: low sun (morning / afternoon) is best, none at night. */
export function shaftAmount(t: number) {
  const e = Math.sin((t - 0.25) * Math.PI * 2);
  if (e <= 0.02) return 0;
  return smooth(e, 0.02, 0.2) * (0.65 + 0.35 * (1 - e));
}

export function buildAtmos(L: SelvaLayout, quality: "low" | "high"): Atmos {
  const R = rng(131);
  const objects: THREE.Object3D[] = [];
  const level = L.river.level;
  const pts = L.river.pts;

  // ---------------------------------------------------------------- mist banks
  const mistN = quality === "high" ? 46 : 24;
  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const mistU = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color("#e9efe8") },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mistMat = new THREE.ShaderMaterial({
    uniforms: mistU,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      #include <common>
      ${FOG_PARS_V}
      varying vec2 vUv;
      varying float vSeed;
      varying float vNear;
      void main() {
        vUv = uv;
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Fade cards right in front of the camera (the canoe rides through the mist): no white slab.
        vNear = smoothstep(3.0, 12.0, -c.z);
        vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071);
        // Camera-facing card: the quad is spread in view space around the instance center.
        vec4 mvPosition = c + vec4(position.xy * size, 0.0, 0.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vSeed;
      varying float vNear;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + 1.0), f.x), f.y);
      }
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        // Flat-bottomed soft bank: fades fast at the top and the sides.
        float shape = (1.0 - smoothstep(0.35, 1.0, length(q * vec2(1.0, 1.35)))) * smoothstep(-1.0, -0.55, q.y);
        float wisp = 0.55 + 0.45 * n2(vUv * vec2(4.0, 2.0) + vec2(uTime * 0.04 + vSeed * 9.0, vSeed * 3.0));
        float a = shape * wisp * uOpacity * vNear;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  const mist = new THREE.InstancedMesh(mistGeo, mistMat, mistN);
  mist.name = "selva-mist";
  mist.renderOrder = 5;
  // Instances drift: no frustum culling (one draw, a cached bounding sphere would pop them out).
  mist.frustumCulled = false;
  const banks = Array.from({ length: mistN }, () => ({
    u: R(),
    off: (R() - 0.5) * 1.4,
    y: 0.6 + R() * 1.6,
    w: 14 + R() * 18,
    h: 2.6 + R() * 2.4,
    speed: 0.15 + R() * 0.2,
  }));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const qI = new THREE.Quaternion();
  const placeMist = () => {
    banks.forEach((b, k) => {
      const f = b.u * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const a = pts[i] as [number, number];
      const c = pts[i + 1] as [number, number];
      const fr = f - i;
      const dx = c[0] - a[0];
      const dz = c[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const w = (L.river.halfWidth[i] as number) * b.off;
      p.set(a[0] + dx * fr - (dz / l) * w, level + b.y, a[1] + dz * fr + (dx / l) * w);
      m.compose(p, qI, sc.set(b.w, b.h, 1));
      mist.setMatrixAt(k, m);
    });
    mist.instanceMatrix.needsUpdate = true;
  };
  placeMist();
  noOutline(mist);
  objects.push(mist);

  // ---------------------------------------------------------------- light shafts
  const shaftN = quality === "high" ? 34 : 18;
  const shaftGeo = (() => {
    // Two crossed trapezoids, 1 u tall (scaled per instance), narrow at the top, wide at the ground.
    const pos: number[] = [];
    const uv: number[] = [];
    for (const a of [0, Math.PI / 2]) {
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const top = 0.18;
      const bot = 0.5;
      pos.push(-cx * bot, 0, -cz * bot, cx * bot, 0, cz * bot, -cx * top, 1, -cz * top, cx * top, 1, cz * top);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
    return g;
  })();
  const shaftU = {
    uStrength: { value: 0 },
    uColor: { value: new THREE.Color("#fff0c4") },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftU,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
    vertexShader: /* glsl */ `
      #include <common>
      ${FOG_PARS_V}
      varying vec2 vUv;
      varying float vNear;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // Shafts stand by the road: fade them out as the camera walks through one.
        vNear = smoothstep(2.0, 9.0, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uStrength;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vNear;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float a = smoothstep(0.0, 0.7, across) * smoothstep(0.0, 0.55, vUv.y) * (0.55 + 0.45 * vUv.y) * uStrength * vNear;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          a *= 1.0 - fogF;
        #endif
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, shaftN);
  shafts.name = "selva-shafts";
  shafts.renderOrder = 6;
  // Morning sun from the east-north-east: shafts lean away from it.
  const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, -0.38));
  const tq = new THREE.Quaternion();
  let placed = 0;
  for (let tries = 0; placed < shaftN && tries < shaftN * 30; tries++) {
    // Over the road edges, the plaza rims and the river banks: where gaps in the canopy are believable.
    const t = R();
    const pr = L.trail.pointAt(t);
    const tg = L.trail.tangentAt(t);
    const side = R() < 0.5 ? -1 : 1;
    const off = 2 + R() * 9;
    const x = pr.x - tg.z * side * off;
    const z = pr.z + tg.x * side * off;
    if (L.isWater(x, z)) continue;
    const h = 13 + R() * 8;
    tq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, R() * 0.6).premultiply(lean);
    m.compose(p.set(x, L.groundAt(x, z) - 0.2, z), tq, sc.set(2.2 + R() * 2.2, h, 2.2 + R() * 2.2));
    shafts.setMatrixAt(placed++, m);
  }
  shafts.count = placed;
  shafts.instanceMatrix.needsUpdate = true;
  shafts.computeBoundingSphere();
  noOutline(shafts);
  objects.push(shafts);

  let night = 0;
  const fogC = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  return {
    objects,
    update(dt, time, sky, fog, motion) {
      const amt = mistAmount(sky);
      mistU.uOpacity.value = amt * 0.45;
      mist.visible = amt > 0.01;
      if (fog) mistU.uColor.value.copy(fogC.copy(fog).lerp(white, 0.45 - night * 0.3));
      mistU.uTime.value = motion ? time : 0;
      if (motion && mist.visible) {
        for (const b of banks) b.u = (b.u + (b.speed * dt) / 1000) % 1;
        placeMist();
      }
      const s = shaftAmount(sky) * (1 - night);
      shaftU.uStrength.value = s * 0.16;
      shafts.visible = s > 0.01;
    },
    setNight(n) {
      night = n;
    },
    dispose() {
      mistGeo.dispose();
      mistMat.dispose();
      shaftGeo.dispose();
      shaftMat.dispose();
    },
  };
}
