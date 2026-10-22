/**
 * Secret: the golden condor. Only at dawn (sky time 0.20–0.30, i.e. ~36 s of the 6-minute day) a gilded
 * condor glides a wide loop around the summit, a few metres above the plateau and out over the cliffs,
 * leaving a faint trail of sparks. Getting a good look (within ~25 u of the traveler and on screen for a
 * moment) stamps `egg:golden-condor`. The shared condor (characters/animals, built off the main thread) in a
 * gilded coat, a little larger than the fauna's, with a soft halo (no outline on the glow/sparks); the flight
 * state machine reads its soaring from the motion. Registered in `creatures` (kind "condor", not solid).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../contract";
import { creatures } from "../creatures";
import { emit } from "../events";
import type { Animal } from "../characters/animals/animal";
import { loadAnimal } from "../characters/animals/assets";
import { bpal } from "../characters/animals/species/birds";
import { noPaint } from "../style-gl";

const DAWN0 = 0.2;
const DAWN1 = 0.3;
const LOOK_R = 25;
/** Seconds on screen within range before it counts as a good look. */
const LOOK_HOLD = 0.6;
const LABEL: L = { es: "Cóndor dorado", en: "Golden condor" };
/** A little larger than the fauna's condors (the shared condor is life-size: ~3 m across). */
const SCALE = 1.15;
/** Wingtip in the bird's frame (half span ≈ 1.55 u), where the sparks shed from. */
const TIP_X = 1.55;
/** Body centre above the animal's origin (its feet). */
const BODY_Y = 0.64;
/** Gilded plumage on the condor's palette slots (back, head, bill, legs, belly, coverts, flight, tail…). */
const GOLD = bpal({
  back: "#d9a531",
  head: "#e6a24c",
  bill: "#b5832a",
  legs: "#a87a2c",
  belly: "#e3b442",
  coverts: "#efc95a",
  flight: "#fff0b3",
  tail: "#c99429",
  face: "#e6a24c",
  collar: "#fff4cc",
});

