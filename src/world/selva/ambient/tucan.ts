/**
 * Tucanes (white-throated toucans, Ramphastos tucanus cuvieri) in fruiting trees beside the road: a pair or
 * three in a small stand of fruit trees past the maloca, and (high quality) another group between the
 * palafitos and the arcade. By day they hop along the limbs in short sideways bounds, reach for a fruit with
 * the huge bill and toss it back with a flick of the head, and cock their heads to look at the traveler.
 * Now and then one makes a short flight to the next tree: a few quick wingbeats and a glide, dipping and
 * rising. A traveler right under the tree (≈ 5 u, ≈ 8 u running) sends them to another tree of the stand.
 * At night they roost still, head turned back over the shoulder.
 *
 * The fruit trees come with this module (wild/trees.ts broadTree with fruit clusters; one merged static mesh
 * per stand, drawn only near the camera). Rendering: stand + one bird-rig InstancedMesh → ≤ 2 draw calls.
 * Bodies ("tucan"): listed for queries, never solid (up in the trees).
 * Stamp `selva:fauna:tucan` after a ~1.5 s good look within 15 u.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { FOLDED, toucanModel, WingSet } from "./wild/birds";
import { devHook, FAUNA_FAR, idle, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { clamp01, damp, diurnal, leapPoint, rng, TAU, treeSites, turnToward, wrapAngle } from "./wild/logic";
import { broadTree, type HostTree, limbPoint } from "./wild/trees";

interface Perch {
  tree: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Stand {
  trees: HostTree[];
  perches: Perch[];
}

interface Toucan {
  stand: Stand;
  perch: number;
  from: number;
  state: "perch" | "hop" | "fly";
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
  pluck: number;
  wing: number;
  fold: number;
  flap: number;
  body: Body;
}

/** A touch larger than life (≈ 0.75 u) so the bill and the white bib read up in the tree. */
const SCALE = 1.5;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(8861);
  const stands: Stand[] = [];
  /** One mesh per stand of fruit trees, drawn only near the camera. */
  const props = new SiteProps(env, "selva-fauna-tucan-trees");
  const birds: Toucan[] = [];
  const taken = new Set<Perch>();

  const clearOfTrunks = (x: number, z: number) =>
    !L.colliders.some((c) => c.kind === "circle" && Math.hypot(c.x - x, c.z - z) < c.r + 1.5);

  const plant = (t0: number, t1: number, side: -1 | 1, n: number) => {
    const sites = treeSites(L, { t0, t1, n: 5, lat0: 7, lat1: 9.5, side, gap: 6, seed: Math.round(t0 * 1231) })
      .filter((s) => clearOfTrunks(s.x, s.z))
      .slice(0, 3);
    if (sites.length < 2) return;
    const builder = new GeoBuilder();
    const trees = sites.map((s) => {
      const p = L.trail.pointAt(s.t);
      const toward = Math.atan2(p.x - s.x, p.z - s.z);
      return broadTree(builder, s.x, s.y, s.z, 6.5 + R() * 1.5, R, {
        nLimbs: 4,
        fruit: "#e8772a",
        spread: 0.9,
        toward,
      });
    });
    props.add(builder.build(), high);
    const perches: Perch[] = [];
    trees.forEach((tr, ti) => {
      for (const l of tr.limbs)
        for (const u of [0.45, 0.7, 0.92]) {
          const p = { x: 0, y: 0, z: 0 };
          limbPoint(l, u, p, 1);
          perches.push({ tree: ti, ...p, yaw: Math.atan2(l.bx - l.ax, l.bz - l.az) });
        }
    });
    const stand: Stand = { trees, perches };
    stands.push(stand);
    for (let i = 0; i < n; i++) {
      const pi = Math.floor(R() * perches.length);
      const p = perches[pi]!;
      taken.add(p);
      birds.push({
        stand,
        perch: pi,
        from: pi,
        state: "perch",
        u: 0,
        dur: 1,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw + Math.PI / 2,
        pitch: 0,
        timer: 1 + R() * 4,
        headYaw: 0,
        headPitch: 0,
        pluck: 0,
        wing: FOLDED,
        fold: 1,
        flap: R() * TAU,
        body: creatures.add("tucan", 0.25, { solid: false, x: p.x, z: p.z }),
      });
    }
  };
  plant(0.335, 0.385, -1, high ? 3 : 2);
  if (high) plant(0.675, 0.72, 1, 3);

  const set = new WingSet(env, "selva-fauna-tucan-body", toucanModel(), birds.length);
  const root = new THREE.Group();
  root.name = "selva-fauna-tucan";
  root.add(set.mesh);
  root.add(props.group);
  env.scene.add(root);

  const spot = new Spotter(env, "tucan", 15);
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offDev = devHook("tucan", () => birds.map((b) => [b.state, +b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)]));
  let lastAx = Number.NaN;
  let lastAz = 0;
  let avSpeed = 0;
  let clock = 0;
  const p3 = { x: 0, y: 0, z: 0 };

  /** A free perch in the stand: on the same tree (hop) or another tree (flight). */
  const pickPerch = (b: Toucan, otherTree: boolean, away?: { x: number; z: number }) => {
    const ps = b.stand.perches;
    const cur = ps[b.perch]!;
    let best = -1;
    let bs = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 24; k++) {
      const j = Math.floor(R() * ps.length);
      const q = ps[j]!;
      if (taken.has(q) || (q.tree !== cur.tree) !== otherTree) continue;
      const dist = Math.hypot(q.x - cur.x, q.y - cur.y, q.z - cur.z);
      if (!otherTree && dist > 2.4) continue;
      const s = dist - (away ? Math.hypot(q.x - away.x, q.z - away.z) * 2 : 0);
      if (s < bs) {
        bs = s;
        best = j;
      }
    }
    return best;
  };
  const move = (b: Toucan, to: number, fly: boolean) => {
    const ps = b.stand.perches;
    taken.delete(ps[b.perch]!);
    taken.add(ps[to]!);
    b.from = b.perch;
    b.perch = to;
    b.u = 0;
    const a = ps[b.from]!;
    const q = ps[to]!;
    const dist = Math.hypot(q.x - a.x, q.y - a.y, q.z - a.z);
    b.state = fly ? "fly" : "hop";
    b.dur = fly ? 0.8 + dist / 6 : 0.32;
    if (fly) b.yaw = Math.atan2(q.x - a.x, q.z - a.z);
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const awake = diurnal(env.sky.time()) > 0.3;
      if (!Number.isNaN(lastAx) && dt > 0)
        avSpeed = damp(avSpeed, Math.hypot(avatar.x - lastAx, avatar.z - lastAz) / dt, 6, dt);
      lastAx = avatar.x;
      lastAz = avatar.z;
      const fleeR = avSpeed > 5.5 ? 8 : 5;
      const mot = rm ? 0.6 : 1;
      spot.begin();
      props.update(spot.view.cam);
      let n = 0;
      for (const b of birds) {
        const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
        const ps = b.stand.perches;
        let wingT = FOLDED;
        let foldT = 1;
        let hy = 0;
        let hp = 0;
        if (b.state === "perch") {
          const p = ps[b.perch]!;
          b.x = p.x;
          b.y = p.y;
          b.z = p.z;
          b.pitch = damp(b.pitch, 0, 8, dt);
          b.timer -= dt;
          if (awake && !inside && d < fleeR) {
            const j = pickPerch(b, true, avatar);
            if (j >= 0) move(b, j, true);
          } else if (awake && b.timer <= 0) {
            const r = R();
            b.timer = 1.2 + R() * 3.5;
            if (r < 0.3)
              b.pluck = 1; // reach for a fruit, toss it back
            else if (r < 0.75) {
              const j = pickPerch(b, false);
              if (j >= 0) move(b, j, false);
            } else if (r < 0.88) {
              const j = pickPerch(b, true);
              if (j >= 0) move(b, j, true);
            } else b.yaw += (R() - 0.5) * 2.4;
          }
          if (!awake) {
            hy = 2.5; // asleep: head turned back over the shoulder
            hp = 0.2;
          } else if (b.pluck > 0) {
            b.pluck = Math.max(0, b.pluck - dt / 1.1);
            const k = 1 - b.pluck;
            hp = k < 0.45 ? 0.9 * (k / 0.45) : k < 0.7 ? -0.7 : -0.7 * (1 - (k - 0.7) / 0.3);
            hy = 0.4;
          } else if (d < 16) {
            // Cocked head, one eye on the traveler.
            hy = Math.max(-1.4, Math.min(1.4, wrapAngle(Math.atan2(avatar.x - b.x, avatar.z - b.z) - b.yaw)));
            hp = -0.15 + Math.sin(clock * 0.8 + b.flap) * 0.15;
          } else {
            hy = Math.sin(clock * 0.5 + b.flap * 3) * 0.9;
            hp = Math.sin(clock * 0.7 + b.flap) * 0.2;
          }
        } else {
          b.u += dt / (b.dur / mot);
          const a = ps[b.from]!;
          const q = ps[b.perch]!;
          const u = clamp01(b.u);
          if (b.state === "hop") {
            leapPoint(a, q, 0.25, u, p3);
            b.x = p3.x;
            b.y = p3.y;
            b.z = p3.z;
            wingT = 0.9;
            foldT = 0.6;
          } else {
            // Undulating flight: bursts of wingbeats, short glides, the path dipping and rising.
            const dist = Math.hypot(q.x - a.x, q.z - a.z);
            leapPoint(a, q, 0.6 + dist * 0.05, u, p3);
            const dip = Math.sin(u * Math.PI * Math.max(2, Math.round(dist / 4))) * 0.25;
            b.x = p3.x;
            b.y = p3.y + dip;
            b.z = p3.z;
            b.yaw = turnToward(b.yaw, Math.atan2(q.x - a.x, q.z - a.z), 6 * dt);
            b.pitch = damp(b.pitch, 0.4, 8, dt);
            const burst = Math.sin(u * Math.PI * 6) > -0.2;
            b.flap += dt * 16 * mot;
            wingT = burst && !rm ? Math.sin(b.flap) * 0.85 + 0.1 : 0.15;
            foldT = u > 0.85 ? 0.5 : 0;
          }
          if (b.u >= 1) {
            b.state = "perch";
            b.timer = 0.8 + R() * 2.5;
            b.yaw = q.yaw + (R() < 0.5 ? 1 : -1) * Math.PI * 0.5;
          }
        }
        b.headYaw = damp(b.headYaw, hy, rm ? 4 : 10, dt);
        b.headPitch = damp(b.headPitch, hp, rm ? 4 : 10, dt);
        b.wing = b.state === "fly" ? wingT : damp(b.wing, wingT, 12, dt);
        b.fold = damp(b.fold, foldT, 10, dt);
        b.body.x = b.x;
        b.body.z = b.z;
        if (spot.view.dist(b.x, b.y, b.z) > FAUNA_FAR) continue;
        set.set(n, b.x, b.y, b.z, b.yaw, b.pitch, 0, SCALE, b.wing, b.headYaw, b.headPitch, b.fold);
        n++;
        spot.see(b.x, b.y + 0.2, b.z, avatar.x, avatar.z, 0.5);
      }
      set.commit(inside ? 0 : n);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const b of birds) creatures.remove(b.body);
      set.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
