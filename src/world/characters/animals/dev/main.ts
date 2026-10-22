/**
 * Animals harness: every species in a lineup (old model where one exists, in grey labels, next to the new one
 * in red), gait strips (one species frozen at evenly spaced phases), LOD comparison, instanced crowds and the
 * ride mounts, on a small meadow in the mountain's style (STYLES.qhapaq, the shared sky and ink).
 *
 *   bunx vite --config src/world/characters/animals/dev/vite.config.ts --port 5262
 *   ?view=lineup&group=camelids&mode=idle|walk|run|fly   the lineup (group: see GROUPS; all when absent)
 *   ?view=strip&species=horse&mode=run&n=8               gait strip
 *   ?view=lod&species=llama                              LOD 0 / 1 / 2 (W toggles wireframe)
 *   ?view=crowd&species=vicuna&n=40                      instanced herd (draw calls in the stats)
 *   ?view=ride                                           the ride mounts (old and new)
 * Keys: 1 idle · 2 walk · 3 run · 4 fly · I ink · W wireframe · R reduced motion · T time · L labels · H hide UI.
 * Screenshot hook: window.__animals (bottom of the file).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createEngine } from "../../../engine";
import { createSky } from "../../../sky";
import { createWorldStyle } from "../../../style-runtime";
import { createToonCache } from "../../../toon";
import { liveWind } from "../../../wind";
import { type Animal, type AnimalMode, createAnimal } from "../animal";
import type { IdleAction } from "../behaviour";
import { createHerd, type Herd } from "../crowd";
import type { Lod } from "../lod";
import { SPECIES, type SpeciesKey } from "../species";
import { NEW_PARTS, OLD } from "./old";
import { rideLineup } from "./ride";

const q = new URLSearchParams(location.search);
const host = document.getElementById("world") as HTMLElement;
const engine = createEngine(host, { quality: "high" });
engine.camera.near = 0.02;
engine.camera.updateProjectionMatrix();
const { scene, camera, renderer } = engine;
const toon = createToonCache();
const state = {
  view: q.get("view") ?? "lineup",
  mode: q.get("mode") ?? "idle",
  rm: q.get("rm") === "1",
  time: q.get("time") ?? "day",
  wire: false,
  paused: false,
};
const sky = createSky(scene, { reducedMotion: state.rm, quality: "high" });

export const GROUPS: Record<string, SpeciesKey[]> = {
  camelids: ["llama", "alpaca", "vicuna", "guanaco"],
  equids: ["horse", "mule", "donkey"],
  carnivores: ["puma", "jaguar", "fox", "bear"],
  rodents: ["vizcacha", "capybara", "agouti", "cuy"],
  birds: ["condor", "macaw", "toucan", "hummingbird", "hoatzin"],
  seabirds: ["pelican", "guanay", "gull", "penguin"],
  waterbirds: ["heron", "flamingo", "grebe", "duck"],
  smallbirds: ["dove", "sparrow", "tinamou"],
  marine: ["sea-lion", "bufeo", "trout"],
  reptiles: ["caiman", "taricaya", "iguana", "lizard", "frog"],
  forest: ["sajino", "tapir", "taruca", "squirrel-monkey", "sloth"],
};
const allKeys = Object.keys(SPECIES) as SpeciesKey[];
for (const k of allKeys)
  if (!Object.values(GROUPS).some((g) => g.includes(k))) {
    GROUPS.other ??= [];
    GROUPS.other.push(k);
  }

// ---------------------------------------------------------------- stage
const ground = (() => {
  const g = new THREE.PlaneGeometry(200, 200, 100, 100);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color("#86ad6c");
  const b = new THREE.Color("#a5b66e");
  const soil = new THREE.Color("#b49266");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const back = Math.max(0, -z - 25);
    pos.setY(i, back * back * 0.02);
    c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.2));
    c.lerp(soil, Math.min(1, Math.exp(-(z * z) / 30) * 0.8));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon.vertexToon());
  m.receiveShadow = true;
  scene.add(m);
  return m;
})();
void ground;

// ---------------------------------------------------------------- items
interface Item {
  key: string;
  label: string;
  isNew: boolean;
  obj: THREE.Object3D;
  animal?: Animal;
  lift: number;
  update(dt: number, t: number): void;
}
const items: Item[] = [];
const herds: Herd[] = [];

function speedFor(key: SpeciesKey) {
  const sp = SPECIES[key];
  if (state.mode === "walk") return sp.speeds.walk;
  if (state.mode === "run" || state.mode === "fly") return sp.speeds.run;
  return 0;
}

function animalItem(key: SpeciesKey, x: number, z: number, o: { lod?: Lod; variant?: string; seed?: number } = {}) {
  const sp = SPECIES[key];
  const a = createAnimal(key, { lod: o.lod ?? 0, variant: o.variant, seed: o.seed ?? 1 });
  scene.add(a.group);
  const fly = sp.family === "bird" && state.mode === "fly";
  const lift = fly ? Math.max(1.2, sp.size * 0.8) : 0;
  a.group.position.set(x, lift, z);
  a.group.rotation.y = Number(q.get("yaw") ?? 0.9);
  const it: Item = {
    key,
    label: `${sp.name.en}${o.lod !== undefined ? ` LOD${o.lod}` : ""}${o.variant ? ` ${o.variant}` : ""}`,
    isNew: true,
    obj: a.group,
    animal: a,
    lift,
    update(dt, t) {
      const g = a.group;
      const w = liveWind.sample(g.position.x, g.position.z);
      const swim = sp.family === "swim" && !(sp.motion.kind === "swim" && sp.motion.land && state.mode === "idle");
      a.update(dt, t, {
        ...(q.get("amode") ? { mode: q.get("amode") as AnimalMode } : {}),
        quiet: true,
        speed: speedFor(key),
        rm: state.rm,
        windX: w.x,
        grounded: !fly && !swim,
        water: swim,
        vy: 0,
        height: lift,
      });
    },
  };
  items.push(it);
  return it;
}

function oldItem(key: string, x: number, z: number) {
  const b = OLD[key];
  if (!b) return null;
  const obj = b(toon, scene);
  obj.position.x += x;
  obj.position.z += z;
  obj.rotation.y = Number(q.get("yaw") ?? 0.9);
  scene.add(obj);
  const it: Item = { key: `old-${key}`, label: `old ${key}`, isNew: false, obj, lift: 0, update() {} };
  items.push(it);
  return it;
}

const STATS: string[] = [];
function lineup() {
  const g = q.get("group");
  const keys = (g ? (GROUPS[g] ?? []) : allKeys).filter((k) => !q.get("only") || q.get("only")?.split(",").includes(k));
  let x = 0;
  const xs: number[] = [];
  for (const k of keys) {
    const s = SPECIES[k];
    const w = Math.max(0.7, s.size * 0.9);
    x += w / 2;
    xs.push(x);
    x += w / 2 + 0.4;
  }
  const off = x / 2;
  keys.forEach((k, i) => {
    const cx = (xs[i] as number) - off;
    const t0 = performance.now();
    animalItem(k, cx, 0.5, { seed: i + 1 });
    STATS.push(`${k}: ${(performance.now() - t0).toFixed(0)} ms`);
    oldItem(k, cx, -Math.max(1.2, SPECIES[k].size * 1.1));
  });
  return x;
}

function strip() {
  const key = (q.get("species") ?? "llama") as SpeciesKey;
  const n = Number(q.get("n") ?? 8);
  const sp = SPECIES[key];
  const w = sp.size * 0.9;
  for (let i = 0; i < n; i++) {
    const it = animalItem(key, (i - (n - 1) / 2) * w, 0.5, { seed: 1 });
    it.label = `${(i / n).toFixed(2)}`;
    it.animal?.hold(i / n);
  }
  return n * w;
}

function lods() {
  const key = (q.get("species") ?? "llama") as SpeciesKey;
  const sp = SPECIES[key];
  ([0, 1, 2] as Lod[]).forEach((l, i) => {
    const it = animalItem(key, (i - 1) * sp.size * 1.1, 0.5, { lod: l, seed: 2 });
    const st = it.animal?.inst.body.geometry.index?.count ?? 0;
    it.label = `LOD${l} · ${Math.round(st / 3)} tris`;
  });
  const variants = Object.keys(sp.variants ?? {});
  variants.forEach((v, i) => {
    animalItem(key, (i - (variants.length - 1) / 2) * sp.size * 1.1, -sp.size * 1.6, { variant: v, seed: 5 + i });
  });
  return sp.size * 4;
}

function crowd() {
  const key = (q.get("species") ?? "vicuna") as SpeciesKey;
  const n = Number(q.get("n") ?? 40);
  const sp = SPECIES[key];
  const herd = createHerd(key, { max: n, variants: Object.keys(sp.variants ?? { default: [] }) });
  scene.add(herd.group);
  herds.push(herd);
  const side = Math.ceil(Math.sqrt(n));
  const sp0 = sp.size * 1.3;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(herd.add({ seed: i + 1, variant: i % 5 }));
  let t0 = 0;
  items.push({
    key: "herd",
    label: `herd ×${n}`,
    isNew: true,
    obj: herd.group,
    lift: 0,
    update(dt, t) {
      t0 += dt;
      ids.forEach((id, i) => {
        const gx = (i % side) - (side - 1) / 2;
        const gz = Math.floor(i / side) - (side - 1) / 2;
        const moving = state.mode !== "idle" && i % 3 !== 0;
        const sp1 = moving ? speedFor(key) : 0;
        const x = gx * sp0 * 2 + Math.sin(i * 1.7) * 0.6;
        const z = gz * sp0 * 3 + (moving ? ((t0 * sp1 + i * 2) % (sp0 * 3)) - sp0 * 1.5 : 0);
        herd.set(id, x, 0, z, moving ? 0 : i * 0.7, { speed: sp1, rm: state.rm });
      });
      herd.update(dt, t, camera);
    },
  });
  return side * sp0 * 2;
}

/** fauna-models.ts parts: the legacy snapshot (back row) and the current file (front row). */
function parts() {
  const keys = Object.keys(NEW_PARTS);
  keys.forEach((k, i) => {
    const x = (i - (keys.length - 1) / 2) * 2.2;
    oldItem(k, x, -1.6);
    const obj = (NEW_PARTS[k] as (typeof NEW_PARTS)[string])(toon, scene);
    obj.position.x += x;
    obj.position.z += 0.8;
    obj.rotation.y = Number(q.get("yaw") ?? 0.9);
    scene.add(obj);
    items.push({ key: `parts-${k}`, label: `fauna-models ${k}`, isNew: true, obj, lift: 0, update() {} });
  });
  return keys.length * 2.2;
}

