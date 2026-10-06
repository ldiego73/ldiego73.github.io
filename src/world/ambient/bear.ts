/**
 * Oso de anteojos (spectacled bear, Tremarctos ornatus): the shy bear of the cloud forest, between trail
 * t ≈ 0.15 and 0.6, by day and into dusk. One bear (two on high quality) lives along the path:
 *  - sits on the slope by the trail eating a bromeliad (paws to the mouth), then ambles along the slope;
 *  - walks to an unca / aliso tree (read from the flora's instanced tiles), climbs it, rests, climbs down;
 *  - when the traveler comes within ~10 u it rears up on its hind legs to sniff, then ambles calmly away
 *    (to its tree when there is one) — never aggressive.
 * Rare but findable: until the traveler has had a good look (stamp `fauna:oso`), the guide bear is moved,
 * unseen, ahead of the traveler along the trail. Instanced: five draw calls for every bear.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { rng } from "../tex";
import {
  angleDiff,
  type BearTree,
  type BearTreeKind,
  CLIMB_TOP,
  copyPose,
  dampPose,
  isAwake,
  isGoodLook,
  POSES,
  type Pose,
  rankTrees,
  shouldRelocate,
  TRUNK_R,
  trunkAxis,
} from "./bear/logic";
import { bearGeometries, RIG } from "./bear/model";

const T_MIN = 0.15;
const T_MAX = 0.6;
const NEAR = 10;
const STAMP = { id: "fauna:oso", kind: "fauna" as const, label: { es: "Oso de anteojos", en: "Spectacled bear" } };

type Mode = "hidden" | "eat" | "walk" | "stand" | "climbUp" | "perch" | "climbDown";
type Goal = "forage" | "tree" | "away";

interface Bear {
  guide: boolean;
  size: number;
  mode: Mode;
  goal: Goal;
  timer: number;
  /** Logical root (ground point, or the hip on a trunk) and the rendered, eased root. */
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  yaw: number;
  tx: number;
  tz: number;
  speed: number;
  slope: number;
  tree: BearTree | null;
  climbH: number;
  climbYaw: number;
  /** Seconds left in which the bear ignores the traveler (it already reacted). */
  shy: number;
  cooldown: number;
  /** Trail distance from the traveler to the bear, in the walking direction (refreshed every 0.4 s). */
  ahead: number;
  phase: number;
  clock: number;
  look: number;
  pose: Pose;
  draw: Pose;
}

