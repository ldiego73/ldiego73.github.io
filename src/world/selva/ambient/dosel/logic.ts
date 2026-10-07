/**
 * Pure tracker for the canopy walkway field stamp (`selva:field:dosel`): the traveler has to cross the whole
 * walkway (CANOPY_T, the hanging bridges between ceibas) in one continuous stay, in either direction.
 * The range is split into bins; each frame on the walkway marks the bin under the traveler. Leaving the
 * walkway, or a jump of more than a couple of bins in one frame (teleport, fast travel), starts over.
 */

export const BINS = 16;

export interface CanopyTrack {
  /** Bins visited during the current stay on the walkway. */
  seen: boolean[];
  /** Bin of the previous frame on the walkway, or -1 when off it. */
  last: number;
  done: boolean;
}

export const newTrack = (): CanopyTrack => ({ seen: new Array<boolean>(BINS).fill(false), last: -1, done: false });

/** Bin index for road t inside [t0, t1], or -1 outside. */
export function binOf(t: number, range: readonly [number, number]): number {
  const [t0, t1] = range;
  if (t < t0 || t > t1) return -1;
  return Math.min(BINS - 1, Math.floor(((t - t0) / (t1 - t0)) * BINS));
}

/**
 * Feeds one frame: road t of the traveler and whether they are on the walkway deck (on the road band).
 * Returns true exactly once, on the frame the whole walkway has been covered.
 */
export function feed(track: CanopyTrack, t: number, onDeck: boolean, range: readonly [number, number]): boolean {
  if (track.done) return false;
  const bin = onDeck ? binOf(t, range) : -1;
  if (bin < 0) {
    if (track.last >= 0) track.seen.fill(false);
    track.last = -1;
    return false;
  }
  if (track.last >= 0 && Math.abs(bin - track.last) > 2) track.seen.fill(false);
  track.seen[bin] = true;
  track.last = bin;
  if (track.seen.every(Boolean)) {
    track.done = true;
    return true;
  }
  return false;
}

/** Share of the walkway covered in the current stay (0..1), e.g. for a progress hint. */
export const coverage = (track: CanopyTrack) => track.seen.filter(Boolean).length / BINS;
