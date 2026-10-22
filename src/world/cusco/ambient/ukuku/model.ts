/**
 * The ukuku's shaggy fleece (../ukuku.ts): the one part of the bear-dancer's costume the characters core cannot
 * express. The rest of the costume (the knitted mask, the belt and bell, the doll on the chest, no painted face)
 * travels in the dancer's spec through the core's `extra` hook (./costume.ts), and the whip is the core's held
 * prop. The core's `extra` wool is a smooth noise on a surface; a bear suit needs a broken, shaggy silhouette:
 *  - stacked, jittered low-poly lumps in four dark browns scattered over the body and each limb segment (the
 *    lumps break the silhouette, so the ink outline draws it shaggy), and a fringe of hanging tufts at the hem,
 *    the wrists and the ankles;
 *  - every lump rigidly skinned to ONE bone of the person (skinIndex = that bone, weight 1), so the whole fleece
 *    is ONE SkinnedMesh on the body's Skeleton: one draw call, posed by the same bones at every LOD.
 * Coordinates are the body's model space at the bind pose (world aligned, feet at the origin, facing +Z, left
 * = +X), in traveler units scaled by the person's size `k` (../../../characters/human.ts proportions).
 */
import * as THREE from "three";
import type { Human } from "../../../characters/hero";
import { type ColoredPart, mergeColored } from "../../../merge-colors";

/** Dark brown fleece, lifted a little so the costume still reads in the moonlit plaza (it only comes out at night). */
const FLEECE = ["#4a3424", "#5b4029", "#3b2a1e", "#674a31"] as const;

/** Seeded random (mulberry32). */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit primitives, built per costume and disposed once merged. */
const protos = () => ({
  // Smooth-shaded low-poly lumps: faceted ones drew an ink line on every facet and read as scribbles.
  lump: new THREE.SphereGeometry(1, 7, 5),
  sph: new THREE.SphereGeometry(1, 12, 9),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
});
type Protos = ReturnType<typeof protos>;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** Parts of one bone (model space, already scaled by k). */
class Parts {
  list: ColoredPart[] = [];
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(
    private P: Protos,
    private k: number,
  ) {}
  /** A primitive at (x, y, z) (unscaled body units), rotated, with half sizes. */
  rot(
    geo: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    r: [number, number, number],
    s: [number, number, number],
  ) {
    const k = this.k;
    this.q.setFromEuler(this.e.set(r[0], r[1], r[2]));
    const matrix = new THREE.Matrix4().compose(
      this.v.set(x * k, y * k, z * k),
      this.q,
      this.s.set(s[0] * k, s[1] * k, s[2] * k),
    );
    this.list.push({ geometry: geo, color: new THREE.Color(color), matrix });
    return this;
  }
  add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    return this.rot(geo, color, x, y, z, [0, 0, 0], [sx, sy, sz]);
  }
  /** A thin rod between two points (body units). */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string) {
    const k = this.k;
    const mid = a
      .clone()
      .add(b)
      .multiplyScalar(0.5 * k);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
    const matrix = new THREE.Matrix4().compose(mid, q, V(r * k, a.distanceTo(b) * k, r * k));
    this.list.push({ geometry: this.P.cyl, color: new THREE.Color(color), matrix });
    return this;
  }
  private lump(rand: () => number, x: number, y: number, z: number, size: number) {
    const s = size * (0.75 + rand() * 0.5);
    return this.rot(
      this.P.lump,
      FLEECE[Math.floor(rand() * FLEECE.length)] as string,
      x,
      y,
      z,
      [rand() * 3, rand() * 3, rand() * 3],
      [s, s * (1.1 + rand() * 0.4), s],
    );
  }
  /** Fleece over an ellipsoid shell (centre c, half axes a): n lumps of about `size`, above `yMin`. */
  shell(rand: () => number, n: number, c: THREE.Vector3, a: THREE.Vector3, size: number, yMin = -Infinity) {
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = c.y + u * a.y;
      if (y < yMin) continue;
      this.lump(rand, c.x + Math.cos(th) * r * a.x, y, c.z + Math.sin(th) * r * a.z, size);
    }
    return this;
  }
  /** Fleece over a limb segment a → b (a tube of radius r): n lumps, a dark core inside so no gap shows. */
  tube(rand: () => number, n: number, a: THREE.Vector3, b: THREE.Vector3, r: number, size: number) {
    const d = b.clone().sub(a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const k = this.k;
    this.list.push({
      geometry: this.P.sph,
      color: new THREE.Color(FLEECE[2]),
      matrix: new THREE.Matrix4().compose(
        mid.clone().multiplyScalar(k),
        q,
        V(r * 0.9 * k, len * 0.55 * k, r * 0.9 * k),
      ),
    });
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = (i + rand() * 0.8) / n;
      const th = rand() * Math.PI * 2;
      p.set(Math.cos(th) * r, 0, Math.sin(th) * r)
        .applyQuaternion(q)
        .addScaledVector(d, t)
        .add(a);
      this.lump(rand, p.x, p.y, p.z, size);
    }
    return this;
  }
  /** A ring of downward tufts (the shaggy fringe) round (x, y, z), radii (rx, rz), tuft length `len`. */
  fringe(rand: () => number, n: number, x: number, y: number, z: number, rx: number, rz: number, len: number) {
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 + rand() * 0.3;
      const l = len * (0.7 + rand() * 0.6);
      // The cone's apex points down (rotated π about x), a little splayed outward.
      this.rot(
        this.P.cone,
        FLEECE[Math.floor(rand() * FLEECE.length)] as string,
        x + Math.cos(th) * rx,
        y - l / 2,
        z + Math.sin(th) * rz,
        [Math.PI + Math.sin(th) * 0.25, 0, -Math.cos(th) * 0.25],
        [len * 0.32, l, len * 0.32],
      );
    }
    return this;
  }
}

