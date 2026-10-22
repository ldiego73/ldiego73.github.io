/**
 * Winged models for the jungle (one merged vertex-colored geometry per species, wings and head animated in
 * the vertex shader by the shared bird rig of flora/material.ts — one draw call per species, ink-correct):
 * the morpho butterfly (insects.ts, kene.ts). The macaw, toucan and egret models are retired from the world
 * (it draws its birds on the shared animal core, ./beasts.ts) and only stay for the animals harness's
 * old-vs-new lineup (characters/animals/dev/old.ts); delete them with it.
 * Models face +Z with the origin at the feet; wings are modeled spread (flight pose) along ±X from the
 * shoulder and fold back along the flanks with pose.w = 1 (see flora/material.ts rigMaterial).
 * Real sizes against the 1.7 u traveler: macaw ≈ 0.85 beak to tail, toucan ≈ 0.55, egret ≈ 0.95 tall,
 * morpho ≈ 0.15 span (instances are scaled up a little so they read from the follow camera).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { GeoBuilder } from "../../../flora/geom";
import { inkAware, rigMaterial } from "../../../flora/material";
import { col, cone, egg, limb, planform, ramp, tube, V3 } from "./kit";
import { cullable } from "./rig";

export interface WingModel {
  geo: THREE.BufferGeometry;
  shoulder: THREE.Vector3;
  neck: THREE.Vector3;
}

/** Perched wing roll (with pose.w = 1 the wings hang closed along the flanks). */
export const FOLDED = 1.35;

/** Two-tone by normal: `under` where the surface faces down, `top` elsewhere. */
const twoTone = (top: string, under: string, split = 0) => {
  const a = col(top);
  const b = col(under);
  return (_p: THREE.Vector3, n: THREE.Vector3) => (n.y < split ? b : a);
};

function legs(b: GeoBuilder, hipY: number, spread: number, r: number, color: string, z = 0) {
  for (const s of [-1, 1]) b.add(tube(r, r * 0.8, s * spread, hipY, z, s * spread, 0, z + 0.01, 4), { color });
}

const MACAW_WING: Array<[number, number]> = [
  [0, 0],
  [0.16, -0.02],
  [0.34, 0.0],
  [0.48, 0.05],
  [0.46, 0.12],
  [0.36, 0.19],
  [0.2, 0.23],
  [0.05, 0.22],
  [0, 0.18],
];

export type MacawKind = "scarlet" | "blue" | "redgreen" | "chestnut";

/**
 * Macaw palettes. Wing zones by distance from the shoulder: `inner` (< w0), coverts `mid` (< w1, leading half),
 * flight feathers `outer`. Head: bare `face` patch on the sides, optional `crown` (forehead) and `throat` band.
 */
const MACAW: Record<
  MacawKind,
  {
    body: string;
    belly?: string;
    head: string;
    face: string;
    crown?: string;
    throat?: string;
    bill: string;
    tail: string;
    tailTip: string;
    inner: string;
    mid: string;
    outer: string;
    w0: number;
    w1: number;
    under: string;
  }
