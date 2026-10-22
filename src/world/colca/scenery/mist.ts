/**
 * Mist layers inside the canyon: three soft, translucent ribbons that follow the canyon (../plan.ts rimZ) at
 * different depths, so the drop reads in painted layers from the rim: every veil the eye looks through on the
 * way down adds a pale lilac-blue wash (the aerial haze's hue, ../../style.ts STYLES.colca), so the terraces
 * stay crisp, the lower walls soften and the river is half lost. The
 * alpha is a canvas of soft blobs repeating along the canyon; it drifts along the canyon with the shared wind
 * (../../wind.ts liveWind: up-valley, quicker while a gust front passes; still with prefers-reduced-motion). Thicker in the early morning, thin by afternoon, faint and blue at night.
 * No outline (../../toon.ts noOutline), no depth write; three draw calls.
 */
import * as THREE from "three";
import { noOutline } from "../../toon";
import { liveWind } from "../../wind";
import { smooth } from "../layout";
import { rimZ } from "../plan";

const X0 = -1150;
const X1 = 1150;

function blobTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h * (0.25 + r() * 0.5);
    const rad = 18 + r() * 46;
    // Draw wrapped copies so the texture tiles along the canyon.
    for (const ox of [-w, 0, w]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, rad);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + ox, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fade to nothing toward both canyon walls (texture v edges).
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.22, "rgba(0,0,0,0)");
  fade.addColorStop(0.78, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A ribbon across s0..s1 at height y following the canyon; u runs along x (repeats every `rep` u). */
function ribbon(y: number, s0: number, s1: number, rep: number): THREE.BufferGeometry {
  const cols = 160;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let c = 0; c <= cols; c++) {
    const x = X0 + ((X1 - X0) * c) / cols;
    const rz = rimZ(x);
    pos.push(x, y, rz + s0, x, y, rz + s1);
    uv.push(x / rep, 0, x / rep, 1);
    if (c < cols) {
      const a = c * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildMist(reducedMotion: boolean) {
  const tex = blobTexture();
  const layers = [
    { y: -70, s0: 76, s1: 226, rep: 640, speed: 1.2, base: 0.15 },
    { y: -104, s0: 62, s1: 240, rep: 520, speed: 1.6, base: 0.24 },
    { y: -146, s0: 88, s1: 214, rep: 360, speed: 2.4, base: 0.36 },
  ].map((L) => {
    const map = tex.clone();
    map.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map,
      color: "#f4efe6",
      transparent: true,
      opacity: L.base,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(ribbon(L.y, L.s0, L.s1, L.rep), mat);
    mesh.name = "colca-mist";
    mesh.renderOrder = 2;
    noOutline(mesh);
    return { mesh, mat, map, ...L };
  });
  const group = new THREE.Group();
  group.name = "colca-mist";
  for (const l of layers) group.add(l.mesh);
  const night = new THREE.Color("#9fb0c8");
  // Lower veils lean further toward the haze's lilac blue (they are seen through more air).
  const dayTop = new THREE.Color("#f2eee8");
  const dayLow = new THREE.Color("#dfe2f4");
  return {
    group,
    /** dt: seconds; dayTime: 0..1 (0.25 sunrise); n: 0 day … 1 night; fx: x of the camera (wind sampled there). */
    update(dt: number, dayTime: number, n: number, fx = 0) {
      // The wind's along-canyon component where the traveler looks (the canyon runs along x); a calm floor of
      // 0.35 so the mist never freezes when the wind turns across the canyon.
      const w = liveWind.sample(fx, rimZ(fx) + 120);
      const along = Math.sign(w.x || 1) * Math.max(0.35, Math.abs(w.x));
      // Morning mist (≈ 6–10 am) burning off by noon.
      const morning = smooth(0.2, 0.3, dayTime) * (1 - smooth(0.36, 0.5, dayTime));
      const k = 0.55 + 0.45 * morning;
      layers.forEach((l, i) => {
        // u runs along +x (x / rep), so moving the texture downwind means a decreasing offset.
        if (!reducedMotion) l.map.offset.x = (l.map.offset.x - (along * l.speed * dt) / l.rep) % 1;
        l.mat.opacity = l.base * k * (1 - n * 0.45);
        l.mat.color
          .copy(dayTop)
          .lerp(dayLow, i / (layers.length - 1))
          .lerp(night, n);
      });
    },
    dispose() {
      for (const l of layers) {
        l.mesh.geometry.dispose();
        l.mat.dispose();
        l.map.dispose();
      }
      tex.dispose();
    },
  };
}
