/**
 * Children swimming at the river from the sandbar across from the embarcadero (seen from its pier and jetty,
 * and from the canoe): a stranded driftwood trunk lies on the end of the bar pointing out over the water; one
 * at a time they walk out along it with their arms out, wait on the tip, jump (a splash ring), swim back to
 * the bar, wade out and walk over the sand to the trunk again. The next child waits at the base until the trunk is
 * free. They never jump while the traveler's canoe is close below the tip; they are solid bodies in the water,
 * so the canoe bumps around them. Day only. Pure timing and arcs: ./logic.ts (jumpArc, nextStage).
 */
import * as THREE from "three";
import type { Npc } from "../../../ambient/people/npc";
import { Static } from "../../../ambient/people/site-props";
import { rng } from "../../../ambient/people/util";
import type { HumanCrowd } from "../../../characters/crowd";
import { creatures, type KeepOut } from "../../../creatures";
import { type Bar, barF, barPoint, barY, type Ripples } from "../wild/kit";
import { isOut, jumpArc, nextStage, SWIM_SPEED, SWIM_TIMES, type SwimStage } from "./logic";
import { jumpLog } from "./models";
import type { Ctx, Group } from "./types";
import { villager } from "./villager";

/** Feet origin below the river level while swimming (the "swim" pose lays the body flat at the root). */
const SWIM_SINK = 0.08;

/** World points of the swimming place (see `findSwimSpot`). */
export interface SwimSpot {
  /** Top of the trunk at its base on the sand, and at its tip over the water. */
  base: THREE.Vector3;
  tip: THREE.Vector3;
  /** Where they land in the water (river level), and where they wade out (the bar's waterline). */
  land: THREE.Vector3;
  shore: THREE.Vector3;
  /** Unit direction from the base out over the water. */
  out: THREE.Vector2;
  /** Center of the play place (the bar) and its reach. */
  center: THREE.Vector3;
  reach: number;
  /** Standing height on the sand (the scenery's sand dome; the river level beyond it). */
  groundY(x: number, z: number): number;
}

/**
 * The swimming place: a sandbar (playa) of the scenery, with a stranded driftwood trunk lying on its end and
 * pointing out over the water. The trunk lies on the bar's end nearest `toward` (the embarcadero, so the
 * children are seen from its pier and jetty); its tip is ~4 u out, over water at least 0.4 deep.
 * Sandbars carry no vegetation, so the place reads clearly across the river.
 */
export function findSwimSpot(env: Ctx["env"], bar: Bar, toward: { x: number; z: number }): SwimSpot | null {
  const L = env.selva.layout;
  const level = L.river.level;
  const a = barPoint(bar, 1, 0);
  const b = barPoint(bar, -1, 0);
  const end = Math.hypot(a.x - toward.x, a.z - toward.z) < Math.hypot(b.x - toward.x, b.z - toward.z) ? 1 : -1;
  const groundY = (x: number, z: number) => {
    const f = barF(bar, x, z);
    return f < 1 ? barY(level, f) : Math.max(level - 0.3, L.heightAt(x, z));
  };
  const bp = barPoint(bar, end * 0.72, 0);
  const ax = Math.cos(bar.yaw) * end;
  const az = Math.sin(bar.yaw) * end;
  const base = new THREE.Vector3(bp.x, groundY(bp.x, bp.z) + 0.3, bp.z);
  let tipD = 4;
  while (
    tipD < 7.5 &&
    (barF(bar, bp.x + ax * tipD, bp.z + az * tipD) < 1.12 ||
      L.heightAt(bp.x + ax * tipD, bp.z + az * tipD) > level - 0.4)
  )
    tipD += 0.5;
  if (!L.isWater(bp.x + ax * tipD, bp.z + az * tipD)) return null;
  const tip = new THREE.Vector3(bp.x + ax * tipD, level + 0.95, bp.z + az * tipD);
  const land = new THREE.Vector3(tip.x + ax * 1.9, level, tip.z + az * 1.9);
  // Wade out on the bar's flank facing the road side (toward the viewer), a little back from the end.
  const s1 = barPoint(bar, end * 0.45, 1);
  const s2 = barPoint(bar, end * 0.45, -1);
  const sp = Math.hypot(s1.x - toward.x, s1.z - toward.z) < Math.hypot(s2.x - toward.x, s2.z - toward.z) ? s1 : s2;
  const shore = new THREE.Vector3(sp.x, level, sp.z);
  return {
    base,
    tip,
    land,
    shore,
    out: new THREE.Vector2(ax, az),
    center: new THREE.Vector3(bar.x, level, bar.z),
    reach: bar.len + 6,
    groundY,
  };
}

interface Swimmer {
  p: Npc;
  stage: SwimStage;
  /** Progress 0..1 of the current stage, and its duration. */
  u: number;
  dur: number;
  /** Swim arc control point (a little upstream/downstream so they don't all swim the same line). */
  side: number;
  splash: number;
}

