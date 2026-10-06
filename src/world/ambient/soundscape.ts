/**
 * World soundscape (ambient, no prompt): continuous wind / water / rain beds, day birds, night crickets + owl,
 * footsteps that follow the traveler, and the world's sound effects hooked to window events.
 *
 *   wind     louder with altitude (avatar y between trailhead and summit) and near the summit
 *   water    distance to the nearest river/stream sample (env.extra.isWater ring probe) and the waterfall base,
 *            panned toward the source relative to the camera
 *   rain     while `world:weather` says kind "garua" (read by string name, detail checked defensively)
 *   birds    by day, sparse procedural chirps from random directions; crickets + an owl at night
 *   steps    from avatar position deltas; stone / grass / water / wood (inside); softer while riding a llama
 *   events   world:stamp -> chime, none for the summit (music stinger) (eggs: vizcacha squeak / golden sparkle, once per id per session),
 *            world:modal -> paper open/close, world:teleport -> whoosh, world:mount -> llama hum,
 *            world:interior -> door, world:map / world:help -> tick
 *
 * Silent until the music player's output() is live (audio unlocked by the COMENZAR gesture, not muted, tab
 * visible). Built on the shared AudioContext; the music engine dips this bus while stingers play.
 */
import { getMusic } from "../../audio/player";
import { hashSeed, rng, sfx, sfxForStamp } from "../../audio/sfx";
import type { CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { Layers } from "./soundscape/layers";
import {
  altitude01,
  birdCall,
  birdGap,
  cricketChirp,
  isGarua,
  mixTargets,
  panFor,
  strideFor,
  surfaceAt,
  waterLevel,
} from "./soundscape/mix";

const PROBE_HZ = 5;
const RING = [3, 6, 10, 15, 21];
const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);
const TELEPORT_JUMP = 4;

