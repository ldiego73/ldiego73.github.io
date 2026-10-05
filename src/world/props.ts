import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Dye } from "../data/career";
import type { Collider, WorldEnv } from "./contract";

/** Andean diorama palette (direction contract). Content-local so core palette changes don't ripple. */
export const C = {
  ink: "#1f1a17",
  stone: "#b9b1a3",
  stoneDark: "#8f877b",
  stoneDeep: "#5d564c",
  grass: "#7fae6a",
  grassDark: "#5f8f55",
  straw: "#d8b46a",
  strawDark: "#b8924b",
  adobe: "#c98b5a",
  thatch: "#a8743f",
  wood: "#8a5a35",
  woodDark: "#5e3b22",
  river: "#5fb8c2",
  torch: "#ffb35c",
  flame: "#ff8a3d",
  cotton: "#efe6d6",
  paper: "#f3ead8",
  cone: "#e07a3a",
} as const;

export const DYE: Record<Dye | "cotton", string> = {
  red: "#c4383f",
  indigo: "#3446a6",
  ochre: "#dda63c",
  turq: "#2a9d8f",
  alpaca: "#a8825f",
  cotton: "#efe6d6",
};

export const FONT = {
  display: '"Archivo", "Arial Narrow", sans-serif',
  body: '"Hanken Grotesk", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

/** Seeded PRNG (mulberry32) so every station is asymmetric but stable between visits. */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/**
 * Collects static primitives and merges them into one mesh per color (few draw calls, outline-friendly).
 * Every geometry is normalized to non-indexed position/normal/uv before merging.
 */
export class Kit {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private shared = new Map<string, THREE.BufferGeometry>();
  constructor(private env: WorldEnv) {}

  private proto(key: string, make: () => THREE.BufferGeometry) {
    let g = this.shared.get(key);
    if (!g) {
      g = make();
      this.shared.set(key, g);
    }
    return g;
  }

  add(
    geo: THREE.BufferGeometry,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    flat = false,
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    if (!g.getAttribute("uv")) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    }
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    g.applyMatrix4(tmpM);
    if (flat) g.computeVertexNormals();
    const list = this.parts.get(color) ?? [];
    list.push(g);
    this.parts.set(color, list);
    return this;
  }

  /** Box with its base at y (so stacking reads naturally). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, rx = 0, rz = 0) {
    return this.add(
      this.proto("box", () => new THREE.BoxGeometry(1, 1, 1)),
      color,
      x,
      y + h / 2,
      z,
      rx,
      ry,
      rz,
      w,
      h,
      d,
    );
  }

  /**
   * Box seated on uneven ground: its base reaches below the lowest terrain sample of its footprint
   * (ground returns local terrain height at local x, z), so nothing floats on a slope.
   */
  seatBox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    ground: (x: number, z: number) => number,
    ry = 0,
  ) {
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    let minG = ground(x, z);
    for (const [ax, az] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ] as const) {
      minG = Math.min(minG, ground(x + ax * c + az * sn, z - ax * sn + az * c));
    }
    const bottom = Math.min(y, minG - 0.3);
    return this.box(w, y + h - bottom, d, x, bottom, z, color, ry);
  }

  /** Cylinder/cone with its base at y. */
  cyl(
    rt: number,
    rb: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: string,
    seg = 7,
    rx = 0,
    rz = 0,
    ry = 0,
  ) {
    const key = `cyl:${rt}:${rb}:${seg}`;
    return this.add(
      this.proto(key, () => new THREE.CylinderGeometry(rt, rb, 1, seg)),
      color,
      x,
      y + h / 2,
      z,
      rx,
      ry,
      rz,
      1,
      h,
      1,
      true,
    );
  }

  /** A stick between two points (posts, braces, poles). */
  stick(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, seg = 5) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(mid.x, mid.y, mid.z);
    this.add(g, color, 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
    g.dispose();
    return this;
  }

  /** Low-poly rock (jittered icosahedron). */
  rock(r: number, x: number, y: number, z: number, color: string, rand: () => number) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + rand() * 0.35;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k);
    }
    // Weld the jitter: icosahedron vertices are already unique per face; keep it faceted.
    this.add(g, color, x, y + r * 0.4, z, 0, rand() * 6, 0, 1, 1, 1, true);
    g.dispose();
    return this;
  }

  /** Builds one mesh per color. */
  build(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [color, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.env.toon(color));
      mesh.name = `${name}:${color}`;
      group.add(mesh);
    }
    this.parts.clear();
    for (const g of this.shared.values()) g.dispose();
    this.shared.clear();
    return group;
  }
}

