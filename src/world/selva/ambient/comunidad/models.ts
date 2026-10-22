/**
 * Procedural props of the Antisuyu community (the people themselves are shared characters: ./villager.ts,
 * ./dress.ts): the static props merged per site (backstrap loom, painted pottery, palm mats, the elder's
 * stool, the jumping log), the moving boats (a fisherman's dugout, the peque-peque motor canoe) and the cast
 * net. Built with the merged-part helpers of ../../../ambient/people/site-props.ts (`Part`, `protos`).
 */
import * as THREE from "three";
import { Part, type Protos, protos } from "../../../ambient/people/site-props";
import { hullGeometries } from "../embarcadero/amazon";

const WOOD = "#7a4a2b";
const WOOD_D = "#4f2f1c";
const PALM = "#b48a4c";
const PALM_D = "#8a6633";
const CREAM = "#efe3c8";
const BANANA = "#7ea33a";

// ---------------------------------------------------------------- static props (merged per site)

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Local placement matrix (yaw about Y at a world point). */
export function frameMatrix(x: number, y: number, z: number, yaw: number, out = new THREE.Matrix4()) {
  return out.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, yaw, 0)), tmpS.set(1, 1, 1));
}

/**
 * Backstrap loom, local frame (origin on the ground at the weaver's hips, +Z toward the far post): a stake,
 * the far bar, the warp running down to the breast bar at the weaver's waist, the finished cloth near her
 * with a kené band, and the strap round her back.
 */
export function loom(p: Part, P: Protos, cloth: string, line: string) {
  const far = 1.55;
  p.add(P.cyl6, WOOD_D, 0, 0.55, far + 0.12, 0, 0, 0, 0.05, 1.1, 0.05);
  p.add(P.cyl6, WOOD, 0, 0.78, far, 0, 0, Math.PI / 2, 0.025, 0.62, 0.025);
  p.add(P.cyl6, WOOD, 0, 0.5, 0.42, 0, 0, Math.PI / 2, 0.025, 0.6, 0.025);
  // Warp (thin, light) from the far bar down to the woven part.
  const y0 = 0.5;
  const y1 = 0.78;
  const len = Math.hypot(far - 0.42, y1 - y0);
  const slope = -Math.atan2(y1 - y0, far - 0.42);
  p.add(P.box, "#e9dfc6", 0, (y0 + y1) / 2, (far + 0.42) / 2, slope, 0, 0, 0.48, 0.006, len);
  // Finished cloth near the weaver, with its kené band.
  const wl = 0.55;
  const wz = 0.42 + (wl / 2) * Math.cos(slope);
  const wy = y0 + (wl / 2) * Math.sin(-slope);
  p.add(P.box, cloth, 0, wy + 0.004, wz, slope, 0, 0, 0.47, 0.01, wl);
  for (let k = 0; k < 4; k++)
    p.add(P.box, line, -0.15 + k * 0.1, wy + 0.012, wz + (k % 2) * 0.06 - 0.03, slope, 0, 0, 0.012, 0.01, wl * 0.6);
  p.add(P.box, line, 0, wy + 0.012, wz, slope, 0, 0, 0.42, 0.01, 0.014);
  // Heddle rod and the wooden sword across the warp.
  p.add(P.cyl6, WOOD_D, 0, 0.66, 1.05, 0, 0, Math.PI / 2, 0.015, 0.56, 0.015);
  p.add(P.box, WOOD, 0, 0.6, 0.8, slope, 0, 0, 0.56, 0.02, 0.06);
  // Back strap round the weaver's hips (she leans back to tension the warp).
  p.add(P.torus, PALM_D, 0, 0.42, 0.15, Math.PI / 2, 0, 0, 0.27, 0.3, 0.5);
}