export const create: CreateAmbient = (env): Ambient => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const groundAt = (x: number, z: number) => extra?.groundAt(x, z) ?? env.heightAt(x, z);
  const isGrass = (x: number, z: number) => extra?.isGrass(x, z) ?? true;
  const trail = env.trail;
  const rm = env.reducedMotion;
  const motion = rm ? 0.45 : 1;
  const R = rng(4417);
  const n = env.quality === "high" ? 2 : 1;

  // ---------------------------------------------------------------- trees (flora's instanced tiles)
  const trees: BearTree[] = [];
  {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    env.scene.traverse((o) => {
      const mesh = o as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || (mesh.name !== "unca" && mesh.name !== "aliso")) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(p, q, s);
        const td = extra?.trailDistance(p.x, p.z) ?? { t: trail.nearestT(p.x, p.z), d: 0 };
        trees.push({
          kind: mesh.name as BearTreeKind,
          x: p.x,
          y: p.y,
          z: p.z,
          s: s.x,
          sy: s.y / s.x,
          yaw: e.setFromQuaternion(q, "YXZ").y,
          t: td.t,
          d: td.d,
        });
      }
    });
  }
  const homeTrees = rankTrees(trees, T_MIN - 0.03, T_MAX + 0.02, 30);

  // ---------------------------------------------------------------- meshes
  const geos = bearGeometries();
  const base = env.toon("#ffffff");
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: base.gradientMap });
  const mk = (geo: THREE.BufferGeometry, name: string, count: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    env.scene.add(mesh);
    return mesh;
  };
  const torsoMesh = mk(geos.torso, "bear-body", n);
  const headMesh = mk(geos.head, "bear-head", n);
  const armMesh = mk(geos.arm, "bear-arms", n * 2);
  const legMesh = mk(geos.leg, "bear-legs", n * 2);
  const propMesh = mk(geos.prop, "bear-bromeliad", n);
  const meshes = [torsoMesh, headMesh, armMesh, legMesh, propMesh];

  const bears: Bear[] = Array.from({ length: n }, (_, i) => ({
    guide: i === 0,
    size: i === 0 ? 0.95 : 0.86,
    mode: "hidden" as Mode,
    goal: "forage" as Goal,
    timer: 0,
    x: 0,
    y: -999,
    z: 0,
    rx: 0,
    ry: -999,
    rz: 0,
    yaw: 0,
    tx: 0,
    tz: 0,
    speed: 0,
    slope: 0,
    tree: null,
    climbH: 0,
    climbYaw: 0,
    shy: 0,
    cooldown: i * 6,
    ahead: 0,
    phase: R() * 6,
    clock: R() * 20,
    look: 0,
    pose: copyPose({} as Pose, POSES.walk),
    draw: copyPose({} as Pose, POSES.walk),
  }));

  // ---------------------------------------------------------------- traveler tracking
  let avT = 0;
  let lastT = 0;
  let dirSign = 1;
  let tClock = 1;
  let riding = false;
  let stamped = false;
  /** The traveler has had a good look at a bear on this climb (reset at the trailhead). */
  let met = false;
  const offMount = on("world:mount", (d) => (riding = !!d?.riding));
  const offStamp = on("world:stamp", (d) => {
    if (d?.id === STAMP.id) stamped = true;
  });

  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  const inView = (x: number, y: number, z: number) => {
    sphere.center.set(x, y + 0.8, z);
    return frustum.intersectsSphere(sphere);
  };

  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const ax = { x: 0, y: 0, z: 0 };

  /** A grassy spot beside the path at trail t, `lat` units from the centerline on `side`. */
  const trailSide = (t: number, side: number, lat: number, out: { x: number; z: number }) => {
    trail.pointAt(t, tmp);
    trail.tangentAt(t, tan);
    out.x = tmp.x - tan.z * side * lat;
    out.z = tmp.z + tan.x * side * lat;
    return isGrass(out.x, out.z) && !extra?.isWater(out.x, out.z);
  };
  const spot = { x: 0, z: 0 };

  /** World point on the trunk axis of `tr` at local height h. */
  const trunkPoint = (tr: BearTree, h: number) => {
    trunkAxis(tr.kind, h, ax);
    const c = Math.cos(tr.yaw);
    const s = Math.sin(tr.yaw);
    const lx = ax.x * tr.s;
    const lz = ax.z * tr.s;
    ax.x = tr.x + lx * c + lz * s;
    ax.z = tr.z - lx * s + lz * c;
    ax.y = tr.y + h * tr.s * tr.sy;
    return ax;
  };
  const trunkRadius = (tr: BearTree) => TRUNK_R[tr.kind] * tr.s;

  const nearestTree = (x: number, z: number, maxD: number) => {
    let best: BearTree | null = null;
    let bd = maxD * maxD;
    for (const tr of homeTrees) {
      const d = (tr.x - x) ** 2 + (tr.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = tr;
      }
    }
    return best;
  };

  const startWalk = (b: Bear, goal: Goal, x: number, z: number) => {
    b.mode = "walk";
    b.goal = goal;
    b.tx = x;
    b.tz = z;
    b.timer = 30;
  };
  const startEat = (b: Bear, secs: number) => {
    b.mode = "eat";
    b.timer = secs;
  };

  /** Next foraging spot a few metres along the slope beside the trail. */
  const wander = (b: Bear) => {
    const t0 = trail.nearestT(b.x, b.z);
    trail.pointAt(t0, tmp);
    trail.tangentAt(t0, tan);
    const side = Math.sign(-(b.x - tmp.x) * tan.z + (b.z - tmp.z) * tan.x) || 1;
    for (let k = 0; k < 8; k++) {
      const dir = R() < 0.5 ? -1 : 1;
      const t = Math.min(T_MAX + 0.02, Math.max(T_MIN - 0.03, t0 + (dir * (4 + R() * 6)) / trail.length));
      if (trailSide(t, k < 5 ? side : -side, 4.6 + R() * 3.5, spot)) {
        startWalk(b, "forage", spot.x, spot.z);
        return;
      }
    }
    startEat(b, 6 + R() * 6);
  };

  /** Head for a tree: the approach point is on the bear's side of the trunk. */
  const goToTree = (b: Bear, tr: BearTree) => {
    b.tree = tr;
    const dx = b.x - tr.x;
    const dz = b.z - tr.z;
    const d = Math.hypot(dx, dz) || 1;
    b.climbYaw = Math.atan2(dx / d, dz / d);
    const r = trunkRadius(tr) + 1.15 * b.size;
    startWalk(b, "tree", tr.x + (dx / d) * r, tr.z + (dz / d) * r);
  };

  /** Calmly away from the traveler: up its tree if the tree is not toward them, else along the slope. */
  const leave = (b: Bear, av: THREE.Vector3) => {
    b.shy = 25;
    const ax0 = b.x - av.x;
    const az0 = b.z - av.z;
    const ad = Math.hypot(ax0, az0) || 1;
    const tr = b.tree ?? nearestTree(b.x, b.z, 32);
    if (tr) {
      const tx = tr.x - b.x;
      const tz = tr.z - b.z;
      const td = Math.hypot(tx, tz) || 1;
      if ((tx * ax0 + tz * az0) / (td * ad) > -0.2) {
        goToTree(b, tr);
        b.speed = 1.25;
        return;
      }
    }
    const base = Math.atan2(ax0, az0);
    for (let k = 0; k < 10; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
      const d = 13 + R() * 4;
      const x = b.x + Math.sin(a) * d;
      const z = b.z + Math.cos(a) * d;
      if (isGrass(x, z)) {
        startWalk(b, "away", x, z);
        return;
      }
    }
    startWalk(b, "away", b.x + (ax0 / ad) * 12, b.z + (az0 / ad) * 12);
  };

  const snap = (b: Bear) => {
    b.rx = b.x;
    b.ry = b.y;
    b.rz = b.z;
  };

  /** Guide bear: a foraging spot beside the trail `ahead` units in the walking direction (unseen). */
  const placeAhead = (b: Bear, av: THREE.Vector3) => {
    for (const ahead of [36, 44, 52, 30, 60]) {
      const t = avT + (dirSign * ahead) / trail.length;
      if (t < T_MIN || t > T_MAX) continue;
      for (let k = 0; k < 4; k++) {
        if (!trailSide(t + (R() - 0.5) * 0.01, R() < 0.5 ? -1 : 1, 4.8 + R() * 2.8, spot)) continue;
        const y = groundAt(spot.x, spot.z);
        const d = Math.hypot(spot.x - av.x, spot.z - av.z);
        if (d < 26 || (d < 50 && inView(spot.x, y, spot.z))) continue;
        b.x = spot.x;
        b.z = spot.z;
        b.y = y;
        b.tree = nearestTree(spot.x, spot.z, 32);
        // Facing the oncoming traveler (a little down the path), so the spectacles are seen first.
        trail.pointAt(t - (dirSign * 9) / trail.length, tmp);
        b.yaw = Math.atan2(tmp.x - spot.x, tmp.z - spot.z) + (R() - 0.5) * 0.5;
        b.shy = 0;
        startEat(b, 22 + R() * 10);
        copyPose(b.pose, POSES.sit);
        snap(b);
        return true;
      }
    }
    return false;
  };

  /** Tree bear: an unseen home tree near the traveler's stretch of trail; up the tree or eating at its foot. */
  const placeAtTree = (b: Bear, av: THREE.Vector3) => {
    let best: BearTree | null = null;
    let bestScore = Infinity;
    for (const tr of homeTrees) {
      if (tr === bears[0]?.tree) continue;
      const d = Math.hypot(tr.x - av.x, tr.z - av.z);
      if (d < 30 || d > 85 || (d < 55 && inView(tr.x, tr.y, tr.z))) continue;
      const ahead = (tr.t - avT) * dirSign * trail.length;
      if (ahead < 10) continue;
      const score = Math.abs(ahead - 45) + tr.d;
      if (score < bestScore) {
        bestScore = score;
        best = tr;
      }
    }
    if (!best) return false;
    b.tree = best;
    // Face the trail side so the traveler sees the bear's front.
    trail.pointAt(best.t, tmp);
    // On the flank of the trunk as seen from the path, so the climbing bear shows its profile.
    b.climbYaw = Math.atan2(tmp.x - best.x, tmp.z - best.z) + (R() < 0.5 ? -1 : 1) * (1.1 + R() * 0.4);
    b.shy = 0;
    if (R() < 0.5) {
      b.climbH = CLIMB_TOP[best.kind] * (0.7 + R() * 0.3);
      b.mode = "perch";
      b.timer = 10 + R() * 10;
      copyPose(b.pose, POSES.climb);
    } else {
      const r = trunkRadius(best) + 0.75;
      b.x = best.x + Math.sin(b.climbYaw) * r;
      b.z = best.z + Math.cos(b.climbYaw) * r;
      b.y = groundAt(b.x, b.z);
      b.yaw = b.climbYaw;
      startEat(b, 12 + R() * 8);
      copyPose(b.pose, POSES.sit);
    }
    climbRoot(b);
    snap(b);
    return true;
  };

  /** Logical root while on a trunk. */
  const climbRoot = (b: Bear) => {
    if (b.mode !== "climbUp" && b.mode !== "perch" && b.mode !== "climbDown") return;
    const tr = b.tree!;
    const p = trunkPoint(tr, b.climbH);
    const out = trunkRadius(tr) * (1 - 0.25 * (b.climbH / 3)) + 0.34 * b.size;
    b.x = p.x + Math.sin(b.climbYaw) * out;
    b.z = p.z + Math.cos(b.climbYaw) * out;
    b.y = p.y;
    b.yaw = b.climbYaw + Math.PI;
  };

  // ---------------------------------------------------------------- render helpers
  const m4 = new THREE.Matrix4();
  const root = new THREE.Matrix4();
  const torsoM = new THREE.Matrix4();
  const armM = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sv = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const localM = (x: number, y: number, z: number, rx: number, ry: number, rz: number, order: THREE.EulerOrder) =>
    local.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, order)), one);

  const render = (b: Bear, i: number) => {
    if (b.mode === "hidden") {
      torsoMesh.setMatrixAt(i, hidden);
      headMesh.setMatrixAt(i, hidden);
      propMesh.setMatrixAt(i, hidden);
      for (let k = 0; k < 2; k++) {
        armMesh.setMatrixAt(i * 2 + k, hidden);
        legMesh.setMatrixAt(i * 2 + k, hidden);
      }
      return;
    }
    const p = b.draw;
    root.compose(v.set(b.rx, b.ry, b.rz), q.setFromEuler(e.set(0, b.yaw, 0, "YXZ")), sv.setScalar(b.size));
    torsoM.multiplyMatrices(root, localM(0, p.hipY, 0, p.torsoP + b.slope, 0, p.torsoR, "XYZ"));
    torsoMesh.setMatrixAt(i, torsoM);
    m4.multiplyMatrices(torsoM, localM(RIG.neck.x, RIG.neck.y, RIG.neck.z, p.headP, p.headYaw, 0, "XYZ"));
    headMesh.setMatrixAt(i, m4);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : -1;
      const a = k === 0 ? p.armL : p.armR;
      armM.multiplyMatrices(torsoM, localM(s * RIG.shoulder.x, RIG.shoulder.y, RIG.shoulder.z, a, 0, s * 0.06, "XYZ"));
      armMesh.setMatrixAt(i * 2 + k, armM);
      if (k === 1) {
        if (p.prop > 0.02) {
          local.compose(
            v.set(RIG.shoulder.x * 0.9, RIG.paw.y, RIG.paw.z),
            // Keep the rosette upright in the world, leaning a little toward the snout.
            q.setFromEuler(e.set(-(p.torsoP + b.slope + p.armR) - 0.35, 0, 0, "XYZ")),
            sv.setScalar(p.prop),
          );
          propMesh.setMatrixAt(i, m4.multiplyMatrices(armM, local));
        } else propMesh.setMatrixAt(i, hidden);
      }
      const l = k === 0 ? p.legL : p.legR;
      m4.multiplyMatrices(root, localM(s * RIG.legX, p.hipY, 0, l, 0, s * 0.04, "XYZ"));
      legMesh.setMatrixAt(i * 2 + k, m4);
    }
  };

  const tgt = copyPose({} as Pose, POSES.walk);

  // Dev / screenshot hook: pin a bear in a state (`scene.getObjectByName("bear-body").userData.debug`).
  if (import.meta.env?.DEV)
    torsoMesh.userData.debug = {
      bears,
      pin(i: number, mode: Mode, x?: number, z?: number, yaw?: number) {
        const b = bears[i];
        if (!b) return;
        if (x !== undefined && z !== undefined) {
          b.x = x;
          b.z = z;
          b.y = groundAt(x, z);
        }
        if (yaw !== undefined) b.yaw = yaw;
        if (mode === "perch" || mode === "climbUp") {
          b.tree = b.tree ?? nearestTree(b.x, b.z, 60);
          if (!b.tree) return;
          b.climbYaw = yaw ?? b.climbYaw;
          b.climbH = mode === "perch" ? CLIMB_TOP[b.tree.kind] : 0.6;
        }
        b.mode = mode;
        b.timer = 1e9;
        b.shy = 1e9;
        b.cooldown = 1e9;
        climbRoot(b);
        snap(b);
      },
      trees: homeTrees,
      stamped: () => stamped,
      met: () => met,
    };

  // ---------------------------------------------------------------- behaviour
  const step = (b: Bear, dt: number, av: THREE.Vector3, awake: boolean, seen: boolean, d: number) => {
    b.clock += dt;
    b.shy = Math.max(0, b.shy - dt);
    const near = riding ? 13 : NEAR;
    const alert = d < near && b.shy <= 0;
    // Head turn toward the traveler (body space) when they are around.
    const toAv = angleDiff(b.yaw, Math.atan2(av.x - b.x, av.z - b.z));
    const lookAt = d < 18 ? Math.max(-1, Math.min(1, toAv)) : Math.sin(b.clock * 0.35) * 0.6;
    b.look += (lookAt - b.look) * (1 - Math.exp(-3 * dt));
    let moving = 0;

    switch (b.mode) {
      case "eat": {
        b.timer -= dt;
        if (alert) {
          b.mode = "stand";
          b.timer = 2.4 + R() * 1.2;
        } else if (b.timer <= 0) {
          if (!awake) leave(b, av);
          else {
            const tr = b.tree ?? nearestTree(b.x, b.z, 30);
            if (tr && R() < 0.4) goToTree(b, tr);
            else wander(b);
            b.speed = 0.8;
          }
        }
        copyPose(tgt, POSES.sit);
        break;
      }
      case "walk": {
        const dx = b.tx - b.x;
        const dz = b.tz - b.z;
        const dist = Math.hypot(dx, dz);
        b.timer -= dt;
        if (alert && b.goal !== "away" && b.speed < 1) {
          b.mode = "stand";
          b.timer = 2.4 + R() * 1.2;
        } else if (dist < 0.15 || b.timer <= 0) {
          if (b.goal === "tree" && b.tree) {
            b.yaw += angleDiff(b.yaw, b.climbYaw + Math.PI) * Math.min(1, dt * 4);
            if (Math.abs(angleDiff(b.yaw, b.climbYaw + Math.PI)) < 0.15 || b.timer <= 0) {
              b.mode = "climbUp";
              b.climbH = 0.55 / (b.tree.s * b.tree.sy);
            }
          } else if (b.goal === "away") startEat(b, 10 + R() * 8);
          else startEat(b, 12 + R() * 10);
          b.speed = 0.8;
        } else {
          const want = Math.atan2(dx, dz);
          const turn = angleDiff(b.yaw, want);
          b.yaw += Math.max(-1.8 * dt, Math.min(1.8 * dt, turn));
          moving = b.speed * Math.max(0.25, Math.cos(turn)) * Math.min(1, dist * 2);
          const nx = b.x + Math.sin(b.yaw) * moving * dt;
          const nz = b.z + Math.cos(b.yaw) * moving * dt;
          if (!extra?.isWater(nx, nz)) {
            b.x = nx;
            b.z = nz;
          } else b.timer = 0;
          b.y = groundAt(b.x, b.z);
        }
        copyPose(tgt, POSES.walk);
        break;
      }
      case "stand": {
        b.timer -= dt;
        // Turn the body a little toward the scent.
        b.yaw += Math.max(-dt, Math.min(dt, toAv * 0.8));
        if (b.timer <= 0) leave(b, av);
        copyPose(tgt, POSES.stand);
        break;
      }
      case "climbUp":
      case "climbDown": {
        const tr = b.tree!;
        const rate = (0.42 * motion + 0.1) / (tr.s * tr.sy);
        b.climbH += (b.mode === "climbUp" ? rate : -rate) * dt;
        moving = 0.6;
        if (b.mode === "climbUp" && b.climbH >= CLIMB_TOP[tr.kind]) {
          b.mode = "perch";
          b.timer = 8 + R() * 8;
        } else if (b.mode === "climbDown" && b.climbH <= 0.5 / (tr.s * tr.sy)) {
          // Hop off and sit at the foot of the tree, facing out.
          const r = trunkRadius(tr) + 0.75 * b.size;
          b.x = tr.x + Math.sin(b.climbYaw) * r;
          b.z = tr.z + Math.cos(b.climbYaw) * r;
          b.y = groundAt(b.x, b.z);
          b.yaw = b.climbYaw;
          startEat(b, 9 + R() * 8);
        }
        climbRoot(b);
        copyPose(tgt, POSES.climb);
        break;
      }
      case "perch": {
        b.timer -= dt;
        // Safe up the tree: it just watches; it comes down once the traveler has moved on.
        if (b.timer <= 0 && (d > 9 || !awake)) b.mode = "climbDown";
        climbRoot(b);
        copyPose(tgt, POSES.climb);
        tgt.armL = tgt.armR = -1.0;
        tgt.legL = tgt.legR = -0.7;
        break;
      }
    }

    // Night: once nobody is watching, the bear is gone to its day bed.
    if (!awake && (!seen || d > 40) && b.mode !== "hidden") b.mode = "hidden";

    // Pose easing + slope pitch.
    if (b.mode === "walk" || b.mode === "eat") {
      const f = 0.55;
      const s = Math.sin(b.yaw);
      const c = Math.cos(b.yaw);
      const hF = groundAt(b.x + s * f, b.z + c * f);
      const hB = groundAt(b.x - s * f, b.z - c * f);
      const want = b.mode === "walk" ? -Math.atan2(hF - hB, 2 * f) * 0.8 : 0;
      b.slope += (want - b.slope) * (1 - Math.exp(-4 * dt));
    } else b.slope += (0 - b.slope) * (1 - Math.exp(-4 * dt));
    dampPose(b.pose, tgt, b.mode === "stand" ? 3.2 : 4, dt);
    const posRate = b.mode === "walk" ? 12 : 5;
    const k = 1 - Math.exp(-posRate * dt);
    b.rx += (b.x - b.rx) * k;
    b.ry += (b.y - b.ry) * k;
    b.rz += (b.z - b.rz) * k;

    // Overlays on top of the eased posture (gait, chewing, sniffing, climbing).
    const p = copyPose(b.draw, b.pose);
    p.headYaw += b.look * (b.mode === "walk" ? 0.4 : 0.85);
    if (moving > 0.01) {
      b.phase += dt * Math.PI * 2 * (b.mode === "walk" ? moving / 0.95 : 0.9) * (rm ? 0.7 : 1);
    }
    const ph = b.phase;
    if (b.mode === "walk") {
      const amp = Math.min(1, moving / 0.7) * 0.5 * motion;
      p.legL += Math.sin(ph) * amp;
      p.legR += Math.sin(ph + Math.PI) * amp;
      p.armL += Math.sin(ph + Math.PI) * amp * 1.1;
      p.armR += Math.sin(ph) * amp * 1.1;
      p.hipY += Math.abs(Math.sin(ph)) * 0.035 * amp;
      p.torsoR += Math.sin(ph) * 0.07 * amp;
      p.headYaw += Math.sin(ph) * 0.14 * amp;
      p.headP += Math.cos(ph * 2) * 0.05 * amp;
    } else if (b.mode === "eat") {
      // Bring the bromeliad to the mouth, chew, lower it a little, look around now and then.
      const bite = Math.max(0, Math.sin(b.clock * 1.3)) ** 2 * motion;
      p.armL -= bite * 0.38;
      p.armR -= bite * 0.38;
      p.headP += bite * 0.16 + Math.sin(b.clock * 9) * 0.04 * motion;
      p.torsoR += Math.sin(b.clock * 0.7) * 0.04 * motion;
    } else if (b.mode === "stand") {
      // Sniffing: quick small nods of the raised nose, a slow sway on the hind legs.
      p.headP += Math.sin(b.clock * 10) * 0.05 * motion - 0.04;
      p.torsoR += Math.sin(b.clock * 1.4) * 0.05 * motion;
      p.armL += Math.sin(b.clock * 1.4) * 0.08 * motion;
      p.armR -= Math.sin(b.clock * 1.4) * 0.08 * motion;
    } else if (b.mode === "climbUp" || b.mode === "climbDown") {
      const amp = 0.35 * motion;
      p.armL += Math.sin(ph) * amp;
      p.armR += Math.sin(ph + Math.PI) * amp;
      p.legL += Math.sin(ph + Math.PI) * amp * 0.8;
      p.legR += Math.sin(ph) * amp * 0.8;
      p.torsoR += Math.sin(ph) * 0.06 * motion;
    } else if (b.mode === "perch") {
      p.headYaw = b.look * 1.1;
      p.torsoR += Math.sin(b.clock * 0.8) * 0.04 * motion;
    }
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      tClock += dt;
      if (tClock > 0.4) {
        tClock = 0;
        avT = trail.nearestT(avatar.x, avatar.z);
        if (Math.abs(avT - lastT) > 0.0005) dirSign = avT > lastT ? 1 : -1;
        lastT = avT;
        // Back at the foot of the mountain: a new climb, a new guaranteed encounter.
        if (avT < 0.1) met = false;
        for (const b of bears)
          b.ahead = b.mode === "hidden" ? 0 : (trail.nearestT(b.rx, b.rz) - avT) * dirSign * trail.length;
      }
      const cam = env.camera;
      pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv);
      const time = env.sky.time();
      const inStretch = avT > T_MIN - 0.08 && avT < T_MAX + 0.04;

      for (let i = 0; i < n; i++) {
        const b = bears[i]!;
        const awake = isAwake(time, b.guide ? 0.21 : 0.26, b.guide ? 0.82 : 0.76);
        const d = Math.hypot(b.rx - avatar.x, b.rz - avatar.z);
        const hiddenNow = b.mode === "hidden";
        const seen = !hiddenNow && inView(b.rx, b.ry, b.rz);
        b.cooldown = Math.max(0, b.cooldown - dt);

        // Placement / relocation (never while the bear could be watched).
        if (awake && inStretch) {
          const far = b.guide && !met ? 70 : 85;
          const behind = b.ahead < (b.guide && !met ? -12 : -30);
          if (shouldRelocate({ hidden: hiddenNow, dist: d, inView: seen, cooldown: b.cooldown, far, behind })) {
            const ok = b.guide ? placeAhead(b, avatar) : placeAtTree(b, avatar);
            b.cooldown = ok ? (b.guide ? (met ? 150 : 3) : 45) : 0.5;
          }
        }

        if (b.mode !== "hidden") {
          step(b, dt, avatar, awake, seen, d);
          if (!met && (b.mode as Mode) !== "hidden" && isGoodLook(d, seen)) {
            met = true;
            if (!stamped) emit("world:stamp", STAMP);
            stamped = true;
            // Rare from now on: let this encounter play out before any bear is moved again.
            for (const o of bears) o.cooldown = Math.max(o.cooldown, 120);
          }
        }
        render(b, i);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      offMount();
      offStamp();
      for (const m of meshes) {
        env.scene.remove(m);
        m.geometry.dispose();
        m.dispose();
      }
      mat.dispose();
    },
  };
};
