import { describe, expect, test } from "bun:test";
import { emptyPassport } from "../lib/passport";
import { arrowDir, TRIP_COPY, TRIP_PLACES, TRIP_TEXT, tripNeighbor, visitedWorlds } from "./travel-panel-logic";

const at = (w: string) => TRIP_PLACES.find((p) => p.world === w);

describe("travel panel places", () => {
  test("every world with a page, once, never the Wasi", () => {
    const ids = TRIP_PLACES.map((p) => p.world).sort();
    expect(ids).toEqual(["colca", "costa", "cusco", "qhapaq", "selva", "titicaca"]);
  });

  test("placed by the direction of their road out of Qusqu", () => {
    expect([at("cusco")?.col, at("cusco")?.row]).toEqual([1, 1]);
    expect([at("costa")?.col, at("costa")?.row]).toEqual([0, 0]);
    expect([at("selva")?.col, at("selva")?.row]).toEqual([2, 0]);
    expect([at("colca")?.col, at("colca")?.row]).toEqual([0, 2]);
    expect([at("qhapaq")?.col, at("qhapaq")?.row]).toEqual([1, 2]);
    expect([at("titicaca")?.col, at("titicaca")?.row]).toEqual([2, 2]);
    // No two worlds share a cell.
    expect(new Set(TRIP_PLACES.map((p) => `${p.col},${p.row}`)).size).toBe(TRIP_PLACES.length);
  });

  test("reading order: top row first, west to east", () => {
    expect(TRIP_PLACES.map((p) => p.world)).toEqual(["costa", "selva", "cusco", "colca", "qhapaq", "titicaca"]);
  });

  test("bilingual names and lines", () => {
    for (const p of TRIP_PLACES)
      for (const l of ["es", "en"] as const) {
        expect(p.name[l].length).toBeGreaterThan(0);
        expect(p.line[l].length).toBeGreaterThan(0);
      }
    expect(Object.keys(TRIP_COPY.es).sort()).toEqual(Object.keys(TRIP_COPY.en).sort());
    expect(TRIP_TEXT.es).toContain("«Viajar»");
    expect(TRIP_TEXT.en).toContain("“Travel”");
  });
});

describe("visited worlds come from the passport", () => {
  test("empty passport: nothing visited", () => {
    expect(visitedWorlds(emptyPassport()).size).toBe(0);
  });

  test("unknown ids and invalid times do not count", () => {
    const s = emptyPassport();
    s.stamps["nope:whatever"] = 4;
    s.stamps.summit = 0;
    expect(visitedWorlds(s).size).toBe(0);
  });

  test("a real catalog stamp of each page", async () => {
    const { CATALOG, worldOf } = await import("../lib/passport");
    for (const page of ["qhapaq", "wasi", "selva", "cusco", "costa", "titicaca", "colca"] as const) {
      const stamp = CATALOG.find((c) => worldOf(c) === page);
      expect(stamp).toBeDefined();
      const s = emptyPassport();
      s.stamps[stamp?.id ?? ""] = 1;
      expect([...visitedWorlds(s)]).toEqual([page === "wasi" ? "qhapaq" : page]);
    }
  });
});

describe("arrow keys move on the map", () => {
  test("from the centre", () => {
    expect(tripNeighbor(TRIP_PLACES, "cusco", "down")).toBe("qhapaq");
    expect(tripNeighbor(TRIP_PLACES, "cusco", "up")).toBe("costa");
    expect(tripNeighbor(TRIP_PLACES, "cusco", "left")).toBe("costa");
    expect(tripNeighbor(TRIP_PLACES, "cusco", "right")).toBe("selva");
  });

  test("from the edges", () => {
    expect(tripNeighbor(TRIP_PLACES, "qhapaq", "up")).toBe("cusco");
    expect(tripNeighbor(TRIP_PLACES, "qhapaq", "left")).toBe("colca");
    expect(tripNeighbor(TRIP_PLACES, "qhapaq", "right")).toBe("titicaca");
    expect(tripNeighbor(TRIP_PLACES, "costa", "right")).toBe("selva");
    expect(tripNeighbor(TRIP_PLACES, "costa", "down")).toBe("colca");
    expect(tripNeighbor(TRIP_PLACES, "costa", "up")).toBeNull();
    expect(tripNeighbor(TRIP_PLACES, "titicaca", "down")).toBeNull();
  });

  test("arrow keys only", () => {
    expect(arrowDir("ArrowUp")).toBe("up");
    expect(arrowDir("ArrowLeft")).toBe("left");
    expect(arrowDir("Enter")).toBeNull();
  });
});
