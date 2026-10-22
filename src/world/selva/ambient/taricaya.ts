/**
 * Taricayas (yellow-spotted river turtles, Podocnemis unifilis) basking in a row on fallen logs at the
 * river's edge on the road side: one a little downstream of the embarcadero (in view from its pier), another
 * along the canoe route and, on high quality, one more on it, one past the palafitos and one below the regatón.
 * By day they lie on the log, legs stretched back to the sun, heads up, turning now and then. When the
 * traveler comes close (≈ 10 u, ≈ 14 u running or paddling the canoe) they slide off into the water one by one,
 * nearest first, each with a plop and a ring; a while after the traveler has gone (≈ 16 u away) heads and
 * shells come up beside the log, drift a moment and climb back onto it, one by one. At dusk they slip into
 * the river for the night and only surface now and then, back on the log after sunrise.
 *
 * Rendering: the turtles as one instanced herd on the shared animal core (species "taricaya", wild/beasts.ts:
 * drawn about 1.35× life so the row reads from the road, each at its own size and pitched along the sloping
 * log; a crawl up the log, the "swim" mode with the legs sculling), the logs merged per cluster (the ones
 * along the canoe route are one mesh) and shown only within 110 u of the camera (wild/kit.ts SiteProps), and
 * a ripple pool → 2–3
 * draw calls (plus their ink and shadow passes) near the logs, none elsewhere.
 * Bodies: none (they never leave the log and the water, where the traveler cannot walk).
 * Stamp `selva:fauna:taricaya` after a ~1.5 s good look within 30 u (from the pier or the canoe).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { on } from "../../events";
import { inStationFootprint, stationFootprints } from "./embarcadero/footprints";
import { createBeasts } from "./wild/beasts";
import { logGeometry, mergeNear } from "./wild/critters";
import { ranks, SpeedMeter, stagger } from "./wild/crossing";
import { devHook, FAUNA_FAR, faunaDt, idle, Ripples, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { clamp01, damp, dayAmount, rng, roadFrame, TAU, turnToward, wrapAngle } from "./wild/logic";

type State = "bask" | "slide" | "under" | "surface" | "climb";

interface Log {
  /** Root end on the bank (axis point) and unit axis toward the tip (3D). */
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  r: number;
  yaw: number;
  slope: number;
  /** Axis distance where the log meets the water (beyond it the wood is awash). */
  wet: number;
  alarm: boolean;
  calm: number;
  turtles: Turtle[];
}

interface Turtle {
  log: Log;
  /** Axis distance of its basking spot, and whether it faces down the log (toward the water). */
  slot: number;
  down: boolean;
  state: State;
  timer: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Slide / climb progress and their end points. */
  u: number;
  fx: number;
  fy: number;
  fz: number;
  scale: number;
  phase: number;
  swing: number;
  headYaw: number;
  headPitch: number;
  look: number;
}

/**
 * Road t of the logs (the first two on every quality): downstream of the embarcadero along the canoe route
 * (upstream of it, at ≈ 0.4, lies the villagers' swimming trunk), past the palafitos, below the regatón.
 */
