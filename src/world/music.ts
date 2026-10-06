import * as audio from "../audio";
import { getMusic, type Track } from "../audio";
import { WORLD_TRACKS } from "../audio/tracks/world";
import { STATIONS, type WorldEnv } from "./contract";

/**
 * World music director: picks the track (day / night / summit), drives intensity and the duck from what the
 * traveler is doing. Pure orchestration over the shared `getMusic()` singleton.
 *
 * State machine
 *   track:     day | night by `env.sky.isNight()` (2 s crossfade on flip); `summit` while within SUMMIT_IN of the
 *              trail end (hysteresis SUMMIT_OUT), then back to day/night. The `summit` stinger plays on the first arrival.
 *   intensity: summit 0.9 > interior 0.3 > near a station 0.2 > tour 0.5 > trail 0.15..0.3 (grows with progress).
 *              Near a station the track stays calm (sparse quena, no charango) because the station's own place
 *              motif (soundscape, ambient/soundscape/motifs.ts) is the lift there; a full lead would fight it.
 *              Eased here (about 1.2 s) so the engine ramp never sees steps.
 *   duck:      0.5 while a dialog (photo preview, name editor) is open, else 1.
 *
 * What it relies on
 *   - `begin()` is called synchronously from the COMENZAR press / Enter (a user gesture) -> unlock + first track.
 *   - The arcade shell owns push/pop around a game. On `world:game {open:true}` this module goes hands-off
 *     (no play / setIntensity / duck). On close it waits GAME_SETTLE ms for the shell's pop() to land, then
 *     re-asserts the wanted track, intensity and duck. It never calls push/pop itself.
 *   - Mute / volume state belongs to the engine (persisted there); `toggleMute()` only flips it.
 */

const FADE_MS = 2000;
const SUMMIT_IN = 12;
const SUMMIT_OUT = 17;
const STATION_NEAR = 13;
/** Below the full lead's gate (0.35 - GATE_WIDTH): leaves room for the station motif. */
const STATION_CALM = 0.2;
const GAME_SETTLE = 350;

type Mood = "day" | "night" | "summit";
type Factory = (opts?: { compact?: boolean }) => HTMLElement;

export interface WorldMusicCtx {
  x: number;
  z: number;
  /** Position along the trail 0..1. */
  t: number;
  touring: boolean;
}

export interface WorldMusic {
  /** Call inside the user gesture that starts the world. */
  begin(): void;
  /** Every frame while playing. */
  update(dt: number, ctx: WorldMusicCtx): void;
  setDialogOpen(open: boolean): void;
  toggleMute(): void;
  /** Builds the compact music control (engine's createAudioControl, or a plain mute button as fallback). */
  createControl(label: string): HTMLElement;
  dispose(): void;
}