let width = 8;
if (state.view === "strip") width = strip();
else if (state.view === "lod") width = lods();
else if (state.view === "crowd") width = crowd();
else if (state.view === "parts") width = parts();
else if (state.view === "ride") width = rideLineup(scene, toon, items, state);
else width = lineup();

// ---------------------------------------------------------------- style, sky, camera
const focus = new THREE.Vector3(0, 0, 0);
const style = createWorldStyle({ world: "qhapaq", engine, sky, reducedMotion: state.rm, focus, noPaint: [] });
const TIMES: Record<string, number> = { day: 0.42, dusk: 0.735, night: 0.9 };
const setTime = (k: string) => {
  state.time = k;
  sky.sky.setTime(TIMES[k] ?? 0.42);
};
setTime(state.time);
const fit = Math.max(2, width * 0.5);
camera.position.set(0, fit * 0.32 + 0.6, fit + 1.5);
const controls = new OrbitControls(camera, engine.canvas);
controls.target.set(0, 0.6, 0);
controls.update();

// ---------------------------------------------------------------- labels, UI, stats
const labels = document.getElementById("labels") as HTMLElement;
const tags = items.map((s) => {
  const el = document.createElement("span");
  el.textContent = s.label;
  if (s.isNew) el.className = "new";
  labels.appendChild(el);
  return el;
});
const tmp = new THREE.Vector3();
function placeLabels() {
  const { w, h } = engine.size();
  items.forEach((s, i) => {
    tmp.copy(s.obj.position);
    tmp.y -= s.lift + 0.1;
    tmp.project(camera);
    const el = tags[i] as HTMLElement;
    el.style.left = `${((tmp.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - tmp.y) / 2) * h}px`;
    el.style.display = tmp.z < 1 ? "" : "none";
  });
}
const ui = document.getElementById("ui") as HTMLElement;
const btn = (label: string, act: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", act);
  ui.appendChild(b);
};
for (const m of ["idle", "walk", "run", "fly"]) btn(m, () => (state.mode = m));
for (const k of Object.keys(TIMES)) btn(k, () => setTime(k));
btn("ink", () => (engine.outline.enabled = !engine.outline.enabled));
btn("wire", () => setWire(!state.wire));
btn("rm", () => (state.rm = !state.rm));
function setWire(on: boolean) {
  state.wire = on;
  for (const s of items)
    s.obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
      if (m && "wireframe" in m) m.wireframe = on;
    });
}
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "1") state.mode = "idle";
  else if (k === "2") state.mode = "walk";
  else if (k === "3") state.mode = "run";
  else if (k === "4") state.mode = "fly";
  else if (k === "i") engine.outline.enabled = !engine.outline.enabled;
  else if (k === "w") setWire(!state.wire);
  else if (k === "r") state.rm = !state.rm;
  else if (k === "l") document.body.classList.toggle("nolabels");
  else if (k === "h") document.body.classList.toggle("clean");
});
if (q.has("clean")) document.body.classList.add("clean");
if (q.has("nolabels")) document.body.classList.add("nolabels");
const statsEl = document.getElementById("stats") as HTMLElement;