const SITES = [0.452, 0.51, 0.565, 0.645, 0.17];
/** Taricayas are ≈ 0.45 m; drawn a little larger so a row reads across the water. */
const SCALE = 1.35;

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(6151);
  const prints = stationFootprints(L);
  /** Swimming: the root sits so only the top of the shell and the head break the surface. */
  const swimY = lv - 0.13 * SCALE;

  // ---- logs: from the foot of the bank out into the water, angled downstream or upstream.
  const logs: Log[] = [];
  // Logs within 60 u of each other share one merged mesh, shown within 110 u of the camera (the turtles on
  // them are not drawn beyond FAUNA_FAR anyway).
  const props = new SiteProps(env, "selva-fauna-taricaya-logs", 110);
  const logGeos: THREE.BufferGeometry[] = [];
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
    const rootLat = shore - 0.9;
    const ox = f.x + f.rx * rootLat;
    const oz = f.z + f.rz * rootLat;
    if (inStationFootprint(prints, ox, oz, 3)) continue;
    const r = 0.26 + R() * 0.06;
    const len = 5 + R() * 1.2;
    // Out into the river at 30–50° from straight across, along the current one way or the other.
    const ang = (R() < 0.5 ? -1 : 1) * (0.55 + R() * 0.3);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const hx = f.rx * ca + f.tx * sa;
    const hz = f.rz * ca + f.tz * sa;
    const oy = L.heightAt(ox, oz) + r * 0.4;
    const ty = lv - r * 0.7;
    const run = Math.sqrt(Math.max(0.01, len * len - (oy - ty) ** 2));
    const slope = Math.atan2(oy - ty, run);
    const dx = hx * Math.cos(slope);
    const dz = hz * Math.cos(slope);
    const dy = -Math.sin(slope);
    const yaw = Math.atan2(hx, hz);
    // Where the top of the log goes under: the axis is r below the surface.
    const wet = Math.min(len, (oy + r - lv) / Math.max(0.01, Math.sin(slope)));
    const g = logGeometry(len, r, R() * 10);
    g.translate(0, -r, 0);
    g.rotateX(slope);
    g.rotateY(yaw);
    g.translate(ox, oy, oz);
    logGeos.push(g);
    logs.push({ ox, oy, oz, dx, dy, dz, len, r, yaw, slope, wet, alarm: false, calm: 0, turtles: [] });
  }

  for (const g of mergeNear(logGeos, 60)) props.add(g, high);

  // ---- turtles: a row on the dry part of each log, the first from just above the water up.
  const turtles: Turtle[] = [];
  for (const log of logs) {
    const n = high ? 5 : 3;
    const gap = 0.62 * SCALE;
    for (let i = 0; i < n; i++) {
      const slot = log.wet - 0.45 - i * gap;
      if (slot < 0.6) break;
      const tt: Turtle = {
        log,
        slot,
        down: R() < 0.7,
        state: "bask",
        timer: R() * 4,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        u: 0,
        fx: 0,
        fy: 0,
        fz: 0,
        scale: SCALE * (0.82 + R() * 0.3),
        phase: R(),
        swing: 0,
        headYaw: 0,
        headPitch: -0.3,
        look: 0,
      };
      placeOnLog(tt, slot);
      log.turtles.push(tt);
      turtles.push(tt);
    }
  }

  /** Point on top of the log at axis distance s (shell resting on the wood). */
  function onLog(log: Log, s: number, out: { x: number; y: number; z: number }) {
    out.x = log.ox + log.dx * s;
    out.y = log.oy + log.dy * s + log.r * 0.92;
    out.z = log.oz + log.dz * s;
    return out;
  }
  function placeOnLog(tt: Turtle, s: number) {
    onLog(tt.log, s, tt);
    tt.yaw = tt.log.yaw + (tt.down ? 0 : Math.PI);
    tt.pitch = tt.down ? tt.log.slope : -tt.log.slope;
  }

  const set = createBeasts(env, "taricaya", turtles.length, { scale: SCALE });
  const ripples = new Ripples(env, "selva-fauna-taricaya-ripples", 10, lv, 1.4);
  const root = new THREE.Group();
  root.name = "selva-fauna-taricaya";
  root.add(props.group, set.group, ripples.mesh);
  env.scene.add(root);

  const spot = new Spotter(env, "taricaya", 30);
  const meter = new SpeedMeter();
  let inside = false;
  let paddling = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offMount = on("world:mount", (d) => {
    paddling = !!d?.riding && d.vehicle === "canoe";
  });
  const offDev = devHook("taricaya", () =>
    logs.map((l) => ({
      x: +l.ox.toFixed(1),
      z: +l.oz.toFixed(1),
      tip: [+(l.ox + l.dx * l.len).toFixed(1), +(l.oz + l.dz * l.len).toFixed(1)],
      alarm: l.alarm,
      turtles: l.turtles.map((tt) => tt.state),
    })),
  );
  const tmp = { x: 0, y: 0, z: 0 };
  let clock = 0;

  return {
    update(dt, avatar) {
      dt = faunaDt(dt);
      clock += dt;
      meter.update(avatar.x, avatar.z, dt);
      const day = dayAmount(env.sky.time());
      const basking = day > 0.6;
      props.update(spot.view.cam);
      spot.begin();
      const scareR = meter.running || paddling ? 14 : 10;
      const mot = rm ? 0.6 : 1;

      // ---- alarm per log: the nearest turtle to the traveler decides; they go nearest first.
      for (const log of logs) {
        let near = Number.POSITIVE_INFINITY;
        for (const tt of log.turtles) near = Math.min(near, Math.hypot(tt.x - avatar.x, tt.z - avatar.z));
        const close = !inside && near < scareR;
        if (close && !log.alarm) {
          log.alarm = true;
          const order = ranks(log.turtles.map((tt) => Math.hypot(tt.x - avatar.x, tt.z - avatar.z)));
          log.turtles.forEach((tt, i) => {
            if (tt.state === "bask" || tt.state === "climb") {
              tt.state = "slide";
              tt.u = -stagger(order[i] as number, rm ? 0.6 : 0.35, 0.25, R);
              startSlide(tt);
            }
          });
        }
        if (close) log.calm = 0;
        else if (log.alarm) {
          log.calm = near > 16 ? log.calm + dt : 0;
          if (log.calm > 8) log.alarm = false;
        }
        // Dusk: into the water for the night, one by one, unhurried.
        if (!basking)
          for (const tt of log.turtles)
            if (tt.state === "bask" && R() < dt * 0.15) {
              tt.state = "slide";
              tt.u = 0;
              startSlide(tt);
            }
      }

      set.begin();
      for (let i = 0; i < turtles.length; i++) {
        const tt = turtles[i] as Turtle;
        const log = tt.log;
        let swimming = false;
        let headT = -0.3;
        let lookT = 0;
        let swingT = 0;
        switch (tt.state) {
          case "bask": {
            placeOnLog(tt, tt.slot);
            // Now and then a slow look around (or at a traveler within 20 u).
            tt.timer -= dt;
            if (tt.timer <= 0) {
              tt.timer = 3 + R() * 6;
              tt.look = (R() - 0.5) * 1.6;
            }
            const d = Math.hypot(tt.x - avatar.x, tt.z - avatar.z);
            lookT = d < 20 ? wrapAngle(Math.atan2(avatar.x - tt.x, avatar.z - tt.z) - tt.yaw) : tt.look;
            headT = -0.45;
            break;
          }
          case "slide": {
            // Waits its turn (u < 0), then tips off the side of the log and drops into the river.
            tt.u += dt / (rm ? 1.1 : 0.7);
            if (tt.u <= 0) {
              placeOnLog(tt, tt.slot);
              headT = -0.1;
              break;
            }
            const u = clamp01(tt.u);
            onLog(log, tt.slot, tmp);
            tt.x = tmp.x + (tt.fx - tmp.x) * u;
            tt.z = tmp.z + (tt.fz - tmp.z) * u;
            tt.y = tmp.y + (tt.fy - tmp.y) * u + Math.sin(Math.PI * u) * 0.15;
            tt.pitch = damp(tt.pitch, 0.7, 6, dt);
            swingT = 0.5;
            headT = 0.2;
            if (tt.u >= 1) {
              ripples.spawn(tt.x, tt.z, 1.1);
              tt.state = "under";
              tt.timer = (basking ? 14 : 30) + R() * 16;
            }
            break;
          }
          case "under": {
            tt.timer -= dt;
            if (tt.timer <= 0) {
              if (log.alarm) tt.timer = 3;
              else {
                // Up beside the log, 1.5–4 u off its side, a little downstream of its slot.
                const side = R() < 0.5 ? -1 : 1;
                const off = 1.5 + R() * 2.5;
                const s = Math.min(log.len, log.wet + R() * 1.5);
                onLog(log, s, tmp);
                tt.x = tmp.x + Math.cos(log.yaw) * off * side;
                tt.z = tmp.z - Math.sin(log.yaw) * off * side;
                if (L.heightAt(tt.x, tt.z) > lv - 0.4) {
                  tt.x = tmp.x;
                  tt.z = tmp.z;
                }
                tt.y = swimY - 0.3;
                tt.yaw = R() * TAU;
                tt.pitch = 0;
                tt.state = "surface";
                tt.timer = 4 + R() * 5;
                ripples.spawn(tt.x, tt.z, 0.8);
              }
            }
            break;
          }
          case "surface": {
            swimming = true;
            tt.y = damp(tt.y, swimY, 2, dt);
            tt.timer -= dt;
            headT = -0.55;
            swingT = 0.25;
            tt.yaw += Math.sin(clock * 0.4 + tt.phase * 6) * 0.2 * dt;
            if (log.alarm) {
              tt.state = "under";
              tt.timer = 6 + R() * 6;
              ripples.spawn(tt.x, tt.z, 0.8);
            } else if (tt.timer <= 0) {
              if (basking && !log.turtles.some((o) => o !== tt && o.state === "climb")) {
                tt.state = "climb";
                tt.u = 0;
              } else {
                tt.state = "under";
                tt.timer = 10 + R() * 20;
              }
            }
            break;
          }
          case "climb": {
            // Swim to the log's wet end, then haul out up the wood to its spot.
            onLog(log, log.wet + 0.2, tmp);
            const dw = Math.hypot(tmp.x - tt.x, tmp.z - tt.z);
            swingT = 0.45;
            if (tt.u === 0 && dw > 0.3) {
              swimming = true;
              tt.yaw = turnToward(tt.yaw, Math.atan2(tmp.x - tt.x, tmp.z - tt.z), 2 * dt);
              const sp = 0.6 * mot;
              tt.x += Math.sin(tt.yaw) * sp * dt;
              tt.z += Math.cos(tt.yaw) * sp * dt;
              tt.y = damp(tt.y, swimY, 4, dt);
            } else {
              tt.u = Math.max(tt.u, 1e-3) + (dt * 0.3 * mot) / Math.max(0.3, log.wet + 0.2 - tt.slot);
              const s = log.wet + 0.2 + (tt.slot - log.wet - 0.2) * clamp01(tt.u);
              onLog(log, s, tt);
              tt.yaw = turnToward(tt.yaw, log.yaw + Math.PI, 4 * dt);
              tt.pitch = -log.slope;
              if (tt.u >= 1) {
                tt.state = "bask";
                tt.timer = 2;
                tt.down = R() < 0.6;
              }
            }
            break;
          }
        }
        if (tt.state === "under") continue;
        tt.swing = damp(tt.swing, swingT, 4, dt);
        tt.headYaw = damp(tt.headYaw, Math.max(-1, Math.min(1, lookT)), 2, dt);
        tt.headPitch = damp(tt.headPitch, headT, 3, dt);
        if (inside || spot.view.dist(tt.x, tt.y, tt.z) > FAUNA_FAR) continue;
        set.put(
          i,
          tt.x,
          tt.y,
          tt.z,
          tt.yaw,
          {
          speed: tt.swing > 0.1 ? 0.12 + tt.swing * 0.2 : 0,
          rm,
          mode: swimming ? "swim" : "auto",
          look: tt.headYaw,
          // Basking in the sun: dozing allowed while nobody is near.
          quiet: tt.state === "bask" && !log.alarm,
          },
          // Along the sloping log (or level while swimming), each at its own size.
          { scale: tt.scale, pitch: swimming ? -0.1 : tt.pitch },
        );
        spot.see(tt.x, tt.y + 0.1, tt.z, avatar.x, avatar.z, 0.5);
      }
      set.end(dt, clock, env.camera);
      ripples.update(dt);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offMount();
      offDev();
      set.dispose();
      ripples.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };

  /** Slide target: off the log's side into the water by its slot (or past the wet end). */
  function startSlide(tt: Turtle) {
    const log = tt.log;
    const side = R() < 0.5 ? -1 : 1;
    onLog(log, Math.min(log.len, tt.slot + 0.6), tmp);
    tt.fx = tmp.x + Math.cos(log.yaw) * 0.9 * side;
    tt.fz = tmp.z - Math.sin(log.yaw) * 0.9 * side;
    tt.fy = swimY - 0.35;
  }
};
