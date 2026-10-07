/**
 * Procedural low-poly plants of the lowland Amazon, one merged vertex-colored geometry per species (local
 * origin at the foot, +Y up, world units with the avatar ≈ 1.7 tall). Every geometry carries a `flex`
 * attribute (wind sway weight, see kit.ts swayMaterial) so leaves move and the ink follows them.
 *
 *  - ceiba / lupuna ≈ 26: buttress-root fins, pale trunk, horizontal limbs, flat emergent umbrella crown,
 *    hanging lianas and bromeliads on the limbs
 *  - broadleaf ("moena") ≈ 13: round lumpy crown; tiered ("shihuahuaco") ≈ 17: tall trunk, layered crowns
 *  - cecropia (cetico) ≈ 11: pale ringed candelabra with silvery hand-shaped leaves (river pioneer)
 *  - aguaje (Mauritia) ≈ 12: grey column with a ball of pleated fan leaves
 *  - huasaí (Euterpe) ≈ 10: clump of slender stems with red crownshafts and drooping feather fronds
 *  - shapaja (Attalea) ≈ 8: short stout trunk with huge arching fronds
 *  - banana / platanillo ≈ 3.6, heliconia ≈ 2.2 with red-yellow lobster-claw bracts, shrub, fern
 *  - liana curtain (hangs from ≈ 9 u), caña brava reeds ≈ 3.4, victoria regia pad (+ flower variant)
 * Sizes stay modest in triangles: thousands of instances are on screen along the road.
 */
import * as THREE from "three";
import { arcPath, blob, GeoBuilder, leafShade, tube } from "./kit";
import { rng } from "./placement";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const GOLDEN = 2.39996;
const UP = V(0, 1, 0);
const _c = new THREE.Color();

type ColorAt = (s: number, side: number) => THREE.Color;

/**
 * Leaf strip along a path: width profile `w(s)`, 3 vertices across (edge, midrib, edge). `fold` drops the
 * edges below the midrib (× width) for a drooping ∧ section that reads in toon light. Flat-ish, so the
 * material renders both sides.
 */