export const create: CreateAmbient = (env) => {
  const extra = (env as Partial<WorldEnvExtra>).extra ?? null;
  const music = getMusic();
  const low = env.quality === "low";
  const rand = rng((Date.now() ^ 0x51ed) >>> 0);

  const y0 = env.trail.pointAt(0).y;
  const summit = env.trail.pointAt(1);
  const y1 = summit.y;
  const fall = extra?.stream.fallBase ?? null;

  let layers: Layers | null = null;
  let disposed = false;

  // situation (from events)
  let inside = false;
  let modal = false;
  let game = false;
  let raining = false;
  let riding = false;
  let seat = 0;
  const stamped = new Set<string>();

  // movement
  let hasLast = false;
  let lx = 0;
  let lz = 0;
  let speed = 0;
  let stepDist = 0;
  let air = 0;
  let wasWet = false;

  // probes / scheduling
  let probeClock = 1;
  let clock = 0;
  let water = 0;
  let waterBright = 0;
  let waterPan = 0;
  let nextBird = 0;
  let nextCricket = 0;
  let nextOwl = 0;

  const cleanups: Array<() => void> = [];
  cleanups.push(
    on("world:stamp", (d) => {
      if (!d || stamped.has(d.id)) return;
      stamped.add(d.id);
      const name = sfxForStamp(d);
      if (name) sfx.play(name, { seed: hashSeed(d.id) });
    }),
    on("world:modal", (d) => {
      const open = !!d?.open;
      if (open === modal) return;
      modal = open;
      sfx.play(open ? "open" : "close");
    }),
    on("world:teleport", () => {
      hasLast = false;
      sfx.play("teleport");
    }),
    on("world:mount", (d) => {
      const r = !!d?.riding;
      if (r && !riding) sfx.play("llama");
      riding = r;
      seat = r ? (d?.seatHeight ?? 0) : 0;
    }),
    on("world:interior", (d) => {
      const i = !!d?.inside;
      if (i !== inside) sfx.play("door");
      inside = i;
    }),
    on("world:game", (d) => {
      game = !!d?.open;
    }),
    on("world:map", () => sfx.play("tick")),
    on("world:help", () => sfx.play("tick")),
  );
  // Weather comes from the sky module; listened to by name so this works whether or not it exists yet.
  const onWeather = (e: Event) => {
    raining = isGarua((e as CustomEvent).detail);
  };
  window.addEventListener("world:weather", onWeather);
  cleanups.push(() => window.removeEventListener("world:weather", onWeather));

  /** Nearest water (ring probe) and the waterfall: level, brightness and pan. */
  const probeWater = (x: number, z: number) => {
    let best: number | null = null;
    let bx = 0;
    let bz = 0;
    if (extra) {
      if (extra.isWater(x, z)) best = 0;
      else
        for (const r of RING) {
          for (const [cx, cz] of DIRS) {
            if (extra.isWater(x + cx * r, z + cz * r)) {
              best = r;
              bx = cx;
              bz = cz;
              break;
            }
          }
          if (best !== null) break;
        }
    }
    const fd = fall ? Math.hypot(fall.x - x, fall.z - z) : Number.POSITIVE_INFINITY;
    const w = waterLevel(best, fd);
    water = w.level;
    waterBright = w.fall;
    // pan toward the louder source, relative to the camera's right vector
    const e = env.camera.matrixWorld.elements;
    if (fall && w.fall >= w.river) waterPan = panFor(fall.x - x, fall.z - z, e[0], e[2]);
    else waterPan = best ? panFor(bx, bz, e[0], e[2]) : 0;
  };

  const scheduleLife = (now: number, mixDay: number, mixNight: number, alt: number) => {
    const l = layers;
    if (!l) return;
    if (mixDay > 0.05 && now >= nextBird) {
      if (nextBird > 0) l.chirps(birdCall(rand), now + 0.05, rand() * 1.6 - 0.8, (0.12 + rand() * 0.13) * mixDay);
      nextBird = now + birdGap(rand(), alt, raining, low);
    }
    if (mixNight > 0.05 && now >= nextCricket) {
      if (nextCricket > 0) {
        l.chirps(cricketChirp(rand, 4300), now + 0.03, -0.5, 0.05 * mixNight);
        if (!low) l.chirps(cricketChirp(rand, 4700), now + 0.31, 0.5, 0.04 * mixNight);
      }
      nextCricket = now + 0.7 + rand() * 0.6;
    }
    if (!low && mixNight > 0.05 && now >= nextOwl) {
      if (nextOwl > 0) l.owl(now + 0.05, rand() * 1.4 - 0.7, 0.18 * mixNight);
      nextOwl = now + 14 + rand() * 16;
    }
  };

  return {
    update(dt, avatar) {
      if (disposed) return;
      clock += dt;

      // --- movement (kept fresh even while silent so unmuting never fires a burst of steps)
      const dx = avatar.x - lx;
      const dz = avatar.z - lz;
      const moved = Math.hypot(dx, dz);
      lx = avatar.x;
      lz = avatar.z;
      const valid = hasLast && moved < TELEPORT_JUMP;
      if (!valid) stepDist = 0;
      hasLast = true;
      const inst = valid && dt > 0 ? moved / dt : 0;
      speed += (inst - speed) * (1 - Math.exp(-dt * 10));
      const ground = extra ? extra.groundAt(avatar.x, avatar.z) : avatar.y;
      const grounded = avatar.y - ground - seat < 0.3;

      const out = music.output?.() ?? null;
      if (!out) {
        stepDist = 0;
        air = 0;
        return;
      }
      if (!layers || layers.ctx !== out.ctx) {
        layers?.dispose();
        layers = new Layers(out.ctx, out.ambient);
        probeClock = 1;
      }
      const now = out.ctx.currentTime;

      // --- footsteps
      if (!grounded) air += dt;
      else {
        const wet = !!extra && !inside && extra.isWater(avatar.x, avatar.z);
        if (air > 0.35 && valid) {
          layers.step(surfaceAt(inside, wet, !!extra?.isGrass(avatar.x, avatar.z)), now + 0.01, 1.2, rand());
          stepDist = 0;
        }
        air = 0;
        if (valid && moved > 0.001 && speed > 0.6 && !game) {
          stepDist += moved;
          if (wet && !wasWet) sfx.play("splash", { gain: 0.6 });
          const stride = strideFor(speed, riding);
          if (stepDist >= stride) {
            stepDist -= stride;
            if (stepDist > stride) stepDist = 0;
            const surf = surfaceAt(inside, wet, !!extra?.isGrass(avatar.x, avatar.z));
            const level = (riding ? 0.4 : speed > 5.5 ? 1 : 0.8) * (modal ? 0.5 : 1);
            layers.step(surf, now + 0.01, level, rand());
          }
        } else if (speed < 0.3) stepDist = 0;
        wasWet = wet;
      }

      // --- continuous layers at a few Hz
      probeClock += dt;
      if (probeClock >= 1 / PROBE_HZ) {
        probeClock = 0;
        probeWater(avatar.x, avatar.z);
        const alt = altitude01(avatar.y, y0, y1);
        const summitDist = Math.hypot(summit.x - avatar.x, summit.z - avatar.z);
        const night = env.sky.isNight();
        const mix = mixTargets({ alt, summitDist, water, night, raining, inside, modal, game });
        const gn = 0.5 + 0.5 * Math.sin(clock * 0.37) * Math.sin(clock * 0.13 + 1.3);
        layers.apply(mix, {
          gust: 0.7 + 0.5 * gn,
          windFreq: 360 + 380 * gn + 260 * alt,
          waterBright,
          waterPan,
        });
        scheduleLife(now, mix.day * mix.master, mix.night * mix.master, alt);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of cleanups.splice(0)) c();
      layers?.dispose();
      layers = null;
    },
  };
};
