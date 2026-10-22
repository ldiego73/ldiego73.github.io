/**
 * World-local worn and carried pieces that ride the new characters' bones (the mountain's chasquis: khipus,
 * the pututo conch, the server rack, a tablet, the plume…), for the pieces the shared catalogue
 * (characters/props.ts `PROPS`, wear/) does not have. Every piece of every person is one instance of ONE
 * BatchedMesh (a different merged geometry per instance, one draw call per pass), placed each frame from the
 * person's bone through the public `PropHolder.boneWorld` (a crowd member implements it).
 *
 *   const gear = new BoneBatch(material, { geometries: 12, vertices: 9000, instances: 40 });
 *   const khipu = gear.geometry(buildKhipu());          // once per shape
 *   const h = gear.attach(member, "handL", khipu);       // per person and piece
 *   // every frame, after the people commit:
 *   gear.update();
 *
 * Geometries are in the bone's frame (Y up, +Z forward, +X the person's left, origin at the joint) and must
 * carry position, normal and color, non-indexed (see `bakeColor` / `Kit` callers).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PropHolder } from "../../characters/props";

export interface BoneBatchSize {
  geometries: number;
  vertices: number;
  instances: number;
}

export interface GearHandle {
  show(on: boolean): void;
  /** Extra transform in the bone frame (a swing, a blink: scale 0 hides). */
  readonly local: THREE.Matrix4;
  detach(): void;
}

interface Slot {
  holder: PropHolder;
  bone: string;
  id: number;
  on: boolean;
  local: THREE.Matrix4;
}

const tmp = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class BoneBatch {
  readonly mesh: THREE.BatchedMesh;
  private slots: Slot[] = [];

  constructor(material: THREE.Material, size: BoneBatchSize, name = "gente:gear") {
    this.mesh = new THREE.BatchedMesh(size.instances, size.vertices, size.vertices, material);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    // Instances move with their people every frame; the batch's bounds would be stale.
    this.mesh.frustumCulled = false;
    this.mesh.perObjectFrustumCulled = false;
    this.mesh.sortObjects = false;
  }

  /** Register a shape (indexed geometries are converted); returns its id for `attach`. */
  geometry(g: THREE.BufferGeometry): number {
    const geo = g.index ? g.toNonIndexed() : g;
    // BatchedMesh wants an index layout shared by all its geometries: give every one a trivial index.
    if (!geo.index) {
      const n = geo.getAttribute("position").count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const id = this.mesh.addGeometry(geo);
    if (geo !== g) geo.dispose();
    g.dispose();
    return id;
  }

  attach(holder: PropHolder, bone: string, geometry: number): GearHandle {
    const id = this.mesh.addInstance(geometry);
    this.mesh.setMatrixAt(id, ZERO);
    const slot: Slot = { holder, bone, id, on: true, local: new THREE.Matrix4() };
    this.slots.push(slot);
    return {
      show: (on) => {
        slot.on = on;
      },
      local: slot.local,
      detach: () => {
        this.slots = this.slots.filter((s) => s !== slot);
        this.mesh.deleteInstance(slot.id);
      },
    };
  }

  /** Follow the bones (call after the people are posed and committed). */
  update() {
    for (const s of this.slots) {
      const show = s.on && s.holder.shown !== false;
      this.mesh.setVisibleAt(s.id, show);
      if (!show) continue;
      s.holder.boneWorld(s.bone, tmp);
      this.mesh.setMatrixAt(s.id, tmp.multiply(s.local));
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

const kM = new THREE.Matrix4();
const kQ = new THREE.Quaternion();
const kE = new THREE.Euler();
const kP = new THREE.Vector3();
const kS = new THREE.Vector3();

/** Shared primitive shapes for gear (unit sizes; scaled per use). Disposed by `GearKit.dispose`. */
const unit = () => ({
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 10, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cap: new THREE.CapsuleGeometry(1, 1, 2, 8),
  torus: new THREE.TorusGeometry(1, 0.16, 5, 14),
  plane: new THREE.PlaneGeometry(1, 1),
});
export type Shape = keyof ReturnType<typeof unit>;

/**
 * Builds one merged, vertex-coloured geometry from primitives (position, rotation, scale and a colour each),
 * the format `BoneBatch.geometry` and the static props take.
 */
export class GearKit {
  readonly P = unit();
  private list: THREE.BufferGeometry[] = [];
  add(
    shape: Shape,
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
  ) {
    const g = bakeColor(this.P[shape], color);
    kQ.setFromEuler(kE.set(rx, ry, rz));
    g.applyMatrix4(kM.compose(kP.set(x, y, z), kQ, kS.set(sx, sy, sz)));
    this.list.push(g);
    return this;
  }
  /** Any geometry (e.g. a hand-made triangle), painted one colour. */
  addGeometry(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
    this.list.push(bakeColor(g, color));
    return this;
  }
  /** The merged geometry so far (the kit is emptied, its shapes kept for the next build). */
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
  dispose() {
    for (const g of Object.values(this.P)) g.dispose();
  }
}

/** Paint a whole geometry one colour (a `color` attribute), keeping only position and normal. */
export function bakeColor(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
  const n = geo.getAttribute("position").count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
