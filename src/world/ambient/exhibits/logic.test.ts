import { describe, expect, test } from "bun:test";
import { COMPANIES } from "../../../data/career";
import { STATIONS } from "../../contract";
import { achievementOf, CONTENT_SPOT_R, EXHIBIT_KNOT, exhibitLayout, inExhibitRange, PROMPT_R, period } from "./logic";

describe("exhibit achievements", () => {
  test("every company tambo has a knot that exists in that company", () => {
    for (const st of STATIONS.filter((s) => s.kind === "company")) {
      const a = achievementOf(st.companyId!);
      expect(a).not.toBeNull();
      expect(a!.company.id).toBe(st.companyId!);
      expect(a!.knot.id).toBe(EXHIBIT_KNOT[st.companyId!]!);
      expect(a!.stage.knots).toContain(a!.knot);
    }
  });
  test("the stage comes from the knot (Auna's 99.9% is the Senior EM stage)", () => {
    const a = achievementOf("auna")!;
    expect(a.knot.metric).toBe("99.9%");
    expect(a.stage.id).toBe("auna-sem");
    expect(period(a.stage, "es")).toBe("ene 2022 – ago 2022");
    expect(period(a.stage, "en")).toBe("Jan 2022 – Aug 2022");
  });
  test("ongoing stages read 'hoy' / 'now'", () => {
    const g = achievementOf("globant")!;
    expect(g.stage.end).toBeUndefined();
    expect(period(g.stage, "es")).toBe("abr 2026 – hoy");
    expect(period(g.stage, "en")).toBe("Apr 2026 – now");
  });
  test("no knot ids outside career.ts", () => {
    const ids = new Set(COMPANIES.flatMap((c) => c.stages.flatMap((s) => s.knots.map((k) => k.id))));
    for (const k of Object.values(EXHIBIT_KNOT)) expect(ids.has(k)).toBe(true);
  });
});

describe("exhibit layout", () => {
  // tambo.ts: w ∈ [3.6, 5.1] → kx = ±(w/2 + 0.2) ∈ [2.0, 2.75]; exhibit radii 0.75..1.25.
  const cases: Array<[number, number]> = [];
  for (const kx of [2.0, 2.3, 2.75, -2.0, -2.4, -2.75]) for (const r of [0.75, 1.0, 1.25]) cases.push([kx, r]);

  test("prompt range never overlaps content's khipu spot", () => {
    for (const [kx, r] of cases) {
      const l = exhibitLayout(kx, r);
      const d = Math.hypot(l.anchor.x - l.focus.x, l.anchor.z - l.focus.z);
      expect(d).toBeGreaterThan(CONTENT_SPOT_R + 0.3);
      // The anchor itself is in range.
      expect(inExhibitRange(l.anchor.x, l.anchor.z, l.anchor, l.focus)).toBe(true);
      // Sweep the content spot: never in range.
      for (let a = 0; a < 24; a++)
        for (const rr of [0, 1, 2, CONTENT_SPOT_R]) {
          const x = l.focus.x + Math.cos((a / 24) * Math.PI * 2) * rr;
          const z = l.focus.z + Math.sin((a / 24) * Math.PI * 2) * rr;
          expect(inExhibitRange(x, z, l.anchor, l.focus)).toBe(false);
        }
    }
  });
  test("exhibit stands on the side opposite the khipu, inside the flat footprint (r 6)", () => {
    for (const [kx, r] of cases) {
      const l = exhibitLayout(kx, r);
      expect(Math.sign(l.center.x)).toBe(-Math.sign(kx));
      expect(Math.hypot(l.center.x, l.center.z) + r).toBeLessThan(6);
      // Clear of the tambo's side wall (x = ±w/2).
      expect(Math.abs(l.center.x) - r).toBeGreaterThan(Math.abs(kx) - 0.2 + 0.5);
      // Standing at the anchor, the exhibit is close enough to read.
      expect(Math.hypot(l.anchor.x - l.center.x, l.anchor.z - l.center.z)).toBeLessThan(PROMPT_R + r);
    }
  });
});
