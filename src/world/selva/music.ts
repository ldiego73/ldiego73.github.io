/**
 * Antisuyu music director: a slimmer twin of src/world/music.ts over the shared `getMusic()` singleton.
 * The mountain director cannot be reused as-is (it maps every mountain station through env.stationPose and
 * has a summit mood), so the jungle keeps only what applies here:
 *   track      day | night by `env.sky.isNight()` (2 s crossfade on the flip). Reuses the world's day/night
 *              tracks until jungle tracks exist.
 *   intensity  calm near a jungle station (the station's own content is the lift there), else a low walk
 *              that grows a little toward the east end of the road; eased over ~1.2 s.
 *   duck       0.5 while a dialog (photo preview, name editor) is open.
 *   game       on `world:game {open}` it goes hands-off (the arcade shell owns push/pop) and re-asserts the
 *              wanted track after GAME_SETTLE ms once the game closes.
 */
import * as audio from "../../audio";
import { getMusic } from "../../audio";
import { WORLD_TRACKS } from "../../audio/tracks/world";
import { SELVA_STATIONS, type SelvaEnv } from "./contract";

const FADE_MS = 2000;
const STATION_NEAR = 13;
const STATION_CALM = 0.2;
const GAME_SETTLE = 350;

type Mood = "day" | "night";
type Factory = (opts?: { compact?: boolean }) => HTMLElement;

export interface SelvaMusic {
  /** Call inside a user gesture when possible; otherwise it unlocks on the first one. */
  begin(): void;
  update(dt: number, ctx: { x: number; z: number; t: number }): void;
  setDialogOpen(open: boolean): void;
  toggleMute(): void;
  createControl(label: string): HTMLElement;
  dispose(): void;
}

export function createSelvaMusic(env: SelvaEnv): SelvaMusic {
  const music = getMusic();
  const stations = SELVA_STATIONS.map((s) => env.stationPose(s.id).position);
  let started = false;
  let disposed = false;
  let gameOpen = false;
  let dialog = false;
  let current: Mood | null = null;
  let intensity = 0.2;
  let sentIntensity = -1;
  let sentDuck = 1;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const cleanups: Array<() => void> = [];

  const wanted = (): Mood => (env.sky.isNight() ? "night" : "day");
  const switchTo = (m: Mood, fadeMs = FADE_MS) => {
    if (!started || gameOpen || m === current) return;
    current = m;
    music.play(WORLD_TRACKS[m], { fadeMs, intensity });
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
  cleanups.push(env.sky.onChange(() => switchTo(wanted())));
  const onGame = (e: Event) => {
    const open = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    if (settle) clearTimeout(settle);
    settle = null;
    if (open) {
      gameOpen = true;
      return;
    }
    settle = setTimeout(() => {
      settle = null;
      gameOpen = false;
      if (disposed) return;
      sentIntensity = -1;
      sentDuck = -1;
      current = null;
      switchTo(wanted(), 800);
      syncOut();
    }, GAME_SETTLE);
  };
  window.addEventListener("world:game", onGame);
  cleanups.push(() => window.removeEventListener("world:game", onGame));

  return {
    begin() {
      if (started || disposed) return;
      started = true;
      void music.unlock();
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
      let target = 0.15 + 0.12 * Math.min(1, Math.max(0, c.t));
      for (const p of stations) if (Math.hypot(p.x - c.x, p.z - c.z) < STATION_NEAR) target = STATION_CALM;
      intensity += (target - intensity) * (1 - Math.exp(-dt / 1.2));
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
        console.warn("[selva] audio control", err);
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