> = {
  // Scarlet (Ara macao): all red, yellow coverts, blue flight feathers, pale upper bill.
  scarlet: {
    body: "#d8261c",
    head: "#d8261c",
    face: "#f4ece4",
    bill: "#efe3cf",
    tail: "#d8261c",
    tailTip: "#2462c9",
    inner: "#d8261c",
    mid: "#f6c21c",
    outer: "#2462c9",
    w0: 0.17,
    w1: 0.27,
    under: "#c4241c",
  },
  // Blue-and-yellow (Ara ararauna): blue back, golden breast, green forehead, black throat band, black bill.
  blue: {
    body: "#2462c9",
    belly: "#f3b51a",
    head: "#2462c9",
    face: "#f2f2ee",
    crown: "#3fae4a",
    throat: "#141414",
    bill: "#202020",
    tail: "#2462c9",
    tailTip: "#2462c9",
    inner: "#2462c9",
    mid: "#2462c9",
    outer: "#1d3f8a",
    w0: 0.3,
    w1: 0.3,
    under: "#f0b71c",
  },
  // Red-and-green (Ara chloropterus): deeper crimson, a broad green wing band, blue flight feathers.
  redgreen: {
    body: "#b3191d",
    head: "#b3191d",
    face: "#f3e6e0",
    bill: "#e9dcc6",
    tail: "#b3191d",
    tailTip: "#2a58c2",
    inner: "#b3191d",
    mid: "#2f9a4a",
    outer: "#2350b4",
    w0: 0.12,
    w1: 0.3,
    under: "#a8181c",
  },
  // Chestnut-fronted (Ara severus): small and green, chestnut forehead, blue flight feathers, red underwing.
  chestnut: {
    body: "#3f9a3a",
    belly: "#4fa944",
    head: "#3f9a3a",
    face: "#f1ede6",
    crown: "#6b2c18",
    bill: "#1d1d1d",
    tail: "#3d8f3a",
    tailTip: "#2f62b8",
    inner: "#3f9a3a",
    mid: "#3f9a3a",
    outer: "#2a5fb8",
    w0: 0.2,
    w1: 0.2,
    under: "#c23a2a",
  },
};

