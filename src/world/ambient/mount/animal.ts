/**
 * The animal under a road mount (./horse.ts, ./mule.ts, ./model.ts llama): one continuous skinned body from
 * the shared animal builders (../../characters/animals/), its own gait (walk, paso / trot, canter…) driven by
 * the ground speed, and the tack as rigid props riding its bones.
 *
 * The body geometry is built off the main thread (../../characters/animals/assets.ts); the mount's group is
 * there at once and the animal (with its tack) appears when the build lands, a fraction of a second into the
 * world's load. Tack is written in MODEL coordinates (the animal's bind pose: faces +Z, feet at y = 0) inside a
 * holder per bone (`tack("body")`, `tack("head")`…), which is re-anchored on that bone, so a saddle follows the
 * back's bob and roll and a bridle follows the head, with no per-frame work.
 *
 * Draw calls: the body (1), and one vertex-coloured mesh per holder (call `flatten` once the tack is built).
 * Painted blotches off on everything (it moves).
 */
import * as THREE from "three";
import type { AnimalState } from "../../characters/animals/anim-quad";
import { type Animal, createAnimal } from "../../characters/animals/animal";
import { prefetchAnimals } from "../../characters/animals/assets";
import { speciesOf } from "../../characters/animals/species";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";

export interface MountAnimal {
  group: THREE.Group;
  /** The animal once built (null before). */
  animal: Animal | null;
  /** Bind positions of the species' bones (known at once, before the build). */
  rest: Record<string, THREE.Vector3>;
  /** A holder for tack in model coordinates that follows `bone`. */
  tack(bone: string): THREE.Group;
  /** Merge each holder's plain toon meshes into one vertex-coloured mesh (call after building the tack). */
  flatten(): void;
  /** Merge one more node (a swinging stirrup group) the same way. */
  merge(node: THREE.Object3D): void;
  update(dt: number, t: number, s: AnimalState): void;
  /** Keep a geometry for disposal (tack built by the mount). */
  own<T extends THREE.BufferGeometry>(g: T): T;
  /** A frame along the face (origin at the muzzle base, +Z down the face, +Y up the forehead) for bridles. */
  face(): THREE.Group;
  /** Resolves when the animal is in the scene. */
  ready: Promise<Animal>;
  dispose(): void;
}

export function mountAnimal(
  key: string,
  o: { variant?: string; features?: Record<string, boolean>; seed?: number } = {},
): MountAnimal {
  const spec = speciesOf(key);
  const group = new THREE.Group();
  const rest: Record<string, THREE.Vector3> = {};
  for (const b of spec.plan().kit.skeleton()) rest[b.name] = new THREE.Vector3(...b.at);
  const holders = new Map<string, THREE.Group>();
  const mat = paintStrength(vertexToon(), 0);
  let animal: Animal | null = null;
  let disposed = false;
  let pending: AnimalState | null = null;
  const owned: THREE.BufferGeometry[] = [];

  const attach = (a: Animal) => {
    for (const [bone, h] of holders) {
      const b = a.inst.bones[bone];
      if (!b) continue;
      b.add(h);
      h.visible = true;
    }
  };

  const ready = prefetchAnimals([key], [0]).then(() => {
    if (disposed) throw new Error("animals: mount disposed before it was built");
    const a = createAnimal(key, {
      lod: 0,
      ...(o.variant ? { variant: o.variant } : {}),
      seed: o.seed ?? 7,
      ...(o.features ? { features: o.features } : {}),
    });
    animal = a;
    m.animal = a;
    group.add(a.group);
    attach(a);
    if (pending) a.update(0, 0, pending);
    return a;
  });
  ready.catch(() => {});

  const m: MountAnimal = {
    group,
    animal: null,
    rest,
    tack(bone) {
      let h = holders.get(bone);
      if (!h) {
        h = new THREE.Group();
        h.name = `tack:${bone}`;
        const r = rest[bone];
        if (r) h.position.set(-r.x, -r.y, -r.z);
        h.visible = false;
        holders.set(bone, h);
        if (animal) attach(animal);
      }
      return h;
    },
    flatten() {
      for (const h of holders.values()) {
        h.name = h.name || "tack";
        flattenToonGroup(h, mat);
        h.traverse((x) => {
          const mesh = x as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
      }
    },
    own(g) {
      owned.push(g);
      return g;
    },
    face() {
      // The head bone sits at the top of the neck; the muzzle axis comes from the species' plan.
      const p = spec.plan().kit;
      const f = new THREE.Group();
      f.name = "tack:face";
      const muz = p.prims.find((x) => x.shape.kind === "cone" && x.bone === p.b("head"));
      if (muz && muz.shape.kind === "cone") {
        const a = new THREE.Vector3(...muz.shape.a);
        const b = new THREE.Vector3(...muz.shape.b);
        const d = b.clone().sub(a).normalize();
        f.position.copy(a);
        f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      }
      m.tack("head").add(f);
      return f;
    },
    merge(node) {
      flattenToonGroup(node, mat);
      node.traverse((x) => {
        if ((x as THREE.Mesh).isMesh) x.castShadow = true;
      });
    },
    update(dt, t, s) {
      if (animal) animal.update(dt, t, s);
      else pending = s;
    },
    ready,
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const h of holders.values())
        h.traverse((x) => {
          const mesh = x as THREE.Mesh;
          if (mesh.isMesh && mesh.name.endsWith(":vc")) mesh.geometry.dispose();
        });
      for (const x of owned) x.dispose();
      mat.dispose();
      animal?.dispose();
    },
  };
  return m;
}
