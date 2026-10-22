/**
 * Small builder for the lake's static models: collects primitives (box, cylinder, cone, sphere, capsule, any
 * geometry) with a flat colour and a transform, and merges them into ONE vertex-coloured geometry
 * (../../../merge-colors.ts), so a whole set of islands, huts and boats is a single draw call on a vertexToon
 * material. `frame` sets a parent transform (a station's position and yaw) applied after each primitive's own.
 *
 * Cloth (flags, the balsa's sail, Taquile's hung weavings): `cloth()` adds a thin, subdivided panel whose
 * vertices carry a `flex` weight (0 at the pinned edge → 1 at the free edge). When a build holds any cloth, the
 * merged geometry gets a `flex` attribute (0 on every rigid part) and `kitMaterial` returns the vertexToon on the
 * shared wind in "cloth" mode (../../../style-gl.ts `windSway`): rigid parts have no weight, so they stay put, and
 * the cloth ripples with the world's gusts in the SAME draw call.
 */
import * as THREE from "three";
import { type ColoredPart, mergeColored, vertexToon } from "../../../merge-colors";
import { windSway } from "../../../style-gl";

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Which edge of a cloth panel is held (by a pole, a line, a yard): "top", "left", or "ends" (top and bottom). */
export type ClothPin = "top" | "left" | "ends";

export interface ClothOptions {
  /** Held edge (default "top"). */
  pin?: ClothPin;
  /** Turn about y (radians) after the panel's own frame: the panel lies in local x (width) × y (height). */
  yaw?: number;
  /** Flex at the pinned edge and at the free edge (default [0, 1]). A band of a striped weaving hung from the
   * top passes its slice of the whole cloth (e.g. [0.4, 0.6]) so the bands move as one; a stiff reed mat
   * passes a smaller free value. */
  flex?: readonly [number, number];
  /** Panel thickness (default 0.03). */
  thick?: number;
  /** Subdivisions across and down (default 6 × 4): the ripple needs vertices to bend on. */
  segs?: readonly [number, number];
}

interface ClothPart {
  pin: ClothPin;
  f0: number;
  f1: number;
}

export class Build {
  private parts: ColoredPart[] = [];
  /** Cloth info per part (same index as `parts`; undefined = rigid). */
  private cloths: Array<ClothPart | undefined> = [];
  private owned = new Set<THREE.BufferGeometry>();
  private protos = new Map<string, THREE.BufferGeometry>();
  /** Parent transform for the next primitives (null: world). */
  frame: THREE.Matrix4 | null = null;

  private proto(key: string, make: () => THREE.BufferGeometry) {
    let g = this.protos.get(key);
    if (!g) {
      g = make();
      this.protos.set(key, g);
      this.owned.add(g);
    }
    return g;
  }

