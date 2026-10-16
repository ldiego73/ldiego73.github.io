/**
 * Mist layers inside the canyon: two soft, translucent ribbons that follow the canyon (../plan.ts rimZ) at
 * different depths, so the drop reads in layers from the rim (nearer walls crisp, the river half lost). The
 * alpha is a canvas of soft blobs repeating along the canyon; it drifts slowly downstream (still with
 * prefers-reduced-motion). Thicker in the early morning, thin by afternoon, faint and blue at night.
 * No outline (../../toon.ts noOutline), no depth write; two draw calls.
 */
import * as THREE from "three";
import { noOutline } from "../../toon";
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
    { y: -96, s0: 60, s1: 240, rep: 520, speed: 1.6, base: 0.22 },
    { y: -140, s0: 85, s1: 215, rep: 360, speed: 2.4, base: 0.34 },
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
  const day = new THREE.Color("#f4efe6");
  return {
    group,
    /** time: seconds; dayTime: 0..1 (0.25 sunrise); n: 0 day … 1 night. */
    update(time: number, dayTime: number, n: number) {
      // Morning mist (≈ 6–10 am) burning off by noon.
      const morning = smooth(0.2, 0.3, dayTime) * (1 - smooth(0.36, 0.5, dayTime));
      const k = 0.55 + 0.45 * morning;
      for (const l of layers) {
        if (!reducedMotion) l.map.offset.x = (time * l.speed) / l.rep;
        l.mat.opacity = l.base * k * (1 - n * 0.45);
        l.mat.color.copy(day).lerp(night, n);
      }
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
