/**
 * Shared wind field (pure, no DOM, no Three): one per world, read by every swaying material (through the
 * per-frame uniforms packed by `packWind`, mirrored in GLSL by ./wind-glsl.ts) and by CPU code that wants
 * the same wind (particles, cloth, sound, creatures) through `windAt` / `liveWind`.
 *
 * The field is a base direction and strength (a `WindProfile` per world, see ./style.ts `WIND`) plus:
 * - a slow wander of the direction (`drift`), computed on the CPU once per frame (`windState`), so the GPU
 *   only gets a unit vector;
 * - travelling GUSTS: bands of stronger wind that sweep across the world along the wind direction, with
 *   slightly curved fronts. `gustAt` is the exact twin of `kwGust` in wind-glsl.ts, so a gust you hear or see
 *   in particles is the same wave you see crossing the grass;
 * - an optional height band (`calm`): the jungle floor is calm, the canopy moves.
 *
 * Interaction helpers (also pure): `pickPushers` packs the bodies nearest the traveler (creatures registry)
 * that bend grass away from themselves, and `createSpringField` keeps a few damped spring "kicks" for the
 * small trees and bushes the traveler brushes past.
 *
 * Reduced motion: `windState(…, reduced = true)` drops the gusts and the flutter and slows the clock, so the
 * vegetation keeps a gentle, constant, slow sway.
 */

export interface WindProfile {
  /** Direction the wind blows TOWARD, radians in the xz plane (0 = +x, π/2 = +z). */
  dir: number;
  /** Base strength (1 = the mountain's ichu sway; 0 = still air). */
  strength: number;
  /** Slow wander of the direction, radians (amplitude). */
  drift: number;
  gust: {
    /** Extra strength at the crest of a gust band (0 = no gusts). */
    amp: number;
    /** Distance between two gust fronts, world units. */
    length: number;
    /** How fast the fronts travel downwind, units per second. */
    speed: number;
    /** Band sharpness (1 = smooth sine swell, 3–4 = narrow fronts with calm between). */
    sharp: number;
  };
  /** Leaf flutter on trees (0 = none, 1 = normal). */
  flutter: number;
  /** Below `below` (world y) the wind is `k`× as strong, full strength above `above`. */
  calm?: { below: number; above: number; k: number };
  /** Vertical lift for particles and cloth (updrafts), as a fraction of the horizontal speed. */
  lift?: number;
}

/** The wind of one frame: the drifted direction, the clock and the gust parameters (see `windState`). */
export interface WindState {
  dirX: number;
  dirZ: number;
  strength: number;
  /** Wind clock, seconds (slowed under reduced motion). */
  time: number;
  gustAmp: number;
  /** 2π / gust length. */
  gustK: number;
  gustSpeed: number;
  gustSharp: number;
  flutter: number;
  calmBelow: number;
  calmAbove: number;
  calmK: number;
  lift: number;
  reduced: boolean;
}

/** Still air: what a world without a profile (or a test) gets. */
export const STILL: WindProfile = {
  dir: 0,
  strength: 0,
  drift: 0,
  gust: { amp: 0, length: 40, speed: 6, sharp: 1 },
  flutter: 0,
};

/** Under reduced motion the wind clock runs at this fraction of real time (a slow, constant sway). */
export const REDUCED_CLOCK = 0.35;
/** "No calm band": the height band sits far below any ground, so the factor is always 1. */
const NO_CALM = -1e4;

export function emptyWindState(): WindState {
  return {
    dirX: 1,
    dirZ: 0,
    strength: 0,
    time: 0,
    gustAmp: 0,
    gustK: (Math.PI * 2) / 40,
    gustSpeed: 0,
    gustSharp: 1,
    flutter: 0,
    calmBelow: NO_CALM,
    calmAbove: NO_CALM + 1,
    calmK: 1,
    lift: 0,
    reduced: false,
  };
}

/** The wind direction (radians) at time `t`: the base direction plus two slow, incommensurate swells. */
export function windDir(p: WindProfile, t: number): number {
  return p.dir + p.drift * (0.7 * Math.sin(t * 0.021) + 0.3 * Math.sin(t * 0.057 + 1.3));
}

