/**
 * Birds of the cloud forest and the puna (ambient, no prompt):
 *  - tangaras (blue-and-yellow tanagers) in small flocks on queñua, aliso, unca, pisonay and chusquea:
 *    they hop, snap their heads around, watch the traveler, and flush to another tree when he comes
 *    within ~4 u (or now and then on their own);
 *  - colibríes hovering at flowers (trail-side lupine and daisies, pisonay blossoms, unca bromeliads and
 *    orchids), darting from flower to flower and away from the traveler;
 *  - gallitos de las rocas (Rupicola peruvianus, Peru's national bird) in the unca cloud-forest trees,
 *    bowing in their lek display;
 *  - one or two Andean condors soaring in wide circles high above the summit (above and wider than the
 *    fauna condors, which circle at about +22 over the summit and the gorge).
 *
 * Perches/flowers come from the flora (scene object "flora-perches", see flora/index.ts). Rendering: the shared
 * birds (characters/animals): one herd per species (a skinned instanced draw per LOD), the flight state
 * machine reading perch, hop, flap, glide, soar and hover from the motion this sim makes; the tanager and the
 * cock-of-the-rock wear their plumage on the closest shared bodies (sparrow, dove) until they have their own.
 * Far birds are moved to free perches near the traveler from time to time, so the climb always has birds
 * around.
 * Reduced motion: no wing-blur flicker, calmer heads, fewer spontaneous flights.
 * `nearestBird()` reports the closest small bird for the soundscape (not wired).
 * Bodies (creatures.ts: "tangara", "colibri", "gallito", "condor"): listed for queries, never solid (they
 * live in the trees, at flowers and in the air, out of the traveler's way).
 */
import * as THREE from "three";
import { createHerd, type Herd } from "../characters/animals/crowd";
import { bpal } from "../characters/animals/species/birds";
import type { Ambient, CreateAmbient, WorldEnv } from "../contract";
import { type Body, creatures, PARKED } from "../creatures";
import type { FloraPerches } from "../flora";
import { noPaint } from "../style-gl";
import { rng } from "../tex";
import {
  damp,
  FLEE_R,
  FLOWER_STRIDE,
  type Flight,
  flightEase,
  flightPoint,
  flightTangent,
  newFlight,
  pickRecord,
  planFlight,
  soarPoint,
  TREE_STRIDE,
  type Vec,
  wrapAngle,
} from "./birds/sim";

const TAU = Math.PI * 2;
export type BirdKind = "tangara" | "colibri" | "gallito" | "condor";

/** Blue-and-yellow tanager (Thraupis / Pipraeidea): blue back and wings, a yellow breast. */
const TANAGER = bpal({
  back: "#2f63c4",
  head: "#3c7fd8",
  bill: "#2a2420",
  legs: "#4a4038",
  belly: "#e8c43a",
  coverts: "#2a55aa",
  flight: "#1d2f5a",
  tail: "#1d2f5a",
  face: "#3c7fd8",
  collar: "#e8c43a",
});
/** Andean cock-of-the-rock (male): flame-orange body, black wings and tail, pale grey tertials. */
const ROCK = bpal({
  back: "#e2501f",
  head: "#ec6420",
  bill: "#e8b631",
  legs: "#c98a2a",
  belly: "#d9481c",
  coverts: "#1d1a1a",
  flight: "#1a1818",
  tail: "#1a1818",
  face: "#ec6420",
  collar: "#b9b6b0",
});
/** Tree kinds (flora TREE_KINDS order): quenua 0, aliso 1, unca 2, pisonay 3, chusquea 4. */
const TANGARA_TREES = [0, 1, 2, 3, 4] as const;
const GALLITO_TREES = [2] as const;

interface Species {
  kind: BirdKind;
  herd: Herd;
}

enum Mode {
  Perch = 0,
  Fly = 1,
  Hover = 2,
}

