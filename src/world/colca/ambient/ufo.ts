/**
 * Secret: a tourist UFO over the Nazca pampa. A playful wink, and deliberately not the "aliens drew the lines"
 * myth (that takes the credit from the Nazca people, who drew them): this is a sightseer that came to admire
 * the lines the Nazca drew, and it keeps a souvenir alpaca of its own.
 *
 * A lone alpaca grazes the pampa north of the lookout tower, off the road and off every figure
 * (./ufo/logic.ts SPOT). At night only (./ufo/logic.ts passAt, on a "seconds of this night" clock): first pass
 * 20–40 s after dark falls, then one every 60–90 s while it stays dark. Each pass (~28 s): the saucer glides in
 * from high and far, hovers 16 u up with its beam on, the alpaca rises in the beam spinning slowly with its
 * legs paddling and is sucked in, the saucer wobbles, then lowers the alpaca back, which staggers dizzy under a
 * ring of little stars while the saucer zips off into the sky. A pass that has begun finishes even if dawn
 * comes (nothing pops away); the clock resets at dawn, so every night starts over.
 *
 * Reduced motion: during a pass the saucer just hangs over the alpaca with the beam on (no flight, abduction,
 * spin or wobble), then goes.
 *
 * Passport: a good look (traveler within LOOK_R of the spot and the saucer on screen for LOOK_HOLD seconds,
 * as the mountain's golden condor) stamps `colca:egg:ufo`.
 *
 * Sound: a theremin-like hum (a sine with vibrato and a soft octave below, gliding between ./ufo/logic.ts
 * humPitch targets) on the music output's ambient bus, louder near the saucer; silent until the output is
 * live (unlocked, not muted), hushed while a game is open, built only during a pass.
 *
 * Draw calls: hull 1 + dome 1 + two light sets + belly glow, beam 1, ground spot 1, rings 3 (only with the
 * beam), alpaca 3 (instanced rig, ./wild/camelids.ts), stars 3 (only while dizzy).
 */
import * as THREE from "three";
import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { ALPACA, camelidRig } from "../../fauna-models";
import type { SuyuEnv } from "../../suyu/contract";
import {
  alpacaLift,
  beamLevel,
  HOVER_H,
  hash01,
  humPitch,
  LOOK_HOLD,
  LOOK_R,
  lookable,
  type PhaseId,
  passAt,
  SPOT,
  saucerOffset,
} from "./ufo/logic";
import { BELLY_Y, buildSaucer } from "./ufo/model";
import { CamelidHerd } from "./wild/camelids";

const LABEL: L = { es: "OVNI en la pampa", en: "UFO over the pampa" };
const STAMP = "colca:egg:ufo";
const TAU = Math.PI * 2;
/** Hum loudness at the saucer, and the distance at which it fades out. */
const HUM_LEVEL = 0.16;
const HUM_FAR = 170;
/** The alpaca's height (feet to ear tips, ~1.5 u): it stops this far under the belly before it is sucked in. */
const ALPACA_H = 1.6;

/** Rim bulbs: the two sets blink in turn (yellow and pink, lit or dimmed). */
const LIT = { a: new THREE.Color("#ffd65a"), b: new THREE.Color("#ff6fb5") };
const DIM = { a: new THREE.Color("#5c4a18"), b: new THREE.Color("#5a2440") };

interface Hum {
  out: AudioOutput;
  ctx: BaseAudioContext;
  master: GainNode;
  osc: OscillatorNode;
  sub: OscillatorNode;
  lfo: OscillatorNode;
  depth: GainNode;
  pan: StereoPannerNode | null;
  nodes: AudioNode[];
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const rm = env.reducedMotion;
  const groundAt = (x: number, z: number) => env.heightAt(x, z);
  const gy = groundAt(SPOT.x, SPOT.z);
  const hoverY = gy + HOVER_H;