/** Derives this frame's wind from a profile (allocation-free when `out` is given). */
export function windState(p: WindProfile, t: number, reduced: boolean, out: WindState = emptyWindState()): WindState {
  const a = windDir(p, reduced ? 0 : t);
  out.dirX = Math.cos(a);
  out.dirZ = Math.sin(a);
  out.strength = p.strength * (reduced ? 0.6 : 1);
  out.time = reduced ? t * REDUCED_CLOCK : t;
  out.gustAmp = reduced ? 0 : p.gust.amp;
  out.gustK = (Math.PI * 2) / Math.max(1, p.gust.length);
  out.gustSpeed = p.gust.speed;
  out.gustSharp = Math.max(1, p.gust.sharp);
  out.flutter = reduced ? 0 : p.flutter;
  out.calmBelow = p.calm ? p.calm.below : NO_CALM;
  out.calmAbove = p.calm ? Math.max(p.calm.above, p.calm.below + 0.01) : NO_CALM + 1;
  out.calmK = p.calm ? p.calm.k : 1;
  out.lift = p.lift ?? 0;
  out.reduced = reduced;
  return out;
}

/**
 * Gust strength at a world point (0 … gustAmp). Exact twin of `kwGust` in wind-glsl.ts: bands travelling
 * downwind at `gustSpeed`, with fronts curved by a slow wave across the wind and a gentle along-front swell.
 */
export function gustAt(s: WindState, x: number, z: number): number {
  if (s.gustAmp <= 0) return 0;
  const along = x * s.dirX + z * s.dirZ;
  const cross = -x * s.dirZ + z * s.dirX;
  const k = s.gustK;
  const ph = (along - s.time * s.gustSpeed) * k + 0.8 * Math.sin(cross * k * 0.37 + s.time * 0.05);
  const b = Math.max(0.5 + 0.5 * Math.sin(ph), 1e-4);
  return s.gustAmp * b ** s.gustSharp * (0.75 + 0.25 * Math.sin(cross * k * 0.21 - 0.7));
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Height factor of the calm band (1 when the profile has none or `y` is unknown). */
export function calmAt(s: WindState, y?: number): number {
  if (y === undefined || s.calmK === 1) return 1;
  return s.calmK + (1 - s.calmK) * smooth(s.calmBelow, s.calmAbove, y);
}

export interface WindSample {
  /** Wind velocity-ish vector (direction × speed), world units. */
  x: number;
  y: number;
  z: number;
  /** Gust part alone (0 … gustAmp). */
  gust: number;
  /** strength × (1 + gust) × calm: what a particle, a flag or the wind sound should follow. */
  speed: number;
}

/** The wind at a world point (y optional: only the calm band uses it). */
export function windAt(s: WindState, x: number, z: number, y?: number, out?: WindSample): WindSample {
  const gust = gustAt(s, x, z);
  const speed = s.strength * (1 + gust) * calmAt(s, y);
  const o = out ?? { x: 0, y: 0, z: 0, gust: 0, speed: 0 };
  o.x = s.dirX * speed;
  o.z = s.dirZ * speed;
  o.y = s.lift * speed;
  o.gust = gust;
  o.speed = speed;
  return o;
}

// ---------------------------------------------------------------- uniform packing

/** vec4 slots of the shared style/wind uniform array `cpaU` (./style.ts packs the style ones). */
export const WIND_SLOT = { W0: 9, W1: 10, W2: 11, NEAR: 13 } as const;

/** Writes the wind of this frame into `cpaU` (see wind-glsl.ts for the matching reads). */
export function packWind(s: WindState, u: Float32Array) {
  let o = WIND_SLOT.W0 * 4;
  u[o] = s.dirX;
  u[o + 1] = s.dirZ;
  u[o + 2] = s.strength;
  u[o + 3] = s.time;
  o = WIND_SLOT.W1 * 4;
  u[o] = s.gustAmp;
  u[o + 1] = s.gustK;
  u[o + 2] = s.gustSpeed;
  u[o + 3] = s.gustSharp;
  o = WIND_SLOT.W2 * 4;
  u[o] = s.flutter;
  u[o + 1] = s.calmBelow;
  u[o + 2] = s.calmAbove;
  u[o + 3] = s.calmK;
}

// ---------------------------------------------------------------- pushers (grass bends away)

/** Most bodies that bend grass at once (size of the `kwPush` uniform array). */
export const MAX_PUSHERS = 12;
/** Bodies farther than this from the focus never push (their grass is too far to see the bend). */
export const PUSH_RANGE = 36;

export interface PushBody {
  x: number;
  z: number;
  r: number;
  solid: boolean;
}

const PICK_DIST = new Float64Array(64);

/** Influence radius of a body of radius `r`: the bend reaches a little past its feet. */
export const pushRadius = (r: number) => r * 2.2 + 0.45;

/**
 * Packs the solid bodies nearest (fx, fz) into `out` (vec4 per pusher: x, z, radius, strength; unused slots
 * zeroed). Allocation-free; `idx` is scratch space of at least `max` entries. Returns the count.
 */
export function pickPushers(
  bodies: readonly PushBody[],
  fx: number,
  fz: number,
  out: Float32Array,
  idx: Int32Array = new Int32Array(MAX_PUSHERS),
  max = MAX_PUSHERS,
  range = PUSH_RANGE,
): number {
  const dist = max <= PICK_DIST.length ? PICK_DIST : new Float64Array(max);
  let n = 0;
  const r2 = range * range;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i] as PushBody;
    if (!b.solid) continue;
    const d = (b.x - fx) ** 2 + (b.z - fz) ** 2;
    if (d > r2) continue;
    if (n === max && d >= (dist[n - 1] as number)) continue;
    // Insertion into the sorted top-`max` list.
    let j = n < max ? n++ : n - 1;
    while (j > 0 && (dist[j - 1] as number) > d) {
      dist[j] = dist[j - 1] as number;
      idx[j] = idx[j - 1] as number;
      j--;
    }
    dist[j] = d;
    idx[j] = i;
  }
  out.fill(0);
  for (let k = 0; k < n; k++) {
    const b = bodies[idx[k] as number] as PushBody;
    out[k * 4] = b.x;
    out[k * 4 + 1] = b.z;
    out[k * 4 + 2] = pushRadius(b.r);
    out[k * 4 + 3] = 1;
  }
  return n;
}

