/**
 * Procedural one-shot sound effects on the shared music output (same AudioContext, master volume, mute, limiter).
 *
 *   sfx.play("stamp")            // quena chime on a passport stamp
 *   sfx.play("squeak", { pan })  // optional stereo position -1..1 and level multiplier
 *
 * Nothing sounds (and no node is built) until the music player says output is live: the AudioContext is only
 * ever created by `getMusic().unlock()` inside a user gesture, and `output()` is null while muted/paused/hidden.
 * `renderSfx()` is the context-agnostic part, usable with an OfflineAudioContext for previews.
 */
import type { AudioOutput } from "./contract";
import { midiToHz } from "./notation";
import { getMusic } from "./player";

export type SfxName =
  | "stamp" // pentatonic quena chime
  | "open" // soft paper unfold
  | "close" // paper fold + soft tap
  | "teleport" // airy whoosh
  | "door" // wooden door creak + knock
  | "llama" // nasal "mmm" hum
  | "splash" // water splash + droplets
  | "squeak" // vizcacha chirp
  | "sparkle" // golden glitter
  | "tick"; // neutral UI tick

export const SFX_NAMES: readonly SfxName[] = [
  "stamp",
  "open",
  "close",
  "teleport",
  "door",
  "llama",
  "splash",
  "squeak",
  "sparkle",
  "tick",
];

export interface SfxOptions {
  /** -1 (left) .. 1 (right). */
  pan?: number;
  /** Level multiplier, default 1. */
  gain?: number;
  /** Variation seed (same seed, same sound). Default: random. */
  seed?: number;
}

/** Minimum seconds between two plays of the same sound, so event bursts never stack into a roar. */
export const MIN_GAP: Record<SfxName, number> = {
  stamp: 0.25,
  open: 0.12,
  close: 0.12,
  teleport: 0.5,
  door: 0.4,
  llama: 0.8,
  splash: 0.15,
  squeak: 0.15,
  sparkle: 0.3,
  tick: 0.04,
};

/** D major pentatonic around the quena's sweet spot (matches the summit stinger's key). */
export const PENTATONIC = [62, 64, 66, 69, 71, 74, 76, 78, 81] as const;

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A rising three-note pentatonic phrase that resolves on D or A (a little "achievement" call). */
export function chimeNotes(seed: number): [number, number, number] {
  const r = rng(seed);
  const start = Math.floor(r() * 3); // D4, E4 or F#4
  const mid = start + 1 + Math.floor(r() * 2); // always above the start
  const end = r() < 0.5 || mid >= 3 ? 5 : 3; // D5, or A4 when that still rises
  return [PENTATONIC[start], PENTATONIC[mid], PENTATONIC[end]];
}

/**
 * Which effect a passport stamp gets: eggs have their own voice (vizcacha squeak / golden sparkle). The summit
 * stamp gets none: the world music already plays its `summit` stinger at that moment.
 */
export function sfxForStamp(d: { id: string; kind: string }): SfxName | null {
  if (d.kind === "summit") return null;
  if (d.kind === "egg" || d.id.startsWith("egg:")) return d.id.includes("golden") ? "sparkle" : "squeak";
  return "stamp";
}

/** Per-key rate limiter (pure; time is passed in). */
export class RateGate {
  private last = new Map<string, number>();
  allow(key: string, now: number, gap: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < gap && now >= prev) return false;
    this.last.set(key, now);
    return true;
  }
}

// ---------------------------------------------------------------------------------------------- noise buffers

const noiseCache = new WeakMap<BaseAudioContext, { white: AudioBuffer; brown: AudioBuffer }>();

/** Looping noise buffers shared by every effect and ambience layer of a context (deterministic). */
export function noiseBuffers(ctx: BaseAudioContext): { white: AudioBuffer; brown: AudioBuffer } {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const n = Math.floor(ctx.sampleRate * 3);
  const white = ctx.createBuffer(1, n, ctx.sampleRate);
  const brown = ctx.createBuffer(1, n, ctx.sampleRate);
  const w = white.getChannelData(0);
  const br = brown.getChannelData(0);
  const r = rng(0x5eed);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    w[i] = x;
    last = (last + 0.02 * x) / 1.02;
    br[i] = last * 3.5;
  }
  // crossfade the loop seam of the brown buffer so it never thumps
  const fade = Math.min(2048, n >> 2);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    br[n - fade + i] = br[n - fade + i] * (1 - k) + br[i] * k;
  }
  b = { white, brown };
  noiseCache.set(ctx, b);
  return b;
}

