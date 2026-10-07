/**
 * Host trees the tree-dwelling fauna bring with them, so every monkey, sloth, toucan and macaw sits on a
 * real branch (the forest scenery is owned elsewhere and publishes no perches). Built in world space into a
 * GeoBuilder: the owner merges all its trees into ONE static vertex-colored mesh (one draw call).
 *  - cecropia (yarumo / "cetico"): slender pale trunk, candelabra limbs, umbrellas of palmate leaves; the
 *    sloths' tree, and toucans eat its catkins;
 *  - broad: a spreading fruiting canopy tree (shimbillo / fig-like) with lumpy crowns, optional fruit;
 *  - snag: a tall dead emergent (shihuahuaco snag) above the canopy where macaw pairs perch.
 * Each returns its perch limbs (segments the animals walk, sit or hang on) and crown centers.
 */
import * as THREE from "three";
import type { GeoBuilder } from "../../../flora/geom";
import { tube } from "./kit";

export interface LimbSeg {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** Radius at the base (perching animals sit on top: y + r). */
  r: number;
}

export interface HostTree {
  x: number;
  z: number;
  y0: number;
  top: number;
  limbs: LimbSeg[];
  crowns: Array<{ x: number; y: number; z: number; r: number }>;
}

/** Point at u along a limb (top surface when `onTop`, underside when `under`). */
export function limbPoint(l: LimbSeg, u: number, out: { x: number; y: number; z: number }, place: 0 | 1 | -1 = 1) {
  out.x = l.ax + (l.bx - l.ax) * u;
  out.z = l.az + (l.bz - l.az) * u;
  const r = l.r * (1 - u * 0.5);
  out.y = l.ay + (l.by - l.ay) * u + place * r;
  return out;
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();

/** Lumpy foliage blob (icosahedron with deterministic jitter), colored by height (lighter on top). */
function blob(r: number, x: number, y: number, z: number, R: () => number, dark: string, light: string, flat = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  // Jitter by position (the geometry is non-indexed: shared corners must move together, no cracks).
  const seed = R() * 100;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const hsh = Math.sin(vx * 12.9898 + vy * 78.233 + vz * 37.719 + seed) * 43758.5453;
    const k = 0.82 + (hsh - Math.floor(hsh)) * 0.3;
    p.setXYZ(i, vx * k, vy * k * flat, vz * k);
  }
  g.deleteAttribute("normal");
  g.computeVertexNormals();
  g.translate(x, y, z);
  const a = new THREE.Color(dark);
  const b = new THREE.Color(light);
  return {
    g,
    color: (q: THREE.Vector3, n: THREE.Vector3) =>
      _c.copy(a).lerp(b, Math.max(0, Math.min(1, 0.5 + n.y * 0.5 + (q.y - y) / (r * 3)))),
  };
}

function addTube(
  b: GeoBuilder,
  r0: number,
  r1: number,
  a: [number, number, number],
  c: [number, number, number],
  color: string,
  seg = 6,
) {
  b.add(tube(r0, r1, a[0], a[1], a[2], c[0], c[1], c[2], seg), { color });
}

/**
 * Cecropia. `limbs[0]` is a near-horizontal limb at height `hang` reaching toward `dir` (yaw, radians):
 * the sloth hangs under it.
 */
