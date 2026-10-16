import { describe, expect, test } from "bun:test";
import { CANOPY_T } from "../../contract";
import { nearCanopy } from "./logic";

describe("nearCanopy", () => {
  test("true on the walkway road band, false elsewhere", () => {
    const mid = (CANOPY_T[0] + CANOPY_T[1]) / 2;
    expect(nearCanopy({ t: mid, d: 0 }, 2)).toBe(true);
    expect(nearCanopy({ t: CANOPY_T[0] - 0.003, d: 1 }, 2)).toBe(true);
    expect(nearCanopy({ t: 0.5, d: 0 }, 2)).toBe(false);
    expect(nearCanopy({ t: mid, d: 20 }, 2)).toBe(false);
  });
});
