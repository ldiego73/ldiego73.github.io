/**
 * The ukuku's model and rig (../ukuku.ts animates it): the bear-dancer of the Qoyllur Rit'i, built from
 * primitives in the toon style of the shared people (../../../ambient/people/models.ts: hips at 0.55,
 * shoulders at 1.02, head top ≈ 1.6), a little bulkier for the costume.
 *  - The shaggy fleece is suggested by stacked, jittered low-poly lumps in four dark browns over each limb
 *    and the body, with a fringe of hanging tufts at the hem, the wrists and the ankles: the lumps break the
 *    silhouette, so the ink outline draws it shaggy.
 *  - A knitted woollen mask: white, with coloured bands, eye and mouth holes ringed in red, two tassels.
 *  - A little doll ukuku hangs on the chest, a bell at the waist, a whip in the right hand.
 * Each moving part is ONE vertex-coloured mesh (mergeColored) on one shared toon material: seven draw calls.
 */
import * as THREE from "three";
import { type ColoredPart, mergeColored } from "../../../merge-colors";

// Dark brown fleece, lifted a little so the costume still reads in the moonlit plaza (it only comes out at night).
const FLEECE = ["#4a3424", "#5b4029", "#3b2a1e", "#674a31"] as const;
const WOOL = "#f1ece0";
const RED = "#c4383f";
const GREEN = "#2a9d8f";
const YELLOW = "#e8b631";
const BLUE = "#3446a6";
const INK = "#15100d";
const GLOVE = "#d7ccb6";
const SHOE = "#241b16";
const BRASS = "#d6a43a";
const WOOD = "#6e4a2c";

/** The rig: pivots the animation drives (names match ./logic.ts Pose). */
export interface UkukuRig {
  root: THREE.Group;
  /** Hips: lift and the turn. */
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** At the right hand: spins the lash. */
  whip: THREE.Group;
  meshes: THREE.Mesh[];
  dispose(): void;
}

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

/** Unit primitives, built per model and disposed once its meshes are merged. */
const protos = () => ({
  // Smooth-shaded low-poly lumps: faceted ones drew an ink line on every facet and read as scribbles.
  lump: new THREE.SphereGeometry(1, 7, 5),
  sph: new THREE.SphereGeometry(1, 12, 9),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 5),
  box: new THREE.BoxGeometry(1, 1, 1),
});
type Protos = ReturnType<typeof protos>;

