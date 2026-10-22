/**
 * The ukuku's costume (../ukuku.ts dresses a person in it): the bear-dancer of the Qoyllur Rit'i is a person
 * from the shared characters (../../../characters: a continuous skinned body, the human animation controller)
 * in a dark shaggy fleece suit, a knitted woollen mask, a little doll ukuku on the chest, a bell at the waist and
 * a whip in the right hand. The characters core has no fleece suit or knitted mask (no `HumanSpec` option), so
 * the costume is world-local geometry that rides the person's own skeleton:
 *  - Fleece, mask, doll and bell: stacked, jittered low-poly lumps in four dark browns scattered over each limb
 *    segment and the body (the lumps break the silhouette, so the ink outline draws it shaggy), a fringe of
 *    hanging tufts at the hem, the wrists and the ankles, the mask's bands, eye and mouth holes ringed in red and
 *    two tassels. Every part is rigidly skinned to ONE bone of the person (skinIndex = that bone, weight 1), so
 *    the whole costume is ONE SkinnedMesh on the body's Skeleton: one draw call, posed by the same bones.
 *  - The whip: its own small mesh parented to the right hand bone, so the ambient can spin the lash about the
 *    hand (one draw call).
 * Coordinates are the body's model space at the bind pose (world aligned, feet at the origin, facing +Z, left
 * = +X), in traveler units scaled by the person's size `k` (../../../characters/human.ts proportions: hips 0.8,
 * chest 1.04, head centre 1.43 with radii ≈ 0.22).
 */
import * as THREE from "three";
import type { Human } from "../../../characters/hero";
import { type ColoredPart, mergeColored } from "../../../merge-colors";

/** Dark brown fleece, lifted a little so the costume still reads in the moonlit plaza (it only comes out at night). */
export const FLEECE = ["#4a3424", "#5b4029", "#3b2a1e", "#674a31"] as const;
const WOOL = "#f1ece0";
const RED = "#c4383f";
const GREEN = "#2a9d8f";
const YELLOW = "#e8b631";
const BLUE = "#3446a6";
const INK = "#15100d";
const BRASS = "#d6a43a";
const WOOD = "#6e4a2c";
/** The person under the suit: gloved hands (skin slot), fleece-brown trousers and top, dark boots. */
export const GLOVE = "#d7ccb6";
export const SHOE = "#241b16";

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

export interface Costume {
  /** The fleece suit, mask, doll and bell: one SkinnedMesh on the person's skeleton. */
  suit: THREE.SkinnedMesh;
  /** The whip, a child of the right hand bone: spin it with `whip.rotation.y`. */
  whip: THREE.Mesh;
  dispose(): void;
}

