/**
 * Jungle soundscape (ambient, no prompt), procedural Web Audio on the shared music output's ambient bus:
 *   cicadas  by day: a shimmering high band of noise, pulsing, loudest in the midday heat
 *   chorus   at night: a trilling band (crickets, katydids) plus tree-frog "tink" and "brrup" calls from
 *            random directions
 *   river    the brown water's murmur, louder near the bank (layout.riverDist), panned toward the river
 *   calls    positional animal calls read from the shared `creatures` registry (no body of a kind → no sound):
 *            macaws (raucous "raa" squawks, a pair answering), toucans (croaking "rrek"), the coto's roar at
 *            dawn and dusk, the capybaras' alarm bark when the family plunges in
 *   stamps   `world:stamp` → the passport chime of the shared sfx bus (the jungle page has no other sfx hook)
 * Silent until the music player's output() is live (unlocked, not muted, tab visible); hushed inside a building
 * or while a game is open. Light: three looping noise beds, a few one-shot oscillators per second at most.
 * Mixing rules are pure (./soundscape/mix.ts).
 */

import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import { noiseBuffers, sfx, sfxForStamp } from "../../../audio/sfx";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures, isParked } from "../../creatures";
import { on } from "../../events";
import { bedMix, callGain, callGap, howlerHour, panFor } from "./soundscape/mix";
import { devHook, idle, selvaOf } from "./wild/kit";
import { rng } from "./wild/logic";

/** Overall level under the music. */
const LEVEL = 0.45;
const TC = 0.4;

interface Graph {
  out: AudioOutput;
  ctx: BaseAudioContext;
  master: GainNode;
  cicadaG: GainNode;
  chorusG: GainNode;
  riverG: GainNode;
  riverPan: StereoPannerNode | null;
  nodes: AudioNode[];
  srcs: AudioScheduledSourceNode[];
}