export function strip(
  pts: THREE.Vector3[],
  w: (s: number) => number,
  o: { fold?: number; color: ColorAt; flex: (s: number) => number },
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const flx: number[] = [];
  const idx: number[] = [];
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)] as THREE.Vector3;
    const b = pts[Math.min(n - 1, k + 1)] as THREE.Vector3;
    t.subVectors(b, a).normalize();
    side.crossVectors(t, Math.abs(t.y) > 0.95 ? V(1, 0, 0) : UP).normalize();
    nrm.crossVectors(side, t).normalize();
    const p = pts[k] as THREE.Vector3;
    const s = k / (n - 1);
    const ww = w(s);
    const drop = (o.fold ?? 0.3) * ww;
    for (const sd of [-1, 0, 1]) {
      const e = sd === 0 ? 0 : 1;
      pos.push(
        p.x + side.x * ww * sd - nrm.x * drop * e,
        p.y + side.y * ww * sd - nrm.y * drop * e,
        p.z + side.z * ww * sd - nrm.z * drop * e,
      );
      const c = o.color(s, sd);
      col.push(c.r, c.g, c.b);
      flx.push(o.flex(s));
    }
  }
  for (let k = 0; k < n - 1; k++) {
    const r0 = k * 3;
    const r1 = r0 + 3;
    idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1, r0 + 1, r0 + 2, r1 + 1, r0 + 2, r1 + 2, r1 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("flex", new THREE.Float32BufferAttribute(flx, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Arching path from `base`: heads out along yaw `a`, rising at `rise` (rad above horizontal), drooping by `droop`. */
function arch(base: THREE.Vector3, a: number, len: number, rise: number, droop: number, segs: number) {
  const pts = [base.clone()];
  const p = base.clone();
  const step = len / segs;
  for (let k = 1; k <= segs; k++) {
    const el = rise - droop * (k / segs) ** 1.4;
    p.x += Math.cos(a) * Math.cos(el) * step;
    p.z += Math.sin(a) * Math.cos(el) * step;
    p.y += Math.sin(el) * step;
    pts.push(p.clone());
  }
  return pts;
}

const lerpC = (a: string, b: string) => {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return (t: number) => _c.copy(ca).lerp(cb, Math.min(1, Math.max(0, t)));
};

/** Bark color by (height s, angle u): base with vertical lighter / darker streaks. */
function bark(base: string, light: string, dark: string, freq = 1) {
  const cb = new THREE.Color(base);
  const cl = new THREE.Color(light);
  const cd = new THREE.Color(dark);
  return (s: number, u: number) => {
    const n = Math.sin(u * 6.283 * 3 + s * 2 * freq) * Math.cos(u * 6.283 * 2 - s * 5 * freq);
    return _c.copy(n > 0.5 ? cl : n < -0.5 ? cd : cb);
  };
}

/** Crown clump (lumpy blob) with leaf shading; sways a little at its top. */
function clump(
  b: GeoBuilder,
  c: THREE.Vector3,
  r: number,
  sy: number,
  seed: number,
  shade: ReturnType<typeof leafShade>,
  detail: number,
  flex = 0.04,
) {
  const g = blob(r, sy, seed, detail);
  g.translate(c.x, c.y, c.z);
  b.add(g, { color: shade, flex: (p) => Math.max(0, p.y - c.y + r) * flex });
}

/** Bromeliad rosette (green → red tips) at p. */
function bromeliad(b: GeoBuilder, p: THREE.Vector3, size: number, R: () => number, tip = "#d2382d") {
  const col = lerpC("#4c8a3a", tip);
  for (let k = 0; k < 6; k++) {
    const pts = arcPath(p, k * GOLDEN + R(), size * (0.8 + R() * 0.4), 0.55 + R() * 0.35, 0.6, 2);
    b.add(tube(pts, [size * 0.16, size * 0.1, 0.01], 3, { tip: true, color: (t) => col(t * t) }), { flex: 0 });
  }
}

/** Hanging liana: from `top` down `len`, swinging slightly, with a few leaves. */
function liana(b: GeoBuilder, top: THREE.Vector3, len: number, R: () => number, leaves: number, r = 0.05) {
  const pts: THREE.Vector3[] = [];
  const segs = 6;
  const sx = (R() - 0.5) * 0.8;
  const sz = (R() - 0.5) * 0.8;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    pts.push(V(top.x + Math.sin(t * 3) * sx, top.y - len * t, top.z + Math.sin(t * 2.4 + 1) * sz));
  }
  b.add(
    tube(
      pts,
      pts.map(() => r),
      3,
      { tip: false, color: () => _c.set("#5a4a2c"), flex: (s) => s * s * 0.25 },
    ),
  );
  const leaf = lerpC("#2f6a2c", "#5d9a3e");
  for (let k = 0; k < leaves; k++) {
    const t = 0.2 + R() * 0.75;
    const p = V(top.x + Math.sin(t * 3) * sx, top.y - len * t, top.z + Math.sin(t * 2.4 + 1) * sz);
    const g = new THREE.OctahedronGeometry(0.16, 0);
    g.scale(1.4, 0.35, 0.8);
    g.rotateY(R() * 6.28);
    g.rotateZ(0.5);
    g.translate(p.x, p.y, p.z);
    b.add(g, { color: leaf(R()), flex: t * t * 0.25 });
  }
}

// ---------------------------------------------------------------- trees

/** Ceiba / lupuna: the emergent landmark (≈ 26 u, crown ≈ 20 u wide). */
export function ceibaModel(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(301);
  const barkC = bark("#b8b0a0", "#d2cbbb", "#8f877a", 1.2);
  const trunk: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    trunk.push(V(Math.sin(t * 2.2) * 0.4, 20 * t, Math.cos(t * 1.7) * 0.3 - 0.3));
  }
  b.add(tube(trunk, [1.55, 1.25, 1.1, 1.0, 0.92, 0.85, 0.8], 9, { tip: false, color: barkC }));
  // Buttress roots: tall thin fins flaring from the trunk (the lupuna's planks).
  const fins = 6;
  for (let f = 0; f < fins; f++) {
    const a = (f / fins) * Math.PI * 2 + R() * 0.4;
    const reach = 3.6 + R() * 1.4;
    const tall = 3.8 + R() * 1.6;
    const shape = new THREE.Shape();
    shape.moveTo(0.6, 0);
    shape.lineTo(reach, 0);
    shape.quadraticCurveTo(reach * 0.45, 0.2, 1.1, tall);
    shape.lineTo(0.6, tall + 0.4);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 3 });
    g.translate(0, -0.25, -0.15);
    g.rotateY(-a);
    b.add(g, { color: f % 2 ? "#aea695" : "#a29a89", flex: 0 });
  }
  // Limbs: thick, nearly horizontal, rising at the ends; the umbrella crown sits on them.
  const shade = leafShade("#24481f", "#3a6d2c", "#6ea443");
  const top = trunk[6] as THREE.Vector3;
  const limbs = 6;
  const ends: THREE.Vector3[] = [];
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + R() * 0.5;
    const from = (trunk[5] as THREE.Vector3).clone().lerp(top, R());
    const lp = arcPath(from, a, 8.5 + R() * 2, 1.25, -0.5, 4);
    b.add(tube(lp, [0.6, 0.45, 0.35, 0.26, 0.2], 6, { tip: false, color: barkC }));
    const end = lp[4] as THREE.Vector3;
    ends.push(end);
    clump(b, V(end.x, end.y + 1.4, end.z), 3.4 + R() * 0.8, 0.42, 310 + l, shade, lite ? 0 : 1, 0.02);
    // Bromeliads on the limb near the trunk, a liana hanging from its middle.
    bromeliad(b, (lp[1] as THREE.Vector3).clone().add(V(0, 0.4, 0)), 0.7, R, l % 2 ? "#d2382d" : "#e8a236");
    if (l % 2 === 0) liana(b, lp[2] as THREE.Vector3, 9 + R() * 5, R, lite ? 2 : 5, 0.08);
  }
  clump(b, V(top.x, top.y + 2.6, top.z), 4.6, 0.45, 320, shade, lite ? 0 : 1, 0.02);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    clump(
      b,
      V(top.x + Math.cos(a) * 4.5, top.y + 2.2, top.z + Math.sin(a) * 4.5),
      3.2,
      0.42,
      330 + k,
      shade,
      lite ? 0 : 1,
      0.02,
    );
  }
  // A strangler's root net and bromeliads up the trunk.
  for (let k = 0; k < 3; k++) bromeliad(b, (trunk[2 + k] as THREE.Vector3).clone().add(V(1.0, 0, 0.2 * k)), 0.5, R);
  return b.build({ flex: true });
}