// ---------------------------------------------------------------- spring kicks (small trees, bushes)

/** Most trees kicked at once (size of the `kwKick` uniform array). */
export const MAX_KICKS = 6;

export interface SpringPoint {
  x: number;
  z: number;
  /** Trunk / bush radius: a mover closer than r + its own radius + 0.35 brushes it. */
  r: number;
}

export interface Mover {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
}

interface Spring {
  p: SpringPoint;
  ox: number;
  oz: number;
  vx: number;
  vz: number;
}

export interface SpringField {
  /** Registers springy points (a flora module's small trees); returns the remover. */
  add(points: readonly SpringPoint[]): () => void;
  /** Advances the springs: movers brushing a point push its crown along their velocity (first `count`). */
  step(dt: number, movers: readonly Mover[], count?: number): void;
  /** Packs the active kicks (vec4: x, z, offset x, offset z) nearest (fx, fz) into `out`; zeroes the rest. */
  pack(out: Float32Array, fx: number, fz: number): number;
  /** Number of springs still moving. */
  active(): number;
  clear(): void;
}

/** Natural frequency (Hz) and damping ratio of a kicked crown, and its largest offset (world units). */
const SPRING_HZ = 1.4;
const SPRING_ZETA = 0.22;
const SPRING_MAX = 0.55;
const SPRING_PUSH = 2.4;
const CELL = 8;

