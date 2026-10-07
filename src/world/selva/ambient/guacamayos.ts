/**
 * Guacamayos: scarlet macaws (Ara macao) and blue-and-yellow macaws (Ara ararauna), by day.
 *  - Flyovers: noisy pairs and small flocks (two to three pairs, partners wingtip to wingtip) cross the river
 *    and the road high above the canopy, a little ahead of the traveler, every half minute or so.
 *  - Emergent snags: two dead emergent trees stand over the forest (one on the river side between the
 *    embarcadero and the palafitos, one past the canopy walkway); a few pairs perch on their bare limbs,
 *    preening each other and turning their heads to watch. They take off when the traveler comes close and
 *    are back later (only while nobody is looking).
 *  - The collpa: from first light to mid-morning (time ≈ 0.25–0.4) a big mixed flock clings to the clay
 *    band of the cliff across the river from the collpa viewpoint (geometry from ./collpa/spot.ts), biting
 *    the clay, shuffling along the wall with a flutter. Every minute or two the whole flock panics, wheels
 *    out over the river and comes back to the wall; by mid-morning they leave in ones and twos.
 * At night they roost: the snag birds sleep on their perches, the flyovers and the collpa flock are gone.
 *
 * Rendering: two bird-rig InstancedMeshes (one per species, wings and head in the vertex shader, frustum-culled
 * as a whole) and one static mesh per snag (drawn within ~260 u) → ≤ 4 draw calls.
 * Bodies ("guacamayo", creatures.ts): listed for the soundscape and queries, never solid (they live in the air
 * and on the snags).
 * Stamp `selva:fauna:guacamayo` after a ~1.5 s good look: within ~34 u at the collpa (the wall is across
 * the river), ~26 u at the snags, ~30 u for a flyover overhead.
 */
