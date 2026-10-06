import { describe, expect, test } from "bun:test";
import { norm, prepare, score } from "./palette";

describe("command palette matching", () => {
  const e = prepare({ g: "posts", t: "Aplicaciones web serverless", s: "jun. 2020 · Blog", k: "aws lambda" });
  test("title start beats word start beats keywords", () => {
    expect(score(e, ["apli"])).toBe(100);
    expect(score(e, ["serv"])).toBe(80);
    expect(score(e, ["lambda"])).toBe(30);
  });
  test("every token must match; accents are ignored", () => {
    expect(score(e, ["web", "zzz"])).toBe(0);
    const w = prepare({ g: "commands", t: "Ir al mundo 3D", k: "qhapaq ñan" });
    expect(score(w, ["nan"])).toBeGreaterThan(0);
    expect(score(prepare({ g: "pages", t: "Artefactos" }), [norm("Ártef")])).toBe(100);
  });
});
