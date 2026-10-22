/**
 * Merged static props for the people's sites: the `Part` accumulator (transformed primitives, each with a
 * fixed vertex color, merged into one geometry), the shared primitive prototypes, and the props built with
 * them: market stalls (feria) and hearths (terraces, storytellers, the summit camp, the Antisuyu community).
 * The people themselves are characters (src/world/characters/); these are the things around them, so a whole
 * site's props cost one draw call.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DYE } from "../../palette";
import { rng } from "./util";

const WOOD = "#7a5233";
const WOOD_D = "#5e3b22";

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Shared primitive prototypes (unit sized; `Part.add` scales them). */
export function protos() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.SphereGeometry(1, 10, 8),
    lowSph: new THREE.IcosahedronGeometry(1, 0),
    ico: new THREE.IcosahedronGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    /** Truncated cone, wide at the bottom (skirts, baskets, pots). */
    flare: new THREE.CylinderGeometry(0.62, 1, 1, 12, 1),
    cone: new THREE.ConeGeometry(1, 1, 8),
    cap: new THREE.CapsuleGeometry(1, 1, 2, 8),
    torus: new THREE.TorusGeometry(1, 0.16, 5, 14),
    halfSph: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  };
}
export type Protos = ReturnType<typeof protos>;

/** Accumulates transformed primitives with a fixed color (`color` attribute), then merges them. */
export class Part {
  private list: THREE.BufferGeometry[] = [];
  /** Optional transform applied after each primitive's own (places a whole prop in a frame). */
  post: THREE.Matrix4 | null = null;
  add(
    src: THREE.BufferGeometry,
    color: string,
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
    if (this.post) g.applyMatrix4(this.post);
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
  get empty() {
    return this.list.length === 0;
  }
  /** Merge into one geometry (the parts are disposed). */
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** A Part with its own prototypes: add props to `p` (using `P`), then `build()` one vertex-colored geometry. */
export class Static {
  readonly p = new Part();
  readonly P = protos();
  build() {
    const g = this.p.build();
    for (const k of Object.values(this.P)) k.dispose();
    return g;
  }
}

export type StallKind = "textiles" | "produce" | "pottery";

/**
 * One market stall in local space (origin at the stall center, +Z toward the shoppers):
 * a wooden frame with a cotton awning and goods on a low table or a manta on the ground.
 * `y(x, z)` gives local ground offsets so posts reach the terrain.
 */
export function stall(s: Static, kind: StallKind, seed: number, m: THREE.Matrix4, y: (x: number, z: number) => number) {
  const R = rng(seed);
  const P = s.P;
  s.p.post = m;
  const add = (...a: Parameters<Part["add"]>) => s.p.add(...a);
  const W = 1.9;
  const D = 1.1;
  const H = 2.05;
  // Frame: four posts, awning sloping toward the front, striped cloth.
  for (const [x, z, h] of [
    [-W / 2, -D / 2, H + 0.15],
    [W / 2, -D / 2, H + 0.15],
    [-W / 2, D / 2, H - 0.15],
    [W / 2, D / 2, H - 0.15],
  ] as const) {
    const g = y(x, z);
    add(P.cyl6, WOOD_D, x, g + h / 2 - 0.2, z, 0, 0, 0, 0.045, h + 0.4, 0.045);
  }
  const awn = kind === "pottery" ? DYE.ochre : kind === "produce" ? DYE.cotton : DYE.turq;
  const stripe = kind === "pottery" ? DYE.red : kind === "produce" ? DYE.red : DYE.cotton;
  const slope = Math.atan2(0.3, D);
  add(P.box, awn, 0, H + 0.02, 0, slope, 0, 0, W + 0.35, 0.04, D + 0.35);
  for (let i = -2; i <= 2; i++) add(P.box, stripe, i * 0.38, H + 0.045, 0, slope, 0, 0, 0.1, 0.02, D + 0.36);
  // Valance with scallops at the front edge.
  for (let i = -4; i <= 4; i++)
    add(P.box, i % 2 ? awn : stripe, i * 0.24, H - 0.27, D / 2 + 0.17, 0, 0, 0, 0.23, 0.14, 0.02);
  const g0 = y(0, 0);
  if (kind === "produce") {
    // Manta on the ground with baskets of native potatoes, maize cobs and a sack of chuño.
    add(P.box, DYE.red, 0, g0 + 0.015, 0.05, 0, 0, 0, 1.8, 0.03, 1.15);
    for (const x of [-0.6, 0, 0.6]) add(P.box, DYE.ochre, x, g0 + 0.035, 0.05, 0, 0, 0, 0.08, 0.012, 1.16);
    const spots: Array<[number, number, string[]]> = [
      [-0.55, -0.12, ["#7a4f3a", "#5b3048", "#a8705a"]],
      [0.0, 0.2, ["#e8c45a", "#f0e2b0", "#6a2f5a"]],
      [0.55, -0.1, ["#c6a27a", "#7a4f3a", "#d9b98c"]],
    ];
    spots.forEach(([x, z, cols], k) => {
      add(P.flare, "#c99a55", x, g0 + 0.15, z, Math.PI, 0, 0, 0.27, 0.26, 0.27);
      add(P.cyl, "#a5743a", x, g0 + 0.27, z, 0, 0, 0, 0.27, 0.03, 0.27);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + R();
        const r = i === 0 ? 0 : 0.14 + R() * 0.06;
        const c = cols[i % cols.length] as string;
        if (k === 1)
          add(P.cap, c, x + Math.cos(a) * r, g0 + 0.33, z + Math.sin(a) * r, Math.PI / 2, a, 0, 0.045, 0.12, 0.045);
        else add(P.lowSph, c, x + Math.cos(a) * r, g0 + 0.32, z + Math.sin(a) * r, R(), R(), 0, 0.07, 0.058, 0.06);
      }
    });
    add(P.ico, "#d8cbb4", 0.15, g0 + 0.28, -0.45, 0, 0, 0, 0.26, 0.3, 0.2);
    add(P.cyl, DYE.indigo, 0.15, g0 + 0.53, -0.45, 0, 0, 0, 0.08, 0.06, 0.08);
  } else {
    // Low table with a woven cloth.
    const th = 0.72;
    for (const [x, z] of [
      [-0.8, -0.4],
      [0.8, -0.4],
      [-0.8, 0.4],
      [0.8, 0.4],
    ] as const) {
      const g = y(x, z);
      add(P.box, WOOD, x, (g + g0 + th) / 2 - 0.1, z, 0, 0, 0, 0.06, g0 + th - g + 0.2, 0.06);
    }
    add(P.box, WOOD, 0, g0 + th, 0, 0, 0, 0, 1.75, 0.05, 0.95);
    add(P.box, kind === "pottery" ? DYE.indigo : DYE.red, 0, g0 + th + 0.03, 0, 0, 0, 0, 1.78, 0.02, 0.98);
    add(P.box, kind === "pottery" ? DYE.indigo : DYE.red, 0, g0 + th - 0.08, 0.495, 0, 0, 0, 1.78, 0.2, 0.01);
    if (kind === "textiles") {
      // Folded stacks and a hanging lliclla on the back rail.
      const cols = [DYE.red, DYE.indigo, DYE.turq, "#c2456b", DYE.ochre, "#3f7f4a"];
      for (let i = 0; i < 5; i++) {
        const x = -0.7 + i * 0.35;
        const n = 2 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++)
          add(
            P.box,
            cols[(i + k * 2) % cols.length] as string,
            x,
            g0 + th + 0.07 + k * 0.07,
            0.05 + (R() - 0.5) * 0.1,
            0,
            (R() - 0.5) * 0.2,
            0,
            0.3,
            0.06,
            0.36,
          );
      }
      add(P.cyl6, WOOD, 0, g0 + 1.75, -D / 2, 0, 0, Math.PI / 2, 0.025, W, 0.025);
      for (let i = 0; i < 3; i++) {
        const x = -0.6 + i * 0.6;
        const c = cols[(i * 2 + 1) % cols.length] as string;
        add(P.box, c, x, g0 + 1.3, -D / 2 + 0.02, 0, 0, 0, 0.52, 0.9, 0.02);
        for (let k = 0; k < 4; k++)
          add(
            P.box,
            k % 2 ? DYE.cotton : DYE.ochre,
            x,
            g0 + 1.05 + k * 0.17,
            -D / 2 + 0.035,
            0,
            0,
            0,
            0.52,
            0.04,
            0.012,
          );
        add(P.box, DYE.cotton, x, g0 + 0.83, -D / 2 + 0.02, 0, 0, 0, 0.5, 0.05, 0.015);
      }
    } else {
      // Pottery: aríbalos (pointed-base jars), cooking pots and small cups, with painted bands.
      const clay = ["#b5653b", "#c4774a", "#9c5434"];
      for (let i = 0; i < 6; i++) {
        const x = -0.72 + i * 0.29;
        const z = (i % 2) * 0.22 - 0.1;
        const c = clay[i % clay.length] as string;
        const big = i % 3 === 1;
        const r = big ? 0.15 : 0.11;
        const gy = g0 + th + 0.05 + r;
        add(P.sph, c, x, gy, z, 0, 0, 0, r, r * (big ? 1.15 : 0.9), r);
        add(P.cyl, c, x, gy + r * 0.95, z, 0, 0, 0, r * 0.38, r * 0.5, r * 0.38);
        add(P.cyl, "#efe6d6", x, gy + r * 0.1, z, 0, 0, 0, r * 1.01, r * 0.22, r * 1.01);
        add(P.cyl, "#2a1d17", x, gy + r * 0.1, z, 0, 0, 0, r * 1.015, r * 0.06, r * 1.015);
        if (big)
          for (const sd of [-1, 1])
            add(P.torus, c, x + sd * r * 0.95, gy + r * 0.2, z, 0, Math.PI / 2, 0, 0.04, 0.04, 0.04);
      }
      for (let i = 0; i < 3; i++)
        add(P.cyl, "#c4774a", -0.5 + i * 0.5, g0 + th + 0.08, 0.32, 0, 0, 0, 0.06, 0.07, 0.06);
      // Big storage jar on the ground.
      add(P.sph, "#a85e38", 0.85, y(0.85, 0.75) + 0.3, 0.75, 0, 0, 0, 0.26, 0.3, 0.26);
      add(P.cyl, "#efe6d6", 0.85, y(0.85, 0.75) + 0.36, 0.75, 0, 0, 0, 0.265, 0.06, 0.265);
    }
  }
  s.p.post = null;
}

/** A small hearth: ring of stones and crossed logs (local, origin on the ground). Flames are separate. */
export function hearth(s: Static, m: THREE.Matrix4) {
  const P = s.P;
  const tmp = s.p;
  tmp.post = m;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    tmp.add(
      P.lowSph,
      i % 2 ? "#8f877b" : "#b9b1a3",
      Math.cos(a) * 0.42,
      0.06,
      Math.sin(a) * 0.42,
      a,
      a,
      0,
      0.13,
      0.1,
      0.12,
    );
  }
  for (let i = 0; i < 3; i++)
    tmp.add(P.cyl6, WOOD_D, 0, 0.08, 0, Math.PI / 2 - 0.25, (i / 3) * Math.PI, 0, 0.04, 0.6, 0.04);
  tmp.add(P.sph, "#3b2c25", 0, 0.02, 0, 0, 0, 0, 0.3, 0.03, 0.3);
  tmp.post = null;
}
