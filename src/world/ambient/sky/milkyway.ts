/**
 * Mayu, the sky river: a procedural Milky Way band (canvas texture on a strip of the sky sphere) with the
 * Andean dark constellations cut out of its glow: Mach'acuay (serpent), Hanp'atu (toad), Yacana (llama,
 * eyes α/β Centauri) and the Southern Cross between them. Owned by sky.ts (follows the camera, fades with night).
 */
import * as THREE from "three";
import { noOutline } from "../../toon";
import { CONSTELLATIONS, CRUX } from "./constellations";

/** Band coverage along the Milky Way (degrees): 0 = south horizon at midnight, 90 = zenith, 180 = north. */
const U0 = -10;
const U1 = 190;
/** Half-width across the band (degrees). */
const VH = 20;
const RADIUS = 950;
/** Cusco latitude: the south celestial pole stands ~13.5° over the southern horizon. */
const LAT = (13.5 * Math.PI) / 180;

/** Band-local unit direction for (u, v) in degrees. Local +z = south horizon, +y = up, +x = east. */
export function bandDir(uDeg: number, vDeg: number, out: { x: number; y: number; z: number }) {
  const u = (uDeg * Math.PI) / 180;
  const v = (vDeg * Math.PI) / 180;
  out.x = Math.sin(v);
  out.y = Math.cos(v) * Math.sin(u);
  out.z = Math.cos(v) * Math.cos(u);
  return out;
}

