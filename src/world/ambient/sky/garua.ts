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
  /** amount 0..1; color = current fog color (drops are a lighter version of it); heavy 0..1 turns the
   *  garúa into rain ("lluvia"): more, longer, faster streaks. */
  update(dt: number, center: THREE.Vector3, amount: number, color: THREE.Color, heavy?: number): void;
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
  let base = count;
  let shown = -1;
  const draw = (n: number) => {
    const c = Math.max(0, Math.min(max, Math.round(n)));
    if (c === shown) return;
    shown = c;
    geo.setDrawRange(0, c * 2);
  };
  const setCount = (n: number) => {
    base = n;
    draw(n);
  };
  setCount(count);
  let t = 0;
  return {
    object: lines,
    setCount,
    update(dt, center, amount, color, heavy = 0) {
      lines.visible = amount > 0.02;
      if (!lines.visible) return;
      t += dt;
      draw(base * (1 + 0.6 * heavy));
      vel.y = -FALL * (1 + 0.9 * heavy);
      U.uLen!.value = 0.55 + 0.75 * heavy;
      // A slow gusting wind; offsets stay wrapped so float precision never degrades.
      vel.x = 0.9 + Math.sin(t * 0.13) * 0.6;
      vel.z = 0.4 + Math.cos(t * 0.09) * 0.5;
      off.x = (off.x + vel.x * dt) % BOX.x;
      off.y = (((off.y + vel.y * dt) % BOX.y) + BOX.y) % BOX.y;
      off.z = (off.z + vel.z * dt) % BOX.z;
      (U.uCenter!.value as THREE.Vector3).copy(center);
      (U.uColor!.value as THREE.Color).copy(color).lerp(WHITE, 0.55);
      U.uAlpha!.value = amount * (0.55 + 0.2 * heavy);
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
  // One material per bank: each fades on its own as the camera nears it.
  const mats: THREE.SpriteMaterial[] = [];
  const sprites: THREE.Sprite[] = [];
  const phase: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog: true });
    mats.push(m);
    const s = new THREE.Sprite(m);
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
      const r = 48 + ((i * 37) % 60);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      // A flat billboard cutting into a slope draws a hard light edge on the ground: float each bank
      // just above the highest ground under its whole footprint instead.
      const s = sprites[i]!;
      const half = s.scale.x / 2;
      let top = groundAt(x, z);
      for (let k = 0; k < 8; k++) {
        const b = (k / 8) * Math.PI * 2;
        top = Math.max(top, groundAt(x + Math.cos(b) * half, z + Math.sin(b) * half));
      }
      s.position.set(x, top + s.scale.y * 0.45, z);
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
      for (let i = 0; i < n; i++) {
        const s = sprites[i]!;
        const m = mats[i]!;
        // Fade out as the traveler walks into a bank (no flat white sheet across the screen).
        const d = Math.hypot(s.position.x + group.position.x - center.x, s.position.z + group.position.z - center.z);
        const half = s.scale.x / 2;
        const near = Math.min(1, Math.max(0, (d - half * 0.8) / (half * 0.8)));
        m.opacity = amount * 0.6 * near;
        m.color.copy(color).lerp(WHITE, 0.35);
      }
      // Very slow drift.
      group.position.x = Math.sin(t * 0.03) * 3;
      group.position.z = Math.cos(t * 0.027) * 3;
    },
    dispose() {
      map.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
