/**
 * Andean fauna (ambient system): vicuña and alpaca herds on the grassy slopes, vizcacha colonies by the
 * big rocks, condors circling over the gorge and the summit, and a small llama caravan on the Qhapaq Ñan.
 *
 * - Rendering: the shared animals (characters/animals): each species is one herd (createHerd: one skinned
 *   InstancedMesh per LOD, built off the main thread, coat variants per animal), so the whole bestiary is a
 *   handful of draw calls per pass and keeps the ink.
 * - Motion: leader-follow boids (fauna-sim.ts) drive each animal's speed, heading and head turn; the
 *   species animator does the gaits (pace, gallop, the vizcacha's hop, the condor's soaring) and the idles
 *   (grazing, looking around); animals watch the traveler; herds drift away and bolt if the traveler runs.
 * - Budget: ≈55 animals on high, ≈32 on low; herds farther than 120 u (70 u on phones) step at 4 Hz.
 * - Interact: E right next to an alpaca shows a tiny text bubble; anything else returns false.
 * - Bodies (creatures.ts): every animal registers ("vicuna", "alpaca", "llama", "vizcacha", "condor" — the
 *   condors never solid). Herds bend their wanted velocity around other herds, the traveler and predators
 *   (look-ahead steer inside flockStep), then resolve any overlap only onto their own good ground, so a
 *   grazing herd is never shoved over a terrace wall or onto the path. Caravan llamas only yield sideways.
 */
import * as THREE from "three";
import { prefetchAnimals } from "./characters/animals/assets";
import { createHerd, type Herd as AnimalHerd } from "./characters/animals/crowd";
import type { Ambient, CreateAmbient, WorldEnv } from "./contract";
import { type Body, creatures } from "./creatures";
import {
  type Agent,
  clamp,
  damp,
  type FlockParams,
  flockStep,
  type GroundRules,
  goodGround,
  herdSizes,
  moveAgent,
  mulberry,
  pointHash,
  shouldStep,
  TAU,
  turnToward,
  wrapAngle,
} from "./fauna-sim";
import { detectDevice } from "./quality";
import { noPaint } from "./style-gl";

const NEAR = 120;
const FAR_STEP = 0.25;
const RUN_SPEED = 5;
const HELLO_R = 3.5;
/** Body radii (world units, before the per-animal scale): about half the body length. */
const BODY_R = { vicuna: 0.55, alpaca: 0.5, llama: 0.62 } as const;
/** Look-ahead of the herd steering (seconds). */
const AHEAD = 0.9;
/** Look-ahead (s) for keep-out zones: herds start bending around a camp a few metres before it. */
const KEEP_OUT_AHEAD = 4;

type Species = "vicuna" | "alpaca" | "llama";

interface Beast extends Agent {
  y: number;
  yaw: number;
  graze: boolean;
  grazeT: number;
  /** Head turn toward the traveler (radians, body frame), or undefined to let the idles look around. */
  look: number | undefined;
  scale: number;
  /** Instance in its species' herd renderer. */
  id: number;
  seed: number;
  body: Body;
}

interface Herd {
  species: Species;
  members: Beast[];
  home: { x: number; z: number };
  leash: number;
  goal: { x: number; z: number } | null;
  goalT: number;
  acc: number;
  params: FlockParams;
  rules: GroundRules;
}

/** Coat variants (characters/animals/species/camelids.ts) a member picks from. */
const ALPACA_COATS = ["white", "white", "fawn", "brown", "grey", "black", "fawn"];
const LLAMA_COATS = ["white", "brown", "black", "cafe"];

const HELLO = {
  es: ["¡Hola!", "Mmm-hmm… ♪", "¡Qué tal, viajero!"],
  en: ["Hello!", "Mmm-hmm… ♪", "Hi there, traveler!"],
};
const PROMPT = { es: "E · Saludar", en: "E · Say hi" };

