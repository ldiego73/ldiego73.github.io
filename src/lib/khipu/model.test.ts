import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../../data/career";
import { artifactCords, buildCords } from "./model";

describe("khipu model", () => {
  const cords = buildCords();

  test("one pendant per non-education company", () => {
    const pendants = cords.filter((c) => c.parent === -1);
    expect(pendants.map((c) => c.companyId)).toEqual(COMPANIES.filter((c) => !c.education).map((c) => c.id));
  });

  test("a company with several stages becomes subsidiaries on one pendant", () => {
    const auna = cords.findIndex((c) => c.id === "auna");
    const subs = cords.filter((c) => c.parent === auna);
    expect(subs.map((c) => c.stage?.id)).toEqual(["auna-sa", "auna-pa", "auna-sem"]);
    expect(cords[auna]?.knots).toEqual([]);
  });

  test("every stage knot is placed on exactly one cord", () => {
    const placed = cords.flatMap((c) => c.knots.map((k) => k.id));
    const all = COMPANIES.flatMap((c) => c.stages.flatMap((s) => s.knots.map((k) => k.id)));
    expect(placed.sort()).toEqual(all.sort());
  });

  test("every artifact use resolves to a cord", () => {
    for (const a of ARTIFACTS) {
      expect(artifactCords(cords, a.id).length).toBe(a.uses.length);
    }
  });
});
