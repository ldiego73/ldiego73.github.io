/**
 * Summit time trial: while a timed climb runs (core's climb tracker, announced through `world:climb`), a clock
 * chip ticks in the top-left trail chips and a translucent "apu" ghost of the traveler replays the best climb in
 * sync with the clock. The current climb's path is sampled every 0.25 s (journey.ts recorder) and replaces the
 * stored ghost when it is faster. On the summit the chip shows the time against the record and the first
 * completed climb stamps `record:climb`. Fast travel and the guided tour void the attempt (core voids the
 * tracker; we just hear about it). The ghost is not a Body: it walks through everything.
 * Its body is the traveler's own (characters: the andean outfit, the walk cycle from the replayed speed),
 * drawn with a translucent cel-banded shader instead of the toon palette.
 */
import * as THREE from "three";
import { CATALOG } from "../../lib/passport";
import { createHuman, type Human } from "../characters/hero";
import { TRAVELER, TRAVELER_DRESS } from "../characters/presets";
import type { CreateAmbient, L } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import {
  createPathRecorder,
  formatClock,
  type GhostPath,
  loadGhost,
  loadJourney,
  START_T,
  samplePath,
  saveGhost,
  shouldReplaceGhost,
} from "../journey";
import { styleUniforms } from "../style-gl";
import { makeChip, releaseChips, trailChips } from "./errand/chips";

const COPY = {
  trial: { es: "Contrarreloj", en: "Time trial" },
  record: { es: "récord", en: "record" },
  first: { es: "primera subida", en: "first climb" },
  ghostAhead: { es: "fantasma +{m} m", en: "ghost +{m} m" },
  youAhead: { es: "tú +{m} m", en: "you +{m} m" },
  summit: { es: "Cumbre", en: "Summit" },
  newRecord: { es: "¡nuevo récord!", en: "new record!" },
  voided: { es: "Contrarreloj anulado", en: "Time trial voided" },
  voidGate: { es: "de vuelta en la puerta", en: "back at the trailhead" },
  voidTravel: { es: "viaje rápido o recorrido guiado", en: "fast travel or guided tour" },
  started: { es: "Contrarreloj en marcha", en: "Time trial started" },
} satisfies Record<string, L>;

// Ghost look: pale turquoise core, a brighter rim (the khipu dye family, lifted toward light).
const CORE = new THREE.Color("#48b8b4");
const RIM = new THREE.Color("#e9fffb");

/**
 * Translucent apu: cel-banded like the rest of the world (a soft core, then a hard-edged bright rim band, like
 * the style's two-tone light; style-gl.ts), and hazed with distance like every fogged material (three's fog
 * chunks + `styleUniforms()` give it the aerial perspective).
 */
function ghostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...styleUniforms(),
      uOpacity: { value: 0 },
      uCore: { value: CORE },
      uRim: { value: RIM },
    },
    // Skinned (the traveler's body): three's skinning chunks, then the view-space normal for the rim.
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(normalMatrix * objectNormal);
        vV = -mvPosition.xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uOpacity;
      uniform vec3 uCore;
      uniform vec3 uRim;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
        float w = max(fwidth(f), 0.01);
        // Two tones and a thin outer band (cel), not a smooth gradient.
        float band = smoothstep(0.5 - w, 0.5 + w, f) * 0.65 + smoothstep(0.78 - w, 0.78 + w, f) * 0.35;
        vec3 col = mix(uCore, uRim, band);
        gl_FragColor = vec4(col, uOpacity * (0.42 + 0.52 * band));
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