/** Dress a person (createHuman, any LOD: the skeleton is the same at every LOD) in the ukuku's costume. */
export function dressUkuku(human: Human, mat: THREE.Material): Costume {
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
  // A woven belt (chumpi) under the fleece, red with a yellow line; the bell hangs at the right of the waist.
  on("hips")
    .add(PROTO.cyl, RED, 0, 0.875, 0, 0.19, 0.04, 0.155)
    .add(PROTO.cyl, YELLOW, 0, 0.875, 0, 0.193, 0.01, 0.158)
    .rod(V(-0.15, 0.86, 0.1), V(-0.16, 0.78, 0.12), 0.005, INK)
    .add(PROTO.cone, BRASS, -0.16, 0.75, 0.12, 0.035, 0.06, 0.035)
    .add(PROTO.sph, BRASS, -0.16, 0.715, 0.12, 0.013);
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
  // The little doll ukuku on the chest: a fleece blob with a white mask and black eyes, on a red cord.
  on("chest")
    .rod(V(-0.07, 1.17, 0.12), V(0, 1.08, 0.17), 0.006, RED)
    .rod(V(0.07, 1.17, 0.12), V(0, 1.08, 0.17), 0.006, RED)
    .add(PROTO.sph, FLEECE[1], 0, 1.02, 0.175, 0.04, 0.055, 0.03)
    .shell(R, 7, V(0, 1.02, 0.18), V(0.035, 0.045, 0.022), 0.028)
    .add(PROTO.sph, WOOL, 0, 1.07, 0.19, 0.03, 0.032, 0.022)
    .add(PROTO.sph, INK, 0.011, 1.074, 0.21, 0.006)
    .add(PROTO.sph, INK, -0.011, 1.074, 0.21, 0.006);

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

  // ------------------------------------------------------------------ head: the knitted mask
  const hc = at("head").add(V(0, 0.15, 0)); // the head's centre (human.ts: 0.15 above the head bone)
  const mr = V(0.245, 0.235, 0.228);
  const mz = 0.012;
  const head = on("head");
  head.add(PROTO.sph, WOOL, hc.x, hc.y, hc.z + mz, mr.x, mr.y, mr.z);
  /** A point on the mask's surface at (x, y) in front (z from the ellipsoid), pushed out by `out`. */
  const front = (x: number, y: number, out: number) => {
    const u = 1 - (x / mr.x) ** 2 - ((y - hc.y) / mr.y) ** 2;
    return hc.z + mz + mr.z * Math.sqrt(Math.max(0, u)) + out;
  };
  // Knitted bands round the mask (slightly proud of it): red on the crown, green round the chin.
  const band = (y: number, h: number, color: string) => {
    const f = Math.sqrt(Math.max(0, 1 - ((y - hc.y) / mr.y) ** 2));
    head.add(PROTO.cyl, color, hc.x, y, hc.z + mz, mr.x * f * 1.04, h, mr.z * f * 1.04);
  };
  band(hc.y + 0.14, 0.03, RED);
  band(hc.y - 0.17, 0.03, GREEN);
  // A zigzag of coloured stitches across the brow.
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    const y = hc.y + 0.1;
    const f = Math.sqrt(Math.max(0, 1 - ((y - hc.y) / mr.y) ** 2));
    head.rot(
      PROTO.box,
      [YELLOW, BLUE, RED][i % 3] as string,
      hc.x + Math.sin(a) * mr.x * f,
      y,
      hc.z + mz + Math.cos(a) * mr.z * f,
      [0, a, Math.PI / 4],
      [0.032, 0.032, 0.02],
    );
  }
  // Eye holes and the mouth hole, each ringed in red stitches; a little knitted nose.
  for (const s of [-1, 1]) {
    const x = s * 0.085;
    const y = hc.y + 0.01;
    head.rot(PROTO.sph, RED, x, y, front(x, y, -0.008), [0, s * 0.35, 0], [0.052, 0.044, 0.022]);
    head.rot(PROTO.sph, INK, x, y, front(x, y, -0.001), [0, s * 0.35, 0], [0.034, 0.028, 0.014]);
  }
  const my = hc.y - 0.105;
  head.add(PROTO.sph, RED, 0, my, front(0, my, -0.008), 0.05, 0.028, 0.02);
  head.add(PROTO.sph, INK, 0, my, front(0, my, -0.001), 0.033, 0.014, 0.012);
  const ny = hc.y - 0.04;
  head.add(PROTO.sph, WOOL, 0, ny, front(0, ny, 0.004), 0.026, 0.034, 0.024);
  // Two woollen tassels on top, the ukuku's tufts.
  for (const s of [-1, 1]) {
    const top = hc.y + mr.y * 0.92;
    head.rod(V(s * 0.08, top, 0), V(s * 0.15, top + 0.11, -0.02), 0.014, s < 0 ? RED : YELLOW);
    head.add(PROTO.sph, s < 0 ? RED : GREEN, s * 0.155, top + 0.12, -0.02, 0.045);
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

  // ------------------------------------------------------------------ the whip (hand bone frame)
  // A short wooden handle forward from the fist and a braided lash curling down and out, a red tassel at the
  // tip. In the hand's frame +y runs up the forearm, so spinning about y circles the lash round the arm.
  const W = new Parts(PROTO, k);
  const fist = V(0, -0.07, 0.02);
  const pts: THREE.Vector3[] = [fist.clone().add(V(0, -0.01, 0.03)), fist.clone().add(V(0, -0.05, 0.27))];
  for (let i = 1; i <= 9; i++) {
    const s = i / 9;
    pts.push(fist.clone().add(V(Math.sin(s * Math.PI) * 0.2, -0.05 - 0.45 * s ** 1.6, 0.27 + 0.7 * s)));
  }
  W.rod(pts[0] as THREE.Vector3, pts[1] as THREE.Vector3, 0.02, WOOD);
  for (let i = 1; i < pts.length - 1; i++)
    W.rod(pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, 0.012 - i * 0.0006, i % 2 ? WOOL : INK);
  const tip = pts[pts.length - 1] as THREE.Vector3;
  W.add(PROTO.cone, RED, tip.x, tip.y - 0.04, tip.z, 0.028, 0.08, 0.028);
  const whip = new THREE.Mesh(mergeColored(W.list) ?? new THREE.BufferGeometry(), mat);
  whip.name = "cusco-ukuku:whip";
  whip.castShadow = true;
  inst.bones.handR?.add(whip);

  for (const g of Object.values(PROTO)) g.dispose();
  return {
    suit,
    whip,
    dispose() {
      suit.removeFromParent();
      whip.removeFromParent();
      suit.geometry.dispose();
      whip.geometry.dispose();
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
