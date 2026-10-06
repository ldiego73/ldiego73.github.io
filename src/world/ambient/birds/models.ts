/**
 * Low-poly birds, one merged vertex-colored geometry per species with a vertex-shader rig
 * (flora/material.ts `rigMaterial`): attribute `rig` marks wing vertices (x = ±1) and head vertices (y = 1).
 * Models face +Z with the origin at the feet; wings are modeled spread (flight pose) along ±X from the
 * shoulder and fold back along the flanks with pose.w = 1. Saturated colors so 0.1–0.3 u birds survive
 * the 1 px ink.
 *
 * Real sizes against the 1.7 u traveler: colibrí ≈ 0.11 (beak to tail), tangara ≈ 0.18,
 * gallito de las rocas ≈ 0.32, cóndor (fauna-models geometry at ×0.75) ≈ 3.7 wingspan.
 */
import * as THREE from "three";
import { condorParts } from "../../fauna-models";
import { GeoBuilder } from "../../flora/geom";

export type BirdKind = "tangara" | "colibri" | "gallito" | "condor";

export interface BirdModel {
  geo: THREE.BufferGeometry;
  shoulder: THREE.Vector3;
  neck: THREE.Vector3;
}

const PITCH_UP = -0.38;

/** Ellipsoid (smooth sphere scaled) centered at (x, y, z), tilted by `pitch` about X. */
function egg(r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, pitch = 0, seg = 8) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2));
  g.scale(sx, sy, sz);
  g.rotateX(pitch);
  g.translate(x, y, z);
  g.deleteAttribute("uv");
  return g;
}

