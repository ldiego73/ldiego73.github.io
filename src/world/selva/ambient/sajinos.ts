/**
 * Sajinos (collared peccaries, Pecari tajacu): a small herd that crosses the road ahead of the traveler.
 * Every so often (the first time after ~20 s of walking the road, then every minute or so; less often once
 * the passport has the stamp) a herd trots out of the undergrowth ≈ 25–35 u ahead, on a quiet stretch away
 * from the stations and the canopy walkway, and crosses in single file: the leader picks the way, the others
 * walk exactly in its tracks one body length apart (wild/crossing.ts Trail). They snuffle as they go, heads
 * low and nodding, and now and then the leader stops to root at the verge and the file bunches up behind it.
 * On the far side they melt into the forest. By day and in the twilight; not in deep night.
 * Running at them (within ≈ 16 u) or walking right up (≈ 6 u) breaks the file: every peccary bolts at a
 * gallop for the nearest side of the road and is gone. With reduced motion they trot slower, never stop to
 * root, and scatter at a canter instead of a gallop.
 *
 * Rendering: the shared animal core (species "sajino", wild/beasts.ts): one instanced herd, its gaits from
 * the speed (walk, trot, a gallop when they bolt), this year's young drawn smaller; a stop to root plays
 * "graze". 1 draw per LOD in use while a herd is out, 0 otherwise.
 * Bodies ("sajino"): solid while out (give 0.5), parked while away.
 * Stamp `selva:fauna:sajino` after a ~1.5 s good look within 30 u while one is on the road.
 */
import { loadPassport } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, park } from "../../creatures";
import { on } from "../../events";
import { CANOPY_T, SELVA_STATIONS } from "../contract";
import { createBeasts } from "./wild/beasts";
import { type Crossing, crossingPlan, RoadTracker, SpeedMeter, Trail } from "./wild/crossing";
import { devHook, FAUNA_FAR, faunaDt, idle, Spotter, selvaOf } from "./wild/kit";
import { damp, dayAmount, rng, turnToward, wrapAngle } from "./wild/logic";

type HerdState = "away" | "file" | "bolt";

interface Pig {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  /** Set once it has stopped to root (the "graze" idle plays once per stop). */
  rooted: boolean;
  scale: number;
  headYaw: number;
  /** Bolt target (the nearest forest edge) and whether it is gone from view. */
  tx: number;
  tz: number;
  gone: boolean;
  body: Body;
}