export function createSwimmers(
  env: Ctx["env"],
  crowd: HumanCrowd,
  staticMat: THREE.Material,
  spot: SwimSpot,
  n: number,
  ripples: Ripples,
): Group {
  const R = rng(4711);
  const L = env.selva.layout;
  const level = L.river.level;

  // The trunk (its walking line is base → tip; the log's axis is 0.32 lower).
  const st = new Static();
  const down = new THREE.Vector3(0, -0.32, 0);
  jumpLog(st.p, st.P, spot.base.clone().add(down), spot.tip.clone().add(down));
  const logGeo = st.build();
  const log = new THREE.Mesh(logGeo, staticMat);
  log.name = "comunidad:log";
  log.castShadow = true;
  env.scene.add(log);
  const logBody = creatures.add("prop", 0.6, {
    x: (spot.base.x * 2 + spot.tip.x) / 3,
    z: (spot.base.z * 2 + spot.tip.z) / 3,
    give: 0,
  });
  const zone: KeepOut = creatures.keepOut(spot.center.x, spot.center.z, spot.reach - 4);

  const kids: Swimmer[] = Array.from({ length: n }, (_, i) => {
    // Boys swim bare-chested in their shorts, girls in their blouse and small skirt.
    const p = villager(crowd, {
      kind: "child",
      who: i % 2 === 0 ? "swimmer" : "girl",
      r: R,
      radius: 0.26,
      seed: 3 + i * 9.7,
    });
    p.lookRange = 0;
    // Staggered round the loop.
    const stages: SwimStage[] = ["wait", "swim", "climb"];
    const st = stages[i % stages.length] as SwimStage;
    return { p, stage: st, u: (i * 0.37) % 1, dur: 3, side: i % 2 ? 1 : -1, splash: 0 };
  });

  const tmp = { x: 0, y: 0, z: 0 };
  const durOf = (k: Swimmer): number => {
    switch (k.stage) {
      case "log":
        return spot.base.distanceTo(spot.tip) / SWIM_SPEED.log;
      case "tip":
        return SWIM_TIMES.tip + (k.p.seed % 1) * 0.8;
      case "jump":
        return SWIM_TIMES.jump;
      case "under":
        return SWIM_TIMES.under;
      case "swim":
        return spot.land.distanceTo(spot.shore) / SWIM_SPEED.swim + 1;
      case "climb":
        return Math.hypot(spot.shore.x - spot.base.x, spot.shore.z - spot.base.z) / SWIM_SPEED.climb;
      default:
        return 0.8;
    }
  };
  for (const k of kids) k.dur = durOf(k);
  let logBusy: Swimmer | null = null;
  let isDay: boolean | null = null;
  let frame = 0;
  let shown = true;
  const yawOut = Math.atan2(spot.out.x, spot.out.y);

  /** Position of a swimmer for its stage and progress (written into the person). */
  const place = (k: Swimmer, c: Ctx) => {
    const p = k.p;
    const u = k.u;
    switch (k.stage) {
      case "wait": {
        // Beside the base of the trunk, watching.
        const x = spot.base.x - spot.out.x * 0.9 + spot.out.y * 0.8 * k.side;
        const z = spot.base.z - spot.out.y * 0.9 - spot.out.x * 0.8 * k.side;
        p.place(x, z, yawOut);
        p.y = spot.groundY(x, z);
        break;
      }
      case "log":
      case "tip": {
        const f = k.stage === "tip" ? 1 : u;
        const x = spot.base.x + (spot.tip.x - spot.base.x) * f;
        const z = spot.base.z + (spot.tip.z - spot.base.z) * f;
        p.place(x, z, yawOut);
        p.y = spot.base.y + (spot.tip.y - spot.base.y) * f;
        break;
      }
      case "jump": {
        jumpArc(u, spot.tip.x, spot.tip.y, spot.tip.z, spot.land.x, level - 0.4, spot.land.z, 1.1, tmp);
        p.place(tmp.x, tmp.z, yawOut);
        p.y = tmp.y;
        break;
      }
      case "under":
        p.place(spot.land.x, spot.land.z, yawOut);
        p.y = level - 1.2;
        break;
      case "swim": {
        // A gentle curve from the landing spot back to the bank (quadratic through a side point).
        const mx = (spot.land.x + spot.shore.x) / 2 + spot.out.y * 1.6 * k.side + spot.out.x * 0.6;
        const mz = (spot.land.z + spot.shore.z) / 2 - spot.out.x * 1.6 * k.side + spot.out.y * 0.6;
        const a = (1 - u) * (1 - u);
        const b2 = 2 * u * (1 - u);
        const cc = u * u;
        const x = a * spot.land.x + b2 * mx + cc * spot.shore.x;
        const z = a * spot.land.z + b2 * mz + cc * spot.shore.z;
        const dx = 2 * (1 - u) * (mx - spot.land.x) + 2 * u * (spot.shore.x - mx);
        const dz = 2 * (1 - u) * (mz - spot.land.z) + 2 * u * (spot.shore.z - mz);
        p.place(x, z, Math.atan2(dx, dz));
        p.y = level - SWIM_SINK * p.scale;
        break;
      }
      case "climb": {
        const x = spot.shore.x + (spot.base.x - spot.shore.x) * u;
        const z = spot.shore.z + (spot.base.z - spot.shore.z) * u;
        p.place(x, z, Math.atan2(spot.base.x - spot.shore.x, spot.base.z - spot.shore.z));
        p.y = spot.groundY(x, z);
        break;
      }
    }
    void c;
  };

  return {
    name: "swimmers",
    center: spot.center.clone(),
    radius: spot.reach,
    update(c, visible) {
      const day = isOut("swim", c.time);
      if (isDay === null || c.jump) for (const k of kids) k.p.setActive(day);
      isDay = day;
      if (frame++ % 15 === 0)
        for (const k of kids) if (k.p.active !== day && !c.seen(k.p.x, k.p.y + 0.6, k.p.z, 80)) k.p.setActive(day);
      let anyone = false;
      for (const k of kids) anyone ||= k.p.active;
      zone.on = anyone;
      if (visible !== shown) {
        shown = visible;
        log.visible = visible;
        if (!visible) for (const k of kids) k.p.hide();
      }
      if (!anyone) return;
      // The traveler's canoe near the landing spot: nobody jumps.
      const blocked = Math.hypot(c.avatar.x - spot.land.x, c.avatar.z - spot.land.z) < 5.5;
      const dt = c.dt;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i] as Swimmer;
        if (!k.p.active) continue;
        // Far away: only the schedule runs (cheap), the loop resumes where it was.
        if (!visible) continue;
        let hold = false;
        if (k.stage === "wait" && logBusy && logBusy !== k) hold = true;
        if (k.stage === "tip" && blocked) hold = true;
        if (!hold) k.u += dt / Math.max(0.05, k.dur);
        if (k.u >= 1) {
          const prev = k.stage;
          k.stage = nextStage(k.stage);
          k.u = 0;
          k.dur = durOf(k);
          if (k.stage === "log") logBusy = k;
          if (prev === "jump") {
            ripples.spawn(spot.land.x, spot.land.z, 1.3);
            ripples.spawn(spot.land.x, spot.land.z, 0.7);
            if (logBusy === k) logBusy = null;
          }
        }
        if (k.stage === "wait" && !logBusy) logBusy = k;
        place(k, c);
        k.p.speed = 0;
        k.p.body.solid = k.stage !== "under" && k.stage !== "jump";
        k.p.body.x = k.p.x;
        k.p.body.z = k.p.z;
        // Pose: walking the trunk and the sand, ready on the tip, the cannonball, a crawl back to the bank.
        const p = k.p;
        const a = p.anim;
        if (k.stage === "log" || k.stage === "climb") {
          p.speed = k.stage === "log" ? SWIM_SPEED.log : SWIM_SPEED.climb;
          a.act("none");
          // Arms out for balance along the trunk.
          a.actArms(k.stage === "log" ? "balance" : "none");
        } else if (k.stage === "tip") {
          a.actArms("none");
          a.act("crouch", { fade: 0.4 });
        } else if (k.stage === "jump") a.act("jump", { fade: 0.1 });
        else if (k.stage === "swim") {
          a.act("swim", { fade: 0.35 });
          k.splash -= dt;
          if (k.splash <= 0 && !c.rm) {
            k.splash = 0.7;
            ripples.spawn(p.x, p.z, 0.45);
          }
        } else if (k.stage === "wait") a.act(i % 2 ? "hands-hips" : "hands-back", { fade: 0.4 });
        if (k.stage === "under") p.hide();
        else p.commit(c);
      }
    },
    dev: {
      /** Put child i at a stage ("wait","log","tip","jump","under","swim","climb" by index) and progress. */
      stage: (i: number, stage: number, u: number) => {
        const k = kids[i];
        const order: SwimStage[] = ["wait", "log", "tip", "jump", "under", "swim", "climb"];
        if (!k) return;
        k.stage = order[stage] ?? "wait";
        k.u = u;
        k.dur = durOf(k);
        if (k.stage === "log" || k.stage === "tip") logBusy = k;
      },
    },
    people: () => kids.filter((k) => k.p.active).length,
    points: () => [
      { x: spot.base.x, z: spot.base.z },
      { x: spot.land.x, z: spot.land.z },
    ],
    dispose() {
      for (const k of kids) k.p.dispose();
      creatures.remove(logBody);
      creatures.removeKeepOut(zone);
      logGeo.dispose();
      log.removeFromParent();
    },
  };
}
