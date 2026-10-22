/**
 * The jungle's animals on the shared animal core (../../../characters/animals): each fauna ambient keeps its
 * own simulation (where an animal is, how fast it goes, where it looks) and hands every animal to a `Beasts`
 * set once per frame; the core does the bodies, the gaits, the flight and the idles.
 *
 *   const pigs = createBeasts(env, "sajino", 7);
 *   env.scene.add(pigs.group);
 *   // every frame:
 *   pigs.begin();
 *   pigs.put(i, x, y, z, yaw, { speed, rm, look });     // the ones that are out
 *   pigs.end(dt, clock, env.camera);                     // the others hide; poses, LOD
 *
 * Two ways to draw a species:
 *  - a herd (default): one InstancedMesh per LOD for all of them (`createHerd`), yaw only; `scale` draws the
 *    whole herd larger or smaller than life (a capybara family's pups, the turtles): the herd's group is
 *    scaled and the positions and the camera handed to it are divided by the scale, so its LOD distances
 *    stay right (a herd has no per-animal scale);
 *  - `solo`: one skinned animal each (`loadAnimal`), for the few animals whose pose needs a full transform:
 *    a sloth along a sloping limb, a dolphin's arc, a hopping agouti, the big howler (scale), the jaguar.
 *    Each solo costs its own draw (+ ink and shadow), so only species with one to three animals use it.
 * Geometry is built off the main thread (`prefetchAnimals`): the set shows nothing until its far LOD is in,
 * then sharpens as the finer builds land. Nothing here blocks a frame.
 */
import * as THREE from "three";
import type { Animal, AnimalState, BirdState } from "../../../characters/animals/animal";
import { loadAnimal, prefetchAnimals } from "../../../characters/animals/assets";
import type { IdleAction } from "../../../characters/animals/behaviour";
import { createHerd, type Herd } from "../../../characters/animals/crowd";
import type { WorldEnv } from "../../../contract";

export type BeastState = AnimalState & Partial<BirdState>;

export interface Pose3 {
  /** Body pitch (+ = nose down) and roll (radians), uniform scale: solo sets only. */
  pitch?: number;
  roll?: number;
  scale?: number;
}

export interface BeastsOpts {
  /** Coat variants (species variant names or full palettes); `variantOf(i)` picks one per animal. */
  variants?: ReadonlyArray<string | readonly string[]>;
  variantOf?: (i: number) => number;
  /** One skinned animal each (full transform) instead of an instanced herd. */
  solo?: boolean;
  shadows?: boolean;
  /** LOD distance multiplier (phones < 1). */
  lodScale?: number;
  /** Herds: uniform scale of every animal of the set. */
  scale?: number;
}

export interface Beasts {
  readonly group: THREE.Group;
  readonly ready: boolean;
  /** Start a frame: every animal not `put` before `end` is hidden. */
  begin(): void;
  /** `s` is kept by reference until `end` (pass a fresh object or one per animal); speeds in world units. */
  put(i: number, x: number, y: number, z: number, yaw: number, s: BeastState, o?: Pose3): void;
  /** One-shot idles ("graze", "yawn", "shake"…) and the caiman's snap / the cat's pounce. */
  play(i: number, a: Exclude<IdleAction, "none">, seconds?: number): void;
  lunge(i: number): void;
  /** World position of a bone ("head", "jaw"…) after `end` (solo sets; false when it is not drawn). */
  bone(i: number, name: string, out: THREE.Vector3): boolean;
  /** World matrix of a bone (its bind frame is world aligned: +Y up, +Z forward), solo sets only. */
  boneMatrix(i: number, name: string, out: THREE.Matrix4): boolean;
  end(dt: number, t: number, camera: THREE.Camera): void;
  /** Number of animals drawn this frame. */
  shown(): number;
  dispose(): void;
}

interface SoloSlot {
  a: Animal | null;
  on: boolean;
  s: BeastState;
  lodT: number;
  pending: Array<[Exclude<IdleAction, "none">, number | undefined] | "lunge">;
}

