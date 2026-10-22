/**
 * The bromeliad (achupalla) the spectacled bear eats: a low-poly rosette with baked vertex colours (green
 * blades, a red heart), base at the origin. The bear itself is the shared animal (characters/animals "bear").
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Piece = THREE.BufferGeometry;

/** Flat-colored, non-indexed piece with only position/normal/color. */
function paint(g: Piece, color: THREE.ColorRepresentation): Piece {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  for (const k of Object.keys(flat.attributes)) if (k !== "position" && k !== "normal") flat.deleteAttribute(k);
  const c = new THREE.Color(color);
  const n = flat.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  flat.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return flat;
}

function mergeColored(parts: Piece[]): Piece {
  const out = mergeGeometries(parts) as Piece;
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** A terrestrial bromeliad (achupalla) rosette: green blades with red-tipped heart. Base at the origin. */
export function propGeometry(): Piece {
  const parts: Piece[] = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.39996;
    const blade = new THREE.ConeGeometry(0.03, 0.3, 4);
    blade.translate(0, 0.15, 0);
    blade.rotateX(0.55 + (k % 3) * 0.12);
    blade.rotateY(a);
    parts.push(paint(blade, k % 2 ? "#4f8a3a" : "#3f7a35"));
  }
  for (let k = 0; k < 4; k++) {
    const heart = new THREE.ConeGeometry(0.028, 0.16, 4);
    heart.translate(0, 0.08, 0);
    heart.rotateX(0.25);
    heart.rotateY(k * 1.57);
    parts.push(paint(heart, "#d2382d"));
  }
  return mergeColored(parts);
}
