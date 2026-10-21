/**
 * "Cel pintado andino": the per-world style and wind profiles, and the pure packing of both into the shared
 * uniform array every world material reads (no DOM, no Three; the GLSL lives in ./style-gl.ts and
 * ./wind-glsl.ts, the per-frame driver in ./style-runtime.ts).
 *
 * The look, in one paragraph: hard two-tone cel light with a thin highlight band; the shaded side and cast
 * shadows take a per-world colour (indigo in the sierra, blue-green in the jungle, teal on the coast…) instead
 * of grey; warm, coloured ink, thicker on silhouettes than on creases; large painted blotches (world-space
 * value noise, posterized) that lift or lower the albedo a little so grass, rock and stone look hand-painted;
 * layered aerial haze that turns distant ridges lighter and bluer; a saturated sky with hard-edged two-tone
 * clouds drifting with the wind.
 *
 * A world picks its profile by id (`STYLES[world]`, `WIND[world]`) and gets everything with no other work.
 * World agents tune the numbers here; every field is documented on the types.
 */
import type { WorldId } from "./events";
import { WIND_SLOT, type WindProfile } from "./wind";

export interface CelStyle {
  /** Light on the lit side (0.5–1; the highlight band adds on top). 0 turns the cel ramp off. */
  lit: number;
  /** Where the light/shade terminator sits on the half-Lambert ramp (0.5 = N·L of 0). */
  terminator: number;
  /** Half width of the terminator blend (0.01 crisp … 0.08 soft); never below one pixel (fwidth). */
  softness: number;
  /** Direct light kept on the shaded side (0 = only the ambient fill; the old ramp's darkest step was 0.38). */
  shade: number;
  /** Extra light in the thin highlight band (0 = two tones only). */
  highlight: number;
  /** Where the highlight band starts on the ramp (0.9 = only faces almost facing the light). */
  highlightAt: number;
}

export interface InkStyle {
  /** Day ink (sRGB hex): warm dark brown, never black. */
  color: string;
  /** Night ink: the day ink drifts to this after dusk. */
  night: string;
  /** Silhouette width multiplier (depth edges), near the camera; thins to 1 px with distance. */
  silhouette: number;
  /** Crease width multiplier (normal edges inside a shape; below 1 = thinner and lighter). */
  crease: number;
  /** Crease opacity (silhouettes are always full). */
  creaseAlpha: number;
}

export interface PaintStyle {
  /** Lightness swing of the blotches (0.1 = ±10 %). 0 turns painting off. */
  amount: number;
  /** Size of a blotch, world units. */
  scale: number;
  /** Multiplier for flat-coloured materials (env.toon(color): props and small parts). */
  flat: number;
  /** Multiplier for vertex- or instance-coloured materials (terrain, merged scenery, flora). */
  vertex: number;
  /** Hue the light blotches lean to (and the dark ones lean away from), sRGB hex. */
  warm: string;
  /** Hue shift strength (0 = lightness only). */
  hue: number;
  /** Edge softness of the posterized blotches (0.02 cut-out … 0.12 watercolour). */
  edge: number;
}

export interface AtmosphereStyle {
  /** Distance (u) where the haze starts and where it reaches full strength. */
  near: number;
  far: number;
  /** Haze hue (sRGB hex); its brightness follows the fog, so it works day, dusk and night. */
  tint: string;
  /** How much of the colour the haze takes at `far` (0 off … 1 flat silhouettes). */
  strength: number;
  /** Haze thins with altitude: × exp(−max(y − heightBase, 0) × heightFalloff). */
  heightBase: number;
  heightFalloff: number;
  /** How much the altitude term counts (0 = distance only). */
  heightK: number;
  /** Soft distance steps (0 = continuous, 3 = three painted planes). */
  layers: number;
}

export interface CloudStyle {
  /** Sky fraction covered on a clear day (weather cover adds to it). */
  cover: number;
  /** Cloud size (bigger = larger shapes). */
  scale: number;
  /** Drift speed along the wind, in cloud-plane units per second at wind strength 1. */
  speed: number;
  /** How dark the shaded tone is (0 flat white … 1 deep). */
  shade: number;
  /** Edge softness (0.01 hard cut-out … 0.1 soft). */
  edge: number;
  /** Opacity at full cover. */
  alpha: number;
}