export function createSpringField(): SpringField {
  const grid = new Map<string, SpringPoint[]>();
  const live = new Map<SpringPoint, Spring>();
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const w = Math.PI * 2 * SPRING_HZ;
  const k = w * w;
  const c = 2 * SPRING_ZETA * w;
  const scratch: Spring[] = [];
  return {
    add(points) {
      for (const p of points) {
        const kk = key(p.x, p.z);
        const cell = grid.get(kk);
        if (cell) cell.push(p);
        else grid.set(kk, [p]);
      }
      return () => {
        for (const p of points) {
          const cell = grid.get(key(p.x, p.z));
          const i = cell ? cell.indexOf(p) : -1;
          if (cell && i >= 0) cell.splice(i, 1);
          live.delete(p);
        }
      };
    },
    step(dt, movers, count = movers.length) {
      if (dt <= 0) return;
      const h = Math.min(dt, 1 / 30);
      for (let i = 0; i < count; i++) {
        const m = movers[i] as Mover;
        const sp = Math.hypot(m.vx, m.vz);
        if (sp < 0.4) continue;
        const cx = Math.floor(m.x / CELL);
        const cz = Math.floor(m.z / CELL);
        for (let ix = cx - 1; ix <= cx + 1; ix++)
          for (let iz = cz - 1; iz <= cz + 1; iz++) {
            const cell = grid.get(`${ix},${iz}`);
            if (!cell) continue;
            for (const p of cell) {
              const reach = p.r + m.r + 0.35;
              const d = Math.hypot(p.x - m.x, p.z - m.z);
              if (d > reach) continue;
              let s = live.get(p);
              if (!s) {
                s = { p, ox: 0, oz: 0, vx: 0, vz: 0 };
                live.set(p, s);
              }
              const f = (1 - d / reach) * SPRING_PUSH * h;
              s.vx += m.vx * f;
              s.vz += m.vz * f;
            }
          }
      }
      for (const s of live.values()) {
        s.vx += (-k * s.ox - c * s.vx) * h;
        s.vz += (-k * s.oz - c * s.vz) * h;
        s.ox += s.vx * h;
        s.oz += s.vz * h;
        const m = Math.hypot(s.ox, s.oz);
        if (m > SPRING_MAX) {
          s.ox *= SPRING_MAX / m;
          s.oz *= SPRING_MAX / m;
        }
        if (m < 0.002 && Math.hypot(s.vx, s.vz) < 0.004) live.delete(s.p);
      }
    },
    pack(out, fx, fz) {
      scratch.length = 0;
      for (const s of live.values()) scratch.push(s);
      if (scratch.length > MAX_KICKS)
        scratch.sort((a, b) => (a.p.x - fx) ** 2 + (a.p.z - fz) ** 2 - ((b.p.x - fx) ** 2 + (b.p.z - fz) ** 2));
      out.fill(0);
      const n = Math.min(MAX_KICKS, scratch.length, out.length >> 2);
      for (let i = 0; i < n; i++) {
        const s = scratch[i] as Spring;
        out[i * 4] = s.p.x;
        out[i * 4 + 1] = s.p.z;
        out[i * 4 + 2] = s.ox;
        out[i * 4 + 3] = s.oz;
      }
      return n;
    },
    active: () => live.size,
    clear() {
      grid.clear();
      live.clear();
    },
  };
}

/**
 * The world's springy points (one field per page, like the creatures registry). Flora modules `add` their
 * small trees and bushes; the style runtime steps it and uploads the kicks. Cleared on mount/dispose.
 */
export const springs = createSpringField();

// ---------------------------------------------------------------- live accessor

/**
 * This frame's wind, for CPU readers that must not import the runtime: particles, flags, the soundscape
 * (`liveWind.sample(x, z).gust` is the gust you see crossing the grass right there), creatures.
 * The style runtime (./style-runtime.ts) refreshes `state` every frame; until then the air is still.
 */
export const liveWind = {
  state: emptyWindState(),
  /** The wind at a world point right now (reuses one object unless `out` is given). */
  sample(x: number, z: number, y?: number, out?: WindSample): WindSample {
    return windAt(this.state, x, z, y, out ?? shared);
  },
  /** Mean gust over the last frames near the focus (0 … gustAmp): a single number for sound. */
  gust: 0,
};
const shared: WindSample = { x: 0, y: 0, z: 0, gust: 0, speed: 0 };
