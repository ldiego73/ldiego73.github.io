/**
 * Web Audio graph of the world soundscape, built on the shared music output's ambient bus.
 *
 *   wind  (brown noise -> bandpass, gusts move freq/level)  ┐
 *   water (white noise -> low/highpass -> panner)            ├-> master -> ambient bus (music master/mute/limiter)
 *   rain  (white noise -> highpass/lowpass)                  │
 *   one-shots: bird chirps, crickets, owl, footsteps ────────┘
 *
 * Continuous layers loop forever; when the user mutes or the tab hides, the music player suspends the context,
 * so they cost nothing then. Everything is stopped and disconnected in dispose().
 */
import { noiseBuffers } from "../../../audio/sfx";
import { PHONE_BEDS, smallSpeaker } from "../../../audio/speaker";
import type { Chirp, MixOut, Surface } from "./mix";

/** Overall soundscape level under the music. */
export const AMBIENT_LEVEL = 0.5;

const TC = 0.25;

type Src = AudioScheduledSourceNode;

export class Layers {
  readonly master: GainNode;
  private loops: Src[] = [];
  private nodes: AudioNode[] = [];
  private windBp: BiquadFilterNode;
  private windG: GainNode;
  private waterLp: BiquadFilterNode;
  private waterG: GainNode;
  private waterPan: StereoPannerNode | null = null;
  private rainG: GainNode;
  private disposed = false;
  /** Bed level factor (phone speakers get quieter beds). */
  private bedLevel = 1;

  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    const nb = noiseBuffers(ctx);
    // Phone speakers: quieter beds, less white-noise hiss, darker rain (../../../audio/speaker.ts).
    const phone = smallSpeaker();
    this.bedLevel = phone ? PHONE_BEDS.level : 1;
    const bright = phone ? PHONE_BEDS.bright : 1;
    this.master = this.keep(ctx.createGain());
    this.master.gain.value = 0;
    this.master.connect(dest);

    // wind
    this.windG = this.keep(ctx.createGain());
    this.windG.gain.value = 0;
    this.windG.connect(this.master);
    this.windBp = this.biquad("bandpass", 480, 0.55, this.windG);
    this.loop(nb.brown, this.windBp, 2.2);

    // water
    this.waterG = this.keep(ctx.createGain());
    this.waterG.gain.value = 0;
    let waterOut: AudioNode = this.master;
    if (typeof ctx.createStereoPanner === "function") {
      this.waterPan = this.keep(ctx.createStereoPanner());
      this.waterPan.connect(this.master);
      waterOut = this.waterPan;
    }
    this.waterG.connect(waterOut);
    const hp = this.biquad("highpass", 160, 0.7, this.waterG);
    this.waterLp = this.biquad("lowpass", 1300, 0.6, hp);
    this.loop(nb.white, this.waterLp, 1.3 * bright);
    this.loop(nb.brown, this.waterLp, 0.2); // low rumble body

