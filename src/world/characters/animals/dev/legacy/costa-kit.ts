// Dev-only snapshot of the coast's pre-characters kit (the harness's old models need its Geo). Not shipped.
/**
 * Geometry kit of the coast world: builds vertex-coloured merged geometries from primitives (boxes, cylinders,
 * cones, spheres, wedges, extruded outlines) so every static model — a huaca, a stall, a cactus — is ONE
 * BufferGeometry drawn with one shared vertex-toon material (../merge-colors.ts vertexToon), or the geometry of
 * one InstancedMesh. Colours are sRGB hex in, linear vertex colours out (as merge-colors does). No env needed,
 * so scenery and ambients share it.
 *
 * Cloth inside a merged model: while `cloth` is set, every part added gets a `flex` weight along one axis of
 * the model's own frame (0 at the pinned edge → 1 at the free edge, as ../style-gl.ts `clothFlex` writes it);
 * every other part gets 0. Drawn with `windSway(mat, { mode: "cloth", flex: true })`, the banners, awnings and
 * hangings of a model then wave in the shared wind while the rest of the same mesh (same draw call) stays put.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clothFlex } from "../../../../style-gl";

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Geo {
  private list: THREE.BufferGeometry[] = [];
  private protos = new Map<string, THREE.BufferGeometry>();
  /** Optional transform applied after each part's own (places a sub-model in a frame). */
  post: THREE.Matrix4 | null = null;
  /**
   * While set, parts are cloth: `flex` along `axis` of the model frame (before `post`), 0 at `pinned` → 1 at
   * `free` (see the header). Set it around the cloth parts only, then back to null.
   */
  cloth: { axis: "x" | "y" | "z"; pinned: number; free: number } | null = null;
  private anyCloth = false;

  private proto(key: string, make: () => THREE.BufferGeometry) {
    let g = this.protos.get(key);
    if (!g) {
      g = make();
      this.protos.set(key, g);
    }
    return g;
  }

  /** Add a geometry (cloned) with a colour and a transform (position, Euler rotation, scale). */
  add(
    src: THREE.BufferGeometry,
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
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    g.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
    if (this.cloth) {
      clothFlex(g, this.cloth.axis, this.cloth.pinned, this.cloth.free);
      this.anyCloth = true;
    }
    if (this.post) g.applyMatrix4(this.post);
    g.computeVertexNormals();
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    tmpC.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.list.push(g);
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
    // Cloth boxes are subdivided so the wave can run along them (a plain box would only swing its free edge).
    const proto = this.cloth
      ? this.proto("box:cloth", () => new THREE.BoxGeometry(1, 1, 1, 6, 6, 6))
      : this.proto("box", () => new THREE.BoxGeometry(1, 1, 1));
    return this.add(proto, color, x, y + h / 2, z, rx, ry, rz, w, h, d);
  }

  /** Cylinder / cone frustum with its base at y. */
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
    const g = this.proto(`cyl:${rt}:${rb}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
    return this.add(g, color, x, y + h / 2, z, rx, ry, rz, 1, h, 1);
  }

  /** Ellipsoid centred at (x, y, z). */
  blob(
    rx: number,
    ry: number,
    rz: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    detail = 1,
    rotY = 0,
  ) {
    const g = this.proto(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.add(g, color, x, y, z, 0, rotY, 0, rx, ry, rz);
  }

  /** A stick between two points. */
  stick(a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, color: THREE.ColorRepresentation, seg = 5) {
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const len = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()),
    );
    const mid = va.add(vb).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    this.add(g, color);
    g.dispose();
    return this;
  }

  /**
   * A stepped platform (huaca, pyramid): `tiers` boxes shrinking upward, centred at (x, z) with its base at y.
   * Returns the top height.
   */
  steps(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    tiers: number,
    th: number,
    inset: number,
    colors: (i: number) => THREE.ColorRepresentation,
    ry = 0,
  ) {
    let top = y;
    for (let i = 0; i < tiers; i++) {
      const ww = Math.max(0.5, w - i * inset * 2);
      const dd = Math.max(0.5, d - i * inset * 2);
      this.box(ww, th, dd, x, top, z, colors(i), ry);
      top += th;
    }
    return top;
  }

  /** A flat 2D outline (x, z points, counter-clockwise from above) extruded up by h from y. */
  prism(pts: Array<[number, number]>, y: number, h: number, color: THREE.ColorRepresentation) {
    const shape = new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    this.add(g, color);
    g.dispose();
    return this;
  }

  get empty() {
    return this.list.length === 0;
  }

  /** Merge into one geometry (position, normal, color) and free the parts. */
  build(): THREE.BufferGeometry {
    // Every part needs the same attributes to merge: rigid parts get flex 0 when the model has cloth.
    if (this.anyCloth)
      for (const g of this.list)
        if (!g.getAttribute("flex"))
          g.setAttribute("flex", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count), 1));
    const merged = this.list.length ? mergeGeometries(this.list, false) : new THREE.BufferGeometry();
    for (const g of this.list) g.dispose();
    for (const g of this.protos.values()) g.dispose();
    this.list = [];
    this.protos.clear();
    this.anyCloth = false;
    merged.computeBoundingSphere();
    return merged;
  }
}