/** Shipibo-style pottery: cream pots with red slip and black kené bands (local frame, on the ground). */
export function pots(p: Part, P: Protos, R: () => number) {
  const spots: Array<[number, number, number]> = [
    [0.55, 0.25, 0.22],
    [0.75, -0.25, 0.16],
    [-0.6, 0.35, 0.13],
    [0.3, 0.7, 0.12],
  ];
  for (const [x, z, r] of spots) {
    const h = r * (1 + R() * 0.25);
    p.add(P.sph, CREAM, x, h, z, 0, 0, 0, r, h, r);
    p.add(P.cyl, CREAM, x, h * 1.85, z, 0, 0, 0, r * 0.45, r * 0.6, r * 0.45);
    p.add(P.cyl, "#a8432f", x, h * 2.15, z, 0, 0, 0, r * 0.5, r * 0.08, r * 0.5);
    p.add(P.cyl, "#a8432f", x, h * 0.45, z, 0, 0, 0, r * 0.88, r * 0.3, r * 0.88);
    for (const k of [0.95, 1.25]) p.add(P.cyl, "#231a16", x, h * k, z, 0, 0, 0, r * 1.008, r * 0.05, r * 1.008);
    // Fine vertical strokes between the bands (the kené filling).
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(
        P.box,
        "#231a16",
        x + Math.sin(a) * r * 0.99,
        h * 1.1,
        z + Math.cos(a) * r * 0.99,
        0,
        a,
        0,
        0.012,
        r * 0.25,
        0.004,
      );
    }
  }
  // Paint bowls (red slip, black) and a clay lump.
  p.add(P.cyl, "#8f3f2b", -0.35, 0.03, -0.35, 0, 0, 0, 0.08, 0.06, 0.08);
  p.add(P.cyl, "#a8432f", -0.35, 0.065, -0.35, 0, 0, 0, 0.065, 0.01, 0.065);
  p.add(P.cyl, "#8f3f2b", -0.15, 0.03, -0.48, 0, 0, 0, 0.07, 0.06, 0.07);
  p.add(P.cyl, "#231a16", -0.15, 0.065, -0.48, 0, 0, 0, 0.055, 0.01, 0.055);
  p.add(P.lowSph, "#b4553a", 0.1, 0.06, -0.55, 0, 0, 0, 0.12, 0.07, 0.1);
}

/** Woven palm mat (local, on the ground). */
export function mat(p: Part, P: Protos, w: number, d: number) {
  p.add(P.box, PALM, 0, 0.012, 0, 0, 0, 0, w, 0.02, d);
  for (let i = 0; i < Math.floor(d / 0.16); i++)
    p.add(P.box, PALM_D, 0, 0.024, -d / 2 + 0.08 + i * 0.16, 0, 0, 0, w * 0.98, 0.006, 0.03);
}

/** Low carved stool (local, origin on the ground). */
export function stool(p: Part, P: Protos) {
  p.add(P.box, WOOD, 0, 0.28, 0, 0, 0, 0, 0.46, 0.06, 0.3);
  for (const s of [-1, 1]) p.add(P.box, WOOD_D, 0.17 * s, 0.13, 0, 0, 0, 0, 0.06, 0.26, 0.26);
}

/**
 * A fallen trunk leaning out over the river (kids jump off its tip). Built between world points `a` (base on
 * the bank) and `b` (tip over the water), with broken branch stubs and the root plate at the base.
 */
export function jumpLog(p: Part, P: Protos, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const yaw = Math.atan2(d.x, d.z);
  const pitch = Math.asin(d.y / len);
  // The log as a cylinder lying along its own +Z (rotate a Y cylinder by π/2 about X, then pitch and yaw).
  const m = new THREE.Matrix4().compose(
    mid,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - pitch, yaw, 0, "YXZ")),
    new THREE.Vector3(1, 1, 1),
  );
  p.post = m;
  p.add(P.cyl, "#8d7a62", 0, 0, 0, 0, 0, 0, 0.34, len, 0.34);
  p.add(P.cyl, "#6b5a46", 0, len / 2 + 0.02, 0, 0, 0, 0, 0.3, 0.05, 0.3);
  // Root plate at the base, a few stubs.
  p.add(P.ico, "#5a4636", 0, -len / 2 - 0.1, 0, 0, 0, 0, 0.75, 0.25, 0.75);
  for (const [y, a2, l] of [
    [-0.6, 0.6, 0.7],
    [0.4, -2.2, 0.5],
    [1.3, 2.4, 0.45],
  ] as const)
    p.add(P.cyl6, "#7a6853", Math.cos(a2) * 0.3, y, Math.sin(a2) * 0.3, 0, -a2, Math.PI / 2 - 0.5, 0.07, l, 0.07);
  p.post = null;
}

// ---------------------------------------------------------------- boats

/** A merged vertex-colored geometry for one boat (local frame: bow toward +Z, waterline at y = 0). */
function boatGeometry(build: (p: Part, P: Protos) => void): THREE.BufferGeometry {
  const P = protos();
  const p = new Part();
  build(p, P);
  const g = p.build();
  for (const k of Object.values(P)) k.dispose();
  return g;
}

function hull(p: Part, len: number, w: number, h: number, color: string) {
  const { outer, inner } = hullGeometries(len, w, h);
  const top = h * 0.75;
  p.add(outer, color, 0, top, 0);
  p.add(inner, WOOD_D, 0, top, 0);
  outer.dispose();
  inner.dispose();
  return top;
}