export interface StyleProfile {
  /** Shade colour (sRGB hex) mixed into the side away from the light and into cast shadows. */
  shadowTint: string;
  /** 0 = grey shading (the old look) … 1 = fully tinted. */
  shadowStrength: number;
  cel: CelStyle;
  ink: InkStyle;
  /** Optional thin rim of light on the lit side's silhouette. */
  rim?: { color: string; amount: number; power: number };
  paint: PaintStyle;
  atmosphere: AtmosphereStyle;
  clouds: CloudStyle;
  /** Dome colour saturation boost (1 = as sky.ts paints it); by day the zenith leans to `zenith` by `zenithK`. */
  sky: { saturation: number; zenith?: string; zenithK?: number };
}

// ---------------------------------------------------------------- profiles

const CEL: CelStyle = { lit: 0.86, terminator: 0.52, softness: 0.018, shade: 0.42, highlight: 0.14, highlightAt: 0.9 };

/** Sierra: ochre light, indigo shade, brown ink, gusty puna. The template the others vary. */
const SIERRA: StyleProfile = {
  shadowTint: "#5d5cb4",
  shadowStrength: 0.62,
  cel: CEL,
  ink: { color: "#3b2516", night: "#1d1f45", silhouette: 1.8, crease: 0.7, creaseAlpha: 0.75 },
  rim: { color: "#fff0cf", amount: 0.22, power: 3 },
  paint: { amount: 0.15, scale: 4.5, flat: 0.35, vertex: 1, warm: "#f2c46a", hue: 0.4, edge: 0.02 },
  atmosphere: {
    near: 55,
    far: 620,
    tint: "#93b1e6",
    strength: 0.6,
    heightBase: 10,
    heightFalloff: 0.006,
    heightK: 0.45,
    layers: 3,
  },
  clouds: { cover: 0.4, scale: 1, speed: 0.012, shade: 0.75, edge: 0.02, alpha: 0.97 },
  sky: { saturation: 1.3, zenith: "#3f8fe0", zenithK: 0.55 },
};

export const STYLES: Record<WorldId, StyleProfile> = {
  qhapaq: SIERRA,
  wasi: SIERRA,
  selva: {
    ...SIERRA,
    shadowTint: "#2f8a74",
    shadowStrength: 0.6,
    ink: { color: "#4a1e12", night: "#16263a", silhouette: 1.7, crease: 0.7, creaseAlpha: 0.7 },
    rim: { color: "#fff6d8", amount: 0.16, power: 3 },
    paint: { ...SIERRA.paint, amount: 0.15, scale: 3.5, warm: "#e0a24a" },
    atmosphere: { ...SIERRA.atmosphere, near: 40, far: 420, tint: "#9fd2bf", heightK: 0.3 },
    clouds: { ...SIERRA.clouds, cover: 0.55, scale: 0.9 },
    sky: { saturation: 1.2, zenith: "#4f9ad8", zenithK: 0.4 },
  },
  cusco: {
    ...SIERRA,
    shadowTint: "#5a59a6",
    ink: { ...SIERRA.ink, color: "#3a2618" },
    paint: { ...SIERRA.paint, amount: 0.13, warm: "#e8b850" },
    clouds: { ...SIERRA.clouds, cover: 0.38 },
  },
  costa: {
    ...SIERRA,
    shadowTint: "#2b98a3",
    shadowStrength: 0.58,
    ink: { color: "#4a3121", night: "#18284a", silhouette: 1.7, crease: 0.7, creaseAlpha: 0.7 },
    rim: { color: "#fff4dc", amount: 0.2, power: 3 },
    paint: { ...SIERRA.paint, amount: 0.13, scale: 6, warm: "#f0cf8a" },
    atmosphere: { ...SIERRA.atmosphere, near: 70, far: 760, tint: "#a9dce4", strength: 0.45, heightK: 0.35 },
    clouds: { ...SIERRA.clouds, cover: 0.3, scale: 1.2 },
    sky: { saturation: 1.25, zenith: "#3c98e0", zenithK: 0.5 },
  },
  titicaca: {
    ...SIERRA,
    shadowTint: "#2b40a8",
    shadowStrength: 0.66,
    ink: { color: "#3a2814", night: "#151c48", silhouette: 1.8, crease: 0.7, creaseAlpha: 0.75 },
    paint: { ...SIERRA.paint, warm: "#f0c050" },
    atmosphere: { ...SIERRA.atmosphere, near: 120, far: 900, tint: "#86aef0", strength: 0.38 },
    clouds: { ...SIERRA.clouds, cover: 0.36, scale: 1.15 },
    sky: { saturation: 1.35, zenith: "#2a6fd6", zenithK: 0.6 },
  },
  colca: {
    ...SIERRA,
    shadowTint: "#7a4f98",
    shadowStrength: 0.62,
    ink: { color: "#4b1f12", night: "#1f1b44", silhouette: 1.8, crease: 0.7, creaseAlpha: 0.75 },
    paint: { ...SIERRA.paint, amount: 0.16, scale: 5.5, warm: "#e89a52" },
    atmosphere: { ...SIERRA.atmosphere, near: 90, far: 800, tint: "#a7b3e0", strength: 0.42 },
    clouds: { ...SIERRA.clouds, cover: 0.34 },
  },
};

