import type * as THREE from "three";
import type { WorldEnvExtra } from "../../env";

export interface Ctx {
  env: WorldEnvExtra;
  dt: number;
  clock: number;
  /** Day time 0..1 (0.25 sunrise, 0.75 sunset). */
  time: number;
  /** The clock jumped (T key, dev hook): snap people to where they should be, no long walks. */
  jump: boolean;
  avatar: THREE.Vector3;
  rm: boolean;
  low: boolean;
  /** true when a world point is on screen and within `max` of the camera (for unseen relocation). */
  seen(x: number, y: number, z: number, max?: number): boolean;
}

export interface Group {
  readonly name: string;
  center: THREE.Vector3;
  radius: number;
  update(ctx: Ctx, visible: boolean): void;
  prompt?(ctx: Ctx): string | null;
  interact?(ctx: Ctx): boolean;
  escape?(): boolean;
  drawCalls(): number;
  /** Dev: interesting points (stall fronts, the fire). */
  points?(): Array<{ x: number; z: number }>;
  people(): number;
  dispose(): void;
}
