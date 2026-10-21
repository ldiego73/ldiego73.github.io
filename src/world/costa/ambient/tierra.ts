/**
 * Animals of the coast's land and shore (the sea's and the sky's are ./orilla.ts and ./aves.ts):
 *  - perros viringos, Peru's hairless dogs, trotting about the Huanchaco market plaza and the plaza of the first
 *    huaca, stopping to sniff the ground and turning their heads to a traveler close by;
 *  - burros grazing in the green river valleys (two by the Santa, one by the Lurín), ambling from patch to patch;
 *  - a herd of goats browsing the lomas inland of the road, before the Caral pyramid;
 *  - cañanes, the desert lizards, basking on the sand beside the road; they bob, and when the traveler comes
 *    close they dash to their burrow and vanish, coming back out once the traveler has gone (./fauna/logic.ts
 *    stepCrab, the ghost crabs' rule);
 *  - sanderlings running up and down the edge of the water on both caballito beaches, keeping just above the
 *    swash as it runs up the sand and back (./fauna/land-logic.ts waterEdge against ../scenery/waves.ts seaHeight), pecking;
 *  - Peruvian boobies wheeling over the sea off the middle of the coast, folding their wings to plunge-dive
 *    into the water one after another, sitting on it a moment and taking off again (./fauna/logic.ts dive).
 * The dogs, burros and goats are creature bodies (solid; they step out of the traveler's way) and pick their
 * spots outside keep-out zones (station grounds). No passport stamps; field guide: ../wildlife.ts.
 * Reduced motion: the walkers stand (grazing, looking round), the sanderlings stay put, the boobies hold still
 * in the air; the lizards still hide, without running.
 * Draw calls: three per four-legged species (bodies, heads, legs: ./fauna/herd.ts), one each for the lizards,
 * the sanderlings, the boobies and their splashes; a group far from the camera is not drawn.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import type { CostaLayout } from "../layout";
import { BEACHES, COMPANY_STOPS, STATION } from "../plan";
import { seaHeight } from "../scenery/waves";
import { Herd } from "./fauna/herd";
import { chase, stepWander, turnToward, type Wanderer, type WanderOpts, wanderer, waterEdge } from "./fauna/land-logic";
import { boobyGlide, burro, canan, goat, sanderling, viringo } from "./fauna/land-models";
import { type Crab, circle, DIVE, dive, prng, stepCrab } from "./fauna/logic";
import { splash } from "./fauna/models";

/** Beyond this distance from the camera a group is not drawn (nor animated). */
const VIEW = 160;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const S = env.suyu;
  const rm = env.reducedMotion;
  const high = env.quality === "high";
  const R = prng(0x7e44a);
  // Animals: no world-space paint sliding over moving bodies.
  const mat = paintStrength(vertexToon(), 0);
  const root = new THREE.Group();
  root.name = "costa-tierra";
  env.scene.add(root);
  const cam = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  dummy.rotation.order = "YXZ";
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const inst = (geo: THREE.BufferGeometry, n: number, name: string, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.name = name;
    m.count = n;
    m.castShadow = shadow;
    m.frustumCulled = false;
    root.add(m);
    return m;
  };
  const roadAt = (t: number, off: number) => {
    // off > 0: inland (right of the northward walk), < 0: seaward.
    const p = L.trail.pointAt(t);
    const tg = L.trail.tangentAt(t);
    const l = Math.hypot(tg.x, tg.z) || 1;
    return { x: p.x - (tg.z / l) * off, z: p.z + (tg.x / l) * off };
  };
  /** First point round `c` (rings out to `r`) that passes `ok`, else null. */
  const findNear = (c: { x: number; z: number }, r: number, ok: (x: number, z: number) => boolean) => {
    for (let k = 0; k < 80; k++) {
      const a = R() * Math.PI * 2;
      const d = (k / 80) * r;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      if (ok(x, z)) return { x, z };
    }
    return null;
  };
  const free = (x: number, z: number, pad = 0.4) => !creatures.inKeepOut(x, z, pad);

  // ------------------------------------------------------------------ four-legged walkers
  interface Walker {
    w: Wanderer;
    body: Body;
    phase: number;
    pitch: number;
    turn: number;
    scale: number;
  }
  interface Group {
    herd: Herd;
    list: Walker[];
    opts: WanderOpts;
    ok: (x: number, z: number) => boolean;
    /** Leg swing per unit of speed, and stride length (phase per unit walked). */
    swing: number;
    stride: number;
    graze: number;
  }
  const groups: Group[] = [];
  const addGroup = (
    model: ReturnType<typeof viringo>,
    name: string,
    kind: string,
    radius: number,
    homes: Array<{ x: number; z: number; range: number }>,
    opts: WanderOpts,
    ok: (x: number, z: number) => boolean,
    look: { swing: number; stride: number; graze: number },
    scale: () => number = () => 1,
  ) => {
    const herd = new Herd(model, mat, homes.length, `costa-tierra:${name}`, root);
    const list = homes.map((h) => {
      const w = wanderer(h.x, h.z, h.range, R() * Math.PI * 2);
      w.timer = R() * 4;
      return {
        w,
        body: creatures.add(kind, radius, { x: h.x, z: h.z, give: 0.6 }),
        phase: R() * 6,
        pitch: 0,
        turn: 0,
        scale: scale(),
      };
    });
    groups.push({ herd, list, opts, ok, ...look });
    return herd;
  };

  // Viringo dogs: two at the Huanchaco market plaza, one at the first huaca's plaza.
  {
    const okDog = (x: number, z: number) => env.walkable(x, z) && !S.isWater(x, z) && free(x, z);
    const market = env.stationPose(STATION.market).position;
    const first = COMPANY_STOPS[0] ? env.stationPose(COMPANY_STOPS[0].id).position : market;
    const homes = [
      { x: market.x + 2, z: market.z - 1.5, range: 7 },
      { x: market.x - 2.5, z: market.z + 2, range: 7 },
      { x: first.x, z: first.z, range: 5.5 },
    ];
    addGroup(viringo(), "viringos", "perro-viringo", 0.32, homes, { pace: 1.7, graze: 0.4, rest: [2, 6] }, okDog, {
      swing: 0.28,
      stride: 7,
      graze: 0.75,
    });
  }
  // Burros in the river valleys (the Santa is the second river, the Lurín the first).
  {
    const okBurro = (x: number, z: number) =>
      S.isGround(x, z) && L.green(x, z) > 0.35 && !S.isWater(x, z) && free(x, z, 1) && L.riverDist(x, z) > 1.5;
    const homes: Array<{ x: number; z: number; range: number }> = [];
    L.rivers.forEach((rv, i) => {
      const n = i === 1 ? 2 : 1;
      const rx = L.roadX(rv.z);
      for (let k = 0; k < n; k++) {
        const c = findNear({ x: rx + 22 + k * 5, z: rv.z + (k ? 7 : -6) }, 16, okBurro);
        if (c) homes.push({ ...c, range: 8 });
      }
    });
    if (homes.length)
      addGroup(burro(), "burros", "burro", 0.55, homes, { pace: 0.7, graze: 0.75, rest: [4, 10] }, okBurro, {
        swing: 0.32,
        stride: 2.6,
        graze: 0.95,
      });
  }
  // Goats on the lomas inland of the road before Caral.
  {
    const caral = COMPANY_STOPS.find((s) => s.culture === "caral");
    const t = (caral?.t ?? 0.48) - 0.035;
    const okGoat = (x: number, z: number) =>
      S.isGround(x, z) && !S.isWater(x, z) && free(x, z, 1.5) && S.trailDistance(x, z).d > 5;
    const c = findNear(roadAt(t, 22), 14, okGoat);
    if (c) {
      const n = high ? 5 : 3;
      const homes = Array.from({ length: n }, (_, k) => ({
        x: c.x + (k % 3) * 1.6 - 1.6,
        z: c.z + Math.floor(k / 3) * 1.8,
        range: 8,
      }));
      const herd = addGroup(
        goat(),
        "goats",
        "goat",
        0.36,
        homes,
        { pace: 0.8, graze: 0.65, rest: [3, 8] },
        okGoat,
        {
          swing: 0.4,
          stride: 5,
          graze: 1.05,
        },
        () => 0.9 + R() * 0.2,
      );
      const coats = ["#ffffff", "#c9a27a", "#5a4638", "#efe4d0", "#8a6a50"];
      for (let k = 0; k < homes.length; k++) herd.tint(k, new THREE.Color(coats[k % coats.length]));
    }
  }

  // ------------------------------------------------------------------ cañán lizards
  const lizards: Array<Crab & { yaw: number; ph: number }> = [];
  {
    const okSand = (x: number, z: number) =>
      S.isGround(x, z) && L.green(x, z) < 0.15 && !S.isWater(x, z) && free(x, z, 0.5);
    for (const t of [0.12, 0.33, 0.64]) {
      const c = findNear(roadAt(t, 8), 6, okSand);
      if (!c) continue;
      for (let k = 0; k < 4; k++) {
        const h = findNear({ x: c.x + (R() - 0.5) * 5, z: c.z + (R() - 0.5) * 5 }, 2, okSand);
        if (!h) continue;
        const a = R() * Math.PI * 2;
        const b = { x: h.x + Math.cos(a) * 2.2, z: h.z + Math.sin(a) * 2.2 };
        lizards.push({
          hx: h.x,
          hz: h.z,
          wx: b.x,
          wz: b.z,
          x: h.x,
          z: h.z,
          state: "idle",
          timer: 0,
          yaw: R() * 6,
          ph: R() * 6,
        });
      }
    }
  }
  const lizGeo = canan();
  const lizMesh = inst(lizGeo, lizards.length, "costa-tierra:canan", false);

  // ------------------------------------------------------------------ sanderlings
  const beach = (t: number) => {
    const bp = L.beachPoint(t);
    const dsx = L.shoreX(bp.z + 2) - L.shoreX(bp.z - 2);
    const l = Math.hypot(4, dsx) || 1;
    return { x: bp.x, z: bp.z, nx: -4 / l, nz: dsx / l };
  };
  const birds: Array<{ b: ReturnType<typeof beach>; along: number; up: number; jitter: number; peck: number }> = [];
  for (const [t, a0, n] of [
    [BEACHES.south, -26, 7],
    [BEACHES.north, 9, 6],
  ] as const) {
    const b = beach(t);
    for (let k = 0; k < n; k++)
      birds.push({ b, along: a0 - k * 1.1 - R() * 0.6, up: 1, jitter: R() * 0.5, peck: R() * 3 });
  }
  const sandGeo = sanderling();
  const sandMesh = inst(sandGeo, birds.length, "costa-tierra:sanderlings", false);

  // ------------------------------------------------------------------ Peruvian boobies
  const nBoobies = high ? 7 : 4;
  const flock = (() => {
    const p = L.trail.pointAt(0.32);
    return { x: L.shoreX(p.z) - 30, z: p.z };
  })();
  const boobies = Array.from({ length: nBoobies }, (_, i) => ({
    r: 8 + (i % 3) * 4,
    w: 0.16 + (i % 2) * 0.04,
    ph: i * 0.9,
    off: i * 2.2,
  }));
  const boobyGeo = boobyGlide();
  const boobyMesh = inst(boobyGeo, nBoobies, "costa-tierra:boobies", false);
  const splashGeo = splash();
  const splashMesh = inst(splashGeo, nBoobies, "costa-tierra:splash", false);
  const CYC = DIVE.glide + DIVE.plunge + DIVE.float + DIVE.rise;
  const HOLD = DIVE.plunge + DIVE.float;
  /** Flight time along the circle: the bird keeps its spot while it plunges and sits on the water. */
  const flightT = (t: number) => {
    const n = Math.floor(t / CYC);
    const c = t - n * CYC;
    return n * (CYC - HOLD) + c - Math.min(Math.max(c - DIVE.glide, 0), HOLD);
  };

  // ------------------------------------------------------------------ frame
  const near = (x: number, z: number, r = VIEW) => Math.hypot(x - cam.x, z - cam.z) < r;
  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      env.camera.getWorldPosition(cam);

      // Four-legged walkers.
      for (const g of groups) {
        // Groups spread over the map (two plazas, two valleys): drawn while any of them is near.
        const on = g.list.some((a) => near(a.w.x, a.w.z));
        g.herd.visible = on;
        if (!on) continue;
        g.list.forEach((a, i) => {
          const w = a.w;
          if (!rm) stepWander(w, dt, g.opts, R, g.ok);
          else {
            w.speed = 0;
            if (w.state === "walk") w.state = "graze";
          }
          // Bumped by the traveler or each other: step aside where the ground allows.
          a.body.x = w.x;
          a.body.z = w.z;
          a.body.solid = true;
          if (creatures.resolve(a.body, g.ok, 0.08)) {
            w.x = a.body.x;
            w.z = a.body.z;
          }
          a.phase += w.speed * g.stride * dt;
          const dTr = Math.hypot(avatar.x - w.x, avatar.z - w.z);
          let turn = 0;
          if (dTr < 5 && w.state !== "walk") {
            const rel = Math.atan2(avatar.x - w.x, avatar.z - w.z) - w.yaw;
            turn = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(rel), Math.cos(rel))));
          }
          const pitch = w.state === "graze" && dTr > 3 ? g.graze : 0;
          a.pitch += (pitch - a.pitch) * Math.min(1, dt * 3);
          a.turn = turnToward(a.turn, turn, dt * 2.5);
          g.herd.set(i, {
            x: w.x,
            y: S.groundAt(w.x, w.z),
            z: w.z,
            yaw: w.yaw,
            phase: a.phase,
            swing: Math.min(1, w.speed / Math.max(0.1, g.opts.pace)) * g.swing,
            pitch: a.pitch + (rm ? 0 : Math.sin(t * 0.7 + i) * 0.04),
            turn: a.turn,
            scale: a.scale,
          });
        });
        g.herd.flush();
      }

      // Lizards: bask (with the odd push-up), dash to the burrow when the traveler comes close.
      const lizOn = lizards.some((l) => near(l.hx, l.hz));
      lizMesh.visible = lizOn;
      if (lizOn) {
        lizards.forEach((l, i) => {
          const n = stepCrab(l, avatar.x, avatar.z, dt * 1.3);
          const next = rm && n.state === "run" ? { ...n, x: n.wx, z: n.wz, state: "hidden" as const, timer: 7 } : n;
          if (next.state === "run") l.yaw = Math.atan2(l.wx - l.hx, l.wz - l.hz);
          Object.assign(l, next);
          if (l.state === "hidden") {
            lizMesh.setMatrixAt(i, ZERO);
            return;
          }
          const run = l.state === "run";
          const push = !rm && !run ? Math.max(0, Math.sin(t * 2.2 + l.ph)) ** 8 * 0.03 : 0;
          dummy.position.set(l.x, S.groundAt(l.x, l.z) + push, l.z);
          dummy.rotation.set(-push * 4, l.yaw + (run ? Math.sin(t * 30 + l.ph) * 0.25 : 0), 0);
          dummy.scale.setScalar(1.5);
          dummy.updateMatrix();
          lizMesh.setMatrixAt(i, dummy.matrix);
        });
        lizMesh.instanceMatrix.needsUpdate = true;
      }

      // Sanderlings at the water's edge.
      const sandOn = birds.some((b) => near(b.b.x, b.b.z));
      sandMesh.visible = sandOn;
      if (sandOn) {
        birds.forEach((s, i) => {
          const b = s.b;
          const ax = b.x - b.nz * s.along;
          const az = b.z + b.nx * s.along;
          // The drawn sea against the sand, sampled across the beach (d seaward of the waterline point).
          const tt = rm ? 0 : t;
          const edge = waterEdge(
            (d) => {
              const x = ax + b.nx * d;
              const z = az + b.nz * d;
              return seaHeight(x, z, L.shoreX(z) - x, tt) > S.groundAt(x, z);
            },
            -4,
            14,
            0.5,
          );
          const target = 0.15 + s.jitter * 0.6 - edge;
          const before = s.up;
          s.up = rm ? target : chase(s.up, target, 2.6, dt);
          const moving = Math.abs(s.up - before) > 1e-4;
          s.peck -= dt;
          if (s.peck < -0.4) s.peck = 1 + R() * 2.5;
          const x = ax - b.nx * s.up;
          const z = az - b.nz * s.up;
          dummy.position.set(x, S.groundAt(x, z), z);
          // Facing along the shore, the body tipped forward while pecking; a quick patter while running.
          const yaw = Math.atan2(-b.nz, b.nx) + (moving ? Math.sign(s.up - before) * 0.9 : 0);
          dummy.rotation.set(!moving && s.peck < 0 && !rm ? 0.7 : 0, yaw, 0);
          dummy.position.y += moving && !rm ? Math.abs(Math.sin(t * 40 + i)) * 0.015 : 0;
          dummy.scale.setScalar(1.4);
          dummy.updateMatrix();
          sandMesh.setMatrixAt(i, dummy.matrix);
        });
        sandMesh.instanceMatrix.needsUpdate = true;
      }

      // Boobies: wheel, plunge, sit, rise.
      const boobyOn = near(flock.x, flock.z, VIEW + 60);
      boobyMesh.visible = boobyOn;
      splashMesh.visible = boobyOn && !rm;
      if (boobyOn) {
        boobies.forEach((b, i) => {
          const tt = rm ? 0 : t + b.off;
          const d = rm ? { phase: "glide" as const, y: 10, u: 0 } : dive(tt, 10);
          const c = circle(flightT(tt), b.r, b.w, b.ph);
          const x = flock.x + c.x;
          const z = flock.z + c.z;
          const sea = seaHeight(x, z, L.shoreX(z) - x, rm ? 0 : t);
          const y = sea + (d.phase === "float" ? 0 : d.y);
          dummy.position.set(x, y, z);
          const pitch = d.phase === "plunge" ? 1.35 : d.phase === "rise" ? -0.35 * (1 - d.u) : 0;
          dummy.rotation.set(pitch, c.yaw, d.phase === "glide" ? -0.25 : 0);
          // Wings folded back for the plunge and on the water.
          const fold = d.phase === "plunge" ? 0.28 : d.phase === "float" ? 0.4 : 1;
          dummy.scale.set(fold * 1.2, 1.2, 1.2);
          dummy.updateMatrix();
          boobyMesh.setMatrixAt(i, dummy.matrix);
          const sp = d.phase === "float" && d.u < 0.25 ? 1 - d.u / 0.25 : 0;
          if (sp > 0) {
            dummy.position.set(x, sea, z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(sp * 1.4, sp * 1.8, sp * 1.4);
            dummy.updateMatrix();
            splashMesh.setMatrixAt(i, dummy.matrix);
          } else splashMesh.setMatrixAt(i, ZERO);
        });
        boobyMesh.instanceMatrix.needsUpdate = true;
        splashMesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const g of groups) {
        for (const a of g.list) creatures.remove(a.body);
        g.herd.dispose();
      }
      root.removeFromParent();
      for (const g of [lizGeo, sandGeo, boobyGeo, splashGeo]) g.dispose();
      mat.dispose();
    },
  };
};