/** Ashlar course: a wall segment from (x0,z0) to (x1,z1) in local space, built of slightly irregular blocks. */
export function stoneWall(
  kit: Kit,
  rand: () => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  h: number,
  thick: number,
  opts: { courses?: number; batter?: number; inward?: THREE.Vector2 } = {},
) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ry = Math.atan2(-dz, dx);
  const ux = dx / len;
  const uz = dz / len;
  const courses = opts.courses ?? Math.max(3, Math.round(h / 0.36));
  const ch = h / courses;
  const inward = opts.inward ?? new THREE.Vector2(0, 0);
  for (let c = 0; c < courses; c++) {
    const inset = (opts.batter ?? 0) * c;
    let s = c % 2 ? -0.18 * rand() : 0;
    while (s < len - 0.02) {
      const bl = Math.min(len - s, 0.42 + rand() * 0.5);
      const mid = s + bl / 2;
      const color = rand() < 0.28 ? C.stoneDark : C.stone;
      const bh = ch * (0.92 + rand() * 0.12);
      kit.box(
        bl - 0.035,
        bh,
        thick * (0.94 + rand() * 0.1) - inset * 0.6,
        x0 + ux * mid + inward.x * inset,
        y0 + c * ch,
        z0 + uz * mid + inward.y * inset,
        color,
        ry + (rand() - 0.5) * 0.03,
      );
      s += bl;
    }
  }
}

/** Hip roof of layered ichu thatch with a hanging fringe. */
export function thatchRoof(kit: Kit, rand: () => number, w: number, d: number, y: number, h: number, ox = 0, oz = 0) {
  const r = Math.SQRT1_2;
  const cone = new THREE.ConeGeometry(r, 1, 4, 1);
  // Layer 1 (darker, wide eaves), layer 2 (lighter, cap)
  kit.add(cone, C.thatch, ox, y + h * 0.42, oz, 0, Math.PI / 4, 0, w + 0.7, h * 0.84, d + 0.7, true);
  kit.add(cone, C.straw, ox, y + h * 0.62, oz, 0, Math.PI / 4, 0, (w + 0.7) * 0.72, h * 0.8, (d + 0.7) * 0.72, true);
  kit.add(cone, C.strawDark, ox, y + h * 0.95, oz, 0, Math.PI / 4, 0, 0.5, h * 0.35, 0.5, true);
  cone.dispose();
  // Fringe: straw tufts hanging off the eave line.
  const ew = (w + 0.7) / 2;
  const ed = (d + 0.7) / 2;
  const tuft = (x: number, z: number, ry: number) =>
    kit.box(
      0.16 + rand() * 0.14,
      0.18 + rand() * 0.14,
      0.05,
      ox + x,
      y - 0.12,
      oz + z,
      rand() < 0.5 ? C.straw : C.strawDark,
      ry,
      (rand() - 0.5) * 0.2,
    );
  for (let x = -ew + 0.12; x < ew; x += 0.2 + rand() * 0.1) {
    tuft(x, ed, 0);
    tuft(x, -ed, 0);
  }
  for (let z = -ed + 0.12; z < ed; z += 0.2 + rand() * 0.1) {
    tuft(ew, z, Math.PI / 2);
    tuft(-ew, z, Math.PI / 2);
  }
}

/** Canvas texture with sRGB + anisotropy. */
export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function redraw(tex: THREE.CanvasTexture, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = tex.image as HTMLCanvasElement;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  draw(ctx, c.width, c.height);
  tex.needsUpdate = true;
}

/** A toon material with a map, cloned from the shared toon so it keeps the 3-step gradient. Caller owns it. */
export function toonMapped(env: WorldEnv, tex: THREE.Texture, color = "#ffffff") {
  const m = env.toon(color).clone();
  m.map = tex;
  m.needsUpdate = true;
  return m;
}

