/**
 * The midnight ukuku (a hidden find of Qusqu): in the deep night only (./ukuku/logic.ts BAND, ≈ 21:36 to
 * 04:05 on the sky clock; the T key lands inside it), an ukuku, the bear-dancer of the Qoyllur Rit'i
 * pilgrimage, dances alone in the quiet north-east quarter of Haukaypata (logic.ts SPOT): hopping from foot to
 * foot, spinning, circling its whip overhead, its little bell jingling on every landing. With
 * prefers-reduced-motion it sways gently in place instead.
 *
 * Come close and "E · Saludar" stops it: it turns to the traveler, waves, says a short line in the ukuku's
 * falsetto (a speech bubble, and a squeaky three-syllable voice) and stamps `cusco:egg:ukuku` (kind "egg", a bonus
 * find on the hub's passport page). Then it dances again.
 *
 * It appears and vanishes only while its corner is off screen, or at once when the clock jumps (T key), so it
 * never pops in under the traveler's eyes. A solid body (creatures.ts, kind "ukuku") while out, parked
 * otherwise. Sound: one-shot Web Audio voices on the music output's sfx bus, quiet, falling off with distance
 * (silent beyond logic.ts BELL_FAR) and panned to its side; hushed while a game is open.
 *
 * Model and rig: ./ukuku/model.ts (seven vertex-coloured meshes on one toon material, ink-outlined).
 */
import "../../ambient/people/people.css";
import * as THREE from "three";
import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures, park } from "../../creatures";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import {
  BELL_FAR,
  beat,
  bellGain,
  blendPose,
  clockJumped,
  dancePose,
  GREET_SECS,
  greetPose,
  isMidnight,
  lineFor,
  nextShown,
  PROMPT_R,
  panFor,
  REST,
  SPOT,
  STAMP,
  yawTo,
} from "./ukuku/logic";
import { buildUkuku, HIPS_Y } from "./ukuku/model";

const S = {
  prompt: { es: "E · Saludar", en: "E · Say hi" },
} satisfies Record<string, L>;

