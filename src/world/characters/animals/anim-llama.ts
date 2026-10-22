/**
 * The prototype's llama animator, kept for ../index.ts and the characters harness: the generic quadruped
 * animator (./anim-quad.ts) on the llama's motion, with the prototype's idle / walk / run modes mapped to
 * ground speeds (walk 1.0, run 2.4: the lateral walk and the pace). The t'ikas are shown, the pack hidden.
 */
import type { Mode } from "../anim-human";
import type { CharacterInstance } from "../character";
import { QuadAnimator } from "./anim-quad";
import type { QuadMotion } from "./spec";
import { LLAMA } from "./species/camelids";

const SPEED: Record<Mode, number> = { idle: 0, walk: 1.0, run: 2.4 };

export class LlamaAnimator {
  private q: QuadAnimator;
  constructor(inst: CharacterInstance) {
    this.q = new QuadAnimator(inst, LLAMA.motion as QuadMotion, 1);
    this.q.features = { tika: true, pack: false };
  }
  get hold() {
    return this.q.hold;
  }
  set hold(p: number | null) {
    this.q.hold = p;
  }
  update(dt: number, t: number, s: { mode: Mode; rm: boolean; windX?: number }) {
    this.q.update(dt, t, { speed: SPEED[s.mode], rm: s.rm, windX: s.windX ?? 0 });
  }
}
