/**
 * One crowd for every person of the coast. The walkers and beach people (../gente.ts), the gathering at the
 * headland (../reunion.ts) and the caballito fishermen out at sea (../caballito.ts) are members of the same
 * `HumanCrowd` and their tools and loads share one `HeldProps`. That keeps the whole coast's people at two
 * draw calls for the bodies and cloth (plus their shadow and ink passes) and one per prop kind, instead of a
 * crowd per ambient.
 *
 * Shared per scene and reference counted: the first ambient that asks creates it, the last one to let go
 * disposes it. Each ambient calls `frame(camera)` after committing its own people. `HumanCrowd.update` and
 * `HeldProps.update` are idempotent within a frame, so calling them from each ambient costs little and needs
 * no ordering between the ambients.
 */
import type * as THREE from "three";
import { HumanCrowd } from "../../../characters/crowd";
import { prefetchHumans } from "../../../characters/pipeline";
import { HeldProps } from "../../../characters/props";
import { COAST_SPECS } from "./dress";

/** Room for everyone: gente (≈ 38 at high quality), the gathering (8) and the fishermen at sea (4). */
const CAPACITY = 56;

export interface CoastCrowd {
  crowd: HumanCrowd;
  props: HeldProps;
  /** LOD switching, bone and palette uploads, props following their bones: after this ambient's commits. */
  frame(camera: THREE.Camera): void;
  release(): void;
}

const shared = new WeakMap<THREE.Scene, { crowd: HumanCrowd; props: HeldProps; users: number }>();

export function coastCrowd(scene: THREE.Scene, low: boolean): CoastCrowd {
  let s = shared.get(scene);
  if (!s) {
    // Builds start now (in a worker, far LODs first) so the people are ready by the time the traveler arrives.
    prefetchHumans([...COAST_SPECS]);
    const crowd = new HumanCrowd({
      capacity: CAPACITY,
      name: "costa:people",
      lodDist: low ? [7, 20] : [9, 26],
      maxDist: 140,
    });
    const props = new HeldProps(24);
    props.group.name = "costa:people-props";
    scene.add(crowd.group, props.group);
    s = { crowd, props, users: 0 };
    shared.set(scene, s);
  }
  s.users++;
  const own = s;
  let released = false;
  return {
    crowd: own.crowd,
    props: own.props,
    frame(camera) {
      own.crowd.update(camera);
      own.props.update();
    },
    release() {
      if (released) return;
      released = true;
      if (--own.users > 0) return;
      shared.delete(scene);
      own.crowd.dispose();
      own.props.dispose();
    },
  };
}
