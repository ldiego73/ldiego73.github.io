/** Dev harness for content: bunx vite --config src/world/content-dev/vite.config.ts --port 5192 */
import * as THREE from "three";
import { createAvatar } from "../avatar";
import { createContent, deckHeightAt, STATION_FOOTPRINT } from "../content";
import { STATIONS } from "../contract";
import { createMockEnv } from "./mock-env";

const q = new URLSearchParams(location.search);
const lang = q.get("lang") === "en" ? "en" : "es";
document.documentElement.lang = lang;
const host = document.getElementById("world")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
host.appendChild(renderer.domElement);
const hudRoot = document.createElement("div");
hudRoot.style.cssText = "position:absolute;inset:0;pointer-events:none";
host.appendChild(hudRoot);

const { env, outlineAll } = createMockEnv(lang, renderer, STATION_FOOTPRINT);
const avatar = createAvatar(env);
env.scene.add(avatar.group);
const content = createContent(env, hudRoot);
outlineAll(env.scene);
if (q.has("night")) env.sky.setTime(0.9);

// ---------- simple controller
const keys = new Set<string>();
const pos = env.trail.pointAt(0.03);
let yaw = 0;
let vy = 0;
let y = pos.y;
let grounded = true;
let camYaw = 0.6;
let camPitch = 0.32;
let camDist = 7;
let speed = 0;
let tour = false;
window.addEventListener("keydown", (e) => {
  if ((content as unknown as { gameOpen: boolean }).gameOpen) {
    if (e.code === "Escape") content.escape();
    return;
  }
  keys.add(e.code);
  if (e.code === "KeyE") content.interact();
  if (e.code === "Escape") content.escape();
  if (e.code === "KeyM") window.dispatchEvent(new Event("world:map"));
  if (e.code === "KeyH") window.dispatchEvent(new Event("world:help"));
  if (e.code === "KeyT") env.sky.setTime(env.sky.isNight() ? 0.45 : 0.9);
  if (e.code === "Space" && grounded) {
    vy = 6;
    grounded = false;
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
let drag: { x: number; y: number } | null = null;
window.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
window.addEventListener("pointerup", () => (drag = null));
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  camYaw -= (e.clientX - drag.x) * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - drag.y) * 0.003, 0.05, 1.2);
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener("wheel", (e) => (camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 3, 30)));
window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  env.camera.aspect = innerWidth / innerHeight;
  env.camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
let t = 0;
let paused = false;
window.addEventListener("world:game", (e) => (paused = (e as CustomEvent<{ open: boolean }>).detail.open));
let tourIdx = 0;
const groundAt = (x: number, z: number) => deckHeightAt(x, z) ?? env.heightAt(x, z);
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  if (!paused) {
    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    const running = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let dir = new THREE.Vector3();
    if (mx || mz) {
      tour = false;
      const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      dir = fwd.multiplyScalar(-mz).add(right.multiplyScalar(mx)).normalize();
    } else if (tour) {
      const stops = content.tourStops();
      const s = stops[tourIdx % stops.length]!.position;
      const d = new THREE.Vector3(s.x - pos.x, 0, s.z - pos.z);
      if (d.length() < 0.6) tourIdx++;
      else dir = d.normalize();
    }
    const target = dir.lengthSq() ? (running ? 6.5 : 3.2) : 0;
    speed += (target - speed) * Math.min(1, dt * 10);
    if (dir.lengthSq()) {
      yaw = Math.atan2(dir.x, dir.z);
      const nx = pos.x + dir.x * speed * dt;
      const nz = pos.z + dir.z * speed * dt;
      if (env.walkable(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
      } else if (env.walkable(nx, pos.z)) pos.x = nx;
      else if (env.walkable(pos.x, nz)) pos.z = nz;
    }
    const gh = groundAt(pos.x, pos.z);
    if (!grounded) {
      vy -= 18 * dt;
      y += vy * dt;
      if (y <= gh) {
        y = gh;
        grounded = true;
        vy = 0;
      }
    } else y = gh;
    avatar.group.position.set(pos.x, y, pos.z);
    avatar.group.rotation.y = yaw;
    avatar.update(dt, { speed: dir.lengthSq() ? speed : speed * 0.9, running, grounded, t });
    const look = new THREE.Vector3(pos.x, y + 1.2, pos.z);
    env.camera.position.set(
      look.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      look.y + Math.sin(camPitch) * camDist,
      look.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
    );
    env.camera.lookAt(look);
    content.update(dt, avatar.group.position, t);
    renderer.render(env.scene, env.camera);
  }
  requestAnimationFrame(frame);
}
frame();

// Debug API for Playwright.
(window as unknown as Record<string, unknown>).__qn = {
  goto(id: string, back = 0, side = 0) {
    const s = content.tourStops().find((x) => x.id === id)!;
    pos.x = s.position.x + side;
    pos.z = s.position.z + back;
  },
  view(id: string, rel = 0, pitch = 0.3, dist = 9, back = 0) {
    const st = STATIONS.find((s) => s.id === id)!;
    const s = content.tourStops().find((x) => x.id === id)!;
    const tp = env.trail.pointAt(st.t);
    const pose = env.stationPose(id);
    const f = Math.atan2(tp.x - pose.position.x, tp.z - pose.position.z);
    pos.x = s.position.x + Math.sin(f) * back;
    pos.z = s.position.z + Math.cos(f) * back;
    yaw = f + Math.PI;
    camYaw = f + rel;
    camPitch = pitch;
    camDist = dist;
  },
  spot(id: string) {
    const s = (content as unknown as { debugSpots(): Array<{ id: string; x: number; z: number }> })
      .debugSpots()
      .find((x) => x.id === id)!;
    pos.x = s.x;
    pos.z = s.z;
  },
  at(x: number, z: number) {
    pos.x = x;
    pos.z = z;
  },
  pos: () => ({ x: pos.x, y, z: pos.z }),
  face(a: number) {
    yaw = a;
  },
  cam(yawA: number, pitch: number, dist: number) {
    camYaw = yawA;
    camPitch = pitch;
    camDist = dist;
  },
  time: (v: number) => env.sky.setTime(v),
  interact: () => content.interact(),
  escape: () => content.escape(),
  tour() {
    tour = true;
  },
  stops: () => content.tourStops().map((s) => ({ id: s.id, x: s.position.x, z: s.position.z })),
  walkable: (x: number, z: number) => env.walkable(x, z),
  info: () => renderer.info.render,
};
