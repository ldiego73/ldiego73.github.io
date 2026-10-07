/**
 * Dev harness for the jungle scenery alone (no avatar, no ambients):
 *   bunx vite --config src/world/selva/scenery-dev/vite.config.ts --port 5204
 * Query: `q=low|high` (default high), `cells=` (default as the runtime: 280 high, 190 low, 160 phone),
 * `device=phone`, `time=0..1` (sky time), `haze=0..1` (sky weather fog, default the runtime's 0.24),
 * `hide=1` (scenery hidden: sky-only baseline).
 *
 * Renders the real layout with the real engine (toon + ink outline + FXAA), the mountain sky (sun, fog,
 * shadows) and the detail-cull, so draw calls match the runtime closely. `renderer.info` is summed over every
 * pass of a frame (color, ink prepass, shadows, post) because the composer resets it per render call.
 * Fly: WASD / QE (up, down), Shift fast, drag to look. Screenshots drive `window.__sc` (see shots.mjs).
 */
import * as THREE from "three";
import { createDetailCull } from "../../detail-cull";
import { createEngine } from "../../engine";
import { detectDevice } from "../../quality";
import { createSky } from "../../sky";
import { createToonCache } from "../../toon";
import type { SelvaEnv } from "../contract";
import { buildSelvaLayout } from "../layout";
import { createSelvaScenery } from "../scenery";

const q = new URLSearchParams(location.search);
const quality = q.get("q") === "low" ? "low" : "high";
const cells = Number(q.get("cells")) || (quality === "high" ? 280 : detectDevice().phone ? 160 : 190);
const host = document.getElementById("world") as HTMLElement;
const statsEl = document.getElementById("stats") as HTMLElement;

const engine = createEngine(host, { quality });
const { renderer, scene, camera } = engine;
renderer.info.autoReset = false;
const toon = createToonCache();
const sky = createSky(scene, { reducedMotion: false, quality });
sky.sky.setTime(Number(q.get("time") ?? 0.42));
// Same air as the runtime (selva/index.ts): weather haze 0.24 / 0.12, greener and denser fog, ink fade 90..400.
const haze = Number(q.get("haze") ?? 0.24);
const HAZE_GREEN = new THREE.Color("#c9dcb0");
if ("setWeather" in sky.sky) (sky.sky as unknown as { setWeather(f: number, c: number): void }).setWeather(haze, 0.12);

const t0 = performance.now();
const layout = buildSelvaLayout({ cells });
const t1 = performance.now();
const scenery = createSelvaScenery(layout, toon, quality);
const t2 = performance.now();
scene.add(scenery.group);
if (q.get("hide") === "1") scenery.group.visible = false;
const cull = createDetailCull(scene);
cull.scan();
engine.outline.uniforms.uFade.value.set(90, 400);

const env = {
  camera,
  scene,
  sky: sky.sky,
  reducedMotion: false,
  quality,
} as unknown as SelvaEnv;

// ---------------------------------------------------------------- camera
const pos = new THREE.Vector3();
let yaw = 0;
let pitch = 0;
const focus = new THREE.Vector3();
const keys = new Set<string>();
const applyCam = () => {
  camera.position.copy(pos);
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  camera.lookAt(focus.copy(pos).addScaledVector(dir, 12));
};
/** Camera on the road at t, `side` metres to the right, `h` above the walkable ground, looking along the road. */
const road = (t: number, side = 0, h = 2.2, back = false, pitchDeg = -4) => {
  const p = layout.trail.pointAt(t);
  const tg = layout.trail.tangentAt(t).setY(0).normalize();
  pos.set(p.x - tg.z * side, 0, p.z + tg.x * side);
  pos.y = layout.groundAt(pos.x, pos.z) + h;
  yaw = Math.atan2(tg.z, tg.x) + (back ? Math.PI : 0);
  pitch = THREE.MathUtils.degToRad(pitchDeg);
  applyCam();
};
const look = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
  pos.set(x, y, z);
  const d = new THREE.Vector3(tx - x, ty - y, tz - z).normalize();
  yaw = Math.atan2(d.z, d.x);
  pitch = Math.asin(d.y);
  applyCam();
};
road(Number(q.get("t") ?? 0.1));
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));
let drag: { x: number; y: number } | null = null;
window.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
window.addEventListener("pointerup", () => (drag = null));
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag.x) * 0.004;
  pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.004, -1.5, 1.5);
  drag = { x: e.clientX, y: e.clientY };
  applyCam();
});

