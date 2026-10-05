import * as THREE from "three";

/** Objects on this layer only are drawn by the main camera but skipped by the outline prepass. */
export const NO_OUTLINE_LAYER = 1;

let gradient: THREE.DataTexture | null = null;

/** 3-step toon ramp (shadow, mid, lit), nearest-filtered so the bands stay crisp. */
export function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([96, 178, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  gradient = t;
  return t;
}

export interface ToonCache {
  toon(
    color: THREE.ColorRepresentation,
    opts?: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number },
  ): THREE.MeshToonMaterial;
  /** A toon material with vertex colors (terrain, merged props). Not cached by color. */
  vertexToon(extra?: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial;
  dispose(): void;
}

export function createToonCache(): ToonCache {
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const extras: THREE.Material[] = [];
  return {
    toon(color, opts) {
      const c = new THREE.Color(color);
      const e = opts?.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : "";
      const key = `${c.getHexString()}|${e}|${opts?.emissiveIntensity ?? ""}`;
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() });
        if (opts?.emissive !== undefined) {
          m.emissive.set(opts.emissive);
          m.emissiveIntensity = opts.emissiveIntensity ?? 1;
        }
        cache.set(key, m);
      }
      return m;
    },
    vertexToon(extra = {}) {
      const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), ...extra });
      extras.push(m);
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      for (const m of extras) m.dispose();
      cache.clear();
      gradient?.dispose();
      gradient = null;
    },
  };
}

/** Moves an object (and its descendants) to the no-outline layer. */
export function noOutline(obj: THREE.Object3D) {
  obj.traverse((o) => o.layers.set(NO_OUTLINE_LAYER));
}
