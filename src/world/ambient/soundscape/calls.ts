/**
 * Procedural creature and people voices for the soundscape (Web Audio, works on an OfflineAudioContext too).
 * Every call is a one-shot sub graph:  sources -> envelopes -> top gain -> distance lowpass -> panner -> dest,
 * freed by `onended`. Levels: a call's peak sits near `level` (0..1, already distance-attenuated by the caller),
 * and the soundscape's master (AMBIENT_LEVEL) sits under the music.
 */
import { noiseBuffers } from "../../../audio/sfx";

export type CallName =
  | "growl" // puma: low rough growl
  | "yip" // fox: sharp yips
  | "condor" // wing whoosh + hoarse croak
  | "trill" // vicuña alarm: high trilling whistle
  | "hum" // alpaca / llama: soft nasal hum
  | "whistle" // vizcacha: short whistle
  | "duck" // torrent duck: sharp whistles
  | "tinamou" // perdiz: melancholic descending whistle
  | "buzz" // colibrí wing buzz fly-by
  | "huff" // bear: low huffs
  | "chatter" // people: murmured syllables
  | "laugh"; // people: a short laugh

export const CALL_NAMES: readonly CallName[] = [
  "growl",
  "yip",
  "condor",
  "trill",
  "hum",
  "whistle",
  "duck",
  "tinamou",
  "buzz",
  "huff",
  "chatter",
  "laugh",
];

export interface CallOptions {
  /** Peak level 0..1 (distance already applied). */
  level: number;
  /** -1..1 */
  pan: number;
  /** Distance to the listener in world units (air absorption: farther = duller). */
  dist: number;
  /** 0..1 random source for variation. */
  r: () => number;
  /** Pitch variant: 0 default, 1 higher (child, alpaca), -1 lower (llama). */
  variant?: number;
}

type Src = AudioScheduledSourceNode;

/** Lowpass cutoff for a source `dist` units away: bright up close, dull far away. */
export function airCutoff(dist: number): number {
  return 1800 + 15000 / (1 + Math.max(0, dist) / 10) ** 1.3;
}

/** Rough vowel formants (F1, F2) for murmured speech. */
const VOWELS: readonly (readonly [number, number])[] = [
  [750, 1250], // a
  [450, 1900], // e
  [320, 2300], // i
  [480, 900], // o
  [340, 800], // u
];

class Shot {
  readonly top: GainNode;
  private nodes: AudioNode[] = [];
  private live = 0;
  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
    o: CallOptions,
  ) {
    this.top = ctx.createGain();
    this.top.gain.value = Math.max(0, Math.min(1, o.level));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = airCutoff(o.dist);
    lp.Q.value = 0.5;
    this.top.connect(lp);
    this.nodes.push(this.top, lp);
    if (o.pan && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      lp.connect(p);
      p.connect(dest);
      this.nodes.push(p);
    } else lp.connect(dest);
  }
  /** Registers a source; the shot's output nodes disconnect when the last one ends. */
  add(s: Src) {
    this.live++;
    s.onended = () => {
      if (--this.live > 0) return;
      for (const n of this.nodes) n.disconnect();
    };
  }
  gain(dest: AudioNode = this.top, v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }
  /** A gain stage (into `dest`) whose level wobbles by +-`depth` around 1 - depth at `rate` Hz. */
  tremolo(dest: AudioNode, rate: number, depth: number, t0: number, t1: number): GainNode {
    const stage = this.gain(dest, 1 - depth);
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = depth;
    lfoG.connect(stage.gain);
    this.osc("sine", rate, lfoG, t0, t1);
    return stage;
  }
  filter(type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }
  osc(type: OscillatorType, f: number, dest: AudioNode, t0: number, t1: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.connect(dest);
    o.start(t0);
    o.stop(t1 + 0.02);
    this.add(o);
    return o;
  }
  noise(dest: AudioNode, t0: number, t1: number, brown = false, offset = 0): AudioBufferSourceNode {
    const nb = noiseBuffers(this.ctx);
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? nb.brown : nb.white;
    s.loop = true;
    s.connect(dest);
    s.start(t0, offset);
    s.stop(t1 + 0.02);
    this.add(s);
    return s;
  }
}

