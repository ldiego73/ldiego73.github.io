/**
 * Shanshos (hoatzins, Opisthocomus hoazin) in the riverside thickets that lean out over the water on the
 * road-side bank: one just downstream of the embarcadero's pier, one along the canoe route and, on high
 * quality, two more (another on the canoe route and one upstream of the regatón).
 * A small group sits in each thicket by day: they turn their crested heads, preen, and sun themselves with
 * the wings held half open. Every few seconds one changes branch in a short, heavy, clumsy flutter (hoatzins
 * are poor fliers). When the traveler comes close (≈ 10 u, ≈ 14 u running or paddling) the whole group gets
 * agitated: necks stretched, crests up, they flap up to the branches farthest from the traveler and stay
 * there, restless, until the traveler has gone. At night they roost still, heads sunk into the shoulders.
 * With reduced motion they change branch less often and flap slower.
 *
 * Rendering: one bird-rig InstancedMesh (wild/birds.ts WingSet) and the thickets merged per cluster (the ones
 * by the embarcadero and the canoe route are one mesh), shown only within 110 u of the camera (wild/kit.ts
 * SiteProps) → 2 draw calls (plus their ink and shadow passes) near the thickets, none elsewhere.
 * Bodies: none (they stay in the branches over the water).
 * Stamp `selva:fauna:shansho` after a ~1.5 s good look within 28 u (from the pier or the canoe).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { on } from "../../events";
import { inStationFootprint, stationFootprints } from "./embarcadero/footprints";
import { FOLDED, WingSet } from "./wild/birds";
import { mergeNear } from "./wild/critters";
import { SpeedMeter } from "./wild/crossing";
import { devHook, FAUNA_FAR, faunaDt, idle, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { clamp01, damp, diurnal, leapPoint, rng, roadFrame, TAU, turnToward, wrapAngle } from "./wild/logic";
import { hoatzinModel, type Perch, thicketGeometry } from "./wild/riverbirds";

type State = "perch" | "fly";

interface Thicket {
  perches: Perch[];
  /** Occupied perch indices. */
  taken: Set<number>;
  x: number;
  z: number;
  alarm: boolean;
  calm: number;
}

interface Bird {
  th: Thicket;
  perch: number;
  state: State;
  x: number;
  y: number;
  z: number;
  yaw: number;
  timer: number;
  /** Flight from a to b over u 0..1 (duration dur). */
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
  u: number;
  dur: number;
  flap: number;
  wing: number;
  fold: number;
  headYaw: number;
  headPitch: number;
  /** 0..1 sunning (wings held half open). */
  sun: number;
  look: number;
  /** Seconds left of a preening bout (head turned back into the wing). */
  preen: number;
}

