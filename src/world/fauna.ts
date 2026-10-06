/**
 * Andean fauna (ambient system): vicuña and alpaca herds on the grassy slopes, vizcacha colonies by the
 * big rocks, condors circling over the gorge and the summit, and a small llama caravan on the Qhapaq Ñan.
 *
 * - Rendering: one InstancedMesh per species × body part on a white toon material with per-instance coat
 *   colors (same pattern as the rocks/ichu), so the whole bestiary is ~30 draw calls and keeps the ink.
 * - Motion: leader-follow boids (fauna-sim.ts) + procedural pacing gaits; necks pitch to graze and turn
 *   to watch the traveler; herds drift away and bolt if the traveler runs at them.
 * - Budget: ≈55 animals on high, ≈32 on low; herds farther than 120 u step at 4 Hz.
 * - Interact: E right next to an alpaca shows a tiny text bubble; anything else returns false.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient, WorldEnv } from "./contract";
import { ALPACA, type CamelidSpec, camelidParts, condorParts, LLAMA, VICUNA, vizcachaParts } from "./fauna-models";
import {
  type Agent,
  BOUND,
  clamp,
  damp,
  type FlockParams,
  flockStep,
  type GroundRules,
  gaitAmp,
  gaitPhase,
  goodGround,
  herdSizes,
  hopArc,
  legLift,
  legSwing,
  moveAgent,
  mulberry,
  PACE,
  pointHash,
  shouldStep,
  TAU,
  turnToward,
  wrapAngle,
} from "./fauna-sim";

const NEAR = 120;
const FAR_STEP = 0.25;
const RUN_SPEED = 5;
const HELLO_R = 3.5;

type Species = "vicuna" | "alpaca" | "llama";

interface Beast extends Agent {
  y: number;
  yaw: number;
  pitch: number;
  phase: number;
  amp: number;
  bound: number;
  neckPitch: number;
  neckYaw: number;
  headPitch: number;
  graze: boolean;
  grazeT: number;
  scale: number;
  slot: number;
  tail: number;
  hop: number;
  seed: number;
}

interface Herd {
  species: Species;
  spec: CamelidSpec;
  members: Beast[];
  home: { x: number; z: number };
  leash: number;
  goal: { x: number; z: number } | null;
  goalT: number;
  acc: number;
  params: FlockParams;
  rules: GroundRules;
}

// Coat palettes (flat toon colors).
const VICUNA_COAT = ["#c58d55", "#c99358", "#bd8650"];
const ALPACA_COAT = ["#efe6d6", "#e8dcc4", "#8a5a3b", "#6f4a33", "#2e2a27", "#9a948c", "#c9a27a"];
const LLAMA_COAT = ["#f1ebe0", "#7a4e33", "#3a302b", "#b98a5e"];
const DYES = ["#c4383f", "#3446a6", "#dda63c", "#2a9d8f"];
const BELLY = "#f1e7d6";
const EYE = "#1f1a17";

const HELLO = {
  es: ["¡Hola!", "Mmm-hmm… ♪", "¡Qué tal, viajero!"],
  en: ["Hello!", "Mmm-hmm… ♪", "Hi there, traveler!"],
};
const PROMPT = { es: "E · Saludar", en: "E · Say hi" };

/** One InstancedMesh per part, colored per instance. */
class Part {
  mesh: THREE.InstancedMesh;
  constructor(env: WorldEnv, geo: THREE.BufferGeometry, count: number, name: string, shadow: boolean) {
    this.mesh = new THREE.InstancedMesh(geo, env.toon("#ffffff"), Math.max(1, count));
    this.mesh.name = `fauna-${name}`;
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const white = new THREE.Color("#ffffff");
    for (let i = 0; i < Math.max(1, count); i++) this.mesh.setColorAt(i, white);
  }
  set(i: number, m: THREE.Matrix4) {
    this.mesh.setMatrixAt(i, m);
  }
  color(i: number, c: THREE.ColorRepresentation) {
    this.mesh.setColorAt(i, new THREE.Color(c));
  }
  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  commitColors() {
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- matrix helpers (shared temporaries)
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _l = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function rootMatrix(
  out: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  s: number,
  sy = s,
) {
  _q.setFromEuler(_e.set(pitch, yaw, roll, "YXZ"));
  return out.compose(_v.set(x, y, z), _q, _s.set(s, sy, s));
}
/** out = parent × T(p) × R(yaw, pitch, roll). */
function child(out: THREE.Matrix4, parent: THREE.Matrix4, p: THREE.Vector3, pitch: number, yaw = 0, roll = 0) {
  _l.makeRotationFromEuler(_e.set(pitch, yaw, roll, "YXZ"));
  _l.setPosition(p);
  return out.multiplyMatrices(parent, _l);
}

export const createFauna: CreateAmbient = (env: WorldEnv, hudRoot: HTMLElement): Ambient => {
  const R = mulberry(7319);
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const motion = rm ? 0.5 : 1;
  const group = new THREE.Group();
  group.name = "fauna";
  env.scene.add(group);
  const geos: THREE.BufferGeometry[] = [];
  const parts: Part[] = [];
  const part = (geo: THREE.BufferGeometry, count: number, name: string, shadow = false) => {
    geos.push(geo);
    const p = new Part(env, geo, count, name, shadow && high);
    parts.push(p);
    group.add(p.mesh);
    return p;
  };

  // ---------------------------------------------------------------- ground rules
  const trail = env.trail;
  const stationXZ: Array<[number, number]> = [];
  for (const id of [
    "gate",
    "avances",
    "hundred",
    "belcorp",
    "auna",
    "xepelin",
    "topsort",
    "globant",
    "bridge",
    "arcade",
    "ai",
    "contact",
    "build-1",
    "build-2",
    "build-3",
  ]) {
    try {
      const p = env.stationPose(id).position;
      stationXZ.push([p.x, p.z]);
    } catch {
      /* station missing in this env */
    }
  }
  const tambos = ["avances", "hundred", "belcorp", "auna", "xepelin", "topsort", "globant"].flatMap((id) => {
    try {
      return [env.stationPose(id)];
    } catch {
      return [];
    }
  });
  const nearStation = (x: number, z: number, r: number) => stationXZ.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < r);
  // Distance to the trail centerline, from a sparse hash of points every ~1 u (trail.nearestT scans the whole
  // polyline for points far from the path, which is most of where animals live).
  const trailPts: Array<[number, number]> = [];
  const nPts = Math.ceil(trail.length);
  for (let i = 0; i <= nPts; i++) {
    const p = trail.pointAt(i / nPts);
    trailPts.push([p.x, p.z]);
  }
  const trailDist = pointHash(trailPts, 8);

  // Optional grass oracle from core (not in the contract yet): duck-typed and validated.
  const extra = (env as unknown as { extra?: Record<string, unknown> }).extra;
  const isGrass = typeof extra?.isGrass === "function" ? (extra.isGrass as (x: number, z: number) => boolean) : null;
  const randomGrass =
    typeof extra?.randomGrassPoint === "function" ? (extra.randomGrassPoint as (r: () => number) => unknown) : null;
  const rules = (minY: number, maxY: number, stationR: number, trailR: number): GroundRules => ({
    heightAt: env.heightAt,
    walkable: (x, z) =>
      env.walkable(x, z) ||
      nearStation(x, z, stationR) ||
      trailDist(x, z) < trailR ||
      (isGrass ? !isGrass(x, z) : false),
    inside: (x, z) => Math.hypot(x, z) < 158,
    minY,
    maxY,
    maxSlope: 0.6,
  });
  const valley = rules(1.9, 24, 14, trail.halfWidth + 1);
  const puna = rules(6, 52, 12, trail.halfWidth + 3);
  /** A good spot near (cx, cz) within radius r (falls back to anywhere on the island). */
  const findSpot = (r: GroundRules, cx: number, cz: number, rad: number, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const a = R() * TAU;
      const d = Math.sqrt(R()) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (goodGround(r, x, z)) return { x, z };
    }
    return null;
  };
  const grassSpot = (r: GroundRules) => {
    if (randomGrass) {
      try {
        const p = randomGrass(R) as { x?: unknown; z?: unknown } | null;
        if (p && typeof p.x === "number" && typeof p.z === "number" && goodGround(r, p.x, p.z))
          return { x: p.x, z: p.z };
      } catch {
        /* incompatible signature: fall back */
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- herds (vicuña, alpaca)
  const herds: Herd[] = [];
  const homes: Array<{ x: number; z: number }> = [];
  const farFromHomes = (x: number, z: number, d: number) => homes.every((h) => Math.hypot(h.x - x, h.z - z) > d);
  /** Herd home: a good spot within `band` of the trail (so the traveler meets them), spread apart. */
  /** Open ground all the way from (x, z) to the edge of the path (no terrace wall or cliff in between). */
  const reachesTrail = (r: GroundRules, x: number, z: number) => {
    const tp = trail.pointAt(trail.nearestT(x, z));
    const d = Math.hypot(tp.x - x, tp.z - z);
    const edge = trail.halfWidth + 0.9;
    for (let k = 0; k <= d - edge; k += 0.8) {
      const u = k / d;
      if (!goodGround(r, x + (tp.x - x) * u, z + (tp.z - z) * u)) return false;
    }
    return true;
  };
  const pickHome = (
    r: GroundRules,
    band: [number, number],
    near?: { x: number; z: number; rad: number },
    trailside = false,
  ) => {
    for (let i = 0; i < 400; i++) {
      let p: { x: number; z: number } | null = null;
      if (near) p = findSpot(r, near.x, near.z, near.rad, 1);
      else p = grassSpot(r) ?? findSpot(r, 0, 0, 150, 1);
      if (!p) continue;
      const d = trailDist(p.x, p.z);
      if (d < band[0] || d > band[1] || !farFromHomes(p.x, p.z, 26)) continue;
      // Enough room to graze around it.
      let room = 0;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        if (goodGround(r, p.x + Math.cos(a) * 5, p.z + Math.sin(a) * 5)) room++;
      }
      if (room < 4 || (trailside && !reachesTrail(r, p.x, p.z))) continue;
      homes.push(p);
      return p;
    }
    return null;
  };

  const vicunaParams: FlockParams = {
    speed: 1.1 * motion,
    fleeSpeed: 6.5 * motion,
    separation: 1.6,
    cohesion: 2.6,
    wary: 16,
    panic: 7,
    agility: 2.4,
  };
  const alpacaParams: FlockParams = {
    speed: 0.8 * motion,
    fleeSpeed: 3.2 * motion,
    separation: 1.5,
    cohesion: 2.2,
    wary: 6,
    panic: 2.5,
    agility: 2,
    // Domestic: they only look up at a walking traveler; running at them still scatters the herd.
    onlyRunners: true,
  };

  const vicunaHerds = herdSizes(high ? 3 : 2, 4, high ? 7 : 6, R);
  const alpacaHerds = herdSizes(high ? 4 : 3, 3, high ? 5 : 4, R);
  const mkBeast = (x: number, z: number, slot: number, scale: number): Beast => ({
    x,
    z,
    vx: 0,
    vz: 0,
    y: env.heightAt(x, z),
    yaw: R() * TAU,
    pitch: 0,
    phase: R(),
    amp: 0,
    bound: 0,
    neckPitch: 0,
    neckYaw: 0,
    headPitch: 0,
    graze: R() < 0.6,
    grazeT: 2 + R() * 6,
    scale,
    slot,
    tail: 0,
    hop: 0,
    seed: R() * 100,
  });
  const counts = { vicuna: 0, alpaca: 0, llama: 0 };
  const addHerd = (species: "vicuna" | "alpaca", size: number, r: GroundRules, home: { x: number; z: number }) => {
    const members: Beast[] = [];
    for (let i = 0; i < size; i++) {
      const p = findSpot(r, home.x, home.z, 4 + size * 0.6, 30) ?? home;
      members.push(mkBeast(p.x, p.z, counts[species]++, species === "vicuna" ? 0.95 + R() * 0.12 : 0.9 + R() * 0.18));
    }
    herds.push({
      species,
      spec: species === "vicuna" ? VICUNA : ALPACA,
      members,
      home,
      leash: species === "vicuna" ? 16 : 9,
      goal: null,
      goalT: R() * 4,
      acc: 0,
      params: species === "vicuna" ? vicunaParams : alpacaParams,
      rules: r,
    });
  };
  for (const size of vicunaHerds) {
    const h = pickHome(puna, [12, 55]);
    if (h) addHerd("vicuna", size, puna, h);
  }
  // Alpacas: the first herds graze below company tambos (kept >14 u from the plaza so E stays the tambo's).
  const tamboOrder = [...tambos].sort(() => R() - 0.5);
  for (const [i, size] of alpacaHerds.entries()) {
    const tb = i < 2 ? tamboOrder[i] : undefined;
    // Tambo herds graze just past the curb, so a traveler on the path can walk up and say hi.
    const alpacaRules = rules(1.9, 40, 14, trail.halfWidth + 0.6);
    const h = tb
      ? (pickHome(alpacaRules, [4, 9], { x: tb.position.x, z: tb.position.z, rad: 30 }, true) ??
        pickHome(alpacaRules, [4, 9], undefined, true) ??
        pickHome(valley, [8, 45]))
      : pickHome(valley, [8, 45]);
    if (h) addHerd("alpaca", size, tb ? alpacaRules : valley, h);
  }

  // Vicuñas belong to the high puna: extra herds spread along the upper trail so the climb never goes quiet.
  // Puna ground isn't painted as grass, so these rules skip the grass test (slope/height still apply).
  const upper: GroundRules = {
    ...rules(18, 82, 12, trail.halfWidth + 3),
    walkable: (x, z) => env.walkable(x, z) || nearStation(x, z, 12) || trailDist(x, z) < trail.halfWidth + 3,
    maxSlope: 1.1,
  };
  // Close to the path (6–22 u) so they're actually met: by the khipu board, along the gorge, at the summit.
  for (const t of high ? [0.45, 0.55, 0.66, 0.78, 0.88, 0.96] : [0.5, 0.7, 0.92]) {
    const tp = trail.pointAt(t);
    const h =
      pickHome(upper, [6, 22], { x: tp.x, z: tp.z, rad: 26 }) ??
      pickHome(upper, [4, 40], { x: tp.x, z: tp.z, rad: 44 });
    if (h) addHerd("vicuna", 3 + Math.floor(R() * 3), upper, h);
  }

  // Alpacas grazing by the Khipu de escritos (an off-trail plaza the herds above never reach).
  {
    let pose: THREE.Vector3 | null = null;
    try {
      pose = env.stationPose("build-2").position;
    } catch {
      /* not placed */
    }
    if (pose) {
      const byBoard: GroundRules = {
        ...rules(1.9, 82, 6, trail.halfWidth + 1),
        walkable: (x, z) =>
          env.walkable(x, z) || trailDist(x, z) < trail.halfWidth + 1 || Math.hypot(x - pose.x, z - pose.z) < 7,
        maxSlope: 0.9,
      };
      const h = pickHome(byBoard, [5, 40], { x: pose.x, z: pose.z, rad: 18 });
      if (h) addHerd("alpaca", high ? 4 : 3, byBoard, h);
    }
  }

  // The summit is a narrow peak (pickHome wants room to graze): a small herd on the last open ledge.
  summit: for (let t = 0.97; t > 0.86; t -= 0.01) {
    const tp = trail.pointAt(t);
    const tg = trail.tangentAt(t);
    for (const side of [1, -1])
      for (let lat = 5; lat <= 13; lat += 2) {
        const x = tp.x - tg.z * side * lat;
        const z = tp.z + tg.x * side * lat;
        if (!goodGround(upper, x, z) || !farFromHomes(x, z, 10)) continue;
        let room = 0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          if (goodGround(upper, x + Math.cos(a) * 2.5, z + Math.sin(a) * 2.5)) room++;
        }
        if (room < 3) continue;
        const home = { x, z };
        homes.push(home);
        addHerd("vicuna", high ? 4 : 3, upper, home);
        break summit;
      }
  }

  // ---------------------------------------------------------------- caravan (llamas on the trail)
  const caravanN = high ? 3 : 2;
  // Ping-pong on the paved stretch below the gorge: stop where the ground leaves the trail profile.
  let tMax = 0.62;
  for (let t = 0.05; t < 0.66; t += 0.002) {
    const p = trail.pointAt(t);
    if (Math.abs(env.heightAt(p.x, p.z) - p.y) > 1) {
      tMax = t - 0.02;
      break;
    }
    tMax = t;
  }
  const tMin = 0.035;
  const spacing = 2.4 / trail.length;
  const startT = Math.min(tMax, 0.13);
  const caravan = {
    dir: -1,
    pause: 0,
    // Each llama keeps its own t; the one furthest along the walking direction leads, the rest follow.
    llamas: Array.from({ length: caravanN }, (_, i) => ({
      ...mkBeast(0, 0, i, 1 + (i === 0 ? 0.06 : -0.03 * i)),
      t: startT + spacing * i,
      lat: -0.75,
      latGoal: -0.75,
    })),
  };
  counts.llama = caravanN;

  // ---------------------------------------------------------------- vizcachas (colonies by big rocks)
  interface Rock {
    x: number;
    z: number;
    y: number;
    r: number;
  }
  const rocks: Rock[] = [];
  const rockMesh = env.scene.getObjectByName("rocks");
  if (rockMesh instanceof THREE.InstancedMesh) {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    for (let i = 0; i < rockMesh.count; i++) {
      rockMesh.getMatrixAt(i, m);
      m.decompose(pos, qq, sc);
      const big = Math.max(sc.x, sc.y, sc.z);
      if (big < 1.5) continue;
      rocks.push({ x: pos.x, z: pos.z, y: pos.y, r: big * 0.95 });
    }
  }
  const colonyN = high ? 4 : 2;
  const vizRules = rules(2.5, 56, 10, trail.halfWidth + 2);
  const colonySites: Rock[] = [];
  const rockOrder = rocks
    .map((rk) => ({ rk, d: trailDist(rk.x, rk.z) }))
    .filter(({ rk, d }) => {
      if (d < rk.r + 4 || d > 45 || nearStation(rk.x, rk.z, 12)) return false;
      // Gentle ground all around the rock, so the colony can circle it.
      let ok = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        if (goodGround(vizRules, rk.x + Math.cos(a) * (rk.r + 1), rk.z + Math.sin(a) * (rk.r + 1))) ok++;
      }
      return ok >= 6;
    })
    .sort((a, b) => a.d - b.d + (R() - 0.5) * 30);
  for (const { rk } of rockOrder) {
    if (colonySites.length >= colonyN) break;
    if (colonySites.every((c) => Math.hypot(c.x - rk.x, c.z - rk.z) > 30)) colonySites.push(rk);
  }
  // Fallback (no rock mesh, e.g. a mock env): open ground; they hide by crouching instead.
  for (let i = 0; colonySites.length < colonyN && i < 40; i++) {
    const p = pickHome(vizRules, [8, 35]);
    if (p) colonySites.push({ x: p.x, z: p.z, y: env.heightAt(p.x, p.z), r: 0 });
  }
  interface Viz {
    x: number;
    z: number;
    y: number;
    yaw: number;
    from: { x: number; z: number };
    to: { x: number; z: number };
    hopT: number;
    hopping: boolean;
    rest: number;
    hide: number;
    crouch: number;
    headYaw: number;
    headPitch: number;
    twitch: number;
    homeA: number;
    rock: Rock;
    slot: number;
    seed: number;
  }
  const vizs: Viz[] = [];
  for (const rock of colonySites) {
    const n = 2 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU;
      const d = rock.r + 0.5 + R() * 1.6;
      const x = rock.x + Math.cos(a) * d;
      const z = rock.z + Math.sin(a) * d;
      vizs.push({
        x,
        z,
        y: env.heightAt(x, z),
        yaw: R() * TAU,
        from: { x, z },
        to: { x, z },
        hopT: 0,
        hopping: false,
        rest: 1 + R() * 5,
        hide: 0,
        crouch: 0,
        headYaw: 0,
        headPitch: 0,
        twitch: 0,
        homeA: a,
        rock,
        slot: vizs.length,
        seed: R() * 100,
      });
    }
  }

  // ---------------------------------------------------------------- condors
  const summit = trail.pointAt(1);
  let gorgeP = trail.pointAt(0.68);
  try {
    gorgeP = env.stationPose("bridge").position.clone();
  } catch {
    /* use trail point */
  }
  const condorN = high ? 3 : 2;
  const condors = Array.from({ length: condorN }, (_, i) => {
    const overGorge = i !== 1;
    const c = overGorge ? gorgeP : summit;
    return {
      cx: c.x + (i === 2 ? 14 : 0),
      cz: c.z + (i === 2 ? -10 : 0),
      base: c.y + (overGorge ? 26 : 22) + i * 5,
      r0: 26 + i * 7,
      a: R() * TAU,
      w: (i % 2 ? -1 : 1) * 1,
      flap: 0,
      flapT: 3 + R() * 6,
      swoop: 0,
      swoopT: 20 + R() * 20,
      yaw: 0,
      bank: 0,
      wing: 0.12,
      x: 0,
      y: 0,
      z: 0,
      seed: R() * 100,
    };
  });

  // ---------------------------------------------------------------- meshes
  const V = camelidParts(VICUNA);
  const A = camelidParts(ALPACA);
  const L = camelidParts(LLAMA);
  const nV = counts.vicuna;
  const nA = counts.alpaca;
  const nL = counts.llama;
  const mk = (pfx: string, g: ReturnType<typeof camelidParts>, n: number, belly: boolean) => ({
    body: part(g.body, n, `${pfx}-body`, true),
    belly: belly ? part(g.belly, n, `${pfx}-belly`) : null,
    neck: part(g.neck, n, `${pfx}-neck`, true),
    head: part(g.head, n, `${pfx}-head`, true),
    eyes: part(g.eyes, n, `${pfx}-eyes`),
    legs: part(g.leg, n * 4, `${pfx}-legs`, true),
    tail: part(g.tail, n, `${pfx}-tail`),
  });
  const vP = mk("vicuna", V, nV, true);
  const aP = mk("alpaca", A, nA, false);
  const lP = mk("llama", L, nL, true);
  const tassel = part(A.tassel, nA, "alpaca-tassels");
  const packCloth = part(L.packCloth, nL, "llama-pack-cloth", true);
  const packBags = part(L.packBags, nL, "llama-pack-bags", true);
  // Species-specific extras the others don't use.
  for (const g of [V.tassel, V.packCloth, V.packBags, A.belly, A.packCloth, A.packBags, L.tassel]) g.dispose();

  // Coats.
  const tasseled = new Set<number>();
  for (const h of herds)
    for (const b of h.members) {
      if (h.species === "vicuna") {
        const c = VICUNA_COAT[Math.floor(R() * VICUNA_COAT.length)] as string;
        for (const p of [vP.body, vP.neck, vP.head, vP.tail]) p.color(b.slot, c);
        vP.belly?.color(b.slot, BELLY);
        for (let k = 0; k < 4; k++) vP.legs.color(b.slot * 4 + k, c);
        vP.eyes.color(b.slot, EYE);
      } else {
        const c = ALPACA_COAT[Math.floor(R() * ALPACA_COAT.length)] as string;
        for (const p of [aP.body, aP.neck, aP.head, aP.tail]) p.color(b.slot, c);
        for (let k = 0; k < 4; k++) aP.legs.color(b.slot * 4 + k, c);
        aP.eyes.color(b.slot, c === "#2e2a27" ? "#0d0b0a" : EYE);
        if (R() < 0.4) {
          tasseled.add(b.slot);
          tassel.color(b.slot, DYES[Math.floor(R() * DYES.length)] as string);
        }
      }
    }
  caravan.llamas.forEach((b, i) => {
    const c = LLAMA_COAT[i % LLAMA_COAT.length] as string;
    for (const p of [lP.body, lP.neck, lP.head, lP.tail]) p.color(b.slot, c);
    lP.belly?.color(b.slot, i % 2 ? "#e9dcc4" : c);
    for (let k = 0; k < 4; k++) lP.legs.color(b.slot * 4 + k, c);
    lP.eyes.color(b.slot, EYE);
    packCloth.color(b.slot, DYES[i % DYES.length] as string);
    packBags.color(b.slot, "#8a5a3b");
  });

  const Z = vizcachaParts();
  const nZ = vizs.length;
  const zBody = part(Z.body, nZ, "vizcacha-body", true);
  const zHead = part(Z.head, nZ, "vizcacha-head", true);
  const zEyes = part(Z.eyes, nZ, "vizcacha-eyes");
  const zTail = part(Z.tail, nZ, "vizcacha-tail");
  for (const v of vizs) {
    const c = R() < 0.5 ? "#9b968e" : "#a8a197";
    zBody.color(v.slot, c);
    zHead.color(v.slot, c);
    zTail.color(v.slot, "#5f5a54");
    zEyes.color(v.slot, EYE);
  }

  const C = condorParts();
  const cBody = part(C.body, condorN, "condor-body");
  const cCollar = part(C.collar, condorN, "condor-collar");
  const cHead = part(C.head, condorN, "condor-head");
  const cWingR = part(C.wingR, condorN, "condor-wing-r");
  const cWingL = part(C.wingL, condorN, "condor-wing-l");
  const cPatchR = part(C.patchR, condorN, "condor-patch-r");
  const cPatchL = part(C.patchL, condorN, "condor-patch-l");
  for (let i = 0; i < condorN; i++) {
    for (const p of [cBody, cWingR, cWingL]) p.color(i, "#1f1d1f");
    for (const p of [cCollar, cPatchR, cPatchL]) p.color(i, "#f3efe6");
    cHead.color(i, "#a06a5c");
  }
  for (const p of parts) p.commitColors();

  // ---------------------------------------------------------------- traveler tracking
  const prev = new THREE.Vector3();
  let havePrev = false;
  let travelerSpeed = 0;

  // ---------------------------------------------------------------- per-animal pose + matrices
  const mRoot = new THREE.Matrix4();
  const mNeck = new THREE.Matrix4();
  const mHead = new THREE.Matrix4();
  const mTmp = new THREE.Matrix4();
  const headWorld = new THREE.Vector3();

  /** Shared camelid locomotion + head behavior. `look` = traveler to watch (or null). */
  const animateBeast = (
    b: Beast,
    spec: CamelidSpec,
    dt: number,
    look: THREE.Vector3 | null,
    alarm: number,
    stride: number,
  ) => {
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0.12) b.yaw = turnToward(b.yaw, Math.atan2(b.vx, b.vz), dt * (2.5 + speed));
    b.y = env.heightAt(b.x, b.z);
    const e = spec.bodyLen + 0.2;
    const fx = Math.sin(b.yaw) * e;
    const fz = Math.cos(b.yaw) * e;
    const slope = Math.atan2(env.heightAt(b.x - fx, b.z - fz) - env.heightAt(b.x + fx, b.z + fz), e * 2);
    b.pitch = damp(b.pitch, clamp(slope, -0.4, 0.4), 6, dt);
    b.phase = gaitPhase(b.phase, speed, dt, stride * b.scale);
    b.amp = damp(b.amp, gaitAmp(speed, 1.2, speed > 3 ? 0.75 : 0.5), 8, dt);
    b.bound = damp(b.bound, speed > 3 ? 1 : 0, 4, dt);
    // Grazing toggles while resting; alert animals hold the head high and watch.
    b.grazeT -= dt;
    if (b.grazeT <= 0) {
      b.graze = !b.graze;
      b.grazeT = b.graze ? 4 + R() * 8 : 2 + R() * 4;
    }
    let np = 0.05;
    let ny = Math.sin(b.seed + performance.now() * 0.0004) * 0.25;
    let headAbs = 0.18;
    if (look && (alarm > 0.02 || Math.hypot(look.x - b.x, look.z - b.z) < 14)) {
      ny = clamp(wrapAngle(Math.atan2(look.x - b.x, look.z - b.z) - b.yaw), -1.2, 1.2);
      np = -0.1;
      headAbs = 0.05;
    } else if (b.graze && speed < 0.25) {
      np = spec.fluffy ? 2.3 : 2.7;
      ny = Math.sin(b.seed + performance.now() * 0.0007) * 0.18;
      headAbs = 1.25;
    }
    b.neckPitch = damp(b.neckPitch, np, 2.6, dt);
    b.neckYaw = damp(b.neckYaw, ny, 3, dt);
    b.headPitch = headAbs - b.neckPitch;
    b.tail = Math.sin(performance.now() * 0.006 + b.seed) * (speed > 0.3 ? 0.35 : 0.08);
  };

  type CamelidMeshes = ReturnType<typeof mk>;
  const writeBeast = (
    b: Beast,
    P: CamelidMeshes,
    rig: ReturnType<typeof camelidParts>["rig"],
    extras?: (root: THREE.Matrix4, head: THREE.Matrix4) => void,
  ) => {
    const offs = b.bound > 0.5 ? BOUND : PACE;
    let lift = 0;
    for (let k = 0; k < 4; k++) lift += legLift(b.phase, k, offs);
    const bob = b.amp * 0.05 * (lift / 2 - 0.5) + b.hop;
    // Grazing dips the front a touch (forelegs splay).
    const dip = clamp(b.neckPitch / 2.6, 0, 1) * 0.18;
    rootMatrix(mRoot, b.x, b.y + bob, b.z, b.yaw, b.pitch + dip, 0, b.scale);
    P.body.set(b.slot, mRoot);
    P.belly?.set(b.slot, mRoot);
    child(mNeck, mRoot, rig.neck, b.neckPitch, b.neckYaw);
    P.neck.set(b.slot, mNeck);
    child(mHead, mNeck, rig.headOnNeck, b.headPitch);
    P.head.set(b.slot, mHead);
    P.eyes.set(b.slot, mHead);
    for (let k = 0; k < 4; k++) {
      const sw = legSwing(b.phase, k, b.amp, offs) - (k < 2 ? dip : 0);
      P.legs.set(b.slot * 4 + k, child(mTmp, mRoot, rig.hips[k] as THREE.Vector3, sw));
    }
    P.tail.set(b.slot, child(mTmp, mRoot, rig.tail, 0.2, b.tail));
    extras?.(mRoot, mHead);
  };

  // ---------------------------------------------------------------- herd step
  const threat = { x: 0, z: 0, running: false };
  const stepHerd = (h: Herd, dt: number, av: THREE.Vector3) => {
    const lead = h.members[0];
    if (!lead) return;
    // Curious alpacas: a calm traveler lingering nearby draws the herd over to the edge of the path
    // (the leash stretches while they are curious).
    let curious = false;
    if (h.species === "alpaca" && travelerSpeed < RUN_SPEED) {
      const dx = lead.x - av.x;
      const dz = lead.z - av.z;
      const d = Math.hypot(dx, dz);
      if (d < 20 && d > 2.2) {
        h.goal = { x: av.x + (dx / d) * 1.9, z: av.z + (dz / d) * 1.9 };
        h.goalT = 3;
        curious = true;
      }
    }
    h.goalT -= dt;
    const away = Math.hypot(lead.x - h.home.x, lead.z - h.home.z);
    if (away > h.leash * (curious ? 2.6 : 1.6)) h.goal = { ...h.home };
    else if (h.goalT <= 0) {
      if (h.goal || R() < 0.35) {
        h.goal = null; // rest and graze
        h.goalT = 6 + R() * 10;
      } else {
        h.goal = findSpot(h.rules, h.home.x, h.home.z, h.leash, 12);
        h.goalT = 10 + R() * 8;
      }
    }
    if (h.goal && Math.hypot(h.goal.x - lead.x, h.goal.z - lead.z) < 0.6) {
      h.goal = null;
      h.goalT = 5 + R() * 8;
    }
    threat.x = av.x;
    threat.z = av.z;
    threat.running = travelerSpeed > RUN_SPEED;
    const alarm = flockStep(h.members, h.goal, threat, h.params, dt);
    const stride = h.species === "vicuna" ? 1.15 : 0.85;
    for (const [i, b] of h.members.entries()) {
      const bad = !goodGround(h.rules, b.x, b.z);
      moveAgent(b, dt, (x, z) => bad || goodGround(h.rules, x, z));
      animateBeast(b, h.spec, dt, av, alarm[i] ?? 0, stride);
    }
  };

  // ---------------------------------------------------------------- caravan step
  const tp = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const stepCaravan = (dt: number, av: THREE.Vector3) => {
    const len = trail.length;
    const dir = caravan.dir;
    // Order along the walking direction: [leader, follower, ...].
    const order = [...caravan.llamas].sort((p, q) => (q.t - p.t) * dir);
    const lead = order[0];
    let blocked = false;
    let close = false;
    for (const l of caravan.llamas) if (Math.hypot(av.x - l.x, av.z - l.z) < 7) close = true;
    if (lead) {
      // The traveler on the path just ahead of the leader: wait for them to pass.
      const dx = av.x - lead.x;
      const dz = av.z - lead.z;
      const fwd = Math.sin(lead.yaw) * dx + Math.cos(lead.yaw) * dz;
      if (Math.hypot(dx, dz) < 4.2 && fwd > -0.5) blocked = true;
    }
    if (blocked) caravan.pause = 1.2;
    caravan.pause -= dt;
    const v = caravan.pause > 0 ? 0 : 1.15 * motion;
    for (const [k, l] of order.entries()) {
      const ahead = order[k - 1];
      if (!ahead) l.t += (dir * v * dt) / len;
      else {
        // Follow the llama in front at a fixed spacing, never faster than 1.4× cruise.
        const want = ahead.t - dir * spacing;
        const step = clamp(want - l.t, (-1.4 * 1.15 * motion * dt) / len, (1.4 * 1.15 * motion * dt) / len);
        if ((want - l.t) * dir > 0) l.t += step;
      }
    }
    if (lead && dir > 0 && lead.t > tMax) caravan.dir = -1;
    if (lead && dir < 0 && lead.t < tMin) caravan.dir = 1;
    for (const l of caravan.llamas) {
      const t = clamp(l.t, tMin - 0.03, tMax + 0.03);
      tp.copy(trail.pointAt(t));
      tg.copy(trail.tangentAt(t));
      const rx = -tg.z;
      const rz = tg.x;
      // Yield: step to the edge away from the traveler while they pass.
      if (close) {
        const side = (av.x - tp.x) * rx + (av.z - tp.z) * rz > 0 ? -1 : 1;
        l.latGoal = side * (trail.halfWidth - 0.55);
      } else l.latGoal = caravan.dir * 0.75;
      l.lat = damp(l.lat, l.latGoal, 1.6, dt);
      const nx = tp.x + rx * l.lat;
      const nz = tp.z + rz * l.lat;
      l.vx = dt > 0 ? (nx - l.x) / dt : 0;
      l.vz = dt > 0 ? (nz - l.z) / dt : 0;
      if (Math.hypot(l.vx, l.vz) > 6) {
        l.vx = 0;
        l.vz = 0;
      }
      l.x = nx;
      l.z = nz;
      animateBeast(l, LLAMA, dt, close ? av : null, close ? 0.1 : 0, 1.2);
      // Face the walking direction even when paused.
      if (Math.hypot(l.vx, l.vz) < 0.12)
        l.yaw = turnToward(l.yaw, Math.atan2(tg.x * caravan.dir, tg.z * caravan.dir), dt * 2);
    }
  };

  // ---------------------------------------------------------------- vizcacha step
  const stepViz = (z: Viz, dt: number, av: THREE.Vector3) => {
    const dAv = Math.hypot(av.x - z.x, av.z - z.z);
    const rk = z.rock;
    const scared = dAv < (travelerSpeed > RUN_SPEED ? 13 : 9);
    if (scared) z.hide = 4 + R() * 2;
    else z.hide = Math.max(0, z.hide - dt);
    const hopDur = 0.34 / motion;
    if (z.hopping) {
      z.hopT += dt / hopDur;
      const u = Math.min(1, z.hopT);
      z.x = z.from.x + (z.to.x - z.from.x) * u;
      z.z = z.from.z + (z.to.z - z.from.z) * u;
      if (u >= 1) {
        z.hopping = false;
        z.rest = z.hide > 0 ? 0.08 : 0.15 + R() * 0.25;
      }
    } else {
      z.rest -= dt;
      // Where does it want to be? Behind the rock (away from the traveler) when hiding, else near home.
      let gx: number;
      let gz: number;
      if (z.hide > 0 && rk.r > 0) {
        const ax = rk.x - av.x;
        const az = rk.z - av.z;
        const d = Math.hypot(ax, az) || 1;
        const spread = (z.slot % 3) - 1;
        const a = Math.atan2(az, ax) + spread * 0.35;
        gx = rk.x + Math.cos(a) * (rk.r + 0.35) * (d > 0 ? 1 : 1);
        gz = rk.z + Math.sin(a) * (rk.r + 0.35);
      } else {
        gx = rk.x + Math.cos(z.homeA) * (rk.r + 0.9);
        gz = rk.z + Math.sin(z.homeA) * (rk.r + 0.9);
      }
      const dx = gx - z.x;
      const dz = gz - z.z;
      const d = Math.hypot(dx, dz);
      if (z.rest <= 0) {
        if (d > 0.3) {
          // Hop toward the goal, arcing around the rock rather than through it.
          let step = Math.min(0.9, d);
          let hx = z.x + (dx / d) * step;
          let hz = z.z + (dz / d) * step;
          if (rk.r > 0) {
            const ox = hx - rk.x;
            const oz = hz - rk.z;
            const od = Math.hypot(ox, oz) || 1;
            if (od < rk.r + 0.3) {
              hx = rk.x + (ox / od) * (rk.r + 0.3);
              hz = rk.z + (oz / od) * (rk.r + 0.3);
              step = Math.hypot(hx - z.x, hz - z.z);
            }
          }
          z.from = { x: z.x, z: z.z };
          z.to = { x: hx, z: hz };
          z.hopping = true;
          z.hopT = 0;
          z.yaw = Math.atan2(hx - z.x, hz - z.z);
        } else if (z.hide <= 0 && R() < 0.25) {
          // Wander to a new sunning spot around the rock.
          z.homeA += (R() - 0.5) * 1.6;
          z.rest = 0.2;
        } else z.rest = 2 + R() * 5;
      }
    }
    z.y = env.heightAt(z.x, z.z);
    z.crouch = damp(z.crouch, z.hide > 0 && !z.hopping ? 1 : 0, 6, dt);
    // Head: twitch and scan; when the traveler is near (but before hiding) stare at them.
    z.twitch -= dt;
    if (z.twitch <= 0) {
      z.twitch = (0.4 + R() * 2.2) / motion;
      z.headYaw = (R() - 0.5) * 1.2;
      z.headPitch = (R() - 0.6) * 0.4;
    }
    if (dAv < 16 && !z.hopping && z.hide <= 0) {
      z.headYaw = clamp(wrapAngle(Math.atan2(av.x - z.x, av.z - z.z) - z.yaw), -1.1, 1.1);
      if (dAv < 12) z.yaw = turnToward(z.yaw, Math.atan2(av.x - z.x, av.z - z.z), dt * 2);
    }
  };
  const writeViz = (z: Viz) => {
    const u = z.hopping ? Math.min(1, z.hopT) : 1;
    const arc = z.hopping ? hopArc(u, 0.32) : { y: 0, squash: 1 };
    const s = 1.35;
    const sq = arc.squash * (1 - z.crouch * 0.28);
    rootMatrix(mRoot, z.x, z.y + arc.y, z.z, z.yaw, z.hopping ? -0.35 * Math.sin(Math.PI * u) : 0, 0, s, s * sq);
    zBody.set(z.slot, mRoot);
    // Nose/ear twitch: a tiny fast jitter on the head.
    const jit = Math.sin(performance.now() * 0.05 + z.seed) * 0.03 * motion;
    child(mHead, mRoot, Z.headPivot, z.headPitch + jit - z.crouch * 0.3, z.headYaw);
    zHead.set(z.slot, mHead);
    zEyes.set(z.slot, mHead);
    zTail.set(z.slot, child(mTmp, mRoot, Z.tailPivot, z.hopping ? 0.5 : 0, 0));
  };

  // ---------------------------------------------------------------- condor step
  const stepCondor = (c: (typeof condors)[number], i: number, dt: number, time: number) => {
    const v = (rm ? 3.2 : 6.5) * (0.9 + 0.1 * Math.sin(time * 0.1 + c.seed));
    const r = c.r0 + 6 * Math.sin(time * 0.07 + c.seed);
    const w = (c.w * v) / r;
    c.a += w * dt;
    // Occasional swoop (dive and climb back), never under reduced motion.
    if (!rm) {
      c.swoopT -= dt;
      if (c.swoopT <= 0 && c.swoop <= 0) {
        c.swoop = 1e-3;
        c.swoopT = 30 + R() * 30;
      }
      if (c.swoop > 0) {
        c.swoop += dt / 7;
        if (c.swoop >= 1) c.swoop = 0;
      }
    }
    const dive = c.swoop > 0 ? Math.sin(Math.PI * c.swoop) ** 2 * 14 : 0;
    const x = c.cx + Math.cos(c.a) * r;
    const z = c.cz + Math.sin(c.a) * r;
    const y = c.base + Math.sin(time * 0.23 + c.seed) * 2.5 - dive;
    const vx = -Math.sin(c.a) * r * w;
    const vz = Math.cos(c.a) * r * w;
    const yaw = Math.atan2(vx, vz);
    const yawRate = dt > 0 ? wrapAngle(yaw - c.yaw) / dt : 0;
    c.yaw = yaw;
    c.bank = damp(c.bank, clamp(yawRate * 1.6, -0.6, 0.6), 2, dt);
    // Flaps: a few slow strokes now and then (more while climbing out of a swoop).
    c.flapT -= dt;
    if (c.flapT <= 0) {
      c.flap = rm ? 1.5 : 2.6;
      c.flapT = 7 + R() * 9;
    }
    let wing = 0.1 + Math.sin(time * 0.6 + c.seed) * 0.03;
    if (c.flap > 0) {
      c.flap -= dt;
      wing += Math.sin(c.flap * (rm ? 3 : 5.5)) * (rm ? 0.25 : 0.5);
    }
    if (c.swoop > 0 && c.swoop < 0.5) wing -= 0.35 * Math.sin(Math.PI * c.swoop * 2);
    c.wing = wing;
    const divePitch = c.swoop > 0 ? Math.sin(TAU * c.swoop) * 0.35 : 0;
    c.x = x;
    c.y = y;
    c.z = z;
    rootMatrix(mRoot, x, y, z, yaw, divePitch, c.bank, 1.45);
    cBody.set(i, mRoot);
    cCollar.set(i, mRoot);
    cHead.set(i, child(mTmp, mRoot, _v.set(0, 0, 0), 0, Math.sin(time * 0.4 + c.seed) * 0.3));
    const sh = C.shoulder;
    child(mTmp, mRoot, _v.set(sh.x, sh.y, sh.z), 0, 0, wing);
    cWingR.set(i, mTmp);
    cPatchR.set(i, mTmp);
    child(mTmp, mRoot, _v.set(-sh.x, sh.y, sh.z), 0, 0, -wing);
    cWingL.set(i, mTmp);
    cPatchL.set(i, mTmp);
  };

  // ---------------------------------------------------------------- hello bubble (alpacas)
  const bubble = document.createElement("div");
  bubble.className = "kw-fauna-bubble";
  bubble.setAttribute("role", "status");
  bubble.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    "pointer-events:none",
    "padding:4px 10px",
    "background:#f5ecd9",
    "color:#1f1a17",
    "border:2px solid #1f1a17",
    "border-radius:10px",
    "box-shadow:3px 3px 0 #1f1a17",
    "font:600 14px/1.3 var(--font-body, 'Hanken Grotesk', system-ui, sans-serif)",
    "white-space:nowrap",
    "opacity:0",
    "transition:opacity .2s",
    "z-index:5",
  ].join(";");
  hudRoot.append(bubble);
  let bubbleFor: Beast | null = null;
  let bubbleT = 0;
  let nearest: Beast | null = null;
  const lines = HELLO[env.lang];
  let lineIdx = 0;
  const alpacas = herds.filter((h) => h.species === "alpaca").flatMap((h) => h.members);

  const placeBubble = () => {
    if (!bubbleFor || bubbleT <= 0) {
      bubble.style.opacity = "0";
      return;
    }
    const b = bubbleFor;
    const rig = A.rig;
    rootMatrix(mRoot, b.x, b.y, b.z, b.yaw, b.pitch, 0, b.scale);
    child(mNeck, mRoot, rig.neck, b.neckPitch, b.neckYaw);
    child(mHead, mNeck, rig.headOnNeck, b.headPitch);
    headWorld.set(0, 0.45, 0).applyMatrix4(mHead).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    if (headWorld.z > 1) {
      bubble.style.opacity = "0";
      return;
    }
    const sx = (headWorld.x * 0.5 + 0.5) * w;
    const sy = (-headWorld.y * 0.5 + 0.5) * h;
    bubble.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    bubble.style.opacity = bubbleT < 0.3 ? String(bubbleT / 0.3) : "1";
  };

  // ---------------------------------------------------------------- update loop
  const update = (dt: number, avatar: THREE.Vector3, t: number) => {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    if (havePrev) {
      const s = Math.hypot(avatar.x - prev.x, avatar.z - prev.z) / dt;
      // Ignore teleports.
      travelerSpeed = s > 20 ? 0 : damp(travelerSpeed, s, 10, dt);
    }
    prev.copy(avatar);
    havePrev = true;

    for (const h of herds) {
      const lead = h.members[0];
      if (!lead) continue;
      h.acc += dt;
      const dist = Math.hypot(lead.x - avatar.x, lead.z - avatar.z);
      if (!shouldStep(h.acc, dist, NEAR, FAR_STEP)) continue;
      // Integrate long far-steps in small slices so steering stays stable.
      let left = h.acc;
      h.acc = 0;
      while (left > 1e-4) {
        const s = Math.min(left, 0.06);
        stepHerd(h, s, avatar);
        left -= s;
      }
    }
    stepCaravan(dt, avatar);
    for (const z of vizs) stepViz(z, dt, avatar);
    condors.forEach((c, i) => {
      stepCondor(c, i, dt, t);
    });

    // Matrices.
    for (const h of herds) {
      const isV = h.species === "vicuna";
      for (const b of h.members) {
        if (isV) writeBeast(b, vP, V.rig);
        else
          writeBeast(b, aP, A.rig, (_root, head) => {
            tassel.set(b.slot, tasseled.has(b.slot) ? head : ZERO);
          });
      }
    }
    for (const l of caravan.llamas)
      writeBeast(l, lP, L.rig, (root) => {
        packCloth.set(l.slot, root);
        packBags.set(l.slot, root);
      });
    for (const z of vizs) writeViz(z);
    for (const p of parts) p.flush();

    // Alpaca hello.
    nearest = null;
    let best = HELLO_R;
    for (const b of alpacas) {
      const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (bubbleT > 0) {
      bubbleT -= dt;
      if (bubbleFor && Math.hypot(bubbleFor.x - avatar.x, bubbleFor.z - avatar.z) > 6) bubbleT = Math.min(bubbleT, 0.3);
    }
    placeBubble();
  };

  // Pose everything once so the first frame (and the title view) is not a pile at the origin.
  update(1 / 60, trail.pointAt(0.006), 0);

  return {
    update,
    interact() {
      if (!nearest) return false;
      bubbleFor = nearest;
      bubbleT = 2.6;
      bubble.textContent = lines[lineIdx % lines.length] ?? "";
      lineIdx++;
      // It stops grazing to look at you.
      nearest.graze = false;
      nearest.grazeT = 4;
      placeBubble();
      return true;
    },
    escape() {
      if (bubbleT > 0) {
        bubbleT = 0;
        placeBubble();
      }
      return false;
    },
    prompt() {
      return nearest ? PROMPT[env.lang] : null;
    },
    dispose() {
      env.scene.remove(group);
      for (const p of parts) p.mesh.dispose();
      for (const g of geos) g.dispose();
      bubble.remove();
    },
  };
};