/** Broadleaf canopy tree ("moena"): straight trunk, three limbs, lumpy round crown, a liana. */
export function broadleafModel(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(401);
  const barkC = bark("#6d5843", "#8e7a62", "#4f4031");
  const trunk = [V(0, 0, 0), V(0.1, 3, 0), V(-0.1, 6, 0.1), V(0, 8.2, 0)];
  b.add(tube(trunk, [0.45, 0.36, 0.3, 0.24], 6, { tip: false, color: barkC }));
  const shade = leafShade("#1f4420", "#336b2c", "#5f9a3d");
  const d = lite ? 0 : 1;
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * Math.PI * 2 + R() * 0.6;
    const lp = arcPath(trunk[2] as THREE.Vector3, a, 3.2, 0.9, -0.3, 2);
    b.add(tube(lp, [0.2, 0.14, 0.1], 5, { tip: false, color: barkC }));
    const e = lp[2] as THREE.Vector3;
    clump(b, V(e.x, e.y + 1.4, e.z), 2.3 + R() * 0.5, 0.7, 410 + l, shade, d);
  }
  clump(b, V(0, 10.6, 0), 2.9, 0.75, 420, shade, d);
  clump(b, V(1.2, 9.0, -1.4), 2.0, 0.7, 421, shade, 0);
  liana(b, V(1.6, 9.2, 0.8), 6.5, R, lite ? 2 : 4);
  bromeliad(b, V(0.35, 4.5, 0.1), 0.45, R);
  return b.build({ flex: true });
}