/** The fisherman's dugout (≈ 4.4 u): two thwarts and a palm basket for the catch. */
export function fishingCanoe(): THREE.BufferGeometry {
  return boatGeometry((p, P) => {
    const top = hull(p, 4.4, 0.9, 0.42, "#6e4429");
    for (const z of [-1.2, 1.1]) p.add(P.box, "#a06a3e", 0, top - 0.14, z, 0, 0, 0, 0.7, 0.05, 0.18);
    p.add(P.flare, PALM, 0, top - 0.2, -0.3, Math.PI, 0, 0, 0.18, 0.22, 0.18);
    p.add(P.cyl, PALM_D, 0, top - 0.1, -0.3, 0, 0, 0, 0.18, 0.02, 0.18);
  });
}

/**
 * The peque-peque (≈ 7.6 u): a long plank-sided motor canoe with a palm shade over the middle, banana bunches
 * and sacks of cargo, and its long-tail motor at the stern (−Z): engine block, the long shaft and the prop.
 */
export function pequePeque(): THREE.BufferGeometry {
  return boatGeometry((p, P) => {
    const top = hull(p, 7.6, 1.35, 0.55, "#3d6a8a");
    // Painted gunwale stripe.
    for (const s of [-1, 1]) p.add(P.box, "#e8b631", s * 0.6, top - 0.02, 0, 0, 0, 0, 0.03, 0.05, 5.4);
    for (const z of [-2.6, -0.8, 1.0, 2.4]) p.add(P.box, "#a06a3e", 0, top - 0.16, z, 0, 0, 0, 1.15, 0.05, 0.2);
    // Shade roof on four poles over the middle.
    for (const x of [-0.5, 0.5])
      for (const z of [-1.2, 1.0]) p.add(P.cyl6, WOOD, x, top + 0.55, z, 0, 0, 0, 0.03, 1.2, 0.03);
    p.add(P.box, PALM, 0, top + 1.18, -0.1, 0, 0, 0, 1.3, 0.08, 2.6);
    p.add(P.box, PALM_D, 0, top + 1.13, -0.1, 0, 0, 0, 1.34, 0.05, 2.64);
    // Cargo: banana bunches and sacks.
    for (const [x, z] of [
      [-0.25, 1.7],
      [0.25, 1.95],
      [0, 2.3],
    ] as const) {
      p.add(P.cap, BANANA, x, top + 0.02, z, 0.3, 0, 0, 0.17, 0.2, 0.17);
      p.add(P.cyl6, "#6e5a2e", x, top + 0.28, z, 0, 0, 0, 0.025, 0.2, 0.025);
    }
    p.add(P.ico, "#d8cbb4", 0.25, top - 0.02, 0.4, 0, 0, 0, 0.3, 0.24, 0.3);
    p.add(P.ico, "#c9b48e", -0.25, top - 0.02, 0.1, 0, 0, 0, 0.28, 0.22, 0.3);
    // Long-tail motor: engine on the stern thwart, the shaft trailing into the water, the prop.
    p.add(P.box, "#5a5f63", 0, top + 0.12, -3.3, 0, 0, 0, 0.36, 0.3, 0.42);
    p.add(P.box, "#c4383f", 0, top + 0.3, -3.3, 0, 0, 0, 0.3, 0.08, 0.36);
    p.add(P.cyl6, "#3b3f42", 0, top - 0.25, -4.4, Math.PI / 2 + 0.28, 0, 0, 0.03, 2.2, 0.03);
    p.add(P.box, "#3b3f42", 0, -0.32, -5.45, 0, 0, 0, 0.22, 0.05, 0.05);
    // Tiller handle forward of the engine.
    p.add(P.cyl6, "#3b3f42", 0, top + 0.25, -2.85, Math.PI / 2 - 0.3, 0, 0, 0.02, 0.6, 0.02);
  });
}

/**
 * The cast net (tarrafa): an open cone of mesh with a weighted rim, drawn from a procedural canvas with
 * alpha (a faint veil, a coarse grid of twine and the dark lead line at the rim; transparent, no ink outline). Unit size: radius 1 at the rim, apex at y = 1.
 * The owner scales it (closed bundle → open disc) while it flies.
 */
export function netMesh(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(1, 1, 24, 4, true);
  geo.translate(0, 0.5, 0);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    // A faint veil (the mesh reads as a translucent disc at a distance) under a coarse grid of knotted twine.
    ctx.fillStyle = "rgba(236,228,206,0.32)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(244,238,220,0.95)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }
    // Lead line at the rim (bottom of the cone's UV).
    ctx.fillStyle = "rgba(50,44,40,1)";
    ctx.fillRect(0, 118, 128, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = "comunidad:net";
  return mesh;
}