/** Attack / hold / exponential release envelope on `g` (peak `v`). */
function env(g: GainNode, t: number, a: number, hold: number, rel: number, v: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  if (hold > 0) g.gain.setValueAtTime(v, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
}

/** Schedules one creature/people call at audio time `t` into `dest`. */
export function playCall(ctx: BaseAudioContext, dest: AudioNode, name: CallName, t: number, o: CallOptions) {
  if (!(o.level > 0.001)) return;
  const s = new Shot(ctx, dest, o);
  const r = o.r;
  const v = o.variant ?? 0;
  switch (name) {
    case "growl": {
      // a low saw, rough with a fast tremolo, plus a breathy rumble; swells and fades
      const len = 1.2 + r() * 0.4;
      const g = s.gain();
      env(g, t, 0.3, len - 0.7, 0.4, 0.9);
      const rough = s.tremolo(g, 19 + r() * 5, 0.35, t, t + len);
      const lp = s.filter("lowpass", 380, 0.9, rough);
      const o1 = s.osc("sawtooth", 62 + r() * 10, lp, t, t + len);
      o1.frequency.linearRampToValueAtTime(52, t + len);
      const bp = s.filter("bandpass", 260, 0.8, g);
      s.noise(s.gain(bp, 0.9), t, t + len, true, r() * 2);
      break;
    }
    case "yip": {
      const n = 2 + Math.floor(r() * 3);
      let at = t;
      for (let i = 0; i < n; i++) {
        const f = 820 + r() * 160;
        const g = s.gain();
        env(g, at, 0.012, 0.03, 0.09, 0.8);
        const o1 = s.osc("triangle", f, g, at, at + 0.14);
        o1.frequency.exponentialRampToValueAtTime(f * 1.7, at + 0.04);
        o1.frequency.exponentialRampToValueAtTime(f * 1.1, at + 0.13);
        const o2 = s.osc("sine", f * 2, s.gain(g, 0.3), at, at + 0.14);
        o2.frequency.exponentialRampToValueAtTime(f * 3.4, at + 0.04);
        o2.frequency.exponentialRampToValueAtTime(f * 2.2, at + 0.13);
        at += 0.2 + r() * 0.14;
      }
      break;
    }
    case "condor": {
      // two slow wing beats (filtered noise swells), then a short hoarse croak
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.45;
        const g = s.gain();
        env(g, t0, 0.16, 0.05, 0.22, 0.7);
        const bp = s.filter("bandpass", 380, 0.9, g);
        bp.frequency.setValueAtTime(380, t0);
        bp.frequency.exponentialRampToValueAtTime(1300, t0 + 0.18);
        bp.frequency.exponentialRampToValueAtTime(320, t0 + 0.42);
        s.noise(bp, t0, t0 + 0.45, false, r() * 2);
      }
      const tc = t + 1.05;
      const g = s.gain();
      env(g, tc, 0.02, 0.2, 0.15, 0.45);
      const bp = s.filter("bandpass", 850, 2.2, s.tremolo(g, 34, 0.3, tc, tc + 0.4));
      s.osc("sawtooth", 135 + r() * 20, bp, tc, tc + 0.4);
      break;
    }
    case "trill": {
      // relincho de alarma: a high trilling whistle falling in pitch, twice
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.8;
        const len = 0.6;
        const f = 2500 + r() * 300;
        const g = s.gain();
        env(g, t0, 0.03, len - 0.25, 0.22, 0.6);
        const o1 = s.osc("sine", f, g, t0, t0 + len);
        o1.frequency.exponentialRampToValueAtTime(f * 0.72, t0 + len);
        const fm = ctx.createGain();
        fm.gain.value = 140;
        fm.connect(o1.frequency);
        s.osc("sine", 26 + r() * 6, fm, t0, t0 + len);
      }
      break;
    }
    case "hum": {
      // a nasal "mmm": soft saw through a closed-mouth formant, rising then falling
      const f = v > 0 ? 250 : v < 0 ? 165 : 205;
      const len = 0.55 + r() * 0.2;
      const g = s.gain();
      env(g, t, 0.12, len - 0.3, 0.2, 0.7);
      const lp = s.filter("lowpass", 700, 0.7, g);
      const pk = s.filter("peaking", 280, 1.2, lp);
      pk.gain.value = 6;
      const o1 = s.osc("sawtooth", f, pk, t, t + len);
      o1.frequency.linearRampToValueAtTime(f * 1.12, t + len * 0.4);
      o1.frequency.linearRampToValueAtTime(f * 0.92, t + len);
      break;
    }
    case "whistle": {
      const n = r() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const t0 = t + i * 0.22;
        const f = 2050 + r() * 250;
        const g = s.gain();
        env(g, t0, 0.01, 0.05, 0.08, 0.7);
        const o1 = s.osc("sine", f, g, t0, t0 + 0.15);
        o1.frequency.exponentialRampToValueAtTime(f * 0.85, t0 + 0.14);
      }
      break;
    }
    case "duck": {
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const t0 = t + i * 0.16;
        const f = 3100 + r() * 300;
        const g = s.gain();
        env(g, t0, 0.008, 0.03, 0.06, 0.65);
        const o1 = s.osc("sine", f, g, t0, t0 + 0.11);
        o1.frequency.exponentialRampToValueAtTime(f * 1.2, t0 + 0.05);
        o1.frequency.exponentialRampToValueAtTime(f * 1.05, t0 + 0.1);
      }
      break;
    }
    case "tinamou": {
      // perdiz serrana: slow, pure, descending whistles, each sliding up into the note
      const base = 1300 + r() * 120;
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const t0 = t + i * 0.52;
        const f = base * 0.95 ** i;
        const g = s.gain();
        env(g, t0, 0.07, 0.16, 0.16, 0.6);
        const o1 = s.osc("sine", f * 0.86, g, t0, t0 + 0.42);
        o1.frequency.exponentialRampToValueAtTime(f, t0 + 0.09);
        o1.frequency.exponentialRampToValueAtTime(f * 0.97, t0 + 0.4);
      }
      break;
    }
    case "buzz": {
      // colibrí fly-by: a fast wing hum with a small Doppler glide and a high whir
      const len = 0.8 + r() * 0.3;
      const g = s.gain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.7, t + len * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      const bp = s.filter("bandpass", 240, 1.1, g);
      const o1 = s.osc("sawtooth", 52, bp, t, t + len);
      o1.frequency.linearRampToValueAtTime(58, t + len * 0.45);
      o1.frequency.linearRampToValueAtTime(46, t + len);
      s.noise(s.filter("bandpass", 2600, 2, s.gain(g, 0.25)), t, t + len, false, r() * 2);
      break;
    }
    case "huff": {
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * (0.45 + r() * 0.1);
        const g = s.gain();
        env(g, t0, 0.03, 0.06, 0.28, 0.85);
        s.noise(s.filter("lowpass", 420, 0.7, g), t0, t0 + 0.4, true, r() * 2);
        const o1 = s.osc("sine", 85, s.gain(g, 0.5), t0, t0 + 0.2);
        o1.frequency.exponentialRampToValueAtTime(55, t0 + 0.2);
      }
      break;
    }
    case "chatter":
    case "laugh": {
      const laugh = name === "laugh";
      const f0 = (v > 0 ? 270 : 120 + r() * 90) * (laugh ? 1.25 : 1);
      const n = laugh ? 4 + Math.floor(r() * 3) : 5 + Math.floor(r() * 6);
      // syllable plan first, so the source lasts exactly as long as the phrase
      const plan: Array<{ at: number; on: number; vowel: number; p: number; peak: number }> = [];
      let at = t;
      for (let i = 0; i < n; i++) {
        const on = laugh ? 0.08 + r() * 0.03 : 0.07 + r() * 0.12;
        const off = laugh ? 0.07 : 0.03 + r() * (i % 3 === 2 ? 0.18 : 0.05);
        plan.push({
          at,
          on,
          vowel: laugh ? 0 : Math.floor(r() * VOWELS.length),
          p: laugh ? f0 * (1 - i * 0.06) : f0 * (0.9 + r() * 0.25),
          peak: laugh ? 0.9 * (1 - i * 0.08) : 0.6 + r() * 0.4,
        });
        at += on + off;
      }
      const g = s.gain();
      const lp = s.filter("lowpass", 2400, 0.6, g);
      const f1 = s.filter("bandpass", 600, 2.5, lp);
      const f2 = s.filter("bandpass", 1500, 3, s.gain(lp, 0.6));
      const src = s.osc("sawtooth", f0, f1, t, at);
      src.connect(f2);
      for (const sy of plan) {
        const [a, b] = VOWELS[sy.vowel] ?? [700, 1200];
        f1.frequency.setValueAtTime(a, sy.at);
        f2.frequency.setValueAtTime(b, sy.at);
        src.frequency.setValueAtTime(sy.p, sy.at);
        src.frequency.linearRampToValueAtTime(sy.p * (laugh ? 0.92 : 0.95 + r() * 0.1), sy.at + sy.on);
        g.gain.setValueAtTime(0.0001, sy.at);
        g.gain.linearRampToValueAtTime(sy.peak, sy.at + Math.min(0.025, sy.on * 0.3));
        g.gain.linearRampToValueAtTime(sy.peak * 0.7, sy.at + sy.on * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, sy.at + sy.on);
      }
      // breath under the "ha"s
      if (laugh) s.noise(s.filter("bandpass", 1600, 1, s.gain(g, 0.25)), t, at, false, r() * 2);
      break;
    }
  }
}
