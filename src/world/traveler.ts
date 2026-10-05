/** Optional traveler name: sanitized, persisted in localStorage, broadcast as `world:traveler`. */

export const TRAVELER_KEY = "qn.traveler";
export const TRAVELER_MAX = 100;

/**
 * Keeps letters, marks, numbers, spaces and . ' - _ (Unicode-aware: ñ, accents, other scripts),
 * strips control/format characters, collapses whitespace, trims and caps at 100 code points.
 */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.normalize("NFC");
  s = s.replace(/\s+/gu, " ");
  s = s.replace(/[\p{Cc}\p{Cf}]/gu, "");
  s = s.replace(/[^\p{L}\p{M}\p{N} .'\-_]/gu, "");
  s = s.replace(/ {2,}/g, " ").trim();
  const chars = Array.from(s);
  if (chars.length > TRAVELER_MAX) s = chars.slice(0, TRAVELER_MAX).join("").trim();
  return s;
}

export function loadTraveler(): string {
  try {
    return sanitizeName(localStorage.getItem(TRAVELER_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveTraveler(name: string): string {
  const clean = sanitizeName(name);
  try {
    if (clean) localStorage.setItem(TRAVELER_KEY, clean);
    else localStorage.removeItem(TRAVELER_KEY);
  } catch {
    /* storage unavailable */
  }
  return clean;
}

/** Tells content (greetings at the gate, house and summit) who is walking. */
export function announceTraveler(name: string) {
  window.dispatchEvent(new CustomEvent("world:traveler", { detail: { name } }));
}
