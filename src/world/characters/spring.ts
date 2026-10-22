/**
 * Damped springs for secondary motion: the chullo's pompom and tassels, the campesina's braids, the poncho and
 * pollera hems, the llama's ears. Each spring is one angle (or offset) chasing a target with stiffness k and
 * damping c; chains of them lag one behind the other, which is what makes a braid swing instead of pivot.
 *
 * Semi-implicit Euler in fixed sub-steps (≤ 1/120 s), so a long frame (tab switch, slow phone) never blows a
 * stiff spring up. Pure (no DOM, no Three).
 */

export interface Spring {
  x: number;
  v: number;
}

export const spring = (x = 0): Spring => ({ x, v: 0 });

/** Largest sub-step (seconds). */
export const SPRING_MAX_STEP = 1 / 120;

/** Advance one spring toward `target`. Returns the new value. */
export function springStep(s: Spring, target: number, k: number, c: number, dt: number): number {
  if (!(dt > 0)) return s.x;
  const n = Math.max(1, Math.ceil(dt / SPRING_MAX_STEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -k * (s.x - target) - c * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
  return s.x;
}

/** Damping for a given stiffness and damping ratio ζ (1 = critical: no overshoot). */
export const dampingFor = (k: number, zeta: number) => 2 * zeta * Math.sqrt(k);

/**
 * A chain of angular springs (pitch and roll per link) driven by the motion of its anchor.
 * Each link's target is the parent's angle plus a drag from the anchor's acceleration and velocity (in the
 * anchor's local frame: +z forward, +x left) and an optional lateral push (wind). Deeper links are softer, so
 * the tip lags most.
 */
export interface Chain {
  pitch: Spring[];
  roll: Spring[];
  /** Base stiffness and damping ratio; link i uses k × soften^i. */
  k: number;
  zeta: number;
  soften: number;
}

export function chain(links: number, k: number, zeta: number, soften = 0.75): Chain {
  return {
    pitch: Array.from({ length: links }, () => spring()),
    roll: Array.from({ length: links }, () => spring()),
    k,
    zeta,
    soften,
  };
}

export interface ChainDrive {
  /** Anchor acceleration in its local frame (units/s²): forward (z) and sideways (x). */
  accZ: number;
  accX: number;
  /** Steady drag from moving through the air (units/s) along z, and a lateral push (wind) along x. */
  velZ: number;
  pushX: number;
  /** How strongly acceleration and drag tilt the chain (radians per unit). */
  gainAcc: number;
  gainVel: number;
  /** Resting pitch of the whole chain (e.g. braids lie on the back). */
  rest: number;
  /** Clamp of each link's angle (radians). */
  limit: number;
}

/** Step the chain; writes each link's angle relative to its parent link (what a bone chain wants). */
export function chainStep(ch: Chain, d: ChainDrive, dt: number, outPitch: number[], outRoll: number[]) {
  const n = ch.pitch.length;
  // A body accelerating forward leaves the chain behind (it tips backward: negative pitch is "back").
  const tp = clamp(d.rest - d.accZ * d.gainAcc - d.velZ * d.gainVel, -d.limit, d.limit);
  const tr = clamp(d.accX * d.gainAcc + d.pushX * d.gainVel, -d.limit, d.limit);
  let parentP = 0;
  let parentR = 0;
  for (let i = 0; i < n; i++) {
    const k = ch.k * ch.soften ** i;
    const c = dampingFor(k, ch.zeta);
    // Every link aims at the chain's absolute target; the lag accumulates down the chain.
    const want = i === 0 ? tp : parentP + (tp - parentP) * 0.6;
    const wantR = i === 0 ? tr : parentR + (tr - parentR) * 0.6;
    const p = springStep(ch.pitch[i] as Spring, want, k, c, dt);
    const r = springStep(ch.roll[i] as Spring, wantR, k, c, dt);
    outPitch[i] = clamp(p - parentP, -d.limit, d.limit);
    outRoll[i] = clamp(r - parentR, -d.limit, d.limit);
    parentP = p;
    parentR = r;
  }
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