export function createWorldMusic(env: WorldEnv): WorldMusic {
  const music = getMusic();
  const stations = STATIONS.filter((s) => s.kind !== "build").map((s) => env.stationPose(s.id).position);
  const summitPoint = env.trail.pointAt(1);

  let started = false;
  let disposed = false;
  let gameOpen = false;
  let inside = false;
  let dialog = false;
  let atSummit = false;
  let summitHeard = false;
  let current: Mood | null = null;
  let intensity = 0.2;
  let sentIntensity = -1;
  let sentDuck = 1;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const cleanups: Array<() => void> = [];

  const baseMood = (): Mood => (env.sky.isNight() ? "night" : "day");
  const wanted = (): Mood => (atSummit ? "summit" : baseMood());
  const track = (m: Mood): Track => WORLD_TRACKS[m];

  const target = (c: WorldMusicCtx): number => {
    if (atSummit) return 0.9;
    if (inside) return 0.3;
    for (const p of stations) if (Math.hypot(p.x - c.x, p.z - c.z) < STATION_NEAR) return STATION_CALM;
    if (c.touring) return 0.5;
    return 0.15 + 0.15 * Math.min(1, Math.max(0, c.t));
  };

  const switchTo = (m: Mood, fadeMs = FADE_MS) => {
    if (!started || gameOpen || m === current) return;
    current = m;
    music.play(track(m), { fadeMs, intensity });
  };

  const syncOut = () => {
    if (!started || gameOpen) return;
    if (Math.abs(intensity - sentIntensity) > 0.01) {
      sentIntensity = intensity;
      music.setIntensity(intensity);
    }
    const d = dialog ? 0.5 : 1;
    if (d !== sentDuck) {
      sentDuck = d;
      music.duck(d, 400);
    }
  };

  cleanups.push(
    env.sky.onChange(() => {
      if (!atSummit) switchTo(baseMood());
    }),
  );

  const onGame = (e: Event) => {
    const open = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    if (settle) clearTimeout(settle);
    settle = null;
    if (open) {
      gameOpen = true;
      return;
    }
    // Let the shell's pop() restore what it saved, then reconcile with what we want now.
    settle = setTimeout(() => {
      settle = null;
      gameOpen = false;
      if (disposed) return;
      sentIntensity = -1;
      sentDuck = -1;
      const w = wanted();
      if (w !== current) {
        current = null;
        switchTo(w, 800);
      }
      syncOut();
    }, GAME_SETTLE);
  };
  const onInterior = (e: Event) => {
    inside = !!(e as CustomEvent<{ inside?: boolean }>).detail?.inside;
  };
  window.addEventListener("world:game", onGame);
  window.addEventListener("world:interior", onInterior);
  cleanups.push(() => window.removeEventListener("world:game", onGame));
  cleanups.push(() => window.removeEventListener("world:interior", onInterior));

  return {
    begin() {
      if (started || disposed) return;
      started = true;
      void music.unlock();
      // Started without a gesture (skip-intro / dev): unlock on the first one instead.
      const again = () => void music.unlock();
      window.addEventListener("pointerdown", again, { once: true });
      window.addEventListener("keydown", again, { once: true });
      cleanups.push(() => {
        window.removeEventListener("pointerdown", again);
        window.removeEventListener("keydown", again);
      });
      switchTo(wanted(), 1500);
      syncOut();
    },
    update(dt, c) {
      if (!started || disposed) return;
      const d = Math.hypot(summitPoint.x - c.x, summitPoint.z - c.z);
      const was = atSummit;
      atSummit = was ? d < SUMMIT_OUT : d < SUMMIT_IN;
      if (atSummit !== was) {
        if (atSummit && !summitHeard && !gameOpen) {
          summitHeard = true;
          music.stinger("summit");
        }
        switchTo(wanted(), atSummit ? 2400 : FADE_MS);
      }
      intensity += (target(c) - intensity) * (1 - Math.exp(-dt / 1.2));
      syncOut();
    },
    setDialogOpen(open) {
      dialog = open;
      syncOut();
    },
    toggleMute() {
      music.setMuted(!music.state.muted);
    },
    createControl(label) {
      const make = (audio as unknown as { createAudioControl?: Factory }).createAudioControl;
      const slot = document.createElement("div");
      slot.className = "kw-audio";
      try {
        if (make) slot.append(make({ compact: true }));
      } catch (err) {
        console.warn("[world] audio control", err);
      }
      if (!slot.firstChild) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "kw-btn kw-icon";
        b.setAttribute("aria-label", label);
        b.title = label;
        const paint = () => {
          b.setAttribute("aria-pressed", String(music.state.muted));
          b.textContent = music.state.muted ? "♪̸" : "♪";
        };
        b.addEventListener("click", () => music.setMuted(!music.state.muted));
        cleanups.push(music.onChange(paint));
        paint();
        slot.append(b);
      }
      return slot;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (settle) clearTimeout(settle);
      for (const c of cleanups.splice(0)) c();
      if (started) music.stop(900);
    },
  };
}