/** Tiered emergent ("shihuahuaco"): tall clean trunk, three flat crown layers. */
export function tieredModel(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(451);
  const barkC = bark("#8a7a66", "#a8987f", "#62553f");
  const trunk = [V(0, 0, 0), V(0, 5, 0.1), V(0.15, 10, 0), V(0, 15, -0.1)];
  b.add(tube(trunk, [0.6, 0.45, 0.36, 0.26], 7, { tip: false, color: barkC }));
  const shade = leafShade("#264a22", "#3d7531", "#79ad4a");
  const d = lite ? 0 : 1;
  const tiers: Array<[number, number, number]> = [
    [9.5, 3.9, 3],
    [12.8, 3.2, 3],
    [15.8, 2.4, 2],
  ];
  tiers.forEach(([y, r, n], ti) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ti * 0.9;
      const lp = arcPath(V(0, y - 0.6, 0), a, r * 0.75, 1.35, -0.2, 1);
      b.add(tube(lp, [0.16, 0.08], 4, { tip: false, color: barkC }));
      const e = lp[1] as THREE.Vector3;
      clump(b, V(e.x, e.y + 0.4, e.z), r * 0.62, 0.36, 460 + ti * 5 + k, shade, k === 0 ? d : 0);
    }
  });
  bromeliad(b, V(0.4, 7, 0), 0.5, R, "#e8a236");
  return b.build({ flex: true });
}

/** Cecropia (cetico): pale ringed candelabra, silvery palmate leaves at the branch tips. */
export function cecropiaModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(501);
  const ring = (s: number) => _c.set(Math.sin(s * 70) > 0.75 ? "#9c968a" : "#d6d1c3");
  const trunk = [V(0, 0, 0), V(0.1, 3.5, 0), V(-0.05, 7.2, 0.05)];
  b.add(tube(trunk, [0.24, 0.17, 0.13], 5, { tip: false, color: (s) => ring(s) }));
  const top = trunk[2] as THREE.Vector3;
  const branches = 4;
  for (let k = 0; k < branches; k++) {
    const a = (k / branches) * Math.PI * 2 + R() * 0.5;
    const lp = arcPath(top, a, 2.6 + R() * 0.8, 0.95, -0.85, 3);
    b.add(tube(lp, [0.1, 0.08, 0.06, 0.05], 4, { tip: false, color: (s) => ring(s * 0.4 + 0.3) }));
    const tip = lp[3] as THREE.Vector3;
    // Umbrella of hand-shaped leaves: lobed discs drooping around the tip.
    for (let l = 0; l < 4; l++) {
      const la = l * GOLDEN + R();
      const c = V(tip.x + Math.cos(la) * 0.75, tip.y - 0.15, tip.z + Math.sin(la) * 0.75);
      palmate(b, c, 0.95 + R() * 0.25, la, 0.4);
    }
  }
  return b.build({ flex: true });
}