/** The bubble hangs above the mask (head top ≈ 1.75 u). */
const BUBBLE_Y = 2.05;
/** Bell and voice levels at full gain: quiet, under the music and the ambience. */
const BELL_LEVEL = 0.05;
const VOICE_LEVEL = 0.07;

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const rm = env.reducedMotion;
  const music = getMusic();

  // ------------------------------------------------------------------ model
  const mat = vertexToon();
  const rig = buildUkuku(mat);
  const groundY = env.suyu.groundAt(SPOT.x, SPOT.z);
  rig.root.position.set(SPOT.x, groundY, SPOT.z);
  rig.root.rotation.y = SPOT.yaw;
  rig.root.visible = false;
  env.scene.add(rig.root);
  const body = creatures.add("ukuku", 0.42, { solid: false, give: 0.15 });
  park(body);

  // ------------------------------------------------------------------ bubble (the shared people bubble)
  const layer = document.createElement("div");
  layer.className = "qn-hud qn-people-layer";
  layer.lang = lang;
  hudRoot.appendChild(layer);
  const bubbleEl = document.createElement("p");
  bubbleEl.className = "qn-people-bubble";
  bubbleEl.setAttribute("role", "status");
  bubbleEl.setAttribute("aria-live", "polite");
  layer.appendChild(bubbleEl);
  let bubbleT = 0;
  const proj = new THREE.Vector3();
  const showBubble = (text: string) => {
    // The ukuku's exclamation (before the first "!" or ",") in italics, as the people's greetings.
    const m = /^(¡?[^!,]+[!,])(.*)$/.exec(text);
    bubbleEl.replaceChildren();
    if (m) {
      const i = document.createElement("i");
      i.textContent = m[1] as string;
      bubbleEl.append(i, m[2] as string);
    } else bubbleEl.textContent = text;
    bubbleT = GREET_SECS;
    bubbleEl.classList.add("is-on");
  };
  const hideBubble = () => {
    bubbleT = 0;
    bubbleEl.classList.remove("is-on");
  };
  const placeBubble = () => {
    proj.set(rig.root.position.x, rig.root.position.y + BUBBLE_Y, rig.root.position.z).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    bubbleEl.style.visibility = vis ? "" : "hidden";
    bubbleEl.style.left = `${Math.round(THREE.MathUtils.clamp(((proj.x + 1) / 2) * w, 160, w - 160))}px`;
    bubbleEl.style.top = `${Math.round(THREE.MathUtils.clamp(((1 - proj.y) / 2) * h, 120, h - 40))}px`;
  };

  // ------------------------------------------------------------------ sound (one-shots, no graph kept)
  let game = false;
  const offGame = on("world:game", (d) => {
    game = !!d?.open;
  });
  const output = (): AudioOutput | null => {
    if (game) return null;
    try {
      const out = music.output?.() ?? null;
      return out?.ctx.state === "running" ? out : null;
    } catch {
      return null;
    }
  };
  /** A gain → panner chain into the sfx bus that frees itself after `secs`. */
  const shot = (out: AudioOutput, level: number, pan: number, secs: number) => {
    const ctx = out.ctx;
    const top = ctx.createGain();
    top.gain.value = level;
    let tail: AudioNode = top;
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      top.connect(p);
      tail = p;
    }
    tail.connect(out.sfx);
    setTimeout(() => {
      top.disconnect();
      if (tail !== top) tail.disconnect();
    }, secs * 1000);
    return { ctx, top };
  };
  /** The little bell: two quick strikes of three inharmonic partials (a small cast bell), fading fast. */
  const ring = (level: number, pan: number) => {
    const out = output();
    if (!out || level <= 0.001) return;
    const { ctx, top } = shot(out, level * BELL_LEVEL, pan, 0.9);
    const base = 2350 + Math.random() * 150;
    for (const [k, dt] of [
      [0, 0],
      [1, 0.055],
    ] as const) {
      const t0 = ctx.currentTime + 0.01 + dt;
      for (const [ratio, amp] of [
        [1, 1],
        [2.32, 0.45],
        [4.1, 0.2],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base * ratio * (k ? 1.004 : 1);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0, t0);
        e.gain.linearRampToValueAtTime(amp * (k ? 0.6 : 1), t0 + 0.003);
        e.gain.setTargetAtTime(0, t0 + 0.004, 0.09 / ratio ** 0.5);
        o.connect(e);
        e.connect(top);
        o.start(t0);
        o.stop(t0 + 0.6);
        o.onended = () => e.disconnect();
      }
    }
  };
  /** The falsetto: three squeaky syllables ("a-ta-tau"), a high triangle with vibrato through a vowel band. */
  const squeak = (level: number, pan: number) => {
    const out = output();
    if (!out || level <= 0.001) return;
    const { ctx, top } = shot(out, level * VOICE_LEVEL, pan, 1.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 1.2;
    bp.connect(top);
    const syll: Array<[number, number, number]> = [
      [0, 820, 0.12],
      [0.17, 980, 0.1],
      [0.32, 1180, 0.38],
    ];
    for (const [at, f, len] of syll) {
      const t0 = ctx.currentTime + 0.02 + at;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t0);
      // The last syllable rises then falls, the ukuku's teasing "tau".
      o.frequency.linearRampToValueAtTime(f * (len > 0.2 ? 1.25 : 1.08), t0 + len * 0.4);
      o.frequency.linearRampToValueAtTime(f * (len > 0.2 ? 0.8 : 1), t0 + len);
      const vib = ctx.createOscillator();
      vib.frequency.value = 7;
      const vibG = ctx.createGain();
      vibG.gain.value = f * 0.025;
      vib.connect(vibG);
      vibG.connect(o.frequency);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(1, t0 + 0.02);
      e.gain.setValueAtTime(1, t0 + len * 0.7);
      e.gain.linearRampToValueAtTime(0, t0 + len);
      o.connect(e);
      e.connect(bp);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + len + 0.02);
      vib.stop(t0 + len + 0.02);
      o.onended = () => {
        e.disconnect();
        vibG.disconnect();
      };
    }
    setTimeout(() => bp.disconnect(), 1300);
  };

  // ------------------------------------------------------------------ state
  let shown: boolean | null = null;
  let prevTime = env.sky.time();
  let danceT = 0;
  let greetT = 0;
  let greeting = false;
  let lines = 0;
  let lastBeat = 0;
  let near = false;
  let facing: number = SPOT.yaw;
  let stamped = false;
  let dist = Number.POSITIVE_INFINITY;
  const pose = { ...REST };
  const target = { ...REST };
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = () => {
    if (Math.hypot(SPOT.x - camPos.x, SPOT.z - camPos.z) > 120) return false;
    seenV.set(SPOT.x, groundY + 1, SPOT.z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.2 && Math.abs(seenV.y) < 1.2;
  };
  const right = new THREE.Vector3();
  const avatarAt = { x: 0, z: 0 };
  const level = () => bellGain(dist);
  const pan = () => {
    const e = env.camera.matrixWorld.elements;
    const l = Math.hypot(e[0] as number, e[2] as number) || 1;
    right.set((e[0] as number) / l, 0, (e[2] as number) / l);
    return panFor(rig.root.position.x - avatarAt.x, rig.root.position.z - avatarAt.z, right.x, right.z);
  };

  const greet = () => {
    greeting = true;
    greetT = 0;
    showBubble(T(lineFor(lines++)));
    if (dist < BELL_FAR) {
      squeak(level(), pan());
      ring(level() * 0.6, pan());
    }
    if (!stamped) {
      stamped = true;
      emit("world:stamp", STAMP);
    }
  };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      avatarAt.x = avatar.x;
      avatarAt.z = avatar.z;
      env.camera.getWorldPosition(camPos);
      const time = env.sky.time();
      const jumped = clockJumped(prevTime, time);
      prevTime = time;
      const next = nextShown(shown, isMidnight(time), seen(), jumped, greeting);
      if (next !== shown) {
        shown = next;
        rig.root.visible = next;
        if (next) {
          body.solid = true;
          body.x = SPOT.x;
          body.z = SPOT.z;
          danceT = 0;
          lastBeat = 0;
          facing = SPOT.yaw;
          Object.assign(pose, REST);
        } else {
          park(body);
          greeting = false;
          hideBubble();
        }
      }
      if (!shown) {
        near = false;
        return;
      }
      dist = Math.hypot(avatar.x - rig.root.position.x, avatar.z - rig.root.position.z);
      near = dist < PROMPT_R;

      // Pose: the dance, or the greeting (facing the traveler) for GREET_SECS.
      let face: number = SPOT.yaw;
      if (greeting) {
        greetT += dt;
        greetPose(greetT, rm, target);
        face = yawTo(rig.root.position, avatar);
        if (greetT >= GREET_SECS || dist > PROMPT_R + 5) {
          greeting = false;
          // Back to the dance on the beat it left (no bell burst on the resumed count).
          lastBeat = beat(danceT, rm);
        }
      } else {
        danceT += dt;
        dancePose(danceT, rm, target);
        const b = beat(danceT, rm);
        if (b !== lastBeat) {
          lastBeat = b;
          if (dist < BELL_FAR) ring(level(), pan());
        }
      }
      // Quick blend: crisp hops, but no snap between the dance and the greeting.
      blendPose(pose, target, 1 - Math.exp(-dt * (greeting ? 8 : 16)));
      let df = face - facing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      facing += df * (1 - Math.exp(-dt * 6));

      const yaw = facing + pose.turn;
      const c = Math.cos(SPOT.yaw);
      const s = Math.sin(SPOT.yaw);
      // The step offset is in the spot's own frame (local x right, z forward).
      const x = SPOT.x + pose.dx * c + pose.dz * s;
      const z = SPOT.z - pose.dx * s + pose.dz * c;
      rig.root.position.set(x, env.suyu.groundAt(x, z), z);
      rig.root.rotation.y = yaw;
      rig.hips.position.y = HIPS_Y + pose.lift;
      rig.torso.rotation.set(pose.leanX, 0, pose.leanZ);
      rig.head.rotation.set(pose.headX, 0, pose.headZ);
      // Left arm on +x (the model faces +z): +z raises it sideways; −x swings it forward. Mirrored on the right.
      rig.armL.rotation.set(-pose.armLX, 0, pose.armLZ);
      rig.armR.rotation.set(-pose.armRX, 0, -pose.armRZ);
      rig.legL.rotation.x = -pose.legL;
      rig.legR.rotation.x = -pose.legR;
      rig.whip.rotation.y = pose.whip;
      body.x = x;
      body.z = z;

      if (bubbleT > 0) {
        bubbleT -= dt;
        if (bubbleT <= 0 || dist > PROMPT_R + 5) hideBubble();
        else placeBubble();
      }
    },
    prompt() {
      return shown && near && !greeting ? T(S.prompt) : null;
    },
    interact() {
      if (!shown || !near) return false;
      greet();
      return true;
    },
    dispose() {
      offGame();
      creatures.remove(body);
      rig.dispose();
      mat.dispose();
      layer.remove();
    },
  };
};
