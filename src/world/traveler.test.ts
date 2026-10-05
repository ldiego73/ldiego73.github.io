import { describe, expect, test } from "bun:test";
import { sanitizeName, TRAVELER_MAX } from "./traveler";

describe("sanitizeName", () => {
  test("trims and collapses whitespace (tabs, newlines, runs of spaces)", () => {
    expect(sanitizeName("  Ana \t  María\n\nLópez  ")).toBe("Ana María López");
  });

  test("keeps Spanish letters, accents and ñ", () => {
    expect(sanitizeName("Ñuñoa Pérez-Güemes")).toBe("Ñuñoa Pérez-Güemes");
  });

  test("keeps other scripts and combining marks", () => {
    expect(sanitizeName("Quispe 李 Ålesund")).toBe("Quispe 李 Ålesund");
    // e + combining acute is normalized to é
    expect(sanitizeName("José")).toBe("José");
  });

  test("allows . ' - _ and digits", () => {
    expect(sanitizeName("O'Brien_Jr. 2-B")).toBe("O'Brien_Jr. 2-B");
  });

  test("strips markup, symbols and emoji", () => {
    expect(sanitizeName("<script>alert(1)</script>")).toBe("scriptalert1script");
    expect(sanitizeName("Luz 🌄 & Sol!")).toBe("Luz Sol");
  });

  test("strips control and format characters (zero-width, bidi overrides, NUL)", () => {
    expect(sanitizeName("Ka​t‮ia\u0000")).toBe("Katia");
  });

  test("caps at 100 code points", () => {
    const long = "ñ".repeat(150);
    const out = sanitizeName(long);
    expect(Array.from(out).length).toBe(TRAVELER_MAX);
  });

  test("returns empty for empty, whitespace-only, symbol-only or non-string input", () => {
    expect(sanitizeName("")).toBe("");
    expect(sanitizeName("   \n ")).toBe("");
    expect(sanitizeName("!!! ***")).toBe("");
    expect(sanitizeName(undefined)).toBe("");
    expect(sanitizeName(42)).toBe("");
  });
});
