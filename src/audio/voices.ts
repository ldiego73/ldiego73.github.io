/**
 * Synth voices built from Web Audio nodes. Works with AudioContext and OfflineAudioContext.
 * Polyphony is capped by counting voices that are still sounding at the new note's start time, so the
 * cap also holds when a whole track is scheduled up-front offline.
 */
import type { VoiceName } from "./contract";
import { isDrum } from "./contract";
import { midiToHz } from "./notation";

export interface VoiceParams {
  /** Start time (audio clock). */
  time: number;
  /** Note length in seconds (ignored by percussive voices). */
  dur: number;
  /** MIDI note, null for drums. */
  midi: number | null;
  /** 0..1 */
  vel: number;
  /** Final level multiplier. */
  gain: number;
  /** 0..1 brightness (music intensity). */
  bright: number;
}

type Src = AudioScheduledSourceNode;

const NOISE_SECONDS = 2;
const HARMONICS = 48;

export class VoiceBank {
  private noise: AudioBuffer;
  private waves = new Map<number, PeriodicWave>();
  /** End times of the voices that were started, used for the polyphony cap. */
  private ends: number[] = [];
  /** Voices currently allocated (for diagnostics/tests). */
  active = 0;
  dropped = 0;

  constructor(
    private ctx: BaseAudioContext,
    private maxVoices = 28,
  ) {
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 0x9e3779b9; // deterministic xorshift: identical noise offline and live
    for (let i = 0; i < n; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
  }

  /** Schedules one note. Returns false when dropped by the polyphony cap. */
  play(voice: VoiceName, dest: AudioNode, p: VoiceParams): boolean {
    const drum = isDrum(voice);
    this.ends = this.ends.filter((e) => e > p.time);
    // drums get a little headroom so the groove never loses its hits
    if (this.ends.length >= this.maxVoices + (drum ? 6 : 0)) {
      this.dropped++;
      return false;
    }
    const out = this.ctx.createGain();
    out.connect(dest);
    const f = p.midi === null ? 0 : midiToHz(p.midi);
    const amp = Math.max(0, p.vel) * Math.max(0, p.gain);
    let end: { stop: number; last: Src } | undefined;
    switch (voice) {
      case "pulse12":
        end = this.pulse(out, p, f, amp, 0.125);
        break;
      case "pulse25":
        end = this.pulse(out, p, f, amp, 0.25);
        break;
      case "pulse50":
        end = this.pulse(out, p, f, amp, 0.5);
        break;
      case "triangle":
        end = this.triangle(out, p, f, amp);
        break;
      case "saw":
        end = this.saw(out, p, f, amp);
        break;
      case "bell":
        end = this.bell(out, p, f, amp);
        break;
      case "pad":
        end = this.pad(out, p, f, amp);
        break;
      case "quena":
        end = this.quena(out, p, f, amp);
        break;
      case "zampona":
        end = this.zampona(out, p, f, amp);
        break;
      case "charango":
        end = this.charango(out, p, f, amp);
        break;
      case "kick":
        end = this.kick(out, p, amp);
        break;
      case "snare":
        end = this.snare(out, p, amp);
        break;
      case "hat":
        end = this.hat(out, p, amp);
        break;
      case "shaker":
        end = this.shaker(out, p, amp);
        break;
      case "bombo":
        end = this.bombo(out, p, amp);
        break;
    }
    if (!end) {
      out.disconnect();
      return false;
    }
    this.ends.push(end.stop);
    this.active++;
    end.last.onended = () => {
      this.active--;
      out.disconnect();
    };
    return true;
  }

  // ---------------------------------------------------------------- helpers

  private osc(
    type: "sine" | "triangle" | "sawtooth" | "square" | PeriodicWave,
    freq: number,
    t: number,
    stop: number,
  ): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === "string") o.type = type as "sine";
    else o.setPeriodicWave(type as PeriodicWave);
    o.frequency.value = freq;
    o.start(t);
    o.stop(stop);
    return o;
  }

  private noiseSrc(t: number, stop: number, loop = false): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const offset = ((t * 7.31) % 1) * (NOISE_SECONDS - 0.5);
    if (loop) {
      s.loop = true;
      s.start(t, offset);
      s.stop(stop);
    } else {
      s.start(t, offset, Math.max(0.001, stop - t));
    }
    return s;
  }

  private gain(v: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, dest?: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }

  /** attack -> peak, decay toward sustain*peak, release at noteEnd. Returns the stop time. */
  private adsr(
    g: AudioParam,
    t: number,
    noteEnd: number,
    peak: number,
    attack: number,
    sustain: number,
    decayTau: number,
    release: number,
  ): number {
    const end = Math.max(noteEnd, t + attack);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.setTargetAtTime(peak * sustain, t + attack, decayTau);
    g.setTargetAtTime(0, end, release / 4);
    return end + release * 1.6;
  }

  /** Pure exponential-ish decay for percussive sounds. Returns the stop time. */
  private hit(g: AudioParam, t: number, peak: number, attack: number, tau: number, length: number): number {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.setTargetAtTime(0, t + attack, tau);
    return t + length;
  }

  private pulseWave(duty: number): PeriodicWave {
    let w = this.waves.get(duty);
    if (!w) {
      const real = new Float32Array(HARMONICS + 1);
      const imag = new Float32Array(HARMONICS + 1);
      for (let n = 1; n <= HARMONICS; n++) {
        real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
        imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(n * Math.PI * duty));
      }
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(duty, w);
    }
    return w;
  }

  // ---------------------------------------------------------------- tonal

  private pulse(out: GainNode, p: VoiceParams, f: number, amp: number, duty: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.04, p.dur * 0.92);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.3, 0.004, 0.72, 0.18, 0.05);
    const o = this.osc(this.pulseWave(duty), f, t, stop);
    o.connect(out);
    return { stop, last: o };
  }

  private triangle(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.05, p.dur * 0.95);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.6, 0.006, 0.85, 0.3, 0.06);
    const o = this.osc("triangle", f, t, stop);
    o.connect(out);
    return { stop, last: o };
  }

  private saw(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.05, p.dur * 0.9);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.28, 0.008, 0.6, 0.2, 0.08);
    const lp = this.filter("lowpass", 500, 1.2, out);
    const top = Math.min(9000, 700 + 2400 * p.bright + 900 * p.vel);
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.setTargetAtTime(top * 0.35, t, 0.15);
    const o = this.osc("sawtooth", f, t, stop);
    o.connect(lp);
    return { stop, last: o };
  }

  private bell(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const ring = 1.2;
    const stop = t + ring + 0.1;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp * 0.4, t + 0.002);
    out.gain.setTargetAtTime(0, t + 0.002, 0.3);
    const car = this.osc("sine", f, t, stop);
    const mod = this.osc("sine", f * 3.5, t, stop);
    const mg = this.ctx.createGain();
    const index = f * (1.2 + 1.5 * p.vel);
    mg.gain.setValueAtTime(index, t);
    mg.gain.setTargetAtTime(index * 0.05, t, 0.18);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(out);
    return { stop, last: car };
  }

  private pad(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.5, p.dur * 0.98);
    const attack = Math.min(0.5, (noteEnd - t) * 0.45);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.2, attack, 1, 1, 0.6);
    const lp = this.filter("lowpass", 700 + 1100 * p.bright, 0.5, out);
    let last: Src | undefined;
    for (const cents of [-9, 0, 9]) {
      const o = this.osc("sawtooth", f, t, stop);
      o.detune.value = cents;
      o.connect(lp);
      last = o;
    }
    return { stop, last: last as Src };
  }

  private quena(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.12, p.dur * 0.97);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.5, 0.065, 0.85, 0.25, 0.14);
    const body = this.osc("sine", f, t, stop);
    const tri = this.osc("triangle", f, t, stop);
    const triG = this.gain(0.22, out);
    body.connect(out);
    tri.connect(triG);
    // pitch scoop up into the note, then vibrato that arrives late
    for (const o of [body, tri]) {
      o.detune.setValueAtTime(-70, t);
      o.detune.setTargetAtTime(0, t, 0.03);
    }
    const lfo = this.osc("sine", 5.2, t, stop);
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.22);
    depth.gain.linearRampToValueAtTime(14, t + 0.6);
    lfo.connect(depth);
    depth.connect(body.detune);
    depth.connect(tri.detune);
    // breath
    const breath = this.noiseSrc(t, stop, true);
    const bp = this.filter("bandpass", Math.min(7000, f * 2.2), 1.4);
    const bg = this.ctx.createGain();
    breath.connect(bp);
    bp.connect(bg);
    bg.connect(out);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.5, t + 0.04);
    bg.gain.setTargetAtTime(0.22, t + 0.04, 0.12);
    return { stop, last: body };
  }

  private zampona(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const noteEnd = t + Math.max(0.15, p.dur * 1.05);
    const stop = this.adsr(out.gain, t, noteEnd, amp * 0.5, 0.018, 0.9, 0.3, 0.2);
    const body = this.osc("sine", f, t, stop);
    const tri = this.osc("triangle", f, t, stop);
    const triG = this.gain(0.3, out);
    body.connect(out);
    tri.connect(triG);
    // chiff: strong breath burst at onset, light breath after
    const n = this.noiseSrc(t, stop, true);
    const bp = this.filter("bandpass", Math.min(8000, f * 3), 2.2);
    const ng = this.ctx.createGain();
    n.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(1.1, t + 0.008);
    ng.gain.setTargetAtTime(0.1, t + 0.008, 0.045);
    return { stop, last: body };
  }

  private charango(out: GainNode, p: VoiceParams, f: number, amp: number) {
    const t = p.time;
    const stop = t + 0.5;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp * 0.32, t + 0.0025);
    out.gain.setTargetAtTime(0, t + 0.0025, 0.1);
    const lp = this.filter("lowpass", 900, 0.8, out);
    const top = Math.min(9000, 3200 + 2600 * p.bright + 1200 * p.vel);
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.setTargetAtTime(Math.max(700, f * 1.5), t, 0.07);
    const a = this.osc("triangle", f, t, stop);
    a.detune.value = -6;
    const b = this.osc("sawtooth", f, t, stop);
    b.detune.value = 6;
    const bg = this.gain(0.35, lp);
    a.connect(lp);
    b.connect(bg);
    // pluck transient
    const n = this.noiseSrc(t, t + 0.02);
    const hp = this.filter("highpass", 3000, 0.7, out);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.setTargetAtTime(0, t, 0.004);
    n.connect(ng);
    ng.connect(hp);
    return { stop, last: a };
  }

  // ---------------------------------------------------------------- drums

  private kick(out: GainNode, p: VoiceParams, amp: number) {
    const t = p.time;
    const stop = this.hit(out.gain, t, amp * 0.9, 0.002, 0.09, 0.4);
    const o = this.osc("sine", 160, t, stop);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    o.connect(out);
    return { stop, last: o };
  }

  private snare(out: GainNode, p: VoiceParams, amp: number) {
    const t = p.time;
    const stop = t + 0.3;
    const n = this.noiseSrc(t, stop);
    const hp = this.filter("highpass", 1400, 0.7);
    const ng = this.ctx.createGain();
    n.connect(hp);
    hp.connect(ng);
    ng.connect(out);
    this.hit(ng.gain, t, amp * 0.55, 0.001, 0.05, 0.3);
    const o = this.osc("triangle", 200, t, stop);
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
    const og = this.ctx.createGain();
    o.connect(og);
    og.connect(out);
    this.hit(og.gain, t, amp * 0.45, 0.001, 0.035, 0.2);
    return { stop, last: n };
  }

  private hat(out: GainNode, p: VoiceParams, amp: number) {
    const t = p.time;
    const tau = 0.012 + 0.03 * p.vel;
    const stop = t + tau * 6 + 0.02;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp * 0.28, t + 0.0008);
    out.gain.setTargetAtTime(0, t + 0.0008, tau);
    const n = this.noiseSrc(t, stop);
    const hp = this.filter("highpass", 7200, 0.7, out);
    n.connect(hp);
    return { stop, last: n };
  }

  private shaker(out: GainNode, p: VoiceParams, amp: number) {
    const t = p.time;
    const stop = t + 0.2;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp * 0.35, t + 0.009);
    out.gain.setTargetAtTime(0, t + 0.009, 0.03);
    const n = this.noiseSrc(t, stop);
    const bp = this.filter("bandpass", 5800, 1.1, out);
    n.connect(bp);
    return { stop, last: n };
  }

  private bombo(out: GainNode, p: VoiceParams, amp: number) {
    const t = p.time;
    const stop = t + 0.9;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp * 0.95, t + 0.004);
    out.gain.setTargetAtTime(0, t + 0.004, 0.22);
    const o = this.osc("sine", 95, t, stop);
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    o.connect(out);
    // soft skin thump
    const n = this.noiseSrc(t, t + 0.06);
    const lp = this.filter("lowpass", 260, 0.7);
    const ng = this.ctx.createGain();
    n.connect(lp);
    lp.connect(ng);
    ng.connect(out);
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.setTargetAtTime(0, t, 0.015);
    return { stop, last: o };
  }
}
