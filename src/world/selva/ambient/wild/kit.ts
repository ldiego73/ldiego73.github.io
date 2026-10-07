/**
 * Three-side kit shared by the Antisuyu fauna ambients (no `create` export, never globbed): the jungle env
 * adapter, the passport "good look" spotter, small shape primitives for the procedural models, an instanced
 * ripple-ring pool for the water animals, an eyeshine dot pool, and a check for animals the traveler's camera
 * could be looking at (so things are only placed or removed while unseen).
 */
import * as THREE from "three";
import { CATALOG } from "../../../../lib/passport";
import type { WorldEnv } from "../../../contract";
import { emit, type StampDetail } from "../../../events";
import { gradientMap } from "../../../toon";
import type { SelvaEnv, SelvaLayout } from "../../contract";
import { planScenery } from "../../scenery/placement";
import { LookTimer } from "./logic";

export type FaunaId = "guacamayo" | "mono" | "perezoso" | "bufeo" | "caiman" | "ronsoco" | "tucan" | "jaguar";

/** The jungle env, or null when an ambient is loaded outside the selva page (then it does nothing). */
export function selvaOf(env: WorldEnv): (SelvaEnv & { selva: { layout: SelvaLayout } }) | null {
  const s = env as Partial<SelvaEnv>;
  return s.selva?.layout ? (s as SelvaEnv) : null;
}

/** A no-op ambient (for the mountain page, or when the jungle helpers are missing). */
export const idle = () => ({ update() {}, dispose() {} });

/** Toon ramp shared with env.toon (so every fauna shades in the same 3 steps). */
export function ramp(env: WorldEnv): THREE.Texture | null {
  return env.toon("#ffffff").gradientMap ?? gradientMap();
}

/** Passport detail for a jungle fauna stamp, label from the catalog (single source). */
export function stampOf(id: FaunaId): StampDetail {
  const full = `selva:fauna:${id}`;
  const entry = CATALOG.find((s) => s.id === full);
  return { id: full, kind: "fauna", label: entry?.label ?? { es: id, en: id } };
}

/** Camera frustum, refreshed once per frame; `sees(x, y, z, r)` tests a sphere. */
export class View {
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  readonly cam = new THREE.Vector3();
  constructor(private camera: THREE.PerspectiveCamera) {}
  update() {
    this.camera.updateMatrixWorld();
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    this.cam.setFromMatrixPosition(this.camera.matrixWorld);
  }
  sees(x: number, y: number, z: number, r: number) {
    this.sphere.center.set(x, y, z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere);
  }
  /** Distance from the camera. */
  dist(x: number, y: number, z: number) {
    return Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z);
  }
}

/**
 * Passport stamp on the first good look: some animal of the species within `near` of the traveler (XZ),
 * inside the camera frustum and within `near + 12` of the camera, for ~1.5 s in a row. Per frame:
 * `begin()`, then `see(x, y, z)` for candidates, then `end(dt)`.
 */
export class Spotter {
  private timer: LookTimer;
  private any = false;
  readonly view: View;
  constructor(
    env: WorldEnv,
    readonly id: FaunaId,
    readonly near = 12,
    need = 1.5,
  ) {
    this.timer = new LookTimer(need);
    this.view = new View(env.camera);
  }
  get done() {
    return this.timer.done;
  }
  begin() {
    this.any = false;
    this.view.update();
  }
  /** Candidate animal at (x, y, z) with radius r, the traveler at (ax, az). */
  see(x: number, y: number, z: number, ax: number, az: number, r = 0.8, near = this.near) {
    if (this.any || this.timer.done) return;
    if (Math.hypot(x - ax, z - az) > near) return;
    if (this.view.dist(x, y, z) > near + 12) return;
    if (this.view.sees(x, y, z, r)) this.any = true;
  }
  end(dt: number) {
    if (this.timer.update(dt, this.any)) emit("world:stamp", stampOf(this.id));
  }
}

// ---------------------------------------------------------------- shape primitives (model space)

/** Ellipsoid of radius r scaled (sx, sy, sz), tilted by `pitch` about X, centered at (x, y, z). */
export function egg(
  r: number,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  pitch = 0,
  seg = 8,
) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2));
  g.scale(sx, sy, sz);
  if (pitch) g.rotateX(pitch);
  g.translate(x, y, z);
  return g;
}

