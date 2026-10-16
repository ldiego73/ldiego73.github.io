/**
 * The Pacific's waves as one pure function, shared by the sea's vertex shader (./sea.ts builds its GLSL from
 * the same table, so both always agree) and everything that floats on it (the caballito, the fishermen's
 * reed boats, the sea lions' heads, the pelicans landing). No three.js, no DOM (tested in waves.test.ts).
 *
 * Inputs: world x, z, `s` the distance offshore (shoreX(z) − x: > 0 at sea, < 0 under the beach) and the time.
 *  - Swell: a few long-crested waves arriving from the south-west (the Pacific swell), faded out near the shore.
 *  - Breakers: near the beach the swell turns parallel to the shore (refraction) and peaks into crests that
 *    roll in toward the sand, growing in the surf zone and spent at the waterline.
 *  - Swash: the whole surf zone and the beach face rise and fall slowly (a set of waves every ~11 s), so the
 *    edge of the water and its foam run up the sand and back.
 * Heights are relative to sea level (y 0), in world units.
 */

export interface Wave {
  /** Travel direction (normalised in the table below). */
  dx: number;
  dz: number;
  /** Wavelength (u), amplitude (u), phase offset (rad). */
  len: number;
  amp: number;
  ph: number;
}

const G = 9.8;
const norm = (x: number, z: number) => {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l] as const;
};
const w = (x: number, z: number, len: number, amp: number, ph: number): Wave => {
  const [dx, dz] = norm(x, z);
  return { dx, dz, len, amp, ph };
};

/** The swell: mostly toward +x (onshore, from the west-south-west), a cross sea and a light chop. */
export const SWELL: readonly Wave[] = [
  w(0.94, -0.34, 26, 0.3, 0),
  w(0.8, 0.6, 14, 0.13, 1.7),
  w(0.99, -0.12, 8, 0.07, 4.1),
  w(0.35, -0.94, 4.6, 0.035, 2.3),
];

/** Breakers: wavelength across the surf zone, crest height, speed (u/s, shoreward), surf zone extent (s). */
export const SURF = { len: 12, amp: 0.36, speed: 2.4, outer: 46, inner: 3 } as const;
/** Swash: slow rise and fall of the surf zone and the beach face. */
export const SWASH = { amp: 0.16, period: 11, base: 0.06 } as const;

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Angular frequency of a deep-water wave of this length. */
export const omega = (len: number) => Math.sqrt((G * TAU) / len);

/** Fraction of the offshore swell still present at offshore distance s (0 at the beach, 1 out at sea). */
export const swellFade = (s: number) => 0.18 + 0.82 * smooth(6, 60, s);
/** Breaker envelope across the surf zone (0 outside it). */
export const surfEnvelope = (s: number) => smooth(SURF.outer, SURF.outer * 0.45, s) * smooth(SURF.inner - 4, 9, s);

/** Sea surface height at (x, z) with offshore distance s, time t (s), and a global amplitude scale. */
export function seaHeight(x: number, z: number, s: number, t: number, scale = 1): number {
  let y = 0;
  const f = swellFade(s);
  for (const wv of SWELL) {
    const k = TAU / wv.len;
    y += wv.amp * f * Math.sin(k * (wv.dx * x + wv.dz * z) - omega(wv.len) * t + wv.ph);
  }
  y += breaker(z, s, t);
  y += swash(z, s, t);
  return y * scale;
}

/** Shore-parallel crests rolling in: peaky (cubed half-sine), slightly oblique along z. */
export function breaker(z: number, s: number, t: number): number {
  const env = surfEnvelope(s);
  if (env <= 0) return 0;
  const th = (TAU / SURF.len) * (s + SURF.speed * t) + z * 0.035;
  const c = 0.5 + 0.5 * Math.sin(th);
  return SURF.amp * env * c * c * c;
}

/** Slow set rhythm over the surf zone and the beach face (a gentle along-shore phase drift). */
export function swash(z: number, s: number, t: number): number {
  const near = smooth(30, 0, s);
  return near * (SWASH.base + SWASH.amp * Math.sin((TAU / SWASH.period) * t + z * 0.015));
}

/** Crest strength 0..1 of the breakers (foam on the shader; spray and wake hints in JS). */
export function crest(z: number, s: number, t: number): number {
  const env = surfEnvelope(s);
  const th = (TAU / SURF.len) * (s + SURF.speed * t) + z * 0.035;
  const c = 0.5 + 0.5 * Math.sin(th);
  return env * c * c * c * c * c;
}

/** GLSL for the same functions (uniform-free; `t` passed in). Kept in sync by construction. */
export function wavesGlsl(): string {
  const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);
  const terms = SWELL.map((wv) => {
    const k = TAU / wv.len;
    return `y += ${f(wv.amp)} * fade * sin(${f(k)} * (${f(wv.dx)} * p.x + ${f(wv.dz)} * p.y) - ${f(omega(wv.len))} * t + ${f(wv.ph)});`;
  }).join("\n    ");
  return /* glsl */ `
  float kwSm(float a, float b, float x) { float u = clamp((x - a) / (b - a), 0.0, 1.0); return u * u * (3.0 - 2.0 * u); }
  float kwSurfEnv(float s) { return kwSm(${f(SURF.outer)}, ${f(SURF.outer * 0.45)}, s) * kwSm(${f(SURF.inner - 4)}, 9.0, s); }
  float kwBreakPhase(float z, float s, float t) {
    float th = ${f(TAU / SURF.len)} * (s + ${f(SURF.speed)} * t) + z * 0.035;
    return 0.5 + 0.5 * sin(th);
  }
  float kwSwash(float z, float s, float t) {
    return kwSm(30.0, 0.0, s) * (${f(SWASH.base)} + ${f(SWASH.amp)} * sin(${f(TAU / SWASH.period)} * t + z * 0.015));
  }
  float kwSea(vec2 p, float s, float t) {
    float y = 0.0;
    float fade = 0.18 + 0.82 * kwSm(6.0, 60.0, s);
    ${terms}
    float c = kwBreakPhase(p.y, s, t);
    y += ${f(SURF.amp)} * kwSurfEnv(s) * c * c * c;
    y += kwSwash(p.y, s, t);
    return y;
  }
  float kwCrest(float z, float s, float t) {
    float c = kwBreakPhase(z, s, t);
    return kwSurfEnv(s) * c * c * c * c * c;
  }`;
}