    // rain (garúa: fine drizzle hiss)
    this.rainG = this.keep(ctx.createGain());
    this.rainG.gain.value = 0;
    this.rainG.connect(this.master);
    const rl = this.biquad("lowpass", phone ? 5200 : 8500, 0.5, this.rainG);
    const rh = this.biquad("highpass", 2600, 0.6, rl);
    this.loop(nb.white, rh, 0.6 * bright);
  }

  private keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  private biquad(type: BiquadFilterType, f: number, q: number, dest: AudioNode) {
    const b = this.keep(this.ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }

  private loop(buf: AudioBuffer, dest: AudioNode, level: number) {
    const g = this.keep(this.ctx.createGain());
    g.gain.value = level;
    g.connect(dest);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(g);
    s.start(this.ctx.currentTime, Math.random() * 2);
    this.loops.push(s);
  }

  private ramp(p: AudioParam, v: number, tc = TC) {
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(v, now, tc);
  }

  /** Moves every continuous layer toward its target (call at a few Hz, not every frame). */
  apply(mix: MixOut, o: { gust: number; windFreq: number; waterBright: number; waterPan: number }) {
    if (this.disposed) return;
    this.ramp(this.master.gain, AMBIENT_LEVEL * this.bedLevel * mix.master, mix.master === 0 ? 0.3 : 0.6);
    this.ramp(this.windG.gain, mix.wind * o.gust);
    this.ramp(this.windBp.frequency, o.windFreq, 0.4);
    this.ramp(this.waterG.gain, mix.water * 0.55);
    this.ramp(this.waterLp.frequency, 900 + 1800 * o.waterBright, 0.3);
    if (this.waterPan) this.ramp(this.waterPan.pan, o.waterPan, 0.3);
    this.ramp(this.rainG.gain, mix.rain * 0.35, 0.8);
  }

  /** A one-shot sub graph (gain -> optional panner -> master) that frees itself when its sources end. */
  private shot(pan: number) {
    const ctx = this.ctx;
    const top = ctx.createGain();
    let p: StereoPannerNode | null = null;
    if (pan && typeof ctx.createStereoPanner === "function") {
      p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      top.connect(p);
      p.connect(this.master);
    } else top.connect(this.master);
    let live = 0;
    return {
      top,
      add(s: Src) {
        live++;
        s.onended = () => {
          if (--live > 0) return;
          top.disconnect();
          p?.disconnect();
        };
      },
    };
  }

  /** Scheduled sine sweeps (birds, crickets). */
  chirps(list: Chirp[], t: number, pan: number, level: number) {
    if (this.disposed || !list.length) return;
    const ctx = this.ctx;
    const sh = this.shot(pan);
    for (const c of list) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(sh.top);
      const o = ctx.createOscillator();
      o.type = "sine";
      const t0 = t + c.at;
      o.frequency.setValueAtTime(c.f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, c.f1), t0 + c.dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(level * c.vel, t0 + Math.min(0.01, c.dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + c.dur);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + c.dur + 0.02);
      sh.add(o);
    }
  }

  /** Andean owl: two soft hoots, the second lower. */
  owl(t: number, pan: number, level: number) {
    if (this.disposed) return;
    const ctx = this.ctx;
    const sh = this.shot(pan);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.connect(sh.top);
    for (const [at, f, len] of [
      [0, 390, 0.32],
      [0.5, 360, 0.45],
    ] as const) {
      const t0 = t + at;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(lp);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 1.04, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, t0 + len);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(level, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + len + 0.02);
      sh.add(o);
    }
  }

  /** One footfall on `surface`, `level` 0..1.5, `r` 0..1 variation. */
  step(surface: Surface, t: number, level: number, r: number) {
    if (this.disposed || level <= 0) return;
    const ctx = this.ctx;
    const sh = this.shot((r - 0.5) * 0.12);
    const nb = noiseBuffers(ctx);
    const v = 0.9 + r * 0.2;
    const noise = (type: BiquadFilterType, f: number, q: number, peak: number, len: number) => {
      const bf = ctx.createBiquadFilter();
      bf.type = type;
      bf.frequency.value = f * v;
      bf.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * level, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      bf.connect(g);
      g.connect(sh.top);
      const s = ctx.createBufferSource();
      s.buffer = nb.white;
      s.connect(bf);
      s.start(t, r * 2.5);
      s.stop(t + len + 0.02);
      sh.add(s);
    };
    const thud = (f: number, peak: number, len: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * level, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      g.connect(sh.top);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * v, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + len);
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.02);
      sh.add(o);
    };
    switch (surface) {
      case "grass":
        noise("bandpass", 2200, 0.5, 0.16, 0.11);
        thud(85, 0.12, 0.06);
        break;
      case "wood":
        noise("bandpass", 650, 1.8, 0.22, 0.06);
        thud(150, 0.35, 0.09);
        break;
      case "water":
        noise("lowpass", 1700, 0.8, 0.3, 0.18);
        thud(260, 0.06, 0.05);
        break;
      default:
        noise("bandpass", 2600, 1.4, 0.2, 0.045);
        thud(105, 0.3, 0.06);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.loops) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
    this.loops = [];
    this.nodes = [];
  }
}
