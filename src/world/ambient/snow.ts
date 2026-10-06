/**
 * Winter on the summit (calendar.ts `seasonOf().snow`, real date or `?date=2026-07-15`): above snow 0.3 a
 * snow cap covers the peak down to a line that drops as winter deepens (snow/cap.ts, one draw call), and on
 * cold nights and dawns a light snowfall drifts around the traveler near the top (snow/snowfall.ts).
 * Reaching the snowy summit stamps `festival:snow`. Dev: `?weather=snow` keeps the snowfall on.
 * Built lazily: on a day without snow nothing exists, and the date is re-checked (festival/datewatch.ts,
 * every minute; every second in dev) so the cap and snowfall appear when winter arrives and go away when it
 * ends, without a reload. Reduced motion: the cap stays, no falling flakes. Low quality: fewer flakes.
 */
import * as THREE from "three";
import { seasonOf } from "../calendar";
import type { CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { SUMMIT } from "../layout";
import { dateWatch } from "./festival/datewatch";
import { createSnowCap, type SnowCap } from "./snow/cap";
import { SNOW_MIN, snowHour, snowLine, stepSpell } from "./snow/line";
import { createSnowfall, type Snowfall } from "./snow/snowfall";

const FLAKES_HIGH = 900;
const FLAKES_LOW = 320;

export const create: CreateAmbient = (env, hudRoot) => {
  const extra = (env as WorldEnvExtra).extra;
  // Not winter enough today: build nothing, but keep watching the date (a long session can cross into winter).
  const watch = dateWatch(() => seasonOf().snow > SNOW_MIN);
  let line = Number.POSITIVE_INFINITY;
  let cap: SnowCap | null = null;
  let fall: Snowfall | null = null;
  let flakes = env.quality === "high" ? FLAKES_HIGH : FLAKES_LOW;
  const build = () => {
    if (cap) return;
    cap = createSnowCap({
      heightAt: env.heightAt,
      trailD: (x, z) => (extra ? extra.trailDistance(x, z).d : 99),
      halfWidth: env.trail.halfWidth,
      center: SUMMIT,
      radius: 78,
      quality: env.quality,
    });
    env.scene.add(cap.mesh);
    line = snowLine(seasonOf().snow);
    cap.setLine(line);
    if (!env.reducedMotion) {
      fall = createSnowfall(FLAKES_HIGH, flakes);
      env.scene.add(fall.object);
    }
  };
  const teardown = () => {
    line = Number.POSITIVE_INFINITY;
    amount = 0;
    if (cap) {
      env.scene.remove(cap.mesh);
      cap.dispose();
      cap = null;
    }
    if (fall) {
      env.scene.remove(fall.object);
      fall.dispose();
      fall = null;
    }
  };
  const offQuality = on("world:quality", (d) => {
    flakes = d.quality === "high" ? FLAKES_HIGH : FLAKES_LOW;
    fall?.setCount(flakes);
  });
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  let pinned = false;
  if (import.meta.env?.DEV) {
    try {
      pinned = new URLSearchParams(location.search).get("weather") === "snow";
    } catch {
      /* no location */
    }
  }
  // Start in a snowing spell about half the time.
  const spell = { on: pinned || Math.random() < 0.5, left: 60 + Math.random() * 120 };
  const top = env.trail.pointAt(1, new THREE.Vector3());
  const fogColor = new THREE.Color();
  const center = new THREE.Vector3();
  let amount = 0;
  let stamped = false;
  let age = 0;
  const pr = Math.min(2, window.devicePixelRatio || 1);
  if (watch.on) build();

  return {
    update(dt, avatar) {
      if (watch.step(dt)) {
        if (watch.on) build();
        else teardown();
      }
      if (!cap) return;
      age += dt;
      if (age > 30) {
        age = 0;
        line = snowLine(seasonOf().snow);
        cap.setLine(line);
      }
      const playing = hudRoot.classList.contains("on");
      if (playing && !stamped && Number.isFinite(line)) {
        const dx = avatar.x - top.x;
        const dz = avatar.z - top.z;
        if (dx * dx + dz * dz < 12 * 12) {
          stamped = true;
          emit("world:stamp", {
            id: "festival:snow",
            kind: "festival",
            label: { es: "Nieve en la cumbre", en: "Snow on the summit" },
          });
        }
      }
      if (!fall) return;
      if (!pinned) stepSpell(spell, dt, Math.random());
      // Near the top (camera up by the snow line), at night or dawn, outdoors.
      const cam = env.camera.position;
      const high = Number.isFinite(line) ? THREE.MathUtils.smoothstep(cam.y, line - 16, line - 4) : 0;
      const want = playing && !inside && (pinned || (spell.on && snowHour(env.sky.time()))) ? high : 0;
      amount += (want - amount) * Math.min(1, dt / 4);
      const sf = env.scene.fog as THREE.Fog | null;
      if (sf) fogColor.copy(sf.color);
      center.copy(cam);
      fall.update(dt, center, amount, fogColor, pr);
    },
    dispose() {
      offQuality();
      offInterior();
      teardown();
    },
  };
};
