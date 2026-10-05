import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, loadSettings, STORAGE_KEY, saveSettings } from "./settings";

const mockStore = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

describe("audio settings", () => {
  test("defaults: volume 0.5, not muted", () => {
    expect(loadSettings(mockStore())).toEqual({ muted: false, volume: 0.5 });
    expect(DEFAULT_SETTINGS.volume).toBe(0.5);
  });
  test("round trip", () => {
    const s = mockStore();
    saveSettings({ muted: true, volume: 0.25 }, s);
    expect(JSON.parse(s.data[STORAGE_KEY] as string)).toEqual({ muted: true, volume: 0.25 });
    expect(loadSettings(s)).toEqual({ muted: true, volume: 0.25 });
  });
  test("clamps and tolerates garbage", () => {
    expect(loadSettings(mockStore({ [STORAGE_KEY]: '{"volume":7,"muted":"x"}' }))).toEqual({ muted: false, volume: 1 });
    expect(loadSettings(mockStore({ [STORAGE_KEY]: "not json" }))).toEqual(DEFAULT_SETTINGS);
  });
  test("throwing storage never throws", () => {
    const bad = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, bad)).not.toThrow();
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