function bandGeometry(): THREE.BufferGeometry {
  const su = 100;
  const sv = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const d = { x: 0, y: 0, z: 0 };
  for (let j = 0; j <= sv; j++) {
    for (let i = 0; i <= su; i++) {
      const u = U0 + ((U1 - U0) * i) / su;
      const v = -VH + (2 * VH * j) / sv;
      bandDir(u, v, d);
      pos.push(d.x * RADIUS, d.y * RADIUS, d.z * RADIUS);
      uv.push(i / su, j / sv);
    }
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const a = j * (su + 1) + i;
      const b = a + su + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Two canvases: star dust + bright stars (RGB, dark clouds already cut out), and a dark-cloud mask
 * (white = open sky, black = Mayu's shadows) that the shader multiplies into its own glow. The soft glow
 * itself is computed in the shader: canvas gradients are dithered by the browser and the band stretches
 * each texel over several pixels, which showed up as a halftone grid.
 */
function bandTextures(): { dust: THREE.CanvasTexture; mask: THREE.CanvasTexture } {
  const W = 2048;
  const H = 400;
  const sx = W / (U1 - U0);
  const sy = H / (2 * VH);
  // Canvas y grows downward; band v grows upward (uv.y = 1 at +VH, and textures flip Y by default).
  const X = (u: number) => (u - U0) * sx;
  const Y = (v: number) => (VH - v) * sy;

  const darkClouds = (g: CanvasRenderingContext2D, rift: string, body: string) => {
    if ("filter" in g) g.filter = "blur(3px)";
    // The Great Rift splitting the bright part of the river.
    g.fillStyle = rift;
    g.beginPath();
    g.moveTo(X(98), Y(-0.6));
    for (let u = 98; u <= 175; u += 4) g.lineTo(X(u), Y(0.6 + Math.sin(u * 0.15) * 1.4 + 1.2));
    for (let u = 175; u >= 98; u -= 4) g.lineTo(X(u), Y(-0.8 + Math.sin(u * 0.15) * 1.4 - 1.2));
    g.closePath();
    g.fill();
    g.fillStyle = body;
    for (const k of CONSTELLATIONS) {
      g.save();
      // Box center sits at (u, v); local y down = canvas y down.
      g.setTransform(sx, 0, 0, sy, X(k.u - k.w / 2), Y(k.v + k.h / 2));
      g.fill(new Path2D(k.path));
      g.restore();
    }
    if ("filter" in g) g.filter = "none";
  };

  // Bright stars only: the Southern Cross and the llama's eyes (α, β Centauri). The star dust is
  // procedural in the shader (round and crisp at any resolution; canvas pixels magnified into squares).
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const star = (x: number, y: number, r: number, rgb: string) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${rgb},1)`);
    grd.addColorStop(0.25, `rgba(${rgb},0.85)`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const [u, v, m] of CRUX) star(X(u), Y(v), 6 + 5 * m, "235,240,255");
  const yacana = CONSTELLATIONS.find((k) => k.id === "yacana");
  if (yacana?.eyes)
    for (const [ex, ey] of yacana.eyes) {
      const u = yacana.u - yacana.w / 2 + ex;
      const v = yacana.v + yacana.h / 2 - ey;
      star(X(u), Y(v), 13, "255,236,196");
    }

  // Dark-cloud mask (smaller: it only carries soft shapes).
  const mc = document.createElement("canvas");
  mc.width = W / 2;
  mc.height = H / 2;
  const mg = mc.getContext("2d")!;
  mg.fillStyle = "#fff";
  mg.fillRect(0, 0, mc.width, mc.height);
  mg.scale(0.5, 0.5);
  darkClouds(mg, "rgba(0,0,0,0.55)", "rgba(0,0,0,0.93)");

  const dust = new THREE.CanvasTexture(c);
  dust.colorSpace = THREE.SRGBColorSpace;
  dust.anisotropy = 4;
  const mask = new THREE.CanvasTexture(mc);
  return { dust, mask };
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vUp;
void main() {
  vUv = uv;
  // The band is centred on the camera, so the rotated position is the view direction.
  vUp = normalize(mat3(modelMatrix) * position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tDust;
uniform sampler2D tMask;
uniform float uOpacity;
varying vec2 vUv;
varying float vUp;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
/** One star per cell at a random spot; round, about 1–2 px whatever the band's texel size. */
float starLayer(vec2 p, float density, float seed) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash(cell + seed);
  if (h > density) return 0.0;
  vec2 c = vec2(hash(cell + seed + 1.7), hash(cell + seed + 3.1)) * 0.7 + 0.15;
  float px = max(length(fwidth(p)), 1e-4);
  float r = px * mix(0.7, 1.5, hash(cell + seed + 7.3));
  float d = length(f - c);
  return (1.0 - smoothstep(r * 0.4, r, d)) * mix(0.35, 1.0, hash(cell + seed + 9.1));
}
void main() {
  float u = mix(${U0.toFixed(1)}, ${U1.toFixed(1)}, vUv.x);
  float v = mix(${(-VH).toFixed(1)}, ${VH.toFixed(1)}, vUv.y);
  float lum = 0.35 + 0.25 * exp(-pow((u - 70.0) / 40.0, 2.0)) + 0.45 * exp(-pow((u - 135.0) / 22.0, 2.0))
    + 0.08 * sin(u * 0.21 + 1.3);
  float w = 5.0 + 4.0 * exp(-pow((u - 135.0) / 25.0, 2.0));
  vec2 q = vec2(u * 0.18, v * 0.35);
  float clumps = 0.55 + 0.3 * noise(q) + 0.15 * noise(q * 2.7 + 5.0);
  float glow = lum * exp(-pow(v / (w * 1.15), 2.0)) * clumps * 0.42;
  float mask = texture2D(tMask, vUv).r;
  // Star dust: denser where the river is bright, thinning off its centre line.
  float band = exp(-pow(v / (w * 1.5), 2.0));
  float dens = clamp(band * (0.2 + 0.5 * lum), 0.0, 0.7);
  vec2 sp = vec2(u, v);
  float dust = starLayer(sp * 2.2, dens, 0.0) + 0.6 * starLayer(sp * 4.4, dens, 17.0);
  vec3 col = vec3(0.84, 0.87, 1.0) * glow * mask + vec3(1.0, 0.97, 0.9) * dust * mask
    + texture2D(tDust, vUv).rgb;
  // Fade into the horizon haze; nothing below it.
  float horizon = smoothstep(0.02, 0.22, vUp);
  gl_FragColor = vec4(col * uOpacity * horizon, 1.0);
}`;

export interface MilkyWay {
  object: THREE.Object3D;
  /** Per frame: follow the camera, turn with the sky (time 0 = midnight) and fade. No allocations. */
  update(camera: THREE.Vector3, time: number, opacity: number): void;
  dispose(): void;
}

export function createMilkyWay(): MilkyWay {
  const geo = bandGeometry();
  const { dust, mask } = bandTextures();
  // Additive: black adds nothing, so alpha stays 1 and opacity scales the colour.
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDust: { value: dust }, tMask: { value: mask }, uOpacity: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "milky-way";
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  noOutline(mesh);
  const axis = new THREE.Vector3(0, Math.sin(LAT), Math.cos(LAT));
  return {
    object: mesh,
    update(camera, time, opacity) {
      mesh.visible = opacity > 0.01;
      if (!mesh.visible) return;
      mat.uniforms.uOpacity!.value = opacity;
      mesh.position.copy(camera);
      // The sky turns once per day around the south celestial pole.
      mesh.quaternion.setFromAxisAngle(axis, -time * Math.PI * 2);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      dust.dispose();
      mask.dispose();
    },
  };
}