// ---------------------------------------------------------------- frame
const last = { calls: 0, tris: 0 };
const nightOf = (time: number) => {
  const e = Math.sin((time - 0.25) * Math.PI * 2);
  return THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
};
let frames = 0;
engine.onFrame((dt, t) => {
  // Previous frame's totals across every pass, then start counting this one.
  last.calls = renderer.info.render.calls;
  last.tris = renderer.info.render.triangles;
  renderer.info.reset();
  if (keys.size) {
    const sp = (keys.has("ShiftLeft") ? 40 : 10) * dt;
    const f = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    if (keys.has("KeyW")) pos.addScaledVector(f, sp);
    if (keys.has("KeyS")) pos.addScaledVector(f, -sp);
    if (keys.has("KeyD")) pos.addScaledVector(r, sp);
    if (keys.has("KeyA")) pos.addScaledVector(r, -sp);
    if (keys.has("KeyE")) pos.y += sp;
    if (keys.has("KeyQ")) pos.y -= sp;
    applyCam();
  }
  sky.update(dt, camera, focus, true);
  const night = nightOf(sky.sky.time());
  sky.fog.color.lerp(HAZE_GREEN, 0.38 * (1 - night));
  sky.fog.near *= 0.75;
  sky.fog.far *= 0.8;
  engine.outline.uniforms.uInk.value.copy(sky.ink);
  scenery.setNight?.(night);
  scenery.update(dt, t, env);
  cull.update(camera.position);
  if (++frames % 15 === 0)
    statsEl.textContent = `${quality} cells ${cells}  calls ${last.calls}  tris ${(last.tris / 1000).toFixed(0)}k\nbuild layout ${(t1 - t0).toFixed(0)} ms, scenery ${(t2 - t1).toFixed(0)} ms  colliders ${layout.colliders.length}`;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = {
  road,
  look,
  time: (t: number) => sky.sky.setTime(t),
  haze: (f: number) => (sky.sky as unknown as { setWeather(f: number, c: number): void }).setWeather(f, 0.12),
  /** Frame totals; `color` re-measures with the ink prepass and shadows off (color pass + post only). */
  async stats() {
    await sleep(400);
    const all = { ...last };
    engine.outline.enabled = false;
    renderer.shadowMap.enabled = false;
    await sleep(300);
    const color = { ...last };
    engine.outline.enabled = true;
    renderer.shadowMap.enabled = quality === "high";
    await sleep(200);
    return { all, color, colliders: layout.colliders.length, build: { layout: t1 - t0, scenery: t2 - t1 } };
  },
  /** Meshes in view (frustum, visible, on a drawn layer): draws and triangles per name, color pass only. */
  breakdown() {
    const fr = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const out: Record<string, { draws: number; tris: number; shadow: number }> = {};
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.layers.mask === 0) return;
      if (m.frustumCulled && !fr.intersectsObject(m)) return;
      const g = m.geometry;
      const n = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      const key = m.name || m.type;
      out[key] ??= { draws: 0, tris: 0, shadow: 0 };
      const e = out[key];
      e.draws++;
      e.tris += n * inst;
      if (m.castShadow) e.shadow++;
    });
    return out;
  },
  layout,
  scene,
  camera,
};
(window as unknown as { __sc: typeof api }).__sc = api;
