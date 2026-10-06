/**
 * Summit time trial: while a timed climb runs (core's climb tracker, announced through `world:climb`), a clock
 * chip ticks in the top-left trail chips and a translucent "apu" ghost of the traveler replays the best climb in
 * sync with the clock. The current climb's path is sampled every 0.25 s (journey.ts recorder) and replaces the
 * stored ghost when it is faster. On the summit the chip shows the time against the record and the first
 * completed climb stamps `record:climb`. Fast travel and the guided tour void the attempt (core voids the
 * tracker; we just hear about it). The ghost is not a Body: it walks through everything.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CATALOG } from "../../lib/passport";
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

function ghostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uCore: { value: CORE },
      uRim: { value: RIM },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uCore;
      uniform vec3 uRim;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
        float rim = pow(f, 1.7);
        vec3 col = mix(uCore, uRim, rim);
        gl_FragColor = vec4(col, uOpacity * (0.46 + 0.5 * rim));
      }`,
    transparent: true,
    depthWrite: false,
  });
}

type Geo = THREE.BufferGeometry;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
/** Clone a primitive with a transform (position, rotation, scale). */
function part(src: Geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Geo {
  const g = (src.index ? src.toNonIndexed() : src.clone()) as Geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  return g.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
}

/** Low-poly traveler silhouette (chullo, poncho, pack), ~1.6 u tall, origin at the feet, facing +Z. */
function buildGhost(mat: THREE.Material) {
  const P = {
    cap: new THREE.CapsuleGeometry(1, 1, 2, 7),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.CylinderGeometry(0.42, 1, 1, 10),
    sph: new THREE.IcosahedronGeometry(1, 1),
    box: new THREE.BoxGeometry(1, 1, 1),
    chullo: new THREE.ConeGeometry(1, 1, 8),
  };
  const geos: Geo[] = [];
  const mesh = (parts: Geo[], name: string) => {
    const g = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.renderOrder = 3;
    return m;
  };
  const group = new THREE.Group();
  group.name = "ghost-traveler";
  const rig = new THREE.Group();
  group.add(rig);
  const legs: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.105 * side, 0.56, 0);
    pivot.add(
      mesh(
        [part(P.cap, 0, -0.25, 0, 0, 0, 0, 0.085, 0.3, 0.085), part(P.box, 0, -0.5, 0.035, 0, 0, 0, 0.15, 0.11, 0.24)],
        "ghost:leg",
      ),
    );
    rig.add(pivot);
    legs.push(pivot);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.56;
  rig.add(torso);
  torso.add(
    mesh(
      [
        part(P.cone, 0, 0.27, 0, 0, 0, 0, 0.4, 0.48, 0.33), // poncho
        part(P.sph, 0, 0.84, 0, 0, 0, 0, 0.25, 0.24, 0.235), // head
        part(P.chullo, 0, 1.1, -0.02, -0.12, 0, 0, 0.255, 0.3, 0.255), // chullo
        part(P.sph, 0, 1.27, -0.05, 0, 0, 0, 0.06, 0.06, 0.06), // pompom
        part(P.box, 0, 0.28, -0.26, 0, 0, 0, 0.36, 0.38, 0.18), // pack
      ],
      "ghost:body",
    ),
  );
  const arms: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * side, 0.43, 0);
    pivot.add(
      mesh(
        [part(P.cap, 0, -0.18, 0, 0, 0, 0, 0.065, 0.26, 0.065), part(P.sph, 0, -0.37, 0.01, 0, 0, 0, 0.07, 0.07, 0.07)],
        "ghost:arm",
      ),
    );
    torso.add(pivot);
    arms.push(pivot);
  }
  for (const g of Object.values(P)) g.dispose();
  return { group, rig, torso, legs, arms, geos };
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
  const G = buildGhost(mat);
  G.group.visible = false;
  env.noOutline(G.group);
  env.scene.add(G.group);

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
  let phase = 0;
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
      if (G.group.visible) G.group.visible = false;
      return;
    }
    G.group.visible = true;
    const sx = pose.x - prevPose.x;
    const sz = pose.z - prevPose.z;
    const speed = dt > 0 ? Math.hypot(sx, sz) / dt : 0;
    prevPose.x = pose.x;
    prevPose.z = pose.z;
    G.group.position.set(pose.x, groundAt(pose.x, pose.z), pose.z);
    G.group.rotation.y = pose.yaw;
    // Fainter when it overlaps the traveler, so it never hides them.
    const near = Math.min(1, Math.max(0.3, Math.sqrt((pose.x - avatar.x) ** 2 + (pose.z - avatar.z) ** 2) / 2.5));
    mat.uniforms.uOpacity!.value = fade * near * 0.9;
    // Walk cycle from the replayed speed (no cycle with reduced motion: it glides).
    const amp = rm ? 0 : Math.min(1, speed / 3);
    const run = Math.min(1, Math.max(0, (speed - 4.2) / 2.5));
    phase += (dt * speed * Math.PI) / (0.62 + run * 0.5);
    const sw = Math.sin(phase);
    G.legs[0]!.rotation.x = sw * (0.55 + 0.25 * run) * amp;
    G.legs[1]!.rotation.x = -sw * (0.55 + 0.25 * run) * amp;
    G.arms[0]!.rotation.x = -sw * (0.4 + 0.3 * run) * amp;
    G.arms[1]!.rotation.x = sw * (0.4 + 0.3 * run) * amp;
    G.rig.position.y = Math.abs(Math.cos(phase)) * 0.05 * amp + (rm ? 0 : Math.sin(elapsed * 2.2) * 0.03);
    G.torso.rotation.x = 0.06 * amp + 0.16 * run * amp;
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
      G.group.removeFromParent();
      for (const g of G.geos) g.dispose();
      mat.dispose();
      chip.chip.remove();
      live.remove();
      releaseChips(chips);
    },
  };
};