/** Macaw: `kind` scarlet, blue-and-yellow, red-and-green or chestnut-fronted (same build, own palette). */
export function macawModel(kind: MacawKind): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.075, 0.27, 0.03);
  const neck = V3(0, 0.33, 0.07);
  const P = MACAW[kind];
  b.add(egg(0.11, 0.9, 0.95, 1.55, 0, 0.2, 0, -0.55, 10), {
    color: P.belly ? twoTone(P.body, P.belly, 0.15) : P.body,
  });
  // Long graduated tail with a coloured tip.
  b.add(
    planform(
      [
        [-0.05, 0],
        [0.05, 0],
        [0.03, 0.42],
        [0, 0.48],
        [-0.03, 0.42],
      ],
      1,
      0.014,
    )
      .rotateX(-0.6)
      .translate(0, 0.14, -0.12),
    { color: (p) => col(p.z < -0.38 ? P.tailTip : P.tail) },
  );
  // Head (rigged): bare face patch on the sides, big hooked bill.
  b.add(egg(0.075, 0.95, 1, 1.05, 0, 0.36, 0.1), {
    color: (p) => {
      if (Math.abs(p.x) > 0.045 && p.z > 0.1 && p.y < 0.38) return col(P.face);
      if (P.throat && p.y < 0.31) return col(P.throat);
      if (P.crown && p.y > 0.4 && p.z > 0.12) return col(P.crown);
      return col(P.head);
    },
    rig: [0, 1],
  });
  b.add(egg(0.045, 0.85, 1.1, 1, 0, 0.345, 0.165, 0.3), { color: P.bill, rig: [0, 1] });
  b.add(cone(0.026, 0.06, 6, V3(0, 0.33, 0.19), V3(0, -1, 0.35)), { color: P.bill, rig: [0, 1] });
  b.add(egg(0.03, 0.9, 0.8, 1, 0, 0.305, 0.15), { color: "#1a1a1a", rig: [0, 1] });
  for (const side of [1, -1] as const)
    b.add(planform(MACAW_WING, side, 0.018).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: (p, n) => {
        const s = Math.abs(p.x);
        if (n.y < -0.5) return col(P.under);
        return col(s < P.w0 ? P.inner : s < P.w1 && p.z > -0.12 ? P.mid : P.outer);
      },
      rig: [side, 0],
    });
  legs(b, 0.07, 0.035, 0.012, "#5a5a5e", 0.02);
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** White-throated toucan (Ramphastos tucanus cuvieri). */
export function toucanModel(): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.06, 0.17, 0.02);
  const neck = V3(0, 0.22, 0.05);
  b.add(egg(0.085, 0.95, 1, 1.45, 0, 0.14, 0, -0.45, 10), {
    color: (p, n) => {
      // Red undertail coverts at the vent, the rest black.
      if (p.y < 0.1 && p.z < -0.02 && n.y < 0.2) return col("#d4221c");
      return col("#141313");
    },
  });
  // Yellow uppertail coverts at the base of the tail, then a black square tail.
  b.add(egg(0.035, 1.2, 0.6, 1, 0, 0.16, -0.1), { color: "#f2d12a" });
  b.add(
    planform(
      [
        [-0.045, 0],
        [0.045, 0],
        [0.05, 0.22],
        [-0.05, 0.22],
      ],
      1,
      0.014,
    )
      .rotateX(-0.7)
      .translate(0, 0.12, -0.1),
    { color: "#121212" },
  );
  // Head: white bib with a yellow lower rim, blue bare eye skin.
  b.add(egg(0.065, 0.95, 1, 1.05, 0, 0.245, 0.07), {
    color: (p) => {
      if (Math.abs(p.x) > 0.04 && p.y > 0.24 && p.y < 0.275 && p.z > 0.075 && p.z < 0.12) return col("#4fa6e8");
      if (p.y < 0.235 && p.z > 0.06) return col("#f6f2e6");
      return col("#141313");
    },
    rig: [0, 1],
  });
  b.add(egg(0.06, 1.05, 0.7, 0.9, 0, 0.19, 0.1), {
    color: (p) => (p.y < 0.165 ? col("#f2c419") : col("#f6f2e6")),
    rig: [0, 1],
  });
  // The bill: long, deep and laterally thin; black-maroon sides, yellow ridge, blue band at the base.
  const bill = new THREE.ConeGeometry(0.045, 0.24, 8, 1);
  bill.rotateX(Math.PI / 2);
  bill.scale(0.5, 1, 1);
  bill.rotateX(0.12);
  bill.translate(0, 0.245, 0.24);
  b.add(bill, {
    color: (p) => {
      if (p.z < 0.15) return col("#58b5e8");
      if (p.y > 0.258) return col("#f4d01c");
      return col(p.z > 0.32 ? "#2a1210" : "#3b1714");
    },
    rig: [0, 1],
  });
  const wing: Array<[number, number]> = [
    [0, 0],
    [0.09, -0.01],
    [0.17, 0.02],
    [0.2, 0.07],
    [0.15, 0.12],
    [0.06, 0.13],
    [0, 0.1],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.014).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: "#151414",
      rig: [side, 0],
    });
  legs(b, 0.05, 0.028, 0.01, "#4c6fa5", 0.02);
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** Great egret (Ardea alba): white, S-necked, long yellow bill, long black legs. Neck + head rigged. */
export function egretModel(): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.07, 0.56, 0.05);
  const neck = V3(0, 0.6, 0.12);
  b.add(egg(0.1, 0.85, 0.9, 1.7, 0, 0.55, 0, -0.25, 10), { color: "#f7f7f2" });
  // Plumes trailing over the tail.
  b.add(cone(0.05, 0.2, 5, V3(0, 0.55, -0.14), V3(0, -0.5, -1)), { color: "#efefe8" });
  // S-neck (three tubes), small head, long yellow dagger bill.
  b.add(tube(0.035, 0.03, 0, 0.6, 0.12, 0, 0.74, 0.08, 6), { color: "#f7f7f2", rig: [0, 1] });
  b.add(tube(0.03, 0.028, 0, 0.74, 0.08, 0, 0.86, 0.15, 6), { color: "#f7f7f2", rig: [0, 1] });
  b.add(egg(0.04, 0.9, 0.95, 1.25, 0, 0.885, 0.17), { color: "#f7f7f2", rig: [0, 1] });
  b.add(cone(0.014, 0.16, 5, V3(0, 0.88, 0.2), V3(0, -0.12, 1)), { color: "#f0c21f", rig: [0, 1] });
  b.add(egg(0.008, 1, 1, 1, 0.028, 0.895, 0.19, 0, 5), { color: "#e7c02a", rig: [0, 1] });
  b.add(egg(0.008, 1, 1, 1, -0.028, 0.895, 0.19, 0, 5), { color: "#e7c02a", rig: [0, 1] });
  // Broad white wings (≈ 1.4 m span spread); folded they lie flat along the flanks.
  const wing: Array<[number, number]> = [
    [0, 0],
    [0.16, -0.02],
    [0.34, 0.02],
    [0.5, 0.07],
    [0.46, 0.14],
    [0.3, 0.2],
    [0.14, 0.22],
    [0, 0.19],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.018).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: "#f4f4ee",
      rig: [side, 0],
    });
  for (const s of [-1, 1]) {
    b.add(limb(0.012, s * 0.035, 0.5, 0, s * 0.04, 0.25, 0.01, 4), { color: "#1d1d1d" });
    b.add(limb(0.01, s * 0.04, 0.25, 0.01, s * 0.04, 0.0, 0.02, 4), { color: "#1d1d1d" });
  }
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** Blue morpho (Morpho menelaus / helenor): electric blue above, brown with eyespots below. */
export function morphoModel(): WingModel {
  const b = new GeoBuilder();
  const shoulder = V3(0.006, 0.0, 0.01);
  const neck = V3(0, 0, 0.03);
  b.add(egg(0.008, 1, 1, 4.5, 0, 0, -0.005), { color: "#2a2420" });
  b.add(egg(0.007, 1, 1, 1, 0, 0.002, 0.034), { color: "#2a2420", rig: [0, 1] });
  const wing: Array<[number, number]> = [
    [0, -0.03],
    [0.05, -0.05],
    [0.085, -0.035],
    [0.08, 0.005],
    [0.06, 0.03],
    [0.065, 0.06],
    [0.04, 0.08],
    [0.01, 0.06],
    [0, 0.03],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.002).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: (p, n) => {
        if (n.y < 0) {
          // Underside: brown with a pale eyespot.
          const ex = Math.abs(p.x) - 0.045;
          const ez = p.z + 0.02;
          return ex * ex + ez * ez < 0.00012 ? col("#e8d7a8") : col("#6a4a2c");
        }
        const s = Math.abs(p.x);
        return s > 0.07 || p.z < -0.042 ? col("#10131c") : col(s < 0.02 ? "#1f6fe0" : "#38b6ff");
      },
      rig: [side, 0],
    });
  return { geo: b.build({ rig: true }), shoulder, neck };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** One winged species: an InstancedMesh with the bird rig and its per-instance pose. */
export class WingSet {
  readonly mesh: THREE.InstancedMesh;
  private readonly pose: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.Material;
  constructor(
    env: WorldEnv,
    name: string,
    model: WingModel,
    readonly capacity: number,
  ) {
    const n = Math.max(1, capacity);
    this.mat = rigMaterial(ramp(env), { uShoulder: { value: model.shoulder }, uNeck: { value: model.neck } }, name);
    this.pose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.pose.setUsage(THREE.DynamicDrawUsage);
    model.geo.setAttribute("pose", this.pose);
    this.mesh = new THREE.InstancedMesh(model.geo, this.mat, n);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    inkAware(this.mesh);
  }
  /** Writes instance i: position, yaw / pitch / bank, scale, and the rig pose. */
  set(
    i: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    bank: number,
    scale: number,
    wing: number,
    headYaw: number,
    headPitch: number,
    fold: number,
  ) {
    _q.setFromEuler(_e.set(pitch, yaw, bank, "YXZ"));
    _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
    this.mesh.setMatrixAt(i, _m);
    this.pose.setXYZW(i, wing, headYaw, headPitch, fold);
  }
  commit(n: number) {
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.pose.needsUpdate = true;
      cullable(this.mesh);
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