  // ---------------------------------------------------------------- the souvenir alpaca
  const herd = new CamelidHerd("colca-ufo:alpaca", ALPACA, 1, ["#ffffff"], null, {
    body: "#efe3cf",
    belly: "#fbf6ec",
  });
  const alpaca = new THREE.Group();
  alpaca.name = "colca-ufo:alpaca-root";
  alpaca.add(herd.group);
  alpaca.position.set(SPOT.x, gy, SPOT.z);
  // Grazing broadside to the road and the tower (they lie south-east of the spot), so its silhouette reads.
  const baseYaw = 0.35;
  alpaca.rotation.order = "YXZ";
  alpaca.rotation.y = baseYaw;
  const rig = camelidRig(ALPACA);
  /** Head in the alpaca's own frame (neck pivot + head on the neck), where the dizzy stars circle. */
  const headLocal = new THREE.Vector3().copy(rig.neck).add(rig.headOnNeck);
  const pose = { x: 0, y: 0, z: 0, yaw: 0, phase: 0, walk: 0, graze: 0, lying: false };
  const body = creatures.add("alpaca", 0.5, { x: SPOT.x, z: SPOT.z });
  const keep = creatures.keepOut(SPOT.x, SPOT.z, 4);

  // ---------------------------------------------------------------- saucer and effects
  const M = buildSaucer(env);
  const group = new THREE.Group();
  group.name = "colca-ufo";
  M.saucer.visible = false;
  M.beam.visible = false;
  M.spot.visible = false;
  M.spot.position.set(SPOT.x, gy + 0.12, SPOT.z);
  for (const r of M.rings) r.visible = false;
  for (const s of M.stars) s.visible = false;
  group.add(M.saucer, M.beam, M.spot, ...M.rings, alpaca);
  for (const s of M.stars) alpaca.add(s);
  env.scene.add(group);

