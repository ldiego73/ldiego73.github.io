/**
 * The traveler's journey record for the summit postcard: climb timing (gate → summit, walking only; fast
 * travel voids the attempt), best / last time, number of climbs and the first summit date. Stored in
 * localStorage next to the passport; everything else on the postcard (stamps, wildlife, weather, llama)
 * comes from the passport itself. `summarize(…, "selva")` builds the jungle page's postcard instead (route of
 * SELVA_STATIONS, canoe trip and canopy walkway, jungle wildlife; no climb clock there).
 */
import { CATALOG, loadPassport, type PassportState, worldOf } from "../lib/passport";
import { type L, STATIONS } from "./contract";
import { emit, type WorldEvents } from "./events";
import { SELVA_STATIONS } from "./selva/contract";

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

export type ClimbNotice = WorldEvents["world:climb"];

/** Default notifier: a `world:climb` window event (no-op outside the browser, e.g. in unit tests). */
const notifyWindow = (n: ClimbNotice) => {
  if (typeof window !== "undefined") emit("world:climb", n);
};

export function createClimbTracker(
  store: { load: () => JourneyState; save: (s: JourneyState) => void } = { load: loadJourney, save: saveJourney },
  now: () => number = Date.now,
  notify: (n: ClimbNotice) => void = notifyWindow,
): ClimbTracker {
  let s = store.load();
  let running = false;
  let elapsed = 0;
  let wasAtStart = false;
  /** Only transitions are announced: the tour calls void() every frame. */
  const stop = (phase: "void") => {
    if (running) notify({ phase });
    running = false;
  };
  return {
    update(dt, t) {
      if (t < START_T) {
        // Standing at the gate: (re)arm the clock; it starts on the first step past it.
        stop("void");
        wasAtStart = true;
        elapsed = 0;
        return;
      }
      if (wasAtStart && !running) {
        running = true;
        wasAtStart = false;
        elapsed = 0;
        notify({ phase: "start" });
      }
      if (!running) return;
      elapsed += Math.min(dt, 0.25);
      if (t >= SUMMIT_T) {
        const ms = Math.round(elapsed * 1000);
        // Nobody walks the whole trail in under MIN_CLIMB_MS: a jump (dev hook, glitch) isn't a climb.
        if (ms < MIN_CLIMB_MS) {
          stop("void");
          return;
        }
        running = false;
        const prevBestMs = s.bestMs;
        s = {
          firstSummitAt: s.firstSummitAt ?? now(),
          bestMs: prevBestMs === null ? ms : Math.min(prevBestMs, ms),
          lastMs: ms,
          climbs: s.climbs + 1,
        };
        store.save(s);
        notify({ phase: "done", ms, prevBestMs, isBest: prevBestMs === null || ms < prevBestMs });
      }
    },
    void() {
      stop("void");
      wasAtStart = false;
      elapsed = 0;
    },
    state: () => s,
  };
}

