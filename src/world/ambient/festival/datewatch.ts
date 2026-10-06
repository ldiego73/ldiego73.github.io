/**
 * Calendar features that switch on and off while the world stays open (pure; tested in datewatch.test.ts).
 * snow.ts, festival.ts and people.ts build their seasonal dressing lazily: the world can be loaded on
 * June 19 and still light Inti Raymi when the date turns June 20 without a reload.
 * The date is re-read every `period` seconds (60 s in production; ~1 s in dev so the
 * `setWorldDate()` hook from calendar.ts reacts almost at once).
 */

export interface DateWatch {
  /** Advance by `dt` seconds; returns true when the watched state flipped (read `on`). */
  step(dt: number): boolean;
  /** Re-read the state now (e.g. after a dev hook); returns true when it flipped. */
  check(): boolean;
  readonly on: boolean;
}

/** Re-check period in seconds: a minute in production, a second in dev (so the dev date hook feels instant). */
export const WATCH_PERIOD = import.meta.env?.DEV ? 1 : 60;

export function dateWatch(active: () => boolean, period = WATCH_PERIOD): DateWatch {
  let on = active();
  let age = 0;
  // setWorldDate() (dev hook / tests) announces a jump: re-check on the next step.
  if (typeof window !== "undefined") window.addEventListener("world:date", () => (age = period));
  const w: DateWatch = {
    step(dt) {
      age += dt;
      if (age < period) return false;
      age = 0;
      return w.check();
    },
    check() {
      const next = active();
      if (next === on) return false;
      on = next;
      return true;
    },
    get on() {
      return on;
    },
  };
  return w;
}
