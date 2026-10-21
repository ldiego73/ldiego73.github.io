/**
 * Blown sand (pure, no DOM, no Three): the grains the sea breeze lifts off the desert round the traveler
 * (../arena.ts draws them). Each grain lives a second or three: it is born somewhere in a disc round the
 * traveler (pushed upwind, so grains stream INTO view), skims downwind with the shared wind at its own spot
 * (../../../wind.ts `liveWind.sample`, the same gust fronts the reeds and banners show), hopping a little off
 * the ground (saltation), and fades out. Inside a gust front grains run faster, hop higher and many more of
 * them show; between fronts only a thin drift is left. Grains born over water or green fields stay hidden.
 */

export interface Grains {
  n: number;
  x: Float32Array;
  z: Float32Array;
  y: Float32Array;
  age: Float32Array;
  life: Float32Array;
  /** Per-grain threshold 0..1: the grain shows once the local gust strength passes it. */
  seed: Float32Array;
  /** 1 if born over sand, else 0 (the grain then stays hidden for its whole life). */
  sand: Uint8Array;
  /** Output opacity 0..1 (life fade × gust activation). */
  alpha: Float32Array;
}

export interface GrainContext {
  /** Focus (the traveler). */
  fx: number;
  fz: number;
  /** Wind at a point: velocity (x, z) and the gust part alone (0 … gustAmp). */
  wind(x: number, z: number): { x: number; z: number; gust: number };
  /** Strongest gust of the profile (normalises `gust` to 0..1); 0 = no gusts (reduced motion). */
  gustAmp: number;
  ground(x: number, z: number): number;
  isSand(x: number, z: number): boolean;
  rand(): number;
}

/** Radius of the disc round the traveler where grains live (u). */
export const RADIUS = 20;
/** Lowest share of grains that show between gust fronts (a thin steady drift). */
export const CALM_SHARE = 0.18;

export function createGrains(n: number): Grains {
  return {
    n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    y: new Float32Array(n),
    age: new Float32Array(n).fill(1e9),
    life: new Float32Array(n).fill(1),
    seed: new Float32Array(n),
    sand: new Uint8Array(n),
    alpha: new Float32Array(n),
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Normalised gust strength 0..1. */
export const gustShare = (gust: number, gustAmp: number) => (gustAmp > 0 ? clamp01(gust / gustAmp) : 0);

/** How visible a grain with this seed is at this gust (0..1, a soft step). */
export function activation(seed: number, gn: number): number {
  const share = CALM_SHARE + (1 - CALM_SHARE) * gn;
  return clamp01((share - seed) / 0.12 + 0.5);
}

function spawn(g: Grains, i: number, c: GrainContext) {
  const w = c.wind(c.fx, c.fz);
  const sp = Math.hypot(w.x, w.z) || 1;
  // A disc round the traveler, its centre pushed half a radius upwind.
  const a = c.rand() * Math.PI * 2;
  const r = Math.sqrt(c.rand()) * RADIUS;
  const x = c.fx - (w.x / sp) * RADIUS * 0.5 + Math.cos(a) * r;
  const z = c.fz - (w.z / sp) * RADIUS * 0.5 + Math.sin(a) * r;
  g.x[i] = x;
  g.z[i] = z;
  g.age[i] = 0;
  g.life[i] = 1.2 + c.rand() * 2.2;
  g.seed[i] = c.rand();
  g.sand[i] = c.isSand(x, z) ? 1 : 0;
}

/** Advances every grain by dt and writes y and alpha. */
export function stepGrains(g: Grains, dt: number, c: GrainContext) {
  const R2 = RADIUS * RADIUS * 2.25;
  for (let i = 0; i < g.n; i++) {
    let age = (g.age[i] as number) + dt;
    const dx = (g.x[i] as number) - c.fx;
    const dz = (g.z[i] as number) - c.fz;
    if (age >= (g.life[i] as number) || dx * dx + dz * dz > R2) {
      spawn(g, i, c);
      age = 0;
    }
    const x = g.x[i] as number;
    const z = g.z[i] as number;
    const w = c.wind(x, z);
    const gn = gustShare(w.gust, c.gustAmp);
    // Skims faster than the air's mean speed inside a front (the gust is what lifts it).
    const k = 1.1 + 4.5 * gn;
    const nx = x + w.x * k * dt;
    const nz = z + w.z * k * dt;
    g.x[i] = nx;
    g.z[i] = nz;
    g.age[i] = age;
    const u = age / (g.life[i] as number);
    const hop = (0.06 + 0.45 * gn * (0.4 + (g.seed[i] as number))) * Math.sin(Math.PI * u);
    g.y[i] = c.ground(nx, nz) + 0.05 + hop;
    const fade = clamp01(u / 0.15) * clamp01((1 - u) / 0.3);
    g.alpha[i] = g.sand[i] ? fade * activation(g.seed[i] as number, gn) : 0;
  }
}
