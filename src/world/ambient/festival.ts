/**
 * Inti Raymi, the June solstice festival (calendar.ts `festivalOf()`: June 20–24, real date or
 * `?date=2026-06-24`): bonfires along the upper trail and flanking the summit ushnu (festival/bonfires.ts),
 * rainbow and Inti banners plus flower petals on the summit plaza (festival/banners.ts); sky.ts adds the
 * golden sunrise. Reaching the summit during the festival stamps `festival:inti-raymi`.
 * Any other day this module builds nothing, but it re-checks the date (festival/datewatch.ts: every minute,
 * every second in dev) and builds the festival when the date turns June 20 without a reload, tearing it
 * down again after June 24. Reduced motion: still flames and cloth, no embers.
 * Low quality: one light, fewer embers and petals.
 */
import * as THREE from "three";
import { festivalOf } from "../calendar";
import type { CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit } from "../events";
import { type Banners, createBanners } from "./festival/banners";
import { type Bonfires, createBonfires, type Fire } from "./festival/bonfires";
import { dateWatch } from "./festival/datewatch";
import { roadsideFires } from "./festival/spots";

export const create: CreateAmbient = (env, hudRoot) => {
  const extra = (env as WorldEnvExtra).extra;
  const high = env.quality === "high";
  const watch = dateWatch(() => festivalOf() === "inti-raymi");

  // Summit frame, exactly as content.ts places the summit group (ushnu at the origin, +Z toward the trail).
  const p1 = env.trail.pointAt(1, new THREE.Vector3());
  const tg = env.trail.tangentAt(1, new THREE.Vector3());
  const dir = new THREE.Vector3(tg.x, 0, tg.z).normalize();
  const center = p1.clone().addScaledVector(dir, 3.5);
  const yaw = Math.atan2(p1.x - center.x, p1.z - center.z);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const toWorld = (lx: number, lz: number, out: THREE.Vector3) =>
    out.set(center.x + lx * cy + lz * sy, 0, center.z - lx * sy + lz * cy);

  // Fire spots and their colliders are placed once (first build). Colliders can't be removed from the
  // layout, so off-festival they shrink to r = 0 and grow back when the festival returns.
  let fires: Fire[] | null = null;
  const colliders: Array<{ kind: "circle"; x: number; z: number; r: number }> = [];
  const FIRE_R = 0.95;
  const placeFires = (): Fire[] => {
    const v = new THREE.Vector3();
    const out: Fire[] = [];
    // Bonfires: two flanking the ushnu, the rest by the upper switchbacks.
    for (const lx of [-5, 5]) {
      toWorld(lx, 0.2, v);
      out.push({ x: v.x, y: env.heightAt(v.x, v.z), z: v.z });
    }
    const avoid: Array<{ x: number; z: number; r: number }> = [{ x: p1.x, z: p1.z, r: 12 }];
    for (const id of ["arcade", "ai", "contact", "build-3", "globant", "bridge"]) {
      try {
        const p = env.stationPose(id).position;
        avoid.push({ x: p.x, z: p.z, r: 9 });
      } catch {
        /* not placed */
      }
    }
    if (extra) avoid.push({ x: extra.stream.cross.x, z: extra.stream.cross.z, r: 6 });
    const tp = new THREE.Vector3();
    const tt = new THREE.Vector3();
    for (const f of roadsideFires({
      point: (t) => env.trail.pointAt(t, tp),
      tangent: (t) => {
        env.trail.tangentAt(t, tt);
        const l = Math.hypot(tt.x, tt.z) || 1;
        return { x: tt.x / l, z: tt.z / l };
      },
      heightAt: env.heightAt,
      halfWidth: env.trail.halfWidth,
      avoid,
    }))
      out.push(f);
    for (const f of out) {
      const c = { kind: "circle" as const, x: f.x, z: f.z, r: FIRE_R };
      colliders.push(c);
      env.addCollider(c);
    }
    return out;
  };

  let bonfires: Bonfires | null = null;
  let banners: Banners | null = null;
  const build = () => {
    if (bonfires) return;
    fires ??= placeFires();
    for (const c of colliders) c.r = FIRE_R;
    bonfires = createBonfires(env, fires, {
      lights: high ? 3 : 1,
      embersPer: env.reducedMotion ? 0 : high ? 36 : 14,
      animate: !env.reducedMotion,
    });
    banners = createBanners(env, toWorld, yaw, !env.reducedMotion, high ? 320 : 140);
    env.scene.add(bonfires.group, banners.group);
  };
  const teardown = () => {
    for (const c of colliders) c.r = 0;
    if (bonfires) {
      env.scene.remove(bonfires.group);
      bonfires.dispose();
      bonfires = null;
    }
    if (banners) {
      env.scene.remove(banners.group);
      banners.dispose();
      banners = null;
    }
  };
  if (watch.on) build();

  let stamped = false;
  let night = env.sky.isNight() ? 1 : 0;
  return {
    update(dt, avatar) {
      if (watch.step(dt)) {
        if (watch.on) build();
        else teardown();
      }
      if (!bonfires || !banners) return;
      const target = env.sky.isNight() ? 1 : 0;
      night += (target - night) * Math.min(1, dt * 0.8);
      bonfires.update(dt, avatar, night);
      banners.update(dt);
      if (!stamped && hudRoot.classList.contains("on")) {
        const dx = avatar.x - center.x;
        const dz = avatar.z - center.z;
        if (dx * dx + dz * dz < 11 * 11) {
          stamped = true;
          emit("world:stamp", {
            id: "festival:inti-raymi",
            kind: "festival",
            label: { es: "Inti Raymi", en: "Inti Raymi" },
          });
        }
      }
    },
    dispose() {
      teardown();
    },
  };
};