// ---------------------------------------------------------------------------------------------- synthesis

type Voices = Pick<AudioOutput["voices"], "play">;

interface Kit {
  ctx: BaseAudioContext;
  out: GainNode;
  r: () => number;
  ends: AudioScheduledSourceNode[];
}

function osc(k: Kit, type: OscillatorType, f: number, t: number, stop: number, dest: AudioNode) {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  k.ends.push(o);
  return o;
}

function noise(k: Kit, t: number, stop: number, dest: AudioNode, brown = false) {
  const nb = noiseBuffers(k.ctx);
  const s = k.ctx.createBufferSource();
  s.buffer = brown ? nb.brown : nb.white;
  s.loop = true;
  s.connect(dest);
  s.start(t, k.r() * 2);
  s.stop(stop);
  k.ends.push(s);
  return s;
}

function gainNode(k: Kit, dest: AudioNode | AudioParam, v = 0) {
  const g = k.ctx.createGain();
  g.gain.value = v;
  if ("connect" in dest) g.connect(dest);
  else g.connect(dest);
  return g;
}

function filter(k: Kit, type: BiquadFilterType, f: number, q: number, dest: AudioNode) {
  const b = k.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}

/** Attack to `peak`, exponential decay to silence. Returns the end time. */
function hit(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  p.setValueAtTime(0, t + attack + decay + 0.005);
  return t + attack + decay + 0.01;
}

function paper(k: Kit, t: number, up: boolean): number {
  let end = t;
  const bursts = up ? [0, 0.07, 0.15] : [0, 0.06];
  for (const [i, at] of bursts.entries()) {
    const t0 = t + at + k.r() * 0.015;
    const g = gainNode(k, k.out);
    const bp = filter(k, "bandpass", 2400, 0.9, g);
    const f0 = up ? 1600 + i * 700 : 4200 - i * 1200;
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(up ? f0 * 1.8 : f0 * 0.55, t0 + 0.08);
    const stop = hit(g.gain, t0, (up ? 0.28 : 0.24) * (1 - i * 0.2), 0.008, 0.07 + k.r() * 0.03);
    noise(k, t0, stop, bp);
    end = Math.max(end, stop);
  }
  if (!up) {
    // the panel lands: soft papery tap
    const g = gainNode(k, k.out);
    const t0 = t + 0.1;
    const o = osc(k, "sine", 190, t0, t0 + 0.12, g);
    o.frequency.exponentialRampToValueAtTime(110, t0 + 0.08);
    end = Math.max(end, hit(g.gain, t0, 0.22, 0.004, 0.08));
  }
  return end;
}

function teleport(k: Kit, t: number): number {
  const len = 0.95;
  const g = gainNode(k, k.out);
  const bp = filter(k, "bandpass", 300, 2.2, g);
  bp.frequency.setValueAtTime(260, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + len * 0.55);
  bp.frequency.exponentialRampToValueAtTime(700, t + len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55, t + len * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  noise(k, t, t + len + 0.02, bp);
  const tg = gainNode(k, k.out);
  const o = osc(k, "triangle", 220, t, t + len, tg);
  o.frequency.exponentialRampToValueAtTime(880, t + len * 0.8);
  tg.gain.setValueAtTime(0, t);
  tg.gain.linearRampToValueAtTime(0.07, t + len * 0.45);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + len);
  return t + len + 0.03;
}

