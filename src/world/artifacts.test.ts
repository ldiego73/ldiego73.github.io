import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../data/career";
import { artifactUses, companyYears, hostOfEducation, khipuFor, nearest, stationsInOrder } from "./artifacts";

describe("khipu mapping", () => {
  test("Auna has one main cord and two subsidiaries (3 stages)", () => {
    const k = khipuFor("auna");
    expect(k.map((c) => c.kind)).toEqual(["main", "sub", "sub"]);
  });
  test("education hangs at Xepelin", () => {
    const edu = COMPANIES.find((c) => c.education)!;
    expect(hostOfEducation(edu)).toBe("xepelin");
    expect(khipuFor("xepelin").map((c) => c.id)).toEqual(["xepelin-em", "master-ai"]);
    expect(khipuFor("topsort").some((c) => c.id === "master-ai")).toBe(false);
  });
  test("years", () => {
    expect(companyYears(COMPANIES.find((c) => c.id === "avances")!, "en")).toBe("2014–2016");
    expect(companyYears(COMPANIES.find((c) => c.id === "globant")!, "es")).toBe("2026–hoy");
  });
});

describe("artifacts", () => {
  test("uses resolve to company + year in order", () => {
    const u = artifactUses(ARTIFACTS[0]!);
    expect(u[0]).toMatchObject({ company: "Belcorp", year: "2016" });
    expect(u.at(-1)).toMatchObject({ company: "Globant", year: "2026" });
  });
});

describe("helpers", () => {
  test("stations sorted by t", () => {
    const s = stationsInOrder();
    expect(s[0]!.id).toBe("gate");
    expect(s.at(-1)!.id).toBe("contact");
  });
  test("nearest within radius", () => {
    const items = [
      { id: "a", x: 0, z: 0, r: 2 },
      { id: "b", x: 3, z: 0, r: 2 },
    ];
    expect(nearest(items, 2.2, 0)?.id).toBe("b");
    expect(nearest(items, 10, 0)).toBeNull();
  });
});
