/**
 * Añujes (agoutis, Dasyprocta): small rufous rodents that dart across the road by day. Around the
 * traveler (≈ 10–22 u ahead, on quiet stretches away from the stations and the canopy walkway) an agouti
 * bursts out of the undergrowth in a quick sprint, stops dead on the road or at its verge and sits up on its
 * haunches to look at the traveler, then dashes off, usually on across the road, sometimes back the way it
 * came. Some carry a nut in the mouth; one with a nut may sit and nibble it for a moment before going.
 * Walking up (≈ 5 u, 8 if running) sends it off at once, away from the traveler. Only by day; at dusk they
 * are gone. With reduced motion they run at half speed and hold the upright look longer (no sudden dashes).
 *
 * Rendering: one rig InstancedMesh (wild/rig.ts; the model's origin is under the hind feet so the upright
 * pose is a pitch of the root) and one tiny instanced nut → 2 draw calls while one is out, 0 otherwise.
 * Bodies: none (too small to block anyone).
 * Stamp `selva:fauna:anuje` after a ~1.5 s good look within 22 u while it is on the road.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { on } from "../../events";
import { paintStrength } from "../../style-gl";
import { CANOPY_T, SELVA_STATIONS } from "../contract";
import { AGOUTI_MOUTH, agoutiModel, nutGeometry } from "./wild/critters";
import { type Crossing, crossingPlan, RoadTracker, SpeedMeter } from "./wild/crossing";
import { devHook, FAUNA_FAR, faunaDt, idle, ramp, rootMatrix, Spotter, selvaOf } from "./wild/kit";
import { clamp01, damp, diurnal, rng, turnToward, wrapAngle } from "./wild/logic";
import { headPoint, RigSet } from "./wild/rig";

type State = "away" | "dash" | "look" | "nibble" | "leave";

interface Agouti {
  state: State;
  plan: Crossing | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Current target. */
  tx: number;
  tz: number;
  timer: number;
  speed: number;
  phase: number;
  /** 0 on all fours … 1 sitting up. */
  up: number;
  headYaw: number;
  headPitch: number;
  nut: boolean;
  cool: number;
  zig: number;
  walked: number;
}