let clock = 0;
// Count draw calls over every pass of a frame (colour, ink prepass, shadows), not just the last render call.
renderer.info.autoReset = false;
let frameCalls = 0;
let frameTris = 0;
engine.onFrame((dt) => {
  frameCalls = renderer.info.render.calls;
  frameTris = renderer.info.render.triangles;
  renderer.info.reset();
  if (state.paused) dt = 0;
  clock += dt;
  sky.update(dt, camera, focus, true);
  engine.outline.uniforms.uInk.value.copy(sky.ink);
  style.update(dt, clock);
  for (const s of items) s.update(dt, clock);
  controls.update();
  placeLabels();
  if (Math.floor(clock * 2) !== Math.floor((clock - dt) * 2))
    statsEl.textContent = `${STATS.join(" · ")}\ndraw calls (all passes) ${frameCalls} · tris ${frameTris}`;
});

const api = {
  ready: true,
  items: () => items.map((s) => s.key),
  setMode: (m: string) => (state.mode = m),
  setTime,
  setWire,
  setInk: (on: boolean) => (engine.outline.enabled = on),
  pause: (on: boolean) => (state.paused = on),
  /** Step the animals by `sec` seconds at 30 Hz without rendering (headless browsers draw slowly). */
  advance: (sec: number) => {
    for (let i = 0; i < sec * 30; i++) {
      clock += 1 / 30;
      for (const s of items) s.update(1 / 30, clock);
    }
  },
  hold: (p: number | null) => {
    for (const s of items) s.animal?.hold(p);
  },
  play: (a: Exclude<IdleAction, "none">) => {
    for (const s of items) s.animal?.anim.play(a);
  },
  /** Camera on a bone of an item (face close-ups): distance d, yaw a, height offset h. */
  bone: (key: string, bone: string, d = 0.8, a = 0.6, h = 0.05) => {
    const s = items.find((x) => x.key === key);
    const b = s?.animal?.inst.bones[bone];
    if (!b) return;
    b.getWorldPosition(controls.target);
    camera.position.set(
      controls.target.x + Math.sin(a) * d,
      controls.target.y + h,
      controls.target.z + Math.cos(a) * d,
    );
    camera.lookAt(controls.target);
    controls.update();
  },
  /** Camera from (x, y, z) at target (tx, ty, tz). */
  view: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    camera.position.set(x, y, z);
    controls.target.set(tx, ty, tz);
    camera.lookAt(controls.target);
    controls.update();
  },
  /** Camera framing one item by its size (3/4 view from the front-left). */
  focusSize: (key: string, k = 1.5) => {
    const s = items.find((x) => x.key === key);
    if (!s?.animal) return;
    const sz = s.animal.spec.size;
    api.focus(key, sz * k * 1.25, 0.4, sz * 0.12);
  },
  /** Camera on one item from distance d at yaw a, height h. */
  focus: (key: string, d = 3, a = 0.6, h = 0.8) => {
    const s = items.find((x) => x.key === key);
    if (!s) return;
    const p = s.obj.position;
    const ty = p.y + (s.animal ? s.animal.spec.size * 0.3 : 0.5);
    controls.target.set(p.x, ty, p.z);
    camera.position.set(p.x + Math.sin(a) * d, ty + h, p.z + Math.cos(a) * d);
    camera.lookAt(controls.target);
    controls.update();
  },
  states: () =>
    items
      .filter((s) => s.animal)
      .map((s) => {
        const f = (s.animal?.anim as unknown as { fsm?: { state: string; time: number } } | undefined)?.fsm;
        return `${s.key}:${f?.state ?? "-"}:${f?.time.toFixed(2) ?? ""}`;
      }),
  stats: () => ({
    calls: frameCalls,
    triangles: frameTris,
    build: STATS,
    herds: herds.map((h) => h.stats()),
  }),
};
(window as unknown as { __animals: typeof api }).__animals = api;