export function cecropia(
  b: GeoBuilder,
  x: number,
  y0: number,
  z: number,
  h: number,
  R: () => number,
  o: { hang: number; dir: number; reach?: number },
): HostTree {
  const bark = "#cfc8b6";
  const ring = "#a9a291";
  const limbs: LimbSeg[] = [];
  const crowns: HostTree["crowns"] = [];
  // Trunk in three slightly kinked segments with darker leaf-scar rings.
  let px = x;
  let pz = z;
  let py = y0 - 0.3;
  const segs = 3;
  for (let s = 0; s < segs; s++) {
    const nx = x + (R() - 0.5) * 0.5;
    const nz = z + (R() - 0.5) * 0.5;
    const ny = y0 + (h * (s + 1)) / segs;
    const r0 = 0.24 - s * 0.05;
    addTube(b, r0, r0 - 0.04, [px, py, pz], [nx, ny, nz], bark, 7);
    for (let k = 1; k < 4; k++) {
      const u = k / 4;
      const ry = py + (ny - py) * u;
      const rr = r0 - 0.04 * u + 0.012;
      const g = new THREE.CylinderGeometry(rr, rr, 0.05, 7, 1);
      g.translate(px + (nx - px) * u, ry, pz + (nz - pz) * u);
      b.add(g, { color: ring });
    }
    px = nx;
    pz = nz;
    py = ny;
  }
  // The hanging limb (sloth): from the trunk at `hang`, nearly level, a slight rise to the tip.
  const reach = o.reach ?? 3.2;
  const hx = x + Math.sin(o.dir) * reach;
  const hz = z + Math.cos(o.dir) * reach;
  const hang: LimbSeg = { ax: x, ay: y0 + o.hang, az: z, bx: hx, by: y0 + o.hang + 0.35, bz: hz, r: 0.11 };
  addTube(b, 0.12, 0.07, [hang.ax, hang.ay, hang.az], [hang.bx, hang.by, hang.bz], bark, 6);
  limbs.push(hang);
  // Leaf umbrella at the end of the hanging limb, and candelabra limbs up top, each with an umbrella.
  const umbrellas: Array<[number, number, number, number]> = [[hx, hang.by + 0.25, hz, 1.1]];
  const nTop = 3 + Math.floor(R() * 2);
  for (let i = 0; i < nTop; i++) {
    const a = (i / nTop) * Math.PI * 2 + R() * 0.8;
    const out = 1.3 + R() * 1.2;
    const sy = y0 + h * (0.78 + R() * 0.1);
    const ex = px + Math.sin(a) * out;
    const ez = pz + Math.cos(a) * out;
    const ey = y0 + h + 0.6 + R() * 1.4;
    const mx = (px + ex) / 2;
    const mz = (pz + ez) / 2;
    addTube(b, 0.09, 0.06, [px, sy, pz], [mx, sy + (ey - sy) * 0.3, mz], bark, 5);
    addTube(b, 0.06, 0.045, [mx, sy + (ey - sy) * 0.3, mz], [ex, ey, ez], bark, 5);
    limbs.push({ ax: px, ay: sy, az: pz, bx: mx, by: sy + (ey - sy) * 0.3, bz: mz, r: 0.08 });
    umbrellas.push([ex, ey, ez, 1.2 + R() * 0.4]);
  }
  // Palmate leaves: each umbrella is a ring of 7 deeply lobed leaves, green on top, silvery below.
  for (const [ux, uy, uz, s] of umbrellas) {
    crowns.push({ x: ux, y: uy, z: uz, r: s * 1.3 });
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.3;
      const leaf = new THREE.PlaneGeometry(0.42 * s, 1.15 * s, 1, 2);
      // Droop: the far end bends down.
      const p = leaf.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const v = p.getY(k) / (1.15 * s) + 0.5;
        p.setZ(k, -v * v * 0.45 * s);
        if (v > 0.45 && v < 0.6) p.setX(k, p.getX(k) * 1.35);
      }
      leaf.computeVertexNormals();
      leaf.translate(0, 0.55 * s, 0);
      leaf.rotateX(-Math.PI / 2 + 0.25);
      leaf.rotateY(a);
      leaf.translate(ux, uy, uz);
      b.add(leaf, { color: R() < 0.3 ? "#6f9a52" : "#4f8f3a" });
    }
    const cap = new THREE.SphereGeometry(0.14 * s, 6, 4);
    cap.translate(ux, uy + 0.05, uz);
    b.add(cap, { color: "#7c9d4a" });
  }
  return { x, z, y0, top: y0 + h + 2, limbs, crowns };
}

