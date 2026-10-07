/**
 * Small built-in speakers (phones, tablets) reproduce almost nothing below ~300 Hz. Noise beds that read as
 * wind, water or insects on headphones and laptops lose their low body there and turn into a thin hiss
 * ("radio static"), so the world soundscapes quieten and darken their noise beds on these devices.
 * Detected by a touch-first device: coarse pointer and no hover. Music and one-shot effects are unchanged.
 */
export function smallSpeaker(): boolean {
  try {
    return matchMedia("(pointer: coarse) and (hover: none)").matches;
  } catch {
    return false;
  }
}

/** Phone-speaker profile for noise beds: overall bed level and how much of the bright (white-noise) part stays. */
export const PHONE_BEDS = { level: 0.5, bright: 0.35 } as const;
