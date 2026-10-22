/**
 * Characters harness: the human archetypes, the traveler's outfits, the action catalogue and a crowd stress
 * test, on a trailhead meadow in the mountain's style.
 *   bunx vite --config src/world/characters/dev/vite.config.ts --port 5261
 * Views (?view=): lineup (every preset), outfits (the traveler's five), actions (one person per action, crowd
 * renderer), crowd (?n=60 people walking about, LOD by distance), lod (one archetype at LOD 0 / 1 / 2).
 * Keys: 1 idle · 2 walk · 3 run · I ink · W wireframe · R reduced motion · E expression · T time of day ·
 *       Y turn the lineup · L labels · H hide the UI.
 * Query: ?mode=walk&time=dusk&yaw=0.7&rm=1&clean=1. Screenshot hook: window.__chars (see the bottom).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildPasoHorse } from "../../ambient/mount/horse";
import { saddledLlamaMount } from "../../ambient/mount/llama";
import { buildSaddledMule } from "../../ambient/mount/mule";
import { buildQuad } from "../../ambient/mount/quad";
import type { MountModel } from "../../ambient/mount/ride";
import type { WorldEnv } from "../../contract";
import { createEngine } from "../../engine";
import { createSky } from "../../sky";
import { createWorldStyle, type WorldStyleOptions } from "../../style-runtime";
import { createToonCache, noOutline } from "../../toon";
import { liveWind } from "../../wind";
import {
  ACTIONS,
  type Action,
  createHuman,
  dress,
  type Expression,
  type Human,
  HumanAnimator,
  HumanCrowd,
  type HumanSpec,
  type Lod,
  type Mode,
  PEOPLE,
  pipelineStats,
  prefetchHumans,
  TRAVELER,
  TRAVELER_DRESS,
  wardrobe,
} from "../index";
import { HeldProps, type PropKind } from "../props";
import { createStage, heightAt } from "./stage";

const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "lineup";
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

const rng = (() => {
  let s = 4242;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
})();

// ---------------------------------------------------------------- slots (lineup / outfits / lod)
interface Slot {
  key: string;
  label: string;
  x: number;
  z: number;
  h?: Human;
  update(dt: number, t: number): void;
}
const slots: Slot[] = [];
const Z = 0.2;

function windAt(g: THREE.Object3D) {
  const w = liveWind.sample(g.position.x, g.position.z);
  const c = Math.cos(g.rotation.y);
  const s = Math.sin(g.rotation.y);
  return { windX: c * w.x - s * w.z, windZ: s * w.x + c * w.z };
}

function addHuman(key: string, label: string, spec: HumanSpec, pal: string[], x: number, z = Z, lod: Lod = 0) {
  const h = createHuman(spec, pal, { lod, seed: slots.length * 1.7 });
  scene.add(h.group);
  const slot: Slot = {
    key,
    label,
    x,
    z,
    h,
    update: (dt, t) =>
      h.update(dt, t, { mode: state.mode, rm: state.rm, expression: state.expression, ...windAt(h.group) }),
  };
  slots.push(slot);
  return slot;
}

const people = Object.entries(PEOPLE) as Array<[string, HumanSpec]>;
const outfits = Object.entries(TRAVELER) as Array<[keyof typeof TRAVELER, HumanSpec]>;
function palFor(name: string, spec: HumanSpec): string[] {
  if (name.startsWith("dancer"))
    return dress(spec.sex === "f" ? wardrobe.andeanWoman(rng, true) : wardrobe.andeanMan(rng, true));
  if (/comuner|river|swimmer/.test(name))
    return dress(spec.sex === "f" ? wardrobe.amazonWoman(rng) : wardrobe.amazonMan(rng));
  if (/pescador|vendedora|surfer/.test(name))
    return dress(spec.sex === "f" ? wardrobe.coastWoman(rng) : wardrobe.coastMan(rng));
  if (/hiker/.test(name)) return dress(wardrobe.traveller(rng));
  return dress(spec.sex === "f" ? wardrobe.andeanWoman(rng) : wardrobe.andeanMan(rng));
}

let crowd: HumanCrowd | null = null;
const props = new HeldProps(64);
scene.add(props.group);
interface Walker {
  m: ReturnType<HumanCrowd["add"]>;
  anim: HumanAnimator;
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  speed: number;
  action: Action;
  label?: string;
}
const walkers: Walker[] = [];

if (view === "lineup") {
  const cols = 8;
  people.forEach(([name, spec], i) => {
    const row = Math.floor(i / cols);
    addHuman(name, name, spec, palFor(name, spec), ((i % cols) - (cols - 1) / 2) * 1.5, Z - row * 2.4);
  });
} else if (view === "outfits") {
  outfits.forEach(([name, spec], i) => {
    addHuman(`traveler-${name}`, name, spec, dress(TRAVELER_DRESS[name]), (i - 2) * 1.3);
  });
} else if (view === "ride") {
  // The traveler on each road mount, as the runtime places a rider: feet origin at the mount's seatHeight.
  const env = { scene, toon: toon.toon, noOutline, reducedMotion: false, lang: "es", heightAt } as unknown as WorldEnv;
  const mounts: Array<[string, () => MountModel]> = [
    ["horse", () => buildPasoHorse(env)],
    ["mule", () => buildSaddledMule(env)],
    ["llama", () => saddledLlamaMount(env)],
    ["quad", () => buildQuad(env)],
  ];
  mounts.forEach(([name, make], i) => {
    const m = make();
    const x = (i - 1.5) * 2.4;
    scene.add(m.group);
    const slot = addHuman(`ride-${name}`, name, TRAVELER.andean, dress(TRAVELER_DRESS.andean), x);
    const h = slot.h as Human;
    h.anim.act("ride", { fade: 0 });
    const base = slot.update;
    slot.update = (dt, t) => {
      const sp = state.mode === "walk" ? 1.4 : state.mode === "run" ? 3.6 : 0;
      m.group.position.set(slot.x, heightAt(slot.x, slot.z), slot.z);
      m.group.rotation.y = state.yaw;
      m.animate({ speed: sp, look: 0, t, dt, rm: state.rm });
      h.group.position.set(slot.x, heightAt(slot.x, slot.z) + m.seatHeight, slot.z);
      h.group.rotation.y = state.yaw;
      h.update(dt, t, { speed: 0, rm: state.rm, expression: state.expression });
      void base;
    };
  });
} else if (view === "lod") {
  const which = (q.get("who") as keyof typeof PEOPLE) ?? "campesina";
  const spec = (which in PEOPLE ? PEOPLE[which] : TRAVELER.andean) as HumanSpec;
  const pal = which in PEOPLE ? palFor(which, spec) : dress(TRAVELER_DRESS.andean);
  ([0, 1, 2] as const).forEach((l, i) => {
    addHuman(`lod${l}`, `LOD ${l}`, spec, pal, (i - 1) * 1.3, Z, l);
  });
} else if (view === "actions" || view === "crowd") {
  const isActions = view === "actions";
  const list = isActions ? ACTIONS.filter((a) => a !== "none") : [];
  const n = isActions ? list.length : Number(q.get("n") ?? 60);
  crowd = new HumanCrowd({ capacity: n + 4, name: "dev:crowd" });
  scene.add(crowd.group);
  const picks = people.filter(([k]) => !k.startsWith("swimmer"));
  const PROP_FOR: Partial<Record<Action, PropKind>> = {
    plough: "chakitaqlla",
    herd: "staff",
    "carry-hand": "basket-hand",
    "carry-back": "qipi",
    "carry-shoulder": "bananas",
    dance: "panuelo",
    drink: "cup",
    stir: "ladle",
    spin: "pushka",
    knit: "knitting",
    paddle: "paddle",
    row: "paddle",
    pole: "pole",
    "fish-cast": "net",
    "tend-fire": "stick",
    paint: "brush",
    photo: "camera",
    "whip-circle": "whip",
    "hold-up": "phone",
  };
  for (let i = 0; i < n; i++) {
    const action = (isActions ? list[i] : "none") as Action;
    let name: string;
    let spec: HumanSpec;
    if (isActions) {
      const kidish = ["hop", "kick", "jump", "swim", "giggle"].includes(action);
      name =
        action === "swim"
          ? "swimmer"
          : kidish
            ? i % 2
              ? "wawaBoy"
              : "wawaGirl"
            : (picks[i % picks.length]?.[0] as string);
      spec = PEOPLE[name as keyof typeof PEOPLE] as HumanSpec;
    } else {
      const p = picks[Math.floor(rng() * picks.length)] as [string, HumanSpec];
      name = p[0];
      spec = p[1];
    }
    const m = crowd.add(spec, palFor(name, spec), { scale: 0.96 + rng() * 0.08 });
    const anim = new HumanAnimator(m, m.meta.style, { seed: i * 1.37 });
    const cols = 8;
    const x = isActions ? ((i % cols) - (cols - 1) / 2) * 1.5 : (rng() - 0.5) * 30;
    const z = isActions ? Z - Math.floor(i / cols) * 2.0 : -rng() * 30 + 4;
    const w: Walker = { m, anim, x, z, yaw: 0, tx: x, tz: z, speed: 0, action, label: action };
    if (isActions) {
      anim.act(action, { fade: 0, seat: action === "sit-bench" ? 0.42 : 0 });
      const pk = PROP_FOR[action];
      if (pk) props.attach(m, pk, "#3446a6");
    }
    walkers.push(w);
  }
}
prefetchHumans(view === "outfits" ? outfits.map((o) => o[1]) : people.map((p) => p[1]));

function placeAll() {
  if (view === "ride") return;
  for (const s of slots)
    if (s.h) {
      s.h.group.position.set(s.x, heightAt(s.x, s.z), s.z);
      s.h.group.rotation.y = state.yaw;
    }
}
placeAll();

// ---------------------------------------------------------------- style, sky, camera
const focus = new THREE.Vector3(0, 0, Z);
const styleOpts: WorldStyleOptions = { world: "qhapaq", engine, sky, reducedMotion: state.rm, focus, noPaint: [] };
const style = createWorldStyle(styleOpts);
const TIMES: Record<string, number> = { day: 0.42, dusk: 0.735, night: 0.9 };
const setTime = (k: string) => {
  state.time = k;
  sky.sky.setTime(TIMES[k] ?? 0.42);
};
setTime(state.time);

camera.position.set(0, 1.7, view === "crowd" ? 16 : view === "actions" ? 13 : 9.2);
const controls = new OrbitControls(camera, engine.canvas);
controls.target.set(0, 0.95, view === "actions" ? -3 : Z);
controls.enableDamping = true;
controls.update();

// ---------------------------------------------------------------- labels, UI, stats
const labels = document.getElementById("labels") as HTMLElement;
const tagSlots = [
  ...slots.map((s) => ({ label: s.label, pos: () => new THREE.Vector3(s.x, heightAt(s.x, s.z) - 0.12, s.z + 0.5) })),
];
if (view === "actions")
  for (const w of walkers)
    tagSlots.push({ label: w.label ?? "", pos: () => new THREE.Vector3(w.x, heightAt(w.x, w.z) - 0.1, w.z + 0.6) });
const tags = tagSlots.map((s) => {
  const el = document.createElement("span");
  el.textContent = s.label;
  el.className = "new";
  labels.appendChild(el);
  return el;
});
const tmp = new THREE.Vector3();
function placeLabels() {
  const { w, h } = engine.size();
  tagSlots.forEach((s, i) => {
    tmp.copy(s.pos()).project(camera);
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
for (const v of ["lineup", "outfits", "actions", "crowd", "lod", "ride"])
  button(
    "view",
    v,
    () => view === v,
    () => {
      q.set("view", v);
      location.search = q.toString();
    },
  );
sep();
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
refresh();

function setInk(on: boolean) {
  state.ink = on;
  engine.outline.enabled = on;
}
function setWire(on: boolean) {
  state.wire = on;
  scene.traverse((o) => {
    if (!o.name.startsWith("character") && !o.name.startsWith("dev:crowd")) return;
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
  const p = pipelineStats();
  const lines = [
    `builds: worker ${p.worker} (${p.worker ? (p.workerMs / p.worker).toFixed(0) : 0} ms avg) · main ${p.main} (${p.main ? (p.mainMs / p.main).toFixed(0) : 0} ms avg) · queued ${p.queued}`,
  ];
  if (crowd) lines.push(`crowd: ${JSON.stringify(crowd.stats())}`);
  for (const s of slots.slice(0, 6)) if (s.h) lines.push(`${s.key}: LOD ${s.h.lod}`);
  lines.push(`draw calls (all passes): ${renderer.info.render.calls} · tris ${renderer.info.render.triangles}`);
  return lines.join("\n");
};

// ---------------------------------------------------------------- frame
let clock = 0;
const local = new THREE.Vector3();
let frameMs = 0;
engine.onFrame((dt) => {
  const f0 = performance.now();
  if (state.paused) dt = 0;
  clock += dt;
  sky.update(dt, camera, focus, true);
  engine.outline.uniforms.uInk.value.copy(sky.ink);
  style.update(dt, clock);
  for (const s of slots) s.update(dt, clock);
  if (crowd) {
    for (const w of walkers) {
      if (view === "crowd") {
        // Wander between random spots, now and then stopping to talk or wave.
        const d = Math.hypot(w.tx - w.x, w.tz - w.z);
        if (d < 0.4) {
          w.tx = (rng() - 0.5) * 30;
          w.tz = -rng() * 30 + 4;
          if (rng() < 0.3) w.anim.act(rng() < 0.5 ? "talk" : "wave", { fade: 0.3 });
          else w.anim.act("none");
        }
        const want = d < 0.4 ? 0 : (w.m.meta.style.walkSpeed ?? 1.2) * (state.mode === "run" ? 2.5 : 1);
        w.speed += (want - w.speed) * Math.min(1, dt * 3);
        const a = Math.atan2(w.tx - w.x, w.tz - w.z);
        let da = a - w.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        w.yaw += da * Math.min(1, dt * 4);
        w.x += Math.sin(w.yaw) * w.speed * dt;
        w.z += Math.cos(w.yaw) * w.speed * dt;
      }
      const y = heightAt(w.x, w.z);
      w.m.place(w.x, y + (w.action === "swim" ? 0.18 : 0), w.z, view === "actions" ? state.yaw : w.yaw);
      // Look at the camera when close (the traveler stand-in).
      local
        .copy(camera.position)
        .sub(w.m.position)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -w.m.yaw);
      w.anim.look(view === "crowd" && local.length() < 8 ? local : null);
      w.anim.update(dt, clock, {
        speed: view === "actions" ? (state.mode === "walk" ? 1.1 : state.mode === "run" ? 3 : 0) : w.speed,
        rm: state.rm,
        expression: state.expression,
      });
      w.m.commit();
    }
    crowd.update(camera);
    props.update();
  }
  controls.update();
  placeLabels();
  frameMs = frameMs * 0.95 + (performance.now() - f0) * 0.05;
  if (Math.floor(clock * 2) !== Math.floor((clock - dt) * 2))
    statsEl.textContent = `${statsText()}\nframe cpu ${frameMs.toFixed(1)} ms`;
});

// ---------------------------------------------------------------- screenshot hook
const api = {
  ready: true,
  which: view,
  slots: () => slots.map((s) => s.key),
  allBuilt: () =>
    pipelineStats().queued === 0 &&
    pipelineStats().running === 0 &&
    slots.every((s) => !s.h || s.h.lod === 0 || s.key.startsWith("lod")),
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
  hold: (p: number | null) => {
    for (const s of slots) if (s.h) s.h.anim.hold = p;
    for (const w of walkers) w.anim.hold = p;
  },
  act: (a: Action) => {
    for (const s of slots) s.h?.anim.act(a, { fade: 0.2 });
  },
  pause: (on: boolean) => (state.paused = on),
  /** Camera: look at slot `key` (or the centre) from distance d, height h, orbit angle a. */
  view: (key: string | null, d = 9.2, h = 1.7, a = 0, ty = 0.95, tz = Z) => {
    const s = slots.find((x) => x.key === key);
    const cx = s ? s.x : 0;
    const cz = s ? s.z : tz;
    controls.target.set(cx, (s ? heightAt(cx, cz) : 0) + ty, cz);
    camera.position.set(cx + Math.sin(a) * d, h, cz + Math.cos(a) * d);
    camera.lookAt(controls.target);
    controls.update();
  },
  /** Camera on a walker (actions view) by index. */
  viewWalker: (i: number, d = 3, h = 1.4, a = 0.4, ty = 0.8) => {
    const w = walkers[i];
    if (!w) return;
    // Solo: hide everyone else (and their props) so the pose reads on its own.
    walkers.forEach((o, k) => {
      o.m.show(k === i);
    });
    controls.target.set(w.x, heightAt(w.x, w.z) + ty, w.z);
    camera.position.set(w.x + Math.sin(a) * d, heightAt(w.x, w.z) + h, w.z + Math.cos(a) * d);
    camera.lookAt(controls.target);
    controls.update();
  },
  viewBone: (key: string, bone: string, d = 1.2, dy = 0.05, a = 0) => {
    const s = slots.find((x) => x.key === key);
    const b = s?.h?.inst.bones[bone];
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
    frameMs,
    pipeline: pipelineStats(),
    crowd: crowd?.stats() ?? null,
    lods: slots.map((s) => [s.key, s.h?.lod]),
  }),
};
(window as unknown as { __chars: typeof api }).__chars = api;