/** Spreading canopy tree with `nLimbs` limbs ending in lumpy crowns; `fruit` scatters fruit clusters. */
export function broadTree(
  b: GeoBuilder,
  x: number,
  y0: number,
  z: number,
  h: number,
  R: () => number,
  o: {
    nLimbs?: number;
    fruit?: string;
    spread?: number;
    /** Yaw toward the road: the first two limbs reach that way, low and long (fauna perches over the edge). */
    toward?: number;
  } = {},
): HostTree {
  const bark = "#6b5642";
  const limbs: LimbSeg[] = [];
  const crowns: HostTree["crowns"] = [];
  const fork = y0 + h * 0.55;
  addTube(b, 0.42, 0.3, [x, y0 - 0.4, z], [x, fork, z], bark, 8);
  // Buttress flanges at the foot.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + R() * 0.6;
    const g = new THREE.BoxGeometry(0.08, 1.4, 1.2);
    g.translate(0, 0.5, 0.55);
    g.rotateY(a);
    g.translate(x, y0 - 0.2, z);
    b.add(g, { color: "#5d4a38" });
  }
  const n = o.nLimbs ?? 4;
  const spread = o.spread ?? 1;
  for (let i = 0; i < n; i++) {
    const reach = o.toward !== undefined && i < 2;
    const a = reach ? (o.toward as number) + (i ? 0.45 : -0.45) + (R() - 0.5) * 0.2 : (i / n) * Math.PI * 2 + R() * 0.7;
    const out = reach ? 3.3 + R() * 0.6 : (2.4 + R() * 1.6) * spread;
    const ex = x + Math.sin(a) * out;
    const ez = z + Math.cos(a) * out;
    const ey = fork + h * (reach ? 0.06 + R() * 0.06 : 0.22 + R() * 0.15);
    addTube(b, 0.2, 0.1, [x, fork - 0.2, z], [ex, ey, ez], bark, 6);
    limbs.push({ ax: x, ay: fork - 0.2, az: z, bx: ex, by: ey, bz: ez, r: 0.15 });
    // Crown over the limb tip, a little outward and above. A road-reaching limb keeps its tip clear (the
    // animals perch there in sight) with a smaller crown over its inner half instead.
    const cr = reach ? 1.25 + R() * 0.3 : 1.7 + R() * 0.8;
    const cx = reach ? x + (ex - x) * 0.4 : ex + Math.sin(a) * 0.4;
    const cz = reach ? z + (ez - z) * 0.4 : ez + Math.cos(a) * 0.4;
    const cy = reach ? fork + (ey - fork) * 0.4 + 1.7 : ey + cr * 0.55;
    const bl = blob(cr, cx, cy, cz, R, "#2f5e2a", "#5f9a3c");
    b.add(bl.g, { color: bl.color });
    crowns.push({ x: cx, y: cy, z: cz, r: cr });
    if (o.fruit) {
      for (let k = 0; k < 5; k++) {
        const fa = R() * Math.PI * 2;
        const fr = cr * (0.75 + R() * 0.2);
        const f = new THREE.IcosahedronGeometry(0.11 + R() * 0.05, 0);
        f.translate(cx + Math.sin(fa) * fr, cy - cr * (0.1 + R() * 0.4), cz + Math.cos(fa) * fr);
        b.add(f, { color: _c2.set(o.fruit).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.1) });
      }
    }
  }
  const top = blob(2.1, x, fork + h * 0.62, z, R, "#2c5a28", "#579236");
  b.add(top.g, { color: top.color });
  crowns.push({ x, y: fork + h * 0.62, z, r: 2.1 });
  return { x, z, y0, top: fork + h * 0.62 + 2, limbs, crowns };
}

/** Dead emergent snag: tall bare trunk with a few bare branches above the canopy. */
export function snag(b: GeoBuilder, x: number, y0: number, z: number, h: number, R: () => number): HostTree {
  const bark = "#a39a8c";
  const limbs: LimbSeg[] = [];
  addTube(b, 0.6, 0.32, [x, y0 - 0.5, z], [x, y0 + h * 0.75, z], bark, 8);
  addTube(b, 0.32, 0.14, [x, y0 + h * 0.75, z], [x + 0.4, y0 + h, z - 0.2], bark, 6);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + R() * 0.9;
    const sy = y0 + h * (0.68 + i * 0.07);
    const out = 2.2 + R() * 1.4;
    const ex = x + Math.sin(a) * out;
    const ez = z + Math.cos(a) * out;
    const ey = sy + 0.8 + R() * 1.2;
    addTube(b, 0.16, 0.07, [x, sy, z], [ex, ey, ez], bark, 5);
    limbs.push({ ax: x, ay: sy, az: z, bx: ex, by: ey, bz: ez, r: 0.13 });
  }
  return { x, z, y0, top: y0 + h, limbs, crowns: [] };
}