class Parts {
  list: ColoredPart[] = [];
  constructor(private P: Protos) {}
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    return this.rot(geo, color, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  rot(
    geo: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy = sx,
    sz = sx,
  ) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    const matrix = new THREE.Matrix4().compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.list.push({ geometry: geo, color: new THREE.Color(color), matrix });
    return this;
  }
  /** A thin rod between two points. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const matrix = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r, a.distanceTo(b), r));
    this.list.push({ geometry: this.P.cyl, color: new THREE.Color(color), matrix });
    return this;
  }
  /**
   * Fleece: n lumps scattered over an ellipsoid shell (centre c, half axes a), each a jittered size,
   * in the four fleece browns; `yMin` keeps them above a cut (so a limb's lumps end at its wrist).
   */
  fleece(rand: () => number, n: number, c: THREE.Vector3, a: THREE.Vector3, size: number, yMin = -Infinity) {
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = c.y + u * a.y;
      if (y < yMin) continue;
      const k = size * (0.75 + rand() * 0.5);
      this.rot(
        this.P.lump,
        FLEECE[Math.floor(rand() * FLEECE.length)] as string,
        c.x + Math.cos(th) * r * a.x,
        y,
        c.z + Math.sin(th) * r * a.z,
        rand() * 3,
        rand() * 3,
        rand() * 3,
        k,
        k * (1.1 + rand() * 0.4),
        k,
      );
    }
    return this;
  }
  /** A ring of downward tufts (the shaggy fringe) round (x, y, z) with radius r. */
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
        Math.PI + Math.sin(th) * 0.25,
        0,
        -Math.cos(th) * 0.25,
        len * 0.32,
        l,
        len * 0.32,
      );
    }
    return this;
  }
  mesh(name: string, mat: THREE.Material): THREE.Mesh {
    const geo = mergeColored(this.list) ?? new THREE.BufferGeometry();
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    this.list = [];
    return m;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Hips height at rest (the people's leg pivot, a touch higher for the bulkier costume). */
export const HIPS_Y = 0.56;
const SHOULDER_Y = 0.47;
const SHOULDER_X = 0.3;
const NECK_Y = 0.6;

export function buildUkuku(mat: THREE.Material): UkukuRig {
  const R = rng(0x0c0c0);
  const PROTO = protos();
  const P = new Parts(PROTO);
  const meshes: THREE.Mesh[] = [];
  const keep = (m: THREE.Mesh) => {
    meshes.push(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = "cusco-ukuku";
  const hips = new THREE.Group();
  hips.position.y = HIPS_Y;
  root.add(hips);

  // ------------------------------------------------------------------ torso (origin at the hips)
  const torso = new THREE.Group();
  hips.add(torso);
  // A dark core so no gap shows between the lumps, then the fleece over it, broad like a bear's.
  P.add(PROTO.sph, FLEECE[2], 0, 0.3, 0, 0.3, 0.34, 0.25);
  P.fleece(R, 46, V(0, 0.3, 0), V(0.3, 0.32, 0.25), 0.12);
  P.fleece(R, 12, V(0, 0.52, 0), V(0.3, 0.06, 0.2), 0.11);
  P.fringe(R, 18, 0, 0.04, 0, 0.29, 0.23, 0.22);
  // A woven belt (chumpi) under the fleece's lower edge, red with a yellow line.
  P.add(PROTO.cyl, RED, 0, 0.1, 0, 0.3, 0.06, 0.245);
  P.add(PROTO.cyl, YELLOW, 0, 0.1, 0, 0.305, 0.014, 0.25);
  // The little doll ukuku on the chest: a fleece blob, a white mask with black eyes, on a red cord.
  P.rod(V(-0.08, 0.5, 0.22), V(0, 0.4, 0.28), 0.008, RED).rod(V(0.08, 0.5, 0.22), V(0, 0.4, 0.28), 0.008, RED);
  P.fleece(R, 8, V(0, 0.33, 0.29), V(0.045, 0.06, 0.03), 0.035);
  P.add(PROTO.sph, FLEECE[1], 0, 0.33, 0.28, 0.05, 0.07, 0.04);
  P.add(PROTO.sph, WOOL, 0, 0.39, 0.3, 0.038, 0.04, 0.03);
  for (const s of [-1, 1]) P.add(PROTO.sph, INK, s * 0.014, 0.395, 0.327, 0.008);
  // The bell at the right of the waist, hanging from the belt.
  P.rod(V(-0.22, 0.08, 0.15), V(-0.24, -0.02, 0.17), 0.006, INK);
  P.add(PROTO.cone, BRASS, -0.24, -0.06, 0.17, 0.05, 0.08, 0.05);
  P.add(PROTO.sph, BRASS, -0.24, -0.1, 0.17, 0.018);
  torso.add(keep(P.mesh("cusco-ukuku:torso", mat)));

  // ------------------------------------------------------------------ head: the knitted mask
  const head = new THREE.Group();
  head.position.y = NECK_Y;
  torso.add(head);
  // Fleece collar where the mask meets the costume.
  P.fleece(R, 14, V(0, 0.02, 0), V(0.16, 0.03, 0.14), 0.07);
  P.add(PROTO.sph, WOOL, 0, 0.2, 0, 0.17, 0.2, 0.175);
  // Knitted bands round the mask (slightly proud of it), a zigzag of coloured stitches on the brow.
  P.add(PROTO.cyl, RED, 0, 0.3, 0, 0.152, 0.03, 0.157);
  P.add(PROTO.cyl, GREEN, 0, 0.05, 0, 0.145, 0.03, 0.15);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    const c = [YELLOW, BLUE, RED][i % 3] as string;
    P.rot(PROTO.box, c, Math.sin(a) * 0.15, 0.255, Math.cos(a) * 0.155, 0, a, Math.PI / 4, 0.03, 0.03, 0.02);
  }
  // Eye holes and the mouth hole, each ringed in red stitches; a little knitted nose.
  for (const s of [-1, 1]) {
    P.rot(PROTO.sph, RED, s * 0.062, 0.19, 0.152, 0, s * 0.35, 0, 0.042, 0.036, 0.02);
    P.rot(PROTO.sph, INK, s * 0.062, 0.19, 0.163, 0, s * 0.35, 0, 0.027, 0.022, 0.012);
  }
  P.add(PROTO.sph, RED, 0, 0.085, 0.166, 0.04, 0.022, 0.016);
  P.add(PROTO.sph, INK, 0, 0.085, 0.176, 0.026, 0.011, 0.01);
  P.add(PROTO.sph, WOOL, 0, 0.14, 0.178, 0.022, 0.03, 0.02);
  // Two woollen tassels on top, the ukuku's tufts.
  for (const s of [-1, 1]) {
    P.rod(V(s * 0.06, 0.37, 0), V(s * 0.11, 0.46, -0.02), 0.012, s < 0 ? RED : YELLOW);
    P.add(PROTO.sph, s < 0 ? RED : GREEN, s * 0.115, 0.47, -0.02, 0.04);
  }
  head.add(keep(P.mesh("cusco-ukuku:head", mat)));

  // ------------------------------------------------------------------ arms (pivot at the shoulder)
  const arm = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    torso.add(g);
    P.add(PROTO.sph, FLEECE[2], 0, -0.22, 0, 0.09, 0.27, 0.09);
    P.fleece(R, 16, V(0, -0.22, 0), V(0.1, 0.26, 0.1), 0.09, -0.46);
    P.fringe(R, 9, 0, -0.42, 0, 0.09, 0.09, 0.1);
    // A woollen glove.
    P.add(PROTO.sph, GLOVE, 0, -0.52, 0.01, 0.065, 0.075, 0.06);
    return g;
  };
  const armL = arm(1);
  armL.add(keep(P.mesh("cusco-ukuku:arm-l", mat)));
  const armR = arm(-1);
  armR.add(keep(P.mesh("cusco-ukuku:arm-r", mat)));

  // The whip: a short wooden handle forward from the right fist and a braided lash curling down and out,
  // a red tassel at the tip. It spins round the arm's axis (the rig's `whip`).
  const whip = new THREE.Group();
  whip.position.set(0, -0.52, 0.02);
  armR.add(whip);
  const pts: THREE.Vector3[] = [V(0, -0.02, 0.04), V(0, -0.07, 0.3)];
  // The lash: 9 segments, 1.1 u long, arcing out (z) and to the side (x), falling (y).
  for (let i = 1; i <= 9; i++) {
    const s = i / 9;
    pts.push(V(Math.sin(s * Math.PI) * 0.22, -0.07 - 0.5 * s ** 1.6, 0.3 + 0.75 * s));
  }
  P.rod(pts[0] as THREE.Vector3, pts[1] as THREE.Vector3, 0.022, WOOD);
  for (let i = 1; i < pts.length - 1; i++)
    P.rod(pts[i] as THREE.Vector3, pts[i + 1] as THREE.Vector3, 0.013 - i * 0.0006, i % 2 ? WOOL : INK);
  const tip = pts[pts.length - 1] as THREE.Vector3;
  P.add(PROTO.cone, RED, tip.x, tip.y - 0.04, tip.z, 0.03, 0.09, 0.03);
  whip.add(keep(P.mesh("cusco-ukuku:whip", mat)));

  // ------------------------------------------------------------------ legs (pivot at the hip)
  const leg = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.13, 0.02, 0);
    hips.add(g);
    P.add(PROTO.sph, FLEECE[2], 0, -0.22, 0, 0.11, 0.26, 0.11);
    P.fleece(R, 14, V(0, -0.24, 0), V(0.12, 0.22, 0.12), 0.095, -0.44);
    P.fringe(R, 9, 0, -0.4, 0, 0.11, 0.11, 0.1);
    P.add(PROTO.box, SHOE, 0, -0.53, 0.04, 0.14, 0.07, 0.25);
    return g;
  };
  const legL = leg(1);
  legL.add(keep(P.mesh("cusco-ukuku:leg-l", mat)));
  const legR = leg(-1);
  legR.add(keep(P.mesh("cusco-ukuku:leg-r", mat)));
  for (const g of Object.values(PROTO)) g.dispose();

  return {
    root,
    hips,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    whip,
    meshes,
    dispose() {
      root.removeFromParent();
      for (const m of meshes) m.geometry.dispose();
    },
  };
}