function door(k: Kit, t: number): number {
  // creak: buzzy low string with a wandering pitch through a woody resonance
  const cg = gainNode(k, k.out);
  const res = filter(k, "bandpass", 620, 3, cg);
  const c = osc(k, "sawtooth", 150, t, t + 0.42, res);
  c.frequency.setValueAtTime(150, t);
  c.frequency.linearRampToValueAtTime(205, t + 0.18);
  c.frequency.linearRampToValueAtTime(170, t + 0.4);
  cg.gain.setValueAtTime(0, t);
  cg.gain.linearRampToValueAtTime(0.16, t + 0.06);
  cg.gain.linearRampToValueAtTime(0.1, t + 0.3);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  // two wooden knocks as it settles
  let end = t + 0.45;
  for (const at of [0.38, 0.5]) {
    const t0 = t + at;
    const g = gainNode(k, k.out);
    const o = osc(k, "sine", 140, t0, t0 + 0.16, g);
    o.frequency.exponentialRampToValueAtTime(75, t0 + 0.12);
    hit(g.gain, t0, at < 0.4 ? 0.42 : 0.26, 0.003, 0.12);
    const ng = gainNode(k, k.out);
    const bp = filter(k, "bandpass", 900, 1.6, ng);
    end = Math.max(end, hit(ng.gain, t0, 0.18, 0.002, 0.05));
    noise(k, t0, t0 + 0.08, bp);
  }
  return end + 0.1;
}

function llama(k: Kit, t: number): number {
  const len = 0.75;
  const g = gainNode(k, k.out);
  const nasal = filter(k, "bandpass", 420, 2.5, g);
  const body = filter(k, "lowpass", 900, 0.7, g);
  const f = 165 + k.r() * 25;
  const saw = osc(k, "sawtooth", f, t, t + len, nasal);
  const sine = osc(k, "sine", f, t, t + len, body);
  for (const o of [saw, sine]) {
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.linearRampToValueAtTime(f * 1.12, t + len * 0.35);
    o.frequency.linearRampToValueAtTime(f, t + len);
  }
  const lfo = osc(k, "sine", 6.5, t, t + len, gainNode(k, saw.detune, 18));
  lfo.connect(gainNode(k, sine.detune, 18));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32, t + 0.09);
  g.gain.setValueAtTime(0.3, t + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  return t + len + 0.02;
}

function splash(k: Kit, t: number): number {
  const g = gainNode(k, k.out);
  const lp = filter(k, "lowpass", 4500, 0.6, g);
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
  const end = hit(g.gain, t, 0.5, 0.006, 0.38);
  noise(k, t, end, lp);
  for (let i = 0; i < 3; i++) {
    const t0 = t + 0.08 + k.r() * 0.3;
    const dg = gainNode(k, k.out);
    const f = 900 + k.r() * 900;
    const o = osc(k, "sine", f, t0, t0 + 0.08, dg);
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t0 + 0.05);
    hit(dg.gain, t0, 0.12, 0.002, 0.06);
  }
  return Math.max(end, t + 0.5);
}

function squeak(k: Kit, t: number): number {
  let end = t;
  for (const at of [0, 0.12 + k.r() * 0.04]) {
    const t0 = t + at;
    const g = gainNode(k, k.out);
    const f = 2300 + k.r() * 400;
    const o = osc(k, "triangle", f, t0, t0 + 0.11, g);
    o.frequency.linearRampToValueAtTime(f * 1.4, t0 + 0.035);
    o.frequency.linearRampToValueAtTime(f * 1.1, t0 + 0.09);
    end = Math.max(end, hit(g.gain, t0, 0.2, 0.006, 0.09));
  }
  return end;
}

function sparkle(k: Kit, voices: Voices | null, t: number): number {
  const notes = [81, 83, 86, 88, 90, 93, 95, 98];
  let end = t;
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t0 = t + i * 0.055 + k.r() * 0.02;
    const midi = notes[Math.min(notes.length - 1, i + Math.floor(k.r() * 2))];
    if (voices) {
      voices.play("bell", k.out, { time: t0, dur: 0.3, midi, vel: 0.65 - i * 0.04, gain: 0.55, bright: 0.8 });
    } else {
      const g = gainNode(k, k.out);
      osc(k, "sine", midiToHz(midi), t0, t0 + 0.4, g);
      hit(g.gain, t0, 0.12, 0.003, 0.35);
    }
    end = Math.max(end, t0 + 0.5);
  }
  // airy shimmer underneath
  const ng = gainNode(k, k.out);
  const hp = filter(k, "highpass", 6000, 0.7, ng);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.06, t + 0.15);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  noise(k, t, t + 0.62, hp);
  return Math.max(end, t + 0.65);
}

