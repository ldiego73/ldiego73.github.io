/**
 * Coast soundscape (ambient, no prompt), procedural Web Audio on the shared music output's ambient bus:
 *   surf     the sea's roar and the hiss of foam, loud by the water and swelling with each set of waves
 *            (./soundscape/mix.ts, on the sea's own swash rhythm), panned toward the shore
 *   wind     a soft band of noise, stronger up on the cliffs and the headland
 *   calls    gull cries and sea lion barks from the nearest bird or animal of the shared `creatures` registry
 *            (registered by ./aves.ts and ./orilla.ts; no body of a kind, no sound)
 *   stamps   `world:stamp` → the passport chime of the shared sfx bus
 * Silent until the music player's output() is live (unlocked, not muted, tab visible); hushed while a game is
 * open. Light: three looping noise beds and a few one-shot oscillators per minute.
 */
import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import { noiseBuffers, sfx, sfxForStamp } from "../../../audio/sfx";
import { PHONE_BEDS, smallSpeaker } from "../../../audio/speaker";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures, isParked } from "../../creatures";
import { on } from "../../events";
import type { SuyuEnv } from "../../suyu/contract";
import type { CostaLayout } from "../layout";
import { prng } from "./fauna/logic";
import { callGain, callGap, panFor, surf, wind } from "./soundscape/mix";

const LEVEL = 0.5;
const phone = smallSpeaker();
const bedLevel = phone ? PHONE_BEDS.level : 1;
const TC = 0.5;

interface Graph {
  out: AudioOutput;
  ctx: BaseAudioContext;
  master: GainNode;
  surfG: GainNode;
  windG: GainNode;
  surfPan: StereoPannerNode | null;
  nodes: AudioNode[];
  srcs: AudioScheduledSourceNode[];
}

const CALLS = [
  { kind: "gaviota", far: 45, base: 4 },
  { kind: "lobo-marino", far: 70, base: 5 },
] as const;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const music = getMusic();
  const R = prng((Date.now() ^ 0xc0a57) >>> 0);
  let g: Graph | null = null;
  let game = false;
  const timers: Record<string, number> = { gaviota: 2, "lobo-marino": 4 };
  let applyClock = 1;
  let clock = 0;
  const offs = [
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
    const nb = noiseBuffers(ctx);
    const bright = phone ? PHONE_BEDS.bright : 1;
    const master = gain(0, out.ambient);
    // Surf: the deep roar and the hiss of foam, panned toward the sea.
    const surfG = gain(0, master);
    let surfPan: StereoPannerNode | null = null;
    let surfOut: AudioNode = surfG;
    if (typeof ctx.createStereoPanner === "function") {
      surfPan = keep(ctx.createStereoPanner());
      surfPan.connect(surfG);
      surfOut = surfPan;
    }
    loop(nb.brown, filter("lowpass", 480, 0.5, surfOut), 1.6);
    loop(nb.white, filter("bandpass", 1600, 0.6, surfOut), 0.16 * bright);
    // Wind.
    const windG = gain(0, master);
    loop(nb.white, filter("bandpass", 520, 0.9, windG), 0.35 * bright);
    return { out, ctx, master, surfG, windG, surfPan, nodes, srcs };
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
      return {
        ctx,
        top,
        free: () => {
          top.disconnect();
          p.disconnect();
        },
      };
    }
    top.connect(g.master);
    return { ctx, top, free: () => top.disconnect() };
  };
  /** A gull's "kyow": a sliding whistle, two or three times. */
  const gull = (pan: number, level: number) => {
    const s = shot(pan, level * 0.12);
    if (!s) return;
    const { ctx, top } = s;
    const n = 2 + Math.floor(R() * 2);
    let t0 = ctx.currentTime + 0.02;
    let last: OscillatorNode | null = null;
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      const f0 = 1500 + R() * 300;
      o.frequency.setValueAtTime(f0 * 0.75, t0);
      o.frequency.linearRampToValueAtTime(f0, t0 + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.28);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(1, t0 + 0.03);
      e.gain.setTargetAtTime(0, t0 + 0.16, 0.05);
      o.connect(e);
      e.connect(top);
      o.start(t0);
      o.stop(t0 + 0.4);
      last = o;
      t0 += 0.3 + R() * 0.12;
    }
    if (last) last.onended = s.free;
  };
  /** A sea lion's bark: a gruff buzz through a resonant band, two or three barks. */
  const bark = (pan: number, level: number) => {
    const s = shot(pan, level * 0.2);
    if (!s) return;
    const { ctx, top } = s;
    const n = 2 + Math.floor(R() * 2);
    let t0 = ctx.currentTime + 0.02;
    let last: OscillatorNode | null = null;
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(160 + R() * 40, t0);
      o.frequency.linearRampToValueAtTime(120, t0 + 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700;
      bp.Q.value = 3;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(1, t0 + 0.02);
      e.gain.setTargetAtTime(0, t0 + 0.12, 0.05);
      o.connect(bp);
      bp.connect(e);
      e.connect(top);
      o.start(t0);
      o.stop(t0 + 0.35);
      last = o;
      t0 += 0.32 + R() * 0.15;
    }
    if (last) last.onended = s.free;
  };
  const voices: Record<string, (pan: number, level: number) => void> = { gaviota: gull, "lobo-marino": bark };
  const right = { x: 1, z: 0 };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.1);
      clock += dt;
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
          console.warn("[costa] soundscape", err);
          return;
        }
      }
      const e = env.camera.matrixWorld.elements;
      const rl = Math.hypot(e[0] as number, e[2] as number) || 1;
      right.x = (e[0] as number) / rl;
      right.z = (e[2] as number) / rl;
      applyClock += dt;
      if (applyClock > 0.25) {
        applyClock = 0;
        ramp(g.master.gain, game ? 0 : LEVEL * bedLevel, game ? 0.3 : 0.8);
        ramp(g.surfG.gain, surf(L.shoreDist(avatar.x, avatar.z), clock) * 0.55);
        ramp(g.windG.gain, wind(avatar.y, env.sky.isNight()) * 0.3);
        // The sea is to the west (its normal from the shore points −x).
        if (g.surfPan) ramp(g.surfPan.pan, panFor(-1, 0, right.x, right.z) * 0.6, 0.6);
      }
      if (game) return;
      for (const c of CALLS) {
        timers[c.kind] = (timers[c.kind] as number) - dt;
        if ((timers[c.kind] as number) > 0) continue;
        const b = creatures.nearestOf(c.kind, avatar.x, avatar.z);
        if (!b || isParked(b)) {
          timers[c.kind] = 3;
          continue;
        }
        const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
        if (c.kind === "gaviota" && env.sky.isNight()) {
          timers[c.kind] = 6;
          continue;
        }
        const gap = callGap(d, c.far, c.base, R());
        timers[c.kind] = Number.isFinite(gap) ? gap : 3;
        if (Number.isFinite(gap))
          voices[c.kind]?.(panFor(b.x - avatar.x, b.z - avatar.z, right.x, right.z), callGain(d, c.far));
      }
    },
    dispose() {
      for (const off of offs) off();
      teardown();
    },
  };
};
