import { describe, expect, test } from "bun:test";
import { parseFrom, resolveSpawn } from "./arrival";

const spawn = {
  default: { x: 0, z: 17, yaw: Math.PI },
  from: { selva: { x: 44, z: -36, yaw: -0.8 }, qhapaq: { t: 0.1 } },
};

describe("suyu arrival", () => {
  test("?from= names a known world only", () => {
    expect(parseFrom("?from=selva")).toBe("selva");
    expect(parseFrom("?lang=es&from=qhapaq")).toBe("qhapaq");
    expect(parseFrom("?from=atlantis")).toBeNull();
    expect(parseFrom("")).toBeNull();
  });

  test("the origin's spawn, else the default (unknown, missing or self)", () => {
    expect(resolveSpawn(spawn, "?from=selva", "cusco")).toEqual({ point: spawn.from.selva, from: "selva" });
    expect(resolveSpawn(spawn, "?from=qhapaq", "cusco")).toEqual({ point: { t: 0.1 }, from: "qhapaq" });
    expect(resolveSpawn(spawn, "?from=wasi", "cusco")).toEqual({ point: spawn.default, from: null });
    expect(resolveSpawn(spawn, "?from=cusco", "cusco")).toEqual({ point: spawn.default, from: null });
    expect(resolveSpawn(spawn, "", "cusco")).toEqual({ point: spawn.default, from: null });
  });
});