/** Race clock for the time-trial chip: "03:42.5", "1:02:09.0". */
export function formatClock(ms: number): string {
  const ds = Math.max(0, Math.floor(ms / 100));
  const tenths = ds % 10;
  const s = Math.floor(ds / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0");
  return `${mm}:${String(sec).padStart(2, "0")}.${tenths}`;
}

// ---------------------------------------------------------------- ghost path (best climb replay)

export const GHOST_KEY = "ldiego73-world-ghost-v1";
/** Seconds between samples. */
export const GHOST_DT = 0.25;
/** Longest climb we keep a path for (30 min of samples): beyond that the ghost isn't worth the storage. */
export const GHOST_MAX = Math.round((30 * 60) / GHOST_DT);
const POS_Q = 10; // 0.1 world units
const YAW_Q = 20; // 0.05 rad

/** A recorded climb: positions + yaw sampled every `dt` seconds from the moment the clock started. */
export interface GhostPath {
  ms: number;
  dt: number;
  n: number;
  xs: Float32Array;
  zs: Float32Array;
  yaws: Float32Array;
}

/** Records samples while a timed climb runs (fixed capacity, no per-frame allocations). */
export function createPathRecorder(dt = GHOST_DT, max = GHOST_MAX) {
  const xs = new Float32Array(max);
  const zs = new Float32Array(max);
  const yaws = new Float32Array(max);
  let n = 0;
  let full = false;
  return {
    reset() {
      n = 0;
      full = false;
    },
    /** Call every frame with the clock's elapsed seconds; stores a sample each time a `dt` boundary is reached. */
    add(elapsed: number, x: number, z: number, yaw: number) {
      while (!full && elapsed >= n * dt) {
        if (n >= max) {
          full = true;
          break;
        }
        xs[n] = x;
        zs[n] = z;
        yaws[n] = yaw;
        n++;
      }
    },
    get count() {
      return n;
    },
    /** true once the climb outlasted the capacity (no ghost for this run). */
    get overflow() {
      return full;
    },
    toPath(ms: number): GhostPath | null {
      if (full || n < 2) return null;
      return { ms, dt, n, xs: xs.slice(0, n), zs: zs.slice(0, n), yaws: yaws.slice(0, n) };
    },
  };
}

// Compact text encoding: quantized, delta-coded, zigzagged; small values are one printable char each,
// bigger ones are escaped as "~<base36>~". A 10-minute climb is ~7 KB.
const ALPHA = (() => {
  let a = "";
  for (let c = 0x21; c <= 0x7e; c++) {
    const ch = String.fromCharCode(c);
    if (ch !== '"' && ch !== "\\" && ch !== "~") a += ch;
  }
  return a;
})();
const ALPHA_IDX = new Map([...ALPHA].map((c, i) => [c, i] as const));
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function putInt(out: string[], d: number) {
  const z = d >= 0 ? d * 2 : -d * 2 - 1;
  out.push(z < ALPHA.length ? (ALPHA[z] as string) : `~${z.toString(36)}~`);
}

export function encodePath(p: GhostPath): string {
  const out: string[] = [];
  let px = 0;
  let pz = 0;
  let pq = 0;
  // Yaw is unwrapped first (each step the short way round) so a turn through ±π stays a small delta.
  let u = p.yaws[0] ?? 0;
  for (let i = 0; i < p.n; i++) {
    const x = Math.round((p.xs[i] ?? 0) * POS_Q);
    const z = Math.round((p.zs[i] ?? 0) * POS_Q);
    if (i > 0) u += wrapPi((p.yaws[i] ?? 0) - (p.yaws[i - 1] ?? 0));
    const q = Math.round(u * YAW_Q);
    putInt(out, x - px);
    putInt(out, z - pz);
    putInt(out, q - pq);
    px = x;
    pz = z;
    pq = q;
  }
  return out.join("");
}

/** Inverse of encodePath; null when the string is corrupt or doesn't hold exactly `n` samples. */
export function decodePath(data: string, n: number): { xs: Float32Array; zs: Float32Array; yaws: Float32Array } | null {
  if (!Number.isInteger(n) || n < 2 || n > GHOST_MAX) return null;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const yaws = new Float32Array(n);
  const acc = [0, 0, 0];
  let k = 0;
  let i = 0;
  while (i < data.length) {
    let z: number;
    const ch = data[i] as string;
    if (ch === "~") {
      const end = data.indexOf("~", i + 1);
      if (end < 0) return null;
      z = Number.parseInt(data.slice(i + 1, end), 36);
      if (!Number.isFinite(z)) return null;
      i = end + 1;
    } else {
      const v = ALPHA_IDX.get(ch);
      if (v === undefined) return null;
      z = v;
      i++;
    }
    const d = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    const s = Math.floor(k / 3);
    const c = k % 3;
    if (s >= n) return null;
    acc[c] = (acc[c] ?? 0) + d;
    if (c === 0) xs[s] = (acc[0] ?? 0) / POS_Q;
    else if (c === 1) zs[s] = (acc[1] ?? 0) / POS_Q;
    else yaws[s] = (acc[2] ?? 0) / YAW_Q;
    k++;
  }
  return k === n * 3 ? { xs, zs, yaws } : null;
}

/** A new path replaces the stored ghost when there is none or it is faster. */
export const shouldReplaceGhost = (stored: GhostPath | null, ms: number) => stored === null || ms < stored.ms;

export function loadGhost(): GhostPath | null {
  try {
    const v = JSON.parse(localStorage.getItem(GHOST_KEY) ?? "null") as {
      ms?: unknown;
      dt?: unknown;
      n?: unknown;
      d?: unknown;
    } | null;
    if (!v || typeof v !== "object" || typeof v.d !== "string") return null;
    const { ms, dt, n } = v;
    if (typeof ms !== "number" || !(ms > 0) || typeof dt !== "number" || !(dt > 0) || typeof n !== "number")
      return null;
    const dec = decodePath(v.d, n);
    return dec ? { ms, dt, n, ...dec } : null;
  } catch {
    return null;
  }
}

export function saveGhost(p: GhostPath): void {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify({ ms: p.ms, dt: p.dt, n: p.n, d: encodePath(p) }));
  } catch {
    /* storage full or blocked: the ghost lives for this page view */
  }
}