/** Lobed hand leaf (cecropia): disc with alternating lobe radii, rim drooping, silvery underside. */
function palmate(b: GeoBuilder, c: THREE.Vector3, r: number, yaw: number, droop: number) {
  const K = 9;
  const pos: number[] = [c.x, c.y + 0.08, c.z];
  for (let k = 0; k <= K; k++) {
    const a = yaw + (k / K) * Math.PI * 2;
    const rr = r * (k % 2 ? 0.55 : 1);
    pos.push(c.x + Math.cos(a) * rr, c.y - droop * (rr / r), c.z + Math.sin(a) * rr);
  }
  const idx: number[] = [];
  for (let k = 1; k <= K; k++) idx.push(0, k + 1, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const top = new THREE.Color("#7fa565");
  const under = new THREE.Color("#c4cfb8");
  b.add(g, { color: (_p, n) => _c.copy(n.y >= 0 ? top : under), flex: 0.12 });
}

/** Pleated fan leaf (aguaje): rays spread around the petiole direction, alternate pleats. */
function fanLeaf(b: GeoBuilder, c: THREE.Vector3, dir: THREE.Vector3, r: number, shade: [string, string]) {
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();
  const K = 11;
  const pos: number[] = [c.x, c.y, c.z];
  const col: number[] = [];
  const ca = new THREE.Color(shade[0]);
  const cb = new THREE.Color(shade[1]);
  col.push(ca.r, ca.g, ca.b);
  for (let ring = 1; ring <= 2; ring++) {
    const rr = (r * ring) / 2;
    for (let k = 0; k <= K; k++) {
      const a = -1.45 + (k / K) * 2.9;
      const pleat = (k % 2 ? 1 : -1) * 0.1 * rr;
      // Outer ring droops (the fan bends under its weight).
      const sag = ring === 2 ? -0.35 * r : 0;
      pos.push(
        c.x + (dir.x * Math.cos(a) + side.x * Math.sin(a)) * rr + nrm.x * (pleat + sag),
        c.y + (dir.y * Math.cos(a) + side.y * Math.sin(a)) * rr + nrm.y * (pleat + sag),
        c.z + (dir.z * Math.cos(a) + side.z * Math.sin(a)) * rr + nrm.z * (pleat + sag),
      );
      const cc = k % 2 ? ca : cb;
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const idx: number[] = [];
  const r1 = 1;
  const r2 = 1 + K + 1;
  for (let k = 0; k < K; k++) {
    idx.push(0, r1 + k, r1 + k + 1);
    idx.push(r1 + k, r2 + k, r1 + k + 1, r1 + k + 1, r2 + k, r2 + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add(g, { flex: 0.1 });
}

/** Aguaje palm (Mauritia flexuosa): smooth grey column, ball of fan leaves, a few dead brown fans. */
export function aguajeModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(601);
  const trunk = [V(0, 0, 0), V(0.1, 5, 0), V(0.2, 10, -0.1)];
  b.add(tube(trunk, [0.36, 0.31, 0.27], 6, { tip: false, color: (s) => _c.set(s > 0.92 ? "#6d5a3a" : "#8c8579") }));
  const top = trunk[2] as THREE.Vector3;
  const leaves = 13;
  for (let k = 0; k < leaves; k++) {
    const a = k * GOLDEN;
    const rise = 0.2 + (k % 3) * 0.35 + R() * 0.2;
    const dead = k === leaves - 1;
    const pts = arch(top, a, dead ? 1.4 : 2.4, dead ? -1.2 : rise, dead ? 0.2 : 0.3, 2);
    b.add(tube(pts, [0.06, 0.05, 0.04], 3, { tip: false, color: () => _c.set("#6b7d3a"), flex: (s) => s * 0.1 }));
    const end = pts[2] as THREE.Vector3;
    const dir = end
      .clone()
      .sub(pts[1] as THREE.Vector3)
      .normalize();
    fanLeaf(b, end, dir, dead ? 1.3 : 2.1 + R() * 0.4, dead ? ["#7a6a3a", "#93804e"] : ["#4f8a35", "#6aa444"]);
  }
  return b.build({ flex: true });
}

/** Feather frond: arching midrib with a drooping ∧ section (huasaí, shapaja, fern). */
function frond(
  b: GeoBuilder,
  base: THREE.Vector3,
  a: number,
  len: number,
  rise: number,
  droop: number,
  width: number,
  colors: [string, string],
  segs: number,
  flex: number,
) {
  const pts = arch(base, a, len, rise, droop, segs);
  const ca = new THREE.Color(colors[0]);
  const cb = new THREE.Color(colors[1]);
  b.add(
    strip(pts, (s) => width * Math.sin(Math.min(1, s * 1.15 + 0.08) * Math.PI) ** 0.6, {
      fold: 0.55,
      color: (s, sd) => _c.copy(sd === 0 ? cb : ca).lerp(cb, s * 0.3),
      flex: (s) => s * s * flex,
    }),
  );
}

/** Huasaí / açaí (Euterpe): 3 slender stems with red crownshafts and drooping feather crowns. */
export function huasaiModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(701);
  const stems = 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + R();
    const h = 7.5 + R() * 2.5 - s * 0.8;
    const lean = 0.06 + R() * 0.08;
    const pts = [V(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25)];
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      pts.push(V(Math.cos(a) * (0.25 + h * lean * t * t), h * t, Math.sin(a) * (0.25 + h * lean * t * t)));
    }
    b.add(
      tube(pts, [0.1, 0.09, 0.08, 0.08], 4, {
        tip: false,
        color: (t) => _c.set(t > 0.9 ? "#8a3b2e" : "#8d8a76"),
        flex: (t) => t * t * 0.08,
      }),
    );
    const top = pts[3] as THREE.Vector3;
    const shaft = [top, top.clone().add(V(0, 1.1, 0))];
    b.add(tube(shaft, [0.12, 0.08], 4, { tip: false, color: () => _c.set("#7a3f2a"), flex: () => 0.1 }));
    const crown = shaft[1] as THREE.Vector3;
    const fr = 6;
    for (let k = 0; k < fr; k++)
      frond(b, crown, k * ((Math.PI * 2) / fr) + s, 2.6 + R() * 0.4, 0.8, 2.2, 0.42, ["#3f7a2f", "#5e9a3e"], 5, 0.18);
  }
  return b.build({ flex: true });
}

/** Shapaja (Attalea): short stout trunk with old leaf bases, huge arching fronds. */
export function shapajaModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(801);
  const trunk = [V(0, 0, 0), V(0, 1.6, 0), V(0.05, 3.2, 0)];
  b.add(tube(trunk, [0.48, 0.45, 0.4], 6, { tip: false, color: bark("#6a5a3e", "#857252", "#4d412c", 3) }));
  const top = trunk[2] as THREE.Vector3;
  const n = 10;
  for (let k = 0; k < n; k++)
    frond(b, top, k * GOLDEN, 6 + R() * 1.2, 1.0 + (k % 3) * 0.12, 1.9, 0.75, ["#3c7330", "#61a046"], 6, 0.12);
  return b.build({ flex: true });
}

