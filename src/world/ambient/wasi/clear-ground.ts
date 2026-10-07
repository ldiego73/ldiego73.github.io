/**
 * Clears scattered ground cover (ichu, flowers, shrubs, small rocks) from places an ambient builds on.
 * The scenery's vegetation and rocks are instanced and planted on every open-grass cell (layout isGrass);
 * the Wasi house and the Antisuyu branch sit on such cells, so without this ichu would poke through the
 * floorboards and the path. Matching instances are collapsed to a zero scale once, at create time.
 *
 * Stopgap: it edits the scenery's instance matrices (owned by terrain.ts / flora/). The proper fix is a
 * core one: a pad for these places in layout.ts that `isGrass` rejects (see the Wasi report).
 */
import * as THREE from "three";

/** Instanced meshes under these groups hold scenery (not creatures, trail curbs or other ambients). */
const SCENERY = "scenery";

export function clearGround(scene: THREE.Object3D, inside: (x: number, z: number) => boolean): number {
  let cleared = 0;
  const m = new THREE.Matrix4();
  const w = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const meshes: THREE.InstancedMesh[] = [];
  scene.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh) return;
    for (let q: THREE.Object3D | null = im.parent; q; q = q.parent)
      if (q.name === SCENERY) {
        meshes.push(im);
        return;
      }
  });
  for (const im of meshes) {
    im.updateWorldMatrix(true, false);
    let touched = false;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      w.multiplyMatrices(im.matrixWorld, m);
      p.setFromMatrixPosition(w);
      if (!inside(p.x, p.z)) continue;
      im.setMatrixAt(i, zero);
      touched = true;
      cleared++;
    }
    if (touched) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  return cleared;
}
