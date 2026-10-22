/**
 * Visuals of the sunken city (../sumergida.ts). The lake's water is one opaque surface (../../scenery/water.ts),
 * so nothing below it can show through: the ruins are faked as light on the surface instead.
 *  - `ruins`: one flat plane a hair above the water, an additive shader over a canvas drawing of the city seen
 *    from above (a stepped temple, enclosure walls with gaps, rooms, a causeway and the golden disc of Inti at
 *    its heart), wobbled by slow ripples and shimmering like caustics, inside a soft golden glow. Black adds
 *    nothing, so the water's own ripples keep reading through it.
 *  - `halo`: a wide, flat additive billboard over the spot, what reads as "a light in the lake" from the road
 *    where the plane is seen almost edge-on.
 * Both off the ink pass (the caller calls noOutline), no depth writes, no fog. Two draw calls.
 *
 * Cel pintado andino (../../../style.ts): the decal's glow is painted in flat steps (an anime glow: a hard core,
 * a ring, a faint halo) rather than a smooth falloff, and it fades into the lake's aerial haze with distance
 * like every fogged surface (the shared style uniforms; additive, so the haze dims it instead of tinting it).
 */
import * as THREE from "three";
import { styleUniforms } from "../../../style-gl";

/** Canvas size of the ruins drawing (square). 512 keeps the thin walls crisp across a 34 u decal. */
const RES = 512;

/** The ruins seen from above: warm gold lines on black (additive), faded toward the edge. */
function ruinsCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = RES;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#000";
  g.fillRect(0, 0, RES, RES);
  const m = RES / 2;
  g.lineCap = "square";
  g.lineJoin = "miter";
  g.strokeStyle = "#ffd98a";
  // Soft edges: stone seen through a few metres of water is never crisp.
  g.shadowColor = "#ffd98a";
  g.shadowBlur = 10;

  // Enclosure: an outer wall with gaps (fallen stretches) and a gate on the causeway's side.
  g.lineWidth = 7;
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(m + x0, m + y0);
    g.lineTo(m + x1, m + y1);
    g.stroke();
  };
  const W = 196;
  wall(-W, -W, -40, -W);
  wall(30, -W, W, -W);
  wall(W, -W, W, 60);
  wall(W, 110, W, W);
  wall(W, W, 24, W);
  wall(-24, W, -120, W);
  wall(-170, W, -W, W);
  wall(-W, W, -W, -W);

  // Stepped temple: three tiers, each a square (a pyramid seen from the top), stairs down the south face.
  for (const [r, w] of [
    [130, 8],
    [96, 7],
    [62, 6],
  ] as const) {
    g.lineWidth = w;
    g.strokeRect(m - r, m - r, r * 2, r * 2);
  }
  g.lineWidth = 3;
  for (let k = 0; k < 9; k++) {
    const y = m + 62 + k * 7.6;
    g.beginPath();
    g.moveTo(m - 16, y);
    g.lineTo(m + 16, y);
    g.stroke();
  }
  g.lineWidth = 5;
  wall(-18, 62, -18, 130);
  wall(18, 62, 18, 130);

  // Causeway from the temple's stairs through the gate and out (toward the old shore).
  g.lineWidth = 5;
  wall(-14, W, -14, 250);
  wall(14, W, 14, 250);

  // Rooms in the corners between the temple and the wall: small courts, one half fallen.
  g.lineWidth = 5;
  g.strokeRect(m - 182, m - 182, 40, 32);
  g.strokeRect(m + 140, m - 182, 40, 46);
  g.strokeRect(m + 142, m + 140, 38, 40);
  g.beginPath();
  g.moveTo(m - 182, m + 140);
  g.lineTo(m - 182, m + 178);
  g.lineTo(m - 150, m + 178);
  g.stroke();

  // Inti: a bright disc with a face ring and rays, the heart of the glow.
  const disc = g.createRadialGradient(m, m, 0, m, m, 34);
  disc.addColorStop(0, "#fff3c4");
  disc.addColorStop(0.7, "#ffcf5a");
  disc.addColorStop(1, "#d99a22");
  g.fillStyle = disc;
  g.beginPath();
  g.arc(m, m, 32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#ffe7a3";
  g.lineWidth = 4;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r1 = k % 2 ? 44 : 50;
    g.beginPath();
    g.moveTo(m + Math.cos(a) * 37, m + Math.sin(a) * 37);
    g.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1);
    g.stroke();
  }

  // Edge falloff: the drawing dissolves into the dark water instead of ending on a square. (No shadow on these
  // full-canvas fills, or the whole square would glow.)
  g.shadowBlur = 0;
  g.shadowColor = "transparent";
  g.globalCompositeOperation = "destination-in";
  const fade = g.createRadialGradient(m, m, RES * 0.3, m, m, RES * 0.5);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, RES, RES);
  g.globalCompositeOperation = "destination-over";
  g.fillStyle = "#000";
  g.fillRect(0, 0, RES, RES);
  return c;
}

function haloCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,226,140,0.95)");
  r.addColorStop(0.35, "rgba(255,214,110,0.3)");
  r.addColorStop(1, "rgba(255,210,100,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return c;
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
varying float vY;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
#include <common>
uniform sampler2D uMap;
uniform float uTime, uGlow, uRuins;
uniform vec3 uColor;
varying vec2 vUv;
varying float vDepth;
varying float vY;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  // Seen through moving water: a slow wobble of the drawing and a caustic shimmer on its lines.
  vec2 w = vec2(sin(vUv.y * 26.0 + uTime * 1.3), cos(vUv.x * 22.0 + uTime * 1.1)) * 0.0045;
  float ink = texture2D(uMap, vUv + w).g;
  float caustic = 0.6 + 0.4 * sin((vUv.x + vUv.y) * 38.0 + uTime * 1.6) * sin((vUv.x - vUv.y) * 31.0 - uTime * 1.2);
  // The glow in flat painted steps (core, ring, halo), each edge a couple of pixels soft.
  float g = exp(-r * r * 4.5);
  float aa = fwidth(g) * 1.5 + 1e-3;
  float glow = (smoothstep(0.7 - aa, 0.7 + aa, g) * 0.45 + smoothstep(0.38 - aa, 0.38 + aa, g) * 0.35
    + smoothstep(0.12 - aa, 0.12 + aa, g) * 0.2 + g * 0.15) * uGlow;
  // Faint: the lake's own ripples and glints must still read over the walls.
  vec3 col = uColor * (glow * 0.5 + ink * uRuins * caustic * 0.5);
  // Aerial haze as on every fogged surface: how much of the colour it would take, dimming the added light.
  float haze = 1.0 + cpaHaze(vec3(0.0), vDepth, vY).g - cpaHaze(vec3(1.0), vDepth, vY).g;
  gl_FragColor = vec4(col * (1.0 - clamp(haze, 0.0, 1.0)), 1.0);
}`;

export interface SunkenCity {
  group: THREE.Group;
  ruins: THREE.Mesh;
  halo: THREE.Sprite;
  uniforms: { uTime: { value: number }; uGlow: { value: number }; uRuins: { value: number } };
  haloMat: THREE.SpriteMaterial;
  dispose(): void;
}

/** Builds the decal (`size` half width, world units) and the halo at (x, y, z); the caller adds the group. */
export function buildSunkenCity(x: number, y: number, z: number, size: number): SunkenCity {
  const map = new THREE.CanvasTexture(ruinsCanvas());
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const uniforms = {
    ...styleUniforms(),
    uMap: { value: map },
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uRuins: { value: 0 },
    // Raw output values (this shader skips the colour-space conversion): a warm gold with enough green that its
    // faint fringe over the deep-blue water reads gold, not purple.
    uColor: { value: new THREE.Color().setRGB(1, 0.84, 0.46, THREE.LinearSRGBColorSpace) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    // Pulled toward the camera so it never fights the water plane it lies on.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const geo = new THREE.PlaneGeometry(size * 2, size * 2);
  geo.rotateX(-Math.PI / 2);
  const ruins = new THREE.Mesh(geo, mat);
  ruins.name = "sunken-city-ruins";
  ruins.position.set(x, y, z);
  // Rotated a little off the world grid, like ruins that were never laid out for the camera.
  ruins.rotation.y = 0.35;
  ruins.renderOrder = 2;
  ruins.frustumCulled = true;

  const haloTex = new THREE.CanvasTexture(haloCanvas());
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    opacity: 0,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.name = "sunken-city-halo";
  // Wide and low: a sheet of light on the water seen from afar (its lower half is hidden by the water).
  halo.scale.set(size * 1.7, size * 0.32, 1);
  halo.position.set(x, y + 0.2, z);
  halo.renderOrder = 2;

  const group = new THREE.Group();
  group.name = "sunken-city";
  group.add(ruins, halo);
  return {
    group,
    ruins,
    halo,
    uniforms,
    haloMat,
    dispose() {
      geo.dispose();
      mat.dispose();
      map.dispose();
      haloMat.dispose();
      haloTex.dispose();
    },
  };
}
