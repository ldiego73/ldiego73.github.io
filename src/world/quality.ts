/**
 * Auto quality governor (pure, no DOM): watches real frame times and steps the render cost down when the
 * average FPS stays under 40 for ~3 s (pixel ratio 1 → 0.75 → no ink outline), and back up after ~10 s
 * above 58 FPS. Hysteresis: a step down soon after a step up doubles the wait before the next step up.
 * It never touches geometry; index.ts applies a level through engine.setPixelRatioCap + outline.enabled.
 */

export interface QualityLevel {
  /** Renderer pixel-ratio cap (null = the quality preset's own cap). */
  dprCap: number | null;
  /** Ink outline pass on. */
  outline: boolean;
}

export const LEVELS: readonly QualityLevel[] = [
  { dprCap: null, outline: true },
  { dprCap: 1, outline: true },
  { dprCap: 0.75, outline: true },
  { dprCap: 0.75, outline: false },
];

export interface GovernorConfig {
  /** Seconds of frames ignored after start / reset (shader warm-up). */
  warmup: number;
  /** Below this average FPS for `downAfter` seconds → step down. */
  lowFps: number;
  downAfter: number;
  /** Above this average FPS for `upAfter` seconds → step up. */
  highFps: number;
  upAfter: number;
  /** Frame gaps longer than this (ms) are treated as a pause (hidden tab, held engine) and reset the window. */
  maxGap: number;
  /** A step down within this many seconds of a step up counts as a bounce. */
  bounceWindow: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
  warmup: 2,
  lowFps: 40,
  downAfter: 3,
  highFps: 58,
  upAfter: 10,
  maxGap: 250,
  bounceWindow: 30,
};

export interface Governor {
  /** Feed one frame's duration in milliseconds (performance.now() delta). */
  sample(ms: number): void;
  level(): number;
  /** Clears the measurement window (e.g. after the tab was hidden); keeps the level. */
  reset(): void;
  /** Off: no more steps (manual override). */
  setEnabled(on: boolean): void;
  enabled(): boolean;
  /** Force a level (e.g. back to 0 after a manual quality change). */
  setLevel(level: number): void;
}

const BUCKET_MS = 500;
const RING = 64;

export function createGovernor(
  onChange: (level: number, dir: -1 | 1) => void,
  cfg: GovernorConfig = DEFAULT_GOVERNOR,
): Governor {
  let level = 0;
  let on = true;
  let warm = 0;
  let clock = 0;
  let lastUpAt = Number.NEGATIVE_INFINITY;
  let bounces = 0;
  // Ring of 0.5 s buckets: frames and milliseconds per bucket.
  const frames = new Float64Array(RING);
  const times = new Float64Array(RING);
  let head = 0;
  let count = 0;
  let bucketMs = 0;
  let bucketN = 0;

  const clear = () => {
    count = 0;
    bucketMs = 0;
    bucketN = 0;
  };
  /** Average FPS over the newest buckets covering `seconds` (null if not enough data yet). */
  const avg = (seconds: number): number | null => {
    const need = Math.ceil((seconds * 1000) / BUCKET_MS);
    if (count < need) return null;
    let f = 0;
    let t = 0;
    for (let i = 0; i < need; i++) {
      const k = (head - 1 - i + RING) % RING;
      f += frames[k] ?? 0;
      t += times[k] ?? 0;
    }
    return t > 0 ? (f * 1000) / t : null;
  };
  const step = (dir: -1 | 1) => {
    const next = level - dir;
    if (next < 0 || next >= LEVELS.length) return;
    if (dir === -1 && clock - lastUpAt < cfg.bounceWindow) bounces++;
    if (dir === 1) lastUpAt = clock;
    level = next;
    clear();
    onChange(level, dir);
  };

  return {
    sample(ms) {
      if (!on) return;
      if (!(ms > 0) || ms > cfg.maxGap) {
        clear();
        return;
      }
      clock += ms / 1000;
      if (warm < cfg.warmup) {
        warm += ms / 1000;
        return;
      }
      bucketMs += ms;
      bucketN++;
      if (bucketMs < BUCKET_MS) return;
      frames[head] = bucketN;
      times[head] = bucketMs;
      head = (head + 1) % RING;
      count = Math.min(RING, count + 1);
      bucketMs = 0;
      bucketN = 0;
      const down = avg(cfg.downAfter);
      if (down !== null && down < cfg.lowFps && level < LEVELS.length - 1) {
        step(-1);
        return;
      }
      const upSeconds = Math.min((RING * BUCKET_MS) / 1000, cfg.upAfter * 2 ** Math.min(bounces, 2));
      const up = avg(upSeconds);
      if (up !== null && up > cfg.highFps && level > 0) step(1);
    },
    level: () => level,
    reset() {
      clear();
      warm = 0;
    },
    setEnabled(v) {
      on = v;
      clear();
    },
    enabled: () => on,
    setLevel(l) {
      level = Math.max(0, Math.min(LEVELS.length - 1, Math.round(l)));
      clear();
    },
  };
}