export function createBeasts(env: WorldEnv, key: string, n: number, o: BeastsOpts = {}): Beasts {
  const group = new THREE.Group();
  group.name = `selva-fauna-${key}`;
  const shadows = o.shadows ?? env.quality === "high";
  const variantOf = o.variantOf ?? (() => 0);
  let alive = true;
  let count = 0;

  if (o.solo) {
    const slots: SoloSlot[] = Array.from({ length: n }, () => ({
      a: null,
      on: false,
      s: { speed: 0, rm: false },
      lodT: Math.random() * 0.3,
      pending: [],
    }));
    // Far LOD first (it shows at once), then the near ones; each animal is created from the cache.
    void prefetchAnimals([key], [2, 1, 0]).then(() => {
      slots.forEach((slot, i) => {
        const v = o.variants?.[variantOf(i)];
        void loadAnimal(key, { seed: 7 + i * 13, lod: 2, shadows, ...(v ? { variant: v } : {}) }).then((a) => {
          if (!alive) {
            a.dispose();
            return;
          }
          a.group.visible = false;
          a.group.rotation.order = "YXZ";
          group.add(a.group);
          slot.a = a;
        });
      });
    });
    return {
      group,
      get ready() {
        return slots.some((s) => s.a);
      },
      begin() {
        for (const s of slots) s.on = false;
      },
      put(i, x, y, z, yaw, s, p) {
        const slot = slots[i];
        if (!slot?.a) return;
        slot.on = true;
        // Speeds in the animal's own units, so a scaled animal's stride still matches the ground.
        if (p?.scale) s.speed /= p.scale;
        slot.s = s;
        const g = slot.a.group;
        g.position.set(x, y, z);
        g.rotation.set(p?.pitch ?? 0, yaw, p?.roll ?? 0);
        g.scale.setScalar(p?.scale ?? 1);
      },
      play(i, a, seconds) {
        const slot = slots[i];
        if (slot?.a) slot.a.anim.play(a, seconds);
        else slot?.pending.push([a, seconds]);
      },
      lunge(i) {
        slots[i]?.a?.anim.lunge?.();
      },
      bone(i, name, out) {
        const a = slots[i]?.a;
        const b = a?.inst.bones[name];
        if (!a || !b || !a.group.visible) return false;
        a.group.updateMatrixWorld(true);
        b.getWorldPosition(out);
        return true;
      },
      boneMatrix(i, name, out) {
        const a = slots[i]?.a;
        const b = a?.inst.bones[name];
        if (!a || !b || !a.group.visible) return false;
        a.group.updateMatrixWorld(true);
        out.copy(b.matrixWorld);
        return true;
      },
      end(dt, t, camera) {
        count = 0;
        for (const slot of slots) {
          const a = slot.a;
          if (!a) continue;
          if (!slot.on) {
            a.group.visible = false;
            continue;
          }
          for (const p of slot.pending.splice(0)) {
            if (p === "lunge") a.anim.lunge?.();
            else a.anim.play(p[0], p[1]);
          }
          // LOD a few times a second (it also hides the animal beyond the far band).
          slot.lodT -= dt;
          if (slot.lodT <= 0 || !a.group.visible) {
            slot.lodT = 0.25;
            a.group.visible = true;
            a.autoLod(camera, (o.lodScale ?? 1) * a.group.scale.x);
          }
          if (!a.group.visible) continue;
          a.update(dt, t, slot.s);
          count++;
        }
      },
      shown: () => count,
      dispose() {
        alive = false;
        for (const s of slots) s.a?.dispose();
        group.removeFromParent();
      },
    };
  }

  // ---------------------------------------------------------------- herd
  let herd: Herd | null = null;
  const k = o.scale ?? 1;
  group.scale.setScalar(k);
  // The camera as the scaled herd sees it (its group's frame), for its LOD distances.
  const proxy = new THREE.Object3D();
  const camW = new THREE.Vector3();
  const ids: number[] = [];
  const on = new Array<boolean>(n).fill(false);
  void prefetchAnimals([key], [2]).then(() => {
    if (!alive) return;
    herd = createHerd(key, {
      max: Math.max(1, n),
      shadows,
      ...(o.variants ? { variants: o.variants } : {}),
      ...(o.lodScale ? { lodScale: o.lodScale } : {}),
    });
    for (let i = 0; i < n; i++) ids.push(herd.add({ seed: 7 + i * 13, variant: variantOf(i) }));
    group.add(herd.group);
    // The finer LODs arrive later (the herd swaps them in by itself).
    void prefetchAnimals([key], [1, 0]);
  });
  return {
    group,
    get ready() {
      return !!herd;
    },
    begin() {
      on.fill(false);
    },
    put(i, x, y, z, yaw, s) {
      if (!herd || i >= n) return;
      on[i] = true;
      // Speeds in the herd's own units, so a scaled animal's stride still matches the ground.
      if (k !== 1) s.speed /= k;
      herd.set(ids[i] as number, x / k, y / k, z / k, yaw, s);
    },
    play(i, a, seconds) {
      if (herd) herd.play(ids[i] as number, a, seconds);
    },
    lunge(i) {
      if (herd) herd.lunge(ids[i] as number);
    },
    bone: () => false,
    boneMatrix: () => false,
    end(dt, t, camera) {
      count = 0;
      if (!herd) return;
      for (let i = 0; i < n; i++) {
        if (on[i]) count++;
        else herd.hide(ids[i] as number);
      }
      herd.group.visible = count > 0;
      if (count === 0) return;
      if (k === 1) herd.update(dt, t, camera);
      else {
        proxy.position.copy(camera.getWorldPosition(camW)).divideScalar(k);
        proxy.updateMatrixWorld();
        herd.update(dt, t, proxy as THREE.Camera);
      }
    },
    shown: () => count,
    dispose() {
      alive = false;
      herd?.dispose();
      group.removeFromParent();
    },
  };
}
