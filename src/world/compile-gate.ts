import type * as THREE from "three";

/**
 * Shader warm-up gate. Characters and animals (./characters/**) are heavy toon programs (skinning, batching,
 * wind, night rim), and the first frame that draws a new one compiles and links it on the main thread: with
 * several crowds, herds and props arriving after load that is seconds of frozen input on a slow GPU or
 * software GL. A mesh handed to `gateCompile` stays out of every camera (layer mask 0) until the engine has
 * compiled its materials off the main thread (`renderer.compileAsync`, KHR_parallel_shader_compile), then it
 * appears with its program ready. Visibility, LOD and everything else stay with the owner: only the layer mask
 * is borrowed and restored.
 *
 * The gate is a no-op until an engine opens it (./engine.ts), so harnesses with their own renderer draw at once.
 */

/** The engine side: compile and reveal what was gated. Set by `openCompileGate`. */
type Drain = (obj: THREE.Object3D, done: () => void) => void;

let drain: Drain | null = null;
const pending = new Set<THREE.Object3D>();
/** Safety net: reveal anyway if a compile never reports (lost context, missing extension quirks). */
const MAX_WAIT_MS = 4000;

/** Keep `obj` (and every mesh under it) out of view until its shaders are compiled. */
export function gateCompile(obj: THREE.Object3D): void {
  if (!drain || pending.has(obj)) return;
  const masks: [THREE.Object3D, number][] = [];
  obj.traverse((o) => {
    masks.push([o, o.layers.mask]);
    o.layers.mask = 0;
  });
  pending.add(obj);
  let open = false;
  const reveal = () => {
    if (open) return;
    open = true;
    pending.delete(obj);
    for (const [o, m] of masks) if (o.layers.mask === 0) o.layers.mask = m;
  };
  setTimeout(reveal, MAX_WAIT_MS);
  drain(obj, reveal);
}

/** Called by the engine once its renderer, scene and camera exist. Returns the close function. */
export function openCompileGate(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): () => void {
  drain = (obj, done) => {
    renderer.compileAsync(obj, camera, scene).then(done, done);
  };
  return () => {
    drain = null;
    pending.clear();
  };
}
