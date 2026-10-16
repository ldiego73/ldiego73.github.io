import { describe, expect, test } from "bun:test";
import { arrivalFrom, travelledFrom } from "./trailhead";
import { worldUrl } from "./travel";

describe("world urls", () => {
  test("pages and the ?from= arrival", () => {
    expect(worldUrl("es", "qhapaq")).toBe("/es/world/");
    expect(worldUrl("en", "qhapaq", "selva")).toBe("/en/world/?from=selva");
    expect(worldUrl("es", "qhapaq", "cusco")).toBe("/es/world/?from=cusco");
    expect(worldUrl("es", "qhapaq", "wasi")).toBe("/es/world/");
    expect(worldUrl("es", "selva", "qhapaq")).toBe("/es/world/selva/");
    expect(worldUrl("es", "selva", "cusco")).toBe("/es/world/selva/");
    expect(worldUrl("en", "cusco")).toBe("/en/world/cusco/");
    expect(worldUrl("en", "cusco", "qhapaq")).toBe("/en/world/cusco/?from=qhapaq");
    expect(worldUrl("en", "cusco", "selva")).toBe("/en/world/cusco/?from=selva");
    expect(worldUrl("es", "costa")).toBe("/es/world/costa/");
    expect(worldUrl("es", "costa", "cusco")).toBe("/es/world/costa/?from=cusco");
    expect(worldUrl("en", "cusco", "costa")).toBe("/en/world/cusco/?from=costa");
    expect(worldUrl("es", "titicaca", "cusco")).toBe("/es/world/titicaca/?from=cusco");
    expect(worldUrl("en", "colca", "cusco")).toBe("/en/world/colca/?from=cusco");
    expect(worldUrl("en", "colca")).toBe("/en/world/colca/");
    expect(worldUrl("en", "cusco", "colca")).toBe("/en/world/cusco/?from=colca");
    expect(worldUrl("en", "cusco", "titicaca")).toBe("/en/world/cusco/?from=titicaca");
  });

  test("direct jumps from the «Viajar» panel land somewhere sensible", () => {
    // Every world page links to every other; only the jungle drops ?from= (one entrance).
    expect(worldUrl("es", "selva", "colca")).toBe("/es/world/selva/");
    expect(worldUrl("es", "costa", "titicaca")).toBe("/es/world/costa/?from=titicaca");
    expect(worldUrl("en", "qhapaq", "colca")).toBe("/en/world/?from=colca");
    // The mountain: known punkus land on their branch, other worlds at the gate; any world origin skips the title.
    expect(arrivalFrom("?from=selva")).not.toBeNull();
    expect(arrivalFrom("?from=cusco")).not.toBeNull();
    expect(arrivalFrom("?from=costa")).toBeNull();
    for (const w of ["selva", "cusco", "costa", "titicaca", "colca"]) expect(travelledFrom(`?from=${w}`)).toBe(true);
    expect(travelledFrom("")).toBe(false);
    expect(travelledFrom("?from=qhapaq")).toBe(false);
    expect(travelledFrom("?from=nowhere")).toBe(false);
  });
});
