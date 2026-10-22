/**
 * Dust on the Nazca pampa, blown by the shared wind (../../wind.ts liveWind, the same field that waves the
 * ichu and the flags):
 *  - dust devils: on hot afternoons (./polvo/logic.ts DEVIL_HOURS) a whirl of reddish dust now and then spins
 *    up upwind of the traveler and wanders downwind across the gravel, its top leaning with the wind, and
 *    dies away (two at most, one on low quality);
 *  - drifting dust: while a gust front crosses the pampa, fine dust streams low over the ground round the
 *    traveler, and settles as the front passes.
 * Only while the traveler is on or near the pampa, only by day, never with prefers-reduced-motion (it is all
 * motion). One Points draw call, no outline, no depth write; hazed like everything else (styleUniforms + fog).
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { styleUniforms } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { liveWind } from "../../wind";
import { PAMPA } from "../plan";
import {
  type Devil,
  devilHours,
  devilMote,
  dustLevel,
  type Mote,
  onPampa,
  spawnDevil,
  stepDevil,
  wrap,
} from "./polvo/logic";

/** Particles per devil, low-dust motes and the half size of the low-dust box round the traveler. */
const PER_DEVIL = 70;
const LOW = 110;
const BOX = 32;
/** The pampa's dust colour (its gravel, lifted). */
const DUST = "#cfa684";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  if (env.reducedMotion) return { update() {}, dispose() {} };
  const maxDevils = env.quality === "high" ? 2 : 1;
  const N = maxDevils * PER_DEVIL + LOW;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
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
      uColor: { value: new THREE.Color(DUST) },
      uScale: { value: 300 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
      #include <fog_pars_vertex>
      void main() {
        vA = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.003 ? aSize * uScale / -mvPosition.z : 0.0;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA;
      #include <fog_pars_fragment>
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = "colca-polvo";
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  env.noOutline(points);
  env.scene.add(points);

  // Low motes: a fixed scatter in the box round the traveler (offsets), moved downwind by the gusts.
  let seed = 0x9017;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const low = Array.from({ length: LOW }, () => ({ x: (rand() * 2 - 1) * BOX, z: (rand() * 2 - 1) * BOX, h: rand() }));
  const devils: Devil[] = [];
  let cool = 4;
  let clock = 0;
  let dust = 0;
  const m: Mote = { x: 0, y: 0, z: 0, a: 0, s: 0 };

  const hide = (from: number, to: number) => {
    for (let i = from; i < to; i++) alpha[i] = 0;
  };

  const tick = (dtIn: number, avatar: { x: number; z: number }) => {
    const dt = Math.min(dtIn, 0.1);
    clock += dt;
    // On the pampa or looking down at it from the descent / climb.
    const near = avatar.z < PAMPA.z0 + 30;
    const day = env.sky.isNight() ? 0 : 1;
    if (!near || !day) {
      if (points.visible) {
        points.visible = false;
        devils.length = 0;
      }
      return;
    }
    points.visible = true;
    const w = liveWind.sample(avatar.x, avatar.z);

    // ---- devils
    cool -= dt;
    const hot = devilHours(env.sky.time());
    // A gust makes a new one likelier: the cooldown runs faster in a front.
    if (hot && devils.length < maxDevils && cool < w.gust * 4) {
      const d = spawnDevil(avatar.x, avatar.z, w.x, w.z, rand);
      if (onPampa(d.z)) devils.push(d);
      cool = 9 + rand() * 14;
    }
    for (let k = devils.length - 1; k >= 0; k--) {
      const d = devils[k] as Devil;
      const dw = liveWind.sample(d.x, d.z);
      if (!stepDevil(d, dt, dw.x, dw.z) || !onPampa(d.z)) devils.splice(k, 1);
    }
    for (let k = 0; k < maxDevils; k++) {
      const o = k * PER_DEVIL;
      const d = devils[k];
      if (!d) {
        hide(o, o + PER_DEVIL);
        continue;
      }
      const gy = env.heightAt(d.x, d.z);
      const dw = liveWind.sample(d.x, d.z);
      for (let i = 0; i < PER_DEVIL; i++) {
        devilMote(d, i, clock + d.seed, dw.x, dw.z, m);
        const j = o + i;
        pos[j * 3] = d.x + m.x;
        pos[j * 3 + 1] = gy + 0.15 + m.y;
        pos[j * 3 + 2] = d.z + m.z;
        alpha[j] = m.a;
        size[j] = m.s;
      }
    }

    // ---- low drifting dust (only shows in a gust front)
    dust += (dustLevel(w.gust, day) - dust) * Math.min(1, dt * 1.5);
    const cx = avatar.x;
    const cz = avatar.z;
    const o = maxDevils * PER_DEVIL;
    const carry = 9 * (0.4 + w.gust);
    for (let i = 0; i < LOW; i++) {
      const p = low[i] as { x: number; z: number; h: number };
      p.x += w.x * carry * dt;
      p.z += w.z * carry * dt;
      const x = wrap(cx + p.x, cx, BOX);
      const z = wrap(cz + p.z, cz, BOX);
      p.x = x - cx;
      p.z = z - cz;
      const j = o + i;
      const bob = Math.sin(clock * 1.7 + i) * 0.15;
      pos[j * 3] = x;
      pos[j * 3 + 1] = env.heightAt(x, z) + 0.15 + p.h * 1.3 + bob;
      pos[j * 3 + 2] = z;
      // Fade at the box edge, and off the pampa.
      const edge = 1 - Math.max(Math.abs(p.x), Math.abs(p.z)) / BOX;
      alpha[j] = dust * 0.35 * Math.min(1, edge * 4) * (onPampa(z) ? 1 : 0);
      size[j] = 0.7 + p.h * 1.2;
    }
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.aSize!.needsUpdate = true;
    geo.attributes.aAlpha!.needsUpdate = true;
  };

  // Dev hook (screenshots): run the dust for `sec` seconds at the last traveler position.
  let last = { x: 0, z: 0 };
  if (import.meta.env?.DEV)
    (window as Window & { __polvo?: unknown }).__polvo = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 20); k++) tick(0.05, last);
      },
      devils: () => devils.map((d) => ({ x: d.x, z: d.z, age: d.age })),
    };

  return {
    update(dtIn, avatar) {
      last = { x: avatar.x, z: avatar.z };
      tick(dtIn, avatar);
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __polvo?: unknown }).__polvo;
      points.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
};