/** The mountain's ichu sway, now with real gust fronts rolling up the slope. */
const PUNA: WindProfile = {
  dir: 0.6,
  strength: 1,
  drift: 0.35,
  gust: { amp: 1.1, length: 34, speed: 7.5, sharp: 3 },
  flutter: 1,
};

export const WIND: Record<WorldId, WindProfile> = {
  qhapaq: PUNA,
  wasi: PUNA,
  // Humid lowland: still air on the forest floor, the canopy moves.
  selva: {
    dir: 1.2,
    strength: 0.5,
    drift: 0.25,
    gust: { amp: 0.35, length: 50, speed: 4, sharp: 2 },
    flutter: 0.8,
    calm: { below: 5, above: 16, k: 0.3 },
  },
  // Steady sea breeze from the Pacific (west) toward the land (+x): strong, few gusts.
  costa: { dir: 0.1, strength: 1.05, drift: 0.12, gust: { amp: 0.3, length: 70, speed: 6, sharp: 1.6 }, flutter: 0.9 },
  // Altiplano: strong and gusty, off the lake (north, −z) toward the shore.
  titicaca: {
    dir: Math.PI / 2,
    strength: 1.2,
    drift: 0.4,
    gust: { amp: 1.3, length: 30, speed: 9, sharp: 3.5 },
    flutter: 1.1,
  },
  // Canyon: up-valley wind and updrafts (condors ride them).
  colca: {
    dir: Math.PI,
    strength: 0.85,
    drift: 0.3,
    gust: { amp: 0.7, length: 44, speed: 6.5, sharp: 2.5 },
    flutter: 1,
    lift: 0.6,
  },
  // A sheltered valley town: gentle.
  cusco: { dir: 0.9, strength: 0.55, drift: 0.3, gust: { amp: 0.4, length: 40, speed: 5, sharp: 2 }, flutter: 0.7 },
};

// ---------------------------------------------------------------- colour helpers (pure)