export interface Fleece {
  /** The shaggy fleece suit: one SkinnedMesh on the person's skeleton. */
  suit: THREE.SkinnedMesh;
  dispose(): void;
}

/** Dress a person (createHuman, any LOD: the skeleton is the same at every LOD) in the ukuku's fleece. */
export function dressFleece(human: Human, mat: THREE.Material): Fleece {
  const R = rng(0x0c0c0);
  const PROTO = protos();
  const inst = human.inst;
  const rest = inst.rest;
  const k = ((rest.hips as THREE.Vector3).y ?? 0.8) / 0.8;
  const at = (name: string) => (rest[name] as THREE.Vector3).clone().multiplyScalar(1 / k);
  const perBone = new Map<string, Parts>();
  const on = (bone: string) => {
    let p = perBone.get(bone);
    if (!p) {
      p = new Parts(PROTO, k);
      perBone.set(bone, p);
    }
    return p;
  };

  // ------------------------------------------------------------------ body: a broad, bear-like fleece tunic
  on("hips")
    .add(PROTO.sph, FLEECE[2], 0, 0.82, 0, 0.19, 0.12, 0.15)
    .shell(R, 30, V(0, 0.8, 0), V(0.2, 0.1, 0.16), 0.075)
    .fringe(R, 20, 0, 0.72, 0, 0.2, 0.16, 0.17);
  on("spine")
    .add(PROTO.sph, FLEECE[2], 0, 0.95, 0, 0.18, 0.1, 0.14)
    .shell(R, 22, V(0, 0.95, 0), V(0.19, 0.07, 0.15), 0.075);
  on("chest")
    .add(PROTO.sph, FLEECE[2], 0, 1.07, 0, 0.2, 0.12, 0.14)
    .shell(R, 36, V(0, 1.07, 0), V(0.21, 0.12, 0.155), 0.08)
    // Fleece collar where the mask meets the costume, and the shoulders' tufts.
    .shell(R, 16, V(0, 1.2, -0.01), V(0.12, 0.03, 0.1), 0.06)
    .shell(R, 10, V(0.17, 1.13, -0.01), V(0.06, 0.04, 0.07), 0.07)
    .shell(R, 10, V(-0.17, 1.13, -0.01), V(0.06, 0.04, 0.07), 0.07);

  // ------------------------------------------------------------------ limbs
  for (const s of ["L", "R"] as const) {
    const sg = s === "L" ? 1 : -1;
    const arm = at(`arm${s}`);
    const fore = at(`fore${s}`);
    const hand = at(`hand${s}`);
    on(`arm${s}`).tube(R, 16, arm, fore, 0.075, 0.065);
    on(`fore${s}`)
      .tube(R, 12, fore, hand, 0.065, 0.058)
      .fringe(R, 9, hand.x, hand.y + 0.03, hand.z, 0.06, 0.06, 0.08);
    const thigh = at(`thigh${s}`);
    const shin = at(`shin${s}`);
    const foot = at(`foot${s}`);
    on(`thigh${s}`).tube(R, 16, thigh.clone().add(V(0.01 * sg, -0.04, 0)), shin, 0.095, 0.075);
    on(`shin${s}`)
      .tube(R, 13, shin, foot.clone().add(V(0, 0.07, 0)), 0.085, 0.068)
      .fringe(R, 10, foot.x, foot.y + 0.1, foot.z, 0.085, 0.085, 0.09);
  }

  // ------------------------------------------------------------------ merge: one rigidly skinned geometry
  const geos: THREE.BufferGeometry[] = [];
  const bones = inst.skeleton.bones;
  for (const [name, parts] of perBone) {
    const g = mergeColored(parts.list);
    if (!g) continue;
    const bi = Math.max(0, bones.indexOf(inst.bones[name] as THREE.Bone));
    const n = g.getAttribute("position").count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bi;
      w[i * 4] = 1;
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(w, 4));
    geos.push(g);
  }
  const merged = mergeAll(geos);
  for (const g of geos) g.dispose();
  const suit = new THREE.SkinnedMesh(merged, mat);
  suit.name = "cusco-ukuku:suit";
  suit.castShadow = true;
  // Posed by the bones far from its bind bounds (spins, raised arms); a single dancer: never culled.
  suit.frustumCulled = false;
  suit.bind(inst.skeleton, new THREE.Matrix4());
  inst.group.add(suit);

  for (const g of Object.values(PROTO)) g.dispose();
  return {
    suit,
    dispose() {
      suit.removeFromParent();
      suit.geometry.dispose();
    },
  };
}

/** Concatenate non-indexed geometries with the same attributes (position, normal, uv, color, skin). */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const first = list[0];
  if (!first) return out;
  for (const name of Object.keys(first.attributes)) {
    const a0 = first.getAttribute(name) as THREE.BufferAttribute;
    const total = list.reduce((s, g) => s + g.getAttribute(name).count, 0);
    const arr = new (a0.array.constructor as Float32ArrayConstructor)(total * a0.itemSize);
    let o = 0;
    for (const g of list) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a0.itemSize));
  }
  return out;
}