function stamp(k: Kit, voices: Voices | null, t: number, seed: number): number {
  const [a, b, c] = chimeNotes(seed);
  const plan: Array<[number, number, number, number]> = [
    [0, a, 0.13, 0.8],
    [0.12, b, 0.13, 0.8],
    [0.24, c, 0.6, 0.9],
  ];
  for (const [at, midi, dur, vel] of plan) {
    if (voices) voices.play("quena", k.out, { time: t + at, dur, midi, vel, gain: 0.7, bright: 0.6 });
    else {
      const g = gainNode(k, k.out);
      osc(k, "sine", midiToHz(midi), t + at, t + at + dur + 0.3, g);
      hit(g.gain, t + at, 0.18, 0.04, dur + 0.25);
    }
  }
  if (voices) voices.play("bell", k.out, { time: t + 0.24, dur: 0.5, midi: c + 12, vel: 0.35, gain: 0.5, bright: 0.5 });
  return t + 1.2;
}

function tick(k: Kit, t: number): number {
  const g = gainNode(k, k.out);
  osc(k, "sine", 1750, t, t + 0.04, g);
  return hit(g.gain, t, 0.12, 0.002, 0.03);
}

/**
 * Schedules effect `name` at audio time `t` into `dest`. Works with any BaseAudioContext (live or offline).
 * `voices` (the engine's VoiceBank) gives the musical ones their quena/bell timbre; without it they fall back
 * to plain sines. Returns the time the sound has fully ended; the effect's nodes disconnect themselves then.
 */
export function renderSfx(
  ctx: BaseAudioContext,
  voices: Voices | null,
  dest: AudioNode,
  name: SfxName,
  t: number,
  opts: SfxOptions = {},
): number {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const top = ctx.createGain();
  top.gain.value = Math.max(0, opts.gain ?? 1);
  let pan: StereoPannerNode | null = null;
  if (opts.pan && typeof ctx.createStereoPanner === "function") {
    pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    top.connect(pan);
    pan.connect(dest);
  } else top.connect(dest);
  const k: Kit = { ctx, out: top, r: rng(seed), ends: [] };
  let end: number;
  switch (name) {
    case "stamp":
      end = stamp(k, voices, t, seed);
      break;
    case "open":
      end = paper(k, t, true);
      break;
    case "close":
      end = paper(k, t, false);
      break;
    case "teleport":
      end = teleport(k, t);
      break;
    case "door":
      end = door(k, t);
      break;
    case "llama":
      end = llama(k, t);
      break;
    case "splash":
      end = splash(k, t);
      break;
    case "squeak":
      end = squeak(k, t);
      break;
    case "sparkle":
      end = sparkle(k, voices, t);
      break;
    default:
      end = tick(k, t);
  }
  // Free the effect's top of graph once every source is done (voices clean up after themselves).
  const free = () => {
    top.disconnect();
    pan?.disconnect();
  };
  if (k.ends.length) {
    let left = k.ends.length;
    const done = () => {
      // short tail for voice notes that ring past our own sources
      if (--left === 0) setTimeout(free, 800);
    };
    for (const s of k.ends) s.onended = done;
  } else setTimeout(free, (end - ctx.currentTime + 0.8) * 1000);
  return end;
}

// ---------------------------------------------------------------------------------------------- bus

export interface Sfx {
  /** Plays effect `name` now if audio is live (unlocked, not muted). Returns false when it stayed silent. */
  play(name: SfxName, opts?: SfxOptions): boolean;
}

/** Builds an effects player over an output source (the shared music player by default). */
export function createSfx(source: () => AudioOutput | null): Sfx {
  const gate = new RateGate();
  return {
    play(name, opts) {
      let out: AudioOutput | null = null;
      try {
        out = source();
      } catch {
        return false;
      }
      if (out?.ctx.state !== "running") return false;
      const now = out.ctx.currentTime;
      if (!gate.allow(name, now, MIN_GAP[name] ?? 0.05)) return false;
      try {
        renderSfx(out.ctx, out.voices, out.sfx, name, now + 0.01, opts);
        return true;
      } catch (err) {
        console.warn("[audio] sfx", name, err);
        return false;
      }
    },
  };
}

/** Shared effects bus on the `getMusic()` singleton. Silent until the music unlock flow made audio live. */
export const sfx: Sfx = createSfx(() => getMusic().output?.() ?? null);
