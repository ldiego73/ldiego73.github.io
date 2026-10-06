import { describe, expect, test } from "bun:test";
import { ARTIFACTS } from "../../../data/career";
import { colX, DIAGRAMS, diagramFor, GENERIC, usedKinds } from "./diagrams";

const sameL = (a: { es: string; en: string }, b: { es: string; en: string }) => a.es === b.es && a.en === b.en;

describe("C4 diagrams", () => {
  test("one diagram per artifact on the bridge", () => {
    for (const a of ARTIFACTS) expect(diagramFor(a.id)).toBeDefined();
    expect(DIAGRAMS.length).toBe(ARTIFACTS.length);
  });

  test("labels come only from the artifact's tech, uses/summary, or the generic C4 vocabulary", () => {
    for (const d of DIAGRAMS) {
      const art = ARTIFACTS.find((a) => a.id === d.artifact)!;
      const tech = art.tech.split(" · ").map((s) => s.trim());
      const es = [art.summary.es, ...art.uses.map((u) => u.text.es)].join(" ").toLowerCase();
      const en = [art.summary.en, ...art.uses.map((u) => u.text.en)].join(" ").toLowerCase();
      for (const n of d.nodes) {
        if (typeof n.label === "string") {
          for (const part of n.label.split(" · ")) expect(tech).toContain(part);
        } else if (n.from) {
          expect(es).toContain(n.from.es.toLowerCase());
          expect(en).toContain(n.from.en.toLowerCase());
        } else {
          expect(GENERIC.some((g) => sameL(g, n.label as { es: string; en: string }))).toBe(true);
        }
      }
      if (d.boundary) {
        expect(es).toContain(d.boundary.from.es.toLowerCase());
        expect(en).toContain(d.boundary.from.en.toLowerCase());
      }
    }
  });

  test("every tool in the tech string shows up in its maquette", () => {
    for (const d of DIAGRAMS) {
      const art = ARTIFACTS.find((a) => a.id === d.artifact)!;
      const parts = new Set(
        d.nodes.flatMap((n) => (typeof n.label === "string" ? n.label.split(" · ") : [])).map((s) => s.trim()),
      );
      for (const t of art.tech.split(" · ")) expect(parts.has(t.trim())).toBe(true);
    }
  });

  test("edges connect existing nodes, columns are in range and flow forward", () => {
    for (const d of DIAGRAMS) {
      const ids = new Map(d.nodes.map((n) => [n.id, n]));
      expect(ids.size).toBe(d.nodes.length);
      for (const e of d.edges) {
        const a = ids.get(e.from);
        const b = ids.get(e.to);
        expect(a && b).toBeTruthy();
        expect(b!.col).toBeGreaterThanOrEqual(a!.col);
      }
      for (const n of d.nodes) {
        expect(n.col).toBeGreaterThanOrEqual(0);
        expect(n.col).toBeLessThan(d.cols);
        expect(Math.abs(n.row)).toBeLessThanOrEqual(1.6);
        if (n.on) expect(ids.has(n.on)).toBe(true);
      }
      expect(usedKinds(d).length).toBeGreaterThan(1);
    }
  });

  test("column positions span the board symmetrically", () => {
    expect(colX(0, 4, 2)).toBeCloseTo(-colX(3, 4, 2));
    expect(colX(1, 3, 2)).toBeCloseTo(0);
    expect(colX(0, 1, 2)).toBe(0);
  });
});
