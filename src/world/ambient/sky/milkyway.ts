/**
 * Mayu, the sky river: a procedural Milky Way band (canvas texture on a strip of the sky sphere) with the
 * Andean dark constellations cut out of its glow: Mach'acuay (serpent), Hanp'atu (toad), Yacana (llama,
 * eyes α/β Centauri) and the Southern Cross between them. Owned by sky.ts (follows the camera, fades with night).
 */
import * as THREE from "three";
import { rng } from "../../tex";
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

function bandTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const sx = W / (U1 - U0);
  const sy = H / (2 * VH);
  // Canvas y grows downward; band v grows upward (uv.y = 1 at +VH, and textures flip Y by default).
  const X = (u: number) => (u - U0) * sx;
  const Y = (v: number) => (VH - v) * sy;
  const R = rng(29);
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;
  // Brightness along the river: rich through Carina–Crux–Centaurus, brightest toward Sagittarius (~u 135).
  const lum = (u: number) =>
    0.35 +
    0.25 * Math.exp(-(((u - 70) / 40) ** 2)) +
    0.45 * Math.exp(-(((u - 135) / 22) ** 2)) +
    0.08 * Math.sin(u * 0.21 + 1.3);
  const width = (u: number) => 5 + 4 * Math.exp(-(((u - 135) / 25) ** 2));

  // Soft glow clouds.
  for (let i = 0; i < 900; i++) {
    const u = U0 + R() * (U1 - U0);
    const v = gauss() * width(u);
    const r = (1.5 + R() * 4) * sx;
    const a = lum(u) * (0.05 + R() * 0.05);
    const grd = g.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), r);
    grd.addColorStop(0, `rgba(214,222,255,${a.toFixed(3)})`);
    grd.addColorStop(1, "rgba(214,222,255,0)");
    g.fillStyle = grd;
    g.fillRect(X(u) - r, Y(v) - r, r * 2, r * 2);
  }
  // Star dust.
  for (let i = 0; i < 2600; i++) {
    const u = U0 + R() * (U1 - U0);
    const v = gauss() * width(u) * 1.2;
    const a = Math.min(1, lum(u) * (0.3 + R() * 0.7));
    g.fillStyle = `rgba(255,248,230,${a.toFixed(3)})`;
    const s = R() < 0.08 ? 2 : 1;
    g.fillRect(X(u), Y(v), s, s);
  }

  // Dark clouds: cut the glow out (additive blending → transparent where cut).
  g.globalCompositeOperation = "destination-out";
  if ("filter" in g) g.filter = "blur(3px)";
  // The Great Rift splitting the bright part of the river.
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.moveTo(X(98), Y(-0.6));
  for (let u = 98; u <= 175; u += 4) g.lineTo(X(u), Y(0.6 + Math.sin(u * 0.15) * 1.4 + 1.2));
  for (let u = 175; u >= 98; u -= 4) g.lineTo(X(u), Y(-0.8 + Math.sin(u * 0.15) * 1.4 - 1.2));
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.93)";
  for (const k of CONSTELLATIONS) {
    g.save();
    // Box center sits at (u, v); local y down = canvas y down.
    g.setTransform(sx, 0, 0, sy, X(k.u - k.w / 2), Y(k.v + k.h / 2));
    g.fill(new Path2D(k.path));
    g.restore();
  }
  if ("filter" in g) g.filter = "none";

  // Bright stars: the Southern Cross and the llama's eyes (α, β Centauri).
  g.globalCompositeOperation = "source-over";
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

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface MilkyWay {
  object: THREE.Object3D;
  /** Per frame: follow the camera, turn with the sky (time 0 = midnight) and fade. No allocations. */
  update(camera: THREE.Vector3, time: number, opacity: number): void;
  dispose(): void;
}

export function createMilkyWay(): MilkyWay {
  const geo = bandGeometry();
  const map = bandTexture();
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0,
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
      mat.opacity = opacity;
      mesh.position.copy(camera);
      // The sky turns once per day around the south celestial pole.
      mesh.quaternion.setFromAxisAngle(axis, -time * Math.PI * 2);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      map.dispose();
    },
  };
}