/** Ghost pose at `time` seconds into the climb (linear interpolation, yaw the short way round). Returns false
 *  once the ghost has finished its run (the pose is then the last sample). */
export function samplePath(p: GhostPath, time: number, out: { x: number; z: number; yaw: number }): boolean {
  const f = Math.max(0, time / p.dt);
  const i = Math.min(p.n - 1, Math.floor(f));
  const j = Math.min(p.n - 1, i + 1);
  const k = i === j ? 0 : f - i;
  const x0 = p.xs[i] ?? 0;
  const z0 = p.zs[i] ?? 0;
  const y0 = p.yaws[i] ?? 0;
  out.x = x0 + ((p.xs[j] ?? 0) - x0) * k;
  out.z = z0 + ((p.zs[j] ?? 0) - z0) * k;
  out.yaw = y0 + wrapPi((p.yaws[j] ?? 0) - y0) * k;
  return f < p.n - 1;
}

// ---------------------------------------------------------------- postcard summary (journey + passport)

/** Which page the postcard is made on: the mountain (default) or the Antisuyu jungle. */
export type PostcardWorld = "qhapaq" | "selva";
/** Jungle "reached": the traveler got to the collpa at the end of the road (also what opens its fast travel). */
export const SELVA_END_STAMP = "selva:station:collpa";

export interface JourneySummary {
  world: PostcardWorld;
  reached: boolean;
  journey: JourneyState;
  /** Trail stations in order with whether the traveler stamped them. */
  route: Array<{ id: string; label: L; stamped: boolean }>;
  stamps: { got: number; total: number };
  wildlife: L[];
  weather: L[];
  rodeLlama: boolean;
  /** Jungle only (false on the mountain): canoe trip and canopy walkway stamps. */
  rodeCanoe: boolean;
  canopy: boolean;
}

/**
 * Postcard data from the passport (+ the climb record on the mountain). The mountain summary is unchanged from
 * before the jungle existed: it counts every catalog stamp and wildlife of every page. The jungle summary is
 * scoped to the jungle's passport page (route = SELVA_STATIONS, its stamps, its wildlife).
 */
export function summarize(
  passport: PassportState = loadPassport(),
  journey: JourneyState = loadJourney(),
  world: PostcardWorld = "qhapaq",
): JourneySummary {
  const has = (id: string) => typeof passport.stamps[id] === "number";
  const flags = { rodeCanoe: has("selva:ride:canoe"), canopy: has("selva:field:dosel") };
  if (world === "selva") {
    const page = CATALOG.filter((c) => worldOf(c) === "selva");
    const of = (kind: string) => page.filter((c) => c.kind === kind && has(c.id)).map((c) => c.label);
    return {
      world,
      reached: has(SELVA_END_STAMP),
      journey,
      route: [...SELVA_STATIONS]
        .sort((a, b) => a.t - b.t)
        .map((s) => ({ id: s.id, label: s.label, stamped: has(`selva:station:${s.id}`) })),
      stamps: { got: page.filter((c) => has(c.id)).length, total: page.length },
      wildlife: of("fauna"),
      weather: of("weather"),
      rodeLlama: false,
      ...flags,
    };
  }
  const route = STATIONS.filter((s) => s.kind !== "build")
    .sort((a, b) => a.t - b.t)
    .map((s) => ({ id: s.id, label: s.label, stamped: has(`station:${s.id}`) }));
  const of = (kind: string) => CATALOG.filter((c) => c.kind === kind && has(c.id)).map((c) => c.label);
  return {
    world,
    reached: has("summit") || journey.firstSummitAt !== null,
    journey,
    route,
    stamps: { got: CATALOG.filter((c) => has(c.id)).length, total: CATALOG.length },
    wildlife: of("fauna"),
    weather: of("weather"),
    rodeLlama: has("ride:llama"),
    ...flags,
  };
}
