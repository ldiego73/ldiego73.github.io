/**
 * Static pieces for the torrent ducks (duck.ts): the wet river boulders they perch on, and the body's
 * waterline. The ducks themselves are the shared animal (characters/animals "duck").
 */
import * as THREE from "three";

/** Height of the body's waterline above the feet (swimming: root sits this far under the surface). */
export const WATERLINE = 0.082;

/** A wet river boulder: jittered icosahedron with a flat top to stand on. Unit radius, top at y=0.55. */
export function rockGeometry(seed = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 7 + seed) * Math.cos(z * 5 - seed) + 0.06 * Math.sin(y * 9 + seed * 2);
    p.setXYZ(i, x * k, Math.min(0.55, y * k), z * k);
  }
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute("uv");
  out.computeVertexNormals();
  return out;
}