export type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** "#rrggbb" → linear-light RGB (the working space of Three's `Color`). */
export function hexLinear(hex: string): RGB {
  const v = Number.parseInt(hex.replace("#", ""), 16);
  return [toLinear(((v >> 16) & 255) / 255), toLinear(((v >> 8) & 255) / 255), toLinear((v & 255) / 255)];
}

/** Rec. 709 luminance of a linear colour. */
export const luma = (c: RGB) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/**
 * A shade tint as a hue at unit luminance (so it shifts colour without darkening on its own: the cel `shade`
 * level decides how dark the shaded side is), with no channel above `cap`.
 */
export function hueOnly(c: RGB, cap = 1.9): RGB {
  const l = Math.max(luma(c), 1e-4);
  let r = c[0] / l;
  let g = c[1] / l;
  let b = c[2] / l;
  const m = Math.max(r, g, b);
  if (m > cap) {
    // Pull toward white until the strongest channel fits (keeps the hue direction).
    const k = (cap - 1) / (m - 1);
    r = 1 + (r - 1) * k;
    g = 1 + (g - 1) * k;
    b = 1 + (b - 1) * k;
  }
  return [r, g, b];
}

// ---------------------------------------------------------------- uniform packing

/**
 * vec4 slots of the shared uniform array `cpaU` (GLSL reads them by these indices; ./style-gl.ts).
 * 0–8 style (packed here), 9–11 wind (./wind.ts `packWind`), 12 flags, 13 interaction bounds (style-runtime.ts).
 */
export const SLOT = {
  /** lit level (0 = cel off: three's gradient ramp), terminator, softness, shade */
  CEL0: 0,
  /** shadow tint (hue, unit luminance) rgb, shadow strength */
  CEL1: 1,
  /** highlightAt, highlight, keyRef (brightest key light), rim amount */
  CEL2: 2,
  /** rim rgb, rim power */
  CEL3: 3,
  /** paint amount, 1/scale, flat multiplier, vertex multiplier */
  PAINT0: 4,
  /** warm hue offset rgb (unit luminance − 1) × hue, edge */
  PAINT1: 5,
  /** haze rgb (linear), strength */
  ATMO0: 6,
  /** near, far, heightBase, heightFalloff */
  ATMO1: 7,
  /** layers, heightK, -, - */
  ATMO2: 8,
  ...WIND_SLOT,
  /** inkPass (1 while the outline prepass draws), -, -, - */
  FLAGS: 12,
  /** Interaction bounds: centre x, z and radius around every pusher (0 = none), active kick count. Vertices
   * outside skip the pusher and kick loops (most of the meadow, most of the time). */
  NEAR: 13,
} as const;
/** Number of vec4 in `cpaU`. */
export const KW_SLOTS = 14;

/** What changes every frame and is not in the profile. */
export interface StyleFrame {
  /** Brightest directional light: intensity × max colour channel (linear). Normalizes the shadow mask. */
  keyRef: number;
  /** Scene fog colour this frame (linear), after the runtime's own tweaks (the jungle's green air). */
  fog: RGB;
  /** 0 day … 1 night. */
  night: number;
  /** 0 normal … 1 the mountain's title void (no haze there). */
  void: number;
}

/** Cached linear colours of a profile (hex parsing is not free; profiles are fixed per page). */
export interface ProfileColors {
  tint: RGB;
  warm: RGB;
  haze: RGB;
  rim: RGB;
  ink: RGB;
  inkNight: RGB;
}

export function profileColors(p: StyleProfile): ProfileColors {
  return {
    tint: hueOnly(hexLinear(p.shadowTint)),
    warm: hueOnly(hexLinear(p.paint.warm), 1.6),
    haze: hueOnly(hexLinear(p.atmosphere.tint), 1.5),
    rim: hexLinear(p.rim?.color ?? "#ffffff"),
    ink: hexLinear(p.ink.color),
    inkNight: hexLinear(p.ink.night),
  };
}

/** Writes slots 0–8 of `cpaU` for this frame. */
export function packStyle(p: StyleProfile, c: ProfileColors, f: StyleFrame, u: Float32Array) {
  const set = (slot: number, a: number, b: number, cc: number, d: number) => {
    const o = slot * 4;
    u[o] = a;
    u[o + 1] = b;
    u[o + 2] = cc;
    u[o + 3] = d;
  };
  const day = 1 - f.night;
  set(SLOT.CEL0, p.cel.lit, p.cel.terminator, p.cel.softness, p.cel.shade);
  // Night shade stays a little tinted (moonlight is already blue); the hue is the world's.
  set(SLOT.CEL1, c.tint[0], c.tint[1], c.tint[2], p.shadowStrength * (0.55 + 0.45 * day));
  set(SLOT.CEL2, p.cel.highlightAt, p.cel.highlight * (0.4 + 0.6 * day), f.keyRef, (p.rim?.amount ?? 0) * day);
  set(SLOT.CEL3, c.rim[0], c.rim[1], c.rim[2], p.rim?.power ?? 3);
  set(SLOT.PAINT0, p.paint.amount, 1 / Math.max(0.5, p.paint.scale), p.paint.flat, p.paint.vertex);
  set(
    SLOT.PAINT1,
    (c.warm[0] - 1) * p.paint.hue,
    (c.warm[1] - 1) * p.paint.hue,
    (c.warm[2] - 1) * p.paint.hue,
    p.paint.edge,
  );
  // Haze: the fog's brightness, the profile's hue (fading to plain fog at night), a touch lighter.
  const a = p.atmosphere;
  const fl = luma(f.fog);
  const k = 0.7 * (1 - 0.6 * f.night);
  const lift = 1.06;
  set(
    SLOT.ATMO0,
    (f.fog[0] + (c.haze[0] * fl - f.fog[0]) * k) * lift,
    (f.fog[1] + (c.haze[1] * fl - f.fog[1]) * k) * lift,
    (f.fog[2] + (c.haze[2] * fl - f.fog[2]) * k) * lift,
    a.strength * (1 - f.void),
  );
  set(SLOT.ATMO1, a.near, Math.max(a.far, a.near + 1), a.heightBase, a.heightFalloff);
  set(SLOT.ATMO2, a.layers, a.heightK, 0, 0);
}

/** The ink colour for this frame (linear), day → night. */
export function inkColor(c: ProfileColors, night: number, out: RGB = [0, 0, 0]): RGB {
  for (let i = 0; i < 3; i++)
    out[i] = (c.ink[i] as number) + ((c.inkNight[i] as number) - (c.ink[i] as number)) * night;
  return out;
}
