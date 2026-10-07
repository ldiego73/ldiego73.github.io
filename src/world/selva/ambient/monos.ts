/**
 * Monos fraile (common squirrel monkeys, Saimiri sciureus) and a coto (Venezuelan red howler, Alouatta
 * seniculus).
 *  - A troop travels through a short row of spreading canopy trees along the road edge between the
 *    embarcadero and the palafitos (a second troop between the regatón and the maloca on high quality).
 *    Monkeys bound along a limb and leap from tree to tree, arms reaching forward, then sit up on a branch
 *    with the long black-tipped tail hanging, look around in quick jerks and stare at the traveler. The troop
 *    drifts up and down the row; when the traveler comes under its tree it moves away along the row.
 *    At night they sleep huddled together in one tree.
 *  - The coto (high quality) sits high in the tallest tree of the first row; around dawn and dusk it throws
 *    its head back in the long roar the howlers are named for.
 *
 * The trees come with this module (wild/trees.ts broadTree; one merged static mesh per grove, drawn only near
 * the camera), so every monkey sits and lands on a real limb. Two limbs of every tree reach out low over the
 * road edge, where the troop is in sight. Rendering: grove + squirrel-monkey rig + howler rig → ≤ 3 draw calls.
 * Bodies ("mono", "coto"): listed for queries, never solid (up in the trees).
 * Stamp `selva:fauna:mono` after a ~1.5 s good look within 16 u.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { devHook, FAUNA_FAR, idle, ramp, rootMatrix, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { damp, diurnal, howlerHour, leapPoint, nightAmount, rng, treeSites, turnToward, wrapAngle } from "./wild/logic";
import { howlerModel, squirrelMonkeyModel } from "./wild/mammals";
import { RigSet } from "./wild/rig";
import { broadTree, type HostTree, limbPoint } from "./wild/trees";

interface Perch {
  tree: number;
  x: number;
  y: number;
  z: number;
  /** Limb direction (yaw) at the perch: monkeys sit across or along it. */
  yaw: number;
  near: number[];
}

interface Troop {
  trees: HostTree[];
  perches: Perch[];
  goal: number;
  dir: 1 | -1;
  timer: number;
  members: Monkey[];
}

interface Monkey {
  troop: Troop;
  perch: number;
  from: number;
  state: "sit" | "leap";
  u: number;
  dur: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  timer: number;
  headYaw: number;
  headPitch: number;
  look: number;
  lookT: number;
  phase: number;
  /** Pose blend: 0 sitting up, 1 stretched in a leap. */
  stretch: number;
  tail: number;
  body: Body;
}