const TAU = Math.PI * 2;
const wrap = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,226,140,0.9)");
  g.addColorStop(0.35, "rgba(255,200,90,0.35)");
  g.addColorStop(1, "rgba(255,190,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const create: CreateAmbient = (env) => {
  const rm = env.reducedMotion;
  const low = env.quality === "low";
  const summit = env.trail.pointAt(1);

  // ---------------------------------------------------------------- bird
  const root = new THREE.Group();
  root.name = "golden-condor";
  root.scale.setScalar(SCALE);
  let bird: Animal | null = null;
  let disposed = false;
  void loadAnimal("condor", { variant: GOLD, seed: 9, shadows: false }).then((a) => {
    if (disposed) return a.dispose();
    a.group.position.y = -BODY_Y;
    root.add(a.group);
    // It flies: no world-space painted blotches sliding over the gold (style-gl.ts).
    noPaint(a.group);
    bird = a;
  });

  // Soft halo (no outline) so it reads as "special" against the dawn sky.
  const haloTex = haloTexture();
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.55,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(4.4, 3, 1);
  halo.position.set(0, 0.05, 0.1);
  env.noOutline(halo);
  root.add(halo);

  // ---------------------------------------------------------------- spark trail (ring buffer, additive)
  const N = low ? 14 : 30;
  const sparkPos = new Float32Array(N * 3);
  const sparkCol = new Float32Array(N * 3);
  const sparkAge = new Float32Array(N).fill(99);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    map: haloTex,
    size: 0.4,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.name = "golden-condor-sparks";
  env.noOutline(sparks);
  const SPARK_LIFE = 1.6;
  let sparkHead = 0;
  let sparkClock = 0;

  const group = new THREE.Group();
  group.name = "golden-condor-secret";
  group.add(root, sparks);
  group.visible = false;
  env.scene.add(group);

  const body0 = creatures.add("condor", 1.4, { solid: false, x: summit.x, z: summit.z });

  // ---------------------------------------------------------------- flight: a wide ellipse around the summit
  const A = 20;
  const B = 14;
  const SPEED = rm ? 4.5 : 7.5;
  let phase = 0;
  let yawPrev = 0;
  let bank = 0;
  let yPrev = 0;
  let vy = 0;
  let lodT = 0;
  let active = false;
  let seenFor = 0;
  let stamped = false;
  const pos = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const place = (ph: number, out: THREE.Vector3, time: number) => {
    out.set(summit.x + Math.cos(ph) * A, 0, summit.z + Math.sin(ph) * B);
    const ground = env.heightAt(out.x, out.z);
    out.y = Math.max(summit.y + 6 + Math.sin(time * 0.35) * 1.6, ground + 4);
    return out;
  };

  /** Starts the loop at the point farthest from the camera, so it glides in instead of popping up. */
  const enter = () => {
    const cam = env.camera.position;
    let best = 0;
    let bd = -1;
    for (let k = 0; k < 16; k++) {
      const ph = (k / 16) * TAU;
      const d = (summit.x + Math.cos(ph) * A - cam.x) ** 2 + (summit.z + Math.sin(ph) * B - cam.z) ** 2;
      if (d > bd) {
        bd = d;
        best = ph;
      }
    }
    phase = best;
    sparkAge.fill(99);
    seenFor = 0;
  };

  const ambient: Ambient = {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      const time = env.sky.time();
      const want = time >= DAWN0 && time <= DAWN1;
      if (want && !active) enter();
      active = want;
      group.visible = active;
      if (!active) {
        body0.x = summit.x;
        body0.z = summit.z + 1e4; // parked far away while hidden
        return;
      }

      // Ellipse speed is roughly constant: dθ = v / local radius.
      const rLocal = Math.hypot(A * Math.sin(phase), B * Math.cos(phase)) || 1;
      phase = (phase + (SPEED / rLocal) * dt) % TAU;
      place(phase, pos, t);
      const vx = -Math.sin(phase) * A;
      const vz = Math.cos(phase) * B;
      const yaw = Math.atan2(vx, vz);
      const yawRate = dt > 0 ? wrap(yaw - yawPrev) / dt : 0;
      yawPrev = yaw;
      bank += (THREE.MathUtils.clamp(yawRate * 1.4, -0.55, 0.55) - bank) * (1 - Math.exp(-dt * 2));
      root.position.copy(pos);
      root.rotation.y = yaw;
      vy += ((dt > 0 && yPrev ? (pos.y - yPrev) / dt : 0) - vy) * (1 - Math.exp(-dt * 3));
      yPrev = pos.y;
      // Soaring: the flight state machine reads glide/soar from the climb rate; the body banks into the turn.
      bird?.update(dt, t, {
        speed: SPEED / SCALE,
        rm,
        grounded: false,
        vy,
        height: pos.y - env.heightAt(pos.x, pos.z),
        turn: bank,
        look: rm ? 0 : Math.sin(t * 0.4) * 0.25,
      });
      lodT -= dt;
      if (bird && lodT <= 0) {
        lodT = 0.25;
        bird.autoLod(env.camera, SCALE);
      }
      haloMat.opacity = rm ? 0.5 : 0.45 + 0.12 * Math.sin(t * 2.4);

      body0.x = pos.x;
      body0.z = pos.z;

      // Sparks: shed from alternating wingtips, drift down and fade.
      sparkClock -= dt;
      if (sparkClock <= 0) {
        sparkClock = rm ? 0.16 : 0.07;
        const side = sparkHead % 2 ? 1 : -1;
        root.updateWorldMatrix(true, false);
        tip.set(side * TIP_X, 0, 0.1).applyMatrix4(root.matrixWorld);
        sparkPos[sparkHead * 3] = tip.x;
        sparkPos[sparkHead * 3 + 1] = tip.y;
        sparkPos[sparkHead * 3 + 2] = tip.z;
        sparkAge[sparkHead] = 0;
        sparkHead = (sparkHead + 1) % N;
      }
      for (let i = 0; i < N; i++) {
        const age = (sparkAge[i] as number) + dt;
        sparkAge[i] = age;
        const k = Math.max(0, 1 - age / SPARK_LIFE);
        if (!rm && k > 0) sparkPos[i * 3 + 1] = (sparkPos[i * 3 + 1] as number) - dt * 0.35;
        sparkCol[i * 3] = 1 * k;
        sparkCol[i * 3 + 1] = 0.82 * k;
        sparkCol[i * 3 + 2] = 0.42 * k;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;

      // A good look: close to the traveler and on screen for a moment.
      if (!stamped) {
        const near = tmp.set(pos.x - avatar.x, pos.y - avatar.y, pos.z - avatar.z).length() < LOOK_R;
        ndc.copy(pos).project(env.camera);
        const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 0.85 && Math.abs(ndc.y) < 0.85;
        seenFor = near && onScreen ? seenFor + dt : 0;
        if (seenFor >= LOOK_HOLD) {
          stamped = true;
          emit("world:stamp", { id: "egg:golden-condor", kind: "egg", label: LABEL });
        }
      }
    },
    dispose() {
      creatures.remove(body0);
      group.removeFromParent();
      disposed = true;
      bird?.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      haloMat.dispose();
      haloTex.dispose();
    },
  };
  return ambient;
};