/** Fit text into maxW by shrinking the font. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  family: string,
  size: number,
  maxW: number,
  stretch = "",
) {
  let s = size;
  do {
    ctx.font = `${stretch}${weight} ${s}px ${family}`;
    s -= 1;
  } while (ctx.measureText(text).width > maxW && s > 8);
}

/** Canvas text needs the web fonts loaded; signs register a redraw that runs once they are. */
const fontQueue = new Set<() => void>();
let fontsReady = false;
let fontsRequested = false;
export function onFontsReady(cb: () => void) {
  if (fontsReady) return;
  fontQueue.add(cb);
  if (fontsRequested) return;
  fontsRequested = true;
  try {
    void Promise.all([
      document.fonts.load(`800 40px "Archivo"`),
      document.fonts.load(`600 20px "Hanken Grotesk"`),
      document.fonts.load(`600 20px "JetBrains Mono"`),
    ])
      .then(() => {
        fontsReady = true;
        for (const f of fontQueue) f();
        fontQueue.clear();
      })
      .catch(() => {});
  } catch {
    /* FontFaceSet unavailable */
  }
}
export function offFontsReady(cb: () => void) {
  fontQueue.delete(cb);
}

/** Wooden board texture with carved/painted lettering. */
export function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, fill = "#9a6a40") {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(60,35,18,0.35)";
  ctx.lineWidth = 2;
  const r = rng(w * 7 + h);
  for (let y = 6; y < h; y += 9 + r() * 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.7, y + (r() - 0.5) * 6, w, y + (r() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(4, h * 0.03);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
}

/** World-space colliders along a local segment of an object (rotated walls → chain of circles). */
export function circlesAlong(
  obj: THREE.Object3D,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  r: number,
): Collider[] {
  obj.updateMatrixWorld(true);
  const a = obj.localToWorld(new THREE.Vector3(ax, 0, az));
  const b = obj.localToWorld(new THREE.Vector3(bx, 0, bz));
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.ceil(len / (r * 1.1)));
  const out: Collider[] = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    out.push({ kind: "circle", x: p.x, z: p.z, r });
  }
  return out;
}

export function circleAt(obj: THREE.Object3D, x: number, z: number, r: number): Collider {
  obj.updateMatrixWorld(true);
  const p = obj.localToWorld(new THREE.Vector3(x, 0, z));
  return { kind: "circle", x: p.x, z: p.z, r };
}

/** Soft additive glow sprite (torches, knots). No outline. */
let glowTex: THREE.CanvasTexture | null = null;
export function glowSprite(env: WorldEnv, color: string, size: number) {
  glowTex ??= canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  const mat = new THREE.SpriteMaterial({
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
  });
  // Assign after construction: never pass an undefined map to a material constructor.
  if (glowTex) mat.map = glowTex;
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  env.noOutline(s);
  return s;
}

/** Torch: post + bowl + flame. Flame lights at night (flicker), embers by day. */
export interface Torch {
  group: THREE.Group;
  set(night: boolean): void;
  update(t: number): void;
  dispose(): void;
}

export function makeTorch(env: WorldEnv, height = 1.6, seed = 1): Torch {
  const group = new THREE.Group();
  const kit = new Kit(env);
  kit.cyl(0.05, 0.07, height, 0, 0, 0, C.woodDark, 5);
  kit.cyl(0.2, 0.1, 0.16, 0, height, 0, C.stoneDark, 6);
  kit.cyl(0.12, 0.12, 0.04, 0, height - 0.24, 0, C.woodDark, 6);
  group.add(kit.build("torch"));
  const flameMat = new THREE.MeshBasicMaterial({ color: C.flame, toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: "#ffe2a3", toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 6), flameMat);
  flame.position.y = height + 0.36;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), coreMat);
  core.position.y = height + 0.28;
  env.noOutline(core);
  const glow = glowSprite(env, C.torch, 1.8);
  glow.position.y = height + 0.35;
  group.add(flame, core, glow);
  let night = false;
  const r = rng(seed);
  const ph = r() * 10;
  return {
    group,
    set(n) {
      night = n;
      flame.visible = core.visible = glow.visible = n;
    },
    update(t) {
      if (!night) return;
      const f = 1 + Math.sin(t * 13 + ph) * 0.08 + Math.sin(t * 23 + ph * 2) * 0.06;
      flame.scale.set(1, f, 1);
      flame.rotation.y = t * 2 + ph;
      (glow.material as THREE.SpriteMaterial).opacity = 0.62 + (f - 1) * 1.6;
    },
    dispose() {
      flame.geometry.dispose();
      core.geometry.dispose();
      flameMat.dispose();
      coreMat.dispose();
      (glow.material as THREE.SpriteMaterial).dispose();
      group.removeFromParent();
    },
  };
}