interface Bird {
  sp: Species;
  slot: number;
  mode: Mode;
  /** Record index (tree perch or flower) the bird sits at / heads to; -1 none. */
  rec: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  f: Flight;
  /** Seconds until the next spontaneous move. */
  timer: number;
  headYaw: number;
  headYawT: number;
  headPitch: number;
  headPitchT: number;
  headTimer: number;
  /** Hop / display progress (0 = idle). */
  hop: number;
  hopTurn: number;
  display: number;
  /** Last drawn position and climb rate (the flight state machine reads the motion). */
  px: number;
  py: number;
  pz: number;
  vy: number;
  /** Hover offset direction (colibrí), unit XZ. */
  ox: number;
  oz: number;
  seed: number;
  body: Body;
}

const BODY_R: Record<BirdKind, number> = { tangara: 0.12, colibri: 0.08, gallito: 0.18, condor: 0.9 };

// Module-level nearest small bird (soundscape hook).
const nearest = { x: 0, y: 0, z: 0, d: Number.POSITIVE_INFINITY, kind: "" as BirdKind | "" };

/** Nearest small bird to the traveler (position copied into `out`); distance Infinity if none. */
export function nearestBird(out?: THREE.Vector3): { d: number; kind: BirdKind | "" } {
  out?.set(nearest.x, nearest.y, nearest.z);
  return { d: nearest.d, kind: nearest.kind };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a: Vec = { x: 0, y: 0, z: 0 };
const _b: Vec = { x: 0, y: 0, z: 0 };
const _t: Vec = { x: 0, y: 0, z: 0 };
const _soar = { x: 0, y: 0, z: 0, yaw: 0 };

function makeSpecies(env: WorldEnv, kind: BirdKind, key: string, n: number, palette?: string[]): Species {
  const herd = createHerd(key, { max: Math.max(1, n), variants: palette ? [palette] : undefined });
  herd.group.name = `bird-${kind}`;
  // They move: no world-space painted blotches sliding over the plumage (style-gl.ts).
  herd.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) noPaint(o as THREE.Mesh);
  });
  env.scene.add(herd.group);
  for (let i = 0; i < n; i++) herd.add({ seed: 7 + i * 13 });
  return { kind, herd };
}

