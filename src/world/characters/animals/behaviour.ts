/**
 * Idle behaviours of animals: what a standing animal does between steps. A species weights the actions it
 * has (a llama grazes, chews and looks around; a cat grooms and yawns; a bird preens), and a small seeded
 * scheduler picks one now and then, plays it with an envelope (fade in, hold, fade out) and leaves gaps of
 * plain standing between them. Moving cancels the action (it fades out); reduced motion keeps only the calm
 * ones (look, chew, graze, sleep) and spaces them out.
 *
 *   graze    neck and head down to the ground, nibbling (herbivores)
 *   chew     jaw grinding in bursts (camelids, rodents, cattle-like)
 *   look     head turns to a side and holds (everyone)
 *   groom    head turns back to the flank (cats, rodents, monkeys; birds: preen)
 *   scratch  a hind foot lifts toward the head (dogs, cats, rodents)
 *   yawn     jaw opens wide, eyes closed (cats, dogs, bears, monkeys)
 *   shake    a quick shiver along the body (wet or dusty animals)
 *   sleep    lie down, eyes closed, slow breathing (long; only when the world says it is quiet)
 *   sit      haunches down (dogs, cats, vizcachas sit up)
 *   stretch  birds open and raise both wings for a moment (flamingos, herons); quadrupeds bow, forelegs out
 *
 * The animators (./anim-quad.ts, ./anim-bird.ts) turn {action, t, w} into a pose; the scheduler only decides
 * what and when. Deterministic per seed (a herd does not graze in lockstep).
 *
 * Pure (no DOM, no Three).
 */

export type IdleAction =
  | "none"
  | "graze"
  | "chew"
  | "look"
  | "groom"
  | "scratch"
  | "yawn"
  | "shake"
  | "sleep"
  | "sit"
  | "stretch";

export interface IdleProfile {
  /** Relative weights of the actions a species does (missing = never). */
  weights: Partial<Record<Exclude<IdleAction, "none">, number>>;
  /** Plain standing between actions, seconds [min, max]. */
  gap?: [number, number];
}

/** Duration range (seconds) and envelope fade times of each action. */
export const IDLE_TIMES: Record<
  Exclude<IdleAction, "none">,
  { min: number; max: number; fadeIn: number; fadeOut: number }
> = {
  graze: { min: 4, max: 9, fadeIn: 0.7, fadeOut: 0.6 },
  chew: { min: 2, max: 5, fadeIn: 0.2, fadeOut: 0.3 },
  look: { min: 1.5, max: 3.2, fadeIn: 0.45, fadeOut: 0.45 },
  groom: { min: 1.8, max: 3.2, fadeIn: 0.4, fadeOut: 0.4 },
  scratch: { min: 1.1, max: 1.8, fadeIn: 0.25, fadeOut: 0.3 },
  yawn: { min: 1.5, max: 1.9, fadeIn: 0.35, fadeOut: 0.4 },
  shake: { min: 0.7, max: 0.9, fadeIn: 0.08, fadeOut: 0.15 },
  sleep: { min: 10, max: 24, fadeIn: 1.4, fadeOut: 1.0 },
  stretch: { min: 1.4, max: 2.2, fadeIn: 0.45, fadeOut: 0.5 },
  sit: { min: 4, max: 10, fadeIn: 0.8, fadeOut: 0.7 },
};

const CALM = new Set<IdleAction>(["look", "chew", "graze", "sleep", "sit"]);

export interface IdleState {
  action: IdleAction;
  /** Progress 0..1 through the action. */
  t: number;
  /** Envelope 0..1 (fade in, hold, fade out). */
  w: number;
  /** Seconds into the action. */
  time: number;
  /** A per-action random in [-1, 1] (look direction, groom side). */
  side: number;
}

/** Small xorshift RNG (deterministic per seed). */
export function rng(seed: number) {
  let s = seed | 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export class IdleScheduler {
  readonly state: IdleState = { action: "none", t: 0, w: 0, time: 0, side: 0 };
  private dur = 0;
  private gapLeft: number;
  private fading = false;
  private rand: () => number;

  constructor(
    private profile: IdleProfile,
    seed = 1,
  ) {
    this.rand = rng(seed);
    const [g0, g1] = profile.gap ?? [2, 6];
    this.gapLeft = g0 + this.rand() * (g1 - g0);
  }

  /**
   * Advance. `moving`: the animal walks (actions fade out, none start). `quiet`: sleep allowed (night, nobody
   * near). `rm`: reduced motion (calm actions only, longer gaps).
   */
  step(dt: number, ctx: { moving: boolean; rm: boolean; quiet?: boolean }): IdleState {
    const s = this.state;
    if (s.action !== "none") {
      s.time += dt;
      const times = IDLE_TIMES[s.action];
      if (ctx.moving && !this.fading) {
        // Cut short: fade out from wherever we are.
        this.fading = true;
        this.dur = s.time + times.fadeOut * s.w;
      }
      s.t = Math.min(1, s.time / this.dur);
      const fadeIn = Math.min(1, s.time / times.fadeIn);
      const fadeOut = Math.min(1, Math.max(0, (this.dur - s.time) / times.fadeOut));
      s.w = Math.min(fadeIn, fadeOut, this.fading ? s.w : 1);
      if (s.time >= this.dur) this.end(ctx.rm);
      return s;
    }
    if (ctx.moving) return s;
    this.gapLeft -= dt;
    if (this.gapLeft > 0) return s;
    const next = this.choose(ctx.rm, !!ctx.quiet);
    if (next === "none") {
      this.end(ctx.rm);
      return s;
    }
    const times = IDLE_TIMES[next];
    s.action = next;
    s.time = 0;
    s.t = 0;
    s.w = 0;
    s.side = this.rand() * 2 - 1;
    this.dur = times.min + this.rand() * (times.max - times.min);
    this.fading = false;
    return s;
  }

  private end(rm: boolean) {
    const s = this.state;
    s.action = "none";
    s.t = 0;
    s.w = 0;
    s.time = 0;
    this.fading = false;
    const [g0, g1] = this.profile.gap ?? [2, 6];
    this.gapLeft = (g0 + this.rand() * (g1 - g0)) * (rm ? 1.8 : 1);
  }

  private choose(rm: boolean, quiet: boolean): IdleAction {
    let total = 0;
    const list: Array<[IdleAction, number]> = [];
    for (const [k, w] of Object.entries(this.profile.weights) as Array<[IdleAction, number]>) {
      if (!w || w <= 0) continue;
      if (rm && !CALM.has(k)) continue;
      if (k === "sleep" && !quiet) continue;
      list.push([k, w]);
      total += w;
    }
    if (!total) return "none";
    let r = this.rand() * total;
    for (const [k, w] of list) {
      r -= w;
      if (r <= 0) return k;
    }
    return (list[list.length - 1] as [IdleAction, number])[0];
  }

  /** Force an action now (a world event: a fox yawns when the traveler sits down; tests). */
  play(action: Exclude<IdleAction, "none">, seconds?: number) {
    const s = this.state;
    const times = IDLE_TIMES[action];
    s.action = action;
    s.time = 0;
    s.t = 0;
    s.w = 0;
    s.side = this.rand() * 2 - 1;
    this.dur = seconds ?? (times.min + times.max) / 2;
    this.fading = false;
  }
}
