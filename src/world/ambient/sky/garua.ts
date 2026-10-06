/**
 * Garúa (fine Andean drizzle) and low mist banks for ambient/weather.ts.
 *  - Drizzle: one LineSegments of short pale streaks in a box that wraps around the camera entirely in the
 *    vertex shader (static buffers, zero CPU work per frame).
 *  - Mist banks: a handful of soft billboard sprites hugging the slopes around the traveler; re-placed only
 *    when the traveler has walked away from them.
 */
import * as THREE from "three";
import { noOutline } from "../../toon";

const BOX = new THREE.Vector3(28, 16, 28);
const FALL = 5.5;

const GaruaShader = {
  vertexShader: /* glsl */ `
    attribute float aEnd;
    uniform vec3 uCenter, uOffset, uBox, uVel;
    uniform float uLen, uAlpha;
    varying float vA;
    void main() {
      vec3 hb = uBox * 0.5;
      vec3 p = mod(position + uOffset - uCenter + hb, uBox) + uCenter - hb;
      p -= normalize(uVel) * uLen * aEnd;
      float r = length(p.xz - uCenter.xz) / hb.x;
      vA = uAlpha * (1.0 - smoothstep(0.55, 1.0, r)) * (1.0 - 0.65 * aEnd);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying float vA;
    void main() {
      gl_FragColor = vec4(uColor, vA);
      #include <colorspace_fragment>
    }`,
};

export interface Garua {
  object: THREE.Object3D;
  setCount(n: number): void;
  /** amount 0..1; color = current fog color (drops are a lighter version of it). */
  update(dt: number, center: THREE.Vector3, amount: number, color: THREE.Color): void;
  dispose(): void;
}

export function createGarua(max: number, count: number): Garua {
  const pos = new Float32Array(max * 6);
  const end = new Float32Array(max * 2);
  let seed = 7;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < max; i++) {
    const x = R() * BOX.x;
    const y = R() * BOX.y;
    const z = R() * BOX.z;
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uOffset: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uVel: { value: new THREE.Vector3(0.9, -FALL, 0.4) },
      uLen: { value: 0.55 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color() },
    },
    vertexShader: GaruaShader.vertexShader,
    fragmentShader: GaruaShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = "garua";
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  lines.visible = false;
  noOutline(lines);
  const U = mat.uniforms;
  const off = U.uOffset!.value as THREE.Vector3;
  const vel = U.uVel!.value as THREE.Vector3;
  const setCount = (n: number) => geo.setDrawRange(0, Math.max(0, Math.min(max, n)) * 2);
  setCount(count);
  let t = 0;
  return {
    object: lines,
    setCount,
    update(dt, center, amount, color) {
      lines.visible = amount > 0.02;
      if (!lines.visible) return;
      t += dt;
      // A slow gusting wind; offsets stay wrapped so float precision never degrades.
      vel.x = 0.9 + Math.sin(t * 0.13) * 0.6;
      vel.z = 0.4 + Math.cos(t * 0.09) * 0.5;
      off.x = (off.x + vel.x * dt) % BOX.x;
      off.y = (((off.y + vel.y * dt) % BOX.y) + BOX.y) % BOX.y;
      off.z = (off.z + vel.z * dt) % BOX.z;
      (U.uCenter!.value as THREE.Vector3).copy(center);
      (U.uColor!.value as THREE.Color).copy(color).lerp(WHITE, 0.55);
      U.uAlpha!.value = amount * 0.55;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
const WHITE = new THREE.Color(1, 1, 1);

/** Soft round puff, drawn once. */
function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (const [x, y, r] of [
    [64, 36, 30],
    [40, 40, 22],
    [88, 40, 24],
    [56, 28, 20],
  ] as const) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface MistBanks {
  object: THREE.Object3D;
  update(dt: number, center: THREE.Vector3, amount: number, color: THREE.Color): void;
  dispose(): void;
}

/** Low cloud banks hugging the slopes (valley fog), placed around the traveler. */
export function createMistBanks(n: number, groundAt: (x: number, z: number) => number): MistBanks {
  const group = new THREE.Group();
  group.name = "mist-banks";
  const map = puffTexture();
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: true });
  const sprites: THREE.Sprite[] = [];
  const phase: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(mat);
    s.scale.set(34 + (i % 3) * 10, 9 + (i % 2) * 4, 1);
    sprites.push(s);
    phase.push(i * 2.39996);
    group.add(s);
  }
  noOutline(group);
  group.visible = false;
  const anchor = new THREE.Vector3(1e9, 0, 0);
  let t = 0;
  const place = (center: THREE.Vector3) => {
    anchor.copy(center);
    for (let i = 0; i < n; i++) {
      const a = phase[i]!;
      const r = 26 + ((i * 37) % 45);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      // Sit in the low ground: valleys under the traveler fill first.
      sprites[i]!.position.set(x, Math.min(groundAt(x, z) + 2.5, center.y + 6), z);
    }
  };
  return {
    object: group,
    update(dt, center, amount, color) {
      group.visible = amount > 0.02;
      if (!group.visible) return;
      t += dt;
      const dx = center.x - anchor.x;
      const dz = center.z - anchor.z;
      if (dx * dx + dz * dz > 30 * 30) place(center);
      mat.opacity = amount * 0.6;
      mat.color.copy(color).lerp(WHITE, 0.35);
      // Very slow drift.
      group.position.x = Math.sin(t * 0.03) * 3;
      group.position.z = Math.cos(t * 0.027) * 3;
    },
    dispose() {
      map.dispose();
      mat.dispose();
    },
  };
}