export const create: CreateAmbient = (env: WorldEnv): Ambient => {
  const R = rng(9137);
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const data = env.scene.getObjectByName("flora-perches")?.userData as Partial<FloraPerches> | undefined;
  const trees = data?.trees ?? new Float32Array(0);
  const flowers = data?.flowers ?? new Float32Array(0);
  const takenTree = new Uint8Array(Math.max(1, trees.length / TREE_STRIDE));
  const takenFlower = new Uint8Array(Math.max(1, flowers.length / FLOWER_STRIDE));

  const nT = trees.length ? (high ? 26 : 14) : 0;
  const nC = flowers.length ? (high ? 14 : 7) : 0;
  const nG = trees.length ? (high ? 5 : 3) : 0;
  const nK = high ? 3 : 2;
  const sT = makeSpecies(env, "tangara", "sparrow", nT, TANAGER);
  const sC = makeSpecies(env, "colibri", "hummingbird", nC);
  const sG = makeSpecies(env, "gallito", "dove", nG, ROCK);
  const sK = makeSpecies(env, "condor", "condor", nK);
  const species = [sT, sC, sG, sK];

  const birds: Bird[] = [];
  const mk = (sp: Species, slot: number): Bird => ({
    sp,
    slot,
    mode: Mode.Perch,
    rec: -1,
    x: 0,
    y: 0,
    z: 0,
    yaw: R() * TAU,
    f: newFlight(),
    timer: 4 + R() * 20,
    headYaw: 0,
    headYawT: 0,
    headPitch: 0,
    headPitchT: 0,
    headTimer: R(),
    hop: 0,
    hopTurn: 0,
    display: 0,
    px: Number.NaN,
    py: 0,
    pz: 0,
    vy: 0,
    ox: 1,
    oz: 0,
    seed: R() * 100,
    body: creatures.add(sp.kind, BODY_R[sp.kind], { solid: false, x: PARKED, z: PARKED }),
  });

  const recPos = (arr: Float32Array, stride: number, i: number, out: Vec) => {
    out.x = arr[i * stride] as number;
    out.y = arr[i * stride + 1] as number;
    out.z = arr[i * stride + 2] as number;
    return out;
  };
  const sit = (b: Bird, rec: number) => {
    if (b.rec >= 0) (b.sp.kind === "colibri" ? takenFlower : takenTree)[b.rec] = 0;
    b.rec = rec;
    if (b.sp.kind === "colibri") {
      takenFlower[rec] = 1;
      recPos(flowers, FLOWER_STRIDE, rec, _a);
      const a = R() * TAU;
      b.ox = Math.cos(a);
      b.oz = Math.sin(a);
      b.x = _a.x + b.ox * 0.1;
      b.y = _a.y - 0.06;
      b.z = _a.z + b.oz * 0.1;
      b.yaw = Math.atan2(-b.ox, -b.oz);
      b.mode = Mode.Hover;
      b.timer = 1.2 + R() * 2.5;
    } else {
      takenTree[rec] = 1;
      recPos(trees, TREE_STRIDE, rec, _a);
      b.x = _a.x;
      b.y = _a.y;
      b.z = _a.z;
      b.mode = Mode.Perch;
      b.timer = (rm ? 20 : 8) + R() * 22;
    }
  };

  // ---------------------------------------------------------------- seeding along the climb
  const trail = env.trail;
  const seedNear = (sp: Species, slot: number, t: number, kinds: readonly number[], group?: Bird) => {
    const b = mk(sp, slot);
    const pt = trail.pointAt(t);
    const from = group ? { x: group.x, y: group.y, z: group.z } : { x: pt.x, y: pt.y, z: pt.z };
    const isC = sp.kind === "colibri";
    const rec = pickRecord(isC ? flowers : trees, isC ? FLOWER_STRIDE : TREE_STRIDE, from, R, {
      min: 0,
      max: group ? 5 : 45,
      kinds: isC ? undefined : kinds,
      taken: isC ? takenFlower : takenTree,
      tries: 400,
    });
    if (rec >= 0) sit(b, rec);
    else {
      // Fallback: anywhere.
      const any = pickRecord(isC ? flowers : trees, isC ? FLOWER_STRIDE : TREE_STRIDE, from, R, {
        min: 0,
        max: 1e9,
        kinds: isC ? undefined : kinds,
        taken: isC ? takenFlower : takenTree,
        tries: 400,
      });
      if (any >= 0) sit(b, any);
    }
    birds.push(b);
    return b;
  };
  for (let i = 0; i < nT; ) {
    const t = 0.02 + (i / Math.max(1, nT)) * 0.9;
    const lead = seedNear(sT, i++, t, TANGARA_TREES);
    for (let k = 0; k < 2 && i < nT; k++) seedNear(sT, i++, t, TANGARA_TREES, lead);
  }
  for (let i = 0; i < nC; i++) seedNear(sC, i, 0.02 + (i / Math.max(1, nC)) * 0.85, []);
  for (let i = 0; i < nG; i++) seedNear(sG, i, 0.05 + (i / Math.max(1, nG)) * 0.6, GALLITO_TREES);

  // ---------------------------------------------------------------- condors (summit, high and wide)
  const summit = trail.pointAt(1);
  const condors = Array.from({ length: nK }, (_, i) => ({
    a: R() * TAU,
    // Low enough to read against the sky from the upper trail; each one wider and higher than the last.
    r: 42 + i * 24,
    base: summit.y + 16 + i * 12,
    dir: (i % 2 ? -1 : 1) as 1 | -1,
    y: 0,
    vy: 0,
    seed: R() * 100,
    body: creatures.add("condor", BODY_R.condor, { solid: false, x: PARKED, z: PARKED }),
  }));

  // ---------------------------------------------------------------- behaviour
  const speed = { tangara: 6.5, colibri: 9, gallito: 7, condor: 0 } as const;
  const takeOff = (b: Bird, av: THREE.Vector3, scared: boolean) => {
    const isC = b.sp.kind === "colibri";
    const kinds = b.sp.kind === "gallito" ? GALLITO_TREES : TANGARA_TREES;
    const arr = isC ? flowers : trees;
    const stride = isC ? FLOWER_STRIDE : TREE_STRIDE;
    const notTree = !isC && b.rec >= 0 ? (trees[b.rec * TREE_STRIDE + 4] as number) : undefined;
    _a.x = b.x;
    _a.y = b.y;
    _a.z = b.z;
    const avoid = { x: av.x, z: av.z, r: scared ? 9 : 5 };
    let rec = pickRecord(arr, stride, _a, R, {
      min: isC ? (scared ? 7 : 1.5) : 6,
      max: isC ? (scared ? 30 : 14) : 38,
      avoid,
      kinds: isC ? undefined : kinds,
      notTree,
      taken: isC ? takenFlower : takenTree,
    });
    if (rec < 0)
      rec = pickRecord(arr, stride, _a, R, {
        min: 3,
        max: 90,
        avoid,
        kinds: isC ? undefined : kinds,
        taken: isC ? takenFlower : takenTree,
      });
    if (rec < 0) {
      b.timer = 3 + R() * 4;
      return;
    }
    // Free the old spot now, reserve the new one.
    if (b.rec >= 0) (isC ? takenFlower : takenTree)[b.rec] = 0;
    (isC ? takenFlower : takenTree)[rec] = 1;
    b.rec = rec;
    recPos(arr, stride, rec, _b);
    if (isC) {
      const a = Math.atan2(_b.z - b.z, _b.x - b.x) + Math.PI + (R() - 0.5) * 1.2;
      b.ox = Math.cos(a);
      b.oz = Math.sin(a);
      _b.x += b.ox * 0.1;
      _b.y -= 0.06;
      _b.z += b.oz * 0.1;
    }
    const sp = speed[b.sp.kind] * (scared ? 1.25 : 1);
    planFlight(b.f, _a, _b, sp, isC ? 0.06 : 0.16, isC ? 0.25 : 0.7);
    // Clear the ground between the trees (uphill crossings).
    for (const u of [0.25, 0.5, 0.75]) {
      flightPoint(b.f, u, _t);
      const g = env.heightAt(_t.x, _t.z) + 1.6;
      if (_t.y < g) b.f.cy += (g - _t.y) * 2;
    }
    b.mode = Mode.Fly;
    b.hop = 0;
    b.display = 0;
  };

  let relocateT = 2;
  const ahead = new THREE.Vector3();
  const pos = new THREE.Vector3();

  const writeBird = (b: Bird, dt: number) => {
    const hopY = b.hop > 0 ? Math.sin(Math.PI * b.hop) * 0.05 : 0;
    const first = Number.isNaN(b.px);
    const sp = first || dt <= 0 ? 0 : Math.hypot(b.x - b.px, b.z - b.pz) / dt;
    b.vy = first || dt <= 0 ? 0 : b.vy + ((b.y - b.py) / dt - b.vy) * (1 - Math.exp(-6 * dt));
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    const air = b.mode !== Mode.Perch;
    b.sp.herd.set(b.slot, b.x, b.y + hopY, b.z, b.yaw, {
      speed: b.mode === Mode.Hover ? Math.min(sp, 0.6) : sp,
      rm,
      look: b.headYaw,
      grounded: !air,
      vy: air ? b.vy : 0,
      height: air ? b.y - env.heightAt(b.x, b.z) : 0,
    });
  };

  const stepSmall = (b: Bird, dt: number, t: number, av: THREE.Vector3) => {
    const dx = av.x - b.x;
    const dz = av.z - b.z;
    const dXZ = Math.hypot(dx, dz);
    const near = dXZ < FLEE_R && Math.abs(av.y + 0.9 - b.y) < 6;
    const isC = b.sp.kind === "colibri";
    if (b.mode === Mode.Fly) {
      const f = b.f;
      f.u = Math.min(1, f.u + dt / f.dur);
      const e = flightEase(f.u);
      flightPoint(f, e, b);
      flightTangent(f, e, _t);
      const h = Math.hypot(_t.x, _t.z);
      if (h > 1e-4) b.yaw += wrapAngle(Math.atan2(_t.x, _t.z) - b.yaw) * Math.min(1, dt * 12);
      // The wings (flap, the small birds' bounding tuck, the landing flare) follow the motion: anim-bird.ts.
      b.headYaw = damp(b.headYaw, 0, 12, dt);
      b.headPitch = damp(b.headPitch, 0, 12, dt);
      if (f.u >= 1) {
        b.x = f.x1;
        b.y = f.y1;
        b.z = f.z1;
        if (isC) {
          b.mode = Mode.Hover;
          b.timer = 1.2 + R() * 2.5;
          b.yaw = Math.atan2(-b.ox, -b.oz);
        } else {
          b.mode = Mode.Perch;
          b.timer = (rm ? 20 : 8) + R() * 22;
          b.headTimer = 0.2;
        }
      }
      return;
    }
    if (b.mode === Mode.Hover) {
      b.timer -= dt;
      if ((dXZ < FLEE_R - 1 && Math.abs(av.y + 0.9 - b.y) < 4) || b.timer <= 0) {
        takeOff(b, av, dXZ < FLEE_R);
        return;
      }
      recPos(flowers, FLOWER_STRIDE, b.rec, _a);
      const bob = rm ? 0 : Math.sin(t * 5.3 + b.seed) * 0.015;
      b.x = damp(b.x, _a.x + b.ox * (0.1 + Math.sin(t * 1.7 + b.seed) * 0.015), 8, dt);
      b.y = damp(b.y, _a.y - 0.06 + bob, 8, dt);
      b.z = damp(b.z, _a.z + b.oz * 0.1, 8, dt);
      b.yaw = damp(b.yaw, Math.atan2(-b.ox, -b.oz) + Math.sin(t * 2.3 + b.seed) * 0.15, 6, dt);
      b.headYaw = damp(b.headYaw, Math.sin(t * 3.1 + b.seed) * 0.2, 6, dt);
      return;
    }
    // Perched.
    b.timer -= dt;
    if (near || b.timer <= 0) {
      takeOff(b, av, near);
      return;
    }
    // Head: quick snaps between glances; watches the traveler when he is close-ish.
    b.headTimer -= dt;
    if (b.headTimer <= 0) {
      b.headTimer = (rm ? 1.2 : 0.3) + R() * (rm ? 2 : 1.2);
      if (dXZ < 10) {
        b.headYawT = Math.max(-1.3, Math.min(1.3, wrapAngle(Math.atan2(dx, dz) - b.yaw))) + (R() - 0.5) * 0.3;
        b.headPitchT = -0.1;
      } else {
        b.headYawT = (R() - 0.5) * 2.2;
        b.headPitchT = (R() - 0.35) * 0.6;
      }
      // Sometimes hop (turning around on the spot) or, for the gallito, bow in display.
      const roll = R();
      if (roll < (rm ? 0.04 : 0.14) && b.hop === 0) {
        b.hop = 1e-3;
        b.hopTurn = (R() - 0.5) * 2.4;
      } else if (b.sp.kind === "gallito" && roll > (rm ? 0.97 : 0.85) && b.display === 0) {
        // The lek display: a bow and a ruffle of the plumage.
        b.display = 1e-3;
        b.sp.herd.play(b.slot, "shake", 1.1);
      }
    }
    const k = rm ? 8 : 32;
    b.headYaw = damp(b.headYaw, b.headYawT, k, dt);
    b.headPitch = damp(b.headPitch, b.headPitchT, k, dt);
    if (b.hop > 0) {
      const prev = b.hop;
      b.hop = Math.min(1, b.hop + dt / 0.24);
      b.yaw += b.hopTurn * (flightEase(b.hop) - flightEase(prev));
      if (b.hop >= 1) b.hop = 0;
    }
    if (b.display > 0) {
      b.display = Math.min(1, b.display + dt / 1.1);
      b.headPitch += 0.4 * Math.sin(Math.PI * b.display);
      if (b.display >= 1) b.display = 0;
    }
  };

  const relocate = (av: THREE.Vector3) => {
    // The farthest perched bird hops (unseen) to a free spot near the traveler.
    let far: Bird | null = null;
    let fd = 110;
    for (const b of birds) {
      if (b.mode === Mode.Fly) continue;
      const d = Math.hypot(b.x - av.x, b.z - av.z);
      if (d > fd) {
        fd = d;
        far = b;
      }
    }
    if (!far) return;
    const isC = far.sp.kind === "colibri";
    const arr = isC ? flowers : trees;
    const stride = isC ? FLOWER_STRIDE : TREE_STRIDE;
    const kinds = isC ? undefined : far.sp.kind === "gallito" ? GALLITO_TREES : TANGARA_TREES;
    const taken = isC ? takenFlower : takenTree;
    let rec = -1;
    if (R() < 0.6) {
      // Usually a spot by the path a little ahead of the traveler (where he will walk past it).
      trail.pointAt(Math.min(1, trail.nearestT(av.x, av.z) + 0.015 + R() * 0.03), ahead);
      rec = pickRecord(arr, stride, ahead, R, {
        min: 0,
        max: 12,
        avoid: { x: av.x, z: av.z, r: 22 },
        kinds,
        taken,
        tries: 160,
      });
    }
    if (rec < 0) rec = pickRecord(arr, stride, av, R, { min: 26, max: 60, kinds, taken, tries: 120 });
    if (rec >= 0) sit(far, rec);
  };

  // Initial pose.
  for (const b of birds) writeBird(b, 0);
  let clock = 0;

  return {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.1);
      pos.copy(avatar);
      relocateT -= dt;
      if (relocateT <= 0) {
        relocateT = 1.5;
        relocate(pos);
      }
      nearest.d = Number.POSITIVE_INFINITY;
      for (const b of birds) {
        stepSmall(b, dt, t, pos);
        writeBird(b, dt);
        b.body.x = b.x;
        b.body.z = b.z;
        const d = Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z);
        if (d < nearest.d) {
          nearest.d = d;
          nearest.x = b.x;
          nearest.y = b.y;
          nearest.z = b.z;
          nearest.kind = b.sp.kind;
        }
      }
      // Condors: slow wide circles, banked into the turn, a few lazy strokes now and then.
      for (let i = 0; i < condors.length; i++) {
        const c = condors[i] as (typeof condors)[number];
        const v = rm ? 4 : 7;
        c.a += ((c.dir * v) / c.r) * dt;
        soarPoint(summit.x, summit.z, c.r + Math.sin(t * 0.05 + c.seed) * 8, c.a, c.dir, _soar);
        const y = c.base + Math.sin(t * 0.17 + c.seed) * 3;
        c.body.x = _soar.x;
        c.body.z = _soar.z;
        // Soaring on the wind (the soarer's flight state machine), banked into the circle.
        c.vy = c.vy + ((dt > 0 && c.y ? (y - c.y) / dt : 0) - c.vy) * (1 - Math.exp(-3 * dt));
        c.y = y;
        sK.herd.set(i, _soar.x, y - 0.64, _soar.z, _soar.yaw, {
          speed: v,
          rm,
          look: Math.sin(t * 0.4 + c.seed) * 0.35,
          turn: (c.dir * v) / c.r,
          grounded: false,
          vy: c.vy,
          height: y - env.heightAt(_soar.x, _soar.z),
        });
      }
      clock += dt;
      for (const s of species) s.herd.update(dt, clock, env.camera);
    },
    dispose() {
      for (const b of birds) creatures.remove(b.body);
      for (const c of condors) creatures.remove(c.body);
      for (const s of species) s.herd.dispose();
      birds.length = 0;
      nearest.d = Number.POSITIVE_INFINITY;
    },
  };
};