/** Road t of the thickets (the first two on every quality). */
const SITES = [0.432, 0.54, 0.475, 0.11];
/** Hoatzins are ≈ 0.65 m; drawn larger so they read in the leaves from the pier and the canoe. */
const SCALE = 1.4;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(7717);
  const prints = stationFootprints(L);

  const thickets: Thicket[] = [];
  // Thickets within 60 u of each other share one merged mesh, shown within 110 u of the camera.
  const props = new SiteProps(env, "selva-fauna-shansho-thickets", 110);
  const geos: THREE.BufferGeometry[] = [];
  for (const t of high ? SITES : SITES.slice(0, 2)) {
    const f = roadFrame(L, t);
    let shore = -1;
    for (let lat = 6; lat < 60; lat += 0.25) {
      if (L.heightAt(f.x + f.rx * lat, f.z + f.rz * lat) < lv) {
        shore = lat;
        break;
      }
    }
    if (shore < 0) continue;
    const x = f.x + f.rx * (shore - 0.6);
    const z = f.z + f.rz * (shore - 0.6);
    if (inStationFootprint(prints, x, z, 4)) continue;
    const { geo, perches } = thicketGeometry(x, L.heightAt(x, z) - 0.1, z, Math.atan2(f.rx, f.rz), 6, R);
    geos.push(geo);
    thickets.push({ perches, taken: new Set(), x, z, alarm: false, calm: 0 });
  }

  for (const g of mergeNear(geos, 60)) props.add(g, high);

  const birds: Bird[] = [];
  for (const th of thickets) {
    const n = Math.min(th.perches.length - 2, high ? 5 : 3);
    for (let i = 0; i < n; i++) {
      let p = Math.floor(R() * th.perches.length);
      while (th.taken.has(p)) p = (p + 1) % th.perches.length;
      th.taken.add(p);
      const q = th.perches[p] as Perch;
      birds.push({
        th,
        perch: p,
        state: "perch",
        x: q.x,
        y: q.y,
        z: q.z,
        yaw: q.yaw + (R() - 0.5) * 2,
        timer: 2 + R() * 8,
        a: { x: 0, y: 0, z: 0 },
        b: { x: 0, y: 0, z: 0 },
        u: 0,
        dur: 1,
        flap: R() * TAU,
        wing: FOLDED,
        fold: 1,
        headYaw: 0,
        headPitch: 0,
        sun: 0,
        look: 0,
        preen: 0,
      });
    }
  }

  const set = new WingSet(env, "selva-fauna-shansho", hoatzinModel(), birds.length);
  const root = new THREE.Group();
  root.name = "selva-fauna-shansho";
  root.add(props.group, set.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "shansho", 28);
  const meter = new SpeedMeter();
  let inside = false;
  let paddling = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    paddling = !!d?.riding && d.vehicle === "canoe";
  });
  const offDev = devHook("shansho", () =>
    thickets.map((th) => ({
      x: +th.x.toFixed(1),
      z: +th.z.toFixed(1),
      alarm: th.alarm,
      birds: birds.filter((b) => b.th === th).map((b) => b.state),
    })),
  );
  let clock = 0;

  /** Moves a bird to another free perch of its thicket (farthest from the traveler when alarmed). */
  const hop = (b: Bird, ax: number, az: number) => {
    const th = b.th;
    let best = -1;
    let score = Number.NEGATIVE_INFINITY;
    th.perches.forEach((p, i) => {
      if (th.taken.has(i)) return;
      const s = th.alarm ? Math.hypot(p.x - ax, p.z - az) + p.y * 2 : R() - Math.hypot(p.x - b.x, p.z - b.z) * 0.15;
      if (s > score) {
        score = s;
        best = i;
      }
    });
    if (best < 0 || best === b.perch) return;
    const q = th.perches[best] as Perch;
    th.taken.delete(b.perch);
    th.taken.add(best);
    b.perch = best;
    Object.assign(b.a, { x: b.x, y: b.y, z: b.z });
    Object.assign(b.b, { x: q.x, y: q.y, z: q.z });
    b.u = 0;
    b.dur = (0.7 + Math.hypot(q.x - b.x, q.z - b.z) * 0.25) * (rm ? 1.4 : 1);
    b.state = "fly";
  };

  const tmp = { x: 0, y: 0, z: 0 };
  return {
    update(dt, avatar) {
      dt = faunaDt(dt);
      clock += dt;
      meter.update(avatar.x, avatar.z, dt);
      const time = env.sky.time();
      const awake = diurnal(time) > 0.4;
      props.update(spot.view.cam);
      spot.begin();
      const scareR = meter.running || paddling ? 14 : 10;

      for (const th of thickets) {
        const d = Math.hypot(th.x - avatar.x, th.z - avatar.z);
        if (!inside && d < scareR) {
          if (!th.alarm && awake) {
            th.alarm = true;
            // Not all at once: the nearest go first, a beat apart.
            for (const b of birds) if (b.th === th && b.state === "perch") b.timer = R() * (rm ? 1.2 : 0.6);
          }
          th.calm = 0;
        } else if (th.alarm) {
          th.calm = d > scareR + 6 ? th.calm + dt : 0;
          if (th.calm > 6) th.alarm = false;
        }
      }

      let k = 0;
      for (const b of birds) {
        const th = b.th;
        let wingT = FOLDED;
        let foldT = 1;
        let pitchT = 0;
        let lookT = b.look;
        let sunT = 0;
        if (b.state === "perch") {
          const q = th.perches[b.perch] as Perch;
          b.x = q.x;
          b.y = q.y;
          b.z = q.z;
          b.timer -= dt;
          if (!awake) {
            // Roosting: head sunk, still.
            pitchT = 0.55;
            lookT = 0;
          } else if (th.alarm) {
            // Agitated: necks stretched up, looking at the traveler; one more flutter away when its turn comes.
            pitchT = -0.4;
            lookT = wrapAngle(Math.atan2(avatar.x - b.x, avatar.z - b.z) - b.yaw);
            if (b.timer <= 0) {
              hop(b, avatar.x, avatar.z);
              b.timer = 4 + R() * 6;
            }
          } else {
            if (b.timer <= 0) {
              const r = R();
              if (r < (rm ? 0.2 : 0.35)) hop(b, avatar.x, avatar.z);
              else if (r < 0.55) b.look = (R() - 0.5) * 2.2;
              else if (r < 0.75) b.sun = b.sun > 0.5 ? 0 : 1;
              else b.preen = 1.5 + R() * 2;
              b.timer = 2.5 + R() * 5;
            }
            sunT = b.sun;
            const d = Math.hypot(b.x - avatar.x, b.z - avatar.z);
            if (b.preen > 0) {
              b.preen -= dt;
              pitchT = 0.9;
              lookT = 1.2 + Math.sin(clock * 3) * 0.3;
            } else if (d < 22) lookT = wrapAngle(Math.atan2(avatar.x - b.x, avatar.z - b.z) - b.yaw);
          }
          if (sunT > 0.5) {
            wingT = 0.25;
            foldT = 0.35;
          }
        }
        if (b.state === "fly") {
          b.u += dt / b.dur;
          const u = clamp01(b.u);
          leapPoint(b.a, b.b, 0.5, u, tmp);
          const vx = tmp.x - b.x;
          const vz = tmp.z - b.z;
          if (Math.hypot(vx, vz) > 1e-4) b.yaw = turnToward(b.yaw, Math.atan2(vx, vz), 8 * dt);
          b.x = tmp.x;
          b.y = tmp.y;
          b.z = tmp.z;
          // Heavy, fast, laboured beats with the tail fanned; a stall onto the branch at the end.
          b.flap += dt * (rm ? 9 : 15);
          wingT = Math.sin(b.flap) * 0.95 + 0.2;
          foldT = u > 0.85 ? 0.5 : 0;
          pitchT = -0.2;
          if (u >= 1) {
            b.state = "perch";
            b.sun = 0;
            b.look = 0;
            b.preen = 0;
          }
        }
        b.wing = b.state === "fly" ? wingT : damp(b.wing, wingT, 6, dt);
        b.fold = damp(b.fold, foldT, 8, dt);
        const lk = Math.max(-1.3, Math.min(1.3, lookT));
        b.headYaw = damp(b.headYaw, lk, 4, dt);
        b.headPitch = damp(b.headPitch, pitchT, 4, dt);
        if (spot.view.dist(b.x, b.y, b.z) > FAUNA_FAR) continue;
        const bodyPitch = b.state === "fly" ? -0.25 : 0.12;
        set.set(k++, b.x, b.y, b.z, b.yaw, bodyPitch, 0, SCALE, b.wing, b.headYaw, b.headPitch, b.fold);
        spot.see(b.x, b.y + 0.3, b.z, avatar.x, avatar.z, 0.6);
      }
      set.commit(inside ? 0 : k);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offMount();
      offDev();
      set.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
