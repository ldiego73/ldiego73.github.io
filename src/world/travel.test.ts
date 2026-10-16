import { describe, expect, test } from "bun:test";
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
});
