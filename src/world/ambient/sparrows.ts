/**
 * Pichitankas (rufous-collared sparrows, Zonotrichia capensis): the most common bird of the Andes, hopping
 * along the edges of the trail. A small pool follows the traveler: birds wait on the curb a little ahead,
 * hop and peck, flush when the traveler comes close (sooner when running or riding) and land again further
 * up the path. They sleep at night. Instanced: five draw calls for the whole flock.
 * Bodies ("sparrow", creatures.ts): solid on the ground, not in flight; a hop never lands on another body.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { type Body, creatures, PARKED, park } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";

const TAU = Math.PI * 2;
/** Stylised: a touch larger than life so they read from the follow camera. */
const SIZE = 1.6;

type State = "ground" | "fly" | "away";
interface Bird {
  state: State;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hopT: number;
  hop: number;
  peck: number;
  /** Flight: start, end, progress. */
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  f: number;
  flap: number;
}

function partGeometries() {
  const body = new THREE.SphereGeometry(0.075, 8, 6);
  body.scale(1, 0.85, 1.45);
  const tail = new THREE.BoxGeometry(0.05, 0.012, 0.12);
  tail.translate(0, 0.02, -0.15);
  tail.rotateX(-0.35);
  const torso = mergeTwo(body, tail);
  const head = new THREE.SphereGeometry(0.05, 8, 6);
  const beak = new THREE.ConeGeometry(0.014, 0.04, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, -0.005, 0.06);
  const collar = new THREE.TorusGeometry(0.045, 0.014, 5, 10);
  collar.rotateX(Math.PI / 2);
  const wing = new THREE.BoxGeometry(0.11, 0.012, 0.09);
  wing.translate(0.055, 0, 0);
  return { torso, head, beak, collar, wing };
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.index ? a.toNonIndexed() : a;
  const gb = b.index ? b.toNonIndexed() : b;
  const pos = new Float32Array(ga.attributes.position!.count * 3 + gb.attributes.position!.count * 3);
  pos.set(ga.attributes.position!.array as Float32Array, 0);
  pos.set(gb.attributes.position!.array as Float32Array, ga.attributes.position!.count * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  for (const g of new Set([a, b, ga, gb])) g.dispose();
  return out;
}

export const create: CreateAmbient = (env): Ambient => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const trail = env.trail;
  const n = env.quality === "high" ? 14 : 7;
  const rm = env.reducedMotion;

  const g = partGeometries();
  const mk = (geo: THREE.BufferGeometry, color: string, name: string, count = n) => {
    const m = new THREE.InstancedMesh(geo, env.toon(color), count);
    m.name = name;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    env.scene.add(m);
    return m;
  };
  const torso = mk(g.torso, "#8b6a48", "sparrow-body");
  const head = mk(g.head, "#77736c", "sparrow-head");
  const beak = mk(g.beak, "#2b2622", "sparrow-beak");
  const collar = mk(g.collar, "#b8612c", "sparrow-collar");
  const wings = mk(g.wing, "#5e4631", "sparrow-wings", n * 2);
  const meshes = [torso, head, beak, collar, wings];

  let seed = 7;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const birds: Bird[] = Array.from({ length: n }, () => ({
    state: "away" as State,
    x: 0,
    y: -999,
    z: 0,
    yaw: 0,
    hopT: R(),
    hop: 0,
    peck: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    f: 0,
    flap: 0,
  }));

  const bodies = birds.map(() => creatures.add("sparrow", 0.12, { solid: false, x: PARKED, z: PARKED }));
  const crowd: Body[] = [];
  const free = (b: Body, x: number, z: number) => {
    for (const o of creatures.near(x, z, b.r, crowd, b)) if (o.solid) return false;
    return true;
  };
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  let avT = 0;
  let tClock = 1;
  let dirSign = 1;
  let lastT = 0;
  let riding = false;
  let inside = false;
  const offMount = on("world:mount", (d) => (riding = !!d?.riding));
  const offInterior = on("world:interior", (d) => (inside = !!d?.inside));

  /** A spot on the trail edge `ahead` units from the traveler (in the walking direction). */
  const spotAhead = (ahead: number, out: { x: number; z: number; y: number }) => {
    for (let k = 0; k < 6; k++) {
      const t = Math.min(0.995, Math.max(0.005, avT + (dirSign * ahead) / trail.length + (R() - 0.5) * 0.004));
      trail.pointAt(t, tmp);
      trail.tangentAt(t, tan);
      const side = R() < 0.5 ? -1 : 1;
      const lat = trail.halfWidth + 0.25 + R() * 1.4;
      const x = tmp.x - tan.z * side * lat;
      const z = tmp.z + tan.x * side * lat;
      if (extra?.isWater?.(x, z)) continue;
      out.x = x;
      out.z = z;
      out.y = groundAt(x, z);
      return true;
    }
    return false;
  };
  const spot = { x: 0, y: 0, z: 0 };

  const land = (b: Bird, i: number, ahead: number) => {
    if (!spotAhead(ahead, spot) || !free(bodies[i]!, spot.x, spot.z)) return;
    b.state = "ground";
    b.x = spot.x;
    b.y = spot.y;
    b.z = spot.z;
    b.yaw = R() * TAU;
    b.hopT = 0.3 + R();
  };
  const flush = (b: Bird, av: THREE.Vector3) => {
    b.state = "fly";
    b.fx = b.x;
    b.fy = b.y;
    b.fz = b.z;
    // Away from the traveler, up and over.
    const dx = b.x - av.x;
    const dz = b.z - av.z;
    const d = Math.hypot(dx, dz) || 1;
    b.tx = b.x + (dx / d) * 9 + (R() - 0.5) * 4;
    b.tz = b.z + (dz / d) * 9 + (R() - 0.5) * 4;
    b.ty = b.y + 4 + R() * 3;
    b.yaw = Math.atan2(dx, dz);
    b.f = 0;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s1 = new THREE.Vector3(SIZE, SIZE, SIZE);
  const p = new THREE.Vector3();
  const local = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (mesh: THREE.InstancedMesh, i: number, b: Bird, lx: number, ly: number, lz: number, rx = 0, rz = 0) => {
    local.set(lx * SIZE, ly * SIZE, lz * SIZE).applyAxisAngle(THREE.Object3D.DEFAULT_UP, b.yaw);
    p.set(b.x + local.x, b.y + local.y, b.z + local.z);
    e.set(rx, b.yaw, rz, "YXZ");
    q.setFromEuler(e);
    mesh.setMatrixAt(i, m4.compose(p, q, s1));
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      const night = env.sky.isNight();
      // Where the traveler is along the path, and which way they're heading.
      tClock += dt;
      if (tClock > 0.4) {
        tClock = 0;
        avT = trail.nearestT(avatar.x, avatar.z);
        if (Math.abs(avT - lastT) > 0.0005) dirSign = avT > lastT ? 1 : -1;
        lastT = avT;
      }
      const scare = riding ? 4.2 : 2.6;
      for (let i = 0; i < n; i++) {
        const b = birds[i]!;
        const dx = b.x - avatar.x;
        const dz = b.z - avatar.z;
        const d2 = dx * dx + dz * dz;
        if (b.state === "away") {
          if (!night && !inside) land(b, i, 9 + R() * 26);
        } else if (b.state === "ground") {
          if (night || d2 > 48 * 48) b.state = "away";
          else if (d2 < scare * scare) flush(b, avatar);
          else {
            b.hopT -= dt;
            b.peck = Math.max(0, b.peck - dt * 3);
            if (b.hopT <= 0) {
              b.hopT = 0.4 + R() * 1.3;
              if (R() < 0.45) b.peck = 1;
              else {
                b.yaw += (R() - 0.5) * 2.2;
                const step = 0.12 + R() * 0.14;
                const nx = b.x + Math.sin(b.yaw) * step;
                const nz = b.z + Math.cos(b.yaw) * step;
                // Stay on the curb band, off the paving.
                const tt = trail.nearestT(nx, nz);
                trail.pointAt(tt, tmp);
                if (Math.hypot(nx - tmp.x, nz - tmp.z) > trail.halfWidth + 0.15 && free(bodies[i]!, nx, nz)) {
                  b.x = nx;
                  b.z = nz;
                  b.y = groundAt(nx, nz);
                  b.hop = 1;
                }
              }
            }
            b.hop = Math.max(0, b.hop - dt * 6);
          }
        } else {
          b.f += dt / 1.4;
          b.flap += dt * (rm ? 18 : 42);
          const f = Math.min(1, b.f);
          b.x = b.fx + (b.tx - b.fx) * f;
          b.z = b.fz + (b.tz - b.fz) * f;
          b.y = b.fy + (b.ty - b.fy) * f + Math.sin(f * Math.PI) * 1.2;
          if (b.f >= 1) b.state = "away";
        }

        const bd = bodies[i]!;
        if (b.state === "away") park(bd);
        else {
          bd.x = b.x;
          bd.z = b.z;
          bd.solid = b.state === "ground";
        }
        if (b.state === "away") {
          for (const m of [torso, head, beak, collar]) m.setMatrixAt(i, hidden);
          wings.setMatrixAt(i * 2, hidden);
          wings.setMatrixAt(i * 2 + 1, hidden);
          continue;
        }
        const flying = b.state === "fly";
        const lift = flying ? 0 : 0.075 + Math.sin(b.hop * Math.PI) * 0.06;
        const y0 = b.y;
        b.y = y0 + lift;
        const pitch = flying ? -0.2 : b.peck > 0 ? Math.sin(b.peck * Math.PI) * 0.7 : 0;
        place(torso, i, b, 0, 0, 0, pitch * 0.4);
        place(head, i, b, 0, 0.06 - pitch * 0.05, 0.09 + pitch * 0.03, pitch);
        place(beak, i, b, 0, 0.06 - pitch * 0.05, 0.09 + pitch * 0.03, pitch);
        place(collar, i, b, 0, 0.03, 0.07);
        const flap = flying ? Math.sin(b.flap) * 1.1 : 0;
        const fold = flying ? 0 : 1.35;
        place(wings, i * 2, b, 0.04, 0.03, 0, 0, -fold + flap);
        // Mirror wing: rotate the right-hand box around Y by π so it extends to the left.
        b.yaw += Math.PI;
        place(wings, i * 2 + 1, b, 0.04, 0.03, 0, 0, -fold + flap);
        b.yaw -= Math.PI;
        b.y = y0;
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const b of bodies) creatures.remove(b);
      offMount();
      offInterior();
      for (const m of meshes) {
        env.scene.remove(m);
        m.geometry.dispose();
        m.dispose();
      }
    },
  };
};