  /** Any geometry (not copied: keep it alive until build()), centre at (x, y, z). */
  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): this {
    q.setFromEuler(e.set(rx, ry, rz));
    const m = new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
    if (this.frame) m.premultiply(this.frame);
    this.parts.push({ geometry: geo, color: new THREE.Color(color), matrix: m });
    return this;
  }

  /**
   * A cloth panel w × h centred at (x, y, z), lying in the local x–y plane turned by `o.yaw`, held along
   * `o.pin`. Its normals all face the panel's front (+z before the yaw), so both faces and the thin edges move
   * as one sheet under the wind's push along the normal (the back face shades like the front: a thin cloth).
   */
  cloth(w: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, o: ClothOptions = {}) {
    const [sx, sy] = o.segs ?? [6, 4];
    const g = this.proto(`cloth:${sx}:${sy}`, () => {
      const b = new THREE.BoxGeometry(1, 1, 1, sx, sy, 1);
      const n = b.getAttribute("normal") as THREE.BufferAttribute;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0, 1);
      return b;
    });
    const [f0, f1] = o.flex ?? [0, 1];
    this.add(g, color, x, y, z, 0, o.yaw ?? 0, 0, w, h, o.thick ?? 0.03);
    this.cloths[this.parts.length - 1] = { pin: o.pin ?? "top", f0, f1 };
    return this;
  }

  /** Box with its base at y. */
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    ry = 0,
    rx = 0,
    rz = 0,
  ) {
    const g = this.proto("box", () => new THREE.BoxGeometry(1, 1, 1));
    return this.add(g, color, x, y + h / 2, z, rx, ry, rz, w, h, d);
  }

  /** Cylinder / truncated cone with its base at y. */
  cyl(
    rt: number,
    rb: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    seg = 8,
    rx = 0,
    rz = 0,
    ry = 0,
  ) {
    const g = this.proto(`cyl:${rt}:${rb}:${seg}`, () =>
      new THREE.CylinderGeometry(rt, rb, 1, seg).translate(0, 0.5, 0),
    );
    // Rotations pivot at the base (a leaning post stays planted).
    return this.add(g, color, x, y, z, rx, ry, rz, 1, h, 1);
  }

  /** Sphere (scaled to an ellipsoid). */
  sph(
    rx: number,
    ry: number,
    rz: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    detail = 1,
  ) {
    const g = this.proto(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.add(g, color, x, y, z, 0, 0, 0, rx, ry, rz);
  }

  /** A reed bundle: a capsule lying along local z (length len, radius r), centre at (x, y, z), turned by yaw. */
  bundle(
    len: number,
    r: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    yaw = 0,
    pitch = 0,
    flat = 1,
  ) {
    const g = this.proto("cap", () => new THREE.CapsuleGeometry(1, 1, 3, 8).rotateX(Math.PI / 2));
    // Capsule of radius 1 and body length 1 (3 long with its caps): scale it to len; `flat` squashes it.
    return this.add(g, color, x, y, z, pitch, yaw, 0, r, r * flat, Math.max(0.01, len / 3));
  }

  /** A stick between two points (posts, braces, poles). */
  stick(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 5) {
    const len = a.distanceTo(b);
    const g = this.proto(`stick:${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new THREE.Matrix4().compose(mid, rot, new THREE.Vector3(r, len, r));
    if (this.frame) m.premultiply(this.frame);
    this.parts.push({ geometry: g, color: new THREE.Color(color), matrix: m });
    return this;
  }

  /** True once a cloth panel was added (the build then carries a `flex` attribute). */
  get hasCloth() {
    return this.cloths.some(Boolean);
  }

  /** Keep a one-off geometry alive until build() and dispose it then. */
  own(g: THREE.BufferGeometry) {
    this.owned.add(g);
    return g;
  }

  get empty() {
    return this.parts.length === 0;
  }

  /**
   * Merge everything into one vertex-coloured geometry (null when empty); every owned prototype is disposed.
   * With cloth (or `flex: true`, for a geometry that shares a cloth material), it also carries `flex`.
   */
  build(opts: { flex?: boolean } = {}): THREE.BufferGeometry | null {
    const g = mergeColored(this.parts);
    if (g && (opts.flex || this.hasCloth)) g.setAttribute("flex", new THREE.BufferAttribute(this.flexOf(g), 1));
    for (const o of this.owned) o.dispose();
    this.owned.clear();
    this.protos.clear();
    this.parts = [];
    this.cloths = [];
    return g;
  }

  /** The per-vertex flex of the merged geometry: mergeColored lays the parts out in order, non-indexed. */
  private flexOf(g: THREE.BufferGeometry): Float32Array {
    const out = new Float32Array(g.getAttribute("position").count);
    let o = 0;
    this.parts.forEach((part, i) => {
      const src = part.geometry;
      const n = src.index ? src.index.count : src.getAttribute("position").count;
      const c = this.cloths[i];
      if (c) {
        // Local panel coordinates (−0.5 … 0.5) before the part's matrix: the free edge is 1 across the pin.
        const flat = src.index ? src.toNonIndexed() : src;
        const pos = flat.getAttribute("position");
        for (let k = 0; k < n; k++) {
          const lx = pos.getX(k);
          const ly = pos.getY(k);
          const u = c.pin === "left" ? lx + 0.5 : c.pin === "ends" ? 1 - (2 * ly) ** 2 : 0.5 - ly;
          out[o + k] = c.f0 + (c.f1 - c.f0) * Math.min(1, Math.max(0, u));
        }
        if (flat !== src) flat.dispose();
      }
      o += n;
    });
    return out;
  }
}

/** A frame matrix: translate to (x, y, z) and turn by yaw. */
export function frameAt(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(1, 1, 1),
  );
}

/**
 * The material for a Build's geometry: the plain vertexToon, or, when the geometry carries cloth (`flex`), the
 * same toon on the shared wind in cloth mode (the rigid parts have flex 0 and do not move).
 */
export function kitMaterial(geo: THREE.BufferGeometry | null): THREE.MeshToonMaterial {
  const mat = vertexToon();
  // A little more than the shared cloth default: the altiplano's flags and weavings snap in the gusts.
  return geo?.getAttribute("flex") ? windSway(mat, { mode: "cloth", flex: true, amp: 1.35 }) : mat;
}
