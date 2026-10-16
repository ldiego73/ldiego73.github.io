import { describe, expect, test } from "bun:test";
import { destinationOf, leaveCopy, leavingUrl } from "./leave-logic";

const here = "https://ldiego73.github.io/es/world/cusco/?from=selva";
const link = (href: string, target = "", download = false) => ({ href, target, download });

describe("leavingUrl", () => {
  test("site and world links in the same tab leave", () => {
    expect(leavingUrl(link("https://ldiego73.github.io/es/"), here)?.pathname).toBe("/es/");
    expect(leavingUrl(link("/es/world/costa/?from=cusco"), here)?.search).toBe("?from=cusco");
    expect(leavingUrl(link("/es/world/cusco/"), here)).not.toBeNull();
  });
  test("new tabs, downloads, other schemes and in-page anchors stay", () => {
    expect(leavingUrl(link("https://cal.com/x", "_blank"), here)).toBeNull();
    expect(leavingUrl(link("/resume/cv.pdf", "", true), here)).toBeNull();
    expect(leavingUrl(link("mailto:a@b.c"), here)).toBeNull();
    expect(leavingUrl(link("blob:https://ldiego73.github.io/abc"), here)).toBeNull();
    expect(leavingUrl(link("#kw-text"), here)).toBeNull();
    expect(leavingUrl(link("https://ldiego73.github.io/es/world/cusco/?from=selva#x"), here)).toBeNull();
  });
  test("an explicit _self target still leaves", () => {
    expect(leavingUrl(link("/en/", "_self"), here)).not.toBeNull();
  });
});

describe("destinationOf", () => {
  const o = "https://ldiego73.github.io";
  test("world pages", () => {
    expect(destinationOf(new URL(`${o}/es/world/`), o)).toBe("qhapaq");
    expect(destinationOf(new URL(`${o}/en/world/?from=cusco`), o)).toBe("qhapaq");
    expect(destinationOf(new URL(`${o}/es/world/selva/`), o)).toBe("selva");
    expect(destinationOf(new URL(`${o}/es/world/colca`), o)).toBe("colca");
  });
  test("everything else is the site", () => {
    expect(destinationOf(new URL(`${o}/es/`), o)).toBe("site");
    expect(destinationOf(new URL(`${o}/es/arcade/snake/`), o)).toBe("site");
    expect(destinationOf(new URL("https://example.com/es/world/selva/"), o)).toBe("site");
  });
});

describe("leaveCopy", () => {
  test("bilingual and names the destination", () => {
    expect(leaveCopy("es", "costa")).toMatchObject({ title: "¿Salir del mundo?", stay: "Quedarme", leave: "Salir" });
    expect(leaveCopy("es", "costa").body).toContain("al Chinchaysuyu");
    expect(leaveCopy("en", "cusco")).toMatchObject({ title: "Leave the world?", stay: "Stay", leave: "Leave" });
    expect(leaveCopy("en", "site").body).toContain("site");
  });
});
