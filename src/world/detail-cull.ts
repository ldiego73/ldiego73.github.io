/**
 * Distance culling for small details (torches, cabinet parts, khipu knots, signs, props).
 * Three.js only frustum-culls; at 150–760 units of fog the whole mountain is in view, so hundreds of tiny
 * meshes far away still cost a draw call in every pass (color, ink prepass, shadows). Small meshes are
 * hidden by distance through their layer mask (not `visible`, which content and ambients toggle for their
 * own fades), checked a slice per frame.
 */
import * as THREE from "three";
import { detectDevice } from "./quality";

/**
 * World radius → max camera distance. Chosen so a mesh is hidden only once it would cover fewer than
 * ~4 px on a 900 px tall view (50° fov): no visible loss, still drops most far draw calls.
 * Larger meshes are never culled.
 */
export const CULL_BANDS: Array<[radius: number, distance: number]> = [
  [0.35, 85],
  [0.9, 200],
  [2, 420],
];

/**
 * Phones: a smaller, denser screen (and the "low" tier's shorter fog) makes the same detail cover fewer
 * pixels, and draw calls cost more on mobile GPUs: details drop at 70% of the desktop distance.
 */
export const PHONE_CULL = 0.7;

/** Max camera distance for a mesh of world radius `radius`; `factor` scales the bands (PHONE_CULL on phones). */
export function cullDistance(radius: number, factor = 1): number {
  for (const [r, d] of CULL_BANDS) if (radius <= r) return d * factor;
  return Number.POSITIVE_INFINITY;
}

/** The band factor for the running device. */
export const deviceCullFactor = () => (detectDevice().phone ? PHONE_CULL : 1);

interface Entry {
  obj: THREE.Mesh;
  center: THREE.Vector3;
  d2: number;
  mask: number;
  hidden: boolean;
}

export interface DetailCull {
  /** Number of registered meshes. */
  readonly size: number;
  /** Re-scan the scene for new meshes (after content and ambients are built). */
  scan(): void;
  update(camera: THREE.Vector3): void;
  dispose(): void;
}

export function createDetailCull(
  root: THREE.Object3D,
  opts: { skip?: (o: THREE.Object3D) => boolean; factor?: number } = {},
): DetailCull {
  const factor = opts.factor ?? deviceCullFactor();
  const entries: Entry[] = [];
  const known = new WeakSet<THREE.Object3D>();
  const tmp = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let cursor = 0;

  const skipped = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (opts.skip?.(p)) return true;
    return false;
  };

  const scan = () => {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || known.has(m)) return;
      known.add(m);
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (!m.frustumCulled || m.layers.mask === 0 || skipped(m)) return;
      // Instanced meshes only opt in (flora tiles set userData.cullDistance, measured from the tile's edge).
      const inst = (m as THREE.InstancedMesh).isInstancedMesh;
      const own = m.userData.cullDistance as number | undefined;
      if (inst && !own) return;
      if (inst) (m as THREE.InstancedMesh).computeBoundingSphere();
      if (!inst && !m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const bs = inst ? (m as THREE.InstancedMesh).boundingSphere : m.geometry.boundingSphere;
      if (!bs) return;
      m.matrixWorld.decompose(tmp, new THREE.Quaternion(), scale);
      const r = bs.radius * Math.max(scale.x, scale.y, scale.z);
      const d = own ? own + r : cullDistance(r, factor);
      if (!Number.isFinite(d)) return;
      entries.push({ obj: m, center: bs.center.clone(), d2: d * d, mask: m.layers.mask, hidden: false });
    });
  };

  return {
    get size() {
      return entries.length;
    },
    scan,
    update(camera) {
      // ~1/8 of the list per frame: every mesh is revisited several times a second.
      const n = entries.length;
      if (!n) return;
      const step = Math.max(32, Math.ceil(n / 8));
      for (let k = 0; k < step && k < n; k++) {
        cursor = (cursor + 1) % n;
        const e = entries[cursor]!;
        if (!e.obj.parent) continue;
        tmp.copy(e.center).applyMatrix4(e.obj.matrixWorld);
        const far = tmp.distanceToSquared(camera) > e.d2;
        if (far === e.hidden) continue;
        if (far) {
          // Content may have moved the mesh to another layer (noOutline) since the scan.
          e.mask = e.obj.layers.mask;
          e.obj.layers.mask = 0;
        } else e.obj.layers.mask = e.mask;
        e.hidden = far;
      }
    },
    dispose() {
      for (const e of entries) if (e.hidden) e.obj.layers.mask = e.mask;
      entries.length = 0;
    },
  };
}