// ---------------------------------------------------------------- understory

/** Banana / platanillo: green pseudostem, big paddle leaves arching out, one hanging purple bud. */
export function bananaModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(901);
  const stem = [V(0, 0, 0), V(0.05, 1.2, 0), V(0, 2.3, 0)];
  b.add(
    tube(stem, [0.2, 0.16, 0.13], 5, {
      tip: false,
      color: (s) => _c.set(s < 0.2 ? "#5d6a34" : "#7e9a45"),
      flex: (s) => s * 0.05,
    }),
  );
  const top = stem[2] as THREE.Vector3;
  const leaf = new THREE.Color("#6fb441");
  const rib = new THREE.Color("#c2d98a");
  for (let k = 0; k < 7; k++) {
    const pts = arch(top, k * GOLDEN, 2.3 + R() * 0.4, 0.95 - (k % 3) * 0.2, 1.4, 5);
    b.add(
      strip(pts, (s) => (s < 0.1 ? 0.06 : 0.42 * Math.sin(Math.min(1, s * 1.1) * Math.PI) ** 0.4), {
        fold: 0.18,
        color: (_s, sd) => _c.copy(sd === 0 ? rib : leaf),
        flex: (s) => s * s * 0.25,
      }),
    );
  }
  const bud = arch(top, 1.3, 1, -0.3, 0.9, 2);
  b.add(
    tube(bud, [0.04, 0.035, 0.12], 4, {
      tip: false,
      color: (s) => _c.set(s > 0.6 ? "#6b2a4a" : "#7b8a3e"),
      flex: (s) => s * 0.1,
    }),
  );
  return b.build({ flex: true });
}

