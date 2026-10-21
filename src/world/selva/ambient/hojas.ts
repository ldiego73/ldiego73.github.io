/**
 * Falling leaves of the Antisuyu: broad canopy leaves let go above the traveler and sail down through the
 * forest, a slow trickle in the still air of the floor and a flurry whenever a gust front rolls over the
 * canopy (the same wave you see crossing the treetops: `liveWind.gust` at the traveler). Each leaf flutters
 * side to side and tumbles as it falls, is carried by the shared wind where it is (`liveWind.sample`), lands
 * on the litter, on the walkway deck or on the river, lies there a few seconds and fades. Pure rules in
 * ./hojas/logic.ts.
 *
 * Rendering: one InstancedMesh (≤ 80 leaves, 40 on low), double-sided toon with per-instance tints, no ink
 * (a leaf is a few pixels; an outline would turn it into a dark speck) and no painted blotches (they move).
 * Hidden indoors. Reduced motion: a slow, sparse trickle, no gust flurries.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { on } from "../../events";
import { paintStrength } from "../../style-gl";
import { liveWind } from "../../wind";
import { type Leaf, leafScale, releaseRate, stepLeaf } from "./hojas/logic";
import { idle, ramp, selvaOf } from "./wild/kit";
import { rng } from "./wild/logic";

/** Leaf tints: fresh and dark greens, a yellowing leaf, two dry browns (the floor's litter colours). */
const TINTS = ["#6fa53c", "#4f8a30", "#9cbc4a", "#d8b23c", "#a8682e", "#8a5a2a"];

/** A broad leaf ≈ 0.22 long (scaled ×0.8–1.5 per instance): two triangles folded along the midrib. */
function leafGeometry() {
  const g = new THREE.BufferGeometry();
  const L = 0.11;
  const W = 0.065;
  const fold = 0.018;
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, -L, -W, fold, 0, 0, 0, L, 0, 0, -L, 0, 0, L, W, fold, 0], 3),
  );
  g.computeVertexNormals();
  return g;
}

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const n = env.quality === "high" ? 80 : 40;
  const rm = env.reducedMotion;
  const R = rng(5309);
  const mat = paintStrength(
    new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: ramp(env), side: THREE.DoubleSide }),
    0,
  );
  const mesh = new THREE.InstancedMesh(leafGeometry(), mat, n);
  mesh.name = "selva-hojas";
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  env.noOutline(mesh);
  env.scene.add(mesh);
  const tints = TINTS.map((c) => new THREE.Color(c));
  const leaves: Leaf[] = Array.from({ length: n }, () => ({
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    rz: 0,
    wx: 0,
    wz: 0,
    ph: 0,
    w: 0,
    rest: -1,
    tint: 0,
    s: 1,
    live: false,
  }));
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const groundAt = (x: number, z: number) => (L.isWater(x, z) ? L.river.level : env.selva.groundAt(x, z));
  /** Lets one leaf go above the traveler: around them, a little ahead of the camera, from the canopy. */
  const release = (avatar: THREE.Vector3) => {
    const l = leaves.find((q) => !q.live);
    if (!l) return;
    const cam = env.camera.position;
    // Ahead of the camera (where the traveler looks), 3–18 u out, ±70° wide.
    const yaw = Math.atan2(avatar.x - cam.x, avatar.z - cam.z) + (R() - 0.5) * 2.4;
    const r = 3 + R() * 15;
    l.x = avatar.x + Math.sin(yaw) * r;
    l.z = avatar.z + Math.cos(yaw) * r;
    const g = groundAt(l.x, l.z);
    l.y = Math.max(g + 7 + R() * 7, avatar.y + 3 + R() * 5);
    l.rx = R() * 6.28;
    l.rz = R() * 6.28;
    l.wx = (R() - 0.5) * 5;
    l.wz = (R() - 0.5) * 3;
    l.ph = R() * 6.28;
    l.w = 2.2 + R() * 1.6;
    l.rest = -1;
    l.tint = Math.floor(R() * tints.length);
    l.s = 0.8 + R() * 0.7;
    l.live = true;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let acc = 0;
  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      if (inside) {
        mesh.count = 0;
        mesh.visible = false;
        return;
      }
      const night = env.sky.isNight() ? 0.5 : 1;
      acc += releaseRate(liveWind.gust, liveWind.state.gustAmp, rm) * night * dt;
      while (acc >= 1) {
        acc -= 1;
        release(avatar);
      }
      let k = 0;
      for (const l of leaves) {
        if (!l.live) continue;
        // Too far behind (the traveler walked on, or took the canoe): back to the pool.
        if (Math.hypot(l.x - avatar.x, l.z - avatar.z) > 40) {
          l.live = false;
          continue;
        }
        const w = liveWind.sample(l.x, l.z, l.y);
        if (!stepLeaf(l, dt, w, groundAt(l.x, l.z), rm ? 0.5 : 1)) continue;
        e.set(l.rx, l.rz, l.rx * 0.5, "YXZ");
        q.setFromEuler(e);
        m4.compose(p.set(l.x, l.y, l.z), q, sc.setScalar(leafScale(l)));
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k, tints[l.tint] as THREE.Color);
        k++;
      }
      mesh.count = k;
      mesh.visible = k > 0;
      if (k) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      offInterior();
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
};