  // ---------------------------------------------------------------- audio (built only during a pass)
  const music = getMusic();
  let hum: Hum | null = null;
  let game = false;
  const offGame = on("world:game", (d) => {
    game = !!d?.open;
  });
  const buildHum = (out: AudioOutput): Hum => {
    const ctx = out.ctx;
    const nodes: AudioNode[] = [];
    const master = ctx.createGain();
    master.gain.value = 0;
    nodes.push(master);
    let dest: AudioNode = out.ambient;
    let pan: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === "function") {
      pan = ctx.createStereoPanner();
      pan.connect(out.ambient);
      nodes.push(pan);
      dest = pan;
    }
    master.connect(dest);
    // A soft lowpass keeps the sine's glide sweet, never shrill on the zip.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    lp.connect(master);
    nodes.push(lp);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 520;
    osc.connect(lp);
    // The octave below, quiet, gives the hum a body.
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = 260;
    const subG = ctx.createGain();
    subG.gain.value = 0.25;
    sub.connect(subG);
    subG.connect(lp);
    nodes.push(subG);
    // Theremin vibrato: ~5.5 Hz, ±14 Hz (the depth follows the phase).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 14;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    nodes.push(depth);
    const t0 = ctx.currentTime;
    for (const o of [osc, sub, lfo]) o.start(t0);
    return { out, ctx, master, osc, sub, lfo, depth, pan, nodes };
  };
  const stopHum = () => {
    if (!hum) return;
    for (const o of [hum.osc, hum.sub, hum.lfo]) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    for (const n of hum.nodes) n.disconnect();
    hum = null;
  };
  const glide = (p: AudioParam, v: number, tc: number) => {
    if (!hum) return;
    const now = hum.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(v, now, tc);
  };
  let audioClock = 0;
  const right = new THREE.Vector3();
  const updateHum = (dt: number, phase: PhaseId | null, u: number, avatar: THREE.Vector3) => {
    if (!phase || !M.saucer.visible) {
      if (hum) {
        glide(hum.master.gain, 0, 0.3);
        // Let the fade finish before tearing the graph down.
        audioClock -= dt;
        if (audioClock < -1.5) stopHum();
      }
      return;
    }
    let out: AudioOutput | null = null;
    try {
      out = music.output?.() ?? null;
    } catch {
      out = null;
    }
    if (out?.ctx.state !== "running") {
      stopHum();
      return;
    }
    if (!hum || hum.out !== out) {
      stopHum();
      try {
        hum = buildHum(out);
      } catch (err) {
        console.warn("[colca] ufo hum", err);
        return;
      }
    }
    audioClock += dt;
    if (audioClock < 0.1) return;
    audioClock = 0;
    const p = M.saucer.position;
    const d = Math.hypot(p.x - avatar.x, p.y - avatar.y, p.z - avatar.z);
    const k = Math.max(0, 1 - d / HUM_FAR) ** 2;
    glide(hum.master.gain, game ? 0 : HUM_LEVEL * k, 0.25);
    const f = rm ? 520 : humPitch(phase, u);
    glide(hum.osc.frequency, f, phase === "leave" ? 0.08 : 0.25);
    glide(hum.sub.frequency, f / 2, 0.3);
    glide(hum.depth.gain, phase === "inside" || phase === "dizzy" ? 26 : 14, 0.3);
    if (hum.pan) {
      const e = env.camera.matrixWorld.elements;
      right.set(e[0] as number, 0, e[2] as number).normalize();
      const dx = p.x - avatar.x;
      const dz = p.z - avatar.z;
      const dl = Math.hypot(dx, dz) || 1;
      glide(hum.pan.pan, ((dx * right.x + dz * right.z) / dl) * 0.6, 0.3);
    }
  };

  // ---------------------------------------------------------------- clock
  let night = 0;
  let seed = (Date.now() & 0xffff) ^ 0x0f0;
  let inPass = false;
  let spin = 0;
  let legPhase = 0;
  let seenFor = 0;
  let stamped = false;
  const ndc = new THREE.Vector3();

  const placeAlpaca = (up: number, scale: number, t: number, phase: PhaseId | null, u: number, dt: number) => {
    const lifted = up > 0.01;
    const top = HOVER_H + BELLY_Y - ALPACA_H;
    alpaca.position.y = gy + up * top;
    alpaca.scale.setScalar(Math.max(scale, 1e-3));
    alpaca.visible = scale > 0.001;
    if (lifted) {
      // Spinning slowly, tumbling a little, legs paddling in the air.
      spin += dt * 1.8;
      legPhase += dt * 9;
      alpaca.rotation.set(Math.sin(t * 1.7) * 0.18 * up, baseYaw + spin, Math.sin(t * 2.3) * 0.28 * up);
      pose.walk = 1;
      pose.phase = legPhase;
      pose.graze = 0;
    } else if (phase === "dizzy") {
      // Staggering in place: a lurching sway that settles, the head bobbing.
      const k = Math.sqrt(1 - u);
      alpaca.rotation.set(
        Math.cos(t * 5.2) * 0.09 * k,
        baseYaw + spin + Math.sin(t * 3.1) * 0.5 * k,
        Math.sin(t * 6.5) * 0.16 * k,
      );
      pose.walk = 0;
      pose.graze = 0.15 + Math.sin(t * 4) * 0.25 * k;
    } else {
      // Grazing: the head goes down and up now and then.
      spin = spin % TAU;
      alpaca.rotation.set(0, baseYaw + spin, 0);
      pose.walk = 0;
      pose.graze = rm ? 0.6 : Math.max(0, Math.min(1, 0.5 + Math.sin(t * 0.35) * 0.9));
    }
    herd.set(0, pose);
    herd.commit();
    const dizzy = !rm && phase === "dizzy" && u < 0.92;
    for (let i = 0; i < M.stars.length; i++) {
      const s = M.stars[i] as THREE.Sprite;
      s.visible = dizzy;
      if (!dizzy) continue;
      const a = t * 3.2 + (i * TAU) / M.stars.length;
      s.position.set(
        headLocal.x + Math.cos(a) * 0.5,
        headLocal.y + 0.55 + Math.sin(a * 2) * 0.05,
        headLocal.z + Math.sin(a) * 0.5,
      );
    }
  };

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.1);
      const dark = env.sky.isNight();
      // The night clock runs while it is dark, and while a pass that already began plays out after dawn.
      if (dark || inPass) night += dt;
      let st = passAt(night, seed);
      if (!dark && !st.phase) {
        if (night > 0) seed = (seed + 1) & 0xffff;
        night = 0;
        st = passAt(night, seed);
      }
      inPass = st.phase !== null;
      const phase = st.phase;
      const u = st.u;
      const from = hash01(st.k, seed ^ 0x5a5) * TAU;

      // ---- saucer
      const off = rm ? (lookable(phase) ? { x: 0, y: 0, z: 0 } : null) : saucerOffset(phase, u, from);
      M.saucer.visible = !!off;
      if (off) {
        const bob = rm ? 0 : Math.sin(t * 1.3) * 0.35;
        M.saucer.position.set(SPOT.x + off.x, hoverY + off.y + bob, SPOT.z + off.z);
        if (rm) M.saucer.rotation.set(0, 0, 0);
        else {
          const wob = phase === "inside" ? 0.14 : phase === "hover" || phase === "lift" || phase === "lower" ? 0.04 : 0;
          // Arriving it leans into its glide (nose toward the spot); leaving it tips back.
          const lean = phase === "arrive" ? 0.25 * (1 - u) : phase === "leave" ? -0.2 * u : 0;
          M.saucer.rotation.set(
            Math.sin(t * 6.1) * wob + Math.sin(from) * lean,
            0,
            Math.cos(t * 5.3) * wob - Math.cos(from) * lean,
          );
          M.hull.rotation.y += dt * (phase === "leave" ? 6 : 1.4);
        }
        const blink = Math.floor(t * (phase === "inside" ? 8 : 3)) % 2;
        M.lightsA.color.copy(blink ? LIT.a : DIM.a);
        M.lightsB.color.copy(blink ? DIM.b : LIT.b);
      }

      // ---- beam, ground glow, rings
      const level = rm ? (lookable(phase) ? 1 : 0) : beamLevel(phase, u);
      const beamOn = level > 0.01 && M.saucer.visible;
      // The ground keeps a fading glow through the dizzy spell, so the staggering alpaca still reads at night.
      const after = !rm && phase === "dizzy" ? 0.4 * (1 - u) : 0;
      M.beam.visible = beamOn;
      M.spot.visible = beamOn || after > 0.01;
      if (!beamOn) M.spotMat.opacity = after;
      if (beamOn) {
        const sp = M.saucer.position;
        const top = sp.y + BELLY_Y;
        M.beam.position.set(sp.x, top, sp.z);
        M.beam.scale.set(1, Math.max(0.1, top - gy), 1);
        const flicker = rm ? 1 : 0.9 + 0.1 * Math.sin(t * 23);
        M.beamMat.opacity = 0.32 * level * flicker;
        M.beamMat.map?.offset.set(rm ? 0 : t * 0.05, 0);
        M.spotMat.opacity = 0.75 * level * flicker;
      }
      const ringsOn = beamOn && !rm;
      for (let i = 0; i < M.rings.length; i++) {
        const r = M.rings[i] as THREE.Mesh;
        r.visible = ringsOn;
        if (!ringsOn) continue;
        // Climbing rings: each takes 1.5 s from the ground to the belly, widening the cone's radius back down.
        const k = (t / 1.5 + i / M.rings.length) % 1;
        const sp = M.saucer.position;
        const y = gy + k * (sp.y + BELLY_Y - gy);
        r.position.set(sp.x, y, sp.z);
        r.scale.setScalar(3.3 - 1.8 * k);
      }
      M.ringMat.opacity = 0.5 * level;

      // ---- alpaca
      const lift = rm ? { up: 0, scale: 1 } : alpacaLift(phase, u);
      placeAlpaca(lift.up, lift.scale, t, rm ? null : phase, u, dt);

      // ---- a good look
      if (!stamped && M.saucer.visible && lookable(phase)) {
        const near = Math.hypot(SPOT.x - avatar.x, SPOT.z - avatar.z) < LOOK_R;
        ndc.copy(M.saucer.position).project(env.camera);
        const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9;
        seenFor = near && onScreen ? seenFor + dt : 0;
        if (seenFor >= LOOK_HOLD) {
          stamped = true;
          emit("world:stamp", { id: STAMP, kind: "egg", label: LABEL });
        }
      } else seenFor = 0;

      updateHum(dt, phase, u, avatar);
    },
    dispose() {
      offGame();
      stopHum();
      creatures.remove(body);
      creatures.removeKeepOut(keep);
      group.removeFromParent();
      herd.dispose();
      M.dispose();
    },
  };
};