/** Capsule of radius r from a to b. */
export function limb(r: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, seg = 6) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 2, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/** Tapered cylinder (r0 at a, r1 at b). */
export function tube(
  r0: number,
  r1: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  seg = 6,
) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, Math.max(0.001, len), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/** Cone of radius r and height h starting at `from` and pointing along `dir`. */
export function cone(r: number, h: number, seg: number, from: THREE.Vector3, dir: THREE.Vector3) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** Flat planform (span x, chord y) → XZ plane with thickness t, chord pointing back (−Z), mirrored by side. */
export function planform(pts: Array<[number, number]>, side: 1 | -1, t: number) {
  const ordered = side === 1 ? pts : [...pts].reverse();
  const shape = new THREE.Shape(ordered.map(([x, y]) => new THREE.Vector2(x * side, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);

// ---------------------------------------------------------------- water rings

/**
 * Expanding ripple rings on the water surface (one InstancedMesh, additive: a ring fades by darkening its
 * instance color to black). `spawn(x, z, size)` reuses the oldest ring.
 */
export class Ripples {
  readonly mesh: THREE.InstancedMesh;
  private age: Float32Array;
  private size: Float32Array;
  private pos: Float32Array;
  private next = 0;
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  constructor(
    env: WorldEnv,
    name: string,
    private n: number,
    private y: number,
    private life = 1.6,
  ) {
    const geo = new THREE.RingGeometry(0.82, 1, 24, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
    this.age = new Float32Array(n).fill(99);
    this.size = new Float32Array(n);
    this.pos = new Float32Array(n * 2);
    this.mesh.count = 0;
    this.mesh.visible = false;
    env.noOutline(this.mesh);
  }
  spawn(x: number, z: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.age[i] = 0;
    this.size[i] = size;
    this.pos[i * 2] = x;
    this.pos[i * 2 + 1] = z;
  }
  update(dt: number) {
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      const a = (this.age[i] as number) + dt;
      this.age[i] = a;
      if (a >= this.life) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      any = i + 1;
      const k = a / this.life;
      const s = (this.size[i] as number) * (0.25 + k * 1.1);
      this.m.makeScale(s, 1, s).setPosition(this.pos[i * 2] as number, this.y + 0.02, this.pos[i * 2 + 1] as number);
      this.mesh.setMatrixAt(i, this.m);
      const f = (1 - k) * (1 - k) * 0.9;
      this.mesh.setColorAt(i, this.c.setRGB(f, f, f));
    }
    if (any !== this.live || any > 0) {
      this.live = any;
      this.mesh.count = any;
      this.mesh.visible = any > 0;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ---------------------------------------------------------------- eyeshine dots

/**
 * Pairs of unlit eye dots that turn into an eyeshine glint at night (jaguar, caimán). The owner positions
 * each dot every frame (`set(i, pos, size, glint)`); the color runs from the dark eye to the glow.
 */
export class Eyes {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly dark: THREE.Color;
  private readonly glow: THREE.Color;
  constructor(env: WorldEnv, name: string, n: number, dark: string, glow: string) {
    // No fog: eyeshine is light coming back from the eye, it should carry across the dark water.
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, Math.max(1, n));
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dark = new THREE.Color(dark);
    this.glow = new THREE.Color(glow);
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this.dark);
    this.mesh.count = 0;
    this.mesh.visible = false;
    env.noOutline(this.mesh);
  }
  set(i: number, p: THREE.Vector3, size: number, glint: number) {
    this.m.makeScale(size, size, size).setPosition(p);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.copy(this.dark).lerp(this.glow, glint));
  }
  commit(n: number) {
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.mesh.frustumCulled = true;
      this.mesh.computeBoundingSphere();
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ---------------------------------------------------------------- misc

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Root matrix from position, yaw (about Y), pitch (nose up −… see Euler YXZ), roll and uniform scale. */
export function rootMatrix(
  out: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch = 0,
  roll = 0,
  scale = 1,
) {
  _q.setFromEuler(_e.set(pitch, yaw, roll, "YXZ"));
  return out.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
}

/** Static vertex-colored toon mesh (merged props: host trees, the clay wall, leaves). */
export function propMesh(env: WorldEnv, name: string, geo: THREE.BufferGeometry, shadow = false) {
  // Double-sided: the cecropia and heliconia leaves are single planes seen from below as often as above.
  const mat = new THREE.MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
    gradientMap: ramp(env),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

export function disposeMesh(m: THREE.Mesh) {
  m.removeFromParent();
  m.geometry.dispose();
  const mat = m.material;
  if (Array.isArray(mat)) for (const x of mat) x.dispose();
  else mat.dispose();
}

export { _m as scratchMatrix };

// ---------------------------------------------------------------- sandbars (playas)

/** A sandbar as planned by the scenery (scenery/placement.ts Sandbar): ellipse len × wid, axis yaw. */
export interface Bar {
  x: number;
  z: number;
  yaw: number;
  len: number;
  wid: number;
}

const barCache = new WeakMap<object, Bar[]>();

/**
 * The scenery's sandbars on the inside of the river bends. Read from the scenery group's userData when it
 * publishes them (`selva-scenery`.userData.sandbars), otherwise re-derived from the pure placement plan
 * (identical for every quality; the cheap low/phone plan, ≈ 20 ms, once per page, shared by every ambient).
 */
export function sandbars(env: SelvaEnv): Bar[] {
  const L = env.selva.layout;
  const hit = barCache.get(L);
  if (hit) return hit;
  const pub = env.scene.getObjectByName("selva-scenery")?.userData?.sandbars as Bar[] | undefined;
  let bars: Bar[] = pub ?? [];
  if (!pub) {
    try {
      bars = planScenery(L, "low", true).sandbars;
    } catch {
      bars = [];
    }
  }
  barCache.set(L, bars);
  return bars;
}

/** Normalized elliptic radius of (x, z) on a bar (0 center, 1 rim). */
export function barF(b: Bar, x: number, z: number) {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const u = dx * c + dz * s;
  const v = -dx * s + dz * c;
  return Math.hypot(u / b.len, v / b.wid);
}

/** Sand surface height at normalized radius f (the scenery's dome: level + 0.22·(1 − f²) − 0.04). */
export const barY = (level: number, f: number) => level + 0.22 * (1 - f * f) - 0.04;

/** Point on a bar at normalized (u along the axis, v across), both in −1..1. */
export function barPoint(b: Bar, u: number, v: number) {
  const lu = u * b.len;
  const lv = v * b.wid;
  return { x: b.x + lu * Math.cos(b.yaw) - lv * Math.sin(b.yaw), z: b.z + lu * Math.sin(b.yaw) + lv * Math.cos(b.yaw) };
}

/** Sandbar nearest to road t (by the road t of its center), or null. */
export function barNear(env: SelvaEnv, t: number, maxDt = 0.04): Bar | null {
  const L = env.selva.layout;
  let best: Bar | null = null;
  let bd = maxDt;
  for (const b of sandbars(env)) {
    const d = Math.abs(L.trail.nearestT(b.x, b.z) - t);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/**
 * Dev-only inspection hook: `window.__selvaFauna[name]()` returns the module's live state (screenshot
 * scripts use it to find animals). Returns the remover for dispose(). No-op in production builds.
 */
export function devHook(name: string, fn: () => unknown): () => void {
  if (!import.meta.env?.DEV) return () => {};
  const w = window as unknown as { __selvaFauna?: Record<string, () => unknown> };
  w.__selvaFauna ??= {};
  w.__selvaFauna[name] = fn;
  return () => {
    if (w.__selvaFauna) delete w.__selvaFauna[name];
  };
}

/** Beyond this camera distance small animals are not drawn (a few pixels in the haze; saves their draws). */
export const FAUNA_FAR = 120;

/**
 * Static props split per site (one merged mesh per tree stand / grove), shown only while the camera is within
 * `far` of the site: the stands lie hundreds of units apart, so at most one or two cost a draw at a time.
 */
export class SiteProps {
  readonly group = new THREE.Group();
  private sites: Array<{ mesh: THREE.Mesh; x: number; z: number; r: number }> = [];
  constructor(
    private env: WorldEnv,
    name: string,
    private far = 170,
  ) {
    this.group.name = name;
  }
  add(geo: THREE.BufferGeometry, shadow: boolean) {
    geo.computeBoundingSphere();
    const bs = geo.boundingSphere as THREE.Sphere;
    const mesh = propMesh(this.env, `${this.group.name}-${this.sites.length}`, geo, shadow);
    this.group.add(mesh);
    this.sites.push({ mesh, x: bs.center.x, z: bs.center.z, r: bs.radius });
  }
  get size() {
    return this.sites.length;
  }
  update(cam: THREE.Vector3) {
    for (const s of this.sites) s.mesh.visible = Math.hypot(s.x - cam.x, s.z - cam.z) - s.r < this.far;
  }
  dispose() {
    for (const s of this.sites) disposeMesh(s.mesh);
    this.group.removeFromParent();
  }
}
