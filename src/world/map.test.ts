import { describe, expect, test } from "bun:test";
import { deadzone, PAD_DEADZONE } from "./input";
import { loaderHtml } from "./loader";
import { mapBounds, parsePassport, project, stampToStop } from "./map";
import { esc, renderTextMode } from "./textmode";

describe("map helpers", () => {
  test("bounds are square, padded and centered", () => {
    const b = mapBounds(
      [
        { x: -10, z: 0 },
        { x: 30, z: 10 },
      ],
      5,
    );
    expect(b.size).toBe(50);
    expect(b.minX).toBe(-15);
    expect(b.minZ).toBe(-20);
  });

  test("project fits the square map into a box with z growing downward", () => {
    const b = { minX: 0, minZ: 0, size: 100 };
    const out = { x: 0, y: 0 };
    project(b, 200, 100, 50, 50, out);
    expect(out).toEqual({ x: 100, y: 50 });
    project(b, 200, 100, 0, 100, out);
    expect(out).toEqual({ x: 50, y: 100 });
  });

  test("stamp ids map to stops", () => {
    expect(stampToStop("station:auna")).toBe("auna");
    expect(stampToStop("summit")).toBe("summit");
    expect(stampToStop("egg:vizcacha-1")).toBeNull();
    expect(stampToStop("station:")).toBeNull();
  });

  test("passport JSON is parsed defensively", () => {
    expect(parsePassport(JSON.stringify({ stamps: { "station:gate": 1, summit: 2, "weather:fog": 3 } }))).toEqual([
      "gate",
      "summit",
    ]);
    expect(parsePassport("not json")).toEqual([]);
    expect(parsePassport(null)).toEqual([]);
    expect(parsePassport('{"stamps":null}')).toEqual([]);
  });
});

describe("gamepad deadzone", () => {
  test("zero inside the deadzone, rescaled outside, clamped to 1", () => {
    const o = { x: 9, y: 9 };
    deadzone(0.1, 0.1, PAD_DEADZONE, o);
    expect(o).toEqual({ x: 0, y: 0 });
    deadzone(1, 0, PAD_DEADZONE, o);
    expect(o.x).toBeCloseTo(1);
    expect(o.y).toBeCloseTo(0);
    deadzone(0, -0.59, 0.18, o);
    expect(o.y).toBeCloseTo(-0.5);
    deadzone(Number.NaN, 0, 0.18, o);
    expect(o).toEqual({ x: 0, y: 0 });
  });
});

describe("text mode", () => {
  test("escapes HTML", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  test("renders every non-build station, real links and escaped build data", () => {
    const html = renderTextMode("es", {
      repos: [
        {
          name: "<script>",
          description: null,
          url: "javascript:alert(1)",
          stars: 3,
          language: "TS",
          pushedAt: "2026-01-01",
        },
      ],
      posts: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="/es/arcade/"');
    expect(html).toContain('href="/es/#contact"');
    expect(html).toContain("calendly.com");
    for (const id of ["gate", "avances", "globant", "bridge", "arcade", "ai", "contact", "workshop", "summit"])
      expect(html).toContain(`id="kw-tm-${id}"`);
    expect(html).not.toContain("kw-tm-build-1");
    const en = renderTextMode("en", { repos: [], posts: [] }, { headingLevel: 1, idPrefix: "x-" });
    expect(en).toContain("<h1");
    expect(en).toContain('id="x-auna"');
  });

  test("loader markup is a labelled progressbar", () => {
    const html = loaderHtml("en");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain("data-loading-pct");
  });
});
