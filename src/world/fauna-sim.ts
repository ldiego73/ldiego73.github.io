/**
 * Pure fauna helpers (no three.js): herd steering (leader-follow boids), procedural gaits,
 * terrain validity and small math. Unit-tested in fauna.test.ts; fauna.ts turns the results into matrices.
 */

export const TAU = Math.PI * 2;

/** Wraps an angle to [-π, π). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Turns angle `a` toward `b` by at most `maxStep` radians (shortest way). */
export function turnToward(a: number, b: number, maxStep: number): number {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

/** Frame-rate independent exponential approach (k = rate per second). */
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- herd steering

export interface Agent {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface FlockParams {
  /** Cruise speed toward the goal (units/s). */
  speed: number;
  /** Flee speed when the traveler presses in. */
  fleeSpeed: number;
  /** Keep this personal space from herd mates. */
  separation: number;
  /** How far behind/around the leader followers settle. */
  cohesion: number;
  /** Start drifting away from the traveler inside this radius… */
  wary: number;
  /** …and bolt inside this radius (or anywhere inside `wary` if the traveler runs). */
  panic: number;
  /** Steering responsiveness (1/s). */
  agility: number;
  /** Ignore a walking traveler entirely (domestic animals); only a running one alarms them. */
  onlyRunners?: boolean;
}

const tv = { x: 0, z: 0 };

export interface Threat {
  x: number;
  z: number;
  /** True while the traveler runs (speed above walk). */
  running: boolean;
}

/**
 * One steering step for a herd. agents[0] is the leader and steers to `goal` (or rests when goal is null);
 * the rest follow the leader with separation + cohesion + alignment. Everyone eases away from the threat.
 * `avoid` (optional) bends each agent's wanted velocity around everything else that moves (other herds,
 * the traveler, predators: creatures.steer) before it is eased in.
 * Mutates velocities in place and returns, per agent, how alarmed it is (0 calm … 1 fleeing).
 */
export function flockStep(
  agents: Agent[],
  goal: { x: number; z: number } | null,
  threat: Threat | null,
  p: FlockParams,
  dt: number,
  avoid?: (i: number, want: { x: number; z: number }) => void,
): number[] {
  const n = agents.length;
  const alarm: number[] = new Array(n).fill(0);
  const lead = agents[0];
  if (!lead) return alarm;
  for (let i = 0; i < n; i++) {
    const a = agents[i] as Agent;
    let dx = 0;
    let dz = 0;
    let want = 0;
    if (i === 0) {
      if (goal) {
        const gx = goal.x - a.x;
        const gz = goal.z - a.z;
        const d = Math.hypot(gx, gz);
        if (d > 0.3) {
          dx = gx / d;
          dz = gz / d;
          want = p.speed * clamp(d / 2, 0.25, 1);
        }
      }
    } else {
      // Follow the leader: aim for a loose ring around it, matching its heading.
      const lx = lead.x - a.x;
      const lz = lead.z - a.z;
      const d = Math.hypot(lx, lz);
      if (d > p.cohesion) {
        dx = lx / d;
        dz = lz / d;
        want = p.speed * clamp((d - p.cohesion) / p.cohesion + 0.35, 0.35, 1.6);
      }
      const ls = Math.hypot(lead.vx, lead.vz);
      if (ls > 0.05) {
        dx += (lead.vx / ls) * 0.35;
        dz += (lead.vz / ls) * 0.35;
        want = Math.max(want, ls * 0.8);
      }
    }
    // Separation from every herd mate.
    let sx = 0;
    let sz = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = agents[j] as Agent;
      const ox = a.x - b.x;
      const oz = a.z - b.z;
      const d = Math.hypot(ox, oz);
      if (d < p.separation && d > 1e-4) {
        const k = (p.separation - d) / p.separation;
        sx += (ox / d) * k;
        sz += (oz / d) * k;
      }
    }
    if (sx || sz) {
      dx += sx * 1.6;
      dz += sz * 1.6;
      want = Math.max(want, p.speed * 0.5 * Math.min(1, Math.hypot(sx, sz)));
    }
    // The traveler: drift off when close, bolt when very close or running at us.
    if (threat && (threat.running || !p.onlyRunners)) {
      const tx = a.x - threat.x;
      const tz = a.z - threat.z;
      const d = Math.hypot(tx, tz);
      const panicR = threat.running ? p.wary : p.panic;
      if (d < p.wary && d > 1e-4) {
        const k = d < panicR ? 1 : (p.wary - d) / (p.wary - panicR);
        alarm[i] = k;
        dx += (tx / d) * k * 2.5;
        dz += (tz / d) * k * 2.5;
        want = Math.max(want, d < panicR ? p.fleeSpeed : p.speed * (0.6 + k));
      }
    }
    const m = Math.hypot(dx, dz);
    tv.x = m > 1e-4 ? (dx / m) * want : 0;
    tv.z = m > 1e-4 ? (dz / m) * want : 0;
    avoid?.(i, tv);
    const k = 1 - Math.exp(-p.agility * dt);
    a.vx += (tv.x - a.vx) * k;
    a.vz += (tv.z - a.vz) * k;
  }
  return alarm;
}

/** Integrates positions, rejecting moves onto bad ground (slides along an axis if possible). */
export function moveAgent(a: Agent, dt: number, ok: (x: number, z: number) => boolean): boolean {
  const nx = a.x + a.vx * dt;
  const nz = a.z + a.vz * dt;
  if (ok(nx, nz)) {
    a.x = nx;
    a.z = nz;
    return true;
  }
  if (ok(nx, a.z)) {
    a.x = nx;
    a.vz *= 0.3;
    return true;
  }
  if (ok(a.x, nz)) {
    a.z = nz;
    a.vx *= 0.3;
    return true;
  }
  // Blocked (trail edge, cliff): stop rather than bounce, so herds settle at the edge without jitter.
  a.vx = 0;
  a.vz = 0;
  return false;
}

// ---------------------------------------------------------------- gaits

/**
 * Advances a gait phase (in cycles, kept in [0, 1)) by distance travelled: one cycle per `stride` units.
 * A stopped animal's phase holds; the swing amplitude (see gaitAmp) fades the legs to rest instead.
 */
export function gaitPhase(phase: number, speed: number, dt: number, stride: number): number {
  const p = phase + (Math.abs(speed) * dt) / Math.max(1e-3, stride);
  return p - Math.floor(p);
}

/** Leg swing amplitude for a speed: 0 at rest, ramping to `max` by `full` units/s. */
export function gaitAmp(speed: number, full: number, max: number): number {
  return max * clamp(Math.abs(speed) / full, 0, 1);
}

/**
 * Leg phase offsets (cycles) by leg index: 0 front-left, 1 front-right, 2 hind-left, 3 hind-right.
 * Camelids pace (same-side legs together); a fleeing vicuña bounds (pairs front/hind).
 */
export const PACE = [0, 0.5, 0.06, 0.56] as const;
export const BOUND = [0, 0.08, 0.5, 0.58] as const;

/** Swing angle (radians about the hip) for leg `leg` at `phase` with amplitude `amp`. */
export function legSwing(phase: number, leg: number, amp: number, offsets: readonly number[] = PACE): number {
  return amp * Math.sin(TAU * (phase + (offsets[leg] ?? 0)));
}

/** Foot lift (0..1) during the forward half of the swing; used to bend lower legs / bob. */
export function legLift(phase: number, leg: number, offsets: readonly number[] = PACE): number {
  return Math.max(0, Math.cos(TAU * (phase + (offsets[leg] ?? 0))));
}

/** A vizcacha hop: 0..1 progress → height (parabola) and squash (stretch mid-air, squash on landing). */
export function hopArc(u: number, height: number): { y: number; squash: number } {
  const c = clamp(u, 0, 1);
  const y = 4 * height * c * (1 - c);
  const squash = c < 0.12 ? 1 - (0.12 - c) * 1.6 : c > 0.88 ? 1 - (c - 0.88) * 1.6 : 1 + 0.12 * Math.sin(Math.PI * c);
  return { y, squash };
}

// ---------------------------------------------------------------- ground

export interface GroundRules {
  heightAt(x: number, z: number): number;
  /** Trail band / plazas / decks: animals keep off unless they walk the trail (caravan). */
  walkable(x: number, z: number): boolean;
  /** Island-shaped bound (true inside). */
  inside(x: number, z: number): boolean;
  minY: number;
  maxY: number;
  maxSlope: number;
}

/** Finite-difference slope magnitude (rise over run). */
export function slopeAt(heightAt: (x: number, z: number) => number, x: number, z: number, e = 1): number {
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** Grassy, gentle, off-trail ground an animal may stand on. */
export function goodGround(r: GroundRules, x: number, z: number): boolean {
  if (!r.inside(x, z)) return false;
  const y = r.heightAt(x, z);
  if (!(y >= r.minY && y <= r.maxY)) return false;
  if (slopeAt(r.heightAt, x, z) > r.maxSlope) return false;
  return !r.walkable(x, z);
}

/** Seeded RNG (mulberry32), same recipe as tex.ts so screenshots are reproducible. */
export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Herd sizes for a species budget: `herds` groups between min and max, deterministic. */
export function herdSizes(herds: number, min: number, max: number, R: () => number): number[] {
  return Array.from({ length: herds }, () => min + Math.floor(R() * (max - min + 1)));
}

/** Update cadence: near animals every frame, far ones every `farStep` seconds. */
export function shouldStep(acc: number, dist: number, near: number, farStep: number): boolean {
  return dist <= near || acc >= farStep;
}

/**
 * Sparse distance oracle over a point cloud (e.g. the trail sampled every ~1 u): exact-ish distance within
 * one cell of any point, Infinity beyond. Cheap enough to call several times per animal per frame.
 */
export function pointHash(points: Array<[number, number]>, cell: number) {
  const map = new Map<string, number[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  for (const [x, z] of points) {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    let b = map.get(k);
    if (!b) {
      b = [];
      map.set(k, b);
    }
    b.push(x, z);
  }
  return (x: number, z: number): number => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let best = Infinity;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const b = map.get(key(cx + i, cz + j));
        if (!b) continue;
        for (let k = 0; k < b.length; k += 2) {
          const d = Math.hypot(x - (b[k] as number), z - (b[k + 1] as number));
          if (d < best) best = d;
        }
      }
    return best;
  };
}