/** The ghost's body: the traveler (andean outfit), every mesh on the ghost material, drawn after the world. */
function buildGhost(mat: THREE.Material): Human {
  const h = createHuman(TRAVELER.andean, TRAVELER_DRESS.andean, { lod: 1, seed: 7 });
  h.group.name = "ghost-traveler";
  ghostify(h, mat);
  return h;
}
/** Put the ghost material on the body and the cloth (the cloth mesh can appear when a finer LOD arrives). */
function ghostify(h: Human, mat: THREE.Material) {
  for (const m of [h.inst.body, h.inst.cloth])
    if (m && m.material !== mat) {
      m.material = mat;
      m.renderOrder = 3;
      m.castShadow = false;
    }
}

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const t = (l: L, vars: Record<string, string | number> = {}) =>
    l[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const rm = env.reducedMotion;

  // ---- 3D ghost
  const mat = ghostMaterial();
  // Built the first time a ghost runs (the traveler's own build is cached, so it is ready at once).
  let G: Human | null = null;
  const ghostBody = () => {
    if (!G) {
      G = buildGhost(mat);
      env.noOutline(G.group);
      env.scene.add(G.group);
    }
    return G;
  };

  // ---- HUD: clock chip in the shared trail chip stack + a polite live region for start/void/finish
  const chips = trailChips(hudRoot);
  const chip = makeChip("clock", 2);
  chips.appendChild(chip.chip);
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  chips.appendChild(live);

  const recorder = createPathRecorder();
  let running = false;
  let elapsed = 0;
  let ghost: GhostPath | null = null;
  let prevBest: number | null = null;
  let tainted = false;
  let fade = 0;
  let ghostDone = false;
  let resultTimer = 0;
  let chipClock = 0;
  let aheadClock = 0;
  let aheadText = "";
  let lastLabel = "";
  let lastValue = "";
  const pose = { x: 0, z: 0, yaw: 0 };
  const prevPose = { x: 0, z: 0 };
  const lastAvatar = new THREE.Vector3();
  let haveLast = false;
  let travelerYaw = 0;
  let traveler: THREE.Object3D | null = null;

  const setChip = (label: string, value: string) => {
    if (label !== lastLabel) chip.label.textContent = lastLabel = label;
    if (value !== lastValue) chip.value.textContent = lastValue = value;
    chip.chip.hidden = false;
  };
  const flash = (good: boolean) => {
    chip.chip.classList.toggle("is-good", good);
    chip.chip.classList.remove("is-flash");
    void chip.chip.offsetWidth;
    chip.chip.classList.add("is-flash");
  };
  const trialLabel = () =>
    prevBest !== null
      ? `${t(COPY.trial)} · ${t(COPY.record)} ${formatClock(prevBest)}`
      : `${t(COPY.trial)} · ${t(COPY.first)}`;

  const offClimb = on("world:climb", (d) => {
    if (d.phase === "start") {
      running = true;
      tainted = false;
      elapsed = 0;
      recorder.reset();
      ghost = loadGhost();
      prevBest = loadJourney().bestMs;
      ghostDone = false;
      fade = 0;
      aheadText = "";
      resultTimer = 0;
      chip.chip.classList.remove("is-good");
      if (ghost) {
        samplePath(ghost, 0, pose);
        prevPose.x = pose.x;
        prevPose.z = pose.z;
      }
      setChip(trialLabel(), formatClock(0));
      live.textContent = t(COPY.started);
      return;
    }
    if (!running) return;
    running = false;
    if (d.phase === "void") {
      const atGate = env.trail.nearestT(lastAvatar.x, lastAvatar.z) < START_T + 0.005;
      if (elapsed > 3) {
        setChip(t(COPY.voided), atGate ? t(COPY.voidGate) : t(COPY.voidTravel));
        chip.chip.classList.remove("is-good");
        live.textContent = t(COPY.voided);
        resultTimer = 3.5;
      } else chip.chip.hidden = true;
      return;
    }
    // Summit.
    const ms = d.ms ?? Math.round(elapsed * 1000);
    if (!tainted) {
      const path = recorder.toPath(ms);
      if (path && shouldReplaceGhost(loadGhost(), ms)) saveGhost(path);
    }
    const best = d.prevBestMs ?? null;
    const isBest = d.isBest ?? (best === null || ms < best);
    let value = formatClock(ms);
    if (best !== null) {
      const diff = (ms - best) / 1000;
      value += ` · ${diff < 0 ? "−" : "+"}${Math.abs(diff).toFixed(1)} s`;
    }
    const head = isBest
      ? `${t(COPY.summit)} · ${t(COPY.newRecord)}`
      : `${t(COPY.summit)} · ${t(COPY.record)} ${formatClock(best ?? ms)}`;
    setChip(head, value);
    flash(isBest);
    live.textContent = `${head}: ${value}`;
    resultTimer = 9;
    const label = CATALOG.find((c) => c.id === "record:climb")?.label ?? COPY.trial;
    emit("world:stamp", { id: "record:climb", kind: "record", label });
  });

  const update = (dt: number, avatar: THREE.Vector3) => {
    // Teleports that skip `world:teleport` (dev hook, glitches) taint the run: no ghost is saved from it.
    if (haveLast && running && avatar.distanceToSquared(lastAvatar) > 15 * 15) tainted = true;
    lastAvatar.copy(avatar);
    haveLast = true;

    if (running) {
      elapsed += Math.min(dt, 0.25);
      if (!traveler?.parent) traveler = env.scene.getObjectByName("traveler") ?? null;
      if (traveler) travelerYaw = traveler.rotation.y;
      recorder.add(elapsed, avatar.x, avatar.z, travelerYaw);
      chipClock -= dt;
      if (chipClock <= 0) {
        chipClock = 0.1;
        aheadClock -= 0.1;
        if (ghost && !ghostDone && aheadClock <= 0) {
          // Who's ahead, along the trail (meters).
          aheadClock = 0.5;
          const len = env.trail.length;
          const dm = Math.round((env.trail.nearestT(pose.x, pose.z) - env.trail.nearestT(avatar.x, avatar.z)) * len);
          aheadText = Math.abs(dm) < 2 ? "" : dm > 0 ? t(COPY.ghostAhead, { m: dm }) : t(COPY.youAhead, { m: -dm });
        }
        const clock = formatClock(elapsed * 1000);
        setChip(trialLabel(), aheadText ? `${clock} · ${aheadText}` : clock);
      }
    } else if (resultTimer > 0) {
      resultTimer -= dt;
      if (resultTimer <= 0) chip.chip.hidden = true;
    }

    // Ghost replay, in sync with the clock; fades in at the start and out once it has finished its run.
    const show = running && ghost !== null;
    if (show && ghost) {
      ghostDone = !samplePath(ghost, elapsed, pose);
    }
    const want = show && !ghostDone ? 1 : 0;
    fade = Math.max(0, Math.min(1, fade + (want ? dt / 0.6 : -dt / 1.6)));
    if (fade <= 0) {
      if (G?.group.visible) G.group.visible = false;
      return;
    }
    const g = ghostBody();
    g.group.visible = true;
    ghostify(g, mat);
    const sx = pose.x - prevPose.x;
    const sz = pose.z - prevPose.z;
    const speed = dt > 0 ? Math.hypot(sx, sz) / dt : 0;
    prevPose.x = pose.x;
    prevPose.z = pose.z;
    g.group.position.set(pose.x, groundAt(pose.x, pose.z), pose.z);
    g.group.rotation.y = pose.yaw;
    // Fainter when it overlaps the traveler, so it never hides them.
    const near = Math.min(1, Math.max(0.3, Math.sqrt((pose.x - avatar.x) ** 2 + (pose.z - avatar.z) ** 2) / 2.5));
    mat.uniforms.uOpacity!.value = fade * near * 0.9;
    // Walk / run cycle from the replayed speed (the animator calms it with reduced motion).
    g.update(dt, elapsed, { speed, rm, expression: "auto" });
  };

  // Dev hook (screenshots): current trial state.
  if (import.meta.env?.DEV) {
    (window as unknown as { __ghost?: unknown }).__ghost = {
      state: () => ({ running, elapsed, ghost: ghost ? { ms: ghost.ms, n: ghost.n } : null, tainted, fade }),
    };
  }

  return {
    update,
    dispose() {
      offClimb();
      G?.group.removeFromParent();
      G?.dispose();
      mat.dispose();
      chip.chip.remove();
      live.remove();
      releaseChips(chips);
    },
  };
};