/** Dispose geometries and owned (non-shared) materials of a subtree. Shared toon materials are skipped. */
export function disposeTree(root: THREE.Object3D, owned: Set<THREE.Material>) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  for (const m of owned) {
    const mm = m as THREE.MeshToonMaterial;
    mm.map?.dispose();
    m.dispose();
  }
  root.removeFromParent();
}

/** Eased 0↔1 transition over a fixed duration (smoothstep), instant when reduced motion. */
export class Ease01 {
  p = 1;
  constructor(
    private dur = 0.35,
    private instant = false,
  ) {}
  /** Steps toward target (0 or 1) and returns the eased value. */
  step(target: number, dt: number) {
    if (this.instant) this.p = target;
    else {
      const d = dt / this.dur;
      this.p = target > this.p ? Math.min(target, this.p + d) : Math.max(target, this.p - d);
    }
    return this.p * this.p * (3 - 2 * this.p);
  }
}

/**
 * Fades a whole subtree (roof slab, eaves, ridge, caps) with one shared opacity. Materials are cloned
 * (shared toon materials stay untouched). While not fully opaque the meshes leave the ink-outline layer,
 * so the post-process outline doesn't draw ghost edges; below 0.05 the subtree is hidden.
 */
export function fadeable(root: THREE.Object3D, env: WorldEnv) {
  const mats = new Map<THREE.Material, THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  const collect = () => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || meshes.includes(m)) return;
      const src = m.material as THREE.Material;
      let c = mats.get(src);
      if (!c) {
        c = src.clone();
        c.transparent = true;
        mats.set(src, c);
      }
      m.material = c;
      meshes.push(m);
    });
  };
  collect();
  const baseMask = new Map<THREE.Object3D, number>();
  for (const m of meshes) baseMask.set(m, m.layers.mask);
  let cur = 1;
  let outlined = true;
  return {
    get value() {
      return cur;
    },
    set(opacity: number) {
      if (opacity === cur) return;
      cur = opacity;
      for (const m of mats.values()) {
        m.opacity = opacity;
        m.depthWrite = opacity > 0.99;
      }
      const wantOutline = opacity > 0.99;
      if (wantOutline !== outlined) {
        outlined = wantOutline;
        if (wantOutline) for (const m of meshes) m.layers.mask = baseMask.get(m) ?? 1;
        else env.noOutline(root);
      }
      root.visible = opacity > 0.05;
    },
    dispose() {
      for (const m of mats.values()) m.dispose();
    },
  };
}

/**
 * Dollhouse cutaway: walls whose outward normal faces the camera ease down to a low course while
 * active (and back on exit), so the traveler stays visible inside. `camDir` is the camera direction
 * from the room center, in local space.
 */
export function cutaway(walls: Array<{ g: THREE.Object3D; n: THREE.Vector3 }>, reducedMotion: boolean, low = 0.26) {
  const eases = walls.map(() => new Ease01(0.35, reducedMotion));
  const levels = walls.map(() => 1);
  return {
    update(dt: number, active: boolean, camDir: THREE.Vector3) {
      walls.forEach((w, i) => {
        const up = !(active && w.n.dot(camDir) > 0.2);
        const e = eases[i]!.step(up ? 1 : 0, dt);
        levels[i] = e;
        w.g.scale.y = low + (1 - low) * e;
      });
    },
    /** Eased 0 (cut) … 1 (full) level of wall i, for props that should follow it (beams, signs). */
    level: (i: number) => levels[i] ?? 1,
  };
}

/** A local-ground sampler for a station frame (position + yaw) → terrain height relative to position.y. */
export function localGround(env: WorldEnv, position: THREE.Vector3, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx: number, lz: number) => {
    const wx = position.x + lx * c + lz * s;
    const wz = position.z - lx * s + lz * c;
    return env.heightAt(wx, wz) - position.y;
  };
}
