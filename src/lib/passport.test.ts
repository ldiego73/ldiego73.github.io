import { describe, expect, test } from "bun:test";
import { emptyState } from "../games/core/store";
import { ACHIEVEMENTS } from "../games/registry";
import { STATIONS } from "../world/contract";
import {
  CATALOG,
  emptyPassport,
  loadPassport,
  mergedPassport,
  PASSPORT_KEY,
  passportComplete,
  recordStamp,
  savePassport,
} from "./passport";

function withStorage(storage: Pick<Storage, "getItem" | "setItem">, run: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

describe("Qhapaq Ñan passport", () => {
  test("catalog contains precisely the agreed stamps and contract station labels", () => {
    const expected = [
      ...[
        "gate",
        "avances",
        "hundred",
        "belcorp",
        "auna",
        "xepelin",
        "topsort",
        "globant",
        "bridge",
        "arcade",
        "ai",
        "contact",
      ].map((id) => `station:${id}`),
      "summit",
      "constellation:yacana",
      "constellation:machacuay",
      "constellation:hanpatu",
      "weather:garua",
      "weather:fog",
      "ride:llama",
      "egg:vizcacha-1",
      "egg:vizcacha-2",
      "egg:vizcacha-3",
      "egg:vizcacha-4",
      "egg:vizcacha-5",
      "egg:golden-khipu",
      "field:huerto",
      "field:khipu-board",
      "fauna:oso",
      "fauna:pato",
      "fauna:perdiz",
      "fauna:zorro",
      "fauna:puma",
    ];
    expect(CATALOG.map((stamp) => stamp.id).sort()).toEqual(expected.sort());
    expect(new Set(expected).size).toBe(CATALOG.length);
    for (const station of STATIONS.filter((entry) => entry.kind !== "build")) {
      expect(CATALOG.find((stamp) => stamp.id === `station:${station.id}`)?.label).toEqual(station.label);
    }
  });

  test("records once, persists the first timestamp, and rejects invalid stamps", () => {
    const data = new Map<string, string>();
    withStorage(
      {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
          data.set(key, value);
        },
      },
      () => {
        const state = emptyPassport();
        expect(recordStamp(state, "station:auna", 1234)).toBe(true);
        expect(recordStamp(state, "station:auna", 5678)).toBe(false);
        expect(recordStamp(state, "station:build-1", 1234)).toBe(false);
        expect(recordStamp(state, "summit", Number.NaN)).toBe(false);
        expect(recordStamp(state, "summit", 0)).toBe(false);
        expect(loadPassport()).toEqual({ stamps: { "station:auna": 1234 } });
        expect(JSON.parse(data.get(PASSPORT_KEY) ?? "")).toEqual(state);
      },
    );
  });

  test("blocked storage keeps in-memory progress and never throws", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    withStorage({ getItem: fail, setItem: fail }, () => {
      expect(loadPassport()).toEqual(emptyPassport());
      const state = emptyPassport();
      expect(() => savePassport(state)).not.toThrow();
      expect(recordStamp(state, "summit", 1234)).toBe(true);
      expect(recordStamp(state, "summit", 5678)).toBe(false);
      expect(state.stamps.summit).toBe(1234);
      expect(mergedPassport(state).worldCollected).toBe(1);
    });
  });

  test("invalid storage is discarded or sanitized", () => {
    for (const raw of [null, "{", "null", "[]", '{"stamps":null}', '{"stamps":[]}']) {
      withStorage({ getItem: () => raw, setItem: () => {} }, () => {
        expect(loadPassport()).toEqual(emptyPassport());
      });
    }
    withStorage(
      {
        getItem: () =>
          JSON.stringify({
            stamps: { summit: 1234, "egg:vizcacha-1": -1, "weather:fog": "123", unknown: 100, "weather:garua": 1e20 },
          }),
        setItem: () => {},
      },
      () => {
        expect(loadPassport()).toEqual({ stamps: { summit: 1234 } });
      },
    );
  });

  test("merged view masks unfound eggs, includes arcade dates, and counts known items only", () => {
    const state = { stamps: { summit: 1234, "egg:vizcacha-2": 2345, unknown: 1234 } };
    const arcade = emptyState();
    const achievement = ACHIEVEMENTS[0];
    if (!achievement) throw new Error("Missing arcade definitions");
    arcade.unlocked[achievement.id] = 3456;
    arcade.unlocked.unknown = 1234;
    const view = mergedPassport(state, arcade);
    expect(view.worldCollected).toBe(2);
    expect(view.arcadeCollected).toBe(1);
    expect(view.total).toBe(32 + ACHIEVEMENTS.length);
    expect(view.collected).toBe(3);
    expect(view.percentage).toBe(Math.round(300 / view.total));
    expect(view.world.find((stamp) => stamp.id === "egg:vizcacha-1")?.label).toEqual({ es: "???", en: "???" });
    expect(view.world.find((stamp) => stamp.id === "egg:vizcacha-2")?.label.es).toBe("Vizcacha 2");
    expect(view.arcade.find((entry) => entry.id === achievement.id)?.collectedAt).toBe(3456);
  });

  test("merged defaults read both existing storage keys", () => {
    withStorage(
      {
        getItem: (key) =>
          key === PASSPORT_KEY
            ? '{"stamps":{"summit":1234}}'
            : JSON.stringify({ unlocked: { [ACHIEVEMENTS[0]?.id ?? ""]: 2345 } }),
        setItem: () => {},
      },
      () => {
        expect(mergedPassport().worldCollected).toBe(1);
        expect(mergedPassport().arcadeCollected).toBe(1);
      },
    );
  });

  test("completion needs all non-egg, non-fauna stamps, independently of eggs, wildlife and arcade", () => {
    const state = emptyPassport();
    expect(passportComplete(state)).toBe(false);
    for (const stamp of CATALOG) if (stamp.kind !== "egg" && stamp.kind !== "fauna") state.stamps[stamp.id] = 1234;
    expect(passportComplete(state)).toBe(true);
    expect(mergedPassport(state, emptyState()).worldCollected).toBe(21);
    delete state.stamps["weather:fog"];
    expect(passportComplete(state)).toBe(false);
    for (const stamp of CATALOG) state.stamps[stamp.id] = 1234;
    const arcade = emptyState();
    for (const achievement of ACHIEVEMENTS) arcade.unlocked[achievement.id] = 1234;
    expect(mergedPassport(state, arcade).percentage).toBe(100);
  });
});
