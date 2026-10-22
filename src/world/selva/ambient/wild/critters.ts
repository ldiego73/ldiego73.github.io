/**
 * Small props of the jungle's fauna: the agouti's nut (carried at its jaw), the taricayas' basking log (a static
 * prop, vertex-colored) and `mergeNear`, which merges nearby static props into one mesh per cluster. The
 * animals themselves are the shared animal core's (./beasts.ts).
 */
import * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";
import { egg, tube } from "./kit";

type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
const _c = new THREE.Color();
const _d = new THREE.Color();

/** Deterministic 3D hash (0..1) for the grain of the wood. */
const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/** A Brazil-nut-like seed (brown, ribbed ovoid), ≈ 6 cm; scaled by the ambient so it reads. */
export function nutGeometry() {
  const b = new GeoBuilder();
  b.add(egg(0.03, 0.85, 0.85, 1.25, 0, 0, 0, 0, 7), {
    color: (p) => (Math.sin(Math.atan2(p.x, p.y) * 3) > 0.4 ? _c.set("#4a2c16") : _c.set("#8a5a2c")),
  });
  return b.build();
}

/**
 * A fallen trunk for the turtles to bask on: barkless grey-brown wood, a couple of broken branch stubs and
 * a tuft of roots at the base. Built along +Z from z = 0 (root end) to `len`, radius `r`, lying on y = r.
 */
export function logGeometry(len: number, r: number, seed: number) {
  const b = new GeoBuilder();
  const wood: ColorFn = (p) => {
    const k = hash3(Math.round(p.x * 8 + seed), Math.round(p.y * 8), Math.round(p.z * 3));
    return _c.set("#6f5a42").lerp(_d.set("#46382a"), k * 0.7);
  };
  b.add(tube(r, r * 0.72, 0, r, 0, 0, r * 0.9, len, 10), { color: wood });
  b.add(egg(r * 0.72, 1, 1, 0.25, 0, r * 0.9, len, 0, 8), { color: "#c2a77e" });
  // Root plate at the base.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    b.add(tube(r * 0.32, r * 0.08, 0, r, 0.05, Math.cos(a) * r * 2.4, r + Math.sin(a) * r * 2.2, -0.35, 5), {
      color: "#4a3a2b",
    });
  }
  for (const [z, s] of [
    [len * 0.35, 1],
    [len * 0.62, -1],
  ] as const)
    b.add(tube(r * 0.28, r * 0.16, s * r * 0.6, r * 1.3, z, s * r * 2.3, r * 2.6, z + 0.3, 5), { color: wood });
  return b.build();
}

/**
 * Merges vertex-colored props that lie within `gap` of each other (bounding-sphere centers, XZ) into one
 * geometry per cluster: the logs or thickets strung along the canoe route then cost one draw (and one ink and
 * one shadow pass) together instead of one each, while a far-off site stays separate so SiteProps can hide it.
 */
export function mergeNear(geos: THREE.BufferGeometry[], gap: number): THREE.BufferGeometry[] {
  const centers = geos.map((g) => {
    g.computeBoundingSphere();
    return (g.boundingSphere as THREE.Sphere).center;
  });
  const cluster = geos.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (cluster[r] !== r) r = cluster[r] as number;
    return r;
  };
  for (let i = 0; i < geos.length; i++)
    for (let j = i + 1; j < geos.length; j++) {
      const a = centers[i] as THREE.Vector3;
      const b = centers[j] as THREE.Vector3;
      if (Math.hypot(a.x - b.x, a.z - b.z) < gap) cluster[root(j)] = root(i);
    }
  const out = new Map<number, GeoBuilder>();
  geos.forEach((g, i) => {
    const r = root(i);
    if (!out.has(r)) out.set(r, new GeoBuilder());
    (out.get(r) as GeoBuilder).add(g);
  });
  return [...out.values()].map((b) => b.build());
}