/** Flat wing (or tail) from a planform in (span, chord) → XZ plane, thickness `t`, mirrored by `side`. */
function planform(pts: Array<[number, number]>, side: 1 | -1, t: number) {
  const ordered = side === 1 ? pts : [...pts].reverse();
  const shape = new THREE.Shape(ordered.map(([x, y]) => new THREE.Vector2(x * side, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  g.rotateX(-Math.PI / 2); // chord (+y of the shape) → −Z (backward), thickness → Y
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

function cone(r: number, h: number, seg: number, from: THREE.Vector3, dir: THREE.Vector3) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  g.deleteAttribute("uv");
  return g;
}

function legs(b: GeoBuilder, hipY: number, spread: number, r: number, color: string) {
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(r, r * 0.8, hipY, 3, 1);
    g.translate(s * spread, hipY / 2, 0.005);
    g.deleteAttribute("uv");
    b.add(g, { color });
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Two-tone belly/back by normal: `belly` where the surface faces down/forward, `back` on top. */
function twoTone(back: string, belly: string, split = 0.05) {
  const a = new THREE.Color(back);
  const c = new THREE.Color(belly);
  return (_p: THREE.Vector3, n: THREE.Vector3) => (n.y < split ? c : a);
}

const SMALL_WING: Array<[number, number]> = [
  [0, 0],
  [0.05, -0.006],
  [0.1, 0.004],
  [0.135, 0.02],
  [0.12, 0.04],
  [0.08, 0.055],
  [0.03, 0.06],
  [0, 0.05],
];

/** Tangara (blue-and-yellow tanager, "siete colores"): cobalt head/back, golden-orange breast, dark wings. */
export function tangaraModel(): BirdModel {
  const b = new GeoBuilder();
  const shoulder = V(0.042, 0.09, 0.02);
  const neck = V(0, 0.11, 0.04);
  b.add(egg(0.05, 0.92, 0.9, 1.5, 0, 0.07, 0, PITCH_UP), { color: twoTone("#2f5fd0", "#f4a531", -0.05) });
  // Tail: a narrow fan behind, dark.
  b.add(
    planform(
      [
        [-0.018, 0],
        [0.018, 0],
        [0.026, 0.08],
        [-0.026, 0.08],
      ],
      1,
      0.008,
    ).translate(0, 0.045, -0.06),
    {
      color: "#1c2747",
    },
  );
  // Head (rigged): blue cap, black mask at the beak, dark beak.
  b.add(egg(0.036, 1, 0.95, 1.1, 0, 0.122, 0.055), {
    color: (p) => (p.z > 0.078 && p.y < 0.13 ? new THREE.Color("#141a2e") : new THREE.Color("#3b78e8")),
    rig: [0, 1],
  });
  b.add(cone(0.011, 0.03, 5, V(0, 0.118, 0.085), V(0, -0.15, 1)), { color: "#22262e", rig: [0, 1] });
  for (const side of [1, -1] as const)
    b.add(planform(SMALL_WING, side, 0.01).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: (p) => (Math.abs(p.x) < 0.07 ? new THREE.Color("#2a4fae") : new THREE.Color("#1a2136")),
      rig: [side, 0],
    });
  legs(b, 0.035, 0.016, 0.005, "#3b2f2a");
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** Colibrí: emerald body, violet-turquoise gorget, long straight bill, forked dark tail, narrow wings. */
export function colibriModel(): BirdModel {
  const b = new GeoBuilder();
  const shoulder = V(0.022, 0.05, 0.012);
  const neck = V(0, 0.062, 0.03);
  b.add(egg(0.026, 0.95, 0.95, 1.7, 0, 0.042, 0, PITCH_UP), { color: twoTone("#17a865", "#5fd08f", -0.2) });
  b.add(
    planform(
      [
        [-0.01, 0],
        [0.01, 0],
        [0.022, 0.05],
        [0.004, 0.035],
        [-0.004, 0.035],
        [-0.022, 0.05],
      ],
      1,
      0.005,
    ).translate(0, 0.028, -0.035),
    { color: "#0f4f3a" },
  );
  b.add(egg(0.02, 1, 1, 1.05, 0, 0.068, 0.032), {
    color: (p, n) => (n.y < -0.1 && p.z > 0.03 ? new THREE.Color("#8b2bf0") : new THREE.Color("#1fbf73")),
    rig: [0, 1],
  });
  b.add(cone(0.004, 0.05, 4, V(0, 0.067, 0.05), V(0, -0.05, 1)), { color: "#151515", rig: [0, 1] });
  const wing: Array<[number, number]> = [
    [0, 0],
    [0.04, -0.004],
    [0.075, 0.004],
    [0.07, 0.016],
    [0.03, 0.02],
    [0, 0.018],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.004).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      color: "#2b5e48",
      rig: [side, 0],
    });
  legs(b, 0.016, 0.008, 0.0025, "#222222");
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** Gallito de las rocas (Rupicola peruvianus, male): flame-orange body and disc crest, black wings with grey tertials. */
export function gallitoModel(): BirdModel {
  const b = new GeoBuilder();
  const shoulder = V(0.072, 0.15, 0.04);
  const neck = V(0, 0.19, 0.085);
  b.add(egg(0.085, 0.95, 0.92, 1.4, 0, 0.12, 0, PITCH_UP * 0.7), { color: "#ff5a12" });
  b.add(
    planform(
      [
        [-0.035, 0],
        [0.035, 0],
        [0.04, 0.12],
        [-0.04, 0.12],
      ],
      1,
      0.012,
    ).translate(0, 0.08, -0.1),
    {
      color: "#121212",
    },
  );
  b.add(egg(0.06, 1, 0.95, 1.1, 0, 0.205, 0.095), { color: "#ff6418", rig: [0, 1] });
  // The crest: a half-disc standing fore-aft over the head, hiding the bill.
  const crest = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12, 1, false, 0, Math.PI);
  crest.rotateZ(Math.PI / 2);
  crest.scale(1, 1, 1.15);
  crest.translate(0, 0.225, 0.11);
  crest.deleteAttribute("uv");
  b.add(crest, { color: "#ff6a1c", rig: [0, 1] });
  b.add(cone(0.012, 0.03, 5, V(0, 0.19, 0.15), V(0, -0.3, 1)), { color: "#e7b54a", rig: [0, 1] });
  const wing: Array<[number, number]> = [
    [0, 0],
    [0.09, -0.01],
    [0.2, 0.01],
    [0.24, 0.04],
    [0.2, 0.08],
    [0.12, 0.1],
    [0.04, 0.1],
    [0, 0.08],
  ];
  for (const side of [1, -1] as const)
    b.add(planform(wing, side, 0.016).translate(shoulder.x * side, shoulder.y, shoulder.z), {
      // Grey tertial patch near the body, black flight feathers.
      color: (p) =>
        Math.abs(p.x) < 0.11 && p.z < shoulder.z - 0.03 ? new THREE.Color("#b9b6ad") : new THREE.Color("#141414"),
      rig: [side, 0],
    });
  legs(b, 0.06, 0.03, 0.009, "#d9a441");
  return { geo: b.build({ rig: true }), shoulder, neck };
}

/** Andean condor from the fauna geometry (same silhouette as fauna.ts' condors), merged and rigged. */
export function condorModel(): BirdModel {
  const C = condorParts();
  const b = new GeoBuilder();
  b.add(C.body, { color: "#1b1b1d" });
  b.add(C.collar, { color: "#f2efe6" });
  b.add(C.head, { color: "#b0705f", rig: [0, 1] });
  const sh = C.shoulder;
  b.add(C.wingR.translate(sh.x, sh.y, sh.z), { color: "#1b1b1d", rig: [1, 0] });
  b.add(C.patchR.translate(sh.x, sh.y, sh.z), { color: "#ece8de", rig: [1, 0] });
  b.add(C.wingL.translate(-sh.x, sh.y, sh.z), { color: "#1b1b1d", rig: [-1, 0] });
  b.add(C.patchL.translate(-sh.x, sh.y, sh.z), { color: "#ece8de", rig: [-1, 0] });
  return { geo: b.build({ rig: true }), shoulder: sh.clone(), neck: V(0, 0.06, 0.6) };
}
