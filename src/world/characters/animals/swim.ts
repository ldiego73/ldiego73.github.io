/**
 * Body waves of swimming and crawling animals: a travelling wave down a chain of spine bones (fish and caimans
 * swing their tails side to side; dolphins and sea lions beat up and down), the porpoising arc of a dolphin
 * that surfaces to breathe, and the sea lion's lollop on land (front flippers planted, the body heaving forward
 * in a hump).
 *
 * `spineWave` returns one angle per segment: amplitude grows toward the tail (`taper`), each segment lags the
 * one before it by `lag` of a cycle, so the wave travels backward and pushes the body forward.
 *
 * Pure (no DOM, no Three).
 */

export interface WaveOpts {
  /** Peak angle of the last segment (radians). */
  amp: number;
  /** Beats per second. */
  hz: number;
  /** Phase lag between neighbouring segments (fraction of a cycle). */
  lag: number;
  /** Amplitude of the first segment relative to the last (0 = head still … 1 = even). */
  taper: number;
}

/** Angles of n segments at time t (head first). Writes into `out` (allocation free) and returns it. */
export function spineWave(n: number, t: number, o: WaveOpts, out: number[] = []): number[] {
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 1;
    const a = o.amp * (o.taper + (1 - o.taper) * k * k);
    out[i] = a * Math.sin((t * o.hz - i * o.lag) * Math.PI * 2);
  }
  out.length = n;
  return out;
}

/**
 * A dolphin's breathing arc: every `period` seconds it rises through the surface in an arc lasting `dur`
 * seconds. Returns the vertical offset (units, + up, 0 = cruising depth) and the body pitch that follows the
 * arc's slope, and whether the blowhole is above water (for a puff of spray).
 */
export function porpoise(t: number, period: number, dur: number, depth: number) {
  const u = (t % period) / dur;
  if (u >= 1 || u < 0) return { y: 0, pitch: 0, out: false };
  const y = Math.sin(u * Math.PI) * depth;
  const pitch = Math.cos(u * Math.PI) * 0.55;
  return { y, pitch, out: y > depth * 0.8 };
}

/**
 * Sea lion lollop at body phase (0..1): front flippers plant and the body heaves forward in a hump. Returns
 * the spine arch (radians, + humped), the chest lift (fraction of body height) and the fore / hind flipper
 * swings (radians, + forward).
 */
export function lollop(phase: number) {
  const a = phase * Math.PI * 2;
  return {
    arch: 0.18 * (0.5 - 0.5 * Math.cos(a)),
    lift: 0.08 * Math.max(0, Math.sin(a)),
    fore: 0.5 * Math.sin(a + 0.6),
    hind: 0.4 * Math.sin(a - 1.4),
  };
}
