export const STORAGE_KEY = "ldiego73-audio";

export interface AudioSettings {
  muted: boolean;
  volume: number;
}

export const DEFAULT_SETTINGS: AudioSettings = { muted: false, volume: 0.5 };

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Reads persisted settings; any failure (no storage, bad JSON, blocked) yields the defaults. */
export function loadSettings(store: Store | null = defaultStore()): AudioSettings {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      muted: typeof data.muted === "boolean" ? data.muted : DEFAULT_SETTINGS.muted,
      volume:
        typeof data.volume === "number" && Number.isFinite(data.volume)
          ? clamp01(data.volume)
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AudioSettings, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify({ muted: s.muted, volume: clamp01(s.volume) }));
  } catch {
    /* storage blocked or full: settings just do not persist */
  }
}
