/**
 * Shared frame context and group interface of the Antisuyu community (comunidad.ts and its groups). The same
 * shape as the mountain people's (../../../ambient/people/types.ts) but on the jungle env (`env.selva`).
 */
import type * as THREE from "three";
import type { L } from "../../../contract";
import type { SelvaEnv } from "../../contract";

export interface Ctx {
  env: SelvaEnv;
  dt: number;
  clock: number;
  /** Day time 0..1 (0.25 sunrise, 0.75 sunset). */
  time: number;
  /** The clock jumped (T key, dev hook): snap people to where they should be. */
  jump: boolean;
  avatar: THREE.Vector3;
  rm: boolean;
  /** The traveler rides the canoe (ride.active). */
  riding: boolean;
  camera: THREE.Vector3;
  /** View distance for people (shorter on the low tier / phones). */
  view: number;
  /** true when a world point is on screen and within `max` of the camera (for unseen relocation). */
  seen(x: number, y: number, z: number, max?: number): boolean;
}

/** Somebody the traveler can greet ("E · Saludar"): where their head is and what they say. */
export interface Greeter {
  head: THREE.Vector3;
  text: L;
  /** Called on greet (wave back). */
  greet(): void;
}

export interface Group {
  readonly name: string;
  center: THREE.Vector3;
  radius: number;
  update(ctx: Ctx, visible: boolean): void;
  /** The nearest greeter within reach of the traveler, if any. */
  greeter?(ctx: Ctx): Greeter | null;
  people(): number;
  /** Dev: points of interest for screenshots. */
  points?(): Array<{ x: number; z: number }>;
  /** Dev (screenshots): jump a behaviour to a given moment. */
  dev?: Record<string, (...args: number[]) => unknown>;
  dispose(): void;
}
