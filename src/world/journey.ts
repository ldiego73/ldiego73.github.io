/**
 * The traveler's journey record for the summit postcard: climb timing (gate → summit, walking only; fast
 * travel voids the attempt), best / last time, number of climbs and the first summit date. Stored in
 * localStorage next to the passport; everything else on the postcard (stamps, wildlife, weather, llama)
 * comes from the passport itself.
 */
import { CATALOG, loadPassport, type PassportState } from "../lib/passport";
import { type L, STATIONS } from "./contract";

export const JOURNEY_KEY = "ldiego73-world-journey-v1";

export interface JourneyState {
  /** First time the summit was reached (epoch ms). */
  firstSummitAt: number | null;
  bestMs: number | null;
  lastMs: number | null;
  climbs: number;
}

export const emptyJourney = (): JourneyState => ({ firstSummitAt: null, bestMs: null, lastMs: null, climbs: 0 });

export function loadJourney(): JourneyState {
  try {
    const v = JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "null") as Partial<JourneyState> | null;
    if (!v || typeof v !== "object") return emptyJourney();
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
    return {
      firstSummitAt: num(v.firstSummitAt),
      bestMs: num(v.bestMs),
      lastMs: num(v.lastMs),
      climbs: typeof v.climbs === "number" && v.climbs > 0 ? Math.floor(v.climbs) : 0,
    };
  } catch {
    return emptyJourney();
  }
}

function saveJourney(s: JourneyState) {
  try {
    localStorage.setItem(JOURNEY_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the record lives for this page view */
  }
}

/** "9 min 05 s", "1 h 02 min". */
export function formatDuration(ms: number, lang: "es" | "en"): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, "0")} s`;
  return lang === "es" ? `${sec} s` : `${sec} s`;
}

/** Climb clock: starts when the traveler leaves the trailhead, stops on the summit plaza. */
export interface ClimbTracker {
  /** Every frame with the traveler's trail position (0 valley → 1 summit) while playing. */
  update(dt: number, t: number): void;
  /** Fast travel or a dev teleport: the current attempt no longer counts. */
  void(): void;
  state(): JourneyState;
}

export const START_T = 0.04;
export const SUMMIT_T = 0.975;
export const MIN_CLIMB_MS = 45_000;

export function createClimbTracker(
  store: { load: () => JourneyState; save: (s: JourneyState) => void } = { load: loadJourney, save: saveJourney },
  now: () => number = Date.now,
): ClimbTracker {
  let s = store.load();
  let running = false;
  let elapsed = 0;
  let wasAtStart = false;
  return {
    update(dt, t) {
      if (t < START_T) {
        // Standing at the gate: (re)arm the clock; it starts on the first step past it.
        wasAtStart = true;
        running = false;
        elapsed = 0;
        return;
      }
      if (wasAtStart && !running) {
        running = true;
        wasAtStart = false;
        elapsed = 0;
      }
      if (!running) return;
      elapsed += Math.min(dt, 0.25);
      if (t >= SUMMIT_T) {
        running = false;
        const ms = Math.round(elapsed * 1000);
        // Nobody walks the whole trail in under MIN_CLIMB_MS: a jump (dev hook, glitch) isn't a climb.
        if (ms < MIN_CLIMB_MS) return;
        s = {
          firstSummitAt: s.firstSummitAt ?? now(),
          bestMs: s.bestMs === null ? ms : Math.min(s.bestMs, ms),
          lastMs: ms,
          climbs: s.climbs + 1,
        };
        store.save(s);
      }
    },
    void() {
      running = false;
      wasAtStart = false;
      elapsed = 0;
    },
    state: () => s,
  };
}

// ---------------------------------------------------------------- postcard summary (journey + passport)

export interface JourneySummary {
  reached: boolean;
  journey: JourneyState;
  /** Trail stations in order with whether the traveler stamped them. */
  route: Array<{ id: string; label: L; stamped: boolean }>;
  stamps: { got: number; total: number };
  wildlife: L[];
  weather: L[];
  rodeLlama: boolean;
}

export function summarize(
  passport: PassportState = loadPassport(),
  journey: JourneyState = loadJourney(),
): JourneySummary {
  const has = (id: string) => typeof passport.stamps[id] === "number";
  const route = STATIONS.filter((s) => s.kind !== "build")
    .sort((a, b) => a.t - b.t)
    .map((s) => ({ id: s.id, label: s.label, stamped: has(`station:${s.id}`) }));
  const of = (kind: string) => CATALOG.filter((c) => c.kind === kind && has(c.id)).map((c) => c.label);
  return {
    reached: has("summit") || journey.firstSummitAt !== null,
    journey,
    route,
    stamps: { got: CATALOG.filter((c) => has(c.id)).length, total: CATALOG.length },
    wildlife: of("fauna"),
    weather: of("weather"),
    rodeLlama: has("ride:llama"),
  };
}