const STATION_T = SELVA_STATIONS.map((s) => s.t);
/** Agoutis are ≈ 0.55 m; drawn a little larger so the sprint reads from the follow camera. */
const SCALE = 1.25;
const NUT_SCALE = new THREE.Vector3(1.5, 1.5, 1.5);

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(4421);
  const n = high ? 2 : 1;
  const model = agoutiModel();
  const set = new RigSet("selva-fauna-anuje-body", model.geo, model.spec, n, ramp(env), { shadow: high });
  // Carried in the mouth: no world-space painted blotches sliding over it.
  const nutMat = paintStrength(
    new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: ramp(env) }),
    0,
  );
  const nuts = new THREE.InstancedMesh(nutGeometry(), nutMat, n);
  nuts.name = "selva-fauna-anuje-nut";
  nuts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nuts.frustumCulled = false;
  nuts.count = 0;
  nuts.visible = false;
  const root = new THREE.Group();
  root.name = "selva-fauna-anuje";
  root.add(set.mesh, nuts);
  env.scene.add(root);

  const agoutis: Agouti[] = Array.from({ length: n }, (_, i) => ({
    state: "away" as State,
    plan: null,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    tx: 0,
    tz: 0,
    timer: 0,
    speed: 0,
    phase: R(),
    up: 0,
    headYaw: 0,
    headPitch: 0,
    nut: false,
    cool: 10 + i * 9 + R() * 8,
    zig: 0,
    walked: 0,
  }));

  let inside = false;
  let riding = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
  });
  const spot = new Spotter(env, "anuje", 22);
  const meter = new SpeedMeter();
  const road = new RoadTracker();
  const m4 = new THREE.Matrix4();
  const nutM = new THREE.Matrix4();
  const mouth = new THREE.Vector3();
  let clock = 0;

  const offDev = devHook("anuje", () =>
    agoutis.map((a) => ({ s: a.state, x: +a.x.toFixed(1), z: +a.z.toFixed(1), nut: a.nut, cool: +a.cool.toFixed(1) })),
  );
  const offDevSoon = devHook("anujeSoon", () => {
    for (const a of agoutis) if (a.state === "away") a.cool = 0;
    road.refresh();
    return true;
  });

  const goAway = (a: Agouti) => {
    a.state = "away";
    a.plan = null;
    a.cool = 12 + R() * 22;
  };

  /** Off the road at a sprint, to whichever end is farther from the traveler (or on across). */
  const leave = (a: Agouti, ax: number, az: number, onward: boolean) => {
    const p = a.plan;
    if (!p) return goAway(a);
    const da = Math.hypot(p.ax - ax, p.az - az);
    const db = Math.hypot(p.bx - ax, p.bz - az);
    const toB = onward ? db >= da * 0.6 : db > da;
    a.tx = toB ? p.bx : p.ax;
    a.tz = toB ? p.bz : p.az;
    a.state = "leave";
    a.walked = 0;
    a.zig = rm ? 0 : (R() - 0.5) * 1.2;
  };

  const start = (a: Agouti) => {
    const others = agoutis.filter((o) => o !== a && o.plan).map((o) => (o.plan as Crossing).t);
    const plan = crossingPlan(
      L,
      {
        t: road.t,
        dir: road.dir,
        ahead: [10, 22],
        off: 7,
        stations: STATION_T,
        canopy: CANOPY_T,
        blocked: (x, z) => others.some((t) => Math.abs(L.trail.nearestT(x, z) - t) * L.trail.length < 8),
      },
      R,
    );
    if (!plan) return false;
    a.plan = plan;
    a.x = plan.ax;
    a.z = plan.az;
    a.y = env.selva.groundAt(a.x, a.z);
    // The stop: somewhere across the road (most often) or right at the near verge.
    const ux = (plan.bx - plan.ax) / 14;
    const uz = (plan.bz - plan.az) / 14;
    const lat = R() < 0.7 ? (R() - 0.5) * L.trail.halfWidth * 1.4 : -(L.trail.halfWidth + 0.6);
    a.tx = plan.mx + ux * lat;
    a.tz = plan.mz + uz * lat;
    a.yaw = Math.atan2(a.tx - a.x, a.tz - a.z);
    a.state = "dash";
    a.nut = R() < 0.45;
    a.up = 0;
    a.speed = 0;
    a.walked = 0;
    a.zig = 0;
    return true;
  };

  return {
    update(dt, avatar) {
      dt = faunaDt(dt);
      clock += dt;
      meter.update(avatar.x, avatar.z, dt);
      road.update(L.trail.nearestT, avatar.x, avatar.z, dt);
      const time = env.sky.time();
      const awake = diurnal(time) > 0.5;
      const onRoad = L.trailQuery(avatar.x, avatar.z).d < 6;
      spot.begin();
      const run = rm ? 3.2 : 6.5;
      let k = 0;
      let kn = 0;
      for (const a of agoutis) {
        if (a.state === "away") {
          if (awake && onRoad && !inside && !riding) a.cool -= dt;
          if (a.cool <= 0 && !start(a)) a.cool = 2;
          if (a.state === "away") continue;
        }
        const d = Math.hypot(a.x - avatar.x, a.z - avatar.z);
        const scared = d < (meter.running ? 8 : 5);
        if ((inside || riding || !awake) && a.state !== "leave") leave(a, avatar.x, avatar.z, true);
        let speed = 0;
        let upT = 0;
        let look = false;
        let chew = 0;
        switch (a.state) {
          case "dash": {
            speed = run;
            const left = Math.hypot(a.tx - a.x, a.tz - a.z);
            if (left < 0.4) {
              a.state = "look";
              a.timer = rm ? 2.2 + R() * 1.4 : 1.1 + R() * 1.4;
            } else if (scared) leave(a, avatar.x, avatar.z, false);
            break;
          }
          case "look": {
            // Frozen, sitting up, ears and eyes on the traveler.
            upT = 1;
            look = true;
            a.timer -= dt;
            if (scared) leave(a, avatar.x, avatar.z, false);
            else if (a.timer <= 0) {
              if (a.nut && R() < 0.6) {
                a.state = "nibble";
                a.timer = 2 + R() * 2.5;
              } else leave(a, avatar.x, avatar.z, R() < 0.75);
            }
            break;
          }
          case "nibble": {
            // Sitting up, turning the nut in its forepaws, a glance now and then.
            upT = 0.8;
            chew = 1;
            look = Math.sin(clock * 0.8 + a.phase * 5) > 0.6;
            a.timer -= dt;
            if (scared || a.timer <= 0) leave(a, avatar.x, avatar.z, R() < 0.75);
            break;
          }
          case "leave": {
            speed = run * (d < 10 ? 1.1 : 1);
            if (a.walked > 22 || (L.trailQuery(a.x, a.z).d > 6 && !spot.view.sees(a.x, a.y + 0.3, a.z, 0.6))) goAway(a);
            break;
          }
        }
        if ((a.state as State) === "away") continue;
        // Sprints have a quick start and stop; the leave run swerves once (a zig) like a startled agouti.
        a.speed = damp(a.speed, speed, speed > a.speed ? 10 : 14, dt);
        if (a.speed > 0.05) {
          let want = Math.atan2(a.tx - a.x, a.tz - a.z);
          if (a.state === "leave" && a.walked > 1.2 && a.walked < 3) want += a.zig;
          a.yaw = turnToward(a.yaw, want, (rm ? 5 : 9) * dt);
          const step = Math.min(a.speed * dt, Math.hypot(a.tx - a.x, a.tz - a.z) + 0.01);
          const nx = a.x + Math.sin(a.yaw) * step;
          const nz = a.z + Math.cos(a.yaw) * step;
          if (!L.isWater(nx, nz)) {
            a.x = nx;
            a.z = nz;
          }
          a.walked += step;
        }
        a.up = damp(a.up, upT, 7, dt);
        a.y = damp(a.y, env.selva.groundAt(a.x, a.z), 14, dt);
        const toAv = wrapAngle(Math.atan2(avatar.x - a.x, avatar.z - a.z) - a.yaw);
        a.headYaw = damp(a.headYaw, look ? Math.max(-1.1, Math.min(1.1, toAv)) : 0, 6, dt);
        // Sitting up the head pitches back down to level; nibbling, it bobs over the paws.
        const nib = chew ? 0.25 + Math.sin(clock * 11 + a.phase) * 0.12 * (rm ? 0.5 : 1) : 0;
        a.headPitch = damp(a.headPitch, a.up * 0.75 + nib, 8, dt);
        if (spot.view.dist(a.x, a.y, a.z) > FAUNA_FAR) continue;
        a.phase = (a.phase + (a.speed * dt) / (0.9 * SCALE)) % 1;
        const swing = Math.min(0.85, a.speed * 0.16);
        // Bounding: the body rises and falls with each bound.
        const hop = Math.max(0, Math.sin(a.phase * Math.PI * 2)) * Math.min(0.08, a.speed * 0.012);
        const pitch = -a.up * 0.95 + (a.speed > 1 ? Math.sin(a.phase * Math.PI * 2) * 0.12 : 0);
        rootMatrix(m4, a.x, a.y + hop, a.z, a.yaw, pitch, 0, SCALE);
        // Upright: the hind legs swing back under the hips (against the body pitch), the forepaws come up.
        set.set(k++, m4, a.phase, swing, a.headYaw, a.headPitch, 0, 0, -a.up * 0.5, a.up * 0.45);
        if (a.nut) {
          // Held crosswise in the incisors, moved with the head (scaled with the body, a little larger).
          nutM.makeRotationY(a.yaw + Math.PI / 2).scale(NUT_SCALE);
          nutM.setPosition(headPoint(mouth, m4, model.spec.head, a.headYaw, a.headPitch, AGOUTI_MOUTH));
          nuts.setMatrixAt(kn++, nutM);
        }
        if (L.trailQuery(a.x, a.z).d < L.trail.halfWidth + 1.5) spot.see(a.x, a.y + 0.3, a.z, avatar.x, avatar.z, 0.6);
      }
      set.rim.value = clamp01(1 - diurnal(time)) * 0.6;
      set.commit(inside ? 0 : k);
      nuts.count = inside ? 0 : kn;
      nuts.visible = nuts.count > 0;
      if (nuts.count > 0) {
        nuts.instanceMatrix.needsUpdate = true;
        nuts.computeBoundingSphere();
        nuts.frustumCulled = true;
      }
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offMount();
      offDev();
      offDevSoon();
      set.dispose();
      nuts.removeFromParent();
      nuts.geometry.dispose();
      nutMat.dispose();
      nuts.dispose();
      root.removeFromParent();
    },
  };
};
