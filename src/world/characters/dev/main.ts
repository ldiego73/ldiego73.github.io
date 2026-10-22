/**
 * Characters prototype harness: OLD vs NEW side by side on a trailhead meadow in the mountain's style.
 *   bunx vite --config src/world/characters/dev/vite.config.ts --port 5261
 * Keys: 1 idle · 2 walk · 3 run · I ink · W wireframe · R reduced motion · E expression · T time of day ·
 *       Y turn the lineup (front, 3/4, side, back) · L labels · H hide the UI.
 * Query: ?mode=walk&time=dusk&yaw=0.7&rm=1&clean=1. Screenshot hook: window.__chars (see the bottom).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createEngine } from "../../engine";
import { createSky } from "../../sky";
import { createWorldStyle, type WorldStyleOptions } from "../../style-runtime";
import { createToonCache } from "../../toon";
import { liveWind } from "../../wind";
import type { Expression, Mode, NewCharacter } from "../index";
import { createCampesina, createLlama, createTraveler } from "../index";
import { oldCampesina, oldLlama, oldTraveler } from "./old";
import { createStage, heightAt } from "./stage";

const q = new URLSearchParams(location.search);
const host = document.getElementById("world") as HTMLElement;
const engine = createEngine(host, { quality: "high" });
const { scene, camera, renderer } = engine;
const toon = createToonCache();
const sysRM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = {
  mode: (q.get("mode") as Mode) ?? "idle",
  rm: q.has("rm") ? q.get("rm") === "1" : sysRM,
  expression: (q.get("expr") as Expression) ?? "auto",
  ink: true,
  wire: false,
  yaw: Number(q.get("yaw") ?? 0),
  time: q.get("time") ?? "day",
  paused: false,
};
const sky = createSky(scene, { reducedMotion: state.rm, quality: "high" });
createStage(scene, toon);

// ---------------------------------------------------------------- the lineup
interface Slot {
  key: string;
  label: string;
  isNew: boolean;
  x: number;
  root: THREE.Object3D | null;
  place?(x: number, z: number, yaw: number): void;
  update(dt: number, t: number): void;
  nc?: NewCharacter;
}
const Z = 0.2;
const slots: Slot[] = [];
const rmNow = () => state.rm;
const oldTrav = oldTraveler(scene, toon, rmNow);
slots.push({
  key: "old-traveler",
  label: "OLD traveler",
  isNew: false,
  x: -5.0,
  root: oldTrav.group,
  update: (dt, t) => oldTrav.update(dt, t, state.mode),
});
const t0 = performance.now();
const newTrav = createTraveler();
const travMs = performance.now() - t0;
scene.add(newTrav.group);
slots.push({
  key: "new-traveler",
  label: "NEW traveler",
  isNew: true,
  x: -3.4,
  root: newTrav.group,
  nc: newTrav,
  update: (dt, t) => newTrav.update(dt, t, charState(newTrav.group)),
});
const oldCamp = oldCampesina(scene);
slots.push({
  key: "old-campesina",
  label: "OLD campesina",
  isNew: false,
  x: -1.0,
  root: null,
  place: oldCamp.place,
  update: (dt, t) => oldCamp.update(dt, t, state.mode, state.rm),
});
const t1 = performance.now();
const newCamp = createCampesina();
const campMs = performance.now() - t1;
scene.add(newCamp.group);
slots.push({
  key: "new-campesina",
  label: "NEW campesina",
  isNew: true,
  x: 0.6,
  root: newCamp.group,
  nc: newCamp,
  update: (dt, t) => newCamp.update(dt, t, charState(newCamp.group)),
});
const oldL = oldLlama(scene, toon);
slots.push({
  key: "old-llama",
  label: "OLD llama",
  isNew: false,
  x: 3.0,
  root: oldL.group,
  update: (dt, t) => oldL.update(dt, t, state.mode, state.rm),
});
const t2 = performance.now();
const newLlama = createLlama();
const llamaMs = performance.now() - t2;
scene.add(newLlama.group);
slots.push({
  key: "new-llama",
  label: "NEW llama",
  isNew: true,
  x: 5.0,
  root: newLlama.group,
  nc: newLlama,
  update: (dt, t) => newLlama.update(dt, t, charState(newLlama.group)),
});

function charState(g: THREE.Object3D) {
  const w = liveWind.sample(g.position.x, g.position.z);
  const c = Math.cos(g.rotation.y);
  const s = Math.sin(g.rotation.y);
  return {
    mode: state.mode,
    rm: state.rm,
    expression: state.expression,
    windX: c * w.x - s * w.z,
    windZ: s * w.x + c * w.z,
  };
}

function placeAll() {
  for (const s of slots) {
    const y = heightAt(s.x, Z);
    if (s.root) {
      s.root.position.set(s.x, y, Z);
      s.root.rotation.y = state.yaw;
    }
    s.place?.(s.x, Z, state.yaw);
  }
}
placeAll();

// ---------------------------------------------------------------- style, sky, camera
const focus = new THREE.Vector3(0, 0, Z);
const styleOpts: WorldStyleOptions = {
  world: "qhapaq",
  engine,
  sky,
  reducedMotion: state.rm,
  focus,
  noPaint: [oldTrav.group, oldL.group],
};
const style = createWorldStyle(styleOpts);
const TIMES: Record<string, number> = { day: 0.42, dusk: 0.735, night: 0.9 };
const setTime = (k: string) => {
  state.time = k;
  sky.sky.setTime(TIMES[k] ?? 0.42);
};
setTime(state.time);

camera.position.set(0, 1.7, 9.2);
const controls = new OrbitControls(camera, engine.canvas);
controls.target.set(0, 0.95, Z);
controls.enableDamping = true;
controls.update();

// ---------------------------------------------------------------- labels, UI, stats
const labels = document.getElementById("labels") as HTMLElement;
const tags = slots.map((s) => {
  const el = document.createElement("span");
  el.textContent = s.label;
  if (s.isNew) el.className = "new";
  labels.appendChild(el);
  return el;
});
const tmp = new THREE.Vector3();
function placeLabels() {
  const { w, h } = engine.size();
  slots.forEach((s, i) => {
    tmp.set(s.x, heightAt(s.x, Z) - 0.12, Z + 0.6).project(camera);
    const el = tags[i] as HTMLElement;
    el.style.left = `${((tmp.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - tmp.y) / 2) * h}px`;
    el.style.display = tmp.z < 1 ? "" : "none";
  });
}

const ui = document.getElementById("ui") as HTMLElement;
const groups: Record<string, HTMLButtonElement[]> = {};
function button(group: string, label: string, pressed: () => boolean, act: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => {
    act();
    refresh();
  });
  const list = groups[group] ?? [];
  groups[group] = list;
  list.push(b);
  (b as unknown as { pressed: () => boolean }).pressed = pressed;
  ui.appendChild(b);
}
const sep = () => ui.appendChild(Object.assign(document.createElement("span"), { className: "sep" }));
function refresh() {
  for (const list of Object.values(groups))
    for (const b of list)
      b.setAttribute("aria-pressed", String((b as unknown as { pressed: () => boolean }).pressed()));
}
for (const m of ["idle", "walk", "run"] as const)
  button(
    "mode",
    m,
    () => state.mode === m,
    () => (state.mode = m),
  );
sep();
for (const e of ["auto", "neutral", "blink", "smile"] as const)
  button(
    "expr",
    e,
    () => state.expression === e,
    () => (state.expression = e),
  );
sep();
for (const k of Object.keys(TIMES))
  button(
    "time",
    k,
    () => state.time === k,
    () => setTime(k),
  );
sep();
button(
  "ink",
  "ink",
  () => state.ink,
  () => setInk(!state.ink),
);
button(
  "wire",
  "wireframe",
  () => state.wire,
  () => setWire(!state.wire),
);
button(
  "rm",
  "reduced motion",
  () => state.rm,
  () => setRM(!state.rm),
);
sep();
for (const [n, a] of [
  ["front", 0],
  ["3/4", 0.7],
  ["side", Math.PI / 2],
  ["back", Math.PI],
] as const)
  button(
    "yaw",
    n,
    () => Math.abs(state.yaw - a) < 1e-3,
    () => setYaw(a),
  );
refresh();

function setInk(on: boolean) {
  state.ink = on;
  engine.outline.enabled = on;
}
function setWire(on: boolean) {
  state.wire = on;
  for (const s of slots)
    s.nc?.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
      if (m && "wireframe" in m) m.wireframe = on;
    });
}
function setRM(on: boolean) {
  state.rm = on;
  styleOpts.reducedMotion = on;
}
function setYaw(a: number) {
  state.yaw = a;
  placeAll();
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "1") state.mode = "idle";
  else if (k === "2") state.mode = "walk";
  else if (k === "3") state.mode = "run";
  else if (k === "i") setInk(!state.ink);
  else if (k === "w") setWire(!state.wire);
  else if (k === "r") setRM(!state.rm);
  else if (k === "e") {
    const list: Expression[] = ["auto", "neutral", "blink", "smile"];
    state.expression = list[(list.indexOf(state.expression) + 1) % list.length] as Expression;
  } else if (k === "t") {
    const list = Object.keys(TIMES);
    setTime(list[(list.indexOf(state.time) + 1) % list.length] as string);
  } else if (k === "y") {
    const list = [0, 0.7, Math.PI / 2, Math.PI];
    setYaw(list[(list.findIndex((a) => Math.abs(a - state.yaw) < 1e-3) + 1) % list.length] as number);
  } else if (k === "l") document.body.classList.toggle("nolabels");
  else if (k === "h") document.body.classList.toggle("clean");
  refresh();
});
if (q.has("clean")) document.body.classList.add("clean");
if (q.has("nolabels")) document.body.classList.add("nolabels");

const statsEl = document.getElementById("stats") as HTMLElement;
const statsText = () => {
  const lines = [
    `build (first, ms): traveler ${travMs.toFixed(1)} · campesina ${campMs.toFixed(1)} · llama ${llamaMs.toFixed(1)}`,
  ];
  for (const s of slots)
    if (s.nc) {
      const st = s.nc.stats;
      lines.push(`${s.key}: body ${st.bodyTris} tris, cloth ${st.clothTris} tris, geo ${st.ms.toFixed(1)} ms`);
    }
  lines.push(`draw calls (all passes): ${renderer.info.render.calls}`);
  return lines.join("\n");
};

// ---------------------------------------------------------------- frame
let clock = 0;
engine.onFrame((dt) => {
  if (state.paused) dt = 0;
  clock += dt;
  sky.update(dt, camera, focus, true);
  engine.outline.uniforms.uInk.value.copy(sky.ink);
  style.update(dt, clock);
  for (const s of slots) s.update(dt, clock);
  controls.update();
  placeLabels();
  if (Math.floor(clock * 2) !== Math.floor((clock - dt) * 2)) statsEl.textContent = statsText();
});

// ---------------------------------------------------------------- screenshot hook
const api = {
  ready: true,
  slots: () => slots.map((s) => s.key),
  setMode: (m: Mode) => {
    state.mode = m;
    refresh();
  },
  setExpression: (e: Expression) => {
    state.expression = e;
    refresh();
  },
  setTime,
  setYaw,
  setInk,
  setWire,
  setRM,
  /** Freeze every new character's gait at a phase (null = free). */
  hold: (p: number | null) => {
    for (const s of slots) s.nc?.hold(p);
  },
  pause: (on: boolean) => (state.paused = on),
  /** Camera: look at slot `key` (or the lineup centre) from distance d, height h, orbit angle a. */
  view: (key: string | null, d = 9.2, h = 1.7, a = 0, ty = 0.95) => {
    const s = slots.find((x) => x.key === key);
    const cx = s ? s.x : 0;
    controls.target.set(cx, (s ? heightAt(cx, Z) : 0) + ty, Z);
    camera.position.set(cx + Math.sin(a) * d, h, Z + Math.cos(a) * d);
    camera.lookAt(controls.target);
    controls.update();
  },
  /** Camera on one bone of a slot's character (face close-ups). */
  viewBone: (key: string, bone: string, d = 1.2, dy = 0.05, a = 0) => {
    const s = slots.find((x) => x.key === key);
    const b = s?.nc?.inst.bones[bone];
    if (!b) return;
    b.getWorldPosition(controls.target);
    camera.position.set(
      controls.target.x + Math.sin(a) * d,
      controls.target.y + dy,
      controls.target.z + Math.cos(a) * d,
    );
    camera.lookAt(controls.target);
    controls.update();
  },
  stats: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    chars: slots.filter((s) => s.nc).map((s) => ({ key: s.key, ...s.nc?.stats })),
    travMs,
    campMs,
    llamaMs,
  }),
};
(window as unknown as { __chars: typeof api }).__chars = api;