import * as THREE from "three";
import {
  type Flight,
  flightEase,
  flightPoint,
  flightTangent,
  newFlight,
  planFlight,
  type Vec,
} from "../../ambient/birds/sim";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, PARKED, park } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { collpaCliff } from "./collpa/spot";
import { FOLDED, macawModel, WingSet } from "./wild/birds";
import { devHook, idle, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { collpaPresence, damp, diurnal, rng, roadFrame, TAU, treeSites, turnToward, wrapAngle } from "./wild/logic";
import { type HostTree, limbPoint, snag } from "./wild/trees";

type Mode = "away" | "perch" | "cling" | "fly";
type Home = "flyover" | "snag" | "collpa";

interface Macaw {
  sp: 0 | 1;
  home: Home;
  mode: Mode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bank: number;
  f: Flight;
  /** What happens when the flight ends. */
  next: Mode;
  /** Chained second leg (collpa panic loop: out over the river, then back to the wall). */
  leg2: Flight | null;
  timer: number;
  headYaw: number;
  headPitch: number;
  headT: number;
  wing: number;
  fold: number;
  flap: number;
  /** Perch: snag index + limb + position along it; cling: u, v on the wall. */
  tree: number;
  limb: number;
  lu: number;
  cu: number;
  cv: number;
  /** Partner index (−1 none) for pairs. */
  mate: number;
  body: Body;
}

/** A little larger than life so a flock reads across the river at the collpa (~27 u). */
const SCALE = 1.45;
const SPEED = 9;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(7717);

  // ---- the collpa wall (built by the collpa station; we only read its geometry)
  const cliff = collpaCliff(L);
  const clay = cliff.clayV;
  const wallAt = (u: number, v: number, out: Vec, off = 0.14) => {
    const p = cliff.point(u, v);
    const n = cliff.normalAt(u);
    out.x = p.x + n.x * off;
    out.y = p.y;
    out.z = p.z + n.z * off;
    return out;
  };

  // ---- emergent snags
  const snags: HostTree[] = [];
  /** One mesh per snag, drawn only near the camera (they stand above the canopy: a longer reach). */
  const props = new SiteProps(env, "selva-fauna-guacamayo-snags", 260);
  const snagSpots: Array<[number, number]> = [
    [0.5, 0.53],
    [0.895, 0.93],
  ];
  for (const [t0, t1] of snagSpots) {
    const s = treeSites(L, { t0, t1, n: 1, lat0: 12, lat1: 18, side: 1, gap: 4, seed: 31 + Math.round(t0 * 100) });
    const site = s[0];
    if (!site) continue;
    if (L.colliders.some((c) => c.kind === "circle" && Math.hypot(c.x - site.x, c.z - site.z) < c.r + 1.5)) continue;
    const builder = new GeoBuilder();
    snags.push(snag(builder, site.x, site.y, site.z, 24 + R() * 4, R));
    props.add(builder.build(), false);
  }

  // ---- population
  const nCollpa = high ? 16 : 9;
  const nSnag = snags.length * (high ? 4 : 2);
  const nFly = high ? 6 : 4;
  const birds: Macaw[] = [];
  const mk = (sp: 0 | 1, home: Home): Macaw => ({
    sp,
    home,
    mode: "away",
    x: PARKED,
    y: 0,
    z: PARKED,
    yaw: 0,
    pitch: 0,
    bank: 0,
    f: newFlight(),
    next: "away",
    leg2: null,
    timer: R() * 5,
    headYaw: 0,
    headPitch: 0,
    headT: R() * 2,
    wing: FOLDED,
    fold: 1,
    flap: R() * TAU,
    tree: 0,
    limb: 0,
    lu: 0.5,
    cu: 0,
    cv: 0,
    mate: -1,
    body: creatures.add("guacamayo", 0.4, { solid: false, x: PARKED, z: PARKED }),
  });
  for (let i = 0; i < nCollpa; i++) birds.push(mk(i % 3 === 2 ? 1 : 0, "collpa"));
  for (let i = 0; i < nSnag; i++) {
    const b = mk(i % 4 >= 2 ? 1 : 0, "snag");
    b.tree = Math.floor(i / (high ? 4 : 2));
    b.mate = i % 2 === 0 ? birds.length + 1 : birds.length - 1;
    birds.push(b);
  }
  const flyStart = birds.length;
  for (let i = 0; i < nFly; i++) {
    // Flyover pairs share a species (macaws fly with their partner).
    const b = mk(Math.floor(i / 2) % 3 === 1 ? 1 : 0, "flyover");
    b.mate = i % 2 === 0 ? birds.length + 1 : birds.length - 1;
    birds.push(b);
  }
  const counts = [0, 0];
  for (const b of birds) counts[b.sp]!++;
  const sets = [
    new WingSet(env, "selva-fauna-guacamayo-escarlata", macawModel("scarlet"), counts[0]!),
    new WingSet(env, "selva-fauna-guacamayo-azul", macawModel("blue"), counts[1]!),
  ];
  const root = new THREE.Group();
  root.name = "selva-fauna-guacamayo";
  root.add(sets[0]!.mesh, sets[1]!.mesh);
  root.add(props.group);
  env.scene.add(root);

  const spot = new Spotter(env, "guacamayo", 26);
  const offDev = devHook("guacamayo", () => ({
    snags: snags.map((t) => [+t.x.toFixed(1), +t.top.toFixed(1), +t.z.toFixed(1)]),
    birds: birds
      .filter((m) => m.mode !== "away")
      .map((m) => [m.home, m.mode, +m.x.toFixed(1), +m.y.toFixed(1), +m.z.toFixed(1)]),
  }));
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  const a: Vec = { x: 0, y: 0, z: 0 };
  const b2: Vec = { x: 0, y: 0, z: 0 };
  const tan: Vec = { x: 0, y: 0, z: 0 };
  let flyTimer = 6;
  let panicTimer = 50 + R() * 40;
  let trackT = 0;
  let trackLast = -1;
  let trackDir = 1;
  let trackClock = 1;
  let clock = 0;

  const takenWall: Array<[number, number]> = [];
  const freeWallSpot = (m: Macaw) => {
    for (let k = 0; k < 30; k++) {
      const u = -0.85 + R() * 1.7;
      const v = clay[0] + 0.06 + R() * (clay[1] - clay[0] - 0.12);
      if (takenWall.every(([tu, tv]) => Math.abs(tu - u) * cliff.width * 0.5 > 0.9 || Math.abs(tv - v) * 9 > 0.9)) {
        m.cu = u;
        m.cv = v;
        takenWall.push([u, v]);
        return;
      }
    }
    m.cu = -0.85 + R() * 1.7;
    m.cv = clay[0] + 0.1 + R() * 0.5;
  };
  const releaseWall = (m: Macaw) => {
    const i = takenWall.findIndex(([u, v]) => u === m.cu && v === m.cv);
    if (i >= 0) takenWall.splice(i, 1);
  };
  /** Far point over the forest (start / end of arrivals and departures), out from the wall. */
  const farFromWall = (out: Vec) => {
    const n = cliff.normalAt(0);
    const p = cliff.point(0, 1);
    const side = R() < 0.5 ? -1 : 1;
    out.x = p.x - n.x * 40 + n.z * side * (30 + R() * 30);
    out.z = p.z - n.z * 40 - n.x * side * (30 + R() * 30);
    out.y = cliff.top + 14 + R() * 8;
    return out;
  };
  const fly = (m: Macaw, from: Vec, to: Vec, next: Mode, arc = 0.12, lift = 2, speed = SPEED) => {
    planFlight(m.f, from, to, speed * (0.9 + R() * 0.2), arc, lift);
    m.mode = "fly";
    m.next = next;
    m.leg2 = null;
  };

  const startFlyover = () => {
    // A crossing over the road a little ahead of the traveler, high above the canopy, river side ↔ forest.
    const ahead = 15 + R() * 25;
    const t = Math.max(0.03, Math.min(0.97, trackT + (trackDir * ahead) / L.trail.length));
    const f = roadFrame(L, t);
    const dir = R() < 0.5 ? 1 : -1;
    const y = f.y + 18 + R() * 7;
    const pairs = high ? 1 + Math.floor(R() * 3) : 1 + Math.floor(R() * 2);
    const along = (R() - 0.5) * 30;
    for (let p = 0; p < pairs; p++) {
      for (let k = 0; k < 2; k++) {
        const m = birds[flyStart + p * 2 + k];
        if (m?.mode !== "away") continue;
        const lag = p * 3.5 + k * 0.6;
        const side = (k ? 1.1 : -0.2) + p * 0.8;
        a.x = f.x + f.rx * dir * (55 + lag) + f.tx * (along + side);
        a.z = f.z + f.rz * dir * (55 + lag) + f.tz * (along + side);
        a.y = y + p * 0.8 + k * 0.3;
        b2.x = f.x - f.rx * dir * (60 - lag) + f.tx * (along + side + (R() - 0.5) * 6);
        b2.z = f.z - f.rz * dir * (60 - lag) + f.tz * (along + side);
        b2.y = y + (R() - 0.5) * 4;
        m.x = a.x;
        m.y = a.y;
        m.z = a.z;
        fly(m, a, b2, "away", 0.04, 0, SPEED);
        // Straight crossing at an even pace (the duration spans the lag so partners stay side by side).
        m.f.dur = Math.hypot(b2.x - a.x, b2.z - a.z) / SPEED;
      }
    }
  };

  const perchOnSnag = (m: Macaw, instant: boolean) => {
    const tr = snags[m.tree];
    if (!tr) return;
    m.limb = Math.floor(R() * tr.limbs.length);
    // The mate sits beside its partner on the same limb.
    const mate = m.mate >= 0 ? birds[m.mate] : undefined;
    if (mate && mate.mode === "perch" && mate.tree === m.tree) {
      m.limb = mate.limb;
      m.lu = Math.min(0.95, mate.lu + 0.12);
    } else m.lu = 0.45 + R() * 0.45;
    const l = tr.limbs[m.limb]!;
    limbPoint(l, m.lu, a, 1);
    if (instant) {
      m.x = a.x;
      m.y = a.y;
      m.z = a.z;
      m.mode = "perch";
      m.yaw = Math.atan2(l.bz - l.az, -(l.bx - l.ax)) + (R() < 0.5 ? 0 : Math.PI);
    } else {
      b2.x = m.x;
      b2.y = m.y;
      b2.z = m.z;
      fly(m, b2, a, "perch", 0.15, 1);
    }
  };

  // The snag pairs are already up there when the traveler arrives.
  for (const m of birds) if (m.home === "snag") perchOnSnag(m, true);

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const day = diurnal(time) > 0.5;
      const collpaK = collpaPresence(time);
      const mot = rm ? 0.6 : 1;
      trackClock += dt;
      if (trackClock > 0.4) {
        trackClock = 0;
        trackT = L.trail.nearestT(avatar.x, avatar.z);
        if (trackLast >= 0 && Math.abs(trackT - trackLast) > 0.0004) trackDir = trackT > trackLast ? 1 : -1;
        trackLast = trackT;
      }
      spot.begin();
      props.update(spot.view.cam);

      // ---- flyovers
      flyTimer -= dt;
      if (flyTimer <= 0 && day && !inside) {
        startFlyover();
        flyTimer = 22 + R() * 26;
      }
      // ---- collpa: arrivals while the window is open (more birds the fuller it is), panics, departures
      const want = Math.round(collpaK * nCollpa);
      let onWall = 0;
      for (const m of birds) if (m.home === "collpa" && m.mode !== "away") onWall++;
      panicTimer -= dt;
      const panic = panicTimer <= 0 && onWall > 3;
      if (panicTimer <= 0) panicTimer = 60 + R() * 70;

      let collIdx = 0;
      for (const m of birds) {
        if (m.home === "collpa") {
          collIdx++;
          if (m.mode === "away" && collIdx <= want && R() < dt * 0.6) {
            farFromWall(a);
            freeWallSpot(m);
            wallAt(m.cu, m.cv, b2);
            m.x = a.x;
            m.y = a.y;
            m.z = a.z;
            fly(m, a, b2, "cling", 0.1, 2);
          } else if (m.mode === "cling" && collIdx > want && R() < dt * 0.15) {
            releaseWall(m);
            a.x = m.x;
            a.y = m.y;
            a.z = m.z;
            fly(m, a, farFromWall(b2), "away", 0.1, 2);
          } else if (m.mode === "cling" && panic && R() < 0.85) {
            // Panic loop: out over the river, wheel, and back to (another spot on) the wall.
            releaseWall(m);
            a.x = m.x;
            a.y = m.y;
            a.z = m.z;
            const n = cliff.normalAt(m.cu);
            b2.x = m.x + n.x * (12 + R() * 8) + n.z * (R() - 0.5) * 20;
            b2.z = m.z + n.z * (12 + R() * 8) - n.x * (R() - 0.5) * 20;
            b2.y = cliff.top + 4 + R() * 6;
            fly(m, a, b2, "cling", 0.15, 1);
            freeWallSpot(m);
            const back = newFlight();
            const c: Vec = { x: 0, y: 0, z: 0 };
            wallAt(m.cu, m.cv, c);
            planFlight(back, b2, c, SPEED * 0.9, 0.15, 1.5);
            m.leg2 = back;
            m.timer = R() * 0.6; // they go up in a ragged burst
          }
        } else if (m.home === "snag") {
          if (m.mode === "away") {
            // Back on the snag when nobody is looking from close by.
            const tr = snags[m.tree];
            m.timer -= dt;
            if (tr && m.timer <= 0 && Math.hypot(tr.x - avatar.x, tr.z - avatar.z) > 45) {
              const seen = spot.view.sees(tr.x, tr.top, tr.z, 4);
              if (!seen) perchOnSnag(m, true);
              else m.timer = 3;
            }
          } else if (m.mode === "perch") {
            // Horizontal distance: the pairs sit 20+ u up, a traveler passing right by the trunk flushes them.
            const dh = Math.hypot(m.x - avatar.x, m.z - avatar.z);
            if ((dh < 14 && day) || inside) {
              // Flush: off over the forest, away from the traveler; the mate follows a beat later.
              a.x = m.x;
              a.y = m.y;
              a.z = m.z;
              const ax = m.x - avatar.x;
              const az = m.z - avatar.z;
              const al = Math.hypot(ax, az) || 1;
              b2.x = m.x + (ax / al) * 70 + (R() - 0.5) * 20;
              b2.z = m.z + (az / al) * 70 + (R() - 0.5) * 20;
              b2.y = m.y + 4 + R() * 6;
              fly(m, a, b2, "away", 0.05, 2);
              m.timer = 25 + R() * 30;
            }
          }
        }

        // ---- per-mode motion
        switch (m.mode) {
          case "away":
            continue;
          case "fly": {
            if (m.timer > 0) {
              m.timer -= dt;
              break;
            }
            m.f.u += dt / m.f.dur;
            const u = Math.min(1, m.f.u);
            const e = m.home === "flyover" ? u : flightEase(u);
            flightPoint(m.f, e, a);
            flightTangent(m.f, e, tan);
            const hl = Math.hypot(tan.x, tan.z);
            const yawT = hl > 1e-4 ? Math.atan2(tan.x, tan.z) : m.yaw;
            const turn = wrapAngle(yawT - m.yaw);
            m.yaw = turnToward(m.yaw, yawT, 5 * dt);
            m.bank = damp(m.bank, Math.max(-0.6, Math.min(0.6, -turn * 3)), 4, dt);
            m.pitch = damp(m.pitch, 0.55 - Math.atan2(tan.y, Math.max(0.1, hl)) * 0.6, 6, dt);
            m.x = a.x;
            m.y = a.y + Math.sin(clock * 3 + m.flap) * 0.08;
            m.z = a.z;
            const landing = u > 0.85 && m.next !== "away";
            m.flap += dt * (landing ? 15 : 11) * mot;
            m.wing = rm ? 0.3 + Math.sin(m.flap) * 0.35 : Math.sin(m.flap) * 0.8 + 0.08;
            m.fold = damp(m.fold, landing ? 0.35 : 0, 10, dt);
            if (u >= 1) {
              if (m.leg2) {
                m.f = m.leg2;
                m.leg2 = null;
              } else {
                m.mode = m.next;
                if (m.mode === "away") {
                  park(m.body);
                  m.x = PARKED;
                  m.timer = m.home === "snag" ? 25 + R() * 30 : 0;
                  continue;
                }
                m.timer = 1 + R() * 3;
              }
            }
            break;
          }
          case "perch": {
            const tr = snags[m.tree];
            if (tr) {
              const l = tr.limbs[m.limb]!;
              limbPoint(l, m.lu, a, 1);
              m.x = a.x;
              m.y = a.y;
              m.z = a.z;
            }
            m.pitch = damp(m.pitch, 0, 6, dt);
            m.bank = damp(m.bank, 0, 6, dt);
            m.wing = damp(m.wing, FOLDED, 8, dt);
            m.fold = damp(m.fold, 1, 8, dt);
            break;
          }
          case "cling": {
            wallAt(m.cu, m.cv, a);
            m.x = a.x;
            m.y = a.y;
            m.z = a.z;
            const n = cliff.normalAt(m.cu);
            m.yaw = turnToward(m.yaw, Math.atan2(-n.x, -n.z), 6 * dt);
            // Upright against the wall, belly to the clay.
            m.pitch = damp(m.pitch, -0.85, 6, dt);
            m.bank = damp(m.bank, 0, 6, dt);
            m.timer -= dt;
            if (m.timer <= 0) {
              // Shuffle along the wall with a flutter now and then.
              m.timer = 2 + R() * 6;
              if (R() < 0.35) {
                releaseWall(m);
                const ou = m.cu;
                const ov = m.cv;
                freeWallSpot(m);
                // Keep shuffles short: stay near the old spot when the free one is far.
                if (Math.abs(m.cu - ou) > 0.2) {
                  m.cu = Math.max(-0.9, Math.min(0.9, ou + (R() - 0.5) * 0.15));
                  m.cv = Math.max(clay[0] + 0.05, Math.min(clay[1] - 0.05, ov + (R() - 0.5) * 0.1));
                }
                m.flap = 0;
              }
            }
            const flutter = m.flap < 1.2 ? 1 : 0;
            m.flap += dt * 12 * mot;
            m.wing = flutter ? 0.55 + Math.sin(m.flap * 3) * 0.4 : damp(m.wing, FOLDED, 10, dt);
            m.fold = damp(m.fold, flutter ? 0.3 : 1, 12, dt);
            break;
          }
        }

        // Heads: preen, look around, bite clay at the wall, watch a close traveler.
        m.headT -= dt;
        if (m.headT <= 0) m.headT = 0.6 + R() * 2.4;
        let hy = 0;
        let hp = 0;
        if (m.mode === "cling") {
          hp = 0.3 + (Math.sin(clock * 5 + m.flap) > 0.4 ? 0.45 : 0);
          hy = Math.sin(clock * 0.7 + m.cu * 9) * 0.5;
        } else if (m.mode === "perch") {
          const d = Math.hypot(m.x - avatar.x, m.z - avatar.z);
          if (!day) {
            hy = 2.4; // asleep: head turned back into the shoulder
            hp = 0.3;
          } else if (d < 30) {
            hy = Math.max(-1.3, Math.min(1.3, wrapAngle(Math.atan2(avatar.x - m.x, avatar.z - m.z) - m.yaw)));
            hp = -0.2;
          } else {
            const mate = m.mate >= 0 ? birds[m.mate] : undefined;
            if (mate && mate.mode === "perch" && Math.sin(clock * 0.4 + m.tree) > 0.3) {
              // Allopreening: lean toward the partner.
              hy = Math.max(-1.2, Math.min(1.2, wrapAngle(Math.atan2(mate.x - m.x, mate.z - m.z) - m.yaw)));
              hp = 0.5;
            } else {
              hy = Math.sin(m.headT * 3 + m.lu * 7) * 0.9;
              hp = Math.sin(m.headT * 2) * 0.3;
            }
          }
        }
        m.headYaw = damp(m.headYaw, hy, rm ? 3 : 7, dt);
        m.headPitch = damp(m.headPitch, hp, rm ? 3 : 9, dt);
        m.body.solid = false;
        m.body.x = m.x;
        m.body.z = m.z;
        const near = m.home === "collpa" ? 34 : m.home === "snag" ? 26 : 30;
        if (m.mode !== "fly" || m.home === "flyover" || m.f.u > 0.3)
          spot.see(m.x, m.y, m.z, avatar.x, avatar.z, 0.7, near);
      }

      // ---- draw
      const nDraw = [0, 0];
      for (const m of birds) {
        if (m.mode === "away" || spot.view.dist(m.x, m.y, m.z) > 220) continue;
        const set = sets[m.sp]!;
        set.set(nDraw[m.sp]!, m.x, m.y, m.z, m.yaw, m.pitch, m.bank, SCALE, m.wing, m.headYaw, m.headPitch, m.fold);
        nDraw[m.sp]!++;
      }
      sets[0]!.commit(inside ? 0 : nDraw[0]!);
      sets[1]!.commit(inside ? 0 : nDraw[1]!);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const m of birds) creatures.remove(m.body);
      for (const s of sets) s.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