/** Squirrel monkeys are small (≈ 0.3 u body): drawn a little larger so they read up in the trees. */
const SCALE = 1.7;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(4129);
  const troops: Troop[] = [];
  /** One mesh per grove, drawn only near the camera. */
  const props = new SiteProps(env, "selva-fauna-mono-trees");
  /** Perches taken ("troop:perch"), so two monkeys never land on the same spot. */
  const occupied = new Set<string>();

  const clearOfTrunks = (x: number, z: number) =>
    !L.colliders.some((c) => c.kind === "circle" && Math.hypot(c.x - x, c.z - z) < c.r + 1.5);

  const grove = (t0: number, t1: number, side: -1 | 1, n: number) => {
    const sites = treeSites(L, { t0, t1, n: 8, lat0: 6.6, lat1: 8.5, side, gap: 4.6, seed: Math.round(t0 * 997) })
      .filter((s) => clearOfTrunks(s.x, s.z))
      .sort((a, b) => a.t - b.t);
    if (sites.length < 3) return;
    // Two limbs of every tree reach out low over the road edge: the troop is in sight from the road there.
    const builder = new GeoBuilder();
    const trees = sites.map((s) => {
      const p = L.trail.pointAt(s.t);
      return broadTree(builder, s.x, s.y, s.z, 6 + R(), R, {
        nLimbs: 4,
        spread: 0.95,
        toward: Math.atan2(p.x - s.x, p.z - s.z),
      });
    });
    props.add(builder.build(), high);
    const perches: Perch[] = [];
    trees.forEach((tr, ti) => {
      for (const l of tr.limbs)
        for (const u of [0.55, 0.88]) {
          const p = { x: 0, y: 0, z: 0 };
          limbPoint(l, u, p, 1);
          perches.push({ tree: ti, ...p, yaw: Math.atan2(l.bx - l.ax, l.bz - l.az), near: [] });
        }
    });
    for (const [i, a] of perches.entries())
      for (const [j, b] of perches.entries())
        if (i !== j && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 6.2 && Math.abs(a.tree - b.tree) <= 1)
          a.near.push(j);
    const troop: Troop = { trees, perches, goal: 0, dir: 1, timer: 4, members: [] };
    for (let i = 0; i < n; i++) {
      const pi = perches.findIndex(
        (p, k) => p.tree === Math.min(trees.length - 1, i % 2) && !occupied.has(`${troops.length}:${k}`),
      );
      const perch = pi >= 0 ? pi : i % perches.length;
      occupied.add(`${troops.length}:${perch}`);
      const p = perches[perch]!;
      troop.members.push({
        troop,
        perch,
        from: perch,
        state: "sit",
        u: 0,
        dur: 1,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: R() * Math.PI * 2,
        pitch: 0,
        timer: R() * 3,
        headYaw: 0,
        headPitch: 0,
        look: 0,
        lookT: 0,
        phase: R(),
        stretch: 0,
        tail: 0,
        body: creatures.add("mono", 0.25, { solid: false, x: p.x, z: p.z }),
      });
    }
    troops.push(troop);
  };
  grove(0.515, 0.562, -1, high ? 8 : 5);
  if (high) grove(0.185, 0.24, 1, 6);

  // The howler: on the highest back limb of the tallest tree of the first row, close to the fork (the
  // limb tips are buried in the crowns), facing out over the road.
  const howler =
    high && troops[0]
      ? (() => {
          const tr = troops[0]!.trees.reduce((a, b) => (b.top > a.top ? b : a));
          const back = tr.limbs.slice(2);
          const l = (back.length ? back : tr.limbs).reduce((a, b) => (b.by > a.by ? b : a));
          const c = limbPoint(l, 0.38, { x: 0, y: 0, z: 0 }, 1);
          const road = L.trail.pointAt(L.trail.nearestT(c.x, c.z));
          return {
            x: c.x,
            y: c.y,
            z: c.z,
            yaw: Math.atan2(road.x - c.x, road.z - c.z),
            headYaw: 0,
            headPitch: 0,
            look: 0,
            lookT: 0,
            body: creatures.add("coto", 0.4, { solid: false, x: c.x, z: c.z }),
          };
        })()
      : null;

  const total = troops.reduce((a, t) => a + t.members.length, 0);
  const sm = squirrelMonkeyModel();
  const set = new RigSet("selva-fauna-mono-body", sm.geo, sm.spec, total, ramp(env));
  const hm = howlerModel();
  const hset = howler ? new RigSet("selva-fauna-coto-body", hm.geo, hm.spec, 1, ramp(env)) : null;
  const root = new THREE.Group();
  root.name = "selva-fauna-mono";
  root.add(set.mesh);
  if (hset) root.add(hset.mesh);
  root.add(props.group);
  env.scene.add(root);

  const spot = new Spotter(env, "mono", 16);
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offDev = devHook("mono", () => ({
    troops: troops.map((t) => ({ goal: t.goal, trees: t.trees.map((tr) => [+tr.x.toFixed(1), +tr.z.toFixed(1)]) })),
    monkeys: troops.flatMap((t) => t.members.map((m) => [m.state, +m.x.toFixed(1), +m.y.toFixed(1), +m.z.toFixed(1)])),
    howler: howler ? [howler.x, howler.y, howler.z] : null,
  }));
  const m4 = new THREE.Matrix4();
  const p3 = { x: 0, y: 0, z: 0 };
  let clock = 0;

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const awake = diurnal(time) > 0.3;
      const night = nightAmount(time);
      set.rim.value = night * 0.6;
      if (hset) hset.rim.value = night * 0.6;
      const mot = rm ? 0.6 : 1;
      spot.begin();
      props.update(spot.view.cam);
      let n = 0;
      for (const [ti, troop] of troops.entries()) {
        const K = troop.trees.length;
        // The troop's goal tree drifts along the row; away from a traveler under it.
        troop.timer -= dt;
        let nearTree = -1;
        let nd = 9;
        troop.trees.forEach((tr, k) => {
          const d = Math.hypot(tr.x - avatar.x, tr.z - avatar.z);
          if (d < nd) {
            nd = d;
            nearTree = k;
          }
        });
        if (nearTree >= 0 && awake && Math.abs(nearTree - troop.goal) <= 1) {
          troop.dir = nearTree <= 0 ? 1 : nearTree >= K - 1 ? -1 : nearTree > K / 2 ? -1 : 1;
          troop.goal = troop.dir > 0 ? K - 1 : 0;
          troop.timer = 10;
        } else if (troop.timer <= 0 && awake) {
          troop.timer = 7 + R() * 8;
          if (troop.goal + troop.dir < 0 || troop.goal + troop.dir >= K) troop.dir = -troop.dir as 1 | -1;
          troop.goal += troop.dir;
        }
        for (const m of troop.members) {
          const d = Math.hypot(m.x - avatar.x, m.z - avatar.z);
          if (m.state === "sit") {
            const p = troop.perches[m.perch]!;
            m.x = p.x;
            m.y = p.y;
            m.z = p.z;
            m.timer -= dt;
            // By day the troop roams; at dusk the stragglers still make their way to the troop's tree to sleep.
            if (m.timer <= 0 && !inside && (awake || p.tree !== troop.goal)) {
              // Next hop: toward the goal tree (a neighbouring tree first), or a little shuffle in this one.
              const towardGoal = p.tree !== troop.goal;
              let best = -1;
              let bs = Number.POSITIVE_INFINITY;
              for (const j of p.near) {
                if (occupied.has(`${ti}:${j}`)) continue;
                const q = troop.perches[j]!;
                const s = towardGoal
                  ? Math.abs(q.tree - troop.goal) * 10 + R() * 4
                  : (q.tree === p.tree ? 0 : 8) + R() * 6;
                if (s < bs) {
                  bs = s;
                  best = j;
                }
              }
              if (best >= 0 && (towardGoal || (awake && R() < 0.45))) {
                occupied.delete(`${ti}:${m.perch}`);
                occupied.add(`${ti}:${best}`);
                m.from = m.perch;
                m.perch = best;
                m.state = "leap";
                m.u = 0;
                const q = troop.perches[best]!;
                const dist = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
                m.dur = (0.35 + dist / 5.5) / mot;
                m.yaw = Math.atan2(q.x - p.x, q.z - p.z);
              }
              m.timer = towardGoal ? 0.4 + R() * 1.2 : 1.5 + R() * 4;
            }
          } else {
            m.u += dt / m.dur;
            const a = troop.perches[m.from]!;
            const b = troop.perches[m.perch]!;
            const dist = Math.hypot(b.x - a.x, b.z - a.z);
            leapPoint(a, b, 0.35 + dist * 0.12, m.u, p3);
            const vy = p3.y - m.y;
            m.pitch = damp(m.pitch, -Math.atan2(vy / Math.max(dt, 1e-3), dist / m.dur) * 0.7, 12, dt);
            m.x = p3.x;
            m.y = p3.y;
            m.z = p3.z;
            if (m.u >= 1) {
              m.state = "sit";
              m.timer = 0.3 + R() * 1.5;
            }
          }
          // Head: quick jerky looks; at the traveler when close; tucked down asleep.
          m.lookT -= dt;
          if (m.lookT <= 0) {
            m.lookT = 0.4 + R() * 1.4;
            m.look = (R() - 0.5) * 2;
          }
          let hy = m.look;
          let hp = (R() - 0.5) * 0.2;
          if (!awake) {
            hy = 0;
            hp = 0.9;
          } else if (d < 14 && m.state === "sit") {
            hy = Math.max(-1.3, Math.min(1.3, wrapAngle(Math.atan2(avatar.x - m.x, avatar.z - m.z) - m.yaw)));
            hp = -0.3;
            if (Math.abs(wrapAngle(Math.atan2(avatar.x - m.x, avatar.z - m.z) - m.yaw)) > 1.2)
              m.yaw = turnToward(m.yaw, Math.atan2(avatar.x - m.x, avatar.z - m.z), 1.5 * dt);
          }
          m.headYaw = damp(m.headYaw, hy, rm ? 4 : 14, dt);
          m.headPitch = damp(m.headPitch, hp, rm ? 4 : 12, dt);
          const leaping = m.state === "leap";
          m.stretch = damp(m.stretch, leaping ? 1 : 0, 14, dt);
          if (!leaping) m.pitch = damp(m.pitch, 0, 8, dt);
          m.phase = (m.phase + dt * (leaping ? 2.5 : 0)) % 1;
          const k = m.stretch;
          // Sitting up (body raised, legs folded under, tail hanging) ↔ stretched leap (arms forward).
          // (Sitting, the body leans back 0.95 rad: the arms swing +0.75 to hang down to the branch and the
          // head pitches forward to look level.)
          const bodyPitch = -0.95 * (1 - k) + m.pitch * k;
          const front = 0.75 * (1 - k) - 1.25 * k;
          const hind = -0.25 * (1 - k) + 1.1 * k;
          const tailP = -1.3 * (1 - k) + 0.25 * k;
          const tailY = Math.sin(clock * 0.9 + m.phase * 9) * 0.35 * mot * (1 - k);
          m.body.x = m.x;
          m.body.z = m.z;
          if (spot.view.dist(m.x, m.y, m.z) > FAUNA_FAR) continue;
          rootMatrix(m4, m.x, m.y, m.z, m.yaw, bodyPitch, 0, SCALE);
          set.set(n, m4, m.phase, 0, m.headYaw, m.headPitch + 0.85 * (1 - k), tailY, tailP, front, hind);
          n++;
          spot.see(m.x, m.y + 0.3, m.z, avatar.x, avatar.z, 0.5);
        }
      }
      set.commit(inside ? 0 : n);

      if (howler && hset) {
        // Roars around dawn and dusk: head thrown back, the body bobbing with each bellow.
        const roar = howlerHour(time);
        const bellow = roar ? Math.max(0, Math.sin(clock * 1.6)) : 0;
        howler.lookT -= dt;
        if (howler.lookT <= 0) {
          howler.lookT = 2 + R() * 4;
          howler.look = (R() - 0.5) * 1.6;
        }
        const d = Math.hypot(howler.x - avatar.x, howler.z - avatar.z);
        const hy = d < 18 ? wrapAngle(Math.atan2(avatar.x - howler.x, avatar.z - howler.z) - howler.yaw) : howler.look;
        howler.headYaw = damp(howler.headYaw, Math.max(-1.2, Math.min(1.2, hy)) * (1 - bellow), 2, dt);
        howler.headPitch = damp(howler.headPitch, roar ? -0.7 * bellow : 0.1, 5, dt);
        rootMatrix(m4, howler.x, howler.y + bellow * 0.03, howler.z, howler.yaw, -0.9, 0, 1.3);
        hset.set(0, m4, 0, 0, howler.headYaw, howler.headPitch + 0.8, 0.3, -1.4, 0.7, -0.2);
        hset.commit(inside ? 0 : 1);
        spot.see(howler.x, howler.y, howler.z, avatar.x, avatar.z, 0.8);
      }
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const t of troops) for (const m of t.members) creatures.remove(m.body);
      if (howler) creatures.remove(howler.body);
      set.dispose();
      hset?.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
