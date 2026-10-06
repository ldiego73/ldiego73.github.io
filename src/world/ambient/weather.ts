/**
 * Changing Andean weather: clear → mist (valley fog, clouds on the slopes) → garúa (fine drizzle) → clear on
 * a slow random schedule with long crossfades, plus morning mist around sunrise. Drives the sky through the
 * `SkyWeather` hook on env.sky (sky.ts blends fog/dome/stars), adds drizzle streaks + mist banks, emits
 * `world:weather` for sound and the `weather:fog` / `weather:garua` passport stamps.
 * Reduced motion: no drizzle or drifting banks, just fog. Low quality: fewer drops and banks.
 */
import * as THREE from "three";
import type { CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { hasWeather } from "../sky";
import { createGarua, createMistBanks, type Garua, type MistBanks } from "./sky/garua";
import { createWeatherClock, dawnMist, type WeatherLevels } from "./sky/weather-schedule";

const DROPS_HIGH = 1400;
const DROPS_LOW = 450;

export const create: CreateAmbient = (env, hudRoot) => {
  const extra = (env as WorldEnvExtra).extra;
  const groundAt = extra?.groundAt ?? env.heightAt;
  const clock = createWeatherClock(Math.random, "clear", 100 + Math.random() * 80);
  const lv: WeatherLevels = { fog: 0, cover: 0, rain: 0 };
  const skyHook = hasWeather(env.sky) ? env.sky : null;

  let garua: Garua | null = null;
  let banks: MistBanks | null = null;
  if (!env.reducedMotion) {
    garua = createGarua(DROPS_HIGH, env.quality === "high" ? DROPS_HIGH : DROPS_LOW);
    banks = createMistBanks(env.quality === "high" ? 10 : 6, groundAt);
    env.scene.add(garua.object, banks.object);
  }
  const offQuality = on("world:quality", (d) => garua?.setCount(d.quality === "high" ? DROPS_HIGH : DROPS_LOW));
  // No drizzle or banks under a roof (chasqui house, arcade tambo).
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  const fogColor = new THREE.Color();
  const center = new THREE.Vector3();
  let wasPlaying = false;
  let stampedFog = false;
  let stampedGarua = false;
  emit("world:weather", { kind: clock.kind });

  return {
    update(dt, avatar) {
      const playing = hudRoot.classList.contains("on");
      if (playing && !wasPlaying) emit("world:weather", { kind: clock.kind });
      wasPlaying = playing;
      if (playing && clock.step(dt)) emit("world:weather", { kind: clock.kind });
      clock.levels(lv);
      const dawn = dawnMist(env.sky.time());
      const fog = lv.fog + dawn * (1 - lv.fog);
      skyHook?.setWeather(fog, lv.cover + dawn * 0.3 * (1 - lv.cover));

      if (playing) {
        if (!stampedFog && fog >= 0.55) {
          stampedFog = true;
          emit("world:stamp", {
            id: "weather:fog",
            kind: "weather",
            label: { es: "Niebla del valle", en: "Valley mist" },
          });
        }
        if (!stampedGarua && lv.rain >= 0.5) {
          stampedGarua = true;
          emit("world:stamp", { id: "weather:garua", kind: "weather", label: { es: "Garúa", en: "Garúa drizzle" } });
        }
      }

      const sf = env.scene.fog as THREE.Fog | null;
      if (sf) fogColor.copy(sf.color);
      center.copy(env.camera.position);
      const out = playing && !inside;
      garua?.update(dt, center, out ? lv.rain : 0, fogColor);
      // Banks gather around the traveler (not the camera) in the low ground.
      banks?.update(dt, avatar, out ? Math.max(0, fog - 0.25) / 0.75 : 0, fogColor);
    },
    dispose() {
      offQuality();
      offInterior();
      skyHook?.setWeather(0, 0);
      if (garua) {
        env.scene.remove(garua.object);
        garua.dispose();
      }
      if (banks) {
        env.scene.remove(banks.object);
        banks.dispose();
      }
    },
  };
};