export const createFauna: CreateAmbient = (env: WorldEnv, hudRoot: HTMLElement): Ambient => {
  const R = mulberry(7319);
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const motion = rm ? 0.5 : 1;
  /** Herds within this distance step every frame (phones: nearer, the rest at 4 Hz). */
  const phone = detectDevice().phone;
  const near = phone ? 70 : NEAR;
  const group = new THREE.Group();
  group.name = "fauna";
  env.scene.add(group);
  // Start the builds now (worker, far LODs first): the herds show up at once and sharpen as they arrive.
  prefetchAnimals(["vicuna", "alpaca", "llama", "vizcacha", "condor"]);

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
    // Keep-out zones (camp, story circle): read live, so zones registered after fauna count too.
    blocked: (x, z) => creatures.inKeepOut(x, z, 0.4),
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
  /** The nearest good spot to (cx, cz), searching rings outward (so a moved home stays where it was meant). */
  const nearestGood = (r: GroundRules, cx: number, cz: number) => {
    for (const rad of [2, 3.5, 5, 7, 9.5, 12.5, 16, 20, 25]) {
      const n = Math.ceil(rad * 2.5);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = cx + Math.cos(a) * rad;
        const z = cz + Math.sin(a) * rad;
        // Room to graze: most of a small circle around it is good too.
        if (!goodGround(r, x, z)) continue;
        let room = 0;
        for (let j = 0; j < 6; j++)
          if (goodGround(r, x + Math.cos((j / 6) * TAU) * 2, z + Math.sin((j / 6) * TAU) * 2)) room++;
        if (room >= 4) return { x, z };
      }
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
  const mkBeast = (species: Species, x: number, z: number, slot: number, scale: number): Beast => ({
    x,
    z,
    vx: 0,
    vz: 0,
    y: env.heightAt(x, z),
    yaw: R() * TAU,
    graze: R() < 0.6,
    grazeT: 2 + R() * 6,
    look: undefined,
    scale,
    id: slot,
    seed: R() * 100,
    body: creatures.add(species, BODY_R[species] * scale, { x, z, give: 1 }),
  });
  const counts = { vicuna: 0, alpaca: 0, llama: 0 };
  const addHerd = (species: "vicuna" | "alpaca", size: number, r: GroundRules, home: { x: number; z: number }) => {
    const members: Beast[] = [];
    for (let i = 0; i < size; i++) {
      const p = findSpot(r, home.x, home.z, 4 + size * 0.6, 30) ?? home;
      members.push(
        mkBeast(species, p.x, p.z, counts[species]++, species === "vicuna" ? 0.95 + R() * 0.12 : 0.9 + R() * 0.18),
      );
    }
    herds.push({
      species,
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
  ledge: for (let t = 0.97; t > 0.86; t -= 0.01) {
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
        break ledge;
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
      ...mkBeast("llama", 0, 0, i, 1 + (i === 0 ? 0.06 : -0.03 * i)),
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
    /** Smoothed ground speed (hop runs). */
    speed: number;
    twitch: number;
    homeA: number;
    rock: Rock;
    slot: number;
    seed: number;
    body: Body;
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
        speed: 0,
        twitch: 0,
        homeA: a,
        rock,
        slot: vizs.length,
        seed: R() * 100,
        body: creatures.add("vizcacha", 0.28, { x, z }),
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
      swoop: 0,
      swoopT: 20 + R() * 20,
      yaw: 0,
      turn: 0,
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      /** Head turn (glancing down at the slopes). */
      look: 0,
      id: 0,
      seed: R() * 100,
      // Always on the wing: listed for queries (soundscape, text mode), never an obstacle.
      body: creatures.add("condor", 0.9, { solid: false }),
    };
  });

  // ---------------------------------------------------------------- renderers (one herd per species)
  const nV = counts.vicuna;
  const nA = counts.alpaca;
  const nL = counts.llama;
  // Phones pick the coarser LODs a little nearer.
  const lodScale = phone ? 0.8 : 1;
  const shadows = high;
  const herdOf = (key: string, max: number, variants?: string[], features?: Record<string, boolean>) => {
    const h = createHerd(key, { max: Math.max(1, max), variants, lodScale, shadows, features });
    h.group.name = `fauna-${key}`;
    // Animals move: no world-space painted blotches sliding over them (style-gl.ts).
    h.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) noPaint(o as THREE.Mesh);
    });
    group.add(h.group);
    return h;
  };
  const rV = herdOf("vicuna", nV);
  const rA = herdOf("alpaca", nA, ALPACA_COATS);
  // Caravan llamas carry their packs (dyed cloth and bags) and the tika tassels in their ears.
  const rL = herdOf("llama", nL, LLAMA_COATS, { pack: true });
  for (const h of herds)
    for (const b of h.members) {
      const r = h.species === "vicuna" ? rV : rA;
      b.id = r.add({ seed: b.seed, variant: h.species === "alpaca" ? Math.floor(R() * ALPACA_COATS.length) : 0 });
    }
  caravan.llamas.forEach((l, i) => {
    l.id = rL.add({ seed: l.seed, variant: i % LLAMA_COATS.length });
  });
  const rZ = herdOf("vizcacha", vizs.length);
  for (const z of vizs) z.slot = rZ.add({ seed: z.seed });
  const rC = herdOf("condor", condorN);
  condors.forEach((c, i) => {
    c.id = rC.add({ seed: c.seed + i });
  });
  const renderers = [rV, rA, rL, rZ, rC];

  // ---------------------------------------------------------------- traveler tracking
  const prev = new THREE.Vector3();
  let havePrev = false;
  let travelerSpeed = 0;

  // ---------------------------------------------------------------- per-animal state
  const headWorld = new THREE.Vector3();
  let clock = 0;

  /** Shared camelid behavior: heading from the velocity, grazing bouts, watching the traveler. */
  const animateBeast = (r: AnimalHerd, b: Beast, dt: number, look: THREE.Vector3 | null, alarm: number) => {
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0.12) b.yaw = turnToward(b.yaw, Math.atan2(b.vx, b.vz), dt * (2.5 + speed));
    b.y = env.heightAt(b.x, b.z);
    // Grazing toggles while resting; alert animals hold the head high and watch.
    b.grazeT -= dt;
    if (b.grazeT <= 0) {
      b.graze = !b.graze;
      b.grazeT = b.graze ? 4 + R() * 8 : 2 + R() * 4;
      if (b.graze && speed < 0.25) r.play(b.id, "graze", b.grazeT);
    }
    b.look =
      look && (alarm > 0.02 || Math.hypot(look.x - b.x, look.z - b.z) < 14)
        ? clamp(wrapAngle(Math.atan2(look.x - b.x, look.z - b.z) - b.yaw), -1.2, 1.2)
        : undefined;
  };
  const writeBeast = (r: AnimalHerd, b: Beast) => {
    r.set(b.id, b.x, b.y, b.z, b.yaw, { speed: Math.hypot(b.vx, b.vz), look: b.look, rm });
  };

  // ---------------------------------------------------------------- late zones
  /**
   * Keep-out zones and walkable areas registered by ambients created after fauna (the summit camp) can land
   * on a herd: once, on the first update after every ambient is built, move such homes to the nearest good
   * ground and put stranded animals there too, unless the traveler is close enough to see it happen (then
   * they walk out on their own: the stranded rules + steerKeepOut).
   */
  let updates = 0;
  const settleStranded = (av: THREE.Vector3) => {
    for (const h of herds) {
      if (h.rules.blocked?.(h.home.x, h.home.z) || h.rules.walkable(h.home.x, h.home.z))
        h.home = nearestGood(h.rules, h.home.x, h.home.z) ?? h.home;
      for (const b of h.members) {
        if (goodGround(h.rules, b.x, b.z) || Math.hypot(b.x - av.x, b.z - av.z) < 60) continue;
        const p = findSpot(h.rules, h.home.x, h.home.z, 4 + h.members.length * 0.6, 30);
        if (!p) continue;
        b.x = p.x;
        b.z = p.z;
        b.body.x = p.x;
        b.body.z = p.z;
        b.y = env.heightAt(p.x, p.z);
      }
    }
  };

  // ---------------------------------------------------------------- herd step
  const threat = { x: 0, z: 0, running: false };
  // Shared per-step state for the (allocation-free) steering and ground callbacks below.
  let steerHerd: Herd | null = null;
  let groundRules: GroundRules = valley;
  let offGround = false;
  const steerMember = (i: number, want: { x: number; z: number }) => {
    const b = steerHerd?.members[i];
    if (!b) return;
    creatures.steer(b.body, want.x, want.z, AHEAD, want);
    // Herds see a camp from a few metres off and walk around it (not up to its edge and along it).
    creatures.steerKeepOut(b.body, want.x, want.z, KEEP_OUT_AHEAD, want);
  };
  /** Where a herd animal may stand (anywhere while it is still stranded on bad ground). */
  const okGround = (x: number, z: number) => offGround || goodGround(groundRules, x, z);
  const okViz = (x: number, z: number) => goodGround(vizRules, x, z);
  const crowd: Body[] = [];
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
    // A home that is no longer good ground (a keep-out zone or a walkable area registered by an ambient after
    // fauna, e.g. the summit camp): move it to good ground nearby (once per change: a found spot is good).
    if (h.rules.blocked?.(h.home.x, h.home.z) || h.rules.walkable(h.home.x, h.home.z)) {
      const spot = nearestGood(h.rules, h.home.x, h.home.z);
      if (spot) {
        h.home = spot;
        h.goal = null;
      }
    }
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
    // Stranded where the ground stopped being good (a keep-out zone or walkable area registered after fauna):
    // walk home (moved to good ground above) instead of resting there.
    if (!h.goal && !goodGround(h.rules, lead.x, lead.z)) {
      h.goal = h.home;
      h.goalT = 8;
    }
    if (h.goal && Math.hypot(h.goal.x - lead.x, h.goal.z - lead.z) < 0.6) {
      h.goal = null;
      h.goalT = 5 + R() * 8;
    }
    threat.x = av.x;
    threat.z = av.z;
    threat.running = travelerSpeed > RUN_SPEED;
    steerHerd = h;
    // Dev (collision tests): `window.__faunaCalm = true` keeps herds from fleeing the traveler.
    const calm = import.meta.env?.DEV && (window as unknown as { __faunaCalm?: boolean }).__faunaCalm;
    const alarm = flockStep(h.members, calm ? null : h.goal, calm ? null : threat, h.params, dt, steerMember);
    groundRules = h.rules;
    for (const [i, b] of h.members.entries()) {
      offGround = !goodGround(h.rules, b.x, b.z);
      const ok = okGround;
      moveAgent(b, dt, ok);
      // Settle out of any overlap (herd mates, other herds, the traveler), never off its own ground.
      b.body.x = b.x;
      b.body.z = b.z;
      if (creatures.resolve(b.body, ok, 1.5 * dt + 0.02)) {
        b.x = b.body.x;
        b.z = b.body.z;
      }
      animateBeast(h.species === "vicuna" ? rV : rA, b, dt, av, alarm[i] ?? 0);
    }
  };

  // ---------------------------------------------------------------- caravan step
  const tp = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const blockers: Body[] = [];
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
    // Anyone (the traveler, an animal) standing just ahead of any llama of the string: wait.
    if (!blocked)
      for (const l of caravan.llamas) {
        const fx = l.x + Math.sin(l.yaw) * 1.1;
        const fz = l.z + Math.cos(l.yaw) * 1.1;
        for (const o of creatures.near(fx, fz, 0.9, blockers, l.body))
          if (o.solid && o.kind !== "llama") {
            blocked = true;
            break;
          }
        if (blocked) break;
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
      // Pressed by a body (the traveler squeezing past): give way on the paving — sideways (clamped to the
      // path) and, for what the side step can't absorb, a little back along the trail.
      l.body.x = tp.x + rx * l.lat;
      l.body.z = tp.z + rz * l.lat;
      let along = 0;
      if (creatures.resolve(l.body, undefined, 0.3)) {
        const lim = trail.halfWidth - 0.45;
        const ox = l.body.x - tp.x;
        const oz = l.body.z - tp.z;
        l.lat = clamp(ox * rx + oz * rz, -lim, lim);
        along = ox * tg.x + oz * tg.z;
        l.t += along / len;
      }
      const nx = tp.x + rx * l.lat + tg.x * along;
      const nz = tp.z + rz * l.lat + tg.z * along;
      l.vx = dt > 0 ? (nx - l.x) / dt : 0;
      l.vz = dt > 0 ? (nz - l.z) / dt : 0;
      if (Math.hypot(l.vx, l.vz) > 6) {
        l.vx = 0;
        l.vz = 0;
      }
      l.x = nx;
      l.z = nz;
      l.body.x = nx;
      l.body.z = nz;
      animateBeast(rL, l, dt, close ? av : null, close ? 0.1 : 0);
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
          // Never land on another body: wait a moment and pick again.
          let taken = false;
          for (const o of creatures.near(hx, hz, z.body.r, crowd, z.body)) if (o.solid) taken = true;
          if (taken) {
            z.rest = 0.3 + R() * 0.6;
            z.homeA += (R() - 0.5) * 1.2;
          } else {
            z.from = { x: z.x, z: z.z };
            z.to = { x: hx, z: hz };
            z.hopping = true;
            z.hopT = 0;
            z.yaw = Math.atan2(hx - z.x, hz - z.z);
          }
        } else if (z.hide <= 0 && R() < 0.25) {
          // Wander to a new sunning spot around the rock.
          z.homeA += (R() - 0.5) * 1.6;
          z.rest = 0.2;
        } else z.rest = 2 + R() * 5;
      }
    }
    // On the ground between hops it is a (small) body: nudged out of overlaps, never onto bad ground.
    z.body.solid = !z.hopping;
    z.body.x = z.x;
    z.body.z = z.z;
    if (!z.hopping && creatures.resolve(z.body, okViz, 0.06)) {
      z.x = z.body.x;
      z.z = z.body.z;
    }
    z.y = env.heightAt(z.x, z.z);
    z.crouch = damp(z.crouch, z.hide > 0 && !z.hopping ? 1 : 0, 6, dt);
    // Hops come in quick runs: a smoothed speed keeps the hop gait going between them.
    const hopV = z.hopping ? Math.hypot(z.to.x - z.from.x, z.to.z - z.from.z) / hopDur : 0;
    z.speed = damp(z.speed, hopV, z.hopping ? 14 : 5, dt);
    // Head: twitch and scan; when the traveler is near (but before hiding) stare at them.
    z.twitch -= dt;
    if (z.twitch <= 0) {
      z.twitch = (0.4 + R() * 2.2) / motion;
      z.headYaw = (R() - 0.5) * 1.2;
    }
    if (dAv < 16 && !z.hopping && z.hide <= 0) {
      z.headYaw = clamp(wrapAngle(Math.atan2(av.x - z.x, av.z - z.z) - z.yaw), -1.1, 1.1);
      if (dAv < 12) z.yaw = turnToward(z.yaw, Math.atan2(av.x - z.x, av.z - z.z), dt * 2);
    }
  };
  const writeViz = (z: Viz) => {
    // Hiding: crouched low by the rock (the species' sit); otherwise the head scans or watches the traveler.
    rZ.set(z.slot, z.x, z.y, z.z, z.yaw, {
      speed: z.speed,
      mode: z.crouch > 0.5 ? "sit" : "auto",
      look: z.hopping ? 0 : z.headYaw,
      rm,
    });
  };

  // ---------------------------------------------------------------- condor step
  const stepCondor = (c: (typeof condors)[number], dt: number, time: number) => {
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
    c.turn = damp(c.turn, clamp(yawRate, -0.6, 0.6), 2, dt);
    c.vy = damp(c.vy, dt > 0 && c.y !== 0 ? (y - c.y) / dt : 0, 3, dt);
    c.x = x;
    c.y = y;
    c.z = z;
    c.body.x = x;
    c.body.z = z;
    c.look = rm ? 0 : Math.sin(time * 0.4 + c.seed) * 0.3;
    // Soaring on the thermal (the animator's soarer style: soar, glide in the swoops, flap out of them).
    // The animal's origin is at its feet: the body (the old flight point) rides ~0.64 u above them.
    rC.set(c.id, x, y - 0.64, z, yaw, {
      speed: v,
      rm,
      look: c.look,
      turn: c.turn,
      grounded: false,
      vy: c.vy,
      height: y - env.heightAt(x, z),
    });
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
    // Above the head: an alpaca's head stands ~1.35 u up, ~0.45 u ahead of its feet.
    headWorld
      .set(b.x + Math.sin(b.yaw) * 0.45 * b.scale, b.y + 1.75 * b.scale, b.z + Math.cos(b.yaw) * 0.45 * b.scale)
      .project(env.camera);
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
    if (updates++ === 1) settleStranded(avatar);
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
      if (!shouldStep(h.acc, dist, near, FAR_STEP)) continue;
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
    for (const c of condors) stepCondor(c, dt, t);

    // Hand the poses to the renderers (they animate, pick LODs and upload once per frame).
    for (const h of herds) {
      const r = h.species === "vicuna" ? rV : rA;
      for (const b of h.members) writeBeast(r, b);
    }
    for (const l of caravan.llamas) writeBeast(rL, l);
    for (const z of vizs) writeViz(z);
    clock += dt;
    for (const r of renderers) r.update(dt, clock, env.camera);

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

  // Dev (collision tests): pin one animal of a kind at (x, z) — it stays there (with `__faunaCalm` for herds).
  if (import.meta.env?.DEV)
    group.userData.debug = {
      /** Herd homes, goals and members (keep-out checks). */
      herds: () =>
        herds.map((h) => ({
          species: h.species,
          home: h.home,
          goal: h.goal,
          members: h.members.map((b) => [+b.x.toFixed(1), +b.z.toFixed(1), b.body.id]),
        })),
      /** Send herd `i` to (x, z) for a while (keep-out steering tests). */
      goal(i: number, x: number, z: number) {
        const h = herds[i];
        if (!h) return false;
        h.goal = { x, z };
        h.goalT = 40;
        return true;
      },
      pin(kind: "alpaca" | "vicuna" | "vizcacha", x: number, z: number) {
        if (kind === "vizcacha") {
          const v = vizs[0];
          if (!v) return false;
          v.x = x;
          v.z = z;
          v.hopping = false;
          v.rest = 1e9;
          return true;
        }
        const h = herds.find((hh) => hh.species === kind);
        const b = h?.members[0];
        if (!h || !b) return false;
        b.x = x;
        b.z = z;
        b.vx = 0;
        b.vz = 0;
        h.home = { x, z };
        h.goal = null;
        return true;
      },
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
      for (const h of herds) for (const b of h.members) creatures.remove(b.body);
      for (const l of caravan.llamas) creatures.remove(l.body);
      for (const z of vizs) creatures.remove(z.body);
      for (const c of condors) creatures.remove(c.body);
      env.scene.remove(group);
      for (const r of renderers) r.dispose();
      bubble.remove();
    },
  };
};
