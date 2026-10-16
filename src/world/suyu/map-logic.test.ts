import { describe, expect, test } from "bun:test";
import { labelRows, parsePassport, projectRect, rectBounds, stampToStop } from "./map-logic";

const IDS = new Set(["usnu", "qorikancha", "antisuyu"]);

describe("suyu map helpers", () => {
  test("only this world's station stamps map to stops", () => {
    expect(stampToStop("cusco", IDS, "cusco:station:usnu")).toBe("usnu");
    expect(stampToStop("cusco", IDS, "cusco:station:nope")).toBeNull();
    expect(stampToStop("cusco", IDS, "selva:station:usnu")).toBeNull();
    expect(stampToStop("cusco", IDS, "station:gate")).toBeNull();
  });

  test("visited and the unlock come from the passport; garbage is tolerated", () => {
    const raw = JSON.stringify({ stamps: { "cusco:station:usnu": 1, "cusco:station:antisuyu": 2, summit: 3 } });
    expect(parsePassport(raw, "cusco", IDS, "cusco:station:qorikancha")).toEqual({
      visited: ["usnu", "antisuyu"],
      canTravel: false,
    });
    expect(parsePassport(raw, "cusco", IDS, "cusco:station:usnu").canTravel).toBe(true);
    // No unlock stamp: fast travel is open from the start.
    expect(parsePassport(null, "cusco", IDS, null)).toEqual({ visited: [], canTravel: true });
    for (const bad of [null, "", "not json", '{"stamps":null}', "[]", '{"stamps":[]}'])
      expect(parsePassport(bad, "cusco", IDS, "x")).toEqual({ visited: [], canTravel: false });
  });

  test("bounds are padded and grown to the aspect on either side", () => {
    const wide = rectBounds(
      [
        { x: -100, z: 0 },
        { x: 100, z: 10 },
      ],
      10,
      2,
    );
    expect(wide).toEqual({ minX: -110, minZ: 5 - 55, w: 220, h: 110 });
    const tall = rectBounds(
      [
        { x: 0, z: -50 },
        { x: 10, z: 50 },
      ],
      0,
      1,
    );
    expect(tall.w).toBe(100);
    expect(tall.h).toBe(100);
    expect(tall.minX).toBe(-45);
    expect(rectBounds([], 5, 1)).toEqual({ minX: -5, minZ: -5, w: 10, h: 10 });
  });

  test("projection fits the sheet into the box, centered, z down", () => {
    const b = { minX: 0, minZ: 0, w: 200, h: 100 };
    const out = { x: 0, y: 0 };
    expect(projectRect(b, 400, 400, 0, 0, out)).toEqual({ x: 0, y: 100 });
    expect(projectRect(b, 400, 400, 200, 100, out)).toEqual({ x: 400, y: 300 });
  });

  test("labels on the same side move out a row only when they overlap", () => {
    expect(
      labelRows([
        { x0: 0, x1: 100, side: -1 },
        { x0: 50, x1: 120, side: 1 },
        { x0: 90, x1: 150, side: -1 },
        { x0: 160, x1: 200, side: -1 },
      ]),
    ).toEqual([0, 0, 1, 0]);
  });
});
