/**
 * Small builder for the lake's static models: collects primitives (box, cylinder, cone, sphere, capsule, any
 * geometry) with a flat colour and a transform, and merges them into ONE vertex-coloured geometry
 * (../../../merge-colors.ts), so a whole set of islands, huts and boats is a single draw call on a vertexToon
 * material. `frame` sets a parent transform (a station's position and yaw) applied after each primitive's own.
 */
import * as THREE from "three";
import { type ColoredPart, mergeColored } from "../../../merge-colors";

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

export class Build {
  private parts: ColoredPart[] = [];
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

  /** Keep a one-off geometry alive until build() and dispose it then. */
  own(g: THREE.BufferGeometry) {
    this.owned.add(g);
    return g;
  }

  get empty() {
    return this.parts.length === 0;
  }

  /** Merge everything into one vertex-coloured geometry (null when empty); every owned prototype is disposed. */
  build(): THREE.BufferGeometry | null {
    const g = mergeColored(this.parts);
    for (const o of this.owned) o.dispose();
    this.owned.clear();
    this.protos.clear();
    this.parts = [];
    return g;
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