/** Calls: creatures kind, range (u), base gap (s). */
const CALLS = [
  { kind: "guacamayo", far: 55, base: 2.2 },
  { kind: "tucan", far: 28, base: 5 },
  { kind: "coto", far: 90, base: 9 },
] as const;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const music = getMusic();
  const R = rng((Date.now() ^ 0x5e1fa) >>> 0);
  let g: Graph | null = null;
  let inside = false;
  let game = false;
  const timers: Record<string, number> = { guacamayo: 2, tucan: 4, coto: 6, frog: 1, ronsoco: 0 };
  let applyClock = 1;
  let ronsocoWet = 0;

  const offs = [
    on("world:interior", (d) => {
      inside = !!d?.inside;
    }),
    on("world:game", (d) => {
      game = !!d?.open;
    }),
    on("world:stamp", (d) => {
      const name = d ? sfxForStamp(d) : null;
      if (name) sfx.play(name);
    }),
  ];

  const build = (out: AudioOutput): Graph => {
    const ctx = out.ctx;
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const keep = <T extends AudioNode>(n: T) => {
      nodes.push(n);
      return n;
    };
    const gain = (v: number, dest: AudioNode) => {
      const n = keep(ctx.createGain());
      n.gain.value = v;
      n.connect(dest);
      return n;
    };
    const filter = (type: BiquadFilterType, f: number, q: number, dest: AudioNode) => {
      const b = keep(ctx.createBiquadFilter());
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.connect(dest);
      return b;
    };
    const loop = (buf: AudioBuffer, dest: AudioNode, level: number) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(gain(level, dest));
      s.start(ctx.currentTime, R() * 2);
      srcs.push(s);
    };
    /** Amplitude pulse: an LFO driving a gain around `depth` (0..1). */
    const pulse = (hz: number, depth: number, dest: AudioNode) => {
      const am = gain(1 - depth, dest);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const lg = keep(ctx.createGain());
      lg.gain.value = depth;
      lfo.connect(lg);
      lg.connect(am.gain);
      lfo.start();
      srcs.push(lfo);
      return am;
    };
    const nb = noiseBuffers(ctx);
    const master = gain(0, out.ambient);
    // Cicadas: two detuned narrow bands of white noise, pulsing at different rates.
    const cicadaG = gain(0, master);
    loop(nb.white, filter("bandpass", 4300, 9, pulse(13, 0.7, cicadaG)), 0.9);
    loop(nb.white, filter("bandpass", 5600, 12, pulse(7.5, 0.6, cicadaG)), 0.6);
    // Night chorus: a fast trill band.
    const chorusG = gain(0, master);
    loop(nb.white, filter("bandpass", 3300, 14, pulse(28, 0.85, chorusG)), 1.1);
    loop(nb.white, filter("bandpass", 2200, 10, pulse(4.2, 0.5, chorusG)), 0.35);
    // River: a low murmur with a little hiss, panned.
    const riverG = gain(0, master);
    let riverPan: StereoPannerNode | null = null;
    let riverOut: AudioNode = riverG;
    if (typeof ctx.createStereoPanner === "function") {
      riverPan = keep(ctx.createStereoPanner());
      riverPan.connect(riverG);
      riverOut = riverPan;
    }
    const lp = filter("lowpass", 650, 0.6, riverOut);
    loop(nb.brown, lp, 1.4);
    loop(nb.white, filter("bandpass", 1100, 0.8, riverOut), 0.12);
    return { out, ctx, master, cicadaG, chorusG, riverG, riverPan, nodes, srcs };
  };

  const teardown = () => {
    if (!g) return;
    for (const s of g.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const n of g.nodes) n.disconnect();
    g = null;
  };

  const ramp = (p: AudioParam, v: number, tc = TC) => {
    if (!g) return;
    const now = g.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(v, now, tc);
  };

  /** A one-shot through a panner into the master; frees itself when the source ends. */
  const shot = (pan: number, level: number) => {
    if (!g) return null;
    const ctx = g.ctx;
    const top = ctx.createGain();
    top.gain.value = level;
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      top.connect(p);
      p.connect(g.master);
      const free = () => {
        top.disconnect();
        p.disconnect();
      };
      return { ctx, top, free };
    }
    top.connect(g.master);
    return { ctx, top, free: () => top.disconnect() };
  };

  /** A macaw "raaa": a harsh sawtooth sliding down through a resonant band, with a rough flutter. */
  const macaw = (pan: number, level: number) => {
    const s = shot(pan, level * 0.22);
    if (!s) return;
    const { ctx, top } = s;
    const t = ctx.currentTime + 0.02;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const t0 = t + k * (0.32 + R() * 0.12);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const f0 = 900 + R() * 300;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t0 + 0.28);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600 + R() * 500;
      bp.Q.value = 2.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.03);
      env.gain.setTargetAtTime(0, t0 + 0.18, 0.05);
      const rough = ctx.createOscillator();
      rough.frequency.value = 55 + R() * 20;
      const rg = ctx.createGain();
      rg.gain.value = 0.5;
      rough.connect(rg);
      rg.connect(env.gain);
      o.connect(bp);
      bp.connect(env);
      env.connect(top);
      o.start(t0);
      rough.start(t0);
      o.stop(t0 + 0.45);
      rough.stop(t0 + 0.45);
      if (k === n - 1) o.onended = s.free;
    }
  };

  /** A toucan's croak: a low square "rrek-rrek" chopped by a fast pulse. */
  const toucan = (pan: number, level: number) => {
    const s = shot(pan, level * 0.16);
    if (!s) return;
    const { ctx, top } = s;
    const t = ctx.currentTime + 0.02;
    for (let k = 0; k < 2; k++) {
      const t0 = t + k * 0.22;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(330, t0);
      o.frequency.linearRampToValueAtTime(260, t0 + 0.14);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(0.8, t0 + 0.02);
      env.gain.setTargetAtTime(0, t0 + 0.1, 0.03);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      o.connect(lp);
      lp.connect(env);
      env.connect(top);
      o.start(t0);
      o.stop(t0 + 0.2);
      if (k === 1) o.onended = s.free;
    }
  };

  /** The howler's roar: a long swell of low, breathy noise rising and falling. */
  const roar = (pan: number, level: number) => {
    if (!g) return;
    const s = shot(pan, level * 0.5);
    if (!s) return;
    const { ctx, top } = s;
    const t0 = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffers(ctx).brown;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(220, t0);
    bp.frequency.linearRampToValueAtTime(420, t0 + 1.2);
    bp.frequency.linearRampToValueAtTime(260, t0 + 2.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + 0.8);
    env.gain.linearRampToValueAtTime(0.7, t0 + 1.8);
    env.gain.linearRampToValueAtTime(0, t0 + 2.8);
    src.connect(bp);
    bp.connect(env);
    env.connect(top);
    src.start(t0, R() * 2);
    src.stop(t0 + 3);
    src.onended = s.free;
  };

  /** A tree frog: a short bright "tink" or a lower "brrup". */
  const frog = (pan: number, level: number) => {
    const s = shot(pan, level * 0.1);
    if (!s) return;
    const { ctx, top } = s;
    const t0 = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    o.type = "sine";
    const tink = R() < 0.55;
    const f = tink ? 2400 + R() * 900 : 700 + R() * 300;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * (tink ? 0.85 : 1.3), t0 + (tink ? 0.05 : 0.16));
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + 0.008);
    env.gain.setTargetAtTime(0, t0 + (tink ? 0.02 : 0.1), tink ? 0.02 : 0.04);
    o.connect(env);
    env.connect(top);
    o.start(t0);
    o.stop(t0 + 0.35);
    o.onended = s.free;
  };

  /** Capybara alarm: a short gruff bark. */
  const bark = (pan: number, level: number) => {
    const s = shot(pan, level * 0.3);
    if (!s) return;
    const { ctx, top } = s;
    const t0 = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffers(ctx).brown;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + 0.01);
    env.gain.setTargetAtTime(0, t0 + 0.05, 0.04);
    src.connect(bp);
    bp.connect(env);
    env.connect(top);
    src.start(t0, R());
    src.stop(t0 + 0.3);
    src.onended = s.free;
  };

  const voices: Record<string, (pan: number, level: number) => void> = { guacamayo: macaw, tucan: toucan, coto: roar };
  const offDev = devHook("soundscape", () => ({
    live: !!g,
    state: g?.ctx.state ?? null,
    master: g?.master.gain.value ?? 0,
    cicadas: g?.cicadaG.gain.value ?? 0,
    chorus: g?.chorusG.gain.value ?? 0,
    river: g?.riverG.gain.value ?? 0,
  }));
  const right = { x: 1, z: 0 };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.1);
      let out: AudioOutput | null = null;
      try {
        out = music.output?.() ?? null;
      } catch {
        out = null;
      }
      if (out?.ctx.state !== "running") return;
      if (!g || g.out !== out) {
        teardown();
        try {
          g = build(out);
        } catch (err) {
          console.warn("[selva] soundscape", err);
          return;
        }
      }
      const time = env.sky.time();
      const hushed = inside || game;
      // Listener: the camera's right-hand direction, flattened.
      const e = env.camera.matrixWorld.elements;
      const rl = Math.hypot(e[0] as number, e[2] as number) || 1;
      right.x = (e[0] as number) / rl;
      right.z = (e[2] as number) / rl;

      applyClock += dt;
      if (applyClock > 0.25) {
        applyClock = 0;
        const rd = L.riverDist(avatar.x, avatar.z);
        const mix = bedMix(time, rd, hushed);
        ramp(g.master.gain, LEVEL * mix.master, mix.master ? 0.8 : 0.3);
        ramp(g.cicadaG.gain, mix.cicadas * 0.32);
        ramp(g.chorusG.gain, mix.chorus * 0.4);
        ramp(g.riverG.gain, mix.river * 0.5);
        if (g.riverPan) {
          // Toward the river: the road frame's river side, relative to the listener.
          const t = L.trail.nearestT(avatar.x, avatar.z);
          const tg = L.trail.tangentAt(t);
          ramp(g.riverPan.pan, panFor(tg.z, -tg.x, right.x, right.z) * 0.6, 0.5);
        }
      }
      if (hushed) return;

      // Animal calls, from the nearest registered body of each kind.
      for (const c of CALLS) {
        timers[c.kind] = (timers[c.kind] as number) - dt;
        if ((timers[c.kind] as number) > 0) continue;
        const b = creatures.nearestOf(c.kind, avatar.x, avatar.z);
        if (!b || isParked(b)) {
          timers[c.kind] = 2;
          continue;
        }
        const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
        if (c.kind === "coto" && !howlerHour(time)) {
          timers[c.kind] = 4;
          continue;
        }
        if (c.kind !== "coto" && bedMix(time, 99, false).chorus > 0.5) {
          timers[c.kind] = 6; // birds are quiet at night
          continue;
        }
        const gap = callGap(d, c.far, c.base, R());
        timers[c.kind] = Number.isFinite(gap) ? gap : 3;
        if (Number.isFinite(gap))
          voices[c.kind]?.(panFor(b.x - avatar.x, b.z - avatar.z, right.x, right.z), callGain(d, c.far));
      }
      // Capybara alarm: when the nearest family member goes from land into the water (not solid) close by.
      const cap = creatures.nearestOf("ronsoco", avatar.x, avatar.z);
      if (cap) {
        const d = Math.hypot(cap.x - avatar.x, cap.z - avatar.z);
        const wet = cap.solid ? 0 : 1;
        if (wet && !ronsocoWet && d < 30)
          bark(panFor(cap.x - avatar.x, cap.z - avatar.z, right.x, right.z), callGain(d, 30));
        ronsocoWet = wet;
      }
      // Tree frogs at night, from random directions.
      timers.frog = (timers.frog as number) - dt;
      if ((timers.frog as number) <= 0) {
        const night = bedMix(time, 99, false).chorus;
        timers.frog = night > 0.3 ? 0.25 + R() * 1.1 : 3;
        if (night > 0.3) frog(R() * 1.6 - 0.8, night * (0.4 + R() * 0.6));
      }
    },
    dispose() {
      for (const off of offs) off();
      offDev();
      teardown();
    },
  };
};