const STATION_T = SELVA_STATIONS.map((s) => s.t);
/** Distance between peccaries in the file (body length ≈ 0.95 + a little gap). */
const GAP = 1.15;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(8807);
  const n = high ? 7 : 4;
  const set = createBeasts(env, "sajino", n);
  const root = set.group;
  env.scene.add(root);

  const pigs: Pig[] = [];
  for (let i = 0; i < n; i++) {
    const body = creatures.add("sajino", 0.32, { solid: false, give: 0.5 });
    park(body);
    pigs.push({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      rooted: false,
      // The last ones are this year's young, smaller.
      scale: i >= n - (high ? 2 : 1) ? 0.78 + R() * 0.06 : 1.05 + R() * 0.1,
      headYaw: 0,
      tx: 0,
      tz: 0,
      gone: false,
      body,
    });
  }

  const stamped = (() => {
    try {
      return !!loadPassport().stamps["selva:fauna:sajino"];
    } catch {
      return false;
    }
  })();
  let stampedNow = stamped;
  const offStamp = on("world:stamp", (d) => {
    if (d?.id === "selva:fauna:sajino") stampedNow = true;
  });
  let inside = false;
  let riding = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
  });

  const spot = new Spotter(env, "sajino", 30);
  const meter = new SpeedMeter();
  const road = new RoadTracker();
  const trail = new Trail(0.2, GAP * n + 6);
  const want = { x: 0, z: 0 };
  const at = { x: 0, z: 0, yaw: 0 };
  let state: HerdState = "away";
  let plan: Crossing | null = null;
  /** Leader waypoint: 0 heading to the road middle, 1 to the far side. */
  let leg = 0;
  let pause = 0;
  let pauses = 0;
  let squeeze = 1;
  let outFor = 0;
  let cool = 18 + R() * 10;
  let clock = 0;

  const offDev = devHook("sajinos", () => ({
    state,
    cool: +cool.toFixed(1),
    plan: plan && { t: +plan.t.toFixed(3), ax: plan.ax, az: plan.az, bx: plan.bx, bz: plan.bz },
    pigs: pigs.map((p) => [+p.x.toFixed(1), +p.z.toFixed(1)]),
  }));
  const offDevSoon = devHook("sajinosSoon", () => {
    cool = 0;
    road.refresh();
    return true;
  });

  const goAway = () => {
    state = "away";
    plan = null;
    for (const p of pigs) park(p.body);
    cool = (stampedNow ? 80 : 40) + R() * (stampedNow ? 60 : 25);
  };

  const start = () => {
    plan = crossingPlan(
      L,
      {
        t: road.t,
        dir: road.dir,
        ahead: [25, 35],
        off: 15,
        stations: STATION_T,
        canopy: CANOPY_T,
        blocked: (x, z) => creatures.inKeepOut(x, z, 2),
      },
      R,
    );
    if (!plan) return false;
    const yaw = Math.atan2(plan.mx - plan.ax, plan.mz - plan.az);
    trail.reset(plan.ax, plan.az, yaw);
    pigs.forEach((p, i) => {
      trail.at(plan!.ax, plan!.az, i * GAP, at);
      p.x = at.x;
      p.z = at.z;
      p.yaw = yaw;
      p.y = env.selva.groundAt(p.x, p.z);
      p.gone = false;
      p.body.solid = true;
    });
    leg = 0;
    pause = 0;
    pauses = rm ? 0 : R() < 0.75 ? 1 + (R() < 0.4 ? 1 : 0) : 0;
    squeeze = 1;
    outFor = 0;
    state = "file";
    return true;
  };

  const bolt = (ax: number, az: number) => {
    if (!plan) return;
    state = "bolt";
    // Each one for the nearer forest edge, skewed away from the traveler.
    for (const p of pigs) {
      const da = Math.hypot(p.x - plan.ax, p.z - plan.az);
      const db = Math.hypot(p.x - plan.bx, p.z - plan.bz);
      const toA = da + (Math.hypot(plan.ax - ax, plan.az - az) < 10 ? 12 : 0);
      const toB = db + (Math.hypot(plan.bx - ax, plan.bz - az) < 10 ? 12 : 0);
      const ex = toA < toB ? plan.ax : plan.bx;
      const ez = toA < toB ? plan.az : plan.bz;
      p.tx = ex + (R() - 0.5) * 6;
      p.tz = ez + (R() - 0.5) * 6;
    }
  };

  return {
    update(dt, avatar) {
      dt = faunaDt(dt);
      clock += dt;
      meter.update(avatar.x, avatar.z, dt);
      road.update(L.trail.nearestT, avatar.x, avatar.z, dt);
      const time = env.sky.time();
      const awake = dayAmount(time) > 0.3;
      const onRoad = L.trailQuery(avatar.x, avatar.z).d < 6;
      spot.begin();

      if (state === "away") {
        if (awake && onRoad && !inside && !riding && meter.speed > 0.5) cool -= dt;
        if (cool <= 0 && !start()) cool = 3;
      } else if (inside || riding) {
        goAway();
      }

      if (state !== "away" && plan) {
        outFor += dt;
        const lead = pigs[0] as Pig;
        const dLead = Math.min(...pigs.map((p) => Math.hypot(p.x - avatar.x, p.z - avatar.z)));
        if (state === "file" && (dLead < 6 || (meter.running && dLead < 16) || !awake)) bolt(avatar.x, avatar.z);

        if (state === "file") {
          // ---- leader: to the road middle, then across; a stop or two to root at the verge.
          const tx = leg === 0 ? plan.mx : plan.bx;
          const tz = leg === 0 ? plan.mz : plan.bz;
          const dist = Math.hypot(tx - lead.x, tz - lead.z);
          if (leg === 0 && dist < 1.5) leg = 1;
          let speed = (rm ? 1.1 : 1.6) * (1 + Math.sin(clock * 0.9) * 0.1);
          const edge = L.trailQuery(lead.x, lead.z).d;
          if (pause > 0) {
            pause -= dt;
            speed = 0;
          } else if (pauses > 0 && edge > L.trail.halfWidth + 0.5 && edge < L.trail.halfWidth + 3 && R() < dt * 0.8) {
            pause = 1.2 + R() * 1.6;
            pauses--;
          }
          squeeze = damp(squeeze, pause > 0 ? 0.72 : 1, 1.5, dt);
          if (speed > 0) {
            const wob = Math.sin(clock * 0.7 + 1.3) * 0.35;
            lead.yaw = turnToward(lead.yaw, Math.atan2(tx - lead.x, tz - lead.z) + wob * 0.4, 2.2 * dt);
            const step = speed * dt;
            lead.x += Math.sin(lead.yaw) * step;
            lead.z += Math.cos(lead.yaw) * step;
          }
          lead.speed = damp(lead.speed, speed, 5, dt);
          trail.push(lead.x, lead.z);
          // ---- followers: in the leader's tracks, one gap apart (closer while it roots).
          for (let i = 1; i < pigs.length; i++) {
            const p = pigs[i] as Pig;
            trail.at(lead.x, lead.z, i * GAP * squeeze, at);
            const moved = Math.hypot(at.x - p.x, at.z - p.z);
            p.speed = damp(p.speed, dt > 0 ? moved / dt : 0, 5, dt);
            p.x = at.x;
            p.z = at.z;
            p.yaw = turnToward(p.yaw, at.yaw, 4 * dt);
          }
          // Gone once the last one is deep in the forest on the far side.
          const last = pigs[pigs.length - 1] as Pig;
          if (leg === 1 && L.trailQuery(last.x, last.z).d > 12 && Math.hypot(plan.bx - lead.x, plan.bz - lead.z) < 2)
            goAway();
          else if (outFor > 90) goAway();
        } else if (state === "bolt") {
          let gone = 0;
          for (const p of pigs) {
            if (p.gone) {
              gone++;
              continue;
            }
            const sp = rm ? 3.2 : 5.5;
            const dx = p.tx - p.x;
            const dz = p.tz - p.z;
            const l = Math.hypot(dx, dz) || 1;
            creatures.steer(p.body, (dx / l) * sp, (dz / l) * sp, 0.6, want);
            const s = Math.hypot(want.x, want.z);
            if (s > 1e-3) p.yaw = turnToward(p.yaw, Math.atan2(want.x, want.z), 6 * dt);
            const step = Math.min(l, s * dt);
            p.x += Math.sin(p.yaw) * step;
            p.z += Math.cos(p.yaw) * step;
            p.speed = damp(p.speed, s, 6, dt);
            if (l < 1.5 || (L.trailQuery(p.x, p.z).d > 11 && !spot.view.sees(p.x, p.y + 0.4, p.z, 0.8))) {
              p.gone = true;
              park(p.body);
            }
          }
          if (gone >= pigs.length || outFor > 60) goAway();
        }
      }

      // ---- pose and draw
      set.begin();
      if (state !== "away") {
        for (let i = 0; i < pigs.length; i++) {
          const p = pigs[i] as Pig;
          if (p.gone) continue;
          p.y = damp(p.y, env.selva.groundAt(p.x, p.z), 12, dt);
          p.body.x = p.x;
          p.body.z = p.z;
          if (state === "bolt" && creatures.resolve(p.body, (x, z) => !L.isWater(x, z), 0.08)) {
            p.x = p.body.x;
            p.z = p.body.z;
          }
          const d = Math.hypot(p.x - avatar.x, p.z - avatar.z);
          // A glance at a traveler within 14 u while filing across; rooting at the verge while stopped.
          let yawT = 0;
          if (state === "file" && d < 14)
            yawT = Math.max(-0.9, Math.min(0.9, wrapAngle(Math.atan2(avatar.x - p.x, avatar.z - p.z) - p.yaw)));
          p.headYaw = damp(p.headYaw, yawT, 3, dt);
          const still = p.speed < 0.2;
          if (still && state === "file" && !rm && !p.rooted) {
            set.play(i, "graze", 1.2 + R() * 0.8);
            p.rooted = true;
          } else if (!still) p.rooted = false;
          if (inside || spot.view.dist(p.x, p.y, p.z) > FAUNA_FAR) continue;
          set.put(
            i,
            p.x,
            p.y,
            p.z,
            p.yaw,
            {
              speed: p.speed,
              rm,
              look: state === "file" && d < 14 ? p.headYaw : undefined,
            },
            { scale: p.scale },
          );
          if (L.trailQuery(p.x, p.z).d < 5) spot.see(p.x, p.y + 0.4, p.z, avatar.x, avatar.z, 0.7);
        }
      }
      set.end(dt, clock, env.camera);
      spot.end(dt);
    },
    dispose() {
      offStamp();
      offInterior();
      offMount();
      offDev();
      offDevSoon();
      for (const p of pigs) creatures.remove(p.body);
      set.dispose();
      root.removeFromParent();
    },
  };
};