/** Heliconia: paddle leaves on long petioles, two zig-zag lobster-claw inflorescences (red bracts, yellow tips). */
export function heliconiaModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(1001);
  const leaf = new THREE.Color("#3f8a36");
  const rib = new THREE.Color("#8cc063");
  for (let k = 0; k < 6; k++) {
    const pts = arch(V(0, 0, 0), k * GOLDEN, 2 + R() * 0.4, 1.25 - R() * 0.25, 0.9, 5);
    b.add(
      strip(pts, (s) => (s < 0.38 ? 0.03 : 0.27 * Math.sin(((s - 0.38) / 0.62) * Math.PI) ** 0.5), {
        fold: 0.15,
        color: (_s, sd) => _c.copy(sd === 0 ? rib : leaf),
        flex: (s) => s * s * 0.3,
      }),
    );
  }
  const red = lerpC("#d2302a", "#f2c53c");
  for (let f = 0; f < 2; f++) {
    const a = f * 2.6 + 0.4;
    const base = V(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    const top = V(Math.cos(a) * 0.4, 1.5 + f * 0.25, Math.sin(a) * 0.4);
    b.add(tube([base, top], [0.035, 0.03], 3, { tip: false, color: () => _c.set("#4a7a30"), flex: (s) => s * 0.2 }));
    // Bracts alternate left/right up the stalk, each a boat-shaped cone pointing out and up.
    for (let k = 0; k < 6; k++) {
      const t = 0.45 + k * 0.1;
      const p = base.clone().lerp(top, t);
      const side = k % 2 ? 1 : -1;
      const g = new THREE.ConeGeometry(0.07, 0.34 - k * 0.025, 4);
      g.rotateZ(-side * 1.0);
      g.rotateY(a);
      g.translate(p.x, p.y + 0.05, p.z);
      b.add(g, { color: red(k % 2 ? 0.1 : 0.0), flex: p.y * 0.2 });
      const tip = new THREE.OctahedronGeometry(0.045, 0);
      const off = V(side * 0.15, 0.1, 0).applyAxisAngle(UP, a);
      tip.translate(p.x + off.x, p.y + 0.05 + off.y, p.z + off.z);
      b.add(tip, { color: red(1), flex: p.y * 0.2 });
    }
  }
  return b.build({ flex: true });
}

/** Understory shrub: lumpy blobs plus a few big heart-shaped (philodendron) leaves. */
export function shrubModel(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(1101);
  const shade = leafShade("#1d3f1d", "#2f6129", "#4f8c38");
  const d = lite ? 0 : 1;
  clump(b, V(0, 0.75, 0), 0.95, 0.85, 1110, shade, d, 0.12);
  clump(b, V(0.7, 0.55, 0.3), 0.7, 0.8, 1111, shade, 0, 0.12);
  clump(b, V(-0.5, 0.95, -0.4), 0.65, 0.8, 1112, shade, 0, 0.12);
  const leaf = new THREE.Color("#3d8a33");
  const rib = new THREE.Color("#79b552");
  for (let k = 0; k < 4; k++) {
    const pts = arch(V(0, 0.2, 0), k * GOLDEN + 0.6, 1.5 + R() * 0.3, 0.7, 1.1, 3);
    b.add(
      strip(pts, (s) => (s < 0.35 ? 0.03 : 0.38 * Math.sin(((s - 0.35) / 0.65) * Math.PI) ** 0.5), {
        fold: 0.1,
        color: (_s, sd) => _c.copy(sd === 0 ? rib : leaf),
        flex: (s) => s * s * 0.3,
      }),
    );
  }
  return b.build({ flex: true });
}

/** Fern: rosette of arching fronds. */
export function fernModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(1201);
  for (let k = 0; k < 8; k++)
    frond(b, V(0, 0.05, 0), k * GOLDEN + R() * 0.3, 0.9 + R() * 0.25, 1.0, 1.6, 0.17, ["#3e7d34", "#6aa84a"], 4, 0.25);
  return b.build({ flex: true });
}

