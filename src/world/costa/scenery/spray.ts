/**
 * Spray where the swell breaks on cliffs and rocks: bursts of white droplets thrown up the rock face and
 * falling back, one point cloud for the whole coast (one draw call, no outline). Every particle's flight is
 * computed in the vertex shader from its emitter, launch velocity and phase (no per-frame CPU work): each
 * emitter bursts once per its own period, so the cliffs flash white out of step with each other.
 * Emitters: along the cliff stretches of the shore (layout.cliff high) and round the islets.
 * The sea breeze carries every droplet inland as it flies: the shared wind (../../wind-glsl.ts, read through the
 * style uniforms every built-in material has) pushes it downwind, harder inside a gust front, so the spray
 * streams off the rocks the same way the reeds and banners lean.
 * Hidden with prefers-reduced-motion.
 */
import * as THREE from "three";
import { canvasTex } from "../../props";
import { WIND_SLOT } from "../../wind";
import { rng } from "../kit";
import type { CostaLayout } from "../layout";

const PER = 22;
/** The shared wind's first slot (direction xy, strength z, clock w) in the style uniform array. */
const WIND_U = `cpaU[${WIND_SLOT.W0}]`;

export interface Spray {
  points: THREE.Points;
  update(time: number): void;
  dispose(): void;
}

export function buildSpray(L: CostaLayout, reducedMotion: boolean): Spray {
  const R = rng(0x5a7a);
  const emitters: Array<{ x: number; y: number; z: number; nx: number; nz: number; period: number; ph: number }> = [];
  const b = L.bounds;
  for (let z = b.z0 + 10; z < b.z1 - 10; z += 9) {
    if (L.cliff(z) < 0.6) continue;
    const sx = L.shoreX(z);
    // Seaward normal of the coastline (−x mostly, tilted by its slope).
    const dsx = L.shoreX(z + 1) - L.shoreX(z - 1);
    const l = Math.hypot(2, dsx) || 1;
    emitters.push({
      x: sx - 0.6,
      y: 0.1,
      z: z + (R() - 0.5) * 4,
      nx: -2 / l,
      nz: dsx / l,
      period: 5 + R() * 5,
      ph: R() * 10,
    });
  }
  for (const it of L.islets) {
    for (let k = 0; k < 4; k++) {
      const a = Math.PI * (0.5 + R()) + (k * Math.PI) / 2;
      emitters.push({
        x: it.x + Math.cos(a) * it.r * 0.95,
        y: 0.1,
        z: it.z + Math.sin(a) * it.r * 0.95,
        nx: Math.cos(a),
        nz: Math.sin(a),
        period: 4 + R() * 5,
        ph: R() * 10,
      });
    }
  }
  const n = emitters.length * PER;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const tim = new Float32Array(n * 2);
  let k = 0;
  for (const e of emitters) {
    for (let i = 0; i < PER; i++) {
      pos[k * 3] = e.x + (R() - 0.5) * 2.2;
      pos[k * 3 + 1] = e.y;
      pos[k * 3 + 2] = e.z + (R() - 0.5) * 2.2;
      // Thrown up and back out to sea a little.
      const up = 4 + R() * 5;
      const out = 0.5 + R() * 1.6;
      vel[k * 3] = e.nx * out + (R() - 0.5) * 0.8;
      vel[k * 3 + 1] = up;
      vel[k * 3 + 2] = e.nz * out + (R() - 0.5) * 0.8;
      tim[k * 2] = e.period;
      tim[k * 2 + 1] = e.ph + R() * 0.25;
      k++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
  geo.setAttribute("aTime", new THREE.BufferAttribute(tim, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);
  const dot = canvasTex(32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const uTime = { value: 0 };
  const mat = new THREE.PointsMaterial({
    color: "#f7f6f0",
    size: 0.9,
    map: dot,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 aVel;\nattribute vec2 aTime;\nuniform float uTime;\nvarying float vLife;",
      )
      .replace(
        "#include <begin_vertex>",
        `float age = mod(uTime + aTime.y, aTime.x);
        float life = 1.6;
        vec3 transformed = position + aVel * age + vec3(0.0, -9.0, 0.0) * age * age * 0.5;
        // Blown downwind (speed × (1 + gust) of the shared wind at the emitter), more the longer it flies.
        float gustK = 1.0 + cpaGust(position.xz);
        transformed.xz += cpaWindDir() * ${WIND_U}.z * gustK * (age * 0.8 + age * age * 0.7);
        transformed.y = max(transformed.y, -0.3);
        vLife = age < life ? 1.0 - age / life : 0.0;`,
      )
      .replace(
        "#include <logdepthbuf_vertex>",
        "gl_PointSize *= 0.6 + vLife;\nif (vLife <= 0.0) gl_PointSize = 0.0;\n#include <logdepthbuf_vertex>",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vLife;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= smoothstep(0.0, 0.35, vLife);",
      );
  };
  mat.customProgramCacheKey = () => "costa-spray";
  const points = new THREE.Points(geo, mat);
  points.name = "costa-spray";
  points.frustumCulled = false;
  points.visible = !reducedMotion;
  return {
    points,
    update(time) {
      uTime.value = time;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      dot.dispose();
    },
  };
}
