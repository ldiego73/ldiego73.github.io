/**
 * The action state machine of the human animation controller (pure, no DOM, no Three): which pose action
 * (./poses.ts) is playing, how long it has played, and the crossfade from the previous one. One-shot actions
 * (a kick, a jump, a greeting bow) return to whatever comes next by themselves.
 *
 *   const m = new ActionMixer();
 *   m.play("wave", { fade: 0.25 });
 *   m.step(dt);
 *   for (const l of m.layers()) applyPose(l.action, l.t, l.weight);
 */
import type { Action } from "./poses";

/** Length (s) of one-shot actions; anything else loops until replaced. */
export const ONE_SHOT: Partial<Record<Action, number>> = {
  kick: 0.8,
  jump: 1.25,
  greet: 2.3,
};

export interface PlayOpts {
  /** Crossfade time (s, default 0.3). */
  fade?: number;
  /** Leading hand (1 right, −1 left). */
  side?: 1 | -1;
  /** Seat height for sitting actions (body units). */
  seat?: number;
  /** Start again even if this action is already playing (a second kick). */
  restart?: boolean;
  /** What follows a one-shot action (default "none"). */
  next?: Action;
}

export interface ActionLayer {
  action: Action;
  t: number;
  side: 1 | -1;
  seat: number;
  next: Action;
}

export class ActionMixer {
  cur: ActionLayer = { action: "none", t: 0, side: 1, seat: 0, next: "none" };
  prev: ActionLayer | null = null;
  /** Weight of `cur` during a crossfade (1 = settled). */
  w = 1;
  private rate = 1 / 0.3;

  get action(): Action {
    return this.cur.action;
  }

  play(action: Action, o: PlayOpts = {}) {
    const same = action === this.cur.action;
    if (same && !o.restart) {
      if (o.side) this.cur.side = o.side;
      if (o.seat !== undefined) this.cur.seat = o.seat;
      return;
    }
    const fade = o.fade ?? 0.3;
    // Fading from a half-faded state keeps the stronger of the two as the one to leave.
    this.prev = this.w >= 0.5 || !this.prev ? this.cur : this.prev;
    this.cur = { action, t: 0, side: o.side ?? 1, seat: o.seat ?? 0, next: o.next ?? "none" };
    this.w = fade > 0 ? 0 : 1;
    this.rate = fade > 0 ? 1 / fade : Infinity;
    if (this.w >= 1) this.prev = null;
  }

  step(dt: number) {
    this.cur.t += dt;
    if (this.prev) this.prev.t += dt;
    if (this.w < 1) {
      this.w = Math.min(1, this.w + dt * this.rate);
      if (this.w >= 1) this.prev = null;
    }
    const len = ONE_SHOT[this.cur.action];
    if (len !== undefined && this.cur.t >= len) this.play(this.cur.next, { fade: 0.25, side: this.cur.side });
  }

  /** Active layers with their weights (prev first); weights sum to 1. */
  layers(): Array<ActionLayer & { weight: number }> {
    const out: Array<ActionLayer & { weight: number }> = [];
    const ease = this.w * this.w * (3 - 2 * this.w);
    if (this.prev && ease < 1) out.push({ ...this.prev, weight: 1 - ease });
    out.push({ ...this.cur, weight: this.prev ? ease : 1 });
    return out;
  }
}
