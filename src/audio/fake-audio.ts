/**
 * Minimal Web Audio stand-in for unit tests (bun has no AudioContext). Records created nodes, connections and
 * started sources so tests can check that effects build, schedule and clean up. Not used at runtime.
 */

class FakeParam {
  value: number;
  events: Array<[string, number, number]> = [];
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number) {
    this.events.push(["set", v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(["lin", v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError("exponential ramp to <= 0");
    this.events.push(["exp", v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, _tc: number) {
    this.events.push(["target", v, t]);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.events.push(["cancel", 0, t]);
    return this;
  }
}

export class FakeNode {
  outputs: unknown[] = [];
  disconnected = false;
  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {
    ctx.nodes.push(this);
  }
  connect(d: unknown) {
    this.outputs.push(d);
    this.disconnected = false;
    return d;
  }
  disconnect() {
    this.outputs = [];
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
}
class FakePanner extends FakeNode {
  pan = new FakeParam(0);
}
class FakeSource extends FakeNode {
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t = 0) {
    this.started = t;
  }
  stop(t = 0) {
    this.stopped = t;
  }
}
class FakeOsc extends FakeSource {
  type = "sine";
  setPeriodicWave(_w: unknown) {
    this.type = "custom";
  }
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam(1);
}

export class FakeAudioContext {
  nodes: FakeNode[] = [];
  currentTime = 1;
  sampleRate = 8000;
  state: "running" | "suspended" | "closed" = "running";
  destination = new FakeNode("destination", this);
  createGain() {
    return new FakeGain("gain", this);
  }
  createBiquadFilter() {
    return new FakeFilter("filter", this);
  }
  createStereoPanner() {
    return new FakePanner("panner", this);
  }
  createOscillator() {
    return new FakeOsc("osc", this);
  }
  createBufferSource() {
    return new FakeBufferSource("buffer", this);
  }
  createDynamicsCompressor() {
    const n = new FakeNode("compressor", this) as FakeNode & Record<string, FakeParam>;
    for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = new FakeParam(0);
    return n;
  }
  createWaveShaper() {
    return Object.assign(new FakeNode("shaper", this), { curve: null as Float32Array | null });
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    return { real, imag };
  }
  createBuffer(_ch: number, n: number, _sr: number) {
    const data = new Float32Array(n);
    return { length: n, getChannelData: () => data };
  }
  /** Sources that were started. */
  sources() {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource && n.started !== null);
  }
  /** Fires `onended` on every started source (as if time ran out). */
  endAll() {
    for (const s of this.sources()) s.onended?.();
  }
}

/** Cast helper: the fake satisfies what the effects use of BaseAudioContext. */
export const asCtx = (f: FakeAudioContext) => f as unknown as BaseAudioContext;
