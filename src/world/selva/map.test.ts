import { describe, expect, test } from "bun:test";
import { labelRows, parseSelvaPassport, projectRect, rectBounds, selvaStampToStop, UNLOCK_STAMP } from "./map";

describe("jungle map helpers", () => {
  test("only jungle station stamps map to stops", () => {
    expect(selvaStampToStop("selva:station:maloca")).toBe("maloca");
    expect(selvaStampToStop("selva:station:collpa")).toBe("collpa");
    expect(selvaStampToStop("selva:station:nope")).toBeNull();
    expect(selvaStampToStop("station:gate")).toBeNull();
    expect(selvaStampToStop("selva:ride:canoe")).toBeNull();
  });

  test("visited and fast travel come from the passport; the collpa stamp unlocks travel", () => {
    const locked = parseSelvaPassport(
      JSON.stringify({
        stamps: { "selva:station:puerto": 1, "selva:station:maloca": 2, summit: 3, "station:gate": 4 },
      }),
    );
    expect(locked).toEqual({ visited: ["puerto", "maloca"], canTravel: false });
    // The mountain summit does not open jungle travel; reaching the end of the jungle road does.
    const open = parseSelvaPassport(JSON.stringify({ stamps: { [UNLOCK_STAMP]: 5 } }));
    expect(open).toEqual({ visited: ["collpa"], canTravel: true });
    for (const bad of [null, "", "not json", '{"stamps":null}', "[]"])
      expect(parseSelvaPassport(bad)).toEqual({ visited: [], canTravel: false });
  });

  test("rect bounds are padded and grown on z to the max aspect", () => {
    const b = rectBounds(
      [
        { x: -100, z: 0 },
        { x: 100, z: 10 },
      ],
      10,
      2,
    );
    expect(b).toEqual({ minX: -110, minZ: 5 - 55, w: 220, h: 110 });
    // Tall input keeps its own height.
    expect(
      rectBounds(
        [
          { x: 0, z: -50 },
          { x: 10, z: 50 },
        ],
        0,
        2,
      ).h,
    ).toBe(100);
  });

  test("projection fits the rectangle into the box, centered, z down", () => {
    const b = { minX: 0, minZ: 0, w: 200, h: 100 };
    const out = { x: 0, y: 0 };
    projectRect(b, 400, 400, 0, 0, out);
    expect(out).toEqual({ x: 0, y: 100 });
    projectRect(b, 400, 400, 200, 100, out);
    expect(out).toEqual({ x: 400, y: 300 });
  });

  test("labels on the same side move out a row only when they overlap", () => {
    const rows = labelRows([
      { x0: 0, x1: 100, side: -1 },
      { x0: 50, x1: 120, side: 1 },
      { x0: 90, x1: 150, side: -1 },
      { x0: 160, x1: 200, side: -1 },
      { x0: 130, x1: 170, side: 1 },
    ]);
    expect(rows).toEqual([0, 0, 1, 0, 0]);
  });
});
