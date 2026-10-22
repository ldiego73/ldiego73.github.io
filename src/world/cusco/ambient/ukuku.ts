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
 * The dancer is a person on the shared characters (../../characters: `createHuman`, one skinned body moved by
 * the human animation controller: the "hop", "dance" and "whip-circle" actions, ./ukuku/logic.ts danceStep)
 * whose spec carries the knitted mask, the belt and bell and the chest doll in the core's generic hook
 * (./ukuku/costume.ts: `extra` primitives, no painted face, built with the body off the main thread). The shaggy
 * fleece the hook cannot express rides the same skeleton as one world-local skinned mesh (./ukuku/model.ts),
 * and the whip is the core's held prop, spinning in the right hand. Three draw calls (body, fleece, whip).
 */
import "../../ambient/people/people.css";
import * as THREE from "three";
import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import { createHuman } from "../../characters/hero";
import { prefetchHumans } from "../../characters/pipeline";
import { HeldProps } from "../../characters/props";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures, park } from "../../creatures";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { DANCER_DRESS, ukukuSpec } from "./ukuku/costume";
import {
  BELL_FAR,
  beat,
  bellGain,
  clockJumped,
  danceStep,
  GREET_SECS,
  greetStep,
  isMidnight,
  lineFor,
  nextShown,
  PROMPT_R,
  panFor,
  SPOT,
  STAMP,
  type Step,
  stepAt,
  yawTo,
} from "./ukuku/logic";
import { dressFleece } from "./ukuku/model";

/** The dancer in costume (pure data: it keys the build cache and travels to the worker). */
const DANCER = ukukuSpec();

const S = {
  prompt: { es: "E · Saludar", en: "E · Say hi" },
} satisfies Record<string, L>;

/** The bubble hangs above the mask (tassels' top ≈ 1.85 u). */
const BUBBLE_Y = 2.15;
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
  // The near and mid builds go to the worker now; the far one is built at once (a few ms) so it is there.
  prefetchHumans([DANCER], [1, 0]);
  const human = createHuman(DANCER, DANCER_DRESS, { lod: 2, seed: 0 });
  // The shaggy fleece (world-local lumps on the same skeleton: the core's wool reads as a plain tracksuit).
  // A dancing body: no world-space paint on it (it would slide over the fleece).
  const fleeceMat = paintStrength(vertexToon(), 0);
  const fleece = dressFleece(human, fleeceMat);
  // The whip: the core's held prop on the right hand (it spins about the hand; calmer with reduced motion).
  const props = new HeldProps(1);
  props.rm = rm;
  env.scene.add(props.group);
  props.attach(
    {
      boneWorld(name, out) {
        const b = human.inst.bones[name];
        if (!b) return out.copy(human.group.matrixWorld);
        b.updateWorldMatrix(true, false);
        return out.copy(b.matrixWorld);
      },
      get shown() {
        return human.group.visible;
      },
    },
    "whip",
    "#efe6d6",
  );
  const root = human.group;
  root.name = "cusco-ukuku";
  const groundY = env.suyu.groundAt(SPOT.x, SPOT.z);
  root.position.set(SPOT.x, groundY, SPOT.z);
  root.rotation.y = SPOT.yaw;
  root.visible = false;
  env.scene.add(root);
  let lod = 2;
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
    proj.set(root.position.x, root.position.y + BUBBLE_Y, root.position.z).project(env.camera);
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
  const step: Step = danceStep(0, rm);
  let stepI = -1;
  let dx = 0;
  let dz = 0;
  let clock = 0;
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
    return panFor(root.position.x - avatarAt.x, root.position.z - avatarAt.z, right.x, right.z);
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
        root.visible = next;
        if (next) {
          body.solid = true;
          body.x = SPOT.x;
          body.z = SPOT.z;
          danceT = 0;
          lastBeat = 0;
          stepI = -1;
          dx = 0;
          dz = 0;
          facing = SPOT.yaw;
        } else {
          park(body);
          greeting = false;
          hideBubble();
        }
      }
      if (!shown) {
        near = false;
        props.update(clock);
        return;
      }
      clock += dt;
      dist = Math.hypot(avatar.x - root.position.x, avatar.z - root.position.z);
      near = dist < PROMPT_R;

      // The dance (or the greeting, facing the traveler, for GREET_SECS): an action of the human controller,
      // plus the turn and drift of the whole body on its spot.
      let face: number = SPOT.yaw;
      if (greeting) {
        greetT += dt;
        greetStep(step);
        face = yawTo(root.position, avatar);
        if (greetT >= GREET_SECS || dist > PROMPT_R + 5) {
          greeting = false;
          stepI = -1;
          // Back to the dance on the beat it left (no bell burst on the resumed count).
          lastBeat = beat(danceT, rm);
        }
      } else {
        danceT += dt;
        danceStep(danceT, rm, step);
        const b = beat(danceT, rm);
        if (b !== lastBeat) {
          lastBeat = b;
          if (dist < BELL_FAR) ring(level(), pan());
        }
      }
      // A new step (or the greeting) restarts its action, so the hops land on the bell's count.
      const si = greeting ? -2 : rm ? 0 : stepAt(danceT).i;
      if (si !== stepI) {
        stepI = si;
        human.anim.act(step.action, { side: step.side, fade: 0.25, restart: true });
      }
      const kd = 1 - Math.exp(-dt * 6);
      dx += (step.dx - dx) * kd;
      dz += (step.dz - dz) * kd;
      let df = face - facing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      facing += df * (1 - Math.exp(-dt * 6));

      const c = Math.cos(SPOT.yaw);
      const s = Math.sin(SPOT.yaw);
      // The drift is in the spot's own frame (local x right, z forward).
      const x = SPOT.x + dx * c + dz * s;
      const z = SPOT.z - dx * s + dz * c;
      root.position.set(x, env.suyu.groundAt(x, z), z);
      root.rotation.y = facing + step.turn;
      human.anim.look(null);
      human.update(dt, clock, { speed: 0, rm, expression: "auto" });
      props.update(clock);
      // Near LOD only up close (it dances alone; the far LOD is a few thousand triangles).
      const want = dist < 14 ? 0 : dist < 36 ? 1 : 2;
      if (want !== lod) {
        lod = want;
        human.setLod(want as 0 | 1 | 2);
      }
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
      props.dispose();
      fleece.dispose();
      fleeceMat.dispose();
      human.dispose();
      layer.remove();
    },
  };
};