/** Liana curtain: a few vines hanging from ≈ 9 u (instance sy follows its host tree), leaves along them. */
export function lianaModel(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(1301);
  const n = lite ? 3 : 5;
  for (let k = 0; k < n; k++) {
    const top = V((R() - 0.5) * 2.2, 8.6 + R() * 1.2, (R() - 0.5) * 0.8);
    liana(b, top, 5.5 + R() * 2.5, R, lite ? 3 : 5, 0.045);
  }
  return b.build({ flex: true });
}

/** Caña brava (Gynerium): tall culms with alternate blades and a pale plume on two of them. */
export function reedModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = rng(1401);
  const culm = lerpC("#6f8a3a", "#a7b85c");
  for (let k = 0; k < 7; k++) {
    const a = k * GOLDEN;
    const h = 2.4 + R() * 1.1;
    const pts = arcPath(V(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18), a, h, 0.06 + R() * 0.1, 0.12, 3);
    b.add(tube(pts, [0.04, 0.035, 0.03, 0.02], 3, { tip: true, color: (s) => culm(s), flex: (s) => s * s * h * 0.06 }));
    // Blades fan out near the top.
    for (let l = 0; l < 3; l++) {
      const f = 0.55 + l * 0.14;
      const p = (pts[2] as THREE.Vector3).clone().lerp(pts[3] as THREE.Vector3, (f - 0.55) * 2);
      const bl = arch(p, a + l * 2.2, 0.9, 0.5, 1.4, 3);
      b.add(
        strip(bl, (s) => 0.06 * (1 - s), {
          fold: 0.2,
          color: (s) => culm(0.4 + s * 0.6),
          flex: () => p.y * 0.06,
        }),
      );
    }
    if (k < 2) {
      const top = pts[3] as THREE.Vector3;
      const g = new THREE.ConeGeometry(0.12, 0.8, 4);
      g.translate(top.x, top.y + 0.35, top.z);
      b.add(g, { color: "#e9e1c8", flex: h * 0.07 });
    }
  }
  return b.build({ flex: true });
}

/** Victoria regia pad (r 1 at scale 1): veined green disc with an upturned maroon rim; `flower` adds the bloom. */
export function lilyModel(flower: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const K = 18;
  const pos: number[] = [0, 0.02, 0];
  const col: number[] = [];
  const top = new THREE.Color("#5c9a3a");
  const vein = new THREE.Color("#4a7f2e");
  col.push(top.r, top.g, top.b);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2;
    pos.push(Math.cos(a), 0, Math.sin(a));
    const c = k % 2 ? vein : top;
    col.push(c.r, c.g, c.b);
  }
  const idx: number[] = [];
  for (let k = 0; k < K; k++) idx.push(0, 1 + ((k + 1) % K), 1 + k);
  const disc = new THREE.BufferGeometry();
  disc.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  disc.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  disc.setIndex(idx);
  disc.computeVertexNormals();
  b.add(disc, { flex: 0 });
  // Upturned rim: a short open cylinder flaring out, maroon outside.
  const rim = new THREE.CylinderGeometry(1.06, 1.0, 0.14, K, 1, true);
  rim.translate(0, 0.07, 0);
  b.add(rim, { color: "#8a3a3a", flex: 0 });
  if (flower) {
    const petal = lerpC("#fbf3f2", "#e8a0b4");
    for (let k = 0; k < 10; k++) {
      const a = k * GOLDEN;
      const g = new THREE.OctahedronGeometry(0.1, 0);
      g.scale(0.9, 0.55, 2.4);
      g.translate(0, 0, 0.18);
      g.rotateX(-0.7 - (k % 2) * 0.3);
      g.rotateY(a);
      g.translate(0.35, 0.16, 0.2);
      b.add(g, { color: petal(k < 4 ? 0.8 : 0.05), flex: 0 });
    }
  }
  return b.build({ flex: true });
}

/** Floating leaf / twig on the river (tiny, drifts with the current). */
export function floatModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const g = new THREE.OctahedronGeometry(0.22, 0);
  g.scale(1.6, 0.12, 0.7);
  b.add(g, { color: "#ffffff", flex: 0 });
  return b.build({ flex: true });
}
