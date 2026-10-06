/**
 * Patos de los torrentes (Merganetta armata) on the mountain stream: pairs (white-and-black-headed male,
 * rufous female) living either side of the slab-bridge crossing, plus a pair in the waterfall pool on high
 * quality. They perch on small wet rocks in the current bobbing their heads, slip in to swim upstream with
 * strong paddling, drift back down, dive and pop up with a splash ring, and flutter-run over the water when
 * the traveler comes close. At night they rest on the rocks, heads tucked. Stamp `fauna:pato` on a good look.
 *
 * The stream's centerline (with the exact water height) is read from the "stream" ribbon mesh the terrain
 * builds; the pool from the "waterfall-cliff" group. Instanced: twelve draw calls for everything.
 */
import * as THREE from "three";
import { sfx } from "../../audio";
import type { Ambient, CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { duckParts, HIP, NECK, PLUMAGE, rockGeometry, SHOULDER, WATERLINE } from "./duck/model";
import { findCrossing, gentleRun, makePath, type PathSample, ribbonCenterline, type WaterPath } from "./duck/path";

/** Stylised: a touch larger than life so they read from the follow camera. */
const SIZE = 1.6;
const STAMP = { id: "fauna:pato", kind: "fauna" as const, label: { es: "Pato de los torrentes", en: "Torrent duck" } };

/** Shortest signed angle from b to a. */
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

type Mode = "perch" | "hop" | "swim" | "float" | "dive" | "pop" | "run";

interface Rock {
  s: number;
  lat: number;
  x: number;
  y: number;
  z: number;
  r: number;
  occ: Duck | null;
}

interface Zone {
  path: WaterPath;
  lo: number;
  hi: number;
  swim: [number, number] | null;
  /** Current speed (u/s, downstream). */
  flow: number;
  /** Max |lateral| offset in the water at arc length s. */
  latMax: (s: number) => number;
  rocks: Rock[];
  ducks: Duck[];
  cx: number;
  cz: number;
}

interface Duck {
  zone: Zone;
  male: boolean;
  home: Rock;
  mode: Mode;
  s: number;
  lat: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  rock: Rock | null;
  timer: number;
  t: number;
  dur: number;
  /** Hop / run start (world) and hop target. */
  hx: number;
  hy: number;
  hz: number;
  tx: number;
  ty: number;
  tz: number;
  toS: number;
  toLat: number;
  toRock: Rock | null;
  speed: number;
  paddle: number;
  bobT: number;
  bob: number;
  lookT: number;
  look: number;
  headYaw: number;
  flap: number;
  wing: number;
  fx: number;
  cool: number;
  visible: boolean;
}

export const create: CreateAmbient = (env): Ambient => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  const noop: Ambient = { update() {}, dispose() {} };

  // ---------------------------------------------------------------- find the water
  let streamMesh: THREE.Mesh | null = null;
  let poolMesh: THREE.Mesh | null = null;
  env.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.name === "stream") streamMesh = m;
    if (m.geometry?.type === "CircleGeometry" && m.parent?.name === "waterfall-cliff") poolMesh = m;
  });
  if (!streamMesh) return noop;
  const sm = streamMesh as THREE.Mesh;
  sm.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const rib = (sm.geometry.attributes.position as THREE.BufferAttribute).clone();
  for (let i = 0; i < rib.count; i++) {
    v.fromBufferAttribute(rib, i).applyMatrix4(sm.matrixWorld);
    rib.setXYZ(i, v.x, v.y, v.z);
  }
  const stream = makePath(ribbonCenterline(rib.array));
  if (stream.length < 4) return noop;

  const trail = env.trail;
  const hw = trail.halfWidth;
  const tp = new THREE.Vector3();
  const trailD = (x: number, z: number) => {
    if (extra) return extra.trailDistance(x, z).d;
    trail.pointAt(trail.nearestT(x, z), tp);
    return Math.hypot(x - tp.x, z - tp.z);
  };
  const S: PathSample = { x: 0, y: 0, z: 0, tx: 0, tz: 1, grade: 0 };
  const dAt = (q: number) => {
    stream.sample(q, S);
    return trailD(S.x, S.z);
  };
  let sCross = 0;
  {
    let best = Infinity;
    for (let q = 0; q <= stream.length; q += 0.25) {
      const d = dAt(q);
      if (d < best) {
        best = d;
        sCross = q;
      }
    }
  }
  // Stay clear of the slab bridge (the ribbon dips under the slabs there).
  const EDGE = hw + 1.5;
  const upEdge = findCrossing(stream, sCross, -0.1, dAt, EDGE);
  const downEdge = findCrossing(stream, sCross, 0.1, dAt, EDGE);

  let seed = 29;
  const R = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const makeRock = (path: WaterPath, s: number, lat: number, r: number): Rock => {
    path.at(s, lat, S);
    const x = S.x;
    const z = S.z;
    let top = S.y;
    for (const k of [-1, 1]) top = Math.max(top, path.at(s + k * r * 0.9, lat, S).y);
    return { s, lat, x, y: top + 0.07, z, r, occ: null };
  };
  const zones: Zone[] = [];
  const streamLat = () => 0.5;
  if (upEdge != null && upEdge > 3) {
    const e = upEdge;
    zones.push({
      path: stream,
      lo: Math.max(1.4, e - 7.5),
      hi: e,
      swim: gentleRun(stream, e - 2.6, e - 0.1, 0.55),
      flow: 0.55,
      latMax: streamLat,
      rocks: [
        makeRock(stream, e - 0.55, 0.42, 0.26),
        makeRock(stream, e - 1.9, -0.44, 0.29),
        makeRock(stream, e - 4.4, 0.3, 0.27),
        makeRock(stream, e - 6.4, -0.32, 0.26),
      ],
      ducks: [],
      cx: 0,
      cz: 0,
    });
  }
  if (downEdge != null && downEdge < stream.length - 4) {
    const e = downEdge;
    zones.push({
      path: stream,
      lo: e,
      hi: Math.min(stream.length - 0.5, e + 7.5),
      swim: gentleRun(stream, e + 0.1, e + 2.8, 0.55),
      flow: 0.55,
      latMax: streamLat,
      rocks: [
        makeRock(stream, e + 0.7, -0.42, 0.27),
        makeRock(stream, e + 2.1, 0.44, 0.26),
        makeRock(stream, e + 4.6, -0.3, 0.29),
        makeRock(stream, e + 6.6, 0.32, 0.26),
      ],
      ducks: [],
      cx: 0,
      cz: 0,
    });
  }
  if (poolMesh && env.quality === "high") {
    const pm = poolMesh as THREE.Mesh;
    pm.updateWorldMatrix(true, false);
    const c = new THREE.Vector3().setFromMatrixPosition(pm.matrixWorld);
    const rad = ((pm.geometry as THREE.CircleGeometry).parameters?.radius ?? 2.1) * 1;
    stream.sample(0.6, S);
    const dx = S.tx;
    const dz = S.tz;
    const y = c.y + 0.005;
    // A flat line across the pool, from under the fall (upstream) to the outflow.
    const pool = makePath([c.x - dx * 1.15, y, c.z - dz * 1.15, c.x, y, c.z, c.x + dx * 0.95, y, c.z + dz * 0.95]);
    const mid = 1.15;
    zones.push({
      path: pool,
      lo: 0,
      hi: pool.length,
      swim: [0.15, pool.length - 0.1],
      flow: 0.12,
      latMax: (s) => Math.max(0.2, Math.sqrt(Math.max(0, rad * rad - (s - mid) ** 2)) - 0.45),
      rocks: [
        makeRock(pool, mid + 0.25, 1.55, 0.26),
        makeRock(pool, mid - 0.45, -1.5, 0.27),
        makeRock(pool, mid + 0.9, -0.95, 0.24),
      ],
      ducks: [],
      cx: 0,
      cz: 0,
    });
  }
  if (!zones.length) return noop;
  const rockFloor = (zone: Zone, rk: Rock) => zone.path.sample(rk.s, S).y;

  // ---------------------------------------------------------------- ducks
  const ducks: Duck[] = [];
  for (const zone of zones) {
    let sx = 0;
    let sz = 0;
    for (const rk of zone.rocks) {
      sx += rk.x;
      sz += rk.z;
    }
    zone.cx = sx / zone.rocks.length;
    zone.cz = sz / zone.rocks.length;
    for (const male of [true, false]) {
      const home = zone.rocks[male ? 0 : 1]!;
      const d: Duck = {
        zone,
        male,
        home,
        mode: "perch",
        s: home.s,
        lat: home.lat,
        x: home.x,
        y: home.y,
        z: home.z,
        yaw: 0,
        pitch: 0,
        rock: home,
        timer: 1 + R() * 4,
        t: 0,
        dur: 0,
        hx: 0,
        hy: 0,
        hz: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        toS: 0,
        toLat: 0,
        toRock: null,
        speed: 0,
        paddle: R() * 6,
        bobT: R(),
        bob: 0,
        lookT: 1 + R() * 2,
        look: 0,
        headYaw: 0,
        flap: R() * 6,
        wing: 0,
        fx: 0,
        cool: 0,
        visible: true,
      };
      home.occ = d;
      zone.path.sample(home.s, S);
      d.yaw = Math.atan2(-S.tx, -S.tz) + (R() - 0.5) * 0.8;
      zone.ducks.push(d);
      ducks.push(d);
    }
  }
  const n = ducks.length;

  // ---------------------------------------------------------------- meshes
  const g = duckParts();
  const white = env.toon("#fffffe");
  const meshes: THREE.InstancedMesh[] = [];
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, name: string) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.name = name;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    env.scene.add(m);
    meshes.push(m);
    return m;
  };
  const body = mk(g.body, white, n, "duck-body");
  const belly = mk(g.belly, white, n, "duck-belly");
  const streak = mk(g.streak, white, n, "duck-streaks");
  const head = mk(g.head, white, n, "duck-head");
  const stripes = mk(g.stripes, white, n, "duck-stripes");
  const wings = mk(g.wing, white, n * 2, "duck-wings");
  const bill = mk(g.bill, env.toon(PLUMAGE.bill), n, "duck-bill");
  const eyes = mk(g.eyes, env.toon(PLUMAGE.eye), n, "duck-eyes");
  const legs = mk(g.leg, env.toon(PLUMAGE.leg), n * 2, "duck-legs");
  const col = new THREE.Color();
  ducks.forEach((d, i) => {
    const p = d.male ? PLUMAGE.male : PLUMAGE.female;
    body.setColorAt(i, col.set(p.body));
    belly.setColorAt(i, col.set(p.belly));
    streak.setColorAt(i, col.set(p.streak));
    head.setColorAt(i, col.set(p.head));
    stripes.setColorAt(i, col.set(p.stripes));
    wings.setColorAt(i * 2, col.set(p.wing));
    wings.setColorAt(i * 2 + 1, col.set(p.wing));
  });

  // Wet rocks in the current (static).
  const allRocks = zones.flatMap((z) => z.rocks);
  const rockGeo = rockGeometry(5);
  const rocks = mk(rockGeo, white, allRocks.length, "duck-rocks");
  rocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const wet = ["#353331", "#3e3a36", "#2f2e2d", "#423d37"];
    allRocks.forEach((rk, i) => {
      const zone = zones.find((z) => z.rocks.includes(rk))!;
      const floor = rockFloor(zone, rk);
      const sy = Math.max(rk.r * 0.7, (rk.y - floor + 0.25) / 1.55);
      sc.set(Math.max(rk.r * 1.15, sy * 0.85), sy, Math.max(rk.r, sy * 0.75));
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, R() * Math.PI * 2);
      p.set(rk.x, rk.y - 0.55 * sy, rk.z);
      rocks.setMatrixAt(i, m.compose(p, q, sc));
      rocks.setColorAt(i, col.set(wet[i % wet.length]!));
    });
    rocks.instanceMatrix.needsUpdate = true;
  }

  // Splash rings + droplets (unlit, no ink).
  const nRing = env.quality === "high" ? 18 : 8;
  const nDrop = env.reducedMotion ? 10 : env.quality === "high" ? 48 : 16;
  const ringGeo = new THREE.RingGeometry(0.78, 1, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rings = mk(ringGeo, ringMat, nRing, "duck-splash-rings");
  const dropGeo = new THREE.IcosahedronGeometry(1, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: "#f2fbfa" });
  const drops = mk(dropGeo, dropMat, nDrop, "duck-splash-drops");
  env.noOutline(rings);
  env.noOutline(drops);
  const ringT = new Float32Array(nRing).fill(1);
  const ringP = new Float32Array(nRing * 4);
  let ringNext = 0;
  const dropT = new Float32Array(nDrop).fill(1);
  const dropP = new Float32Array(nDrop * 3);
  const dropV = new Float32Array(nDrop * 3);
  const dropFloor = new Float32Array(nDrop);
  let dropNext = 0;
  for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  const spawnRing = (x: number, y: number, z: number, size: number) => {
    const i = ringNext;
    ringNext = (ringNext + 1) % nRing;
    ringT[i] = 0;
    ringP[i * 4] = x;
    ringP[i * 4 + 1] = y + 0.025;
    ringP[i * 4 + 2] = z;
    ringP[i * 4 + 3] = size;
  };
  const spawnDrops = (x: number, y: number, z: number, count: number, up: number) => {
    for (let k = 0; k < count; k++) {
      const i = dropNext;
      dropNext = (dropNext + 1) % nDrop;
      dropT[i] = 0;
      const a = R() * Math.PI * 2;
      const sp = 0.3 + R() * 0.7;
      dropP[i * 3] = x;
      dropP[i * 3 + 1] = y + 0.03;
      dropP[i * 3 + 2] = z;
      dropV[i * 3] = Math.cos(a) * sp;
      dropV[i * 3 + 1] = up * (0.7 + R() * 0.6);
      dropV[i * 3 + 2] = Math.sin(a) * sp;
      dropFloor[i] = y - 0.02;
    }
  };

  // ---------------------------------------------------------------- behaviour helpers
  const rm = env.reducedMotion;
  let riding = false;
  const offMount = on("world:mount", (d) => (riding = !!d?.riding));
  const av = new THREE.Vector3();
  const cam = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  let stamped = false;
  let stampClock = 0;
  let clock = 0;

  const splash = (x: number, z: number, gain: number) => {
    const d = Math.hypot(x - av.x, z - av.z);
    if (d > 20) return;
    const dx = x - cam.x;
    const dz = z - cam.z;
    const l = Math.hypot(dx, dz) || 1;
    sfx.play("splash", {
      pan: THREE.MathUtils.clamp(((camRight.x * dx + camRight.z * dz) / l) * 0.8, -1, 1),
      gain: gain * (1 - d / 20) * 0.7,
    });
  };

  const freeRock = (d: Duck, pick: (rk: Rock) => number): Rock | null => {
    let best: Rock | null = null;
    let bv = Infinity;
    for (const rk of d.zone.rocks) {
      if (rk.occ && rk.occ !== d) continue;
      const v2 = pick(rk);
      if (v2 < bv) {
        bv = v2;
        best = rk;
      }
    }
    return best;
  };
  const leaveRock = (d: Duck) => {
    if (d.rock && d.rock.occ === d) d.rock.occ = null;
    d.rock = null;
  };
  const waterY = (d: Duck, s: number, lat: number) => d.zone.path.at(s, lat, S).y;
  const faceUp = (d: Duck) => {
    d.zone.path.sample(d.s, S);
    return Math.atan2(-S.tx, -S.tz);
  };

  const hopTo = (d: Duck, x: number, y: number, z: number, rock: Rock | null, s: number, lat: number) => {
    leaveRock(d);
    d.mode = "hop";
    d.hx = d.x;
    d.hy = d.y;
    d.hz = d.z;
    d.tx = x;
    d.ty = y;
    d.tz = z;
    d.toRock = rock;
    if (rock) rock.occ = d;
    d.toS = s;
    d.toLat = lat;
    d.t = 0;
    d.dur = 0.42 + Math.min(0.35, Math.hypot(x - d.x, z - d.z) * 0.12);
    if (Math.hypot(x - d.x, z - d.z) > 0.05) d.yaw = Math.atan2(x - d.x, z - d.z);
  };
  const hopToRock = (d: Duck, rk: Rock) => hopTo(d, rk.x, rk.y, rk.z, rk, rk.s, rk.lat);
  const hopToWater = (d: Duck, s: number, lat: number) => {
    d.zone.path.at(s, lat, S);
    hopTo(d, S.x, S.y - WATERLINE * SIZE, S.z, null, s, lat);
  };
  const startRun = (d: Duck, toS: number, toLat: number, rock: Rock | null, speed: number) => {
    leaveRock(d);
    d.mode = "run";
    d.hy = d.y;
    d.t = 0;
    d.toS = THREE.MathUtils.clamp(toS, d.zone.lo, d.zone.hi);
    d.toLat = toLat;
    d.toRock = rock;
    if (rock) rock.occ = d;
    d.speed = speed;
    d.fx = 0;
  };
  const startSwim = (d: Duck) => {
    d.mode = "swim";
    d.timer = 3 + R() * 5;
  };
  /** Settle after a run/pop: swim if in a calm stretch, otherwise climb onto the nearest free rock. */
  const settle = (d: Duck) => {
    const sw = d.zone.swim;
    if (d.toRock) return hopToRock(d, d.toRock);
    if (sw && d.s >= sw[0] - 0.05 && d.s <= sw[1] + 0.05 && !env.sky.isNight()) return startSwim(d);
    const rk = freeRock(d, (r) => Math.abs(r.s - d.s));
    if (rk) hopToRock(d, rk);
    else startSwim(d);
  };
  const startDive = (d: Duck, toS: number) => {
    leaveRock(d);
    d.mode = "dive";
    d.t = 0;
    d.dur = 1.2 + R() * 1.4;
    d.toS = toS;
    d.toLat = (R() - 0.5) * 2 * d.zone.latMax(toS) * 0.7;
    spawnRing(d.x, waterY(d, d.s, d.lat), d.z, 0.28);
    spawnDrops(d.x, waterY(d, d.s, d.lat), d.z, 4, 1.2);
    splash(d.x, d.z, 0.5);
  };

  /** Nearest arc length on the zone's path to (x, z) (coarse; only used when something happens). */
  const nearestS = (zone: Zone, x: number, z: number) => {
    let best = 0;
    let bd = Infinity;
    const a = Math.max(0, zone.lo - 8);
    const b = Math.min(zone.path.length, zone.hi + 8);
    for (let q = a; q <= b; q += 0.25) {
      zone.path.sample(q, S);
      const dd = (S.x - x) ** 2 + (S.z - z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = q;
      }
    }
    return best;
  };

  const flush = (zone: Zone) => {
    const ps = nearestS(zone, av.x, av.z);
    for (const d of zone.ducks) {
      if (d.mode === "run" && d.cool > 0) continue;
      let dir = d.s >= ps ? 1 : -1;
      // No room that way (zone end): go the other way only if the traveler is still farther than the duck.
      const room = dir > 0 ? zone.hi - d.s : d.s - zone.lo;
      if (room < 1.2) dir = -dir;
      const want = d.s + dir * (3.6 + R() * 2.2);
      const target = THREE.MathUtils.clamp(want, zone.lo, zone.hi);
      const rk = freeRock(d, (r) =>
        Math.sign(r.s - d.s) === dir ? Math.abs(r.s - target) : 99 + Math.abs(r.s - target),
      );
      const sw = zone.swim;
      if (sw && R() < 0.3 && (d.mode === "swim" || d.mode === "float")) {
        startDive(d, THREE.MathUtils.clamp(want, sw[0], sw[1]));
      } else if (rk && Math.sign(rk.s - d.s) === dir) {
        startRun(d, rk.s, rk.lat, rk, 3.2 + R() * 0.6);
      } else {
        startRun(d, target, (R() - 0.5) * 0.6, null, 3.2 + R() * 0.6);
      }
      d.cool = 9 + R() * 4;
      d.timer = 3 + R() * 3;
    }
    splash(zone.cx, zone.cz, 0.9);
  };

  // ---------------------------------------------------------------- posing
  const mRoot = new THREE.Matrix4();
  const mLoc = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sz = new THREE.Vector3(SIZE, SIZE, SIZE);
  const qRoot = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const piv = new THREE.Vector3();

  const singles = [body, belly, streak, head, stripes, bill, eyes];
  const hideDuck = (i: number) => {
    for (const m of singles) m.setMatrixAt(i, hidden);
    for (let k = 0; k < 2; k++) {
      wings.setMatrixAt(i * 2 + k, hidden);
      legs.setMatrixAt(i * 2 + k, hidden);
    }
  };

  const pose = (
    i: number,
    d: Duck,
    a: {
      roll: number;
      headPitch: number;
      headYaw: number;
      headFwd: number;
      headUp: number;
      wing: number;
      flap: number;
      leg: number;
      tail: number;
    },
  ) => {
    eul.set(d.pitch + a.tail, d.yaw, a.roll, "YXZ");
    qRoot.setFromEuler(eul);
    pos.set(d.x, d.y, d.z);
    mRoot.compose(pos, qRoot, sz);
    body.setMatrixAt(i, mRoot);
    belly.setMatrixAt(i, mRoot);
    streak.setMatrixAt(i, mRoot);
    // Head group around the neck base.
    eul.set(a.headPitch, a.headYaw, 0, "YXZ");
    qa.setFromEuler(eul);
    piv.set(NECK.x, NECK.y + a.headUp, NECK.z + a.headFwd);
    mLoc.compose(piv, qa, one);
    mOut.multiplyMatrices(mRoot, mLoc);
    head.setMatrixAt(i, mOut);
    bill.setMatrixAt(i, mOut);
    eyes.setMatrixAt(i, mOut);
    stripes.setMatrixAt(i, d.male ? mOut : hidden);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : -1;
      // Folded: plate tilted onto the flank, tips crossing over the tail. Open: spread out and flapping.
      const open = a.wing;
      qa.setFromAxisAngle(Z, s * a.flap * open);
      qb.setFromAxisAngle(Y, -s * (open * 1.45 - (1 - open) * 0.07));
      qc.setFromAxisAngle(Z, -s * (1 - open) * 1.1);
      qa.multiply(qb).multiply(qc);
      piv.set(s * SHOULDER.x, SHOULDER.y, SHOULDER.z);
      mLoc.compose(piv, qa, one);
      wings.setMatrixAt(i * 2 + k, mOut.multiplyMatrices(mRoot, mLoc));
      qa.setFromAxisAngle(X, s * a.leg);
      piv.set(s * HIP.x, HIP.y, HIP.z);
      mLoc.compose(piv, qa, one);
      legs.setMatrixAt(i * 2 + k, mOut.multiplyMatrices(mRoot, mLoc));
    }
  };
  const A = { roll: 0, headPitch: 0, headYaw: 0, headFwd: 0, headUp: 0, wing: 0, flap: 0, leg: 0, tail: 0 };

  /** Pitch so the body follows the water surface (nose up when facing uphill). */
  const surfacePitch = (d: Duck) => {
    d.zone.path.sample(d.s, S);
    const fx = Math.sin(d.yaw);
    const fz = Math.cos(d.yaw);
    const rise = S.grade * (fx * S.tx + fz * S.tz);
    return THREE.MathUtils.clamp(-Math.atan(rise) * 0.85, -0.38, 0.38);
  };

  // ---------------------------------------------------------------- update
  let lastNight = env.sky.isNight();
  let shown = true;
  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      av.copy(avatar);
      // Far from every zone: nothing to animate.
      let near = Infinity;
      for (const z of zones) near = Math.min(near, Math.hypot(z.cx - av.x, z.cz - av.z));
      const show = near <= 90;
      if (show !== shown) {
        shown = show;
        for (const m of meshes) if (m !== rocks) m.visible = show;
      }
      if (!show) return;
      env.camera.getWorldPosition(cam);
      env.camera.getWorldDirection(camFwd);
      camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
      const night = env.sky.isNight();
      if (night !== lastNight) {
        lastNight = night;
        for (const d of ducks) d.timer = Math.min(d.timer, 0.5 + R() * 2);
      }
      const scare = riding ? 7.5 : 5.5;

      // Flush a whole pair when the traveler comes close.
      for (const zone of zones) {
        for (const d of zone.ducks) {
          const dd = Math.hypot(d.x - av.x, d.z - av.z);
          const r = d.cool > 0 ? scare * 0.45 : scare;
          if (dd < r && d.mode !== "run" && d.mode !== "dive" && d.mode !== "hop") {
            flush(zone);
            break;
          }
        }
      }

      for (let i = 0; i < n; i++) {
        const d = ducks[i]!;
        const zone = d.zone;
        d.cool = Math.max(0, d.cool - dt);
        d.timer -= dt;
        A.roll = 0;
        A.headPitch = 0;
        A.headYaw = 0;
        A.headFwd = 0;
        A.headUp = 0;
        A.wing = 0;
        A.flap = 0;
        A.leg = 0;
        A.tail = 0;
        d.visible = true;

        // Head bobbing (the torrent duck's constant nod) + looking around.
        d.bobT -= dt;
        if (d.bobT <= 0) {
          d.bob = 1;
          d.bobT = rm ? 1.6 + R() * 2 : 0.45 + R() * 1.3;
        }
        d.bob = Math.max(0, d.bob - dt * (rm ? 2.5 : 4.5));
        d.lookT -= dt;
        if (d.lookT <= 0) {
          d.lookT = 1.2 + R() * 2.8;
          d.look = (R() - 0.5) * 1.2;
        }
        d.headYaw += (d.look - d.headYaw) * Math.min(1, dt * 6);
        const nod = Math.sin(d.bob * Math.PI);

        switch (d.mode) {
          case "perch": {
            const rk = d.rock ?? d.home;
            d.x = rk.x;
            d.y = rk.y;
            d.z = rk.z;
            d.pitch = -0.08;
            if (night) {
              // Resting: head turned back onto the shoulders, tail down.
              A.headYaw = 2.5;
              A.headPitch = 0.75;
              A.headUp = -0.035;
              A.headFwd = -0.05;
              d.pitch = 0;
              A.tail = Math.sin(clock * 0.9 + i) * 0.01;
            } else {
              A.headPitch = nod * 0.5;
              A.headYaw = d.headYaw;
              A.tail = -nod * 0.1;
            }
            if (d.timer <= 0) {
              d.timer = 3 + R() * 6;
              if (night) {
                d.timer = 4;
                break;
              }
              const r = R();
              const atHome = d.rock === d.home;
              const far = Math.hypot(d.home.x - av.x, d.home.z - av.z) > 9;
              if (!atHome && d.cool <= 0 && far && R() < 0.6 && (!d.home.occ || d.home.occ === d)) {
                if (Math.abs(d.home.s - d.s) > 2.2) startRun(d, d.home.s, d.home.lat, d.home, 1.8);
                else hopToRock(d, d.home);
              } else if (r < 0.45 && zone.swim) {
                const sw = zone.swim;
                const s = THREE.MathUtils.clamp(d.s, sw[0] + 0.1, sw[1] - 0.1);
                if (Math.abs(s - d.s) < 2.6) hopToWater(d, s, (R() - 0.5) * zone.latMax(s));
              } else if (r < 0.7) {
                const rk2 = freeRock(d, (r2) => (r2 === d.rock ? 99 : Math.abs(r2.s - d.s) + R() * 0.8));
                if (rk2 && Math.abs(rk2.s - d.s) < 3) hopToRock(d, rk2);
              } else {
                d.yaw = faceUp(d) + (R() - 0.5) * 1.4;
              }
            }
            break;
          }
          case "hop": {
            d.t += dt / d.dur;
            const f = Math.min(1, d.t);
            const e = f * f * (3 - 2 * f);
            d.x = d.hx + (d.tx - d.hx) * e;
            d.z = d.hz + (d.tz - d.hz) * e;
            d.y = d.hy + (d.ty - d.hy) * e + Math.sin(f * Math.PI) * (0.18 + Math.abs(d.ty - d.hy) * 0.3);
            d.pitch = -0.25 * Math.sin(f * Math.PI);
            A.wing = Math.sin(f * Math.PI) * 0.75;
            A.flap = Math.sin(clock * 30) * 0.5;
            A.leg = 0.5 * Math.sin(f * Math.PI);
            if (f >= 1) {
              d.s = d.toS;
              d.lat = d.toLat;
              if (d.toRock) {
                d.mode = "perch";
                d.rock = d.toRock;
                d.toRock = null;
                d.timer = 2 + R() * 5;
                d.yaw = faceUp(d) + (R() - 0.5) * 0.9;
              } else {
                spawnRing(d.x, waterY(d, d.s, d.lat), d.z, 0.22);
                startSwim(d);
              }
            }
            break;
          }
          case "swim":
          case "float": {
            const sw = zone.swim ?? [d.s, d.s];
            const swimming = d.mode === "swim";
            d.paddle += dt * (rm ? 5 : swimming ? 9 : 4);
            const kick = Math.max(0, Math.sin(d.paddle));
            const ds = swimming ? -(0.5 + 0.7 * kick) + zone.flow : zone.flow * 0.75 - 0.15 * kick;
            d.s = THREE.MathUtils.clamp(d.s + ds * dt, sw[0], sw[1]);
            const lm = zone.latMax(d.s);
            d.lat = THREE.MathUtils.clamp(d.lat + Math.sin(clock * 0.7 + i * 2.1) * 0.15 * dt, -lm, lm);
            zone.path.at(d.s, d.lat, S);
            const up = Math.atan2(-S.tx, -S.tz);
            d.yaw += angDiff(up + Math.sin(clock * 1.3 + i) * 0.25, d.yaw) * Math.min(1, dt * 3);
            d.x = S.x;
            d.z = S.z;
            d.y = S.y - WATERLINE * SIZE + Math.sin(clock * 3 + i) * 0.006;
            d.pitch = surfacePitch(d) + (swimming ? -0.05 * kick : 0);
            A.headFwd = swimming ? 0.014 * Math.sin(d.paddle) : 0;
            A.headPitch = swimming ? -0.1 : nod * 0.35;
            A.headYaw = swimming ? 0 : d.headYaw * 0.6;
            A.leg = Math.sin(d.paddle) * 0.9;
            A.roll = Math.sin(d.paddle) * 0.04;
            // Little bow wave from the paddling.
            if (swimming && !rm) {
              d.fx -= dt;
              if (d.fx <= 0) {
                d.fx = 0.55 + R() * 0.3;
                spawnRing(d.x, S.y, d.z, 0.16);
              }
            }
            const atTop = d.s <= sw[0] + 0.02;
            const atBottom = d.s >= sw[1] - 0.02;
            if (night) {
              settle(d);
            } else if (swimming && (atTop || d.timer <= 0)) {
              const r = R();
              if (r < 0.4) startDive(d, sw[0] + R() * (sw[1] - sw[0]));
              else if (r < 0.75) {
                d.mode = "float";
                d.timer = 3 + R() * 4;
              } else {
                const rk = freeRock(d, (r2) => Math.abs(r2.s - d.s));
                if (rk && Math.abs(rk.s - d.s) < 3) hopToRock(d, rk);
                else startDive(d, sw[1] - R() * 0.4);
              }
            } else if (!swimming && (atBottom || d.timer <= 0)) {
              if (R() < 0.6) startSwim(d);
              else {
                const rk = freeRock(d, (r2) => Math.abs(r2.s - d.s));
                if (rk && Math.abs(rk.s - d.s) < 3) hopToRock(d, rk);
                else startSwim(d);
              }
            }
            break;
          }
          case "dive": {
            d.t += dt;
            const TIP = 0.38;
            if (d.t < TIP) {
              const f = d.t / TIP;
              zone.path.at(d.s, d.lat, S);
              d.x = S.x;
              d.z = S.z;
              d.y = S.y - WATERLINE * SIZE - f * f * 0.32 * SIZE + Math.sin(f * Math.PI) * 0.05;
              d.pitch = f * 1.25;
              A.tail = -f * 0.2;
              A.headPitch = 0.3 * f;
            } else {
              d.visible = false;
              const k = Math.min(1, dt * 1.1);
              d.s += (d.toS - d.s) * k;
              d.lat += (d.toLat - d.lat) * k;
              if (d.t >= TIP + d.dur) {
                zone.path.at(d.s, d.lat, S);
                d.x = S.x;
                d.z = S.z;
                d.mode = "pop";
                d.t = 0;
                d.yaw = Math.atan2(-S.tx, -S.tz) + (R() - 0.5) * 0.8;
                spawnRing(S.x, S.y, S.z, 0.32);
                spawnDrops(S.x, S.y, S.z, 6, 1.6);
                splash(S.x, S.z, 0.45);
              }
            }
            break;
          }
          case "pop": {
            d.t += dt / 0.45;
            const f = Math.min(1, d.t);
            zone.path.at(d.s, d.lat, S);
            d.x = S.x;
            d.z = S.z;
            d.y = S.y - WATERLINE * SIZE - (1 - f) * 0.2 * SIZE + Math.sin(f * Math.PI) * 0.06 * SIZE;
            d.pitch = -0.45 * (1 - f) + surfacePitch(d) * f;
            A.headPitch = -0.2 * (1 - f);
            if (f >= 1) {
              d.toRock = null;
              settle(d);
            }
            break;
          }
          case "run": {
            // Flutter-run: pattering over the surface with wings beating.
            d.t += dt;
            const dir = Math.sign(d.toS - d.s);
            const step = d.speed * dt * Math.min(1, 0.4 + d.t * 2.5);
            if (Math.abs(d.toS - d.s) <= step) d.s = d.toS;
            else d.s += dir * step;
            const lm = zone.latMax(d.s);
            d.lat += (THREE.MathUtils.clamp(d.toLat, -lm, lm) - d.lat) * Math.min(1, dt * 2.5);
            zone.path.at(d.s, d.lat, S);
            d.x = S.x;
            d.z = S.z;
            const surf = S.y + 0.015 * SIZE;
            const blend = Math.min(1, d.t * 4);
            d.y = d.hy + (surf - d.hy) * blend;
            if (dir !== 0) d.yaw = Math.atan2(S.tx * dir, S.tz * dir);
            d.pitch = surfacePitch(d) - 0.42;
            d.flap += dt * (rm ? 12 : 34);
            A.wing = 1;
            A.flap = Math.sin(d.flap) * (rm ? 0.5 : 0.85);
            A.leg = Math.sin(d.flap * 0.5) * 1.1;
            A.headPitch = 0.3;
            A.headFwd = 0.01;
            d.fx -= dt;
            if (d.fx <= 0) {
              d.fx = rm ? 0.25 : 0.08;
              spawnDrops(d.x, S.y, d.z, rm ? 1 : 2, 1.1);
              if (R() < 0.45) spawnRing(d.x, S.y, d.z, 0.16);
            }
            if (d.s === d.toS) {
              d.hx = d.x;
              settle(d);
            }
            break;
          }
        }

        if (!d.visible) hideDuck(i);
        else pose(i, d, A);
      }

      // Splash rings: grow and fade (additive, so dimming the color fades them out).
      for (let i = 0; i < nRing; i++) {
        if (ringT[i]! >= 1) {
          rings.setMatrixAt(i, hidden);
          continue;
        }
        ringT[i] = Math.min(1, ringT[i]! + dt / 0.9);
        const f = ringT[i]!;
        const r = ringP[i * 4 + 3]! * (0.35 + f * 1.6) * SIZE;
        pos.set(ringP[i * 4]!, ringP[i * 4 + 1]!, ringP[i * 4 + 2]!);
        mOut.makeScale(r, 1, r).setPosition(pos);
        rings.setMatrixAt(i, mOut);
        const a = (1 - f) ** 1.4 * 0.75;
        rings.setColorAt(i, col.setRGB(a, a, a));
      }
      for (let i = 0; i < nDrop; i++) {
        if (dropT[i]! >= 1) {
          drops.setMatrixAt(i, hidden);
          continue;
        }
        dropT[i] = Math.min(1, dropT[i]! + dt / 0.7);
        dropV[i * 3 + 1] = dropV[i * 3 + 1]! - 7 * dt;
        dropP[i * 3] = dropP[i * 3]! + dropV[i * 3]! * dt;
        dropP[i * 3 + 1] = dropP[i * 3 + 1]! + dropV[i * 3 + 1]! * dt;
        dropP[i * 3 + 2] = dropP[i * 3 + 2]! + dropV[i * 3 + 2]! * dt;
        if (dropP[i * 3 + 1]! < dropFloor[i]!) dropT[i] = 1;
        const r = 0.022 * (1 - dropT[i]! * 0.6) * (dropT[i]! >= 1 ? 0 : 1);
        pos.set(dropP[i * 3]!, dropP[i * 3 + 1]!, dropP[i * 3 + 2]!);
        mOut.makeScale(r, r * 1.3, r).setPosition(pos);
        drops.setMatrixAt(i, mOut);
      }
      for (const m of meshes) if (m !== rocks) m.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;

      // Stamp on the first good look: close, in front of the camera, above water.
      stampClock += dt;
      if (!stamped && stampClock > 0.25) {
        stampClock = 0;
        for (const d of ducks) {
          if (!d.visible) continue;
          const dAv = Math.hypot(d.x - av.x, d.z - av.z);
          const dx = d.x - cam.x;
          const dy = d.y - cam.y;
          const dz = d.z - cam.z;
          const dc = Math.hypot(dx, dy, dz) || 1;
          if ((dAv > 12 && dc > 14) || (dx * camFwd.x + dy * camFwd.y + dz * camFwd.z) / dc < 0.55) continue;
          stamped = true;
          emit("world:stamp", STAMP);
          break;
        }
      }
    },
    dispose() {
      offMount();
      for (const m of meshes) {
        env.scene.remove(m);
        m.geometry.dispose();
        m.dispose();
      }
      ringMat.dispose();
      dropMat.dispose();
    },
  };
};
