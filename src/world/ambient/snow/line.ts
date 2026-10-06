/**
 * Pure snow logic for ambient/snow.ts (no three / DOM; tested in line.test.ts).
 * The winter snow line comes down the peak as `seasonOf().snow` grows: nothing below snow 0.3, a dusting on
 * the summit just above it, down to the high puna (~48 u) in mid-July. The summit plaza sits at ~75 u.
 */
export const SNOW_MIN = 0.3;
/** Height of the summit plaza (layout: trail end). */
export const SUMMIT_Y = 75.4;
const TOP = 75.5;
const LOW = 48;

/** World height of the snow line for a season snow amount (Infinity = no snow cap). */
export function snowLine(snow: number): number {
  if (!(snow > SNOW_MIN)) return Number.POSITIVE_INFINITY;
  const k = Math.min(1, (snow - SNOW_MIN) / (1 - SNOW_MIN));
  return TOP - (TOP - LOW) * k ** 0.8;
}

/** Lowest snow line the cap mesh ever has to cover (with room for the ragged edge). */
export const CAP_FLOOR = LOW - 4;

/** Night or around dawn (sky time: 0 midnight, 0.25 sunrise, 0.75 sunset). */
export const snowHour = (time: number) => time > 0.8 || time < 0.34;

/**
 * Slow random snowfall schedule: alternating dry and snowing spells (seconds). Returns the state after `dt`.
 * `r` is a uniform random number used only when a spell ends.
 */
export function stepSpell(s: { on: boolean; left: number }, dt: number, r: number): { on: boolean; left: number } {
  s.left -= dt;
  if (s.left > 0) return s;
  s.on = !s.on;
  s.left = s.on ? 80 + r * 120 : 60 + r * 180;
  return s;
}
