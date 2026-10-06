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
 *   places   each station (and the summit) has a short musical motif that fades in over the world music while the
 *            traveler is near it, in time with the track's step grid (./soundscape/motifs.ts, motif-player.ts);
 *            during Inti Raymi (calendar.ts) a festival band plays from the nearest "dancer"
 *   critters positional animal calls (puma growl at night, fox yips at dusk, condor, vicuña alarm when the herd
 *            flees, alpaca/llama hums, vizcacha/duck/tinamou whistles, colibrí buzz, bear huff) and people
 *            murmur/laughter, read from the shared `creatures` registry (./soundscape/critters.ts, calls.ts);
 *            birdsong leans toward registered tangaras/sparrows. No body of a kind -> no sound of it.
 *   events   world:stamp -> chime, none for the summit (music stinger) (eggs: vizcacha squeak / golden sparkle, once per id per session),
 *            world:modal -> paper open/close, world:teleport -> whoosh, world:mount -> llama hum,
 *            world:interior -> door, world:map / world:help -> tick
 *
 * Silent until the music player's output() is live (audio unlocked by the COMENZAR gesture, not muted, tab
 * visible). Built on the shared AudioContext; the music engine dips this bus while stingers play.
 */
import type { MusicClock } from "../../audio/contract";
import { getMusic } from "../../audio/player";
import { hashSeed, rng, sfx, sfxForStamp } from "../../audio/sfx";
import { festivalOf, worldDate } from "../calendar";
import { type CreateAmbient, STATIONS } from "../contract";
import { creatures } from "../creatures";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { playCall } from "./soundscape/calls";
import { type CallRequest, Critters, type Listener, type Situation } from "./soundscape/critters";
import { Layers } from "./soundscape/layers";
import {
  altitude01,
  birdCall,
  birdGap,
  cricketChirp,
  falloff,
  isGarua,
  mixTargets,
  panFor,
  strideFor,
  surfaceAt,
  waterLevel,
} from "./soundscape/mix";
import { MotifPlayer } from "./soundscape/motif-player";
import {
  FESTIVAL_FULL,
  FESTIVAL_OUT,
  pickPlace,
  proximity,
  STATION_FULL,
  STATION_OUT,
  SUMMIT_FULL,
  SUMMIT_OUT,
} from "./soundscape/motifs";

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
  let motifs: MotifPlayer | null = null;
  let disposed = false;

  // places with a motif: every non-build station, plus the summit
  const places: Array<{ id: string; x: number; z: number; full: number; out: number }> = [];
  for (const s of STATIONS) {
    if (s.kind === "build") continue;
    try {
      const p = env.stationPose(s.id).position;
      places.push({ id: s.id, x: p.x, z: p.z, full: STATION_FULL, out: STATION_OUT });
    } catch {
      /* station not placed in this world */
    }
  }
  places.push({ id: "summit", x: summit.x, z: summit.z, full: SUMMIT_FULL, out: SUMMIT_OUT });
  const weights = new Map<string, number>();
  let place: string | null = null;
  let festival = false;
  let festivalCheck = 0;

  const critters = new Critters(creatures, rand, { low, isWater: extra ? (x, z) => extra.isWater(x, z) : undefined });
  const calls: CallRequest[] = [];
  const listener: Listener = { x: 0, z: 0, rx: 1, rz: 0 };
  const sit: Situation = { night: false, time: 0.5, raining: false, inside: false };
  /** The music's step grid, refreshed once per frame (null while nothing plays). */
  const clockBuf: MusicClock = { trackId: "", step: 0, time: 0, stepSec: 0, swing: 0 };
  let clockNow: MusicClock | null = null;
  /** Last few calls (dev diagnostics only). */
  const heard: string[] = [];
  if (import.meta.env?.DEV && typeof window !== "undefined") {
    (window as unknown as { __kwSound?: unknown }).__kwSound = {
      state: () => ({
        place,
        festival,
        level: place ? (motifs?.level(place) ?? 0) : 0,
        festivalLevel: motifs?.level("festival") ?? 0,
        clock: clockNow ? { ...clockNow } : null,
        heard: heard.slice(),
      }),
    };
  }

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

  /** Place motifs: the nearest place leads (hysteresis), the Inti Raymi band plays from the nearest dancer. */
  const probePlaces = (x: number, z: number) => {
    const m = motifs;
    if (!m) return;
    if (clock >= festivalCheck) {
      festivalCheck = clock + 60;
      festival = festivalOf(worldDate()) === "inti-raymi";
    }
    let festW = 0;
    let festPan = 0;
    // the band plays in A minor with the day/night tracks; over the summit theme it rests
    const summitTrack = clockNow?.trackId === "world.summit";
    if (festival && !summitTrack) {
      const b = creatures.nearestOf("dancer", x, z);
      if (b) {
        festW = proximity(Math.hypot(b.x - x, b.z - z), FESTIVAL_FULL, FESTIVAL_OUT);
        festPan = panFor(b.x - x, b.z - z, listener.rx, listener.rz) * 0.7;
      }
    }
    const room = (game ? 0 : inside ? 0.5 : 1) * (modal ? 0.7 : 1);
    m.set("festival", festW * room, festPan);
    weights.clear();
    // over the summit theme only the summit motif fits (A major); elsewhere only the station motifs (A minor)
    for (const p of places) {
      if ((p.id === "summit") !== summitTrack) continue;
      const w = proximity(Math.hypot(p.x - x, p.z - z), p.full, p.out);
      if (w > 0) weights.set(p.id, w);
    }
    place = pickPlace(weights, place);
    for (const p of places) {
      const lead = p.id === place;
      const w = lead ? (weights.get(p.id) ?? 0) * room * (1 - 0.6 * festW) : 0;
      m.set(p.id, w, lead ? panFor(p.x - x, p.z - z, listener.rx, listener.rz) * 0.5 : 0);
    }
  };

  const scheduleLife = (now: number, mixDay: number, mixNight: number, alt: number) => {
    const l = layers;
    if (!l) return;
    if (mixDay > 0.05 && now >= nextBird) {
      if (nextBird > 0) {
        // lean toward a registered songbird when one is around, else anywhere
        const bird = critters.nearestSongbird(listener.x, listener.z, 35);
        const base = (0.12 + rand() * 0.13) * mixDay;
        if (bird) {
          const d = Math.hypot(bird.x - listener.x, bird.z - listener.z);
          const pan = panFor(bird.x - listener.x, bird.z - listener.z, listener.rx, listener.rz);
          l.chirps(birdCall(rand), now + 0.05, pan, base * (0.7 + 0.6 * falloff(d, 8, 35)));
        } else l.chirps(birdCall(rand), now + 0.05, rand() * 1.6 - 0.8, base);
      }
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
        motifs?.dispose();
        layers = new Layers(out.ctx, out.ambient);
        motifs = new MotifPlayer(out.ctx, out.music ?? out.ambient);
        place = null;
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
      const e = env.camera.matrixWorld.elements;
      listener.x = avatar.x;
      listener.z = avatar.z;
      listener.rx = e[0] ?? 1;
      listener.rz = e[2] ?? 0;
      clockNow = game ? null : (music.clock?.(clockBuf) ?? null);
      probeClock += dt;
      if (probeClock >= 1 / PROBE_HZ) {
        const probeDt = probeClock;
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
        probePlaces(avatar.x, avatar.z);
        sit.night = night;
        sit.time = env.sky.time();
        sit.raining = raining;
        sit.inside = inside;
        if (!game) {
          for (const c of critters.probe(now, probeDt, listener, sit, calls)) {
            if (import.meta.env?.DEV) {
              heard.push(`${c.kind}:${c.call}@${c.dist.toFixed(0)}`);
              if (heard.length > 12) heard.shift();
            }
            playCall(out.ctx, layers.master, c.call, now + 0.03, {
              level: c.level,
              pan: c.pan,
              dist: c.dist,
              r: rand,
              variant: c.variant,
            });
          }
        }
      }
      motifs?.update(clockNow);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of cleanups.splice(0)) c();
      layers?.dispose();
      layers = null;
      motifs?.dispose();
      motifs = null;
      if (typeof window !== "undefined") delete (window as unknown as { __kwSound?: unknown }).__kwSound;
    },
  };
};
